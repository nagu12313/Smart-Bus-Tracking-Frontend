/**
 * useBusHeading.js
 * React hook that tracks and smoothly animates a bus's heading/rotation
 * based on live GPS data, using requestAnimationFrame for butter-smooth turning.
 *
 * Priority order for heading determination:
 *   1. Valid GPS heading from device (if speed > threshold and not noisy)
 *   2. Calculated bearing from consecutive GPS positions (if moved > MIN_MOVE_METRES)
 *   3. Bearing from road route geometry closest to current position
 *   4. Last known reliable heading (hold last good value)
 */

import { useRef, useState, useEffect, useCallback } from "react";
import {
  calculateBearing,
  distanceMetres,
  bearingToCssRotation,
  isHeadingNoise,
  shortestAngularDelta,
  normalizeAngle,
  bearingFromRouteGeometry,
} from "../utils/bearingUtils";

/** Minimum metres of movement to trust calculated bearing from positions */
const MIN_MOVE_METRES = 8;
/** Angular velocity cap: degrees per second for smooth animation */
const MAX_DEG_PER_SEC = 180;
/** Animation frame duration target (ms) */
const FRAME_MS = 16;
/** How close to target heading before snapping (stops animation) */
const SNAP_THRESHOLD_DEG = 0.5;
/** Minimum speed (km/h) to update heading at all */
const MIN_SPEED_FOR_HEADING = 2;

/**
 * @param {object} opts
 * @param {object} opts.bus - Current bus object { latitude, longitude, speed, heading, id }
 * @param {number[]} opts.routeCoords - Array of [lat,lng] pairs from road route
 * @param {boolean} opts.isStale - Whether GPS is stale
 * @returns {{ cssRotation: number, geoBearing: number, source: string }}
 */
export function useBusHeading({ bus, routeCoords = [], isStale = false }) {
  // Current animated CSS rotation (degrees)
  const [cssRotation, setCssRotation] = useState(() =>
    bearingToCssRotation(
      typeof bus?.heading === "number" && !isNaN(bus.heading) ? bus.heading : 90
    )
  );

  // Last authoritative geographic bearing (N=0, E=90, ...)
  const lastGeoBearingRef = useRef(
    typeof bus?.heading === "number" && !isNaN(bus.heading) ? bus.heading : 90
  );
  // Previous GPS position for calculated bearing
  const prevPosRef = useRef(null);
  // Animation frame handle
  const rafRef = useRef(null);
  // Source of current heading determination
  const [source, setSource] = useState("initial");
  // Target CSS rotation the animation is approaching
  const targetCssRef = useRef(bearingToCssRotation(lastGeoBearingRef.current));
  // Current animated CSS rotation ref (for use inside rAF without stale closure)
  const currentCssRef = useRef(cssRotation);

  // Smooth animation toward targetCssRef
  const startAnimation = useCallback(() => {
    if (rafRef.current) return; // already running

    let lastTime = null;

    function step(now) {
      if (!lastTime) lastTime = now;
      const elapsed = Math.min(now - lastTime, 100);
      lastTime = now;

      const current = currentCssRef.current;
      const target = targetCssRef.current;
      const delta = shortestAngularDelta(current, target);

      if (Math.abs(delta) < SNAP_THRESHOLD_DEG) {
        // Arrived — snap and stop
        currentCssRef.current = normalizeAngle(target);
        setCssRotation(currentCssRef.current);
        rafRef.current = null;
        return;
      }

      // Max degrees this frame
      const maxStep = (MAX_DEG_PER_SEC * elapsed) / 1000;
      const step = Math.sign(delta) * Math.min(Math.abs(delta), maxStep);
      currentCssRef.current = normalizeAngle(current + step);
      setCssRotation(currentCssRef.current);

      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
  }, []);

  // Stop animation
  const stopAnimation = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopAnimation();
  }, [stopAnimation]);

  // Main effect: determine heading when bus GPS updates
  useEffect(() => {
    if (!bus) return;

    const { latitude: lat, longitude: lng, speed = 0, heading: gpsHeading } = bus;
    if (lat == null || lng == null) return;

    // Persist previous position even if stationary, so initial movement can calculate bearing
    const prevPos = prevPosRef.current;
    prevPosRef.current = { lat, lng };

    // If GPS is stale or vehicle stationary — freeze at last known heading, stop animation
    if (isStale || speed < MIN_SPEED_FOR_HEADING) {
      stopAnimation();
      return;
    }

    const speedKmh = Number(speed) || 0;
    let newGeoBearing = null;
    let headingSource = "held";

    // ── Priority 1: Device-provided GPS heading ──────────────────────────────
    if (
      typeof gpsHeading === "number" &&
      !isNaN(gpsHeading) &&
      gpsHeading !== null
    ) {
      const angleDelta = Math.abs(
        shortestAngularDelta(lastGeoBearingRef.current, gpsHeading)
      );
      if (!isHeadingNoise(speedKmh, angleDelta)) {
        newGeoBearing = gpsHeading;
        headingSource = "gps-device";
      }
    }

    // ── Priority 2: Calculated bearing from consecutive GPS positions ────────
    if (newGeoBearing === null && prevPos) {
      const { lat: pLat, lng: pLng } = prevPos;
      const dist = distanceMetres(pLat, pLng, lat, lng);

      if (dist >= MIN_MOVE_METRES) {
        const calculatedBearing = calculateBearing(pLat, pLng, lat, lng);
        if (calculatedBearing !== null) {
          const angleDelta = Math.abs(
            shortestAngularDelta(lastGeoBearingRef.current, calculatedBearing)
          );
          if (!isHeadingNoise(speedKmh, angleDelta)) {
            newGeoBearing = calculatedBearing;
            headingSource = "calculated";
          }
        }
      }
    }

    // ── Priority 3: Bearing from road route geometry ─────────────────────────
    if (newGeoBearing === null && routeCoords && routeCoords.length >= 2) {
      const routeBearing = bearingFromRouteGeometry(routeCoords, lat, lng);
      if (routeBearing !== null) {
        newGeoBearing = routeBearing;
        headingSource = "route-geometry";
      }
    }

    // ── Update state if we got a new authoritative bearing ───────────────────
    if (newGeoBearing !== null) {
      lastGeoBearingRef.current = newGeoBearing;
      targetCssRef.current = bearingToCssRotation(newGeoBearing);
      setSource(headingSource);
      startAnimation();
    }
  }, [
    bus?.latitude,
    bus?.longitude,
    bus?.speed,
    bus?.heading,
    isStale,
    routeCoords,
    startAnimation,
    stopAnimation,
  ]);

  return {
    cssRotation,
    geoBearing: lastGeoBearingRef.current,
    source,
  };
}
