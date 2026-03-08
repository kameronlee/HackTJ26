import React, { useEffect, useState, useRef, useMemo } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps';
import BottomSheet from '@gorhom/bottom-sheet';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { RouteProp } from '@react-navigation/native';
import { RootTabParamList } from './App';

type Props = {
  navigation: BottomTabNavigationProp<RootTabParamList, 'Map'>;
  route: RouteProp<RootTabParamList, 'Map'>;
};

const INITIAL_REGION = {
  latitude: 38.8906,
  longitude: -76.9803,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03,
};

export default function MapScreen({ route }: Props) {
  const [standardRoute, setStandardRoute] = useState<{latitude: number, longitude: number}[]>([]);
  const [coolRoute, setCoolRoute] = useState<{latitude: number, longitude: number}[]>([]);
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Bottom Sheet Configuration
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['25%', '50%'], []);

  useEffect(() => {
    // If we have coordinates passed from Home, trigger the fetch
    const { startCoord, endCoord } = route.params || {};
    if (startCoord && endCoord) {
      fetchDualRoute(startCoord, endCoord);
    }
  }, [route.params]);

  const fetchDualRoute = async (start: any, end: any) => {
    setLoading(true);
    try {
      // Local IP mapping for the backend API
      const API_URL = 'http://10.180.0.225:8000/api/route';
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_lat: start.latitude,
          start_lng: start.longitude,
          end_lat: end.latitude,
          end_lng: end.longitude,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to calculate routes");
      }

      const data = await response.json();
      setStandardRoute(data.standard_route);
      setCoolRoute(data.cool_route);
      setComparison(data.comparison);
      
      // Expand bottom sheet if data returned
      bottomSheetRef.current?.snapToIndex(1);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <MapView style={styles.map} initialRegion={INITIAL_REGION}>
        <UrlTile urlTemplate="https://a.tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />
        
        {/* Draw Standard Route (Thin, Dashed, Gray) */}
        {standardRoute.length > 0 && (
          <Polyline
            coordinates={standardRoute}
            strokeColor="#9aa0a6" 
            strokeWidth={4}
            lineDashPattern={[10, 10]}
          />
        )}
        
        {/* Draw Cool Route (Thick, Solid, Blue) */}
        {coolRoute.length > 0 && (
          <Polyline
            coordinates={coolRoute}
            strokeColor="#1a73e8" 
            strokeWidth={6}
          />
        )}
        
        {coolRoute.length > 0 && (
          <>
            <Marker coordinate={coolRoute[0]} pinColor="green" title="Start" />
            <Marker coordinate={coolRoute[coolRoute.length - 1]} pinColor="red" title="End" />
          </>
        )}
      </MapView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
             <ActivityIndicator size="large" color="#1a73e8" />
             <Text style={styles.loadingText}>Calculating dual routes...</Text>
          </View>
        </View>
      )}

      {/* Bottom Sheet for Comparison */}
      {comparison && (
        <BottomSheet
          ref={bottomSheetRef}
          index={0}
          snapPoints={snapPoints}
          backgroundStyle={styles.sheetBackground}
        >
          <View style={styles.sheetContent}>
            <Text style={styles.sheetTitle}>Route Comparison</Text>
            
            <View style={styles.comparisonRow}>
              {/* Fastest Path Stat Block */}
              <View style={[styles.statBlock, { borderColor: '#9aa0a6' }]}>
                <Text style={styles.statLabel}>Shortest Path</Text>
                <Text style={styles.statValue}>{Math.ceil(comparison.standard_total_meters / 84)} min</Text>
                <Text style={styles.statSub}>{(comparison.standard_total_meters / 1609.34).toFixed(2)} mi</Text>
                <Text style={styles.statSub}>Shaded: {comparison.standard_shade_score.toFixed(0)}%</Text>
              </View>

              {/* Coolest Path Stat Block */}
              <View style={[styles.statBlock, { borderColor: '#188038', backgroundColor: '#e6f4ea' }]}>
                 <Text style={[styles.statLabel, {color: '#188038'}]}>Cool Path</Text>
                 <Text style={[styles.statValue, {color: '#188038'}]}>{Math.ceil(comparison.cool_total_meters / 84)} min</Text>
                 <Text style={[styles.statSub, {color: '#188038'}]}>{(comparison.cool_total_meters / 1609.34).toFixed(2)} mi</Text>
                 <Text style={[styles.statSub, {color: '#188038', fontWeight: 'bold'}]}>Shaded: {comparison.cool_shade_score.toFixed(0)}%</Text>
              </View>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricText}>
                The Cool Path gives you <Text style={styles.highlightText}>+{(comparison.cool_shade_score - comparison.standard_shade_score).toFixed(0)}%</Text> more shade optimization than the normal shortest path!
              </Text>
            </View>
            
            <View style={styles.metricCard}>
               <Text style={styles.metricText}>Detour mapping adds exactly <Text style={styles.highlightText}>{Math.round(comparison.extra_distance_meters)}</Text> extra meters.</Text>
            </View>
            
            <TouchableOpacity style={styles.startNavigationButton}>
               <Text style={styles.navButtonText}>Start Navigation</Text>
            </TouchableOpacity>

          </View>
        </BottomSheet>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center', alignItems: 'center'
  },
  loadingBox: {
    backgroundColor: 'white', padding: 24, borderRadius: 16, alignItems: 'center'
  },
  loadingText: { marginTop: 12, fontSize: 16, fontWeight: '600' },
  sheetBackground: { borderRadius: 24 },
  sheetContent: { flex: 1, padding: 24 },
  sheetTitle: { fontSize: 22, fontWeight: '800', marginBottom: 20 },
  comparisonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  statBlock: {
    flex: 1, padding: 16, borderRadius: 16, borderWidth: 2, marginHorizontal: 4,
  },
  statLabel: { fontSize: 14, fontWeight: '700', color: '#5f6368', marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: '800' },
  statSub: { fontSize: 12, color: '#70757a', marginTop: 4 },
  metricCard: {
     backgroundColor: '#f1f3f4', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 20
  },
  metricText: { fontSize: 16, color: '#202124', textAlign: 'center' },
  highlightText: { fontSize: 20, fontWeight: '800', color: '#1a73e8' },
  startNavigationButton: {
    backgroundColor: '#1a73e8', padding: 16, borderRadius: 24, alignItems: 'center'
  },
  navButtonText: { color: 'white', fontSize: 18, fontWeight: '700' }
});
