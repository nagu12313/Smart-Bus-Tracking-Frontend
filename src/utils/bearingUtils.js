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
