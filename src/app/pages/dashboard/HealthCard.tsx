const HealthCard = ({
  overall,
  baseUrlConfigured,
  recentFailures,
  toolCount,
  activeTools,
  recentCallbacks,
  deliveryFailures,
}: {
  overall: string;
  baseUrlConfigured: boolean;
  recentFailures: number;
  toolCount: number;
  activeTools: number;
  recentCallbacks: number;
  deliveryFailures: number;
}) => {
  const statusClass =
    overall === "healthy"
      ? "health-status--healthy"
      : overall === "warning"
        ? "health-status--warning"
        : "health-status--degraded";

  return (
    <div className="health-card">
      <div className="health-metric">
        <span className="health-metric-label">Overall status</span>
        <span className={`health-status ${statusClass}`}>{overall}</span>
      </div>
      <div className="health-metric">
        <span className="health-metric-label">Executor base URL</span>
        <span className={`health-status ${baseUrlConfigured ? "health-status--healthy" : "health-status--warning"}`}>
          {baseUrlConfigured ? "configured" : "not set"}
        </span>
      </div>
      <div className="health-metric">
        <span className="health-metric-label">Tool execution failures (24h)</span>
        <span className={`health-status ${recentFailures === 0 ? "health-status--healthy" : recentFailures > 3 ? "health-status--degraded" : "health-status--warning"}`}>
          {recentFailures}
        </span>
      </div>
      <div className="health-metric">
        <span className="health-metric-label">Active tools</span>
        <span className="health-status health-status--healthy">
          {activeTools} / {toolCount}
        </span>
      </div>
      <div className="health-metric">
        <span className="health-metric-label">Recent callbacks (24h)</span>
        <span className="health-status health-status--healthy">
          {recentCallbacks}
        </span>
      </div>
      <div className="health-metric">
        <span className="health-metric-label">Delivery failures (24h)</span>
        <span className={`health-status ${deliveryFailures === 0 ? "health-status--healthy" : deliveryFailures > 3 ? "health-status--degraded" : "health-status--warning"}`}>
          {deliveryFailures}
        </span>
      </div>
    </div>
  );
};

export default HealthCard;
