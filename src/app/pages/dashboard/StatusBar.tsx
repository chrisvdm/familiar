const StatusBar = ({
  toolCount,
  threadCount,
}: {
  toolCount: number;
  threadCount: number;
}) => (
  <div className="status-bar">
    <div className="status-metric">
      <p className="status-metric-label">Tools</p>
      <p className="status-metric-value">{toolCount}</p>
    </div>
    <div className="status-metric">
      <p className="status-metric-label">Threads</p>
      <p className="status-metric-value">{threadCount}</p>
    </div>
  </div>
);

export default StatusBar;
