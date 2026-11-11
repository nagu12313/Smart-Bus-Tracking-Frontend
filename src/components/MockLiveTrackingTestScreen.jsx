import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import routingService, { calculateEta } from "../services/routingService";
import { createRotatingBusIcon } from "./LiveMap";
import {
  bearingToCssRotation,
  continuousBearingToCssRotation,
  distanceMetres,
  normalizeAngle,
  smoothContinuousBearing,
} from "../utils/bearingUtils";
import {
  buildCumulativeDistances,
  samplePathAtDistance,
  setMarkerSubpixelPosition,
} from "../utils/roadPathInterpolator";
import api from "../services/api";

// Preset Real Locations for Fast Testing
const PRESET_LOCATIONS = [
  { name: "Lakshmipuram, Guntur", latitude: 16.3067, longitude: 80.4365, city: "Guntur" },
  { name: "Brodipet, Guntur", latitude: 16.3100, longitude: 80.4420, city: "Guntur" },
  { name: "Arundelpet, Guntur", latitude: 16.3140, longitude: 80.4480, city: "Guntur" },
  { name: "Main Campus, Guntur", latitude: 16.3400, longitude: 80.4700, city: "Guntur" },
  { name: "Ring Road, Guntur", latitude: 16.3000, longitude: 80.4900, city: "Guntur" },
  { name: "Tenali Bus Stand", latitude: 16.2400, longitude: 80.6300, city: "Tenali" },
  { name: "Madhapur, Hyderabad", latitude: 17.4486, longitude: 78.3908, city: "Hyderabad" },
  { name: "Hitec City Cyber Towers", latitude: 17.4504, longitude: 78.3809, city: "Hyderabad" },
  { name: "Gachibowli Stadium", latitude: 17.4435, longitude: 78.3489, city: "Hyderabad" },
  { name: "JNTU Hyderabad", latitude: 17.4933, longitude: 78.3914, city: "Hyderabad" },
];

// Custom icons for Start (A) and Destination (B)
const startPinIcon = L.divIcon({
  html: `<div style="
    width:32px; height:32px; background:#16a34a; color:#fff;
    border-radius:50%; border:3px solid #fff; box-shadow:0 3px 10px rgba(0,0,0,0.35);
    display:flex; align-items:center; justify-content:center;
    font-size:14px; font-weight:800;">A</div>`,
  className: "mock-start-pin",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

const destPinIcon = L.divIcon({
  html: `<div style="
    width:32px; height:32px; background:#dc2626; color:#fff;
    border-radius:50%; border:3px solid #fff; box-shadow:0 3px 10px rgba(0,0,0,0.35);
    display:flex; align-items:center; justify-content:center;
    font-size:14px; font-weight:800;">B</div>`,
  className: "mock-dest-pin",
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

// Initial route bounds fit helper
function FitRouteBounds({ bounds, fitKey }) {
  const map = useMap();

  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, animate: true, duration: 0.8 });
    }
  }, [bounds, fitKey, map]);

  return null;
}

/**
 * NativeSmoothBusLayer:
 * Direct Leaflet Layer component.
 * - Instantiates L.marker directly on map mount (zero React reconciliation overhead).
 * - Animates the yellow school bus marker smoothly using requestAnimationFrame.
 * - Updates marker position using setMarkerSubpixelPosition (floating-point subpixel GPU precision, NO Leaflet .round() integer quantization).
 * - Smooth continuous heading rotation (smoothContinuousBearing) - zero deadband tremor, zero 360-degree snap flips.
 * - Directly updates DOM (.bus-svg-rotating transform, .bus-speed-text) so React doesn't re-render the marker.
 * - Throttles telemetry callbacks (speed, distance, ETA) to update UI cards.
 * - Camera tracking: Keeps the vehicle on-screen smoothly without conflicting CSS pan transitions.
 */
function NativeSmoothBusLayer({
  routeCoordinates,
  cumulativeDistances,
  totalDistanceMetres,
  simulationState,
  speedMultiplier,
  lockFocus,
  onUserPan,
  onTelemetryUpdate,
  onCompleted,
  resetTrigger,
}) {
  const map = useMap();
  const markerRef = useRef(null);
  const rafRef = useRef(null);
  const distCoveredRef = useRef(0);
  const continuousBearingRef = useRef(90);
  const lastTimeRef = useRef(0);
  const lastUiUpdateRef = useRef(0);

  // User drag detection to release camera lock
  useEffect(() => {
    const handleDrag = () => {
      if (onUserPan) onUserPan();
    };
    map.on("dragstart", handleDrag);
    return () => {
      map.off("dragstart", handleDrag);
    };
  }, [map, onUserPan]);

  // Clean stop animation
  const stopRaf = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Initialize marker on mount or route change
  useEffect(() => {
    if (!routeCoordinates || routeCoordinates.length < 2) return;

    stopRaf();
    distCoveredRef.current = 0;

    const firstPt = routeCoordinates[0];
    const secondPt = routeCoordinates[1];
    const initialBearing =
      routingService.calculateBearing(firstPt[0], firstPt[1], secondPt[0], secondPt[1]) || 90;

    continuousBearingRef.current = initialBearing;

    // Create marker once directly on the map if not already created
    if (!markerRef.current) {
      const busDivIcon = createRotatingBusIcon(
        { busNumber: "MOCK-BUS-01", speed: 40, status: "ON_ROUTE" },
        initialBearing - 90,
        true
      );
      markerRef.current = L.marker([firstPt[0], firstPt[1]], {
        icon: busDivIcon,
        zIndexOffset: 1500,
      }).addTo(map);

      markerRef.current.bindPopup(`
        <div style="min-width: 170px;">
          <span class="badge bg-warning text-dark fw-bold mb-1">MOCK SCHOOL BUS</span>
          <h6 class="fw-bold mb-1">MOCK-BUS-01</h6>
          <div class="small text-muted">Sandbox Mock Live Tracking</div>
        </div>
      `);
    } else {
      setMarkerSubpixelPosition(markerRef.current, map, [firstPt[0], firstPt[1]]);
      const el = markerRef.current.getElement();
      if (el) {
        const svg = el.querySelector(".bus-svg-rotating");
        if (svg) svg.style.transform = `rotate(${initialBearing - 90}deg)`;
        const speedEl = el.querySelector(".bus-speed-text");
        if (speedEl) speedEl.textContent = "0 km/h";
      }
    }

    return () => {
      stopRaf();
    };
  }, [routeCoordinates, resetTrigger, map, stopRaf]);

  // Clean unmount
  useEffect(() => {
    return () => {
      stopRaf();
      if (markerRef.current && map) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
    };
  }, [map, stopRaf]);

  // Main 90 FPS Animation loop
  useEffect(() => {
    if (simulationState !== "RUNNING" || !routeCoordinates || routeCoordinates.length < 2) {
      stopRaf();
      return;
    }

    lastTimeRef.current = performance.now();

    function step(now) {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05); // cap at 50ms
      lastTimeRef.current = now;

      // Strict physical vehicle velocity scaled by multiplier:
      // 1x = 40 km/h, 2x = 80 km/h, 4x = 160 km/h, 8x = 320 km/h
      const totalMetres = totalDistanceMetres;
      const remMetres = Math.max(0, totalMetres - distCoveredRef.current);
      const baseSpeedKmh = 40;
      let currentSpeedKmh = Math.round(baseSpeedKmh * speedMultiplier);

      // Smooth deceleration only in the final 25 meters before terminal stop
      if (remMetres < 25 && remMetres > 0) {
        currentSpeedKmh = Math.max(12, Math.round(currentSpeedKmh * (remMetres / 25)));
      }

      const effectiveSpeedMps = (currentSpeedKmh * 1000) / 3600;
      distCoveredRef.current += effectiveSpeedMps * dt;

      if (distCoveredRef.current >= totalMetres) {
        distCoveredRef.current = totalMetres;
        const lastPt = routeCoordinates[routeCoordinates.length - 1];

        if (markerRef.current) {
          setMarkerSubpixelPosition(markerRef.current, map, [lastPt[0], lastPt[1]]);
          const el = markerRef.current.getElement();
          if (el) {
            const speedEl = el.querySelector(".bus-speed-text");
            if (speedEl) speedEl.textContent = "0 km/h";
          }
        }

        if (onCompleted) onCompleted(lastPt, totalMetres);
        stopRaf();
        return;
      }

      // Sample exact road position along the OSRM geometry curves with 22m lookahead tangent
      const sample = samplePathAtDistance(
        routeCoordinates,
        cumulativeDistances,
        distCoveredRef.current,
        22
      );

      // Frame-rate independent continuous bearing smoothing (zero deadband tremor, zero 360-degree snap)
      continuousBearingRef.current = smoothContinuousBearing(
        continuousBearingRef.current,
        sample.bearing,
        10,
        dt
      );
      const cssRotation = continuousBearingRef.current - 90;

      // Direct Leaflet DOM transformation with floating-point subpixel GPU acceleration
      if (markerRef.current) {
        setMarkerSubpixelPosition(markerRef.current, map, [sample.lat, sample.lng]);
        const el = markerRef.current.getElement();
        if (el) {
          const svg = el.querySelector(".bus-svg-rotating");
          if (svg) svg.style.transform = `rotate(${cssRotation}deg)`;
          const speedEl = el.querySelector(".bus-speed-text");
          if (speedEl) speedEl.textContent = `${currentSpeedKmh} km/h`;
        }
      }

      // Camera Follow without animated pan conflicts:
      // If lockFocus is true, gently keep the bus in view without CSS container conflicts
      if (lockFocus) {
        try {
          const pt = map.latLngToContainerPoint([sample.lat, sample.lng]);
          const size = map.getSize();
          if (size.x > 0 && size.y > 0) {
            const pad = 40;
            const isNearEdge =
              pt.x < pad || pt.x > size.x - pad ||
              pt.y < pad || pt.y > size.y - pad;
            if (isNearEdge) {
              map.setView([sample.lat, sample.lng], map.getZoom(), { animate: false });
            }
          }
        } catch {}
      }

      // Throttled UI State update (~100ms) for progress indicators and dynamic second-by-second ETA
      if (now - lastUiUpdateRef.current > 100) {
        lastUiUpdateRef.current = now;
        const distKm = Number((distCoveredRef.current / 1000).toFixed(2));
        const remKm = Math.max(0, Number(((totalMetres - distCoveredRef.current) / 1000).toFixed(2)));
        const pct = Math.min(100, Math.round((distCoveredRef.current / totalMetres) * 100));

        if (onTelemetryUpdate) {
          onTelemetryUpdate({
            lat: sample.lat,
            lng: sample.lng,
            heading: normalizeAngle(continuousBearingRef.current),
            speed: currentSpeedKmh,
            distanceTravelledKm: distKm,
            remainingDistanceKm: remKm,
            progressPct: pct,
          });
        }
      }

      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {
      stopRaf();
    };
  }, [
    simulationState,
    routeCoordinates,
    cumulativeDistances,
    totalDistanceMetres,
    speedMultiplier,
    lockFocus,
    map,
    onCompleted,
    onTelemetryUpdate,
    stopRaf,
  ]);

  return null;
}

export default function MockLiveTrackingTestScreen() {
  // Selected real start and destination locations
  const [startLoc, setStartLoc] = useState(PRESET_LOCATIONS[0]);
  const [destLoc, setDestLoc] = useState(PRESET_LOCATIONS[3]);

  // Search input state
  const [startQuery, setStartQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [searchingStart, setSearchingStart] = useState(false);
  const [searchingDest, setSearchingDest] = useState(false);

  // Camera follow toggle (Default: false = Route Overview mode for 100% rock-solid map stability)
  const [lockFocus, setLockFocus] = useState(false);
  const [fitKey, setFitKey] = useState(0);

  // Road route geometry state
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [totalDistanceKm, setTotalDistanceKm] = useState(0);
  const [totalDistanceMetres, setTotalDistanceMetres] = useState(0);
  const [cumulativeDistances, setCumulativeDistances] = useState([0]);
  const [routeLoading, setRouteLoading] = useState(false);

  // Simulation run state
  const [simulationState, setSimulationState] = useState("IDLE"); // IDLE, RUNNING, PAUSED, COMPLETED
  const [speedMultiplier, setSpeedMultiplier] = useState(2); // 1x, 2x, 4x, 8x
  const [resetTrigger, setResetTrigger] = useState(0);

  // High-level telemetry state for UI panels
  const [simulatedBusPos, setSimulatedBusPos] = useState({
    lat: PRESET_LOCATIONS[0].latitude,
    lng: PRESET_LOCATIONS[0].longitude,
    heading: 90,
    speed: 0,
    distanceTravelledKm: 0,
    remainingDistanceKm: 0,
    progressPct: 0,
  });

  // Search locations from backend or OSM
  const searchLocations = async (query, setResults, setLoadingFlag) => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoadingFlag(true);
    try {
      const res = await api.get(`/api/locations/search?q=${encodeURIComponent(query.trim())}`, { skipLoading: true });
      const items = res.data?.data || [];
      if (items.length > 0) {
        setResults(
          items.map((it) => ({
            name: it.displayName || it.name,
            latitude: it.latitude,
            longitude: it.longitude,
            city: it.city || "India",
          }))
        );
      } else {
        const filtered = PRESET_LOCATIONS.filter(
          (p) =>
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.city.toLowerCase().includes(query.toLowerCase())
        );
        setResults(filtered);
      }
    } catch {
      const filtered = PRESET_LOCATIONS.filter((p) =>
        p.name.toLowerCase().includes(query.toLowerCase())
      );
      setResults(filtered);
    } finally {
      setLoadingFlag(false);
    }
  };

  // Debounced search for Start
  useEffect(() => {
    if (!startQuery.trim()) {
      setStartSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      searchLocations(startQuery, setStartSuggestions, setSearchingStart);
    }, 350);
    return () => clearTimeout(timer);
  }, [startQuery]);

  // Debounced search for Destination
  useEffect(() => {
    if (!destQuery.trim()) {
      setDestSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      searchLocations(destQuery, setDestSuggestions, setSearchingDest);
    }, 350);
    return () => clearTimeout(timer);
  }, [destQuery]);

  // Fetch true road-following route from OSRM whenever start or destination changes
  useEffect(() => {
    if (!startLoc?.latitude || !destLoc?.latitude) return;

    let isMounted = true;
    setRouteLoading(true);
    setSimulationState("IDLE");

    const points = [
      { latitude: startLoc.latitude, longitude: startLoc.longitude },
      { latitude: destLoc.latitude, longitude: destLoc.longitude },
    ];

    routingService
      .fetchRoadRoute(points)
      .then((res) => {
        if (!isMounted) return;
        if (res && res.coordinates?.length > 1) {
          setRouteCoordinates(res.coordinates);
          setTotalDistanceKm(res.distanceKm || 0);

          const { cumulative, totalDistance } = buildCumulativeDistances(res.coordinates);
          setCumulativeDistances(cumulative);
          setTotalDistanceMetres(totalDistance);

          const firstPt = res.coordinates[0];
          const secondPt = res.coordinates[1];
          const initialBearing =
            routingService.calculateBearing(firstPt[0], firstPt[1], secondPt[0], secondPt[1]) || 90;

          setSimulatedBusPos({
            lat: firstPt[0],
            lng: firstPt[1],
            heading: initialBearing,
            speed: 0,
            distanceTravelledKm: 0,
            remainingDistanceKm: res.distanceKm || 0,
            progressPct: 0,
          });

          setFitKey((k) => k + 1);
        }
      })
      .catch((err) => {
        console.warn("Mock route generation failed:", err);
      })
      .finally(() => {
        if (isMounted) setRouteLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [startLoc, destLoc]);

  // Controls: Start / Resume, Pause / Stop, Restart
  const handleStartTest = () => {
    if (simulationState === "COMPLETED") {
      handleRestartTest();
      return;
    }
    setSimulationState("RUNNING");
  };

  const handleStopTest = () => {
    setSimulationState("PAUSED");
    setSimulatedBusPos((prev) => ({ ...prev, speed: 0 }));
  };

  const handleRestartTest = () => {
    setResetTrigger((t) => t + 1);
    if (routeCoordinates.length > 1) {
      const firstPt = routeCoordinates[0];
      const secondPt = routeCoordinates[1];
      const initialBearing =
        routingService.calculateBearing(firstPt[0], firstPt[1], secondPt[0], secondPt[1]) || 90;

      setSimulatedBusPos({
        lat: firstPt[0],
        lng: firstPt[1],
        heading: initialBearing,
        speed: 40 * speedMultiplier,
        distanceTravelledKm: 0,
        remainingDistanceKm: totalDistanceKm,
        progressPct: 0,
      });
    }
    setSimulationState("RUNNING");
  };

  const handleTestCompleted = useCallback((lastPt, totalMetres) => {
    setSimulatedBusPos((prev) => ({
      ...prev,
      lat: lastPt[0],
      lng: lastPt[1],
      speed: 0,
      distanceTravelledKm: Number((totalMetres / 1000).toFixed(2)),
      remainingDistanceKm: 0,
      progressPct: 100,
    }));
    setSimulationState("COMPLETED");
  }, []);

  const handleTelemetryUpdate = useCallback((telemetry) => {
    setSimulatedBusPos((prev) => ({
      ...prev,
      ...telemetry,
    }));
  }, []);

  // Map Bounds to fit Start, Destination, and Polyline
  const mapBounds = useMemo(() => {
    if (routeCoordinates.length > 1) {
      return L.latLngBounds(routeCoordinates);
    }
    if (startLoc && destLoc) {
      return L.latLngBounds([
        [startLoc.latitude, startLoc.longitude],
        [destLoc.latitude, destLoc.longitude],
      ]);
    }
    return null;
  }, [routeCoordinates, startLoc, destLoc]);

  return (
    <div className="mock-live-tracking-screen">
      {/* Strict Sandboxed MOCK TEST MODE Header Banner */}
      <div
        className="alert alert-warning p-3 mb-4 rounded-4 shadow-sm border-2 border-warning d-flex align-items-center justify-content-between flex-wrap gap-2"
        style={{ background: "#fffbeb", borderColor: "#f59e0b" }}
      >
        <div className="d-flex align-items-center gap-3">
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: "#fef3c7",
              color: "#b45309",
              display: "grid",
              placeItems: "center",
              fontSize: "22px",
            }}
          >
            <i className="bi bi-shield-lock-fill" />
          </div>
          <div>
            <h5 className="mb-0 fw-bold text-dark">
              MOCK TEST MODE (Development Only — Isolated Sandboxed Test Runner)
            </h5>
            <small className="text-secondary" style={{ fontSize: "12px" }}>
              Strictly isolated from live fleet telemetry. Mock coordinates are never saved to database GPS tables or broadcast to parents.
            </small>
          </div>
        </div>
        <span className="badge bg-warning text-dark px-3 py-2 rounded-pill fw-bold">
          SANDBOXED TEST ROLE: TEST_USER
        </span>
      </div>

      {/* Location Search Bar & Controls Panel */}
      <div className="panel p-4 bg-white rounded-4 border mb-4 shadow-sm">
        <div className="row g-3">
          {/* Starting Location Picker */}
          <div className="col-lg-6">
            <label className="form-label small fw-bold text-muted mb-1">
              <i className="bi bi-geo-alt-fill text-success me-1" /> STARTING LOCATION (POINT A)
            </label>
            <div className="position-relative">
              <input
                type="text"
                className="form-control"
                placeholder="Search starting location or select below..."
                value={startQuery}
                onChange={(e) => setStartQuery(e.target.value)}
              />
              {searchingStart && (
                <span className="position-absolute end-0 top-50 translate-middle-y me-3 text-muted small">
                  Searching...
                </span>
              )}
              {startSuggestions.length > 0 && (
                <div
                  className="list-group position-absolute w-100 mt-1 shadow-lg border rounded-3 overflow-hidden"
                  style={{ zIndex: 1000, maxHeight: "200px", overflowY: "auto" }}
                >
                  {startSuggestions.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="list-group-item list-group-item-action small py-2"
                      onClick={() => {
                        setStartLoc(item);
                        setStartQuery("");
                        setStartSuggestions([]);
                      }}
                    >
                      <b>{item.name}</b> <span className="text-muted">({item.city})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Quick preset chips */}
            <div className="d-flex flex-wrap gap-1 mt-2">
              <small className="text-muted me-1 align-self-center" style={{ fontSize: "11px" }}>Presets:</small>
              {PRESET_LOCATIONS.slice(0, 4).map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`btn btn-sm py-0 px-2 rounded-pill ${startLoc.name === p.name ? "btn-success" : "btn-light border"}`}
                  style={{ fontSize: "11px" }}
                  onClick={() => setStartLoc(p)}
                >
                  {p.name.split(",")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Destination Location Picker */}
          <div className="col-lg-6">
            <label className="form-label small fw-bold text-muted mb-1">
              <i className="bi bi-flag-fill text-danger me-1" /> DESTINATION LOCATION (POINT B)
            </label>
            <div className="position-relative">
              <input
                type="text"
                className="form-control"
                placeholder="Search destination location or select below..."
                value={destQuery}
                onChange={(e) => setDestQuery(e.target.value)}
              />
              {searchingDest && (
                <span className="position-absolute end-0 top-50 translate-middle-y me-3 text-muted small">
                  Searching...
                </span>
              )}
              {destSuggestions.length > 0 && (
                <div
                  className="list-group position-absolute w-100 mt-1 shadow-lg border rounded-3 overflow-hidden"
                  style={{ zIndex: 1000, maxHeight: "200px", overflowY: "auto" }}
                >
                  {destSuggestions.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="list-group-item list-group-item-action small py-2"
                      onClick={() => {
                        setDestLoc(item);
                        setDestQuery("");
                        setDestSuggestions([]);
                      }}
                    >
                      <b>{item.name}</b> <span className="text-muted">({item.city})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Quick preset chips */}
            <div className="d-flex flex-wrap gap-1 mt-2">
              <small className="text-muted me-1 align-self-center" style={{ fontSize: "11px" }}>Presets:</small>
              {PRESET_LOCATIONS.slice(3, 7).map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`btn btn-sm py-0 px-2 rounded-pill ${destLoc.name === p.name ? "btn-danger text-white" : "btn-light border"}`}
                  style={{ fontSize: "11px" }}
                  onClick={() => setDestLoc(p)}
                >
                  {p.name.split(",")[0]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Controls & Simulation Speed */}
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mt-4 pt-3 border-top">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {simulationState !== "RUNNING" ? (
              <button
                type="button"
                className="btn btn-success btn-lg rounded-pill px-4 fw-bold shadow-sm"
                onClick={handleStartTest}
                disabled={routeLoading || routeCoordinates.length < 2}
              >
                <i className="bi bi-play-fill me-1" />
                {simulationState === "PAUSED" ? "Resume Live Tracking" : "Test Live Tracking"}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-danger btn-lg rounded-pill px-4 fw-bold shadow-sm"
                onClick={handleStopTest}
              >
                <i className="bi bi-pause-fill me-1" /> Pause Simulation
              </button>
            )}

            <button
              type="button"
              className="btn btn-outline-secondary rounded-pill px-3 py-2 fw-bold"
              onClick={handleRestartTest}
              disabled={routeLoading || routeCoordinates.length < 2}
            >
              <i className="bi bi-arrow-counterclockwise me-1" /> Restart Test
            </button>

            {/* Fit Full Route Button */}
            <button
              type="button"
              className="btn btn-sm btn-outline-primary rounded-pill px-3 py-2 fw-semibold"
              onClick={() => setFitKey((k) => k + 1)}
              title="Show entire route in view with rock-solid map stability"
            >
              <i className="bi bi-arrows-fullscreen me-1" /> Fit Full Route
            </button>

            {/* Follow Bus Camera Toggle */}
            <button
              type="button"
              className={`btn btn-sm rounded-pill px-3 py-2 fw-semibold ${lockFocus ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setLockFocus(!lockFocus)}
              title="Toggle camera following the bus"
            >
              <i className="bi bi-crosshair me-1" /> {lockFocus ? "Following Bus" : "Overview (Rock-Solid)"}
            </button>
          </div>

          {/* Speed Multiplier (1x = 40 km/h, 2x = 80 km/h, 4x = 160 km/h, 8x = 320 km/h) */}
          <div className="d-flex align-items-center gap-2">
            <span className="small text-muted fw-bold">SPEED:</span>
            {[1, 2, 4, 8].map((mult) => (
              <button
                key={mult}
                type="button"
                className={`btn btn-sm rounded-pill px-3 fw-bold ${speedMultiplier === mult ? "btn-primary" : "btn-light border"}`}
                onClick={() => setSpeedMultiplier(mult)}
              >
                {mult}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live Telemetry Progress Strip */}
      <div className="row g-2 mb-3">
        <div className="col-6 col-md-3">
          <div className="p-3 bg-white rounded-3 border h-100">
            <span className="text-muted small fw-bold d-block text-uppercase">SIMULATED SPEED & HEADING</span>
            <div className="d-flex align-items-baseline gap-2 mt-1">
              <span className="fs-4 fw-bold text-dark">{simulatedBusPos.speed}</span>
              <span className="text-muted small">km/h</span>
              <span className="badge bg-light text-primary border ms-auto">
                {Math.round(simulatedBusPos.heading)}°
              </span>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="p-3 bg-white rounded-3 border h-100">
            <span className="text-muted small fw-bold d-block text-uppercase">DISTANCE COVERED</span>
            <div className="fs-5 fw-bold text-dark mt-1">
              {simulatedBusPos.distanceTravelledKm} km
              <small className="text-muted fw-normal ms-1">/ {totalDistanceKm} km</small>
            </div>
            <small className="text-muted">{simulatedBusPos.remainingDistanceKm} km remaining</small>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="p-3 bg-white rounded-3 border h-100">
            <span className="text-muted small fw-bold d-block text-uppercase">PROGRESS & DYNAMIC ETA</span>
            <div className="d-flex justify-content-between align-items-center mt-1">
              <span className="fs-5 fw-bold text-success">{simulatedBusPos.progressPct}%</span>
              <span className="badge bg-primary text-white px-2 py-1 rounded-pill fw-bold" style={{ fontSize: "11px" }}>
                ⏳ {calculateEta(simulatedBusPos.remainingDistanceKm, simulatedBusPos.speed || (40 * speedMultiplier))}
              </span>
            </div>
            <div className="progress mt-1" style={{ height: "6px" }}>
              <div
                className="progress-bar bg-success"
                role="progressbar"
                style={{ width: `${simulatedBusPos.progressPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="p-3 bg-white rounded-3 border h-100">
            <span className="text-muted small fw-bold d-block text-uppercase">TEST STATUS</span>
            <div className="mt-1">
              <span
                className={`badge px-3 py-2 rounded-pill fw-bold ${
                  simulationState === "RUNNING"
                    ? "bg-success"
                    : simulationState === "COMPLETED"
                    ? "bg-primary"
                    : "bg-secondary"
                }`}
                style={{ fontSize: "12px" }}
              >
                {simulationState === "RUNNING"
                  ? "🔴 90 FPS SUBPIXEL GLIDING"
                  : simulationState === "COMPLETED"
                  ? "✅ COMPLETED: REACHED DESTINATION"
                  : "READY TO TEST"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Completed Test Status Notification */}
      {simulationState === "COMPLETED" && (
        <div className="alert alert-success p-3 rounded-4 mb-3 d-flex align-items-center justify-content-between shadow-sm">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-check-circle-fill text-success fs-4" />
            <div>
              <h6 className="mb-0 fw-bold">Mock Live Tracking Test Completed Successfully!</h6>
              <small className="text-muted">
                The yellow school bus smoothly traversed the complete road geometry ({totalDistanceKm} km) with realistic heading rotation and reached {destLoc.name}.
              </small>
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-outline-success fw-bold rounded-pill" onClick={handleRestartTest}>
            <i className="bi bi-arrow-repeat me-1" /> Run Again
          </button>
        </div>
      )}

      {/* Interactive Map */}
      <div
        className="rounded-4 overflow-hidden border shadow-sm position-relative"
        style={{ height: "540px", background: "#f8fafc" }}
      >
        <MapContainer
          center={[startLoc.latitude, startLoc.longitude]}
          zoom={14}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Fit initial route bounds */}
          {mapBounds && <FitRouteBounds bounds={mapBounds} fitKey={fitKey} />}

          {/* Road-following Polyline */}
          {routeCoordinates.length > 1 && (
            <Polyline
              positions={routeCoordinates}
              pathOptions={{
                color: "#2563eb",
                weight: 6,
                opacity: 0.85,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          )}

          {/* Starting Point Marker (A) */}
          {startLoc && (
            <Marker position={[startLoc.latitude, startLoc.longitude]} icon={startPinIcon}>
              <Popup>
                <div style={{ minWidth: "160px" }}>
                  <span className="badge bg-success mb-1">POINT A: START</span>
                  <h6 className="fw-bold mb-1">{startLoc.name}</h6>
                  <small className="text-muted">
                    <code>{startLoc.latitude.toFixed(5)}, {startLoc.longitude.toFixed(5)}</code>
                  </small>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Destination Point Marker (B) */}
          {destLoc && (
            <Marker position={[destLoc.latitude, destLoc.longitude]} icon={destPinIcon}>
              <Popup>
                <div style={{ minWidth: "160px" }}>
                  <span className="badge bg-danger mb-1">POINT B: DESTINATION</span>
                  <h6 className="fw-bold mb-1">{destLoc.name}</h6>
                  <small className="text-muted">
                    <code>{destLoc.latitude.toFixed(5)}, {destLoc.longitude.toFixed(5)}</code>
                  </small>
                </div>
              </Popup>
            </Marker>
          )}

          {/* 90 FPS Subpixel Native Leaflet Yellow School Bus Layer */}
          <NativeSmoothBusLayer
            routeCoordinates={routeCoordinates}
            cumulativeDistances={cumulativeDistances}
            totalDistanceMetres={totalDistanceMetres}
            simulationState={simulationState}
            speedMultiplier={speedMultiplier}
            lockFocus={lockFocus}
            onUserPan={() => setLockFocus(false)}
            onTelemetryUpdate={handleTelemetryUpdate}
            onCompleted={handleTestCompleted}
            resetTrigger={resetTrigger}
          />
        </MapContainer>
      </div>
    </div>
  );
}
