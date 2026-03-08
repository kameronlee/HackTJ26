import type { LocationOption } from '../lib/types';

type ControlPanelProps = {
  locations: LocationOption[];
  selectedOriginId: string;
  selectedDestinationId: string;
  selectedMode: 'fastest' | 'coolest' | 'balanced';
  showVulnerability: boolean;
  replayMode: 'idle' | 'running';
  backendStatus: 'connected' | 'mock';
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onModeChange: (value: 'fastest' | 'coolest' | 'balanced') => void;
  onToggleVulnerability: (value: boolean) => void;
  onCalculate: () => void;
  onReplay: () => void;
};

export function ControlPanel(props: ControlPanelProps) {
  return (
    <section className="panel controls-panel">
      <div className="eyebrow-row">
        <span className="eyebrow">Washington D.C. heat routing</span>
        <span className={`status-pill ${props.backendStatus}`}>{props.backendStatus === 'connected' ? 'Backend live' : 'Mock fallback'}</span>
      </div>
      <h1>Find the cooler walk across D.C.</h1>
      <p className="lede">
        Compare the fastest path against a shaded alternative, overlay vulnerability data, and replay sensor updates that nudge the map in real time.
      </p>

      <div className="field-grid compact-grid">
        <label>
          Origin
          <select value={props.selectedOriginId} onChange={(event) => props.onOriginChange(event.target.value)}>
            {props.locations.map((location) => (
              <option key={location.id} value={location.id}>{location.label}</option>
            ))}
          </select>
        </label>
        <label>
          Destination
          <select value={props.selectedDestinationId} onChange={(event) => props.onDestinationChange(event.target.value)}>
            {props.locations.map((location) => (
              <option key={location.id} value={location.id}>{location.label}</option>
            ))}
          </select>
        </label>
        <label>
          Featured route
          <select value={props.selectedMode} onChange={(event) => props.onModeChange(event.target.value as 'fastest' | 'coolest' | 'balanced')}>
            <option value="fastest">Fastest</option>
            <option value="coolest">Coolest</option>
            <option value="balanced">Balanced</option>
          </select>
        </label>
      </div>

      <div className="button-row">
        <button className="primary-button" type="button" onClick={props.onCalculate}>Compute Routes</button>
        <button className="secondary-button" type="button" onClick={props.onReplay}>Start Telemetry Replay</button>
      </div>

      <div className="toggle-row">
        <label className="toggle-pill">
          <input
            type="checkbox"
            checked={props.showVulnerability}
            onChange={(event) => props.onToggleVulnerability(event.target.checked)}
          />
          <span>Show D.C. vulnerability overlay</span>
        </label>
        <span className={`status-pill ${props.replayMode}`}>{props.replayMode === 'running' ? 'Replay active' : 'Replay idle'}</span>
      </div>
    </section>
  );
}
