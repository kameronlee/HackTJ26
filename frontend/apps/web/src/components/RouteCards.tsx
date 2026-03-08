import type { RouteOption } from '../lib/types';

type RouteCardsProps = {
  routes: RouteOption[];
  selectedMode: 'fastest' | 'coolest' | 'balanced';
};

export function RouteCards({ routes, selectedMode }: RouteCardsProps) {
  if (!routes.length) {
    return (
      <section className="panel cards-panel empty-state">
        <h2>Ready for a route run</h2>
        <p>Select two D.C. landmarks, compute routes, and compare thermal exposure before you walk.</p>
      </section>
    );
  }

  return (
    <section className="cards-grid">
      {routes.map((route) => {
        const active = route.id === selectedMode;
        return (
          <article key={route.id} className={`panel route-card ${active ? 'active' : ''}`}>
            <div className="route-card-top">
              <div>
                <span className="eyebrow">{route.label}</span>
                <h2>{Math.round(route.durationMin)} min</h2>
              </div>
              <span className="score-chip">{route.tradeoffScore >= 0 ? '+' : ''}{route.tradeoffScore} tradeoff</span>
            </div>
            <dl>
              <div>
                <dt>Distance</dt>
                <dd>{(route.distanceM / 1000).toFixed(2)} km</dd>
              </div>
              <div>
                <dt>Heat score</dt>
                <dd>{route.heatScore.toFixed(1)}</dd>
              </div>
              <div>
                <dt>Shade</dt>
                <dd>{route.shadePct.toFixed(0)}%</dd>
              </div>
              <div>
                <dt>Tracts crossed</dt>
                <dd>{route.vulnerabilityTracts.join(', ')}</dd>
              </div>
            </dl>
          </article>
        );
      })}
    </section>
  );
}
