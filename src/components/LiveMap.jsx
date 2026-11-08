import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import routingService from "../services/routingService";
import { useBusHeading } from "../hooks/useBusHeading";
import { bearingToCssRotation, normalizeAngle } from "../utils/bearingUtils";

// ─────────────────────────────────────────────────────────────────────────────
// School Bus SVG — front faces EAST (right) in the SVG coordinate system.
// bearingToCssRotation() converts geographic bearing → correct CSS angle.
// ─────────────────────────────────────────────────────────────────────────────
const SCHOOL_BUS_SVG = `
<svg width="58" height="28" viewBox="0 0 58 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Tires / Wheels -->
  <rect x="7"  y="0.5"  width="8" height="2.5" rx="1" fill="#111827"/>
  <rect x="42" y="0.5"  width="8" height="2.5" rx="1" fill="#111827"/>
  <rect x="7"  y="25"   width="8" height="2.5" rx="1" fill="#111827"/>
  <rect x="42" y="25"   width="8" height="2.5" rx="1" fill="#111827"/>

  <!-- Bus Body (School Bus Yellow) -->
  <rect x="2" y="2.5" width="53" height="23" rx="5" fill="#F59E0B" stroke="#D97706" stroke-width="1.2"/>

  <!-- Front Hood Contour (front = right / East) -->
  <path d="M49 4 C54 7, 54 21, 49 24" stroke="#B45309" stroke-width="1.2" fill="#FBBF24"/>

  <!-- Black Rub Rails -->
  <line x1="6" y1="4.5"  x2="47" y2="4.5"  stroke="#1F2937" stroke-width="1.2"/>
  <line x1="6" y1="23.5" x2="47" y2="23.5" stroke="#1F2937" stroke-width="1.2"/>

  <!-- Windshield (front curved dark glass) -->
  <path d="M42 5.5 L47 7 L47 21 L42 22.5 Z" fill="#0F172A" stroke="#334155" stroke-width="0.8"/>
  <!-- Rear Glass -->
  <rect x="4" y="6.5" width="2.5" height="15" rx="1" fill="#0F172A"/>

  <!-- Side Windows (Sky Blue) -->
  <rect x="9"    y="5.5" width="4.5" height="2.5" rx="0.5" fill="#38BDF8"/>
  <rect x="15.5" y="5.5" width="4.5" height="2.5" rx="0.5" fill="#38BDF8"/>
  <rect x="22"   y="5.5" width="4.5" height="2.5" rx="0.5" fill="#38BDF8"/>
  <rect x="28.5" y="5.5" width="4.5" height="2.5" rx="0.5" fill="#38BDF8"/>
  <rect x="35"   y="5.5" width="4.5" height="2.5" rx="0.5" fill="#38BDF8"/>

  <rect x="9"    y="20" width="4.5" height="2.5" rx="0.5" fill="#38BDF8"/>
  <rect x="15.5" y="20" width="4.5" height="2.5" rx="0.5" fill="#38BDF8"/>
  <rect x="22"   y="20" width="4.5" height="2.5" rx="0.5" fill="#38BDF8"/>
  <rect x="28.5" y="20" width="4.5" height="2.5" rx="0.5" fill="#38BDF8"/>
  <rect x="35"   y="20" width="4.5" height="2.5" rx="0.5" fill="#38BDF8"/>

  <!-- White Roof Panel with SCHOOL BUS text -->
  <rect x="16" y="9.5" width="20" height="9" rx="2" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="0.6"/>
  <text x="26" y="15.8" font-size="4.2" font-family="'Arial Black', Arial, sans-serif"
        font-weight="900" fill="#0F172A" text-anchor="middle" letter-spacing="0.4">SCHOOL BUS</text>

  <!-- Headlights (front = right) -->
  <circle cx="53.5" cy="6"  r="1.5" fill="#FEF08A"/>
  <circle cx="53.5" cy="22" r="1.5" fill="#FEF08A"/>

  <!-- Taillights (rear = left) -->
  <rect x="2" y="5"  width="1.2" height="3" rx="0.5" fill="#EF4444"/>
  <rect x="2" y="20" width="1.2" height="3" rx="0.5" fill="#EF4444"/>

  <!-- Side Mirrors (front side) -->
  <rect x="44" y="1"    width="3" height="1.8" rx="0.5" fill="#1F2937"/>
  <rect x="44" y="25.2" width="3" height="1.8" rx="0.5" fill="#1F2937"/>
</svg>`;

// ─────────────────────────────────────────────────────────────────────────────
// Route Stop Icon
// ─────────────────────────────────────────────────────────────────────────────
const createStopIcon = (order = 1, isDestination = false) => {
  const bg = isDestination ? "#ea580c" : "#2563eb";
  const icon = isDestination ? "🏁" : `${order}`;
  return L.divIcon({
    html: `<div style="
      background-color:${bg};width:28px;height:28px;border-radius:50%;
      border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.3);
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-weight:800;font-size:${isDestination ? "13px" : "11px"};
      cursor:pointer;">${icon}</div>`,
    className: "custom-route-stop-pin",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// createRotatingBusIcon — builds a Leaflet divIcon with the CSS rotation baked in.
// Called whenever cssRotation, isSelected, or bus metadata changes.
// ─────────────────────────────────────────────────────────────────────────────
const createRotatingBusIcon = (bus = {}, cssRotation = 0, isSelected = false) => {
  const isMoving = (bus.speed && bus.speed > 0) || bus.status === "ON_ROUTE";
  const busNumber = bus.busNumber || bus.number || "BUS";
  const speed = Math.round(bus.speed ?? 0);

  const html = `
    <div class="school-bus-marker-container${isSelected ? " selected" : ""}" style="
      position:relative;width:72px;height:72px;
      display:flex;align-items:center;justify-content:center;cursor:pointer;">

      <!-- Registration & Speed pill -->
      <div style="
        position:absolute;top:-14px;left:50%;transform:translateX(-50%);
        white-space:nowrap;
        background:${isSelected ? "#0f172a" : "rgba(15,23,42,0.88)"};
        color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        font-size:10px;font-weight:700;padding:2px 7px;border-radius:12px;
        box-shadow:0 2px 8px rgba(0,0,0,.3);
        border:1px solid ${isSelected ? "#f59e0b" : "rgba(255,255,255,.25)"};
        display:flex;align-items:center;gap:5px;z-index:10;pointer-events:none;">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;
          background:${isMoving ? "#22c55e" : "#f59e0b"};"></span>
        <span>${busNumber}</span>
        <span style="color:#94a3b8;font-weight:500;">${speed} km/h</span>
      </div>

      <!-- Pulse ring for active buses -->
      ${isMoving ? `
      <div style="
        position:absolute;width:58px;height:58px;border-radius:50%;
        background:rgba(245,158,11,.18);
        border:1.5px solid rgba(245,158,11,.4);
        animation:bus-radar-pulse 2s cubic-bezier(.2,.8,.2,1) infinite;
        pointer-events:none;"></div>` : ""}

      <!-- Bus SVG rotated to face direction of travel -->
      <div style="
        transform:rotate(${cssRotation}deg);
        transform-origin:center center;
        filter:drop-shadow(0 4px 8px rgba(0,0,0,.35));
        display:flex;align-items:center;justify-content:center;
        will-change:transform;">
        ${SCHOOL_BUS_SVG}
      </div>
    </div>`;

  return L.divIcon({
    html,
    className: "yellow-school-bus-marker",
    iconSize: [72, 72],
    iconAnchor: [36, 36],
    popupAnchor: [0, -36],
  });
};

const EMPTY_ROUTE = [];

// ─────────────────────────────────────────────────────────────────────────────
// RotatingBusMarker — individual bus marker with live heading animation.
// Keeps its own animated rotation state via useBusHeading.
// ─────────────────────────────────────────────────────────────────────────────
function RotatingBusMarker({ bus, isSelected, roadPolyline = EMPTY_ROUTE, onSelectBus }) {
  const markerRef = useRef(null);

  const lat = bus?.latitude ?? bus?.lat;
  const lng = bus?.longitude ?? bus?.lng;

  // GPS staleness check: > 3 minutes old or explicitly stale
  const isStale =
    Boolean(bus?.isStale) ||
    Boolean(bus?.gpsTime && Date.now() - new Date(bus.gpsTime).getTime() > 180000);

  const { cssRotation, geoBearing } = useBusHeading({
    bus,
    routeCoords: roadPolyline,
    isStale,
  });

  // Rebuild and apply the icon whenever rotation, selection, or bus data changes
  useEffect(() => {
    if (!markerRef.current) return;
    const icon = createRotatingBusIcon(bus, cssRotation, isSelected);
    markerRef.current.setIcon(icon);
  }, [cssRotation, isSelected, bus?.speed, bus?.status, bus?.busNumber, bus?.number]);

  if (lat == null || lng == null) return null;

  return (
    <Marker
      ref={markerRef}
      position={[lat, lng]}
      icon={createRotatingBusIcon(bus, cssRotation, isSelected)}
      eventHandlers={{ click: () => onSelectBus && onSelectBus(bus) }}
    >
      <Popup>
        <div style={{ minWidth: "210px", padding: "4px" }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            alignItems: "center", borderBottom: "1px solid #f1f5f9",
            paddingBottom: "6px", marginBottom: "6px",
          }}>
            <div>
              <h6 style={{ margin: 0, fontWeight: 800, color: "#0f172a", fontSize: "14px" }}>
                🚌 {bus.busNumber || bus.number}
              </h6>
              <small style={{ color: "#64748b", fontSize: "11px" }}>
                {bus.busName || bus.name || "Campus Shuttle"}
              </small>
            </div>
            <span style={{
              fontSize: "10px", fontWeight: 700, padding: "2px 8px",
              borderRadius: "12px",
              background: bus.status === "ON_ROUTE" ? "#dcfce7" : "#f1f5f9",
              color: bus.status === "ON_ROUTE" ? "#15803d" : "#475569",
            }}>
              {bus.status || "STANDBY"}
            </span>
          </div>

          <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Speed:</span>
              <b style={{ color: "#0284c7" }}>{Math.round(bus.speed ?? 0)} km/h</b>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Heading:</span>
              <span>{Math.round(normalizeAngle(geoBearing ?? bus.heading ?? 0))}° ({compassDirection(geoBearing ?? bus.heading ?? 0)})</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#64748b" }}>Driver:</span>
              <span style={{ fontWeight: 600 }}>{bus.driverName || "Driver Assigned"}</span>
            </div>
            {bus.driverPhone && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#64748b" }}>Phone:</span>
                <a href={`tel:${bus.driverPhone}`} style={{ color: "#2563eb", textDecoration: "none" }}>
                  {bus.driverPhone}
                </a>
              </div>
            )}
          </div>
        </div>
      </Popup>
    </Marker>
  );
}

/** Returns compass cardinal/intercardinal from bearing degrees */
function compassDirection(bearing) {
  const dirs = ["N","NE","E","SE","S","SW","W","NW","N"];
  return dirs[Math.round(normalizeAngle(bearing) / 45)];
}

// ─────────────────────────────────────────────────────────────────────────────
// AutoMapFocus — fits map bounds when route/bus selection changes
// ─────────────────────────────────────────────────────────────────────────────
function AutoMapFocus({ selectedBusId, routeCoordinates, busCoordinates, focusTrigger }) {
  const map = useMap();
  const focusedBusIdRef = useRef(null);
  const routeFittedBusIdRef = useRef(null);
  const lastTriggerRef = useRef(0);

  useEffect(() => {
    if (!selectedBusId) {
      focusedBusIdRef.current = null;
      routeFittedBusIdRef.current = null;
    } else if (focusedBusIdRef.current !== selectedBusId) {
      focusedBusIdRef.current = selectedBusId;
      routeFittedBusIdRef.current = null;
      if (busCoordinates?.[0] && busCoordinates?.[1]) {
        map.setView(busCoordinates, 14, { animate: true, duration: 0.7 });
      }
    }
  }, [selectedBusId, busCoordinates, map]);

  useEffect(() => {
    if (!selectedBusId) return;
    const isManualTrigger = focusTrigger !== lastTriggerRef.current;
    const needsRouteFit = routeFittedBusIdRef.current !== selectedBusId;
    if (routeCoordinates?.length > 1 && (needsRouteFit || isManualTrigger)) {
      routeFittedBusIdRef.current = selectedBusId;
      lastTriggerRef.current = focusTrigger;
      try {
        const bounds = L.latLngBounds(routeCoordinates);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [70, 70], maxZoom: 15, animate: true, duration: 0.9 });
        }
      } catch (e) {
        console.warn("fitBounds failed:", e);
      }
    }
  }, [selectedBusId, routeCoordinates, focusTrigger, map]);

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LiveMap — main export
// ─────────────────────────────────────────────────────────────────────────────
export default function LiveMap({
  buses = [],
  selectedBusId = null,
  routeStops = [],
  historyTrail = [],
  alternativePolyline = [],
  showTrail = true,
  onSelectBus,
  focusTrigger = 0,
}) {
  const defaultCenter = [16.3067, 80.4365];
  const [roadPolyline, setRoadPolyline] = useState([]);

  const selectedBus = buses.find(
    (b) => b.id === Number(selectedBusId) || b.busId === Number(selectedBusId)
  );

  const busCenter =
    selectedBus?.latitude && selectedBus?.longitude
      ? [selectedBus.latitude, selectedBus.longitude]
      : buses[0]?.latitude && buses[0]?.longitude
      ? [buses[0].latitude, buses[0].longitude]
      : defaultCenter;

  // Fetch road geometry for the selected bus's route
  useEffect(() => {
    let alive = true;
    async function load() {
      if (!selectedBusId || !routeStops || routeStops.length < 2) {
        setRoadPolyline([]);
        return;
      }
      const data = await routingService.fetchRoadRoute(routeStops);
      if (alive && data?.coordinates?.length > 0) {
        setRoadPolyline(data.coordinates);
      }
    }
    load();
    return () => { alive = false; };
  }, [selectedBusId, routeStops]);

  const trailPolyline = showTrail
    ? historyTrail
        .filter((h) => h.latitude && h.longitude)
        .map((h) => [h.latitude, h.longitude])
    : [];

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", overflow: "hidden", background: "#e2e8f0" }}>
      <style>{`
        @keyframes bus-radar-pulse {
          0%   { transform: scale(0.85); opacity: 0.9; }
          100% { transform: scale(1.65); opacity: 0; }
        }
        .yellow-school-bus-marker { background: transparent !important; border: none !important; }
        .yellow-school-bus-marker.selected .school-bus-marker-container { filter: drop-shadow(0 0 8px #f59e0b); }
      `}</style>

      <MapContainer
        center={busCenter}
        zoom={13}
        scrollWheelZoom={true}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <AutoMapFocus
          selectedBusId={selectedBusId}
          routeCoordinates={roadPolyline.length > 1 ? roadPolyline : null}
          busCoordinates={
            selectedBus?.latitude && selectedBus?.longitude
              ? [selectedBus.latitude, selectedBus.longitude]
              : null
          }
          focusTrigger={focusTrigger}
        />

        {/* Selected bus road-following route — blue */}
        {selectedBusId && roadPolyline.length > 1 && (
          <Polyline
            positions={roadPolyline}
            pathOptions={{ color: "#1a68ea", weight: 5, opacity: 0.88, lineCap: "round", lineJoin: "round" }}
          />
        )}

        {/* Alternative/detour route — amber dashed */}
        {selectedBusId && alternativePolyline?.length > 1 && (
          <Polyline
            positions={alternativePolyline}
            pathOptions={{ color: "#f59e0b", weight: 5, opacity: 0.95, dashArray: "8, 6", lineCap: "round" }}
          />
        )}

        {/* GPS history trail — green dashed */}
        {selectedBusId && trailPolyline.length > 1 && (
          <Polyline
            positions={trailPolyline}
            pathOptions={{ color: "#10b981", weight: 4, opacity: 0.9, dashArray: "6, 4" }}
          />
        )}

        {/* Route stop markers (only for selected bus) */}
        {selectedBusId &&
          routeStops.map((stop, idx) => {
            const isDest = idx === routeStops.length - 1 && routeStops.length > 1;
            const stopLat = stop.latitude || stop.lat;
            const stopLng = stop.longitude || stop.lng;
            if (!stopLat || !stopLng) return null;
            return (
              <Marker
                key={`stop-${stop.stopId || stop.id || idx}`}
                position={[stopLat, stopLng]}
                icon={createStopIcon(stop.stopOrder || idx + 1, isDest)}
              >
                <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>
                  <div style={{ fontSize: "12px", fontWeight: 600, padding: "2px 4px" }}>
                    <div>🚏 {stop.stopName || stop.name || `Stop ${idx + 1}`}</div>
                    {stop.address && (
                      <div style={{ color: "#64748b", fontSize: "10px", maxWidth: "190px" }}>{stop.address}</div>
                    )}
                    {stop.arrivalTime && (
                      <div style={{ color: "#059669", fontSize: "11px", marginTop: "2px" }}>
                        ⏰ Expected: {stop.arrivalTime}
                      </div>
                    )}
                  </div>
                </Tooltip>
              </Marker>
            );
          })}

        {/* All visible bus markers — each with its own smooth rotation */}
        {buses.map((bus) => {
          if (!bus) return null;
          const lat = bus.latitude ?? bus.lat;
          const lng = bus.longitude ?? bus.lng;
          if (lat == null || lng == null) return null;

          const isSelected =
            selectedBusId !== null &&
            (Number(selectedBusId) === Number(bus.busId) ||
              Number(selectedBusId) === Number(bus.id));

          return (
            <RotatingBusMarker
              key={`bus-${bus.id ?? bus.busId}`}
              bus={bus}
              isSelected={isSelected}
              roadPolyline={isSelected ? roadPolyline : EMPTY_ROUTE}
              onSelectBus={onSelectBus}
            />
          );
        })}
      </MapContainer>
    </div>
  );
}
