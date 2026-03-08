import type { TelemetryReading } from '../lib/types';

type TelemetryPanelProps = {
  telemetry: TelemetryReading[];
};

export function TelemetryPanel({ telemetry }: TelemetryPanelProps) {
  return (
    <section className="panel telemetry-panel">
      <div className="eyebrow-row">
        <span className="eyebrow">Ground truth feed</span>
        <span className="status-pill live">{telemetry.length} samples</span>
      </div>
      {telemetry.length === 0 ? (
        <p>No sensor updates yet. Start replay or ingest a live MQTT-style payload through the backend.</p>
      ) : (
        <ul className="telemetry-list">
          {telemetry.map((reading) => (
            <li key={`${reading.deviceId}-${reading.timestamp}`}>
              <div>
                <strong>{reading.deviceId}</strong>
                <span>{new Date(reading.timestamp).toLocaleTimeString()}</span>
              </div>
              <div>
                <span>{reading.temperatureC.toFixed(1)} C</span>
                <span>{reading.humidityPct.toFixed(0)}% humidity</span>
                <span>{reading.heatIndexC?.toFixed(1) ?? 'n/a'} heat index</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
