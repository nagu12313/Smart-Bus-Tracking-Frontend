import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Marker, Popup, Circle, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import {
  calculateBearing,
  distanceMetres,
  bearingToCssRotation,
  continuousBearingToCssRotation,
  shortestAngularDelta,
  normalizeAngle,
  smoothContinuousBearing,
} from "../utils/bearingUtils";
import {
  findSubPathAlongRoute,
  buildCumulativeDistances,
  samplePathAtDistance,
  smoothAngularTurn,
  setMarkerSubpixelPosition,
} from "../utils/roadPathInterpolator";
import { createRotatingBusIcon } from "./LiveMap";

/**
 * High-performance animated School Bus Marker.
 *
 * 1. Glides smoothly at 60 FPS along the actual road route between GPS updates.
 * 2. Follows road geometry curves, turns, junctions, and roundabouts.
 * 3. Rotates smoothly with shortest angular path so the bus front always faces travel direction.
 * 4. Stays strictly stationary when the vehicle is stopped (no artificial jitter or drift).
 * 5. Uses requestAnimationFrame and direct Leaflet DOM transforms for fluid GPU rendering.
 * 6. Preserves authoritative backend GPS data (interpolation is purely visual).
 */
export default function SmoothAnimatedBusMarker({
  bus,
  isSelected = false,
  roadPolyline = [],
  onSelectBus,
  children,
}) {
  const map = useMap();
  const markerRef = useRef(null);

  // Authoritative target coordinate from GPS packet (road-snapped if available)
  const targetLat =
    bus?.isRoadMatched && bus?.snappedLatitude != null
      ? bus.snappedLatitude
      : bus?.latitude ?? bus?.lat;
  const targetLng =
    bus?.isRoadMatched && bus?.snappedLongitude != null
      ? bus.snappedLongitude
      : bus?.longitude ?? bus?.lng;

  const rawLat = bus?.rawLatitude ?? bus?.latitude ?? bus?.lat;
  const rawLng = bus?.rawLongitude ?? bus?.longitude ?? bus?.lng;

  // Stale check (> 3 mins or explicit flag)
  const isStale =
    Boolean(bus?.isStale) ||
    Boolean(bus?.gpsTime && Date.now() - new Date(bus.gpsTime).getTime() > 180000);

  // Current visual position & continuous rotation state
  const initialBearingVal = typeof bus?.heading === "number" && !isNaN(bus.heading) ? bus.heading : 90;
  const currentPosRef = useRef({
    lat: targetLat,
    lng: targetLng,
    bearing: initialBearingVal,
    continuousBearing: initialBearingVal,
    cssRotation: initialBearingVal - 90,
    isInitialized: false,
  });

  // Animation tracking ref
  const animRef = useRef({
    active: false,
    startTime: 0,
    duration: 2500,
    pathPoints: [],
    cumulative: [0],
    totalDistance: 0,
    lastFrameTime: 0,
    targetHeading: bus?.heading ?? 90,
  });

  const rafIdRef = useRef(null);

  // Stop any ongoing animation cleanly
  const stopAnimation = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    animRef.current.active = false;
  }, []);

  // Sync icon and continuous rotation to the DOM with GPU subpixel precision
  const updateMarkerDom = useCallback((lat, lng, cssRotation) => {
    if (!markerRef.current || !map) return;
    try {
      setMarkerSubpixelPosition(markerRef.current, map, [lat, lng]);
      const el = markerRef.current.getElement();
      if (el) {
        const svgEl = el.querySelector(".bus-svg-rotating");
        if (svgEl) {
          svgEl.style.transform = `rotate(${cssRotation}deg)`;
        }
      }
    } catch {
      // Map instance may be unmounting
    }
  }, [map]);

  // Stable mount position reference to prevent React-Leaflet from fighting 90fps rAF
  const stableMountPositionRef = useRef([targetLat, targetLng]);

  // Main 90 FPS animation loop
  const runAnimationFrame = useCallback(
    (now) => {
      const anim = animRef.current;
      if (!anim.active) return;

      if (!anim.lastFrameTime) anim.lastFrameTime = now;
      const dtSeconds = Math.min((now - anim.lastFrameTime) / 1000, 0.05); // cap dt at 50ms
      anim.lastFrameTime = now;

      const elapsed = now - anim.startTime;
      const progress = anim.duration > 0 ? Math.min(1, elapsed / anim.duration) : 1;

      // Sample along road sub-path with 22m lookahead tangent to eliminate corner shudder
      const targetDist = progress * anim.totalDistance;
      const sample = samplePathAtDistance(anim.pathPoints, anim.cumulative, targetDist, 22);

      // Determine road vs. GPS target bearing
      let desiredBearing = sample.bearing;
      if (
        bus?.speed &&
        bus.speed > 8 &&
        bus.heading != null &&
        !isNaN(bus.heading) &&
        anim.totalDistance < 35
      ) {
        // High speed straight line: blend with GPS heading
        desiredBearing = bus.heading;
      }

      // Continuous un-modulo'd angular turning (zero 360-degree flips, zero deadband stutter)
      const curContBearing = currentPosRef.current.continuousBearing ?? currentPosRef.current.bearing;
      const newContBearing = smoothContinuousBearing(curContBearing, desiredBearing, 10, dtSeconds);
      const newCssRotation = newContBearing - 90;

      // Save animated state
      currentPosRef.current.lat = sample.lat;
      currentPosRef.current.lng = sample.lng;
      currentPosRef.current.bearing = normalizeAngle(newContBearing);
      currentPosRef.current.continuousBearing = newContBearing;
      currentPosRef.current.cssRotation = newCssRotation;

      // Direct Leaflet DOM update with GPU subpixel hardware acceleration
      updateMarkerDom(sample.lat, sample.lng, newCssRotation);

      if (progress < 1) {
        rafIdRef.current = requestAnimationFrame(runAnimationFrame);
      } else {
        // Destination of this GPS segment reached
        anim.active = false;
        rafIdRef.current = null;
      }
    },
    [bus?.speed, bus?.heading, updateMarkerDom]
  );

  // Handle incoming GPS coordinates
  useEffect(() => {
    if (targetLat == null || targetLng == null) return;

    const curr = currentPosRef.current;

    // First placement on map
    if (!curr.isInitialized) {
      curr.lat = targetLat;
      curr.lng = targetLng;
      curr.bearing = bus?.heading ?? 90;
      curr.cssRotation = bearingToCssRotation(curr.bearing);
      curr.isInitialized = true;
      updateMarkerDom(targetLat, targetLng, curr.cssRotation);
      return;
    }

    // Calculate distance from current visual position to new GPS position
    const jumpDist = distanceMetres(curr.lat, curr.lng, targetLat, targetLng);

    // 1. Vehicle is stopped / parked: keep stationary without micro-jitter
    const isStopped = (bus?.speed != null && bus.speed < 1.5) || jumpDist < 1.0;
    if (isStopped) {
      stopAnimation();
      curr.lat = targetLat;
      curr.lng = targetLng;
      updateMarkerDom(targetLat, targetLng, curr.cssRotation);
      return;
    }

    // 2. Erroneous teleport (> 8km): snap without weird flight
    if (jumpDist > 8000) {
      stopAnimation();
      curr.lat = targetLat;
      curr.lng = targetLng;
      curr.bearing = bus?.heading ?? curr.bearing;
      curr.cssRotation = bearingToCssRotation(curr.bearing);
      updateMarkerDom(targetLat, targetLng, curr.cssRotation);
      return;
    }

    // 3. Stale GPS: freeze at confirmed position
    if (isStale) {
      stopAnimation();
      return;
    }

    // 4. Normal movement: compute road sub-path and smoothly glide
    stopAnimation();

    const roadSubPath = findSubPathAlongRoute(
      roadPolyline,
      curr.lat,
      curr.lng,
      targetLat,
      targetLng
    );

    const { cumulative, totalDistance } = buildCumulativeDistances(roadSubPath);

    // Calculate realistic duration (target ~2.5s update window, or based on speed)
    let duration = 2500;
    if (bus?.speed && bus.speed > 5) {
      const speedMps = (bus.speed * 1000) / 3600;
      duration = Math.max(1000, Math.min(4000, (totalDistance / speedMps) * 1000));
    }

    animRef.current = {
      active: true,
      startTime: performance.now(),
      duration,
      pathPoints: roadSubPath,
      cumulative,
      totalDistance,
      lastFrameTime: performance.now(),
      targetHeading: bus?.heading ?? samplePathAtDistance(roadSubPath, cumulative, totalDistance).bearing,
    };

    rafIdRef.current = requestAnimationFrame(runAnimationFrame);

    return () => {
      stopAnimation();
    };
  }, [
    targetLat,
    targetLng,
    bus?.speed,
    bus?.heading,
    isStale,
    roadPolyline,
    runAnimationFrame,
    stopAnimation,
    updateMarkerDom,
  ]);

  // Clean up RAF on unmount
  useEffect(() => {
    return () => {
      stopAnimation();
    };
  }, [stopAnimation]);

  // Memoize bus icon strictly on stable properties (bus identity, status, selection)
  // NEVER recreate icon on micro coordinate or speed ticks to prevent Leaflet from tearing down the DOM marker!
  const stableBusIcon = useMemo(() => {
    return createRotatingBusIcon(
      {
        busNumber: bus?.busNumber || bus?.number || "BUS",
        speed: Math.round(bus?.speed || 0),
        status: bus?.status,
      },
      currentPosRef.current.cssRotation,
      isSelected
    );
  }, [bus?.busNumber, bus?.number, bus?.status, isSelected]);

  // Update speed text directly in DOM without destroying the marker
  useEffect(() => {
    if (!markerRef.current) return;
    const el = markerRef.current.getElement();
    if (el) {
      const speedEl = el.querySelector(".bus-speed-text");
      if (speedEl) {
        speedEl.textContent = `${Math.round(bus?.speed || 0)} km/h`;
      }
    }
  }, [bus?.speed]);

  if (targetLat == null || targetLng == null) return null;

  const initialLat = currentPosRef.current.lat || targetLat;
  const initialLng = currentPosRef.current.lng || targetLng;

  const hasSnappedOffset =
    Boolean(bus?.isRoadMatched) &&
    rawLat != null &&
    rawLng != null &&
    (Math.abs(rawLat - targetLat) > 0.00008 || Math.abs(rawLng - targetLng) > 0.00008);

  const accuracyMeters = typeof bus?.accuracy === "number" && bus.accuracy > 0 ? bus.accuracy : null;

  return (
    <React.Fragment>
      {/* Accuracy circle for selected bus */}
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

      {/* Visual connection to raw GPS if road-snapped */}
      {isSelected && hasSnappedOffset && (
        <>
          <Polyline
            positions={[
              [rawLat, rawLng],
              [targetLat, targetLng],
            ]}
            pathOptions={{
              color: "#94a3b8",
              weight: 1.5,
              dashArray: "3, 3",
              opacity: 0.8,
            }}
          />
          <Marker position={[rawLat, rawLng]} icon={createRawGpsIcon()}>
            <Tooltip direction="bottom" offset={[0, 6]}>
              <div style={{ fontSize: "11px", fontWeight: 600 }}>
                📍 Raw Device GPS (±{Math.round(accuracyMeters || 10)}m)
              </div>
            </Tooltip>
          </Marker>
        </>
      )}

      {/* 90FPS GPU Hardware-Accelerated Smooth Yellow Bus Marker */}
      <Marker
        ref={markerRef}
        position={stableMountPositionRef.current}
        icon={stableBusIcon}
        eventHandlers={{ click: () => onSelectBus && onSelectBus(bus) }}
        zIndexOffset={1000}
      >
        {children ? (
          children
        ) : (
          <Popup>
            <div style={{ minWidth: "220px", padding: "4px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid #f1f5f9",
                  paddingBottom: "6px",
                  marginBottom: "6px",
                }}
              >
                <div>
                  <h6 style={{ margin: 0, fontWeight: 800, color: "#0f172a", fontSize: "14px" }}>
                    🚌 {bus.busNumber || bus.number || "BUS"}
                  </h6>
                  <small style={{ color: "#64748b", fontSize: "11px" }}>
                    {bus.busName || bus.name || "School Bus"}
                  </small>
                </div>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "12px",
                    background: bus.status === "ON_ROUTE" ? "#dcfce7" : "#f1f5f9",
                    color: bus.status === "ON_ROUTE" ? "#15803d" : "#475569",
                  }}
                >
                  {isStale ? "⚠️ STALE GPS" : bus.status || "STANDBY"}
                </span>
              </div>

              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "5px" }}>
                <div style={{ background: "#f8fafc", padding: "5px 8px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                  <div style={{ color: "#475569", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>
                    Verified Location
                  </div>
                  <div style={{ fontWeight: 600, color: "#0f172a", fontSize: "12px" }}>
                    {bus.locationName || "Verified GPS Position"}
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Speed & Heading:</span>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>
                    {Math.round(bus.speed ?? 0)} km/h · {Math.round(currentPosRef.current.bearing)}°
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Road Snapping:</span>
                  <span style={{ fontWeight: 600, color: bus.isRoadMatched ? "#0284c7" : "#64748b" }}>
                    {bus.isRoadMatched ? "🛣️ Road Matched" : "📡 Direct GPS"}
                  </span>
                </div>
              </div>
            </div>
          </Popup>
        )}
      </Marker>
    </React.Fragment>
  );
}

function createRawGpsIcon() {
  return L.divIcon({
    html: `<div style="width:10px;height:10px;background:#3b82f6;border:2px solid #ffffff;border-radius:50%;box-shadow:0 0 6px rgba(37,99,235,0.6);"></div>`,
    className: "raw-gps-dot-marker",
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}
