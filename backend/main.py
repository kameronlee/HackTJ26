from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import osmnx as ox
import geopandas as gpd
import pandas as pd
import requests
import networkx as nx
from typing import List, Dict
import math
from datetime import datetime, timezone
from pysolar.solar import get_altitude, get_azimuth

app = FastAPI(title="Shade-Aware Pedestrian Router API")

# Allow requests from the React Native app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration & Region (3km x 3km centered on Eastern Senior High School)
CENTER_LAT = 38.8906
CENTER_LNG = -76.9803
BBOX = {
    "north": 38.9041,
    "south": 38.8771,
    "east": -76.9630,
    "west": -76.9976
}
ALPHA = 2.0 # Increased Sun aversion penalty multiplier to force shade detours

# Global Graph variable to cache the downloaded street map
G = None
G_proj = None

def init_graph():
    """Downloads and prepares the OSMnx walking network graph."""
    global G, G_proj
    print(f"Downloading pedestrian network for 3x3km area...")
    G = ox.graph_from_bbox(
        bbox=(BBOX["west"], BBOX["south"], BBOX["east"], BBOX["north"]),
        network_type="walk"
    )
    
    # Project the graph to a local metric CRS (EPSG:32618)
    print("Projecting graph and calculating bearings...")
    # OSMnx 2.1.0 requires bearings to be calculated on unprojected graph
    G = ox.bearing.add_edge_bearings(G)
    G_proj = ox.project_graph(G, to_crs="EPSG:32618")
    print("Graph initialized successfully.")

def fetch_sun_position():
    """Returns sun altitude and azimuth. Hardcoded to midday for demo."""
    alt = 62.0   # Simulated midday altitude
    azi = 190.0  # Simulated midday azimuth (slightly west of south)
    return alt, azi

def fetch_temperature():
    """Fetches real-time temperature from Open-Meteo."""
    try:
        url = f"https://api.open-meteo.com/v1/forecast?latitude={CENTER_LAT}&longitude={CENTER_LNG}&current=temperature_2m&temperature_unit=fahrenheit"
        res = requests.get(url, timeout=5)
        res.raise_for_status()
        return res.json()["current"]["temperature_2m"]
    except Exception as e:
        print(f"Warning: Could not fetch weather: {e}. Defaulting to 80F.")
        return 80.0

def fetch_and_join_building_data():
    """Fetches per-building height data from OpenStreetMap via Overpass API.
    OSM buildings have 'building:levels' and 'height' tags with real polygon
    geometry, enabling per-block spatial joins with road edges."""
    global G_proj
    from shapely.geometry import Polygon
    
    # Overpass bbox format: south,west,north,east
    bbox = f'{BBOX["south"]},{BBOX["west"]},{BBOX["north"]},{BBOX["east"]}'
    query = f'''
    [out:json][timeout:30];
    (
      way["building"]["building:levels"]({bbox});
      way["building"]["height"]({bbox});
    );
    out body;
    >;
    out skel qt;
    '''
    
    buildings_gdf = gpd.GeoDataFrame(columns=['geometry', 'height'], crs="EPSG:4326")
    
    try:
        print("Fetching per-building heights from OpenStreetMap (Overpass)...")
        r = requests.post('https://overpass-api.de/api/interpreter', data={'data': query}, timeout=45)
        r.raise_for_status()
        elements = r.json().get('elements', [])
        
        # Separate nodes and ways
        nodes = {e['id']: (e['lon'], e['lat']) for e in elements if e['type'] == 'node'}
        ways = [e for e in elements if e['type'] == 'way']
        print(f"  Got {len(ways)} buildings, {len(nodes)} nodes.")
        
        # Build polygons with heights
        rows = []
        for w in ways:
            tags = w.get('tags', {})
            
            # Get height: prefer explicit 'height' tag, fall back to levels * 3.5m
            h = 0
            if 'height' in tags:
                try:
                    h = float(str(tags['height']).replace('m', '').strip())
                except (ValueError, TypeError):
                    pass
            if h <= 0 and 'building:levels' in tags:
                try:
                    h = float(tags['building:levels']) * 3.5
                except (ValueError, TypeError):
                    pass
            
            if h <= 0:
                continue
            
            # Build polygon from node refs
            coords = []
            for nid in w.get('nodes', []):
                if nid in nodes:
                    coords.append(nodes[nid])
            
            if len(coords) >= 3:
                rows.append({'geometry': Polygon(coords), 'height': h})
        
        if rows:
            buildings_gdf = gpd.GeoDataFrame(rows, crs="EPSG:4326")
            buildings_gdf = buildings_gdf.to_crs("EPSG:32618")
            print(f"  Built {len(buildings_gdf)} building polygons (avg height: {buildings_gdf['height'].mean():.1f}m, max: {buildings_gdf['height'].max():.1f}m)")
        else:
            print("  No valid building polygons found.")
    except Exception as e:
        print(f"  Error fetching Overpass data: {e}")
    
    # Spatial join: match buildings to nearby road edges
    edges_gdf = ox.graph_to_gdfs(G_proj, nodes=False, edges=True)
    
    if not buildings_gdf.empty:
        edges_buffered = edges_gdf.copy()
        edges_buffered.geometry = edges_buffered.geometry.buffer(15)  # 15m buffer to catch adjacent buildings
        joined = gpd.sjoin(edges_buffered, buildings_gdf, how="left", predicate="intersects")
        avg_heights = joined.groupby(level=[0, 1, 2])['height'].mean().fillna(0)
        matched = (avg_heights > 0).sum()
        print(f"  Matched {matched}/{len(edges_gdf)} edges to building heights.")
    else:
        avg_heights = pd.Series(0, index=edges_gdf.index)
    
    for u, v, k, data in G_proj.edges(keys=True, data=True):
        data['building_height'] = avg_heights.get((u, v, k), 0)
        
        width = data.get('width', 10.0)
        try:
             if isinstance(width, list): width = float(width[0])
             elif isinstance(width, str): width = float(width.replace('m', '').strip())
        except (ValueError, TypeError):
             width = 10.0
        data['street_width'] = width
        
        data['tree_lined'] = data.get('tree_lined') == 'yes'
        data['is_path'] = data.get('highway') == 'path'
        data['is_park'] = data.get('leisure') == 'park'
        
    print("Building data spatial join completed.")

def update_edge_weights():
    """Calculates the shade heuristic and balanced cost for all edges."""
    global G_proj
    sun_alt, sun_azi = fetch_sun_position()
    
    print(f"Sun details | Altitude: {sun_alt:.2f}°, Azimuth: {sun_azi:.2f}°")
    
    for u, v, k, data in G_proj.edges(keys=True, data=True):
        height = data.get('building_height', 0)
        width = data.get('street_width', 10.0)
        bearing = data.get('bearing', 0)
        length = data.get('length', 1.0)
        
        if sun_alt <= 0:
            shade_fraction = 1.0
        elif height == 0:
            shade_fraction = 0.0
        else:
            try:
                L = height / math.tan(math.radians(sun_alt))
            except ZeroDivisionError:
                L = 9999
            
            angle_diff_rad = math.radians(sun_azi - bearing)
            W_shadow = L * abs(math.sin(angle_diff_rad))
            shade_fraction = min(W_shadow / width, 1.0)
            
        if data.get('tree_lined') or data.get('is_path') or data.get('is_park'):
             shade_fraction = min(shade_fraction + 0.5, 1.0)
             
        data['shade_fraction'] = shade_fraction
        
        if shade_fraction < 0.3:
            penalty = 1.0
        elif shade_fraction < 0.7:
            penalty = 0.5
        else:
            penalty = 0.0
            
        data['shade_penalty'] = penalty
        data['balanced_cost'] = length + (length * penalty * ALPHA)
        # Add pure heat exposure metric for analytics (length of street that is completely unshaded)
        data['raw_heat_cost'] = length * (1.0 - shade_fraction)


class RouteRequest(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float

@app.on_event("startup")
async def startup_event():
    """Initializes the graph and weights when the server starts."""
    print("Triggering reload to detect scikit-learn...")
    init_graph()
    fetch_and_join_building_data()
    update_edge_weights() # Initial calculation based on current time

@app.post("/api/route")
def get_route(req: RouteRequest):
    """Calculates the shortest path using the heat exhaustion balanced cost."""
    global G_proj, G
    
    if G_proj is None:
        raise HTTPException(status_code=503, detail="Graph not initialized yet.")
        
    try:
        # 1. Start/End
        # Find nearest edge first, which is much more robust for POIs inside buildings
        # or parks that aren't exactly on a street node. We take the first node of that edge.
        try:
            # Fallback to nearest edge to handle indoor POIs better
            start_edge = ox.distance.nearest_edges(G, X=req.start_lng, Y=req.start_lat)
            start_node = start_edge[0]
            
            end_edge = ox.distance.nearest_edges(G, X=req.end_lng, Y=req.end_lat)
            end_node = end_edge[0]
        except Exception:
            # Absolute fallback to raw nodes
            start_node = ox.distance.nearest_nodes(G, X=req.start_lng, Y=req.start_lat)
            end_node = ox.distance.nearest_nodes(G, X=req.end_lng, Y=req.end_lat)
        
        # 2. Dual Routing
        # Standard Route (Minimize Pure Distance)
        try:
            standard_route_nodes = nx.shortest_path(G_proj, source=start_node, target=end_node, weight='length')
        except nx.NetworkXNoPath:
             raise HTTPException(status_code=404, detail="No path found between the requested points.")

        # Cool Route (Minimize Heat Exhaustion)
        cool_route_nodes = nx.shortest_path(G_proj, source=start_node, target=end_node, weight='balanced_cost')
        
        # 3. Coordinate Extraction Helper
        def extract_coords(node_list):
            return [{"latitude": G.nodes[n]['y'], "longitude": G.nodes[n]['x']} for n in node_list]

        standard_coords = extract_coords(standard_route_nodes)
        cool_coords = extract_coords(cool_route_nodes)
            
        # 4. Stats Calculation
        std_gdf = ox.routing.route_to_gdf(G_proj, standard_route_nodes)
        cool_gdf = ox.routing.route_to_gdf(G_proj, cool_route_nodes)
        
        std_dist = float(std_gdf['length'].sum())
        std_heat_exp = float(std_gdf['raw_heat_cost'].sum())
        
        cool_dist = float(cool_gdf['length'].sum())
        cool_heat_exp = float(cool_gdf['raw_heat_cost'].sum())
        
        # Calculate shade scores and multiplier
        std_shade_score = 100.0 - (std_heat_exp / std_dist * 100) if std_dist > 0 else 0.0
        cool_shade_score = 100.0 - (cool_heat_exp / cool_dist * 100) if cool_dist > 0 else 0.0
        shade_multiplier = cool_shade_score / std_shade_score if std_shade_score > 0 else 1.0
        shade_multiplier = max(1.0, shade_multiplier)

        return {
            "standard_route": standard_coords,
            "cool_route": cool_coords,
            "comparison": {
                "standard_total_meters": std_dist,
                "cool_total_meters": cool_dist,
                "extra_distance_meters": cool_dist - std_dist,
                "standard_shade_score": std_shade_score,
                "cool_shade_score": cool_shade_score,
                "shade_multiplier": round(shade_multiplier, 1)
            }
        }
    
    except nx.NetworkXNoPath:
        raise HTTPException(status_code=404, detail="No path found between the requested points.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
