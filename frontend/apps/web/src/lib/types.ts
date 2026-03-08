import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';

export type Coordinate = {
  lon: number;
  lat: number;
};

export type LocationOption = {
  id: string;
  label: string;
  address: string;
  region: 'dc';
  coordinates: [number, number];
};

export type TelemetryReading = {
  deviceId: string;
  timestamp: string;
  lat: number;
  lon: number;
  temperatureC: number;
  humidityPct: number;
  heatIndexC?: number;
  batteryV?: number;
  source: 'live' | 'replay';
};

export type RouteOption = {
  id: 'fastest' | 'coolest' | 'balanced';
  label: string;
  distanceM: number;
  durationMin: number;
  heatScore: number;
  shadePct: number;
  tradeoffScore: number;
  vulnerabilityTracts: string[];
  geojson: Feature<LineString>;
};

export type LayersResponse = {
  regions: Array<{ id: string; label: string; center: [number, number] }>;
  locations: LocationOption[];
  heatSurface: FeatureCollection<Point>;
  vulnerabilityOverlay: FeatureCollection<Polygon>;
  telemetryPoints: TelemetryReading[];
  replayMode: 'idle' | 'running';
};

export type TelemetrySnapshot = {
  telemetryPoints: TelemetryReading[];
  corrections: FeatureCollection<Point>;
  replayMode: 'idle' | 'running';
};

export type MapLayerState = LayersResponse & {
  routeOptions: RouteOption[];
  corrections: FeatureCollection<Point>;
  backendStatus: 'connected' | 'mock';
};

export type RouteRequestPayload = {
  origin: {
    label: string;
    locationId: string;
    coordinate: Coordinate;
  };
  destination: {
    label: string;
    locationId: string;
    coordinate: Coordinate;
  };
  departureTime: string;
  mode: 'fastest' | 'coolest' | 'balanced';
};
