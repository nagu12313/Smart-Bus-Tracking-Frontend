import React from "react";
import { Bus } from "lucide-react";

/**
 * Bulletproof SVG Timeline component
 * Vector rendering: Origin dot (Blue) -> Solid blue travelled line -> Green live bus indicator -> Dotted remaining line -> Destination dot
 */
function Timeline({ progress = 0.5, dark = false }) {
  // Clamped between 0.08 and 0.92 so the bus marker stays cleanly within the timeline
  const clamped = Math.max(0.08, Math.min(0.92, progress));
  const busY = 8 + 48 * clamped;

  return (
    <div className="behance-timeline-wrap" aria-hidden="true">
      <svg width="16" height="64" viewBox="0 0 16 64" fill="none">
        {/* Travelled solid blue line */}
        <line x1="8" y1="8" x2="8" y2={busY} stroke="#0B6CFF" strokeWidth="2.5" strokeLinecap="round" />

        {/* Remaining dotted line */}
        <line
          x1="8"
          y1={busY}
          x2="8"
          y2="56"
          stroke={dark ? "rgba(255, 255, 255, 0.35)" : "#cbd5e1"}
          strokeWidth="2.5"
          strokeDasharray="2 3"
          strokeLinecap="round"
        />

        {/* Origin stop dot (Blue) */}
        <circle cx="8" cy="8" r="4" fill="#0B6CFF" />

        {/* Destination stop dot (Light Blue) */}
        <circle cx="8" cy="56" r="3.5" fill="#7FB0FF" />

        {/* Dynamic moving bus indicator with soft glow halo */}
        <circle cx="8" cy={busY} r="6" fill="#22C55E" fillOpacity="0.28" />
        <circle cx="8" cy={busY} r="4" fill="#22C55E" stroke="#ffffff" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

export function RouteCard({ data, selected = false, onSelect }) {
  const { id, route, busNumber, from, to, speed, eta, status } = data;
  const isParked =
    (status === "parked" || status === "inactive" || String(status).toLowerCase() === "parked") &&
    (!speed || speed <= 0);
  const progress = data.progress !== undefined ? data.progress : isParked ? 0 : 0.55;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect?.(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(id);
        }
      }}
      className={`behance-route-card ${selected ? "is-selected" : ""} ${isParked ? "is-parked" : ""}`}
    >
      {/* Top Header: Bus icon + Route name + Bus plate */}
      <div className="behance-card-header">
        <div className="behance-bus-badge">
          <Bus size={15} />
        </div>
        <div className="behance-card-title" title={route}>
          {route}
        </div>
        <div className="behance-card-plate">{busNumber}</div>
      </div>

      {/* Body: Timeline + Stops (Left) + Speed & Calculated ETA (Right) */}
      <div className="behance-card-body">
        <Timeline progress={progress} dark={selected} />

        {/* Stops (From / To) */}
        <div className="behance-stops-col">
          <div className="behance-field">
            <span className="behance-field-label">From</span>
            <span className="behance-field-val" title={from}>{from}</span>
          </div>
          <div className="behance-field">
            <span className="behance-field-label">To</span>
            <span className="behance-field-val" title={to}>{to}</span>
          </div>
        </div>

        {/* Dynamic Speed & Calculated Real-time ETA */}
        <div className="behance-telemetry-col">
          <div className="behance-field">
            <span className="behance-field-label">Speed</span>
            <span className="behance-field-val text-speed">
              {isParked ? "0 km/h" : `${speed ?? 0} km/h`}
            </span>
          </div>
          <div className="behance-field">
            <span className="behance-field-label">Est. Arrival</span>
            <span className="behance-field-val text-eta">
              {isParked ? "Parked" : (eta || "Parked")}
            </span>
          </div>
        </div>
      </div>

      {/* Verified Location & Nearby Landmark Badge */}
      {data.locationName && (
        <div style={{
          padding: "5px 12px 6px",
          borderTop: selected ? "1px solid rgba(255,255,255,0.15)" : "1px solid #f1f5f9",
          background: selected ? "rgba(0,0,0,0.12)" : "#fafafa",
          fontSize: "11px",
          display: "flex",
          flexDirection: "column",
          gap: "2px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span>📍</span>
            <span
              style={{
                fontWeight: 600,
                color: selected ? "#f1f5f9" : "#0f172a",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1
              }}
              title={data.locationName}
            >
              {data.locationName}
            </span>
            {data.isRoadMatched && (
              <span style={{
                fontSize: "9px",
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: "10px",
                background: selected ? "#38bdf8" : "#e0f2fe",
                color: selected ? "#0f172a" : "#0284c7",
                whiteSpace: "nowrap"
              }}>
                Road Aligned
              </span>
            )}
          </div>
          {data.nearbyLandmark && (
            <div style={{
              fontSize: "10px",
              color: selected ? "#cbd5e1" : "#64748b",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              paddingLeft: "17px"
            }} title={data.nearbyLandmark}>
              🏛️ {data.nearbyLandmark}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RouteCard;
