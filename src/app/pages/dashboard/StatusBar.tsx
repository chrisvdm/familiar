const StatusBar = ({
  plan,
  actionCount,
  freeActionsUsed,
  freeActionsRemaining,
  toolCount,
  threadCount,
}: {
  plan: string;
  actionCount: number;
  freeActionsUsed: number;
  freeActionsRemaining: number | null;
  toolCount: number;
  threadCount: number;
}) => (
  <div className="status-bar">
    <div className="status-metric">
      <p className="status-metric-label">Plan</p>
      <p className="status-metric-value">{plan}</p>
    </div>
    <div className="status-metric">
      <p className="status-metric-label">Actions</p>
      <p className="status-metric-value">{actionCount}</p>
    </div>
    <div className="status-metric">
      <p className="status-metric-label">Tools / Threads</p>
      <p className="status-metric-value">
        {toolCount} / {threadCount}
      </p>
    </div>
  </div>
);

export default StatusBar;
