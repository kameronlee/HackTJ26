import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, Point } from 'geojson';
import mapboxgl from 'mapbox-gl';

import type { MapLayerState, RouteOption } from '../lib/types';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const emptyFeatureCollection: FeatureCollection = { type: 'FeatureCollection', features: [] };

type MapPanelProps = {
  state: MapLayerState;
  featuredRoute: RouteOption | null;
  showVulnerability: boolean;
};

export function MapPanel({ state, featuredRoute, showVulnerability }: MapPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const center = useMemo(() => state.regions[0]?.center ?? [-77.0119, 38.8898], [state.regions]);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current) {
      return;
    }
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center,
      zoom: 12.2,
      pitch: 48,
      bearing: -12,
      antialias: true,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.on('load', () => {
      map.addSource('heat-surface', { type: 'geojson', data: state.heatSurface });
      map.addLayer({
        id: 'heat-surface',
        type: 'heatmap',
        source: 'heat-surface',
        paint: {
          'heatmap-radius': 35,
          'heatmap-intensity': 0.8,
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'heat'], 70, 0.2, 95, 1],
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(26,43,60,0)', 0.3, '#31a6a5', 0.55, '#f4d35e', 0.8, '#ee964b', 1, '#f95738'],
        },
      });
      map.addSource('vulnerability', { type: 'geojson', data: state.vulnerabilityOverlay });
      map.addLayer({
        id: 'vulnerability-fill',
        type: 'fill',
        source: 'vulnerability',
        paint: {
          'fill-color': ['interpolate', ['linear'], ['get', 'vulnerability'], 0.5, '#4fc3f7', 0.7, '#ffd166', 0.9, '#ef476f'],
          'fill-opacity': showVulnerability ? 0.22 : 0,
        },
      });
      map.addLayer({
        id: 'vulnerability-line',
        type: 'line',
        source: 'vulnerability',
        paint: {
          'line-color': '#f7f4ea',
          'line-width': showVulnerability ? 1.2 : 0,
          'line-opacity': showVulnerability ? 0.4 : 0,
        },
      });
      map.addSource('route', { type: 'geojson', data: featuredRoute?.geojson ?? emptyFeatureCollection });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: {
          'line-width': 8,
          'line-color': '#f7ede2',
          'line-opacity': 0.95,
        },
      });
      map.addSource('telemetry', { type: 'geojson', data: telemetryToCollection(state.telemetryPoints) });
      map.addLayer({
        id: 'telemetry-points',
        type: 'circle',
        source: 'telemetry',
        paint: {
          'circle-radius': 8,
          'circle-color': '#f95738',
          'circle-stroke-color': '#fff1d6',
          'circle-stroke-width': 2,
        },
      });
      setMapReady(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [center, featuredRoute, showVulnerability, state.heatSurface, state.telemetryPoints, state.vulnerabilityOverlay]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }
    map.flyTo({ center, zoom: 12.2, duration: 1000 });
    if (map.getLayer('vulnerability-fill')) {
      map.setPaintProperty('vulnerability-fill', 'fill-opacity', showVulnerability ? 0.22 : 0);
    }
    if (map.getLayer('vulnerability-line')) {
      map.setPaintProperty('vulnerability-line', 'line-width', showVulnerability ? 1.2 : 0);
      map.setPaintProperty('vulnerability-line', 'line-opacity', showVulnerability ? 0.4 : 0);
    }
    (map.getSource('route') as mapboxgl.GeoJSONSource | undefined)?.setData(featuredRoute?.geojson ?? emptyFeatureCollection);
    (map.getSource('telemetry') as mapboxgl.GeoJSONSource | undefined)?.setData(telemetryToCollection(state.telemetryPoints));
  }, [center, featuredRoute, mapReady, showVulnerability, state.telemetryPoints]);

  if (!MAPBOX_TOKEN) {
    return <StaticFallback state={state} featuredRoute={featuredRoute} />;
  }

  return <section className="panel map-panel" ref={containerRef} aria-label="Heat-aware route map" />;
}

function StaticFallback({ state, featuredRoute }: { state: MapLayerState; featuredRoute: RouteOption | null }) {
  const topHotspots = state.heatSurface.features
    .sort((a, b) => Number(b.properties?.heat ?? 0) - Number(a.properties?.heat ?? 0))
    .slice(0, 3);

  return (
    <section className="panel map-fallback">
      <div className="map-fallback-header">
        <span className="eyebrow">Static fallback</span>
        <h2>Washington, D.C.</h2>
      </div>
      <p>
        Add `VITE_MAPBOX_TOKEN` to unlock the full 3D WebGL map. Until then, this panel still shows the chosen route, top hotspots, and live telemetry status.
      </p>
      <div className="fallback-grid">
        <div>
          <h3>Featured route</h3>
          <p>{featuredRoute ? `${featuredRoute.label} route with ${featuredRoute.shadePct.toFixed(0)}% shade coverage.` : 'Compute a route to see the corridor summary.'}</p>
        </div>
        <div>
          <h3>Hottest points</h3>
          <ul>
            {topHotspots.map((feature) => (
              <li key={String(feature.properties?.id)}>
                {feature.properties?.id}: {feature.properties?.heat}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Telemetry</h3>
          <p>{state.telemetryPoints.length} active sensor samples in the current feed.</p>
        </div>
      </div>
    </section>
  );
}

function telemetryToCollection(points: MapLayerState['telemetryPoints']): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      properties: { deviceId: point.deviceId, heatIndexC: point.heatIndexC ?? null, source: point.source },
      geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
    })),
  };
}
