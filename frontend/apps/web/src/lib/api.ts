import { mockLayers, mockRoutes, replaySequence } from './mockData';
import type { RouteOption, RouteRequestPayload, LayersResponse, TelemetrySnapshot } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

export async function loadLayers(): Promise<{ layers: LayersResponse; backendStatus: 'connected' | 'mock' }> {
  try {
    const response = await fetch(`${API_BASE}/layers`);
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    return { layers: (await response.json()) as LayersResponse, backendStatus: 'connected' };
  } catch {
    return { layers: mockLayers, backendStatus: 'mock' };
  }
}

export async function requestRoutes(payload: RouteRequestPayload): Promise<RouteOption[]> {
  try {
    const response = await fetch(`${API_BASE}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Route failed ${response.status}`);
    }
    const json = (await response.json()) as { options: RouteOption[] };
    return json.options;
  } catch {
    const direct = mockRoutes[`${payload.origin.locationId}:${payload.destination.locationId}`];
    if (direct) {
      return direct;
    }
    const reverse = mockRoutes[`${payload.destination.locationId}:${payload.origin.locationId}`];
    return reverse ? reverse.map(reverseRoute) : [];
  }
}

export async function startReplay(): Promise<'connected' | 'mock'> {
  try {
    const response = await fetch(`${API_BASE}/telemetry/replay/start`, { method: 'POST' });
    if (!response.ok) {
      throw new Error('Replay failed');
    }
    return 'connected';
  } catch {
    return 'mock';
  }
}

export async function loadTelemetrySnapshot(): Promise<TelemetrySnapshot> {
  try {
    const response = await fetch(`${API_BASE}/telemetry/latest`);
    if (!response.ok) {
      throw new Error('Snapshot failed');
    }
    return (await response.json()) as TelemetrySnapshot;
  } catch {
    return replaySequence[0];
  }
}

export function connectTelemetry(onEvent: (snapshot: TelemetrySnapshot) => void): () => void {
  let closed = false;
  const socket = new WebSocket(`${WS_BASE}/ws/telemetry`);
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data) as { payload: TelemetrySnapshot };
    if (message.payload?.telemetryPoints) {
      onEvent(message.payload);
    }
  };
  socket.onerror = () => {
    if (!closed) {
      socket.close();
    }
  };
  return () => {
    closed = true;
    socket.close();
  };
}

export function connectMockTelemetry(onEvent: (snapshot: TelemetrySnapshot) => void): () => void {
  let index = 0;
  const timer = window.setInterval(() => {
    onEvent(replaySequence[index]);
    index = (index + 1) % replaySequence.length;
  }, 7000);
  return () => window.clearInterval(timer);
}

function reverseRoute(route: RouteOption): RouteOption {
  const coordinates = [...route.geojson.geometry.coordinates].reverse();
  return {
    ...route,
    geojson: {
      ...route.geojson,
      geometry: {
        ...route.geojson.geometry,
        coordinates,
      },
    },
  };
}
