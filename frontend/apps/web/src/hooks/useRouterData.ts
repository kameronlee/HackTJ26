import { useEffect, useMemo, useState } from 'react';

import { connectMockTelemetry, connectTelemetry, loadLayers, loadTelemetrySnapshot, requestRoutes, startReplay } from '../lib/api';
import type { LocationOption, MapLayerState, RouteOption } from '../lib/types';

const defaultState: MapLayerState = {
  regions: [],
  locations: [],
  heatSurface: { type: 'FeatureCollection', features: [] },
  vulnerabilityOverlay: { type: 'FeatureCollection', features: [] },
  telemetryPoints: [],
  replayMode: 'idle',
  routeOptions: [],
  corrections: { type: 'FeatureCollection', features: [] },
  backendStatus: 'mock',
};

export function useRouterData() {
  const [state, setState] = useState<MapLayerState>(defaultState);
  const [selectedOriginId, setSelectedOriginId] = useState('union_station');
  const [selectedDestinationId, setSelectedDestinationId] = useState('eastern_market');
  const [selectedMode, setSelectedMode] = useState<'fastest' | 'coolest' | 'balanced'>('balanced');
  const [showVulnerability, setShowVulnerability] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: () => void = () => undefined;
    loadLayers().then(async ({ layers, backendStatus }) => {
      setState((current) => ({ ...current, ...layers, backendStatus }));
      const defaultOrigin = layers.locations.find((item) => item.id === 'union_station') ?? layers.locations[0];
      const defaultDestination = layers.locations.find((item) => item.id === 'eastern_market') ?? layers.locations[1] ?? layers.locations[0];
      if (defaultOrigin && defaultDestination && defaultOrigin.id !== defaultDestination.id) {
        const initialRoutes = await requestRoutes({
          origin: toPayloadLocation(defaultOrigin),
          destination: toPayloadLocation(defaultDestination),
          departureTime: new Date().toISOString(),
          mode: 'balanced',
        });
        setState((current) => ({ ...current, routeOptions: initialRoutes }));
      }
      setIsLoading(false);
      const snapshot = await loadTelemetrySnapshot();
      setState((current) => ({
        ...current,
        telemetryPoints: snapshot.telemetryPoints,
        replayMode: snapshot.replayMode,
        corrections: snapshot.corrections,
      }));
      unsubscribe = backendStatus === 'connected'
        ? connectTelemetry((snapshotEvent) => {
            setState((current) => ({
              ...current,
              telemetryPoints: snapshotEvent.telemetryPoints,
              replayMode: snapshotEvent.replayMode,
              corrections: snapshotEvent.corrections,
            }));
          })
        : connectMockTelemetry((snapshotEvent) => {
            setState((current) => ({
              ...current,
              telemetryPoints: snapshotEvent.telemetryPoints,
              replayMode: snapshotEvent.replayMode,
              corrections: snapshotEvent.corrections,
            }));
          });
    });

    return () => unsubscribe();
  }, []);

  const availableLocations = useMemo(() => state.locations, [state.locations]);

  async function calculateRoutes() {
    const origin = availableLocations.find((item) => item.id === selectedOriginId);
    const destination = availableLocations.find((item) => item.id === selectedDestinationId);
    if (!origin || !destination || origin.id === destination.id) {
      setRouteError('Pick two different Washington D.C. landmarks.');
      return;
    }
    setRouteError(null);
    const routes = await requestRoutes({
      origin: toPayloadLocation(origin),
      destination: toPayloadLocation(destination),
      departureTime: new Date().toISOString(),
      mode: selectedMode,
    });
    if (!routes.length) {
      setRouteError('No route options were returned for that pair.');
      return;
    }
    setState((current) => ({ ...current, routeOptions: routes }));
  }

  async function replayTelemetry() {
    const status = await startReplay();
    if (status === 'mock') {
      setState((current) => ({ ...current, backendStatus: 'mock', replayMode: 'running' }));
    }
  }

  return {
    state,
    isLoading,
    routeError,
    selectedOriginId,
    selectedDestinationId,
    selectedMode,
    showVulnerability,
    availableLocations,
    setSelectedOriginId,
    setSelectedDestinationId,
    setSelectedMode,
    setShowVulnerability,
    calculateRoutes,
    replayTelemetry,
  };
}

function toPayloadLocation(location: LocationOption) {
  return {
    label: location.label,
    locationId: location.id,
    coordinate: {
      lon: location.coordinates[0],
      lat: location.coordinates[1],
    },
  };
}

export function pickFeaturedRoute(routeOptions: RouteOption[], selectedMode: 'fastest' | 'coolest' | 'balanced') {
  return routeOptions.find((item) => item.id === selectedMode) ?? routeOptions[0] ?? null;
}
