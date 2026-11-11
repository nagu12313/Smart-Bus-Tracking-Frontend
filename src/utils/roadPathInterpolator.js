/**
 * roadPathInterpolator.js
 * Mathematics and path sampling for realistic, road-following school bus movement.
 */

import L from "leaflet";
import {
  calculateBearing,
  distanceMetres,
  normalizeAngle,
  shortestAngularDelta,
  smoothContinuousBearing,
} from "./bearingUtils";

/**
 * Normalizes coordinate representation to [lat, lng] array.
 */
export function normalizeCoord(pt) {
  if (!pt) return null;
  if (Array.isArray(pt)) {
    const lat = Number(pt[0]);
    const lng = Number(pt[1]);
    return !isNaN(lat) && !isNaN(lng) ? [lat, lng] : null;
  }
  const lat = Number(pt.lat ?? pt.latitude);
  const lng = Number(pt.lng ?? pt.longitude);
  return !isNaN(lat) && !isNaN(lng) ? [lat, lng] : null;
}

/**
 * Finds the index of the closest coordinate on a route to a given point.
 */
export function findClosestRouteIndex(routeCoords, lat, lng) {
  if (!routeCoords || routeCoords.length === 0) return -1;
  let minDist = Infinity;
  let closestIdx = -1;

  for (let i = 0; i < routeCoords.length; i++) {
    const pt = normalizeCoord(routeCoords[i]);
    if (!pt) continue;
    const d = distanceMetres(lat, lng, pt[0], pt[1]);
    if (d < minDist) {
      minDist = d;
      closestIdx = i;
    }
  }

  return { index: closestIdx, distanceMetres: minDist };
}

/**
 * Slices the road route geometry between two GPS points so that the bus travels
 * along all intermediate road curves, corners, turns, and roundabouts.
 *
 * @param {Array} routeCoords - Array of [lat, lng] or {lat, lng} from OSRM
 * @param {number} startLat
 * @param {number} startLng
 * @param {number} targetLat
 * @param {number} targetLng
 * @returns {Array<[number, number]>} - Array of [lat, lng] points along the road
 */
export function findSubPathAlongRoute(routeCoords, startLat, startLng, targetLat, targetLng) {
  const directPath = [
    [startLat, startLng],
    [targetLat, targetLng],
  ];

  if (!routeCoords || routeCoords.length < 2) {
    return directPath;
  }

  const startClosest = findClosestRouteIndex(routeCoords, startLat, startLng);
  const targetClosest = findClosestRouteIndex(routeCoords, targetLat, targetLng);

  // If either point is further than 150m from the route, treat as off-route / direct
  if (
    startClosest.index === -1 ||
    targetClosest.index === -1 ||
    startClosest.distanceMetres > 150 ||
    targetClosest.distanceMetres > 150
  ) {
    return directPath;
  }

  const sIdx = startClosest.index;
  const tIdx = targetClosest.index;

  // Max route vertices to include in a single GPS hop (prevents crazy loop wrapping)
  const MAX_HOP_VERTICES = 60;

  if (sIdx <= tIdx && tIdx - sIdx <= MAX_HOP_VERTICES) {
    const intermediate = [];
    for (let i = sIdx + 1; i < tIdx; i++) {
      const c = normalizeCoord(routeCoords[i]);
      if (c) intermediate.push(c);
    }
    return [[startLat, startLng], ...intermediate, [targetLat, targetLng]];
  }

  if (sIdx > tIdx && sIdx - tIdx <= MAX_HOP_VERTICES) {
    // Reverse movement / U-turn along the route
    const intermediate = [];
    for (let i = sIdx - 1; i > tIdx; i--) {
      const c = normalizeCoord(routeCoords[i]);
      if (c) intermediate.push(c);
    }
    return [[startLat, startLng], ...intermediate, [targetLat, targetLng]];
  }

  return directPath;
}

/**
 * Builds cumulative distance array (in metres) along a multi-point polyline.
 * @param {Array<[number, number]>} points
 * @returns {{ cumulative: number[], totalDistance: number }}
 */
export function buildCumulativeDistances(points) {
  if (!points || points.length === 0) return { cumulative: [0], totalDistance: 0 };
  const cumulative = [0];

  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const d = distanceMetres(p0[0], p0[1], p1[0], p1[1]);
    cumulative.push(cumulative[i - 1] + d);
  }

  return {
    cumulative,
    totalDistance: cumulative[cumulative.length - 1],
  };
}

/**
 * Helper to interpolate point at exact distance along polyline.
 */
function interpolateCoord(points, cumulative, targetDistance) {
  const total = cumulative[cumulative.length - 1];
  if (targetDistance <= 0) return { lat: points[0][0], lng: points[0][1], idx: 0 };
  if (targetDistance >= total) {
    const last = points[points.length - 1];
    return { lat: last[0], lng: last[1], idx: points.length - 1 };
  }

  let i = 1;
  while (i < cumulative.length && cumulative[i] < targetDistance) {
    i++;
  }

  const segDist = cumulative[i] - cumulative[i - 1];
  const t = segDist > 0 ? (targetDistance - cumulative[i - 1]) / segDist : 0;
  const p0 = points[i - 1];
  const p1 = points[i];

  return {
    lat: p0[0] + (p1[0] - p0[0]) * t,
    lng: p0[1] + (p1[1] - p0[1]) * t,
    idx: i - 1,
  };
}

/**
 * Samples position and forward-looking road tangent at target distance.
 * Uses a 22-metre forward lookahead to eliminate micro-wobbles and corner trembling.
 *
 * @param {Array<[number, number]>} points
 * @param {number[]} cumulative
 * @param {number} targetDistance - In metres
 * @param {number} lookaheadMetres - Distance ahead along the road to calculate heading (default 22m)
 * @returns {{ lat: number, lng: number, bearing: number }}
 */
export function samplePathAtDistance(points, cumulative, targetDistance, lookaheadMetres = 22) {
  if (!points || points.length === 0) {
    return { lat: 0, lng: 0, bearing: 0 };
  }
  if (points.length === 1) {
    return { lat: points[0][0], lng: points[0][1], bearing: 0 };
  }

  const current = interpolateCoord(points, cumulative, targetDistance);
  const total = cumulative[cumulative.length - 1];

  // Look ahead along the road to find true vehicular travel direction
  const aheadDistance = Math.min(total, targetDistance + Math.max(10, lookaheadMetres));
  const ahead = interpolateCoord(points, cumulative, aheadDistance);

  let forwardBearing = calculateBearing(current.lat, current.lng, ahead.lat, ahead.lng);

  if (forwardBearing == null || isNaN(forwardBearing)) {
    // If at the very end of route, use last segment bearing
    const pPrev = points[Math.max(0, points.length - 2)];
    const pLast = points[points.length - 1];
    forwardBearing = calculateBearing(pPrev[0], pPrev[1], pLast[0], pLast[1]) ?? 0;
  }

  return {
    lat: current.lat,
    lng: current.lng,
    bearing: forwardBearing,
  };
}

/**
 * 90FPS / 120FPS Shake-Free Angular Turning (Critically Damped Exponential Filter).
 *
 * Prevents angular chatter, tremor, and sudden jumping.
 * Frame-rate independent: works identically at 60Hz, 90Hz, 120Hz, 144Hz.
 *
 * @param {number} current - Current angle in degrees
 * @param {number} target - Target angle in degrees
 * @param {number} damping - Damping coefficient (higher = faster turn, lower = heavier vehicle feel)
 * @param {number} dtSeconds - Delta time in seconds
 * @returns {number} - Smoothed angle in degrees (0–360)
 */
export function smoothAngularTurn(current, target, damping = 10, dtSeconds = 0.016) {
  if (current == null || isNaN(current)) return target ?? 0;
  if (target == null || isNaN(target)) return current;

  const delta = shortestAngularDelta(current, target);

  // Critically damped exponential decay: frame-rate independent
  const safeDt = Math.min(Math.max(dtSeconds || 0.016, 0.001), 0.05);
  const factor = 1 - Math.exp(-damping * safeDt);
  const step = delta * factor;

  return normalizeAngle(current + step);
}

/**
 * Updates marker position with true GPU subpixel floating-point precision.
 * Bypasses Leaflet's built-in update().round() which quantizes positions to integer pixels
 * and causes stepping jumps during 60/90/120 FPS animation.
 *
 * @param {L.Marker} marker - The Leaflet marker instance
 * @param {L.Map} map - The Leaflet map instance
 * @param {[number, number]|L.LatLng} latlng - Target coordinates
 */
export function setMarkerSubpixelPosition(marker, map, latlng) {
  if (!marker || !map) return;
  const targetLatLng = L.latLng(latlng);
  marker._latlng = targetLatLng;

  if (marker._icon) {
    const pt = map.latLngToLayerPoint(targetLatLng);
    L.DomUtil.setPosition(marker._icon, pt);
    marker._zIndex = Math.round(pt.y) + (marker.options.zIndexOffset || 1000);
    marker._resetZIndex();
  }
}
