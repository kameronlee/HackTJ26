import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Platform, ActivityIndicator, Alert, Keyboard, Dimensions, FlatList, Image } from 'react-native';
import MapView, { Circle, Marker, Polyline, Region, UrlTile, Polygon } from 'react-native-maps';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, Navigation, ChevronLeft, TreePine, Layers, LocateFixed, Map as MapIcon, History, X } from 'lucide-react-native';
import * as Location from 'expo-location';

const INITIAL_REGION = {
  latitude: 38.8895,
  longitude: -76.9833,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// 5km x 5km Bounding Box mapped in the backend
const BBOX_COORDS = [
  { latitude: 38.9119, longitude: -77.0121 }, // NW (North, West)
  { latitude: 38.9119, longitude: -76.9545 }, // NE (North, East)
  { latitude: 38.8670, longitude: -76.9545 }, // SE (South, East)
  { latitude: 38.8670, longitude: -77.0121 }, // SW (South, West)
];

// Zoom threshold: must be zoomed in tighter than this to show POIs
// (Increased to 0.2 because pitched 3D views dramatically inflate longitudeDelta)
const ZOOM_THRESHOLD = 0.2;

// Navigation camera constants
const NAV_PITCH = 65;
const NAV_ALTITUDE = 45;

interface OverpassCoord {
  latitude: number;
  longitude: number;
  id: string;
}

// --- Main Home Screen ---
export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  // Search text state
  const [startText, setStartText] = useState('');
  const [destText, setDestText] = useState('');

  // Coordinate state
  const [startCoord, setStartCoord] = useState<{latitude: number, longitude: number} | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{latitude: number, longitude: number} | null>(null);

  // Autocomplete
  const [activeField, setActiveField] = useState<'start' | 'dest' | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Route state
  const [standardRoute, setStandardRoute] = useState<{latitude: number, longitude: number}[]>([]);
  const [coolRoute, setCoolRoute] = useState<{latitude: number, longitude: number}[]>([]);
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // UI state
  const [isExpanded, setIsExpanded] = useState(false);

  // Map layer toggle
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');

  // Navigation mode
  const [isNavigating, setIsNavigating] = useState(false);
  const isNavigatingRef = useRef(false);
  const [followMode, setFollowMode] = useState(true);
  const [originalDestination, setOriginalDestination] = useState<any>(null);

  // Search History
  const [searchHistory, setSearchHistory] = useState<any[]>([]);

  // Navigation Heading Tracking
  const headingSubRef = useRef<Location.LocationSubscription | null>(null);

  // --- Overpass POI state (benches & water fountains) ---
  const [benches, setBenches] = useState<OverpassCoord[]>([]);
  const [waterFountains, setWaterFountains] = useState<OverpassCoord[]>([]);
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [fetchingPOIs, setFetchingPOIs] = useState(false);

  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['18%', '50%'], []);

  // Track the query text separately to avoid dependency issues
  const [searchQuery, setSearchQuery] = useState('');

  // Debounce timer for Overpass API calls
  const overpassTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Combined Overpass API: fetch benches + water in one query ---
  const fetchPOIs = async (region: Region) => {
    const south = Math.max(-90, region.latitude - region.latitudeDelta / 2);
    const west = Math.max(-180, region.longitude - region.longitudeDelta / 2);
    const north = Math.min(90, region.latitude + region.latitudeDelta / 2);
    const east = Math.min(180, region.longitude + region.longitudeDelta / 2);

    // Single query for both benches AND drinking water
    const query = `[out:json][timeout:15];(node["amenity"="bench"](${south},${west},${north},${east});node["amenity"="drinking_water"](${south},${west},${north},${east}););out;`;

    try {
      const encodedQuery = encodeURIComponent(query.trim());
      const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodedQuery}`, {
        method: 'GET',
        headers: { 'User-Agent': 'CoolPathsApp/1.0', 'Accept': 'application/json' },
      });

      if (response.status === 429) {
        console.warn('[OVERPASS] Rate limited, will retry on next map move');
        return; // Don't clear existing data, just skip this update
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      const newBenches: OverpassCoord[] = [];
      const newWater: OverpassCoord[] = [];

      for (const el of data.elements) {
        const coord: OverpassCoord = { id: el.id.toString(), latitude: el.lat, longitude: el.lon };
        if (el.tags?.amenity === 'bench') {
          newBenches.push(coord);
        } else if (el.tags?.amenity === 'drinking_water') {
          newWater.push(coord);
        }
      }

      setBenches(newBenches);
      setWaterFountains(newWater);
      console.log(`[OVERPASS] Loaded ${newBenches.length} benches, ${newWater.length} fountains`);
    } catch (error) {
      console.error('[OVERPASS] Fetch failed:', error);
    }
  };

  // --- Debounced map region change handler ---
  const handleRegionChange = (region: Region) => {
    // If navigation is active, the 3D map pitch creates an artificially massive bounding box
    // centered miles ahead. If we fetch POIs here, it will wipe our local POIs. 
    // We already have the POIs we need, so completely bypass fetching.
    if (isNavigatingRef.current) {
      setIsZoomedIn(true);
      return;
    }

    const zoomed = region.longitudeDelta <= ZOOM_THRESHOLD;
    setIsZoomedIn(zoomed);

    // Clear any pending timer
    if (overpassTimerRef.current) clearTimeout(overpassTimerRef.current);

    if (!zoomed) {
      setBenches([]);
      setWaterFountains([]);
      setFetchingPOIs(false);
      return;
    }

    // Debounce: wait 1.5s after user stops panning before hitting API
    setFetchingPOIs(true);
    overpassTimerRef.current = setTimeout(() => {
      fetchPOIs(region).finally(() => setFetchingPOIs(false));
    }, 1500);
  };

  // When the user types, update the search query
  const handleStartChange = (text: string) => {
    setStartText(text);
    setActiveField('start');
    setSearchQuery(text);
  };

  const handleDestChange = (text: string) => {
    setDestText(text);
    setActiveField('dest');
    setSearchQuery(text);
  };

  // Debounced search effect keyed on searchQuery
  useEffect(() => {
    if (searchQuery.length < 3) {
      setSuggestions([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      console.log('[SEARCH] Fetching results for:', searchQuery);
      setIsSearching(true);
      try {
        // 5x5km BBOX centered on Capitol Hill
        // viewbox=<x1>,<y1>,<x2>,<y2> -> Left(West), Top(North), Right(East), Bottom(South)
        const viewbox = "-77.0121,38.9119,-76.9545,38.8670";
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=jsonv2&viewbox=${viewbox}&bounded=1&addressdetails=1&limit=5`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'CoolPathsApp/1.0' }
        });
        const data = await response.json();
        console.log('[SEARCH] Got', data.length, 'results');
        setSuggestions(data);
      } catch (e) {
        console.error("[SEARCH] Error:", e);
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleSuggestionPress = (item: any) => {
    const shortName = item.display_name.split(',')[0];
    const coord = { latitude: parseFloat(item.lat), longitude: parseFloat(item.lon) };

    if (activeField === 'start') {
      setStartText(shortName);
      setStartCoord(coord);
    } else {
      setDestText(shortName);
      setDestinationCoords(coord);
    }

    // Update Search History (keep last 10, unique)
    setSearchHistory(prev => {
      const filtered = prev.filter(h => h.place_id !== item.place_id && h.display_name !== item.display_name);
      return [item, ...filtered].slice(0, 10);
    });

    setSuggestions([]);
    setSearchQuery('');
    setActiveField(null);
    Keyboard.dismiss();
  };

  const fetchDualRoute = async (customStart?: any, customDest?: any) => {
    let activeStart = customStart || startCoord;
    let activeEnd = customDest || destinationCoords;

    if (!activeStart || !activeEnd) {
      activeStart = { latitude: 38.8906, longitude: -76.9803 };
      activeEnd = { latitude: 38.8895, longitude: -77.0091 };
    }

    setLoading(true);
    Keyboard.dismiss();
    setIsExpanded(false);
    setSuggestions([]);
    setSearchQuery('');
    setActiveField(null);

    try {
      const API_URL = 'http://10.180.0.225:8000/api/route';
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_lat: activeStart.latitude,
          start_lng: activeStart.longitude,
          end_lat: activeEnd.latitude,
          end_lng: activeEnd.longitude,
        }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 400 && data.detail) {
          throw new Error(data.detail);
        }
        throw new Error("Failed to calculate routes");
      }
      
      setStandardRoute(data.standard_route);
      setCoolRoute(data.cool_route);
      setComparison(data.comparison);

      if (data.cool_route?.length > 0) {
        if (isNavigatingRef.current && followMode) {
          mapRef.current?.animateCamera(
            {
              center: { latitude: activeStart.latitude, longitude: activeStart.longitude },
              pitch: NAV_PITCH,
              altitude: NAV_ALTITUDE,
            },
            { duration: 600 }
          );
        } else {
          mapRef.current?.fitToCoordinates(data.cool_route, {
            edgePadding: { top: 120, right: 60, bottom: Dimensions.get('window').height * 0.5, left: 60 },
            animated: true,
          });
        }
      }
      
      if (!isNavigatingRef.current) {
        bottomSheetRef.current?.snapToIndex(1);
      }
    } catch (err: any) {
      console.error(err);
      Alert.alert("Route Error", err.message || "Could not calculate routes. Please try different locations.");
      setComparison(null);
    } finally {
      setLoading(false);
    }
  };

  // --- Navigation Mode ---
  const startNavigation = async () => {
    // Rely exclusively on the routed graph node rather than the raw user input coordinate
    // because the backend snaps the route to the nearest walk-able street node.
    const center = coolRoute.length > 0 ? coolRoute[0] : startCoord;
    if (!center) return;
    
    // Pre-fetch heading so the intial swoop perfectly aligns with the user's direction
    let initialHeading = 0;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const h = await Location.getHeadingAsync();
        initialHeading = h.trueHeading || h.magHeading;
      }
    } catch (e) {
      console.warn("Failed to get initial heading:", e);
    }

    setIsNavigating(true);
    isNavigatingRef.current = true;
    setFollowMode(true);
    bottomSheetRef.current?.close();

    mapRef.current?.animateCamera(
      {
        center: { latitude: center.latitude, longitude: center.longitude },
        pitch: NAV_PITCH,
        heading: initialHeading,
        altitude: NAV_ALTITUDE,
      },
      { duration: 1000 }
    );

    // Start heading tracking AFTER animation to prevent interrupting the swoop
    setTimeout(async () => {
      if (!isNavigatingRef.current) return;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          headingSubRef.current = await Location.watchHeadingAsync((headingObj) => {
            if (mapRef.current) {
              mapRef.current.animateCamera({ heading: headingObj.trueHeading || headingObj.magHeading }, { duration: 100 });
            }
          });
        }
      } catch (e) {
        console.warn("Heading tracking failed:", e);
      }
    }, 1050);
  };

  const exitNavigation = () => {
    setIsNavigating(false);
    isNavigatingRef.current = false;
    setFollowMode(false);
    
    // Stop heading tracking
    if (headingSubRef.current) {
      headingSubRef.current.remove();
      headingSubRef.current = null;
    }

    mapRef.current?.animateCamera(
      { pitch: 0, heading: 0, zoom: 14, altitude: 5000 },
      { duration: 800 }
    );
    if (coolRoute.length > 0) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(coolRoute, {
          edgePadding: { top: 120, right: 60, bottom: Dimensions.get('window').height * 0.5, left: 60 },
          animated: true,
        });
      }, 850);
    }
    bottomSheetRef.current?.snapToIndex(1);
  };

  const toggleFollowMode = async () => {
    const newFollow = !followMode;
    setFollowMode(newFollow);
    if (newFollow) {
      const center = coolRoute.length > 0 ? coolRoute[0] : startCoord;
      if (center) {
        mapRef.current?.animateCamera(
          {
            center: { latitude: center.latitude, longitude: center.longitude },
            pitch: NAV_PITCH,
            altitude: NAV_ALTITUDE,
          },
          { duration: 600 }
        );
      }

      // Re-start heading tracking AFTER the main animation finishes
      setTimeout(async () => {
        // use local closure check since state might not be updated here? Actually relying on a ref would be better
        // but checking the new state variable helps slightly
        try {
          if (!headingSubRef.current) {
             const { status } = await Location.requestForegroundPermissionsAsync();
             if (status === 'granted') {
               headingSubRef.current = await Location.watchHeadingAsync((headingObj) => {
                 if (mapRef.current) {
                   mapRef.current.animateCamera({ heading: headingObj.trueHeading || headingObj.magHeading }, { duration: 100 });
                 }
               });
             }
          }
        } catch (e) {}
      }, 650);
    } else {
      // Stop heading tracking in free view so the user can pan/rotate freely
      if (headingSubRef.current) {
        headingSubRef.current.remove();
        headingSubRef.current = null;
      }
      mapRef.current?.animateCamera(
        { pitch: 0, heading: 0, altitude: 2000 },
        { duration: 600 }
      );
    }
  };

  const handleMapDrag = () => {
    if (isNavigating && followMode) {
      setFollowMode(false);
      // Stop heading tracking so user can pan freely
      if (headingSubRef.current) {
        headingSubRef.current.remove();
        headingSubRef.current = null;
      }
    }
  };

  const handleDetour = (type: 'bench' | 'water') => {
    const pois = type === 'bench' ? benches : waterFountains;
    if (pois.length === 0) {
      Alert.alert("No Data", `No ${type}s loaded in this area. Try zooming out slightly to load POIs.`);
      return;
    }
    
    // Switch to 2D bird's-eye view automatically
    if (followMode) {
      setFollowMode(false);
      if (headingSubRef.current) {
        headingSubRef.current.remove();
        headingSubRef.current = null;
      }
      mapRef.current?.animateCamera(
        { pitch: 0, heading: 0, altitude: 2000 },
        { duration: 600 }
      );
    }
    
    // NEW HEURISTIC: Find the POI that is closest to our CURRENT POSITION
    // but also biases towards POIs that are further along our path.
    // If we have a coolRoute, we use its first coordinate (where we are currently simulated to be)
    // as our starting point, rather than the raw startCoord (which might be null or outdated).
    const currentLoc = (coolRoute.length > 0) ? coolRoute[0] : (startCoord || { latitude: 38.8906, longitude: -76.9803 });
    // Safe extraction of destination coordinates
    let destLoc = destinationCoords;
    if (originalDestination && originalDestination.coord) {
       destLoc = originalDestination.coord;
    }
    if (!destLoc) destLoc = currentLoc;
    
    let bestPoi = pois[0];
    let bestScore = Infinity;
    
    // We want to minimize (Distance from Us) + 0.5 * (Distance to Destination)
    // This creates an ellipse of preferred POIs in front of the user towards the goal.
    pois.forEach(p => {
      // rough euclidian is fine for local distances
      const dFromUs = Math.sqrt(Math.pow(p.latitude - currentLoc.latitude, 2) + Math.pow(p.longitude - currentLoc.longitude, 2));
      const dToDest = Math.sqrt(Math.pow(p.latitude - destLoc.latitude, 2) + Math.pow(p.longitude - destLoc.longitude, 2));
      
      const score = dFromUs + (0.5 * dToDest);
      if (score < bestScore) {
        bestScore = score;
        bestPoi = p;
      }
    });

    // Save original destination if not already saved
    if (!originalDestination) {
      setOriginalDestination({ coord: destinationCoords, text: destText });
    }

    const newDest = { latitude: bestPoi.latitude, longitude: bestPoi.longitude };
    setDestinationCoords(newDest);
    setDestText(`${type === 'bench' ? 'Rest Bench' : 'Water Fountain'}`);
    
    // Re-fetch route with new destination (from our current simulated location)
    fetchDualRoute(currentLoc, newDest);
  };

  const handleResumeJourney = () => {
    if (!originalDestination) return;
    
    setDestinationCoords(originalDestination.coord);
    setDestText(originalDestination.text);
    
    // Clear the saved destination so we exit detour mode
    const oldDest = originalDestination.coord;
    setOriginalDestination(null);
    
    fetchDualRoute(startCoord, oldDest);
  };

  const hasSuggestions = suggestions.length > 0;

  return (
    <View style={styles.container}>
      {/* ---- Full-Screen Map ---- */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={INITIAL_REGION}
        mapType={mapType}
        showsUserLocation={!isNavigating}
        onRegionChangeComplete={handleRegionChange}
        onPanDrag={handleMapDrag}
        pitchEnabled={true}
        rotateEnabled={true}
      >
        {/* Persistent Operating Boundary Box */}
        <Polygon 
          coordinates={BBOX_COORDS} 
          strokeColor="rgba(255, 67, 53, 0.4)" 
          strokeWidth={4} 
          lineDashPattern={[10, 10]}
          fillColor="transparent" 
        />

        {/* Standard Route (solid red) */}
        {standardRoute.length > 0 && (
          <Polyline coordinates={standardRoute} strokeColor="#EA4335" strokeWidth={4} />
        )}
        {/* Cool Route (solid blue) */}
        {coolRoute.length > 0 && (
          <Polyline coordinates={coolRoute} strokeColor="#4285f4" strokeWidth={6} />
        )}
        {/* Route start/end markers */}
        {coolRoute.length > 0 && (
          <>
            <Marker coordinate={coolRoute[0]} pinColor="green" title="Start" />
            <Marker coordinate={coolRoute[coolRoute.length - 1]} pinColor="red" title="End" />
          </>
        )}

        {/* ---- Simulated User Location (navigation mode) ---- */}
        {isNavigating && coolRoute.length > 0 && (
          <Marker coordinate={coolRoute[0]} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.userDotWrap}>
              <View style={styles.userDotHalo} />
              <View style={styles.userDotLine} />
              <View style={styles.userDotCenter} />
            </View>
          </Marker>
        )}

        {/* ---- Bench Markers ---- */}
        {isZoomedIn && benches.map((bench) => (
          <React.Fragment key={`bench-${bench.id}`}>
            <Circle
              center={bench}
              radius={4}
              strokeColor="rgba(26, 115, 232, 0.6)"
              fillColor="rgba(26, 115, 232, 0.2)"
            />
            <Marker coordinate={bench} tracksViewChanges={false}>
              <View style={styles.benchMarker}>
                <Text style={styles.poiEmoji}>🪑</Text>
              </View>
            </Marker>
          </React.Fragment>
        ))}

        {/* ---- Water Fountain Markers ---- */}
        {isZoomedIn && waterFountains.map((water) => (
          <React.Fragment key={`water-${water.id}`}>
            <Circle
              center={water}
              radius={4}
              strokeColor="rgba(33, 150, 243, 0.6)"
              fillColor="rgba(33, 150, 243, 0.2)"
            />
            <Marker coordinate={water} tracksViewChanges={false}>
              <View style={styles.waterMarker}>
                <Text style={styles.poiEmoji}>💧</Text>
              </View>
            </Marker>
          </React.Fragment>
        ))}
      </MapView>

      {/* ---- POI Status Pill ---- */}
      {!isExpanded && !isNavigating && (
        <View style={[styles.poiStatusWrap, { top: insets.top + 70 }]} pointerEvents="none">
          {fetchingPOIs && (
            <View style={styles.poiPill}>
              <ActivityIndicator size="small" color="#4285f4" />
              <Text style={styles.poiPillText}> Loading benches & water...</Text>
            </View>
          )}
          {!isZoomedIn && !fetchingPOIs && (
            <View style={styles.poiPill}>
              <Text style={styles.poiPillText}>Zoom in to see benches & water 💧🪑</Text>
            </View>
          )}
        </View>
      )}

      {/* ---- Top Search UI ---- */}
      {isNavigating ? null : !isExpanded ? (
        /* -- Collapsed bar -- */
        <TouchableOpacity
          style={[styles.collapsedBar, { top: insets.top + 10 }]}
          onPress={() => setIsExpanded(true)}
          activeOpacity={0.9}
        >
          <View style={styles.collapsedInner}>
            <View style={styles.appIcon}>
              <TreePine size={18} color="#fff" />
            </View>
            <Text style={styles.collapsedText}>Search for a route</Text>
            <View style={styles.profileCircle}>
              <Text style={styles.profileInitial}>C</Text>
            </View>
          </View>
        </TouchableOpacity>
      ) : (
        /* -- Expanded full-screen search overlay -- */
        <View style={[styles.expandedOverlay, { paddingTop: insets.top + 10 }]}>
          {/* White card with inputs */}
          <View style={styles.expandedCard}>
            <View style={styles.expandedRow}>
              <TouchableOpacity
                onPress={() => { setIsExpanded(false); setSuggestions([]); setSearchQuery(''); setActiveField(null); }}
                style={styles.backBtn}
              >
                <ChevronLeft size={24} color="#202124" />
              </TouchableOpacity>
              <View style={styles.inputsCol}>
                {/* Start field */}
                <View style={[styles.fieldRow, activeField === 'start' && styles.fieldRowActive]}>
                  <View style={styles.dotBlue} />
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Starting point"
                    placeholderTextColor="#9aa0a6"
                    value={startText}
                    onChangeText={handleStartChange}
                    onFocus={() => { setActiveField('start'); if (startText.length > 2) setSearchQuery(startText); }}
                    returnKeyType="next"
                    autoFocus={true}
                  />
                  {activeField === 'start' && isSearching && <ActivityIndicator size="small" color="#4285f4" />}
                </View>

                <View style={styles.fieldDivider} />

                {/* Destination field */}
                <View style={[styles.fieldRow, activeField === 'dest' && styles.fieldRowActive]}>
                  <View style={styles.dotRed} />
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="Destination"
                    placeholderTextColor="#9aa0a6"
                    value={destText}
                    onChangeText={handleDestChange}
                    onFocus={() => { setActiveField('dest'); if (destText.length > 2) setSearchQuery(destText); }}
                    returnKeyType="search"
                  />
                  {activeField === 'dest' && isSearching && <ActivityIndicator size="small" color="#4285f4" />}
                </View>
              </View>
            </View>
          </View>

          {/* Suggestions or History list */}
          {(hasSuggestions || (searchHistory.length > 0 && activeField)) ? (
            <FlatList
              data={hasSuggestions ? suggestions : searchHistory}
              keyExtractor={(item, i) => String(item.place_id || item.osm_id || i)}
              keyboardShouldPersistTaps="always"
              style={styles.suggestionsList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.suggestionRow}
                  onPress={() => handleSuggestionPress(item)}
                  activeOpacity={0.6}
                >
                  <View style={styles.suggestionIcon}>
                    {hasSuggestions ? <MapPin size={18} color="#5f6368" /> : <History size={18} color="#5f6368" />}
                  </View>
                  <View style={styles.suggestionTextCol}>
                    <Text style={styles.suggestionMain} numberOfLines={1}>
                      {item.display_name.split(',')[0]}
                    </Text>
                    <Text style={styles.suggestionSub} numberOfLines={2}>
                      {item.display_name}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          ) : (
            /* Find Route button when no suggestions or history showing */
            <View style={styles.findBtnWrap}>
              <TouchableOpacity style={styles.findBtn} onPress={() => fetchDualRoute()}>
                <Navigation size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.findBtnText}>Find Best Route</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* ---- Layer Toggle Button ---- */}
      {!isExpanded && !isNavigating && (
        <TouchableOpacity
          style={[styles.layerToggle, { bottom: insets.bottom + 30 }]}
          onPress={() => setMapType(mapType === 'standard' ? 'satellite' : 'standard')}
          activeOpacity={0.85}
        >
          <Layers size={16} color="#fff" />
          <Text style={styles.layerToggleText}>
            {mapType === 'standard' ? 'Satellite' : 'Map'}
          </Text>
        </TouchableOpacity>
      )}

      {/* ---- GO FAB ---- */}
      {!isExpanded && !comparison && !isNavigating && (
        <TouchableOpacity
          style={[styles.goFab, { bottom: insets.bottom + 30 }]}
          onPress={() => setIsExpanded(true)}
          activeOpacity={0.85}
        >
          <Navigation size={22} color="#fff" />
          <Text style={styles.goFabText}>GO</Text>
        </TouchableOpacity>
      )}

      {/* ---- Navigation Detour Buttons / Resume Journey ---- */}
      {isNavigating && (
        <View style={[styles.detourContainer, { top: insets.top + 20 }]}>
          {originalDestination ? (
            <TouchableOpacity style={[styles.detourBtn, { backgroundColor: '#e8f0fe', borderColor: '#4285f4', borderWidth: 2 }]} onPress={handleResumeJourney} activeOpacity={0.8}>
              <Text style={styles.detourEmoji}>↩️</Text>
              <Text style={[styles.detourText, { color: '#1967d2' }]}>Resume Journey</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.detourBtn} onPress={() => handleDetour('bench')} activeOpacity={0.8}>
                <Text style={styles.detourEmoji}>🪑</Text>
                <Text style={styles.detourText}>Need a break?</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.detourBtn} onPress={() => handleDetour('water')} activeOpacity={0.8}>
                <Text style={styles.detourEmoji}>💧</Text>
                <Text style={styles.detourText}>Take a sip?</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* ---- Re-center Button ---- */}
      {isNavigating && !followMode && (
        <TouchableOpacity 
          style={[styles.recenterBtn, { bottom: 100 + insets.bottom }]} 
          onPress={toggleFollowMode}
          activeOpacity={0.85}
        >
          <Navigation size={18} color="#202124" />
          <Text style={styles.recenterText}>Re-center</Text>
        </TouchableOpacity>
      )}

      {/* ---- Navigation Mode Bottom Bar ---- */}
      {isNavigating && (
        <View style={[styles.navBottomBar, { paddingBottom: insets.bottom + 10 }]}>
          <View style={styles.navBarInfo}>
            <Text style={styles.navBarTime}>
              {comparison ? `${(comparison.cool_total_meters / 80).toFixed(0)} min` : '--'}
            </Text>
            <Text style={styles.navBarDist}>
              {comparison ? `${(comparison.cool_total_meters / 1609.34).toFixed(2)} mi` : ''}
              {originalDestination ? ' (to detour)' : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.navToggleBtn}
            onPress={toggleFollowMode}
            activeOpacity={0.8}
          >
            {followMode ? (
              <MapIcon size={20} color="#fff" />
            ) : (
              <LocateFixed size={20} color="#fff" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navExitBtn}
            onPress={exitNavigation}
            activeOpacity={0.8}
          >
            <Text style={styles.navExitText}>Exit</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ---- Loading ---- */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#4285f4" />
            <Text style={styles.loadingText}>Calculating routes...</Text>
          </View>
        </View>
      )}

      {/* ---- Bottom Sheet ---- */}
      {comparison && (
        <BottomSheet
          ref={bottomSheetRef}
          index={1}
          snapPoints={snapPoints}
          backgroundStyle={styles.sheetBg}
          handleIndicatorStyle={styles.sheetHandle}
        >
          <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <Text style={[styles.sheetTitle, { marginBottom: 0 }]}>Route Comparison</Text>
              <TouchableOpacity onPress={() => bottomSheetRef.current?.close()} style={{ padding: 4 }}>
                <X size={24} color="#5f6368" />
              </TouchableOpacity>
            </View>
            <View style={styles.compRow}>
              <View style={[styles.statBlock, styles.statGray]}>
                <Text style={styles.statLabel}>Standard</Text>
                <Text style={styles.statVal}>{(comparison.standard_total_meters / 1609.34).toFixed(2)} mi</Text>
                <Text style={styles.statSub}>Score: {comparison.standard_shade_score.toFixed(0)} / 100</Text>
              </View>
              <View style={[styles.statBlock, styles.statGreen]}>
                <Text style={[styles.statLabel, { color: '#137333' }]}>Coolest</Text>
                <Text style={[styles.statVal, { color: '#137333' }]}>{(comparison.cool_total_meters / 1609.34).toFixed(2)} mi</Text>
                <Text style={[styles.statSub, { color: '#137333' }]}>Score: {comparison.cool_shade_score.toFixed(0)} / 100</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
              <View style={[styles.metricCard, { flex: 1, marginBottom: 0 }]}>
                <Text style={styles.metricText}>
                  <Text style={[styles.hl, { color: '#34a853' }]}>{Math.round((comparison.standard_total_meters / 1000) * 93.6)}g</Text> CO₂ saved
                </Text>
              </View>
              <View style={[styles.metricCard, { flex: 1, marginBottom: 0 }]}>
                <Text style={styles.metricText}>
                  <Text style={styles.hl}>{comparison.shade_multiplier}x</Text> more shade!
                </Text>
              </View>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricText}>Extra distance: <Text style={styles.hl}>{Math.round(comparison.extra_distance_meters)} m</Text></Text>
            </View>
            {!isNavigating && (
              <TouchableOpacity style={styles.navBtn} onPress={startNavigation}>
                <Navigation size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.navBtnText}>Start Navigation</Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 30 }} />
          </BottomSheetScrollView>
        </BottomSheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  // --- Collapsed bar ---
  collapsedBar: {
    position: 'absolute', left: 16, right: 16, zIndex: 20,
    backgroundColor: '#fff', borderRadius: 28, height: 52,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
  },
  collapsedInner: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  appIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#34a853',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  collapsedText: { flex: 1, fontSize: 16, color: '#5f6368' },
  profileCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#8e44ad',
    justifyContent: 'center', alignItems: 'center',
  },
  profileInitial: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // --- Expanded overlay (covers the map) ---
  expandedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f8f9fa',
    zIndex: 30,
    paddingHorizontal: 16,
  },
  expandedCard: {
    backgroundColor: '#fff', borderRadius: 20, paddingVertical: 14, paddingHorizontal: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  expandedRow: { flexDirection: 'row', alignItems: 'flex-start' },
  backBtn: { paddingTop: 10, paddingRight: 6, paddingLeft: 2 },
  inputsCol: { flex: 1 },

  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f1f3f4', borderRadius: 10,
    paddingHorizontal: 14, height: 46,
  },
  fieldRowActive: {
    backgroundColor: '#e8f0fe', borderWidth: 1, borderColor: '#4285f4',
  },
  dotBlue: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4285f4', marginRight: 12 },
  dotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ea4335', marginRight: 12 },
  fieldInput: { flex: 1, fontSize: 15, color: '#202124', height: '100%' },
  fieldDivider: { height: 6 },

  // --- Suggestions (full-screen list like Google Maps) ---
  suggestionsList: {
    flex: 1, marginTop: 0, backgroundColor: '#fff',
    borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
  },
  suggestionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 18,
    borderBottomWidth: 1, borderBottomColor: '#f1f3f4',
    backgroundColor: '#fff',
  },
  suggestionIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#f1f3f4',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  suggestionTextCol: { flex: 1 },
  suggestionMain: { fontSize: 15, fontWeight: '500', color: '#202124' },
  suggestionSub: { fontSize: 13, color: '#70757a', marginTop: 2 },

  // --- Find Route button ---
  findBtnWrap: { marginTop: 16 },
  findBtn: {
    flexDirection: 'row', backgroundColor: '#4285f4', paddingVertical: 14, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#4285f4', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  findBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // --- Layer Toggle ---
  layerToggle: {
    position: 'absolute', left: 16, width: 72, height: 72, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 6,
    zIndex: 15, overflow: 'hidden',
  },
  layerToggleText: {
    color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 4,
  },

  // --- GO FAB ---
  goFab: {
    position: 'absolute', right: 20, width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#4285f4', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#4285f4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
    zIndex: 15,
  },
  goFabText: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 1 },

  // --- POI Markers ---
  benchMarker: {
    backgroundColor: 'white', padding: 3, borderRadius: 12,
    borderWidth: 1, borderColor: '#1a73e8',
  },
  waterMarker: {
    backgroundColor: 'white', padding: 3, borderRadius: 12,
    borderWidth: 1, borderColor: '#2196F3',
  },
  poiEmoji: { fontSize: 12 },

  // --- POI Status Pill ---
  poiStatusWrap: {
    position: 'absolute', left: 0, right: 0,
    alignItems: 'center', zIndex: 15,
  },
  poiPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1, borderColor: '#e0e0e0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  poiPillText: { fontSize: 12, color: '#555' },

  // --- Loading ---
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center', alignItems: 'center', zIndex: 100,
  },
  loadingBox: {
    backgroundColor: 'white', padding: 28, borderRadius: 20, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 8,
  },
  loadingText: { marginTop: 14, fontSize: 16, fontWeight: '600', color: '#202124' },

  // --- Bottom Sheet ---
  sheetBg: { borderRadius: 28, backgroundColor: '#fff' },
  sheetHandle: { backgroundColor: '#dadce0', width: 40 },
  sheetContent: { padding: 24 },
  sheetTitle: { fontSize: 22, fontWeight: '800', marginBottom: 18, color: '#202124' },
  compRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  statBlock: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 2, marginHorizontal: 4 },
  statGray: { borderColor: '#dadce0', backgroundColor: '#fafafa' },
  statGreen: { borderColor: '#34a853', backgroundColor: '#e6f4ea' },
  statLabel: { fontSize: 13, fontWeight: '700', color: '#5f6368', marginBottom: 4 },
  statVal: { fontSize: 20, fontWeight: '800', color: '#202124' },
  statSub: { fontSize: 12, fontWeight: '600', color: '#70757a', marginTop: 4 },
  metricCard: { backgroundColor: '#f1f3f4', padding: 14, borderRadius: 14, alignItems: 'center', marginBottom: 14 },
  metricText: { fontSize: 15, color: '#202124', textAlign: 'center', lineHeight: 22 },
  hl: { fontSize: 17, fontWeight: '800', color: '#4285f4' },
  navBtn: {
    flexDirection: 'row', backgroundColor: '#4285f4', padding: 16, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
    shadowColor: '#4285f4', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  navBtnText: { color: 'white', fontSize: 17, fontWeight: '700' },

  // --- Simulated Location Marker ---
  userDotWrap: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  userDotHalo: { position: 'absolute', width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(66, 133, 244, 0.25)' },
  userDotLine: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
  userDotCenter: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#4285f4' },

  // --- Navigation Mode Bottom Bar ---
  navBottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a2e', paddingTop: 14, paddingHorizontal: 16,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 10,
    zIndex: 50,
  },
  navBarInfo: { flex: 1 },
  navBarTime: { color: '#fff', fontSize: 28, fontWeight: '800' },
  navBarDist: { color: '#8e8ea0', fontSize: 14, fontWeight: '600', marginTop: 2 },
  navToggleBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  navExitBtn: {
    backgroundColor: '#EA4335', paddingVertical: 12, paddingHorizontal: 24,
    borderRadius: 24,
  },
  navExitText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // --- Recenter & Detour Buttons ---
  recenterBtn: {
    position: 'absolute', left: 16,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 10, paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 5,
    zIndex: 40,
  },
  recenterText: { color: '#202124', fontSize: 15, fontWeight: '700', marginLeft: 6 },
  
  detourContainer: {
    position: 'absolute', right: 16,
    alignItems: 'flex-end',
    zIndex: 40,
    gap: 12,
  },
  detourBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 5,
  },
  detourEmoji: { fontSize: 16, marginRight: 6 },
  detourText: { color: '#202124', fontSize: 14, fontWeight: '700' },
});
