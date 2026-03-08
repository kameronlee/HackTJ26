import { ControlPanel } from './components/ControlPanel';
import { MapPanel } from './components/MapPanel';
import { RouteCards } from './components/RouteCards';
import { TelemetryPanel } from './components/TelemetryPanel';
import { pickFeaturedRoute, useRouterData } from './hooks/useRouterData';

function App() {
  const {
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
  } = useRouterData();

  const featuredRoute = pickFeaturedRoute(state.routeOptions, selectedMode);

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <main className="layout">
        <ControlPanel
          locations={availableLocations}
          selectedOriginId={selectedOriginId}
          selectedDestinationId={selectedDestinationId}
          selectedMode={selectedMode}
          showVulnerability={showVulnerability}
          replayMode={state.replayMode}
          backendStatus={state.backendStatus}
          onOriginChange={setSelectedOriginId}
          onDestinationChange={setSelectedDestinationId}
          onModeChange={setSelectedMode}
          onToggleVulnerability={setShowVulnerability}
          onCalculate={calculateRoutes}
          onReplay={replayTelemetry}
        />

        {routeError ? <p className="error-banner">{routeError}</p> : null}
        {isLoading ? <p className="loading-banner">Loading local heat layers...</p> : null}

        <div className="main-grid">
          <MapPanel state={state} featuredRoute={featuredRoute} showVulnerability={showVulnerability} />
          <div className="sidebar-stack">
            <RouteCards routes={state.routeOptions} selectedMode={selectedMode} />
            <TelemetryPanel telemetry={state.telemetryPoints} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
