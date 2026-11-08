/**
 * OSRM Road Routing and Telemetry Engine
 * Generates true road-following geometry (GeoJSON LineString)
 * and calculates dynamic ETA and bearings for school buses.
 */

// Haversine formula for distance in kilometers
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

// Calculate bearing in degrees (0 - 360) from point A to B
export function calculateBearing(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return 0;
  }
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round((brng + 360) % 360);
}

// Calculate ETA countdown string based on distance and average speed
export function calculateEta(distanceRemainingKm, speedKmh = 35) {
  if (speedKmh === 0) return "Parked";
  if (distanceRemainingKm == null || distanceRemainingKm <= 0.1) return "Arrived / At Stop";
  const effectiveSpeed = Math.max(speedKmh || 25, 20); // assume minimum campus bus speed of 20 km/h
  const hours = distanceRemainingKm / effectiveSpeed;
  const minutes = Math.round(hours * 60);
  if (minutes < 1) return "< 1 min";
  if (minutes === 1) return "1 min";
  if (minutes < 60) return `${minutes} mins`;
  const hrs = Math.floor(minutes / 60);
  const remMins = minutes % 60;
  return `${hrs}h ${remMins}m`;
}

// In-memory cache for road geometries to minimize OSRM calls
const geometryCache = new Map();

/**
 * Fetch true road-following polyline geometry from OSRM
 * @param {Array<{latitude: number, longitude: number}>} points
 * @returns {Promise<{coordinates: Array<[number, number]>, distanceKm: number, durationMinutes: number, geojson: Object}>}
 */
export async function fetchRoadRoute(points = []) {
  if (!Array.isArray(points) || points.length === 0) {
    return {
      coordinates: [],
      distanceKm: 0,
      durationMinutes: 0,
      geojson: null,
    };
  }

  const validPoints = points
    .map((p) => {
      if (!p) return null;
      const lat =
        typeof p.latitude === "number"
          ? p.latitude
          : typeof p.lat === "number"
          ? p.lat
          : Number(p.latitude || p.lat);
      const lng =
        typeof p.longitude === "number"
          ? p.longitude
          : typeof p.lng === "number"
          ? p.lng
          : Number(p.longitude || p.lng);
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0
        ? { latitude: lat, longitude: lng }
        : null;
    })
    .filter(Boolean);

  if (validPoints.length < 2) {
    const singleCoord = validPoints.map((p) => [p.latitude, p.longitude]);
    return {
      coordinates: singleCoord,
      distanceKm: 0,
      durationMinutes: 0,
      geojson: null,
    };
  }

  // Generate cache key
  const cacheKey = validPoints.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join(";");
  if (geometryCache.has(cacheKey)) {
    return geometryCache.get(cacheKey);
  }

  // OSRM expects coordinates in lng,lat order separated by semicolons
  const coordsString = validPoints.map((p) => `${p.longitude},${p.latitude}`).join(";");
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(osrmUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();

    if (data.code === "Ok" && data.routes && data.routes.length > 0) {
      const primaryRoute = data.routes[0];
      // OSRM GeoJSON coordinates are [lng, lat], convert to Leaflet's [lat, lng]
      const leafletCoords = primaryRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      const distanceKm = Number((primaryRoute.distance / 1000).toFixed(2));
      const durationMinutes = Math.round(primaryRoute.duration / 60);

      const result = {
        coordinates: leafletCoords,
        distanceKm: distanceKm,
        durationMinutes: durationMinutes,
        geojson: primaryRoute.geometry,
      };

      geometryCache.set(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn("OSRM routing unavailable, generating road waypoint interpolation:", err.message);
  }

  // Fallback: build high-density waypoint interpolation between points
  const fallbackCoords = [];
  let totalKm = 0;

  for (let i = 0; i < validPoints.length - 1; i++) {
    const p1 = validPoints[i];
    const p2 = validPoints[i + 1];
    const dist = calculateDistanceKm(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
    totalKm += dist;

    // Add 10 interpolated steps per segment for smooth visual polyline
    const steps = Math.max(10, Math.round(dist * 8));
    for (let s = 0; s <= steps; s++) {
      const ratio = s / steps;
      const lat = p1.latitude + (p2.latitude - p1.latitude) * ratio;
      const lng = p1.longitude + (p2.longitude - p1.longitude) * ratio;
      fallbackCoords.push([lat, lng]);
    }
  }

  const fallbackResult = {
    coordinates: fallbackCoords,
    distanceKm: Number(totalKm.toFixed(2)),
    durationMinutes: Math.round((totalKm / 30) * 60), // 30 km/h average
    geojson: {
      type: "LineString",
      coordinates: fallbackCoords.map(([lat, lng]) => [lng, lat]),
    },
  };

  geometryCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}

export default {
  calculateDistanceKm,
  calculateBearing,
  calculateEta,
  fetchRoadRoute,
};
