import React, { useState, useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import routingService from "../services/routingService";

// Mapbox Access Token loaded from environment variables
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

// Custom stop pin for route builder
const createBuilderStopIcon = (index, total) => {
  const isStart = index === 0;
  const isEnd = index === total - 1 && total > 1;
  const bg = isStart ? "#16a34a" : isEnd ? "#ea580c" : "#2563eb";
  const label = isStart ? "S" : isEnd ? "E" : `${index + 1}`;

  const html = `
    <div style="
      background-color: ${bg};
      color: #ffffff;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 3px solid #ffffff;
      box-shadow: 0 3px 10px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 12px;
      cursor: pointer;
    ">
      ${label}
    </div>
  `;
  return L.divIcon({
    html: html,
    className: "builder-stop-icon",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

function MapCameraController({ center, zoomLevel, routeCoordinates, fitRouteTrigger }) {
  const map = useMap();
  const lastCenterRef = useRef(null);

  // Center onto clicked/selected location
  useEffect(() => {
    if (center && center[0] && center[1]) {
      const centerKey = `${Number(center[0]).toFixed(5)},${Number(center[1]).toFixed(5)}`;
      if (lastCenterRef.current !== centerKey) {
        lastCenterRef.current = centerKey;
        map.setView(center, zoomLevel || 15, { animate: true, duration: 0.8 });
      }
    }
  }, [center, zoomLevel, map]);

  // Automatically focus and fit bounds to the entire route
  useEffect(() => {
    if (routeCoordinates && routeCoordinates.length > 1) {
      try {
        const bounds = L.latLngBounds(routeCoordinates);
        if (bounds.isValid()) {
          map.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 15,
            animate: true,
            duration: 0.9,
          });
        }
      } catch (e) {
        console.warn("fitBounds failed:", e);
      }
    }
  }, [fitRouteTrigger, routeCoordinates, map]);

  return null;
}

// Haversine distance helper for route optimization
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function RouteBuilderMap({
  initialRoute = null,
  onSave,
  onClose,
}) {
  const [routeName, setRouteName] = useState(
    initialRoute?.name || "Campus Route - India"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [stops, setStops] = useState(
    initialRoute?.stops && initialRoute.stops.length > 0
      ? initialRoute.stops
      : [
          {
            id: 1,
            stopName: initialRoute?.startPoint || "Start Point",
            latitude: 16.3045,
            longitude: 80.4485,
            address: "Starting Location, India",
            stopOrder: 1,
            arrivalTime: "07:30 AM",
          },
          {
            id: 2,
            stopName: initialRoute?.endPoint || "Campus Destination",
            latitude: 16.4425,
            longitude: 80.6225,
            address: "Main Campus, India",
            stopOrder: 2,
            arrivalTime: "08:15 AM",
          },
        ]
  );

  const [mapCenter, setMapCenter] = useState([
    initialRoute?.stops?.[0]?.latitude || 16.3045,
    initialRoute?.stops?.[0]?.longitude || 80.4485,
  ]);
  const [roadCoordinates, setRoadCoordinates] = useState([]);
  const [totalDistanceKm, setTotalDistanceKm] = useState(
    initialRoute?.distance ? Number(String(initialRoute.distance).replace(/[^\d.]/g, "")) : 0
  );
  const [totalDurationMins, setTotalDurationMins] = useState(
    initialRoute?.durationMinutes || 35
  );
  const [rawGeoJson, setRawGeoJson] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);

  const [mapZoom, setMapZoom] = useState(13);
  const [fitRouteTrigger, setFitRouteTrigger] = useState(0);
  const [geocodingMsg, setGeocodingMsg] = useState("");
  const [optimizationMsg, setOptimizationMsg] = useState("");

  // Live Location Search (Mapbox Search Box & Geocoding Autocomplete)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [sessionToken, setSessionToken] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "sess_" + Date.now()
  );
  const searchContainerRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Category Icon resolver
  const getCategoryIcon = (category = "") => {
    const c = category.toLowerCase();
    if (c.includes("dormitory") || c.includes("pg") || c.includes("hostel") || c.includes("hotel")) {
      return "bi-building-fill text-warning";
    }
    if (c.includes("college") || c.includes("university") || c.includes("school") || c.includes("education")) {
      return "bi-mortarboard-fill text-primary";
    }
    if (c.includes("hospital") || c.includes("health") || c.includes("clinic")) {
      return "bi-hospital-fill text-danger";
    }
    if (c.includes("transit") || c.includes("bus") || c.includes("railway") || c.includes("station")) {
      return "bi-bus-front-fill text-info";
    }
    if (c.includes("shop") || c.includes("store") || c.includes("mall") || c.includes("market")) {
      return "bi-cart-fill text-success";
    }
    return "bi-geo-alt-fill text-danger";
  };

  // Debounced search querying Mapbox Search Box Suggest API with Geocoding v5 fallback
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const q = searchQuery.trim();
        let items = [];

        // 1. Try Mapbox Search Box Suggest API (superior for POIs like hostels, PGs, schools, campuses, buildings)
        if (MAPBOX_TOKEN) {
          try {
            const suggestUrl = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(
              q
            )}&access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}&country=IN&language=en&limit=8`;
            const res = await fetch(suggestUrl);
            const data = await res.json();

            if (data.suggestions && data.suggestions.length > 0) {
              items = data.suggestions.map((s) => ({
                id: s.mapbox_id || s.name + Math.random(),
                name: s.name || s.name_preferred,
                address:
                  s.full_address ||
                  s.place_formatted ||
                  (s.context?.place?.name ? `${s.name}, ${s.context.place.name}, India` : `${s.name}, India`),
                mapboxId: s.mapbox_id,
                featureType: s.feature_type,
                category: s.poi_category?.[0] || s.feature_type || "location",
                source: "searchbox",
              }));
            }
          } catch (e) {
            console.warn("Mapbox suggest error:", e);
          }
        }

        // 2. If suggest returned 0 items, fallback to Mapbox Geocoding v5
        if (items.length === 0 && MAPBOX_TOKEN) {
          try {
            const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
              q
            )}.json?country=IN&access_token=${MAPBOX_TOKEN}&limit=8`;
            const geoRes = await fetch(geoUrl);
            const geoData = await geoRes.json();
            if (geoData.features && geoData.features.length > 0) {
              items = geoData.features.map((f) => ({
                id: f.id,
                name: f.text || f.place_name?.split(",")[0],
                address: f.place_name || `${f.text}, India`,
                coordinates: f.geometry?.coordinates, // [lng, lat]
                category: f.place_type?.[0] || "place",
                source: "geocoding",
              }));
            }
          } catch (e) {
            console.warn("Mapbox geocoding error:", e);
          }
        }

        // 3. Fallback: Photon Komoot (OpenStreetMap with fuzzy search across India)
        if (items.length === 0) {
          try {
            const pRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8`);
            const pData = await pRes.json();
            if (pData.features && pData.features.length > 0) {
              items = pData.features.map((f) => {
                const props = f.properties || {};
                const name = props.name || props.street || q;
                const parts = [name, props.city, props.state, props.country].filter(Boolean);
                return {
                  id: "photon_" + (props.osm_id || Math.random()),
                  name: name,
                  address: parts.join(", "),
                  coordinates: f.geometry?.coordinates, // [lng, lat]
                  category: props.osm_value || props.type || "landmark",
                  source: "osm",
                };
              });
            }
          } catch (e) {
            console.warn("Photon fallback error:", e);
          }
        }

        // 4. Fallback: Nominatim OpenStreetMap
        if (items.length === 0) {
          try {
            const nRes = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=in&limit=8`
            );
            const nData = await nRes.json();
            if (Array.isArray(nData) && nData.length > 0) {
              items = nData.map((n) => ({
                id: "nom_" + (n.place_id || Math.random()),
                name: n.display_name?.split(",")[0] || q,
                address: n.display_name,
                coordinates: [parseFloat(n.lon), parseFloat(n.lat)], // [lng, lat]
                category: n.type || "place",
                source: "osm",
              }));
            }
          } catch (e) {
            console.warn("Nominatim fallback error:", e);
          }
        }

        setSearchResults(items);
        setShowDropdown(true);
      } catch (err) {
        console.error("Mapbox search error:", err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, sessionToken]);

  // Handle location selection from dropdown
  const handleSelectLocation = async (item) => {
    setIsSearching(true);
    setShowDropdown(false);
    try {
      let lat, lon;
      let fullAddress = item.address;
      let placeName = item.name;

      if (item.source === "searchbox" && item.mapboxId && MAPBOX_TOKEN) {
        // Retrieve full coordinates from Mapbox Search Box Retrieve API
        const retUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${item.mapboxId}?access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}`;
        const retRes = await fetch(retUrl);
        const retData = await retRes.json();
        const feat = retData.features?.[0];
        if (feat && feat.geometry?.coordinates) {
          [lon, lat] = feat.geometry.coordinates;
          fullAddress =
            feat.properties?.full_address || feat.properties?.place_formatted || item.address;
          placeName = feat.properties?.name || item.name;
        }
      } else if (item.coordinates && item.coordinates.length >= 2) {
        [lon, lat] = item.coordinates;
      }

      if (lat && lon) {
        const newOrder = stops.length + 1;
        const newStop = {
          id: Date.now(),
          stopName: placeName,
          latitude: Number(lat.toFixed(5)),
          longitude: Number(lon.toFixed(5)),
          address: fullAddress,
          stopOrder: newOrder,
          arrivalTime: "",
        };

        setStops((prev) => [...prev, newStop]);
        setMapCenter([lat, lon]);
        setMapZoom(15);
        setGeocodingMsg(`Added stop "${placeName}".`);
        setSearchQuery("");
        setSearchResults([]);
        // Refresh session token for subsequent search sessions
        setSessionToken(
          typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "sess_" + Date.now()
        );

        setTimeout(() => {
          setFitRouteTrigger((prev) => prev + 1);
          setGeocodingMsg("");
        }, 1800);
      }
    } catch (err) {
      console.error("Failed to retrieve location coordinates:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Recalculate OSRM Road Route whenever stops change
  useEffect(() => {
    let isSubscribed = true;
    async function updateRouteGeometry() {
      if (stops.length < 2) {
        setRoadCoordinates([]);
        setTotalDistanceKm(0);
        return;
      }
      setIsCalculating(true);
      try {
        const road = await routingService.fetchRoadRoute(stops);
        if (isSubscribed && road) {
          setRoadCoordinates(road.coordinates || []);
          setTotalDistanceKm(road.distanceKm);
          setTotalDurationMins(road.durationMinutes);
          setRawGeoJson(road.geojson);
        }
      } catch (err) {
        console.warn("Road routing calculation error:", err);
      } finally {
        if (isSubscribed) setIsCalculating(false);
      }
    }

    updateRouteGeometry();
    return () => {
      isSubscribed = false;
    };
  }, [stops]);

  // Handle map click with live reverse-geocoding in India
  const handleMapClick = async (latlng) => {
    const newOrder = stops.length + 1;
    const tempId = Date.now();
    const lat = Number(latlng.lat.toFixed(5));
    const lng = Number(latlng.lng.toFixed(5));

    const newStop = {
      id: tempId,
      stopName: `Stop ${newOrder}`,
      latitude: lat,
      longitude: lng,
      address: `Locating real address in India (${lat.toFixed(4)}, ${lng.toFixed(4)})...`,
      stopOrder: newOrder,
      arrivalTime: "",
    };

    setStops((prev) => [...prev, newStop]);
    setGeocodingMsg(`Locating Indian address for Stop ${newOrder}...`);

    // Reverse geocode via Mapbox Geocoding API
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&country=in&limit=1`
      );
      if (res.ok) {
        const data = await res.json();
        const feature = data.features?.[0];
        const placeName = feature?.text || feature?.place_name?.split(",")?.[0] || `Stop ${newOrder}`;
        const fullAddr = feature?.place_name || `${lat}, ${lng}`;

        setStops((prev) =>
          prev.map((s) =>
            s.id === tempId
              ? { ...s, stopName: placeName, address: fullAddr }
              : s
          )
        );
        setGeocodingMsg(`Stop ${newOrder} added: ${placeName}`);
        setTimeout(() => setGeocodingMsg(""), 3500);
      }
    } catch (err) {
      console.warn("Reverse geocode failed:", err);
      setGeocodingMsg("");
    }
  };

  // Move stop up in sequence
  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newStops = [...stops];
    const temp = newStops[index - 1];
    newStops[index - 1] = newStops[index];
    newStops[index] = temp;
    newStops.forEach((s, idx) => {
      s.stopOrder = idx + 1;
    });
    setStops(newStops);
  };

  // Move stop down in sequence
  const handleMoveDown = (index) => {
    if (index === stops.length - 1) return;
    const newStops = [...stops];
    const temp = newStops[index + 1];
    newStops[index + 1] = newStops[index];
    newStops[index] = temp;
    newStops.forEach((s, idx) => {
      s.stopOrder = idx + 1;
    });
    setStops(newStops);
  };

  // Delete stop
  const handleDeleteStop = (id) => {
    if (stops.length <= 2) {
      alert("A route requires at least 2 points (starting point and destination).");
      return;
    }
    const filtered = stops.filter((s) => s.id !== id);
    filtered.forEach((s, idx) => {
      s.stopOrder = idx + 1;
    });
    setStops(filtered);
  };

  // Edit stop property
  const handleUpdateStop = (id, key, val) => {
    setStops((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [key]: val } : s))
    );
  };

  // Intelligent Route Optimization:
  // Rearranges intermediate pickup/drop-off stops to minimize total distance,
  // strictly preserving the starting point (stop 0) and final destination (last stop).
  const handleOptimizeIntermediateStops = () => {
    if (stops.length < 4) {
      alert("Route optimization requires at least 2 intermediate stops between start and destination.");
      return;
    }

    const start = stops[0];
    const destination = stops[stops.length - 1];
    const intermediate = stops.slice(1, stops.length - 1);

    // Nearest Neighbor algorithm on intermediate stops
    let unvisited = [...intermediate];
    let currentLat = start.latitude;
    let currentLng = start.longitude;
    const optimized = [];

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const d = haversineKm(currentLat, currentLng, unvisited[i].latitude, unvisited[i].longitude);
        if (d < minDistance) {
          minDistance = d;
          nearestIdx = i;
        }
      }

      const nextStop = unvisited.splice(nearestIdx, 1)[0];
      optimized.push(nextStop);
      currentLat = nextStop.latitude;
      currentLng = nextStop.longitude;
    }

    const reorderedStops = [start, ...optimized, destination].map((s, idx) => ({
      ...s,
      stopOrder: idx + 1,
    }));

    setStops(reorderedStops);
    setOptimizationMsg("Route optimized! Intermediate stops rearranged to reduce travel distance.");
    setFitRouteTrigger((prev) => prev + 1);
    setTimeout(() => setOptimizationMsg(""), 4000);
  };

  // Save the complete road route to backend
  const handleSubmitSave = async () => {
    if (!routeName.trim()) {
      alert("Please provide a Route Name.");
      return;
    }
    if (stops.length < 2) {
      alert("Please add at least a start point and destination.");
      return;
    }

    const startPoint = (stops[0].stopName || stops[0].address || "Start").slice(0, 140);
    const endPoint = (stops[stops.length - 1].stopName || stops[stops.length - 1].address || "Destination").slice(0, 140);

    const routeData = {
      ...(initialRoute || {}),
      name: routeName.trim(),
      startPoint: startPoint,
      endPoint: endPoint,
      distance: `${totalDistanceKm} km`,
      durationMinutes: totalDurationMins,
      stops: stops.map((s, idx) => ({
        stopId: typeof s.id === "number" && s.id < 1000000000 ? s.id : (s.stopId ? Number(s.stopId) : null),
        stopName: s.stopName || s.name || s.address || `Stop ${idx + 1}`,
        name: s.stopName || s.name || s.address || `Stop ${idx + 1}`,
        address: s.address || s.stopName || "",
        latitude: s.latitude != null ? Number(s.latitude) : (s.lat != null ? Number(s.lat) : null),
        longitude: s.longitude != null ? Number(s.longitude) : (s.lng != null ? Number(s.lng) : null),
        stopOrder: idx + 1,
        arrivalTime: s.arrivalTime || null,
      })),
      geometryGeojson: rawGeoJson ? JSON.stringify(rawGeoJson) : null,
      isActive: true,
    };

    setIsSaving(true);
    setSaveError("");
    try {
      await onSave(routeData);
    } catch (err) {
      setSaveError(err.response?.data?.message || err.message || "Failed to save route to MySQL.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop-custom" onClick={onClose}>
      <div
        className="modal-card"
        style={{
          width: "95vw",
          maxWidth: "1340px",
          height: "92vh",
          display: "flex",
          flexDirection: "column",
          padding: "24px",
          borderRadius: "20px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="d-flex justify-content-between align-items-center pb-3 border-bottom mb-3">
          <div>
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-primary" style={{ fontSize: "11px" }}>
                ROUTE BUILDER &amp; LIVE STOP SEARCH
              </span>
              <h4 className="mb-0 fw-bold" style={{ color: "#0f172a" }}>
                🗺️ {initialRoute ? `Edit Route: ${initialRoute.name}` : "Interactive Road-Based Route Builder"}
              </h4>
            </div>
            <small className="text-muted mt-1 d-block">
              Search any school, college, PG, hostel, apartment or address across India, or click directly on the interactive map to add stops along actual road networks.
            </small>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close" />
        </div>

        {/* Builder Content: Left Panel (Stops & Config) | Right Panel (Interactive Map) */}
        <div className="row g-3 flex-grow-1 overflow-hidden" style={{ minHeight: 0 }}>
          {/* Left Panel: Stops Management */}
          <div
            className="col-lg-5 d-flex flex-column h-100"
            style={{ overflowY: "auto", paddingRight: "10px" }}
          >
            {/* Route Name Input */}
            <div className="mb-2">
              <label className="form-label fw-bold small text-muted mb-1">ROUTE NAME</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="e.g. Hyderabad - Campus Express Route"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
              />
            </div>

            {/* Live Autocomplete Location Search Across India */}
            <div className="mb-2 position-relative" ref={searchContainerRef}>
              <label
                className="form-label fw-bold small text-muted mb-1 d-flex justify-content-between align-items-center"
                style={{ fontSize: "11px" }}
              >
                <span>
                  <i className="bi bi-search text-primary me-1" />
                  SEARCH &amp; ADD STOPS ACROSS INDIA:
                </span>
                {isSearching && (
                  <span className="text-primary small" style={{ fontSize: "10px" }}>
                    <span className="spinner-border spinner-border-sm me-1" style={{ width: "10px", height: "10px" }} />
                    Searching...
                  </span>
                )}
              </label>

              {/* Search Input Box */}
              <div className="input-group input-group-sm">
                <span className="input-group-text bg-white border-end-0 text-primary">
                  <i className="bi bi-geo-alt-fill" />
                </span>
                <input
                  type="text"
                  className="form-control border-start-0 ps-1"
                  placeholder="Search any school, college, PG, apartment, landmark, or street in India..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (searchResults.length > 0) setShowDropdown(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchResults.length > 0) {
                      e.preventDefault();
                      handleSelectLocation(searchResults[0]);
                    } else if (e.key === "Escape") {
                      setShowDropdown(false);
                    }
                  }}
                  style={{ fontSize: "12.5px" }}
                />
                {searchQuery && (
                  <button
                    className="btn btn-outline-secondary border-start-0"
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setSearchResults([]);
                      setShowDropdown(false);
                    }}
                    title="Clear search"
                  >
                    <i className="bi bi-x-lg" style={{ fontSize: "11px" }} />
                  </button>
                )}
              </div>

              {/* Autocomplete Suggestions Dropdown Menu */}
              {showDropdown && (
                <div
                  className="search-suggestions-dropdown"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: "4px",
                    background: "#ffffff",
                    borderRadius: "10px",
                    boxShadow: "0 14px 32px rgba(0, 0, 0, 0.2)",
                    border: "1px solid #cbd5e1",
                    zIndex: 99999,
                    maxHeight: "310px",
                    overflowY: "auto",
                  }}
                >
                  {isSearching && searchResults.length === 0 ? (
                    <div className="p-3 text-center text-muted small">
                      <span className="spinner-border spinner-border-sm text-primary me-2" role="status" />
                      Searching real Indian locations...
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div>
                      <div
                        className="px-3 py-1.5 text-uppercase fw-bold text-muted border-bottom d-flex justify-content-between align-items-center"
                        style={{ fontSize: "10px", letterSpacing: "0.5px", background: "#f8fafc" }}
                      >
                        <span>Found Locations ({searchResults.length})</span>
                        <span className="text-secondary" style={{ fontSize: "9px" }}>Press Enter or click to add</span>
                      </div>
                      {searchResults.map((item) => (
                        <div
                          key={item.id}
                          className="d-flex align-items-center gap-2.5 px-3 py-2 cursor-pointer search-result-item"
                          onClick={() => handleSelectLocation(item)}
                          style={{
                            cursor: "pointer",
                            borderBottom: "1px solid #f1f5f9",
                            transition: "background 0.15s ease",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <div
                            className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                            style={{
                              width: "32px",
                              height: "32px",
                              background: "#f1f5f9",
                              color: "#0284c7",
                              fontSize: "14px",
                            }}
                          >
                            <i className={`bi ${getCategoryIcon(item.category)}`} />
                          </div>
                          <div className="flex-grow-1 overflow-hidden">
                            <div className="fw-bold text-dark text-truncate" style={{ fontSize: "12.5px" }}>
                              {item.name}
                            </div>
                            <div className="text-muted text-truncate" style={{ fontSize: "11px" }}>
                              {item.address}
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            <span
                              className="badge bg-light text-secondary border"
                              style={{ fontSize: "9.5px", textTransform: "capitalize" }}
                            >
                              {item.category.replace(/_/g, " ")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : searchQuery.trim().length >= 2 && !isSearching ? (
                    <div className="p-3 text-center text-muted small">
                      <i className="bi bi-geo-alt text-warning me-1" />
                      No locations found for "<b>{searchQuery}</b>". Try another landmark, street, or area.
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {geocodingMsg && (
              <div className="alert alert-success py-1 px-2 mb-2" style={{ fontSize: "11px" }}>
                <i className="bi bi-check-circle-fill me-1" /> {geocodingMsg}
              </div>
            )}

            {optimizationMsg && (
              <div className="alert alert-info py-1 px-2 mb-2" style={{ fontSize: "11px" }}>
                <i className="bi bi-lightning-charge-fill me-1" /> {optimizationMsg}
              </div>
            )}

            {/* Road Telemetry Metrics */}
            <div
              className="p-2 px-3 rounded-3 mb-2 d-flex justify-content-between align-items-center"
              style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}
            >
              <div>
                <small className="text-muted d-block fw-bold" style={{ fontSize: "10px" }}>
                  TOTAL ROAD DISTANCE
                </small>
                <b style={{ color: "#1e40af", fontSize: "15px" }}>
                  {totalDistanceKm} km
                </b>
              </div>
              <div className="text-center">
                <small className="text-muted d-block fw-bold" style={{ fontSize: "10px" }}>
                  EST. DRIVING TIME
                </small>
                <b style={{ color: "#059669", fontSize: "15px" }}>
                  ~{totalDurationMins} mins
                </b>
              </div>
              <div className="text-end">
                <small className="text-muted d-block fw-bold" style={{ fontSize: "10px" }}>
                  TOTAL STOPS
                </small>
                <b style={{ color: "#0f172a", fontSize: "15px" }}>
                  {stops.length} points
                </b>
              </div>
            </div>

            {/* Stops Sequence Header with Optimize Button */}
            <div className="d-flex justify-content-between align-items-center mb-1">
              <span className="fw-bold small text-muted" style={{ fontSize: "11px" }}>
                ROUTE STOPS SEQUENCE ({stops.length} POINTS)
              </span>
              {stops.length >= 4 && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary py-0 px-2 rounded-pill d-flex align-items-center gap-1"
                  style={{ fontSize: "10px", fontWeight: "700" }}
                  onClick={handleOptimizeIntermediateStops}
                  title="Rearrange intermediate stops to minimize road driving distance"
                >
                  <i className="bi bi-lightning-charge-fill text-warning" /> Optimize Stops Order
                </button>
              )}
            </div>

            {/* Stops List */}
            <div
              className="flex-grow-1"
              style={{
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                maxHeight: "340px",
              }}
            >
              {stops.map((stop, idx) => {
                const isStart = idx === 0;
                const isEnd = idx === stops.length - 1 && stops.length > 1;
                const badgeBg = isStart ? "#16a34a" : isEnd ? "#ea580c" : "#2563eb";
                const badgeText = isStart ? "START" : isEnd ? "DESTINATION" : `STOP ${idx + 1}`;

                return (
                  <div
                    key={stop.id}
                    className="p-2 border rounded-3 bg-white shadow-sm"
                    style={{ borderLeft: `5px solid ${badgeBg} !important` }}
                  >
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span
                        className="badge"
                        style={{ backgroundColor: badgeBg, fontSize: "9.5px", cursor: "pointer" }}
                        onClick={() => {
                          setMapCenter([stop.latitude, stop.longitude]);
                          setMapZoom(16);
                        }}
                        title="Click to center map on this stop"
                      >
                        <i className="bi bi-geo-alt-fill me-1" />
                        {badgeText}
                      </span>
                      <div className="btn-group btn-group-sm">
                        <button
                          type="button"
                          className="btn btn-light btn-sm border py-0 px-2"
                          disabled={idx === 0}
                          onClick={() => handleMoveUp(idx)}
                          title="Move stop earlier"
                        >
                          <i className="bi bi-arrow-up" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-light btn-sm border py-0 px-2"
                          disabled={idx === stops.length - 1}
                          onClick={() => handleMoveDown(idx)}
                          title="Move stop later"
                        >
                          <i className="bi bi-arrow-down" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm py-0 px-2"
                          onClick={() => handleDeleteStop(stop.id)}
                          title="Delete stop"
                        >
                          <i className="bi bi-trash" />
                        </button>
                      </div>
                    </div>

                    <div className="row g-1">
                      <div className="col-7">
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Stop name"
                          value={stop.stopName}
                          onChange={(e) => handleUpdateStop(stop.id, "stopName", e.target.value)}
                        />
                      </div>
                      <div className="col-5">
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="07:45 AM"
                          value={stop.arrivalTime || ""}
                          onChange={(e) => handleUpdateStop(stop.id, "arrivalTime", e.target.value)}
                        />
                      </div>
                      <div className="col-12">
                        <small
                          className="text-muted text-truncate d-block"
                          style={{ fontSize: "10px" }}
                          title={stop.address}
                        >
                          📍 {stop.address || `${stop.latitude}, ${stop.longitude}`}
                        </small>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Interactive Leaflet Map */}
          <div className="col-lg-7 h-100 position-relative">
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "16px",
                overflow: "hidden",
                border: "1px solid #cbd5e1",
                position: "relative",
              }}
            >
              {/* Top Map Control Toolbar */}
              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  right: "12px",
                  zIndex: 1000,
                  display: "flex",
                  gap: "6px",
                }}
              >
                <button
                  type="button"
                  className="btn btn-sm btn-dark shadow rounded-pill d-flex align-items-center gap-1"
                  style={{ fontSize: "11px", fontWeight: "700" }}
                  onClick={() => setFitRouteTrigger((prev) => prev + 1)}
                  title="Center and fit the entire route onto the map"
                >
                  <i className="bi bi-arrows-fullscreen" /> Fit Entire Route
                </button>
              </div>

              {isCalculating && (
                <div
                  style={{
                    position: "absolute",
                    top: "16px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 1000,
                    background: "#0f172a",
                    color: "#ffffff",
                    padding: "6px 16px",
                    borderRadius: "20px",
                    fontSize: "12px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span className="spinner-border spinner-border-sm" role="status" />
                  Calculating road geometry along actual roads...
                </div>
              )}

              <MapContainer
                center={mapCenter}
                zoom={mapZoom}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <MapCameraController
                  center={mapCenter}
                  zoomLevel={mapZoom}
                  routeCoordinates={roadCoordinates}
                  fitRouteTrigger={fitRouteTrigger}
                />
                <MapClickHandler onMapClick={handleMapClick} />

                {/* True Road Polyline */}
                {roadCoordinates.length > 1 && (
                  <Polyline
                    positions={roadCoordinates}
                    pathOptions={{
                      color: "#1a68ea",
                      weight: 6,
                      opacity: 0.9,
                      lineCap: "round",
                    }}
                  />
                )}

                {/* Stops Markers */}
                {stops.map((stop, idx) => (
                  <Marker
                    key={stop.id}
                    position={[stop.latitude, stop.longitude]}
                    icon={createBuilderStopIcon(idx, stops.length)}
                  >
                    <Tooltip direction="top" offset={[0, -15]} permanent={false}>
                      <div style={{ fontSize: "11px", fontWeight: "700" }}>
                        {idx === 0 ? "🟢 Start: " : idx === stops.length - 1 ? "🏁 End: " : `Stop ${idx + 1}: `}
                        {stop.stopName}
                      </div>
                    </Tooltip>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </div>
        </div>

        {/* Save Error Alert */}
        {saveError && (
          <div className="alert alert-danger py-2 px-3 mt-3 mb-0 d-flex align-items-center gap-2 small">
            <i className="bi bi-exclamation-triangle-fill flex-shrink-0" />
            <div>{saveError}</div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="d-flex justify-content-end gap-2 pt-3 border-top mt-3">
          <button
            className="btn btn-outline-secondary px-4 rounded-pill"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary px-4 rounded-pill d-flex align-items-center gap-2"
            onClick={handleSubmitSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            ) : (
              <i className="bi bi-cloud-arrow-up-fill" />
            )}
            {isSaving ? "Saving to MySQL..." : "Save Road Route to MySQL"}
          </button>
        </div>
      </div>
    </div>
  );
}
