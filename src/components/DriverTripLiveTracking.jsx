import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import tripService from "../services/tripService";
import routeService from "../services/routeService";
import trackingService from "../services/trackingService";
import websocketService from "../services/websocketService";
import routingService, { calculateDistanceKm, calculateBearing, calculateEta } from "../services/routingService";
import { createRotatingBusIcon } from "./LiveMap";
import { bearingToCssRotation, distanceMetres } from "../utils/bearingUtils";
import SmoothAnimatedBusMarker from "./SmoothAnimatedBusMarker";

// Helper component to smoothly pan map without resetting user's zoom level
// Uses viewport deadband (center 60%): map stays completely still while bus glides smoothly inside deadband
function PanCamera({ coordinates, lockFocus, onUserPan }) {
  const map = useMap();
  const isPanningRef = useRef(false);

  // When user interacts with the map (drag/explore), notify parent to release camera lock
  useEffect(() => {
    const handleDragStart = () => {
      if (onUserPan) onUserPan();
    };
    map.on("dragstart", handleDragStart);
    return () => {
      map.off("dragstart", handleDragStart);
    };
  }, [map, onUserPan]);

  useEffect(() => {
    if (!lockFocus || !coordinates?.[0] || !coordinates?.[1] || isPanningRef.current) return;
    const [lat, lng] = coordinates;

    try {
      const pt = map.latLngToContainerPoint([lat, lng]);
      const size = map.getSize();
      if (!size.x || !size.y) return;

      const marginX = size.x * 0.22;
      const marginY = size.y * 0.22;

      const isOutsideDeadband =
        pt.x < marginX || pt.x > (size.x - marginX) ||
        pt.y < marginY || pt.y > (size.y - marginY);

      if (isOutsideDeadband) {
        // Gently keep vehicle inside viewport without animated container conflicts
        map.setView([lat, lng], map.getZoom(), { animate: false });
      }
    } catch {
      // map resizing
    }
  }, [coordinates, lockFocus, map]);

  return null;
}

// Helper to fit bounds once when route loads
function InitialRouteFit({ bounds }) {
  const map = useMap();
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!fittedRef.current && bounds && bounds.isValid()) {
      fittedRef.current = true;
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, animate: true, duration: 0.8 });
    }
  }, [bounds, map]);

  return null;
}

// Compass direction helper
function getCompassDirection(deg) {
  if (deg == null || isNaN(deg)) return "N";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

// Stop icons generator
function createStopIcon(order, isStart, isEnd) {
  let bgColor = "#2563eb";
  let label = String(order);
  let iconClass = "bi-geo-alt-fill";

  if (isStart) {
    bgColor = "#16a34a";
    label = "A";
    iconClass = "bi-play-fill";
  } else if (isEnd) {
    bgColor = "#dc2626";
    label = "B";
    iconClass = "bi-flag-fill";
  }

  const html = `
    <div style="
      width: 28px; height: 28px;
      background: ${bgColor};
      color: #ffffff;
      border: 2.5px solid #ffffff;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 800;
      box-shadow: 0 3px 8px rgba(0,0,0,0.35);
      cursor: pointer;
    ">
      ${label}
    </div>
  `;

  return L.divIcon({
    html,
    className: "driver-route-stop-icon",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

export default function DriverTripLiveTracking({ tripId, onBack, onTripUpdated }) {
  const [trip, setTrip] = useState(null);
  const [route, setRoute] = useState(null);
  const [roadPolyline, setRoadPolyline] = useState([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [lockFocus, setLockFocus] = useState(true);

  // Live Telemetry state (Authoritative source)
  const [liveLocation, setLiveLocation] = useState({
    latitude: 16.3067,
    longitude: 80.4365,
    rawLatitude: 16.3067,
    rawLongitude: 80.4365,
    speed: 0,
    heading: 0,
    accuracy: 5,
    gpsTime: new Date().toISOString(),
    locationName: "Acquiring GPS fix...",
    nearbyLandmark: "",
    status: "STANDBY",
    provider: "gps",
    pingsCount: 0,
  });

  const lastGpsTimeRef = useRef(0);

  // Load trip and route details
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    async function loadTripAndRoute() {
      try {
        const tripData = await tripService.getById(tripId, { skipLoading: true });
        if (!isMounted || !tripData) return;
        setTrip(tripData);

        if (tripData.routeId) {
          const routeData = await routeService.getById(tripData.routeId, { skipLoading: true });
          if (!isMounted || !routeData) return;
          setRoute(routeData);

          // Build ordered stops list for road routing
          const orderedStops = (routeData.stops || []).slice().sort((a, b) => (a.stopOrder || 0) - (b.stopOrder || 0));
          if (orderedStops.length >= 2) {
            const roadRes = await routingService.fetchRoadRoute(orderedStops);
            if (isMounted && roadRes && roadRes.coordinates?.length > 0) {
              setRoadPolyline(roadRes.coordinates);
              setRouteDistanceKm(roadRes.distanceKm || 0);
            }
          }
        }

        // Fetch latest authoritative location for this bus
        if (tripData.busId) {
          try {
            const latest = await trackingService.getLatestLocation(tripData.busId, { skipLoading: true });
            if (isMounted && latest) {
              setLiveLocation((prev) => ({
                ...prev,
                latitude: latest.latitude ?? prev.latitude,
                longitude: latest.longitude ?? prev.longitude,
                rawLatitude: latest.rawLatitude ?? latest.latitude ?? prev.rawLatitude,
                rawLongitude: latest.rawLongitude ?? latest.longitude ?? prev.rawLongitude,
                speed: latest.speed ?? 0,
                heading: latest.heading ?? prev.heading,
                accuracy: latest.accuracy ?? prev.accuracy,
                gpsTime: latest.gpsTime || new Date().toISOString(),
                locationName: latest.locationName || prev.locationName,
                nearbyLandmark: latest.nearbyLandmark || prev.nearbyLandmark,
                status: latest.status || tripData.status,
                provider: latest.provider || "gps",
                pingsCount: prev.pingsCount + 1,
              }));
              lastGpsTimeRef.current = new Date(latest.gpsTime || 0).getTime();
            }
          } catch {
            // standby
          }
        }
      } catch (err) {
        console.error("Failed to load trip live tracking details:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadTripAndRoute();
    return () => { isMounted = false; };
  }, [tripId]);

  // Handle incoming authoritative GPS location packet (from WebSocket or Polling)
  const applyGpsUpdate = useCallback((incoming) => {
    if (!incoming || !incoming.latitude || !incoming.longitude) return;

    const incomingTime = new Date(incoming.gpsTime || incoming.receivedAt || Date.now()).getTime();
    if (incomingTime < lastGpsTimeRef.current - 1000) {
      // Out-of-order delayed update guard
      return;
    }
    lastGpsTimeRef.current = incomingTime;

    setLiveLocation((prev) => ({
      ...prev,
      latitude: incoming.latitude,
      longitude: incoming.longitude,
      rawLatitude: incoming.rawLatitude ?? incoming.latitude,
      rawLongitude: incoming.rawLongitude ?? incoming.longitude,
      speed: incoming.speed != null ? incoming.speed : prev.speed,
      heading: incoming.heading != null ? incoming.heading : prev.heading,
      accuracy: incoming.accuracy != null ? incoming.accuracy : prev.accuracy,
      gpsTime: incoming.gpsTime || new Date().toISOString(),
      locationName: incoming.locationName || prev.locationName,
      nearbyLandmark: incoming.nearbyLandmark || prev.nearbyLandmark,
      status: incoming.status || prev.status,
      provider: incoming.provider || prev.provider,
      pingsCount: prev.pingsCount + 1,
    }));
  }, []);

  // WebSocket Subscription for Real-time GPS Telemetry
  useEffect(() => {
    if (!trip?.busId) return;
    const busId = trip.busId;

    const unsubBus = websocketService.subscribe(`/topic/bus/${busId}`, applyGpsUpdate);
    const unsubAll = websocketService.subscribe("/topic/tracking", (incoming) => {
      if (incoming && String(incoming.busId) === String(busId)) {
        applyGpsUpdate(incoming);
      }
    });

    // 3-second adaptive backup polling to ensure non-stop synchronization
    const pollInterval = setInterval(() => {
      trackingService.getLatestLocation(busId, { skipLoading: true })
        .then(applyGpsUpdate)
        .catch(() => {});
    }, 3000);

    return () => {
      if (typeof unsubBus === "function") unsubBus();
      if (typeof unsubAll === "function") unsubAll();
      clearInterval(pollInterval);
    };
  }, [trip?.busId, applyGpsUpdate]);

  // Calculate Ordered Stops, Destination, and Next Stop
  const orderedStops = useMemo(() => {
    if (!route?.stops) return [];
    return route.stops.slice().sort((a, b) => (a.stopOrder || 0) - (b.stopOrder || 0));
  }, [route]);

  const destinationStop = orderedStops.length > 0 ? orderedStops[orderedStops.length - 1] : null;

  // Next Stop & Remaining Distance calculations
  const { nextStop, distanceToNextMeters, remainingDistanceKm, routeProgressPct } = useMemo(() => {
    const curLat = liveLocation.latitude;
    const curLng = liveLocation.longitude;

    if (!orderedStops || orderedStops.length === 0) {
      return { nextStop: null, distanceToNextMeters: 0, remainingDistanceKm: 0, routeProgressPct: 0 };
    }

    // Find next unreached stop ahead
    let upcoming = null;
    let minUpcomingDist = Infinity;

    for (let i = 0; i < orderedStops.length; i++) {
      const s = orderedStops[i];
      if (s.latitude == null || s.longitude == null) continue;
      const dist = calculateDistanceKm(curLat, curLng, s.latitude, s.longitude) * 1000;
      // If stop is further than 40m, treat as next upcoming stop
      if (dist > 40 && dist < minUpcomingDist) {
        minUpcomingDist = dist;
        upcoming = s;
      }
    }

    if (!upcoming) {
      upcoming = destinationStop;
      minUpcomingDist = destinationStop ? calculateDistanceKm(curLat, curLng, destinationStop.latitude, destinationStop.longitude) * 1000 : 0;
    }

    // Distance to final destination
    let distToDestKm = 0;
    if (destinationStop && destinationStop.latitude != null) {
      distToDestKm = calculateDistanceKm(curLat, curLng, destinationStop.latitude, destinationStop.longitude);
    }

    // Route progress
    const totalKm = routeDistanceKm > 0 ? routeDistanceKm : 10;
    const coveredKm = Math.max(0, totalKm - distToDestKm);
    const progress = Math.min(100, Math.max(5, Math.round((coveredKm / totalKm) * 100)));

    return {
      nextStop: upcoming,
      distanceToNextMeters: Math.round(minUpcomingDist),
      remainingDistanceKm: distToDestKm,
      routeProgressPct: progress,
    };
  }, [orderedStops, destinationStop, liveLocation.latitude, liveLocation.longitude, routeDistanceKm]);

  // Map Bounds
  const mapBounds = useMemo(() => {
    const pts = [];
    if (roadPolyline.length > 0) {
      roadPolyline.forEach((p) => pts.push(p));
    } else if (orderedStops.length > 0) {
      orderedStops.forEach((s) => {
        if (s.latitude && s.longitude) pts.push([s.latitude, s.longitude]);
      });
    }
    if (liveLocation.latitude && liveLocation.longitude) {
      pts.push([liveLocation.latitude, liveLocation.longitude]);
    }
    return pts.length > 1 ? L.latLngBounds(pts) : null;
  }, [roadPolyline, orderedStops, liveLocation.latitude, liveLocation.longitude]);

  // Trip Status Actions
  const handleStartTrip = async () => {
    if (!trip) return;
    setActionLoading(true);
    try {
      const updated = await tripService.startScheduledTrip(trip.id);
      setTrip(updated);
      if (onTripUpdated) onTripUpdated();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to start trip.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEndTrip = async () => {
    if (!trip) return;
    if (!window.confirm("Are you sure you want to complete this trip? This will mark the bus offline.")) return;
    setActionLoading(true);
    try {
      const updated = await tripService.endTrip(trip.id);
      setTrip(updated);
      if (onTripUpdated) onTripUpdated();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to complete trip.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-5 text-center bg-white rounded-4 border">
        <div className="spinner-border text-primary mb-3" role="status" />
        <h5 className="fw-bold">Loading live route and GPS telemetry...</h5>
        <p className="text-muted small">Fetching assigned road-following geometry and bus location</p>
      </div>
    );
  }

  const busMarkerData = {
    busNumber: trip?.busNumber || "BUS",
    speed: liveLocation.speed,
    status: trip?.status === "IN_PROGRESS" ? "ON_ROUTE" : (trip?.status || "STANDBY"),
  };
  const cssRotation = bearingToCssRotation(liveLocation.heading || 0);
  const busIcon = createRotatingBusIcon(busMarkerData, cssRotation, true);

  return (
    <div className="driver-live-tracking-screen">
      {/* Top Header & Navigation Bar */}
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div className="d-flex align-items-center gap-3">
          <button
            type="button"
            className="btn btn-outline-secondary rounded-pill px-3 py-1 fw-bold"
            onClick={onBack}
          >
            <i className="bi bi-arrow-left me-1" /> Back to My Trips
          </button>
          <div>
            <div className="d-flex align-items-center gap-2">
              <h4 className="fw-bold mb-0 text-dark">
                {trip?.routeName || "Assigned Campus Route"}
              </h4>
              <span className={`badge ${trip?.status === "IN_PROGRESS" ? "bg-success" : trip?.status === "COMPLETED" ? "bg-secondary" : "bg-primary"} px-3 py-1 rounded-pill`}>
                {trip?.status === "IN_PROGRESS" ? "🔴 IN PROGRESS" : trip?.status}
              </span>
            </div>
            <small className="text-muted">
              Assigned Bus: <b className="text-dark">{trip?.busNumber}</b> ({trip?.busName}) · {trip?.tripType || "MORNING"} RUN
            </small>
          </div>
        </div>

        {/* Trip Action Button */}
        <div className="d-flex align-items-center gap-2">
          {trip?.status === "SCHEDULED" && (
            <button
              type="button"
              className="btn btn-primary rounded-pill px-4 fw-bold"
              onClick={handleStartTrip}
              disabled={actionLoading}
            >
              {actionLoading ? "Starting..." : <>Start This Trip <i className="bi bi-play-fill ms-1" /></>}
            </button>
          )}

          {trip?.status === "IN_PROGRESS" && (
            <button
              type="button"
              className="btn btn-danger rounded-pill px-4 fw-bold"
              onClick={handleEndTrip}
              disabled={actionLoading}
            >
              {actionLoading ? "Completing..." : <>Complete Trip <i className="bi bi-check-lg ms-1" /></>}
            </button>
          )}

          <button
            type="button"
            className={`btn btn-sm rounded-pill px-3 ${lockFocus ? "btn-primary" : "btn-outline-secondary"}`}
            onClick={() => setLockFocus(!lockFocus)}
            title="Lock map camera focus on bus location"
          >
            <i className="bi bi-crosshair me-1" /> {lockFocus ? "Locked on Bus" : "Free Pan"}
          </button>
        </div>
      </div>

      {/* Live Route Telemetry Dashboard Strip */}
      <div className="row g-2 mb-3">
        <div className="col-6 col-md-3">
          <div className="p-3 bg-white rounded-3 border h-100">
            <span className="text-muted small fw-bold d-block text-uppercase">CURRENT SPEED & HEADING</span>
            <div className="d-flex align-items-baseline gap-2 mt-1">
              <span className="fs-4 fw-bold text-dark">{Math.round(liveLocation.speed)}</span>
              <span className="text-muted small">km/h</span>
              <span className="badge bg-light text-primary border ms-auto">
                {Math.round(liveLocation.heading)}° {getCompassDirection(liveLocation.heading)}
              </span>
            </div>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="p-3 bg-white rounded-3 border h-100">
            <span className="text-muted small fw-bold d-block text-uppercase">NEXT STOP AHEAD</span>
            <div className="fw-bold text-dark text-truncate mt-1" style={{ fontSize: "15px" }}>
              📍 {nextStop ? nextStop.name : "Arriving at Terminal"}
            </div>
            <small className="text-primary fw-bold">
              {distanceToNextMeters > 1000 ? `${(distanceToNextMeters / 1000).toFixed(1)} km away` : `${distanceToNextMeters}m away`} · ⏳ {calculateEta(distanceToNextMeters / 1000, liveLocation.speed || 30)}
            </small>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="p-3 bg-white rounded-3 border h-100">
            <span className="text-muted small fw-bold d-block text-uppercase">DESTINATION & REMAINING</span>
            <div className="fw-bold text-dark text-truncate mt-1" style={{ fontSize: "15px" }}>
              🏁 {destinationStop ? destinationStop.name : "Main Campus"}
            </div>
            <small className="text-muted">
              {remainingDistanceKm.toFixed(1)} km · ⏳ {calculateEta(remainingDistanceKm, liveLocation.speed || 30)}
            </small>
          </div>
        </div>

        <div className="col-6 col-md-3">
          <div className="p-3 bg-white rounded-3 border h-100">
            <span className="text-muted small fw-bold d-block text-uppercase">ROUTE PROGRESS</span>
            <div className="d-flex justify-content-between align-items-center mt-1">
              <span className="fs-5 fw-bold text-success">{routeProgressPct}%</span>
              <small className="text-muted">{orderedStops.length} stops total</small>
            </div>
            <div className="progress mt-1" style={{ height: "6px" }}>
              <div
                className="progress-bar bg-success"
                role="progressbar"
                style={{ width: `${routeProgressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Road Map with Yellow Bus Marker & Ordered Stops */}
      <div
        className="rounded-4 overflow-hidden border shadow-sm position-relative mb-3"
        style={{ height: "520px", background: "#f8fafc" }}
      >
        <MapContainer
          center={[liveLocation.latitude, liveLocation.longitude]}
          zoom={14}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Initial bounds fit */}
          {mapBounds && <InitialRouteFit bounds={mapBounds} />}

          {/* Camera follow without resetting zoom; user drag frees camera */}
          <PanCamera
            coordinates={[liveLocation.latitude, liveLocation.longitude]}
            lockFocus={lockFocus}
            onUserPan={() => setLockFocus(false)}
          />

          {/* Road-Following Polyline (OSRM route geometry) */}
          {roadPolyline.length > 1 && (
            <Polyline
              positions={roadPolyline}
              pathOptions={{
                color: "#2563eb",
                weight: 6,
                opacity: 0.85,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          )}

          {/* Ordered Route Stops */}
          {orderedStops.map((stop, idx) => {
            if (stop.latitude == null || stop.longitude == null) return null;
            const isStart = idx === 0;
            const isEnd = idx === orderedStops.length - 1;
            const stopIcon = createStopIcon(idx + 1, isStart, isEnd);

            return (
              <Marker
                key={stop.stopId || idx}
                position={[stop.latitude, stop.longitude]}
                icon={stopIcon}
              >
                <Popup>
                  <div style={{ minWidth: "160px" }}>
                    <span className="badge bg-light text-primary border mb-1">
                      {isStart ? "STARTING TERMINAL" : isEnd ? "DESTINATION" : `STOP #${idx + 1}`}
                    </span>
                    <h6 className="fw-bold mb-1">{stop.name}</h6>
                    {stop.address && <p className="text-muted small mb-1">{stop.address}</p>}
                    {stop.arrivalTime && (
                      <small className="text-muted d-block">
                        Scheduled Arrival: <b>{stop.arrivalTime}</b>
                      </small>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Bus Marker (Yellow School Bus with 60 FPS Road Following & Smooth Turning) */}
          {liveLocation.latitude && liveLocation.longitude && (
            <SmoothAnimatedBusMarker
              bus={{
                ...liveLocation,
                busNumber: trip?.busNumber,
                busName: trip?.busName,
                status: trip?.status === "IN_PROGRESS" ? "ON_ROUTE" : liveLocation.status,
              }}
              isSelected={true}
              roadPolyline={roadPolyline}
            >
              <Popup>
                <div style={{ minWidth: "200px" }}>
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="badge bg-warning text-dark fw-bold">LIVE BUS</span>
                    <span className="text-success small fw-bold">● {liveLocation.status}</span>
                  </div>
                  <h6 className="fw-bold mb-1">{trip?.busNumber} ({trip?.busName})</h6>
                  <div className="small text-muted mb-2">
                    Speed: <b>{Math.round(liveLocation.speed)} km/h</b> · Heading: <b>{Math.round(liveLocation.heading)}°</b>
                  </div>
                  <div className="small text-muted mb-1">
                    GPS: <code>{liveLocation.rawLatitude.toFixed(6)}, {liveLocation.rawLongitude.toFixed(6)}</code>
                  </div>
                  {liveLocation.locationName && (
                    <div className="small text-primary">📍 {liveLocation.locationName}</div>
                  )}
                </div>
              </Popup>
            </SmoothAnimatedBusMarker>
          )}
        </MapContainer>
      </div>

      {/* Authoritative Live Telemetry & Testing Verification Bar */}
      <div className="p-3 bg-white rounded-3 border">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <span className="badge bg-light text-success border px-2 py-1 mb-1">
              <i className="bi bi-broadcast me-1" /> AUTHORITATIVE BACKEND TELEMETRY STREAM
            </span>
            <div className="small text-muted">
              GPS Coordinates: <b className="text-dark">{liveLocation.rawLatitude.toFixed(6)}° N, {liveLocation.rawLongitude.toFixed(6)}° E</b>
              {" · "}Accuracy: <b>±{Math.round(liveLocation.accuracy || 5)}m</b>
              {" · "}Last Update: <b>{new Date(liveLocation.gpsTime).toLocaleTimeString()}</b>
              {" · "}Packets Received: <b>{liveLocation.pingsCount}</b>
            </div>
            {liveLocation.locationName && (
              <div className="small text-primary mt-1">
                📍 {liveLocation.locationName} {liveLocation.nearbyLandmark ? `(${liveLocation.nearbyLandmark})` : ""}
              </div>
            )}
          </div>
          <div className="text-end">
            <span className="badge bg-success-subtle text-success border px-3 py-2 rounded-pill">
              🟢 SYNCHRONIZED ACROSS ALL DASHBOARDS
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
