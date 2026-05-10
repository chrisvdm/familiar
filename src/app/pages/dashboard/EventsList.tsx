type AuditEvent = {
  event: string;
  requestId?: string;
  status?: string;
  at: string;
};

const EventsList = ({ events }: { events: AuditEvent[] }) => (
  <div className="events-list">
    {events.length === 0 ? (
      <p className="event-row">
        <span className="event-name">No events yet.</span>
      </p>
    ) : (
      events.map((e, i) => (
        <div key={i} className="event-row">
          <span className="event-time">
            {new Date(e.at).toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="event-name">{e.event}</span>
          <span
            className={`event-status ${e.status === "ok" ? "event-status--ok" : "event-status--error"}`}
          >
            {e.status}
          </span>
        </div>
      ))
    )}
  </div>
);

export default EventsList;
