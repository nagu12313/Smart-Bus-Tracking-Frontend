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

// Calculate dynamic ETA countdown strictly based on remaining distance and current vehicle speed
export function calculateEta(distanceRemainingKm, speedKmh = 35) {
  if (distanceRemainingKm == null || distanceRemainingKm <= 0.03) {
    return "Arrived at Stop";
  }
  if (!speedKmh || speedKmh <= 0) {
    return "Parked / Waiting";
  }

  // Exact time calculation in seconds: t = (d / v) * 3600
  const totalSeconds = Math.max(1, Math.round((distanceRemainingKm / speedKmh) * 3600));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  if (totalSeconds < 3600) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins} min`;
  }

  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  return `${hrs}h ${mins}m`;
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

      const legDistances = [];
      const legDurations = [];
      if (primaryRoute.legs && Array.isArray(primaryRoute.legs)) {
        primaryRoute.legs.forEach((leg) => {
          legDistances.push(Number((leg.distance / 1000).toFixed(2)));
          legDurations.push(Math.max(1, Math.round(leg.duration / 60)));
        });
      }

      const result = {
        coordinates: leafletCoords,
        distanceKm: distanceKm,
        durationMinutes: durationMinutes,
        geojson: primaryRoute.geometry,
        legs: primaryRoute.legs || [],
        legDistancesKm: legDistances,
        legDurationsMinutes: legDurations,
      };

      geometryCache.set(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn("OSRM routing unavailable, generating road waypoint interpolation:", err.message);
  }

  // Fallback: build high-density waypoint interpolation between points
  const fallbackCoords = [];
  const legDistances = [];
  const legDurations = [];
  let totalKm = 0;

  for (let i = 0; i < validPoints.length - 1; i++) {
    const p1 = validPoints[i];
    const p2 = validPoints[i + 1];
    const dist = calculateDistanceKm(p1.latitude, p1.longitude, p2.latitude, p2.longitude) * 1.35;
    totalKm += dist;
    legDistances.push(Number(dist.toFixed(2)));
    legDurations.push(Math.max(1, Math.round((dist / 30.0) * 60)));

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
    legDistancesKm: legDistances,
    legDurationsMinutes: legDurations,
  };

  geometryCache.set(cacheKey, fallbackResult);
  return fallbackResult;
}

const matrixCache = new Map();

/**
 * Fetch road-network distance and duration matrix via OSRM Table API
 * @param {Array<{latitude: number, longitude: number}>} points
 * @returns {Promise<{distances: Array<Array<number>>, durations: Array<Array<number>>}>}
 */
export async function fetchDistanceMatrix(points = []) {
  const validPoints = points
    .map((p) => {
      if (!p) return null;
      const lat = typeof p.latitude === "number" ? p.latitude : typeof p.lat === "number" ? p.lat : Number(p.latitude || p.lat);
      const lng = typeof p.longitude === "number" ? p.longitude : typeof p.lng === "number" ? p.lng : Number(p.longitude || p.lng);
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 ? { latitude: lat, longitude: lng } : null;
    })
    .filter(Boolean);

  const n = validPoints.length;
  if (n === 0) return { distances: [], durations: [] };

  const cacheKey = validPoints.map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join(";");
  if (matrixCache.has(cacheKey)) {
    return matrixCache.get(cacheKey);
  }

  const coordsString = validPoints.map((p) => `${p.longitude},${p.latitude}`).join(";");
  const osrmTableUrl = `https://router.project-osrm.org/table/v1/driving/${coordsString}?annotations=distance,duration`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(osrmTableUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.code === "Ok" && data.distances && data.durations) {
        // Sanitize missing / unreachable pairs
        const distances = data.distances.map((row, i) =>
          row.map((d, j) => {
            if (i === j) return 0;
            if (d == null || d <= 0) {
              return calculateDistanceKm(validPoints[i].latitude, validPoints[i].longitude, validPoints[j].latitude, validPoints[j].longitude) * 1350;
            }
            return d;
          })
        );
        const durations = data.durations.map((row, i) =>
          row.map((t, j) => {
            if (i === j) return 0;
            if (t == null || t <= 0) {
              const dMeters = distances[i][j];
              return (dMeters / (30000 / 3600)); // 30 km/h
            }
            return t;
          })
        );
        const result = { distances, durations };
        matrixCache.set(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn("OSRM Table API unavailable, using fallback road matrix:", err.message);
  }

  // Fallback Haversine * 1.35 road factor
  const distances = Array(n).fill(null).map(() => Array(n).fill(0));
  const durations = Array(n).fill(null).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        const dM = calculateDistanceKm(validPoints[i].latitude, validPoints[i].longitude, validPoints[j].latitude, validPoints[j].longitude) * 1350;
        distances[i][j] = dM;
        durations[i][j] = (dM / (30000 / 3600));
      }
    }
  }
  const result = { distances, durations };
  matrixCache.set(cacheKey, result);
  return result;
}

export default {
  calculateDistanceKm,
  calculateBearing,
  calculateEta,
  fetchRoadRoute,
  fetchDistanceMatrix,
};
