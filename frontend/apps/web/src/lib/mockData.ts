import type { LayersResponse, RouteOption, TelemetrySnapshot } from './types';

export const mockLayers: LayersResponse = {
  regions: [{ id: 'dc', label: 'Washington, D.C.', center: [-77.0119, 38.8898] }],
  locations: [
    {
      id: 'union_station',
      label: 'Union Station',
      address: '50 Massachusetts Ave NE, Washington, DC',
      region: 'dc',
      coordinates: [-77.0064, 38.8971],
    },
    {
      id: 'eastern_market',
      label: 'Eastern Market',
      address: '225 7th St SE, Washington, DC',
      region: 'dc',
      coordinates: [-76.9956, 38.8842],
    },
    {
      id: 'lenfant_plaza',
      label: "L'Enfant Plaza",
      address: '430 10th St SW, Washington, DC',
      region: 'dc',
      coordinates: [-77.012, 38.886],
    },
    {
      id: 'nationals_park',
      label: 'Nationals Park',
      address: '1500 South Capitol St SE, Washington, DC',
      region: 'dc',
      coordinates: [-77.0075, 38.873],
    },
  ],
  heatSurface: {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { id: 'h1', heat: 88, region: 'dc' }, geometry: { type: 'Point', coordinates: [-77.005, 38.895] } },
      { type: 'Feature', properties: { id: 'h2', heat: 84, region: 'dc' }, geometry: { type: 'Point', coordinates: [-77.0, 38.889] } },
      { type: 'Feature', properties: { id: 'h3', heat: 72, region: 'dc' }, geometry: { type: 'Point', coordinates: [-77.01, 38.886] } },
      { type: 'Feature', properties: { id: 'h4', heat: 90, region: 'dc' }, geometry: { type: 'Point', coordinates: [-77.006, 38.874] } },
      { type: 'Feature', properties: { id: 'h5', heat: 78, region: 'dc' }, geometry: { type: 'Point', coordinates: [-77.013, 38.887] } },
      { type: 'Feature', properties: { id: 'h6', heat: 81, region: 'dc' }, geometry: { type: 'Point', coordinates: [-77.002, 38.881] } },
    ],
  },
  vulnerabilityOverlay: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { tract_id: 'dc_hot_core', name: 'Ward 6 Core', vulnerability: 0.74, label: 'High heat exposure, moderate adaptive capacity' },
        geometry: { type: 'Polygon', coordinates: [[[-77.012, 38.9], [-76.998, 38.9], [-76.998, 38.889], [-77.012, 38.889], [-77.012, 38.9]]] },
      },
      {
        type: 'Feature',
        properties: { tract_id: 'dc_market', name: 'Ward 6 East', vulnerability: 0.83, label: 'Transit-dependent corridor with elevated heat sensitivity' },
        geometry: { type: 'Polygon', coordinates: [[[-77.006, 38.889], [-76.99, 38.889], [-76.99, 38.878], [-77.006, 38.878], [-77.006, 38.889]]] },
      },
      {
        type: 'Feature',
        properties: { tract_id: 'dc_greenway', name: 'Southwest Greenway', vulnerability: 0.58, label: 'Lower heat burden because canopy and open space reduce radiant load' },
        geometry: { type: 'Polygon', coordinates: [[[-77.018, 38.891], [-77.004, 38.891], [-77.004, 38.882], [-77.018, 38.882], [-77.018, 38.891]]] },
      },
      {
        type: 'Feature',
        properties: { tract_id: 'dc_riverfront', name: 'Capitol Riverfront', vulnerability: 0.69, label: 'Rapidly warming paved corridor with limited midday shade' },
        geometry: { type: 'Polygon', coordinates: [[[-77.01, 38.879], [-76.998, 38.879], [-76.998, 38.87], [-77.01, 38.87], [-77.01, 38.879]]] },
      },
    ],
  },
  telemetryPoints: [],
  replayMode: 'idle',
};

export const mockRoutes: Record<string, RouteOption[]> = {
  'union_station:eastern_market': [
    {
      id: 'fastest',
      label: 'Fastest',
      distanceM: 1750,
      durationMin: 21.6,
      heatScore: 153.2,
      shadePct: 20.1,
      tradeoffScore: 0,
      vulnerabilityTracts: ['dc_hot_core', 'dc_market'],
      geojson: { type: 'Feature', properties: { id: 'fastest', label: 'Fastest' }, geometry: { type: 'LineString', coordinates: [[-77.0064, 38.8971], [-77.0015, 38.892], [-76.9956, 38.8842]] } },
    },
    {
      id: 'coolest',
      label: 'Coolest',
      distanceM: 2590,
      durationMin: 30.4,
      heatScore: 101.8,
      shadePct: 66.4,
      tradeoffScore: 20.6,
      vulnerabilityTracts: ['dc_greenway', 'dc_market'],
      geojson: { type: 'Feature', properties: { id: 'coolest', label: 'Coolest' }, geometry: { type: 'LineString', coordinates: [[-77.0064, 38.8971], [-77.012, 38.886], [-76.9956, 38.8842]] } },
    },
    {
      id: 'balanced',
      label: 'Balanced',
      distanceM: 2310,
      durationMin: 27.2,
      heatScore: 118.4,
      shadePct: 51.2,
      tradeoffScore: 14.7,
      vulnerabilityTracts: ['dc_greenway', 'dc_market'],
      geojson: { type: 'Feature', properties: { id: 'balanced', label: 'Balanced' }, geometry: { type: 'LineString', coordinates: [[-77.0064, 38.8971], [-77.012, 38.886], [-77.003, 38.88], [-76.9956, 38.8842]] } },
    },
  ],
  'union_station:nationals_park': [
    {
      id: 'fastest',
      label: 'Fastest',
      distanceM: 3470,
      durationMin: 42.4,
      heatScore: 276.7,
      shadePct: 16.7,
      tradeoffScore: 0,
      vulnerabilityTracts: ['dc_hot_core', 'dc_market', 'dc_riverfront'],
      geojson: { type: 'Feature', properties: { id: 'fastest', label: 'Fastest' }, geometry: { type: 'LineString', coordinates: [[-77.0064, 38.8971], [-77.0015, 38.892], [-76.9956, 38.8842], [-77.003, 38.88], [-77.0075, 38.873]] } },
    },
    {
      id: 'coolest',
      label: 'Coolest',
      distanceM: 4470,
      durationMin: 53.1,
      heatScore: 180.6,
      shadePct: 49.8,
      tradeoffScore: 58.7,
      vulnerabilityTracts: ['dc_greenway', 'dc_market', 'dc_riverfront'],
      geojson: { type: 'Feature', properties: { id: 'coolest', label: 'Coolest' }, geometry: { type: 'LineString', coordinates: [[-77.0064, 38.8971], [-77.012, 38.886], [-77.003, 38.88], [-77.0075, 38.873]] } },
    },
    {
      id: 'balanced',
      label: 'Balanced',
      distanceM: 4060,
      durationMin: 48.4,
      heatScore: 205.5,
      shadePct: 43.2,
      tradeoffScore: 41.8,
      vulnerabilityTracts: ['dc_greenway', 'dc_market', 'dc_riverfront'],
      geojson: { type: 'Feature', properties: { id: 'balanced', label: 'Balanced' }, geometry: { type: 'LineString', coordinates: [[-77.0064, 38.8971], [-77.012, 38.886], [-76.9956, 38.8842], [-77.003, 38.88], [-77.0075, 38.873]] } },
    },
  ],
};

export const replaySequence: TelemetrySnapshot[] = [
  {
    telemetryPoints: [
      { deviceId: 'sensor-dc-1', timestamp: '2026-07-14T16:00:00Z', lat: 38.8924, lon: -77.002, temperatureC: 35.4, humidityPct: 58, heatIndexC: 39.2, batteryV: 4.01, source: 'replay' },
    ],
    corrections: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { edgeId: 'dc-e1', delta: 2.4 }, geometry: { type: 'Point', coordinates: [-77.0039, 38.8945] } },
      ],
    },
    replayMode: 'running',
  },
  {
    telemetryPoints: [
      { deviceId: 'sensor-dc-2', timestamp: '2026-07-14T16:02:00Z', lat: 38.889, lon: -76.9992, temperatureC: 36.1, humidityPct: 59.1, heatIndexC: 40.3, batteryV: 4, source: 'replay' },
      { deviceId: 'sensor-dc-3', timestamp: '2026-07-14T16:04:00Z', lat: 38.8856, lon: -77.0108, temperatureC: 33, humidityPct: 54.3, heatIndexC: 35.8, batteryV: 3.97, source: 'replay' },
    ],
    corrections: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { edgeId: 'dc-e2', delta: 3.1 }, geometry: { type: 'Point', coordinates: [-76.9986, 38.8881] } },
        { type: 'Feature', properties: { edgeId: 'dc-e3', delta: -2.2 }, geometry: { type: 'Point', coordinates: [-77.0092, 38.8915] } },
      ],
    },
    replayMode: 'running',
  },
  {
    telemetryPoints: [
      { deviceId: 'sensor-dc-2', timestamp: '2026-07-14T16:06:00Z', lat: 38.8741, lon: -77.0068, temperatureC: 35.2, humidityPct: 56.4, heatIndexC: 38.9, batteryV: 3.95, source: 'replay' },
    ],
    corrections: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { edgeId: 'dc-e6', delta: 4.4 }, geometry: { type: 'Point', coordinates: [-77.0053, 38.8765] } },
      ],
    },
    replayMode: 'idle',
  },
];
