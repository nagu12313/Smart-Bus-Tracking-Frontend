import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Tooltip,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import routingService from "../services/routingService";
import { useBusHeading } from "../hooks/useBusHeading";
import { bearingToCssRotation, normalizeAngle } from "../utils/bearingUtils";
import SmoothAnimatedBusMarker from "./SmoothAnimatedBusMarker";

// ─────────────────────────────────────────────────────────────────────────────
// School Bus SVG — front faces EAST (right) in the SVG coordinate system.
// bearingToCssRotation() converts geographic bearing → correct CSS angle.
// ─────────────────────────────────────────────────────────────────────────────
export const SCHOOL_BUS_SVG = `
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
// Raw GPS Pin Icon — displayed when raw GPS coordinates differ from road-snapped
// ─────────────────────────────────────────────────────────────────────────────
const createRawGpsIcon = () =>
  L.divIcon({
    html: `<div style="width:10px;height:10px;background:#3b82f6;border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 6px rgba(37,99,235,0.6);"></div>`,
    className: "raw-gps-dot-marker",
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });

// ─────────────────────────────────────────────────────────────────────────────
// createRotatingBusIcon — builds a Leaflet divIcon with the CSS rotation baked in.
// Called whenever cssRotation, isSelected, or bus metadata changes.
// ─────────────────────────────────────────────────────────────────────────────
export const createRotatingBusIcon = (bus = {}, cssRotation = 0, isSelected = false) => {
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
        <span class="bus-speed-text" style="color:#94a3b8;font-weight:500;">${speed} km/h</span>
      </div>

      <!-- Bus SVG rotated to face direction of travel -->
      <div class="bus-svg-rotating" style="
        transform:rotate(${cssRotation}deg);
        transform-origin:center center;
        filter:drop-shadow(0 4px 8px rgba(0,0,0,.35));
        display:flex;align-items:center;justify-content:center;
        will-change:transform;
        transform-style:preserve-3d;
        -webkit-transform-style:preserve-3d;
        backface-visibility:hidden;
        -webkit-backface-visibility:hidden;
        transition:none !important;">
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
// Supports both raw device GPS accuracy display and reliable road-snapped alignment.
// ─────────────────────────────────────────────────────────────────────────────
function RotatingBusMarker({ bus, isSelected, roadPolyline = EMPTY_ROUTE, onSelectBus }) {
  const markerRef = useRef(null);

  const displayLat = (bus?.isRoadMatched && bus?.snappedLatitude != null) ? bus.snappedLatitude : (bus?.latitude ?? bus?.lat);
  const displayLng = (bus?.isRoadMatched && bus?.snappedLongitude != null) ? bus.snappedLongitude : (bus?.longitude ?? bus?.lng);
  const rawLat = bus?.rawLatitude ?? bus?.latitude ?? bus?.lat;
  const rawLng = bus?.rawLongitude ?? bus?.longitude ?? bus?.lng;

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

  if (displayLat == null || displayLng == null) return null;

  const hasSnappedOffset =
    Boolean(bus?.isRoadMatched) &&
    rawLat != null &&
    rawLng != null &&
    (Math.abs(rawLat - displayLat) > 0.00008 || Math.abs(rawLng - displayLng) > 0.00008);

  const accuracyMeters = typeof bus?.accuracy === "number" && bus.accuracy > 0 ? bus.accuracy : null;

  return (
    <React.Fragment>
      {/* Real Device GPS Accuracy Radius Circle (Visible when bus is selected) */}
      {isSelected && accuracyMeters && accuracyMeters < 800 && (
        <Circle
          center={[rawLat, rawLng]}
          radius={accuracyMeters}
          pathOptions={{
            color: "#3b82f6",
            fillColor: "#60a5fa",
            fillOpacity: 0.12,
            weight: 1.5,
            dashArray: "4, 4",
          }}
        />
      )}

      {/* Visual connection line between Raw Device GPS & Road-Snapped Display Position */}
      {isSelected && hasSnappedOffset && (
        <>
          <Polyline
            positions={[
              [rawLat, rawLng],
              [displayLat, displayLng],
            ]}
            pathOptions={{
              color: "#94a3b8",
              weight: 1.5,
              dashArray: "3, 3",
              opacity: 0.8,
            }}
          />
          <Marker
            position={[rawLat, rawLng]}
            icon={createRawGpsIcon()}
          >
            <Tooltip direction="bottom" offset={[0, 6]}>
              <div style={{ fontSize: "11px", fontWeight: 600 }}>
                📍 Raw Device GPS (±{Math.round(accuracyMeters || 10)}m)
              </div>
            </Tooltip>
          </Marker>
        </>
      )}

      {/* Primary Yellow Top-View Bus Marker */}
      <Marker
        ref={markerRef}
        position={[displayLat, displayLng]}
        icon={createRotatingBusIcon(bus, cssRotation, isSelected)}
        eventHandlers={{ click: () => onSelectBus && onSelectBus(bus) }}
      >
        <Popup>
          <div style={{ minWidth: "240px", padding: "4px" }}>
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

            <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "5px" }}>
              {/* Verified Location Address */}
              <div style={{ background: "#f8fafc", padding: "6px 8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <div style={{ color: "#475569", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Verified Location
                </div>
                <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "12px", marginTop: "1px" }}>
                  {bus.locationName || "Location verified via GPS"}
                </div>
                {bus.nearbyLandmark && (
                  <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px" }}>
                    🏛️ <i>{bus.nearbyLandmark}</i>
                  </div>
                )}
              </div>

              {/* Accuracy & Road Alignment Status */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#64748b" }}>GPS Accuracy:</span>
                <span style={{
                  fontSize: "11px", fontWeight: 700,
                  color: (accuracyMeters && accuracyMeters <= 20) ? "#16a34a" : "#d97706"
                }}>
                  {accuracyMeters ? `±${Math.round(accuracyMeters)}m (${bus.accuracyDescription || "Good"})` : "GPS Locked"}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#64748b" }}>Map Mode:</span>
                <span style={{ fontSize: "11px", fontWeight: 600, color: bus.isRoadMatched ? "#0284c7" : "#475569" }}>
                  {bus.isRoadMatched ? `🛣️ Road-Snapped (${bus.roadName || "Assigned Route"})` : "📡 Direct GPS"}
                </span>
              </div>

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

              {rawLat != null && rawLng != null && (
                <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "4px", fontSize: "10px", color: "#94a3b8" }}>
                  GPS: {Number(rawLat).toFixed(5)}°, {Number(rawLng).toFixed(5)}°
                </div>
              )}
            </div>
          </div>
        </Popup>
      </Marker>
    </React.Fragment>
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

  const busLat = busCoordinates?.[0];
  const busLng = busCoordinates?.[1];

  useEffect(() => {
    if (!selectedBusId) {
      focusedBusIdRef.current = null;
      routeFittedBusIdRef.current = null;
    } else if (focusedBusIdRef.current !== selectedBusId) {
      focusedBusIdRef.current = selectedBusId;
      routeFittedBusIdRef.current = null;
      if (busLat != null && busLng != null) {
        map.setView([busLat, busLng], 14, { animate: true, duration: 0.7 });
      }
    }
  }, [selectedBusId, busLat, busLng, map]);

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
// isVehicleActive — checks if a bus is actively in transit / on route
// Strict filter: parked, standby, stopped, inactive, or stale buses with zero speed are hidden.
// ─────────────────────────────────────────────────────────────────────────────
export function isVehicleActive(bus) {
  if (!bus) return false;
  const lat = bus.latitude ?? bus.lat;
  const lng = bus.longitude ?? bus.lng;
  if (lat == null || lng == null) return false;

  const status = String(bus.status || "").toUpperCase();
  const speed = Number(bus.speed ?? 0);

  // Stale guard: if stale with zero speed, vehicle is not actively moving
  if (bus.isStale && speed <= 0) return false;

  const isExplicitlyParkedOrInactive =
    status === "PARKED" ||
    status === "INACTIVE" ||
    status === "STANDBY" ||
    status === "STOPPED" ||
    status === "MAINTENANCE" ||
    status === "COMPLETED";

  // If bus is explicitly marked parked/inactive and not moving, exclude from map
  if (isExplicitlyParkedOrInactive && speed <= 0 && status !== "ON_ROUTE" && status !== "IN_PROGRESS") {
    return false;
  }

  // Active condition: explicitly on route or moving with positive speed
  return status === "ON_ROUTE" || status === "IN_PROGRESS" || status === "ACTIVE" || speed > 0;
}

const EMPTY_BUSES = [];
const EMPTY_STOPS = [];
const EMPTY_TRAIL = [];
const EMPTY_POLYLINE = [];

// ─────────────────────────────────────────────────────────────────────────────
// LiveMap — main export
// ─────────────────────────────────────────────────────────────────────────────
export default function LiveMap({
  buses = EMPTY_BUSES,
  selectedBusId = null,
  routeStops = EMPTY_STOPS,
  historyTrail = EMPTY_TRAIL,
  alternativePolyline = EMPTY_POLYLINE,
  showTrail = true,
  onSelectBus,
  focusTrigger = 0,
}) {
  const defaultCenter = [16.3067, 80.4365];
  const [roadPolyline, setRoadPolyline] = useState([]);
  const prevBusIdRef = useRef(selectedBusId);

  // STRICT RULE: Only active vehicles are shown on the map
  const activeBuses = useMemo(() => {
    return (buses || []).filter(isVehicleActive);
  }, [buses]);

  const selectedBus = useMemo(() => {
    if (!selectedBusId) return null;
    return activeBuses.find(
      (b) => b.id === Number(selectedBusId) || b.busId === Number(selectedBusId)
    );
  }, [activeBuses, selectedBusId]);

  const busCenter = useMemo(() => {
    if (selectedBus?.latitude && selectedBus?.longitude) {
      return [selectedBus.latitude, selectedBus.longitude];
    }
    if (activeBuses[0]?.latitude && activeBuses[0]?.longitude) {
      return [activeBuses[0].latitude, activeBuses[0].longitude];
    }
    return defaultCenter;
  }, [selectedBus, activeBuses]);

  // Fetch road geometry for the selected bus's route
  useEffect(() => {
    let alive = true;

    if (!selectedBusId || !routeStops || routeStops.length < 2) {
      setRoadPolyline((prev) => (prev.length > 0 ? [] : prev));
      return;
    }

    if (prevBusIdRef.current !== selectedBusId) {
      prevBusIdRef.current = selectedBusId;
      setRoadPolyline((prev) => (prev.length > 0 ? [] : prev));
    }

    async function load() {
      const data = await routingService.fetchRoadRoute(routeStops);
      if (alive && data?.coordinates?.length > 0) {
        setRoadPolyline(data.coordinates);
      }
    }
    load();
    return () => {
      alive = false;
    };
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

        {/* Only active bus markers are rendered on the map — parked/inactive vehicles are hidden */}
        {activeBuses.map((bus) => {
          if (!bus) return null;
          const lat = bus.latitude ?? bus.lat;
          const lng = bus.longitude ?? bus.lng;
          if (lat == null || lng == null) return null;

          const isSelected =
            selectedBusId !== null &&
            (Number(selectedBusId) === Number(bus.busId) ||
              Number(selectedBusId) === Number(bus.id));

          return (
            <SmoothAnimatedBusMarker
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
