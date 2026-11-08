import React, { useState } from "react";
import { RouteCard, type RouteInfo } from "./RouteCard";

type TabKey = "active" | "parked" | "all";

const TABS: { key: TabKey; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "parked", label: "Parked" },
  { key: "all", label: "All" },
];

export const sampleRoutes: RouteInfo[] = [];

interface RouteListPanelProps {
  routes?: RouteInfo[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onClose?: () => void;
}

export function RouteListPanel({
  routes = [],
  selectedId: controlledId,
  onSelect,
  onClose,
}: RouteListPanelProps) {
  const [tab, setTab] = useState<TabKey>("active");
  const [internalId, setInternalId] = useState<string | null>(null);

  const selectedId = controlledId !== undefined ? controlledId : internalId;
  const handleSelect = (id: string) => {
    setInternalId(id);
    onSelect?.(id);
  };

  const activeCount = routes.filter((r) => r.status === "active").length;
  const parkedCount = routes.filter((r) => r.status === "parked" || r.status === "inactive").length;
  const allCount = routes.length;

  const visible =
    tab === "all"
      ? routes
      : tab === "active"
      ? routes.filter((r) => r.status === "active")
      : routes.filter((r) => r.status === "parked" || r.status === "inactive");

  return (
    <aside className="behance-fleet-panel">
      {/* Behance Clean Tabs Bar on Solid Royal Blue with Close Button */}
      <div className="behance-tabs-bar" role="tablist">
        <div className="behance-tabs-group">
          {TABS.map(({ key, label }) => {
            const isActive = tab === key;
            const count = key === "active" ? activeCount : key === "parked" ? parkedCount : allCount;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(key)}
                className={`behance-tab-button ${isActive ? "active" : ""}`}
              >
                <span>{label}</span>
                <span className="behance-tab-count">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Explicit Close Button inside panel */}
        {onClose && (
          <button
            type="button"
            className="behance-panel-close-btn"
            onClick={onClose}
            title="Close panel"
            aria-label="Close panel"
          >
            <i className="bi bi-x-lg" />
          </button>
        )}
      </div>

      {/* Cards Scroll Container */}
      <div className="behance-cards-scroller">
        {visible.length === 0 ? (
          <div className="behance-empty-state">
            <p>No buses in this category.</p>
          </div>
        ) : (
          visible.map((r) => (
            <RouteCard
              key={r.id}
              data={r}
              selected={String(r.id) === String(selectedId)}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
}

export default RouteListPanel;
