/**
 * bearingUtils.js
 * Geographic bearing and rotation mathematics for school bus orientation.
 * All angles in degrees. Geographic North = 0°, clockwise positive.
 */

/**
 * Calculate geographic bearing from point A → point B.
 * Returns 0–360°. North = 0°, East = 90°, South = 180°, West = 270°.
 */
export function calculateBearing(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;

  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  const bearing = ((θ * 180) / Math.PI + 360) % 360;
  return bearing;
}

/**
 * Haversine distance between two GPS points in metres.
 */
export function distanceMetres(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return 0;
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Normalize any angle to 0–360°.
 */
export function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

/**
 * Find the shortest angular delta between two headings.
 * Returns a value in –180..+180.
 */
export function shortestAngularDelta(from, to) {
  let delta = normalizeAngle(to) - normalizeAngle(from);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

/**
 * Convert geographic bearing (N=0, E=90) to CSS rotation degrees
 * for the school bus SVG whose front faces EAST (right) at 0°.
 *
 * SVG front = East  →  no additional offset needed because
 * CSS rotate(0deg) = East in this SVG, but the map uses North = 0°.
 * So: cssRotation = geographicBearing - 90
 *
 * North (bearing=0)  → cssRotation = -90 → bus faces up  ✓
 * East  (bearing=90) → cssRotation =   0 → bus faces right ✓
 * South (bearing=180)→ cssRotation =  90 → bus faces down  ✓
 * West  (bearing=270)→ cssRotation = 180 → bus faces left  ✓
 */
export function bearingToCssRotation(bearing) {
  return normalizeAngle(bearing - 90);
}

/**
 * Continuous (un-modulo'd) CSS rotation for smooth 90FPS/120FPS GPU transforms.
 * Never flips across 0/360 boundary.
 */
export function continuousBearingToCssRotation(continuousBearing) {
  return continuousBearing - 90;
}

/**
 * Frame-rate independent continuous bearing smoothing.
 * Interpolates smoothly along the shortest angular path without wrapping around 360°,
 * eliminating 360-degree CSS spin jumps and angular chatter.
 *
 * @param {number} currentContinuous - Accumulated continuous bearing (can be < 0 or > 360)
 * @param {number} targetBearing - Desired target bearing in 0-360
 * @param {number} damping - Damping factor (default 8)
 * @param {number} dtSeconds - Delta time in seconds
 * @returns {number} New continuous bearing
 */
export function smoothContinuousBearing(currentContinuous, targetBearing, damping = 8, dtSeconds = 0.016) {
  if (currentContinuous == null || isNaN(currentContinuous)) return targetBearing ?? 0;
  if (targetBearing == null || isNaN(targetBearing)) return currentContinuous;

  const currentMod = normalizeAngle(currentContinuous);
  const delta = shortestAngularDelta(currentMod, targetBearing);

  const safeDt = Math.min(Math.max(dtSeconds || 0.016, 0.001), 0.05);
  const factor = 1 - Math.exp(-damping * safeDt);

  return currentContinuous + delta * factor;
}

/**
 * Detect if a heading change is likely GPS noise rather than real movement.
 * @param {number} speedKmh - Current speed in km/h
 * @param {number} angleDelta - Absolute angular change in degrees
 */
export function isHeadingNoise(speedKmh, angleDelta) {
  if (speedKmh < 2) return true;          // Stationary – ignore all heading
  if (speedKmh < 5 && angleDelta > 45) return true;  // Very slow + big jump
  if (angleDelta > 170 && speedKmh < 15) return true; // Near-U-turn at low speed — likely noise
  return false;
}

/**
 * Calculate the bearing along a route geometry closest to a given position.
 * routeCoords: array of [lat, lng] pairs
 * Returns bearing in geographic degrees, or null if not calculable.
 */
export function bearingFromRouteGeometry(routeCoords, busLat, busLng) {
  if (!routeCoords || routeCoords.length < 2) return null;

  // Find the two closest route segment points ahead of the bus
  let minDist = Infinity;
  let closestIdx = 0;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const [lat, lng] = routeCoords[i];
    const d = distanceMetres(busLat, busLng, lat, lng);
    if (d < minDist) {
      minDist = d;
      closestIdx = i;
    }
  }

  // Use the segment ahead of the closest point for forward-facing orientation
  const nextIdx = Math.min(closestIdx + 1, routeCoords.length - 1);
  const [aLat, aLng] = routeCoords[closestIdx];
  const [bLat, bLng] = routeCoords[nextIdx];

  if (aLat === bLat && aLng === bLng) return null;
  return calculateBearing(aLat, aLng, bLat, bLng);
}
