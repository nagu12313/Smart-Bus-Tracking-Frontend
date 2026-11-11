import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import routingService, { calculateDistanceKm, fetchDistanceMatrix } from "../services/routingService";
import routeService from "../services/routeService";
import "./RouteBuilderMap.css";

// Mapbox Token (configured from environment)
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

// Helper for time calculations
function timeStringToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function minutesToTimeString(totalMinutes) {
  let m = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function formatTime12h(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Category icon resolver for search results
function getCategoryIcon(category = "") {
  const c = category.toLowerCase();
  if (c.includes("dormitory") || c.includes("pg") || c.includes("hostel") || c.includes("hotel") || c.includes("building")) {
    return "apartment";
  }
  if (c.includes("college") || c.includes("university") || c.includes("school") || c.includes("education")) {
    return "school";
  }
  if (c.includes("transit") || c.includes("bus") || c.includes("railway") || c.includes("station") || c.includes("metro")) {
    return "directions_bus";
  }
  if (c.includes("hospital") || c.includes("health") || c.includes("clinic")) {
    return "local_hospital";
  }
  return "location_on";
}

// Custom Leaflet Icons
const createOriginIcon = () =>
  L.divIcon({
    className: "stitch-leaflet-icon",
    html: `
      <div class="stitch-marker-origin">
        <div class="origin-core">
          <span class="material-symbols-outlined" style="font-size: 15px;">warehouse</span>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });

const createWaypointIcon = (number, isActive = false) =>
  L.divIcon({
    className: "stitch-leaflet-icon",
    html: `
      <div class="stitch-marker-waypoint ${isActive ? "active" : ""}">
        <div class="waypoint-core">${String(number).padStart(2, "0")}</div>
      </div>
    `,
    iconSize: isActive ? [30, 30] : [26, 26],
    iconAnchor: isActive ? [15, 15] : [13, 13],
    popupAnchor: [0, -15],
  });

const createDestinationIcon = () =>
  L.divIcon({
    className: "stitch-leaflet-icon",
    html: `
      <div class="stitch-marker-destination">
        <div class="dest-core">
          <span class="material-symbols-outlined" style="font-size: 16px;">school</span>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });

const createLiveBusIcon = (busNumber = "Bus", speed = 0, heading = 0) =>
  L.divIcon({
    className: "stitch-leaflet-icon",
    html: `
      <div class="stitch-marker-bus">
        <div class="bus-tag">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
          ${busNumber} • ${speed} km/h
        </div>
        <div class="bus-arrow" style="transform: rotate(${heading}deg);">
          <span class="material-symbols-outlined" style="font-size: 15px;">navigation</span>
        </div>
      </div>
    `,
    iconSize: [120, 50],
    iconAnchor: [60, 40],
  });

// Map Viewport / Bounds Controller
function MapController({ routeCoords, fitTrigger, focusCoord }) {
  const map = useMap();

  useEffect(() => {
    if (focusCoord && focusCoord[0] && focusCoord[1]) {
      map.setView(focusCoord, Math.max(map.getZoom(), 14), { animate: true, duration: 0.8 });
    }
  }, [focusCoord, map]);

  useEffect(() => {
    if (routeCoords && routeCoords.length > 1) {
      try {
        const bounds = L.latLngBounds(routeCoords);
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true, duration: 0.8 });
        }
      } catch (err) {
        console.warn("fitBounds failed:", err);
      }
    }
  }, [routeCoords, fitTrigger, map]);

  return null;
}

// Click listener on Map for Custom Pin Drop
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
}

export default function RouteBuilderMap({
  initialRoute = null,
  onSave,
  onClose,
  buses = [],
}) {
  // Route Name
  const [routeName, setRouteName] = useState(
    initialRoute?.name ||
      (initialRoute?.startPoint && initialRoute?.endPoint
        ? `${initialRoute.startPoint} to ${initialRoute.endPoint}`
        : "New Campus Bus Route")
  );
  const [isEditingRouteName, setIsEditingRouteName] = useState(false);

  // Dynamic Stops Initial State (All stops fully mutable, including start and end points)
  const [stops, setStops] = useState(() => {
    if (initialRoute?.stops && Array.isArray(initialRoute.stops) && initialRoute.stops.length >= 2) {
      const len = initialRoute.stops.length;
      return initialRoute.stops.map((s, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === len - 1;
        const lat = Number(s.latitude || s.lat || 16.3045);
        const lng = Number(s.longitude || s.lng || 80.4485);
        return {
          id: s.id || `stop-${idx}-${Date.now()}`,
          stopId: s.stopId || s.id,
          stopName: s.stopName || s.name || (isFirst ? "Origin Depot" : isLast ? "Campus Gate" : `Stop #${idx}`),
          latitude: lat,
          longitude: lng,
          address: s.address || `${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E`,
          arrivalTime: s.arrivalTime || minutesToTimeString(6 * 60 + 45 + idx * 10),
          durationDelta: idx === 0 ? 0 : 10,
          stopType: isFirst ? "origin" : isLast ? "destination" : "waypoint",
        };
      });
    }

    // Dynamic initial anchors based on initialRoute or default campus depot
    const startName = initialRoute?.startPoint || "Depot Terminal";
    const endName = initialRoute?.endPoint || "Campus Main Gate";
    return [
      {
        id: "origin-1",
        stopName: startName,
        latitude: 16.3045,
        longitude: 80.4485,
        address: `${startName}, India`,
        arrivalTime: "07:00",
        durationDelta: 0,
        stopType: "origin",
      },
      {
        id: "dest-1",
        stopName: endName,
        latitude: 16.3285,
        longitude: 80.4855,
        address: `${endName}, India`,
        arrivalTime: "07:40",
        durationDelta: 40,
        stopType: "destination",
      },
    ];
  });

  // Active / Selected Stop for Map HUD preview
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  const [focusCoord, setFocusCoord] = useState(null);

  // Mobile Tabs
  const [mobileTab, setMobileTab] = useState("stops"); // "stops" | "map"
  const [fitTrigger, setFitTrigger] = useState(0);

  // Dynamic Route Geometry & Metrics
  const [roadCoordinates, setRoadCoordinates] = useState([]);
  const [totalDistanceKm, setTotalDistanceKm] = useState(0);
  const [totalDurationMins, setTotalDurationMins] = useState(0);
  const [preOptimizeDistanceKm, setPreOptimizeDistanceKm] = useState(null);
  const [optimizedDistanceKm, setOptimizedDistanceKm] = useState(null);
  const [rawGeoJson, setRawGeoJson] = useState(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);

  // Optimization & Saving status
  const [isOptimizing, setIsOptimizing] = useState(false);
  const isOptimizingRef = useRef(false);
  const [optimizationMsg, setOptimizationMsg] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Key to detect coordinate/order changes without firing on arrival time edits
  const stopsCoordKey = useMemo(() => {
    return stops.map((s) => `${Number(s.latitude).toFixed(5)},${Number(s.longitude).toFixed(5)}`).join(";");
  }, [stops]);

  // Recalculate OSRM Road Route dynamically whenever stops sequence or coordinates change
  useEffect(() => {
    let active = true;
    async function calculateRoad() {
      if (isOptimizingRef.current) return;
      if (stops.length < 2) {
        setRoadCoordinates([]);
        setTotalDistanceKm(0);
        setTotalDurationMins(0);
        return;
      }
      setIsCalculatingRoute(true);
      try {
        const road = await routingService.fetchRoadRoute(stops);
        if (active && road && !isOptimizingRef.current) {
          setRoadCoordinates(road.coordinates || []);
          setTotalDistanceKm(road.distanceKm || 0);
          setTotalDurationMins(road.durationMinutes || 0);
          setRawGeoJson(road.geojson);

          // Update distance-based arrival times & duration deltas if leg metrics are returned
          if (road.legDurationsMinutes && road.legDurationsMinutes.length > 0) {
            setStops((prevStops) => {
              let changed = false;
              const nextStops = prevStops.map((s, idx) => {
                if (idx === 0) return s;
                const legDur = road.legDurationsMinutes[idx - 1] || Math.max(1, Math.round(((road.legDistancesKm?.[idx - 1] || 1) / 30) * 60));
                const legDist = road.legDistancesKm ? road.legDistancesKm[idx - 1] : s.distanceFromPrevKm;
                if (s.durationDelta !== legDur || s.distanceFromPrevKm !== legDist) {
                  changed = true;
                  return { ...s, durationDelta: legDur, distanceFromPrevKm: legDist };
                }
                return s;
              });

              if (!changed) return prevStops;

              // Cascade arrival times based on real distance travel times + 1 min dwell
              let runningMins = timeStringToMinutes(nextStops[0].arrivalTime || "07:00");
              for (let i = 1; i < nextStops.length; i++) {
                runningMins += nextStops[i].durationDelta || 5;
                nextStops[i] = {
                  ...nextStops[i],
                  arrivalTime: minutesToTimeString(runningMins),
                };
                if (i < nextStops.length - 1) {
                  runningMins += 1; // 1 min boarding buffer
                }
              }
              return nextStops;
            });
          }
        }
      } catch (err) {
        console.warn("Road routing calculation error:", err);
      } finally {
        if (active) setIsCalculatingRoute(false);
      }
    }

    calculateRoad();
    return () => {
      active = false;
    };
  }, [stopsCoordKey]);

  // Mapbox Search JS / Top Search Box State
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [sessionToken, setSessionToken] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "sess_" + Date.now()
  );
  const searchContainerRef = useRef(null);

  // Inline Add Stop Slot Popover (between stops)
  const [activeInlineSlotIndex, setActiveInlineSlotIndex] = useState(null);
  const [inlineSearchQuery, setInlineSearchQuery] = useState("");
  const [inlineSuggestions, setInlineSuggestions] = useState([]);
  const [isSearchingInline, setIsSearchingInline] = useState(false);

  // In-Place Bottom Add Stop Card State
  const [isBottomAddOpen, setIsBottomAddOpen] = useState(false);
  const [bottomSearchQuery, setBottomSearchQuery] = useState("");
  const [bottomSearchResults, setBottomSearchResults] = useState([]);
  const [isSearchingBottom, setIsSearchingBottom] = useState(false);
  const bottomSearchInputRef = useRef(null);

  // Map Click Insertion Popover
  const [mapInsertionData, setMapInsertionData] = useState(null);

  // Drag and Drop state
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [dragOverPos, setDragOverPos] = useState(null);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Check if an actual live bus is assigned to this route
  const assignedLiveBus = useMemo(() => {
    if (!initialRoute?.id && !initialRoute?.busId) return null;
    const targetBusId = initialRoute?.busId || initialRoute?.id;
    const found = buses.find(
      (b) => b.routeId === targetBusId || b.id === targetBusId || b.busNumber === initialRoute?.busNumber
    );
    if (found && found.latitude && found.longitude) {
      return {
        busNumber: found.busNumber || found.registrationNumber || "Bus",
        speed: Math.round(found.speed ?? 0),
        heading: found.heading || 0,
        latitude: Number(found.latitude),
        longitude: Number(found.longitude),
      };
    }
    return null;
  }, [initialRoute, buses]);



  // Dynamic time cascading logic
  const handleTimeChange = (triggerIdx, newTimeStr) => {
    if (!newTimeStr) return;
    const baseMinutes = timeStringToMinutes(newTimeStr);

    setStops((prevStops) => {
      const nextStops = [...prevStops];
      nextStops[triggerIdx] = {
        ...nextStops[triggerIdx],
        arrivalTime: newTimeStr,
      };

      let runningMins = baseMinutes;
      for (let i = triggerIdx + 1; i < nextStops.length; i++) {
        const delta = nextStops[i].durationDelta || 10;
        runningMins += delta;
        nextStops[i] = {
          ...nextStops[i],
          arrivalTime: minutesToTimeString(runningMins),
        };
      }
      return nextStops;
    });
  };

  // Up/Down reordering (Works for ANY stop, including start and end points!)
  const handleMoveStop = (idx, direction) => {
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= stops.length) return;

    const updated = [...stops];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;

    // Re-assign stop types based on new positions
    updated.forEach((s, i) => {
      s.stopType = i === 0 ? "origin" : i === updated.length - 1 ? "destination" : "waypoint";
      s.stopOrder = i + 1;
    });

    let runningMins = timeStringToMinutes(updated[0].arrivalTime);
    for (let i = 1; i < updated.length; i++) {
      runningMins += updated[i].durationDelta || 10;
      updated[i].arrivalTime = minutesToTimeString(runningMins);
    }

    setStops(updated);
    setActiveStopIndex(targetIdx);
    setFitTrigger((c) => c + 1);
  };

  // Remove any stop (Allows deleting as long as minimum 2 stops remain)
  const handleRemoveStop = (idx) => {
    if (stops.length <= 2) {
      alert("A route requires at least 2 points (starting location and destination).");
      return;
    }

    const filtered = stops.filter((_, i) => i !== idx);
    filtered.forEach((s, i) => {
      s.stopType = i === 0 ? "origin" : i === filtered.length - 1 ? "destination" : "waypoint";
      s.stopOrder = i + 1;
    });

    let runningMins = timeStringToMinutes(filtered[0].arrivalTime);
    for (let i = 1; i < filtered.length; i++) {
      runningMins += filtered[i].durationDelta || 10;
      filtered[i].arrivalTime = minutesToTimeString(runningMins);
    }

    setStops(filtered);
    setActiveStopIndex(Math.max(0, idx - 1));
    setFitTrigger((c) => c + 1);
  };

  // Rename a stop inline
  const handleRenameStop = (idx, newName) => {
    setStops((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, stopName: newName } : s))
    );
  };

  // Drag and Drop handlers (ALL stops can be dragged and reordered!)
  const handleDragStart = (e, index) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  };

  const handleDragOver = (e, index) => {
    if (draggedIdx === null || draggedIdx === index) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const pos = e.clientY < midY ? "top" : "bottom";
    setDragOverIdx(index);
    setDragOverPos(pos);
  };

  const handleDragLeave = () => {
    setDragOverIdx(null);
    setDragOverPos(null);
  };

  const handleDrop = (e, targetIdx) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === targetIdx) return;

    const list = [...stops];
    const [removed] = list.splice(draggedIdx, 1);
    const insertAt = dragOverPos === "top" ? targetIdx : targetIdx + 1;
    list.splice(insertAt, 0, removed);

    list.forEach((s, i) => {
      s.stopType = i === 0 ? "origin" : i === list.length - 1 ? "destination" : "waypoint";
      s.stopOrder = i + 1;
    });

    let runningMins = timeStringToMinutes(list[0].arrivalTime);
    for (let i = 1; i < list.length; i++) {
      runningMins += list[i].durationDelta || 10;
      list[i].arrivalTime = minutesToTimeString(runningMins);
    }

    setStops(list);
    setDraggedIdx(null);
    setDragOverIdx(null);
    setDragOverPos(null);
    setActiveStopIndex(insertAt);
    setFitTrigger((c) => c + 1);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
    setDragOverPos(null);
  };

  // Mapbox Search JS & Multi-Provider Autocomplete Engine
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const q = searchQuery.trim();
      let items = [];

      try {
        // 1. Try Mapbox Search Box Suggest API
        if (MAPBOX_TOKEN) {
          try {
            const suggestUrl = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(
              q
            )}&access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}&country=IN&language=en&limit=8`;
            const res = await fetch(suggestUrl);
            if (res.ok) {
              const data = await res.json();
              if (data.suggestions && data.suggestions.length > 0) {
                items = data.suggestions.map((s) => ({
                  id: s.mapbox_id || `mb_${Math.random()}`,
                  name: s.name || s.name_preferred,
                  address:
                    s.full_address ||
                    s.place_formatted ||
                    (s.context?.place?.name ? `${s.name}, ${s.context.place.name}, India` : `${s.name}, India`),
                  mapboxId: s.mapbox_id,
                  category: s.poi_category?.[0] || s.feature_type || "location",
                  source: "searchbox",
                }));
              }
            }
          } catch (e) {
            console.warn("Mapbox suggest error:", e);
          }
        }

        // 2. Fallback: Mapbox Geocoding v5
        if (items.length === 0 && MAPBOX_TOKEN) {
          try {
            const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
              q
            )}.json?country=IN&access_token=${MAPBOX_TOKEN}&limit=8`;
            const geoRes = await fetch(geoUrl);
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              if (geoData.features && geoData.features.length > 0) {
                items = geoData.features.map((f) => ({
                  id: f.id,
                  name: f.text || f.place_name?.split(",")[0],
                  address: f.place_name || `${f.text}, India`,
                  coordinates: f.geometry?.coordinates,
                  category: f.place_type?.[0] || "place",
                  source: "geocoding",
                }));
              }
            }
          } catch (e) {
            console.warn("Mapbox geocoding error:", e);
          }
        }

        // 3. Fallback: Photon Komoot
        if (items.length === 0) {
          try {
            const pRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8`);
            if (pRes.ok) {
              const pData = await pRes.json();
              if (pData.features && pData.features.length > 0) {
                items = pData.features.map((f) => {
                  const p = f.properties || {};
                  const name = p.name || p.street || q;
                  const parts = [name, p.city, p.state].filter(Boolean);
                  return {
                    id: "photon_" + (p.osm_id || Math.random()),
                    name,
                    address: parts.join(", ") || `${name}, India`,
                    coordinates: f.geometry?.coordinates,
                    category: p.osm_value || p.type || "landmark",
                    source: "osm",
                  };
                });
              }
            }
          } catch (e) {
            console.warn("Photon fallback error:", e);
          }
        }

        // 4. Fallback: Nominatim
        if (items.length === 0) {
          try {
            const nomRes = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&countrycodes=in&limit=8`
            );
            if (nomRes.ok) {
              const nomData = await nomRes.json();
              if (Array.isArray(nomData) && nomData.length > 0) {
                items = nomData.map((n) => ({
                  id: "nom_" + (n.place_id || Math.random()),
                  name: n.display_name?.split(",")[0] || q,
                  address: n.display_name,
                  coordinates: [parseFloat(n.lon), parseFloat(n.lat)],
                  category: n.type || "place",
                  source: "osm",
                }));
              }
            }
          } catch (e) {
            console.warn("Nominatim fallback error:", e);
          }
        }

        setSearchResults(items);
        setShowSearchDropdown(items.length > 0);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, sessionToken]);

  // Handle Location Selection with target Action ("add" | "set-start" | "set-end")
  const handleSelectLocation = async (item, targetMode = "add") => {
    setIsSearching(true);
    setShowSearchDropdown(false);
    try {
      let lat, lon;
      let fullAddress = item.address;
      let placeName = item.name;

      if (item.source === "searchbox" && item.mapboxId && MAPBOX_TOKEN) {
        const retUrl = `https://api.mapbox.com/search/searchbox/v1/retrieve/${item.mapboxId}?access_token=${MAPBOX_TOKEN}&session_token=${sessionToken}`;
        const retRes = await fetch(retUrl);
        if (retRes.ok) {
          const retData = await retRes.json();
          const feat = retData.features?.[0];
          if (feat && feat.geometry?.coordinates) {
            [lon, lat] = feat.geometry.coordinates;
            fullAddress = feat.properties?.full_address || feat.properties?.place_formatted || item.address;
            placeName = feat.properties?.name || item.name;
          }
        }
      } else if (item.coordinates && item.coordinates.length >= 2) {
        [lon, lat] = item.coordinates;
      }

      if (lat && lon) {
        lat = Number(lat.toFixed(5));
        lon = Number(lon.toFixed(5));

        if (targetMode === "set-start") {
          // Replace or set as Origin (Stop 0)
          setStops((prev) => {
            const next = [...prev];
            next[0] = {
              ...next[0],
              stopName: placeName,
              latitude: lat,
              longitude: lon,
              address: fullAddress,
              stopType: "origin",
            };
            return next;
          });
          setActiveStopIndex(0);
        } else if (targetMode === "set-end") {
          // Replace or set as Destination (Last stop)
          setStops((prev) => {
            const next = [...prev];
            const lastIdx = next.length - 1;
            next[lastIdx] = {
              ...next[lastIdx],
              stopName: placeName,
              latitude: lat,
              longitude: lon,
              address: fullAddress,
              stopType: "destination",
            };
            return next;
          });
          setActiveStopIndex(stops.length - 1);
        } else {
          // Default: Insert before destination (as final intermediate waypoint)
          const insertIdx = Math.max(1, stops.length - 1);
          const newStop = {
            id: `stop-${Date.now()}`,
            stopName: placeName,
            latitude: lat,
            longitude: lon,
            address: fullAddress,
            arrivalTime: "07:00",
            durationDelta: 8,
            stopType: "waypoint",
          };

          const next = [...stops];
          next.splice(insertIdx, 0, newStop);

          next.forEach((s, i) => {
            s.stopType = i === 0 ? "origin" : i === next.length - 1 ? "destination" : "waypoint";
            s.stopOrder = i + 1;
          });

          let runningMins = timeStringToMinutes(next[0].arrivalTime);
          for (let i = 1; i < next.length; i++) {
            runningMins += next[i].durationDelta || 10;
            next[i].arrivalTime = minutesToTimeString(runningMins);
          }

          setStops(next);
          setActiveStopIndex(insertIdx);
        }

        setFocusCoord([lat, lon]);
        setSearchQuery("");
        setSearchResults([]);
        setSessionToken("sess_" + Date.now());
        setFitTrigger((c) => c + 1);
      }
    } catch (err) {
      console.error("Search selection error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Inline divider search
  useEffect(() => {
    if (!inlineSearchQuery || inlineSearchQuery.trim().length < 2) {
      setInlineSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingInline(true);
      const q = inlineSearchQuery.trim();
      let results = [];
      try {
        if (MAPBOX_TOKEN) {
          const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            q
          )}.json?country=IN&access_token=${MAPBOX_TOKEN}&limit=5`;
          const res = await fetch(geoUrl);
          if (res.ok) {
            const data = await res.json();
            if (data.features) {
              results = data.features.map((f) => ({
                name: f.text || f.place_name?.split(",")[0],
                address: f.place_name,
                lat: f.geometry?.coordinates[1],
                lng: f.geometry?.coordinates[0],
                timeDelta: 8,
              }));
            }
          }
        }
        if (results.length === 0) {
          const pRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`);
          if (pRes.ok) {
            const pData = await pRes.json();
            if (pData.features) {
              results = pData.features.map((f) => ({
                name: f.properties?.name || q,
                address: [f.properties?.street, f.properties?.city, f.properties?.state].filter(Boolean).join(", "),
                lat: f.geometry?.coordinates[1],
                lng: f.geometry?.coordinates[0],
                timeDelta: 8,
              }));
            }
          }
        }
        setInlineSuggestions(results);
      } finally {
        setIsSearchingInline(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [inlineSearchQuery]);

  // Debounced Search for In-Place Bottom Add Stop Card
  useEffect(() => {
    if (!bottomSearchQuery || bottomSearchQuery.trim().length < 2) {
      setBottomSearchResults([]);
      setIsSearchingBottom(false);
      return;
    }

    setIsSearchingBottom(true);
    const timer = setTimeout(async () => {
      const q = bottomSearchQuery.trim();
      let results = [];
      try {
        if (MAPBOX_TOKEN) {
          const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            q
          )}.json?country=IN&access_token=${MAPBOX_TOKEN}&limit=5`;
          const res = await fetch(geoUrl);
          if (res.ok) {
            const data = await res.json();
            if (data.features) {
              results = data.features.map((f) => ({
                name: f.text || f.place_name?.split(",")[0],
                address: f.place_name,
                lat: f.geometry?.coordinates[1],
                lng: f.geometry?.coordinates[0],
                timeDelta: 8,
              }));
            }
          }
        }
        if (results.length === 0) {
          const pRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5`);
          if (pRes.ok) {
            const pData = await pRes.json();
            if (pData.features) {
              results = pData.features.map((f) => ({
                name: f.properties?.name || q,
                address: [f.properties?.street, f.properties?.city, f.properties?.state].filter(Boolean).join(", "),
                lat: f.geometry?.coordinates[1],
                lng: f.geometry?.coordinates[0],
                timeDelta: 8,
              }));
            }
          }
        }
        setBottomSearchResults(results);
      } catch (err) {
        console.warn("Bottom search error:", err);
      } finally {
        setIsSearchingBottom(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [bottomSearchQuery]);

  // Insert stop helper
  const handleInsertStop = (suggestion, insertIndex, targetMode = "add") => {
    const lat = Number(suggestion.lat);
    const lng = Number(suggestion.lng);

    if (targetMode === "set-start") {
      setStops((prev) => {
        const next = [...prev];
        next[0] = { ...next[0], stopName: suggestion.name, latitude: lat, longitude: lng, address: suggestion.address };
        return next;
      });
      setActiveStopIndex(0);
    } else if (targetMode === "set-end") {
      setStops((prev) => {
        const next = [...prev];
        const last = next.length - 1;
        next[last] = { ...next[last], stopName: suggestion.name, latitude: lat, longitude: lng, address: suggestion.address };
        return next;
      });
      setActiveStopIndex(stops.length - 1);
    } else {
      const newStop = {
        id: `stop-${Date.now()}`,
        stopName: suggestion.name,
        latitude: lat,
        longitude: lng,
        address: suggestion.address,
        arrivalTime: "07:00",
        durationDelta: suggestion.timeDelta || 8,
        stopType: "waypoint",
      };

      const nextStops = [...stops];
      nextStops.splice(insertIndex, 0, newStop);

      nextStops.forEach((s, i) => {
        s.stopType = i === 0 ? "origin" : i === nextStops.length - 1 ? "destination" : "waypoint";
        s.stopOrder = i + 1;
      });

      let runningMins = timeStringToMinutes(nextStops[0].arrivalTime);
      for (let i = 1; i < nextStops.length; i++) {
        runningMins += nextStops[i].durationDelta || 10;
        nextStops[i].arrivalTime = minutesToTimeString(runningMins);
      }

      setStops(nextStops);
      setActiveStopIndex(insertIndex);
    }

    setFocusCoord([lat, lng]);
    setActiveInlineSlotIndex(null);
    setIsBottomAddOpen(false);
    setBottomSearchQuery("");
    setBottomSearchResults([]);
    setMapInsertionData(null);
    setFitTrigger((c) => c + 1);
  };

  // Map Click to Add Custom Pin
  const handleMapClick = async (latlng) => {
    const lat = Number(latlng.lat.toFixed(5));
    const lng = Number(latlng.lng.toFixed(5));

    setMapInsertionData({
      lat,
      lng,
      positionName: `Pin (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      segmentIndex: Math.max(1, stops.length - 1),
    });

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`
      );
      if (res.ok) {
        const data = await res.json();
        const name =
          data.name || data.address?.road || data.address?.suburb || `Waypoint (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
        setMapInsertionData((prev) => (prev ? { ...prev, positionName: name } : prev));
      }
    } catch (err) {
      console.warn("Reverse geocode failed:", err);
    }
  };

  // Advanced Road-Network Route Optimization Engine (Backend OSRM Table + Multi-Start + 2-Opt/3-Opt)
  const handleOptimizeRoute = async () => {
    if (stops.length < 3) {
      alert("Route optimization requires at least 3 points to optimize the order.");
      return;
    }

    if (stops.length === 3) {
      setOptimizationMsg("Route has only 1 intermediate stop between Origin and Destination and is already optimal.");
      setTimeout(() => setOptimizationMsg(""), 4000);
      return;
    }

    isOptimizingRef.current = true;
    setIsOptimizing(true);
    let startDist = totalDistanceKm;
    if (!startDist || startDist <= 0) {
      const initRoad = await routingService.fetchRoadRoute(stops);
      startDist = initRoad.distanceKm || 1;
    }
    setPreOptimizeDistanceKm(startDist);

    try {
      // 1. Call Enterprise Backend Route Optimization Engine
      const stopsPayload = stops.map((s, idx) => {
        const rawId = s.stopId || s.id;
        const validStopId = typeof rawId === "number" && !isNaN(rawId) && rawId < 1000000000 ? rawId : null;
        return {
          id: validStopId,
          name: s.stopName || s.name || `Stop ${idx + 1}`,
          address: s.address || "",
          latitude: Number(s.latitude),
          longitude: Number(s.longitude),
          stopOrder: idx + 1,
          arrivalTime: s.arrivalTime || (idx === 0 ? "06:45" : null),
          departureTime: s.departureTime || null,
          stopType: idx === 0 ? "origin" : idx === stops.length - 1 ? "destination" : "waypoint",
        };
      });

      const opt = await routeService.optimize(stopsPayload);

      if (opt && opt.stops && opt.stops.length > 0) {
        const mapped = opt.stops.map((s, idx) => ({
          id: s.id || stops.find((orig) => Math.abs(orig.latitude - s.latitude) < 0.0001 && Math.abs(orig.longitude - s.longitude) < 0.0001)?.id || (Date.now() + idx),
          stopName: s.name || s.address || `Stop ${idx + 1}`,
          name: s.name || s.address || `Stop ${idx + 1}`,
          address: s.address || "",
          latitude: Number(s.latitude),
          longitude: Number(s.longitude),
          stopOrder: s.stopOrder || idx + 1,
          arrivalTime: s.arrivalTime,
          departureTime: s.departureTime,
          durationDelta: s.durationDelta || 5,
          distanceFromPrevKm: s.distanceFromPrevKm,
          stopType: idx === 0 ? "origin" : idx === opt.stops.length - 1 ? "destination" : "waypoint",
        }));

        setStops(mapped);

        if (opt.geometryGeojson) {
          try {
            const parsed = typeof opt.geometryGeojson === "string" ? JSON.parse(opt.geometryGeojson) : opt.geometryGeojson;
            if (parsed?.coordinates && parsed.coordinates.length > 0) {
              setRoadCoordinates(parsed.coordinates.map(([lng, lat]) => [lat, lng]));
              setRawGeoJson(parsed);
            }
          } catch (e) {
            console.warn("Failed parsing geometryGeojson", e);
          }
        }

        const origDist = opt.originalDistanceKm > 0 ? opt.originalDistanceKm : startDist;
        const optDist = opt.optimizedDistanceKm > 0 ? opt.optimizedDistanceKm : opt.distanceKm;
        setPreOptimizeDistanceKm(origDist);
        setOptimizedDistanceKm(optDist);
        setTotalDistanceKm(optDist);
        setTotalDurationMins(opt.optimizedDurationMinutes || opt.durationMinutes);
        setOptimizationMsg(opt.message);
        setFitTrigger((c) => c + 1);
        setIsOptimizing(false);
        setTimeout(() => {
          isOptimizingRef.current = false;
        }, 1500);
        setTimeout(() => setOptimizationMsg(""), 5000);
        return;
      }
    } catch (backendErr) {
      console.warn("Backend optimization unavailable, running client road-network optimizer:", backendErr);
    }

    // 2. Client-Side Road-Network Optimization Fallback (OSRM Table Distance Matrix + Multi-Pass 2-Opt)
    try {
      const start = stops[0];
      const destination = stops[stops.length - 1];
      const intermediate = stops.slice(1, stops.length - 1);

      // Fetch road distance matrix
      const matrixData = await fetchDistanceMatrix(stops);
      const distMatrix = matrixData.distances;

      // Initial tour: Multi-start forward greedy on road network
      let unvisited = intermediate.map((s, i) => ({ stop: s, matrixIdx: i + 1 }));
      let currIdx = 0;
      const tour = [start];
      const tourIndices = [0];

      while (unvisited.length > 0) {
        let bestPos = 0;
        let minD = Infinity;
        for (let i = 0; i < unvisited.length; i++) {
          const uIdx = unvisited[i].matrixIdx;
          const d = distMatrix && distMatrix[currIdx] ? distMatrix[currIdx][uIdx] : calculateDistanceKm(tour[tour.length - 1].latitude, tour[tour.length - 1].longitude, unvisited[i].stop.latitude, unvisited[i].stop.longitude);
          if (d < minD) {
            minD = d;
            bestPos = i;
          }
        }
        const next = unvisited.splice(bestPos, 1)[0];
        tour.push(next.stop);
        tourIndices.push(next.matrixIdx);
        currIdx = next.matrixIdx;
      }
      tour.push(destination);
      tourIndices.push(stops.length - 1);

      // Multi-Pass 2-Opt on road network
      let improved = true;
      let iterations = 0;
      while (improved && iterations < 50) {
        improved = false;
        iterations++;
        for (let i = 0; i < tour.length - 2; i++) {
          for (let j = i + 2; j < tour.length - 1; j++) {
            const idxI = tourIndices[i];
            const idxI1 = tourIndices[i + 1];
            const idxJ = tourIndices[j];
            const idxJ1 = tourIndices[j + 1];

            const dCurrent = (distMatrix?.[idxI]?.[idxI1] || 1000) + (distMatrix?.[idxJ]?.[idxJ1] || 1000);
            const dNew = (distMatrix?.[idxI]?.[idxJ] || 1000) + (distMatrix?.[idxI1]?.[idxJ1] || 1000);

            if (dNew < dCurrent - 5) {
              const subTour = tour.slice(i + 1, j + 1).reverse();
              tour.splice(i + 1, subTour.length, ...subTour);
              const subIdx = tourIndices.slice(i + 1, j + 1).reverse();
              tourIndices.splice(i + 1, subIdx.length, ...subIdx);
              improved = true;
              break;
            }
          }
          if (improved) break;
        }
      }

      tour.forEach((s, idx) => {
        s.stopType = idx === 0 ? "origin" : idx === tour.length - 1 ? "destination" : "waypoint";
        s.stopOrder = idx + 1;
      });

      let runningMins = timeStringToMinutes(tour[0].arrivalTime || "06:45");
      for (let i = 1; i < tour.length; i++) {
        runningMins += tour[i].durationDelta || 10;
        tour[i].arrivalTime = minutesToTimeString(runningMins);
      }

      setStops(tour);

      const road = await routingService.fetchRoadRoute(tour);
      if (road && road.distanceKm > 0) {
        setRoadCoordinates(road.coordinates || []);
        setOptimizedDistanceKm(road.distanceKm);
        setTotalDistanceKm(road.distanceKm);
        setTotalDurationMins(road.durationMinutes);
        setRawGeoJson(road.geojson);

        const diff = road.distanceKm - startDist;
        const pct = startDist > 0 ? (diff / startDist) * 100 : 0;
        if (Math.abs(diff) < 0.05 || Math.abs(pct) < 0.05) {
          setOptimizationMsg(`Route is already in optimal sequence (${road.distanceKm.toFixed(1)} km) - shortest road path.`);
        } else {
          const sign = pct < 0 ? "-" : "+";
          setOptimizationMsg(`Route optimized! ${sign}${Math.abs(pct).toFixed(1)}% mileage change.`);
        }
      }
    } catch (clientErr) {
      console.error("Client optimization error:", clientErr);
    } finally {
      setIsOptimizing(false);
      setFitTrigger((c) => c + 1);
      setTimeout(() => setOptimizationMsg(""), 5000);
    }
  };

  // Dynamic Savings / Change percentage display
  const savingsDisplay = useMemo(() => {
    if (preOptimizeDistanceKm == null || optimizedDistanceKm == null) return null;
    const diff = optimizedDistanceKm - preOptimizeDistanceKm;
    const pct = preOptimizeDistanceKm > 0 ? (diff / preOptimizeDistanceKm) * 100 : 0;

    // Check if change is essentially zero (already optimal or within 50 meters)
    if (Math.abs(diff) < 0.05 || Math.abs(pct) < 0.05) {
      return {
        formatted: "0.0%",
        rawPct: 0,
        isSaving: true,
        isAlreadyOptimal: true,
      };
    }

    const isSaving = diff < 0;
    const sign = isSaving ? "-" : "+";
    return {
      formatted: `${sign}${Math.abs(pct).toFixed(1)}%`,
      rawPct: pct,
      isSaving: isSaving,
      isAlreadyOptimal: false,
    };
  }, [preOptimizeDistanceKm, optimizedDistanceKm]);

  // Save Route
  const handleSaveRoute = async () => {
    if (!routeName.trim()) {
      alert("Please provide a Route Name.");
      return;
    }
    if (stops.length < 2) {
      alert("Please configure at least 2 stops.");
      return;
    }

    const payload = {
      ...(initialRoute || {}),
      name: routeName.trim(),
      startPoint: (stops[0].stopName || stops[0].address || "Start").slice(0, 140),
      endPoint: (stops[stops.length - 1].stopName || stops[stops.length - 1].address || "Destination").slice(0, 140),
      distance: `${totalDistanceKm.toFixed(1)} km`,
      durationMinutes: totalDurationMins,
      stops: stops.map((s, idx) => {
        const rawId = s.stopId || s.id;
        const validStopId = typeof rawId === "number" && !isNaN(rawId) && rawId < 1000000000 ? rawId : null;
        return {
          stopId: validStopId,
          stopName: s.stopName || `Stop ${idx + 1}`,
          name: s.stopName || `Stop ${idx + 1}`,
          address: s.address || "",
          latitude: Number(s.latitude),
          longitude: Number(s.longitude),
          stopOrder: idx + 1,
          arrivalTime: s.arrivalTime || null,
        };
      }),
      geometryGeojson: rawGeoJson ? JSON.stringify(rawGeoJson) : null,
      isActive: true,
    };

    setIsSaving(true);
    setSaveError("");
    try {
      await onSave(payload);
    } catch (err) {
      setSaveError(err.response?.data?.message || err.message || "Failed to save route.");
    } finally {
      setIsSaving(false);
    }
  };

  const activeStop = stops[activeStopIndex] || stops[0];

  return (
    <div className="stitch-builder-page">
      {/* ============================================================
          TOP HEADER: ROUTE IDENTITY & ACTIONS
          ============================================================ */}
      <div className="stitch-builder-header">
        <div className="stitch-header-left">
          {/* Back Icon Button ONLY (User requested) */}
          <button
            type="button"
            onClick={onClose}
            className="stitch-btn-icon-only"
            title="Back to Routes"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "20px" }}>arrow_back</span>
          </button>

          <div className="stitch-header-icon">
            <span className="material-symbols-outlined">alt_route</span>
          </div>

          <div className="stitch-header-meta">
            <div className="stitch-header-title-row">
              {isEditingRouteName ? (
                <input
                  type="text"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  onBlur={() => setIsEditingRouteName(false)}
                  onKeyDown={(e) => e.key === "Enter" && setIsEditingRouteName(false)}
                  autoFocus
                  className="stitch-title-input"
                />
              ) : (
                <h2
                  onClick={() => setIsEditingRouteName(true)}
                  className="stitch-route-title"
                  title="Click to rename route"
                >
                  {routeName}
                  <span className="material-symbols-outlined" style={{ fontSize: "14px", marginLeft: "4px", opacity: 0.5 }}>
                    edit
                  </span>
                </h2>
              )}
              <span className="stitch-chip-shift">Shift 01</span>
              <span className="stitch-chip-status">
                <span className="stitch-chip-status-dot"></span>
                Active
              </span>
            </div>
          </div>
        </div>

        <div className="stitch-header-actions">
          {optimizationMsg && (
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#006444", background: "#d3ffe5", padding: "4px 8px", borderRadius: "6px" }}>
              {optimizationMsg}
            </span>
          )}

          <button
            type="button"
            onClick={handleOptimizeRoute}
            disabled={isOptimizing || stops.length < 3}
            className="stitch-btn-optimize"
            title="2-Opt Intelligent Route Optimization"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "17px" }}>auto_fix_high</span>
            <span>{isOptimizing ? "Optimizing..." : "Optimize Route"}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveRoute}
            disabled={isSaving}
            className="stitch-btn-save"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "17px" }}>save</span>
            <span>{isSaving ? "Saving..." : "Save Route"}</span>
          </button>
        </div>
      </div>

      {/* Save Error Alert */}
      {saveError && (
        <div style={{ padding: "8px 16px", background: "#fee2e2", color: "#dc2626", fontSize: "12px", fontWeight: "600", display: "flex", justifyContent: "space-between" }}>
          <span>{saveError}</span>
          <button onClick={() => setSaveError("")} style={{ border: "none", background: "none", color: "#dc2626", fontWeight: "700", cursor: "pointer" }}>×</button>
        </div>
      )}

      {/* ============================================================
          MOBILE TABS (STOPS LIST VS INTERACTIVE MAP)
          ============================================================ */}
      <div className="stitch-mobile-tabs">
        <button
          type="button"
          onClick={() => setMobileTab("stops")}
          className={`stitch-mobile-tab-btn ${mobileTab === "stops" ? "active" : ""}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>format_list_numbered</span>
          <span>Stops List ({stops.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("map")}
          className={`stitch-mobile-tab-btn ${mobileTab === "map" ? "active" : ""}`}
        >
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>map</span>
          <span>Interactive Map</span>
        </button>
      </div>

      {/* ============================================================
          MAIN SPLIT VIEW (LEFT STOPS SIDEBAR + RIGHT MAP PANEL)
          ============================================================ */}
      <div className="stitch-split-body">
        {/* LEFT SIDEBAR: STOPS MANIFEST */}
        <div className={`stitch-stops-sidebar ${mobileTab === "map" ? "hidden-mobile" : ""}`}>
          {/* Prominent Top Mapbox Search JS Bar */}
          <div className="stitch-top-search-container" ref={searchContainerRef}>
            <div className="stitch-top-search-box">
              <span className="material-symbols-outlined search-icon">search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowSearchDropdown(true);
                }}
                placeholder="Search Indian locations, campuses, hostels, stops..."
                className="stitch-top-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                    setShowSearchDropdown(false);
                  }}
                  className="stitch-top-search-clear"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>cancel</span>
                </button>
              )}
            </div>

            {/* Instant Floating Search Dropdown */}
            {showSearchDropdown && (
              <div className="stitch-search-dropdown">
                {isSearching && (
                  <div style={{ padding: "8px 12px", fontSize: "11px", color: "#64748b" }}>
                    Searching verified Indian locations...
                  </div>
                )}
                {!isSearching && searchResults.length === 0 && (
                  <div style={{ padding: "10px 12px", fontSize: "11px", color: "#94a3b8", textAlign: "center" }}>
                    No results found. Try a street, city, or landmark.
                  </div>
                )}
                {searchResults.map((item) => (
                  <div key={item.id} className="stitch-search-result-row">
                    <div className="stitch-result-text">
                      <div className="stitch-result-title" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: "15px", color: "#0050c0" }}>
                          {getCategoryIcon(item.category)}
                        </span>
                        <span>{item.name}</span>
                      </div>
                      <div className="stitch-result-subtitle">{item.address}</div>
                    </div>
                    <div className="stitch-result-actions">
                      <button
                        type="button"
                        onClick={() => handleSelectLocation(item, "add")}
                        className="stitch-btn-result-action add"
                        title="Add as next stop"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>add</span>
                        <span>Add</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectLocation(item, "set-start")}
                        className="stitch-btn-result-action start"
                        title="Set as Start Point"
                      >
                        <span>Start</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectLocation(item, "set-end")}
                        className="stitch-btn-result-action end"
                        title="Set as Destination"
                      >
                        <span>End</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="stitch-stops-subheader">
            <div className="stitch-subheader-title">
              <span className="material-symbols-outlined" style={{ color: "#0050c0", fontSize: "17px" }}>format_list_numbered</span>
              <span>Scheduled Stops</span>
            </div>
            <span className="stitch-counter-badge">{stops.length} Waypoints</span>
          </div>

          {/* Stops List (Start, intermediate, and End points are ALL changeable!) */}
          <div className="stitch-stops-scroll-area">
            {stops.map((stop, idx) => {
              const isOrigin = idx === 0;
              const isDest = idx === stops.length - 1;
              const isWaypoint = !isOrigin && !isDest;
              const isActive = activeStopIndex === idx;

              return (
                <React.Fragment key={stop.id || `stop-${idx}`}>
                  <div
                    className={`stitch-stop-card ${
                      isOrigin ? "is-origin" : isDest ? "is-destination" : isActive ? "is-active" : ""
                    } ${draggedIdx === idx ? "is-dragging" : ""} ${
                      dragOverIdx === idx && dragOverPos === "top" ? "drag-over-top" : ""
                    } ${dragOverIdx === idx && dragOverPos === "bottom" ? "drag-over-bottom" : ""}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    onClick={() => {
                      setActiveStopIndex(idx);
                      setFocusCoord([stop.latitude, stop.longitude]);
                    }}
                  >
                    {/* Drag Handle */}
                    <div
                      className="stitch-stop-drag-handle"
                      title="Drag to reorder anywhere in route"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "17px" }}>drag_indicator</span>
                    </div>

                    {/* Badge */}
                    <div className={`stitch-stop-badge ${isOrigin ? "origin" : isDest ? "destination" : "waypoint"} ${isActive ? "active" : ""}`}>
                      {isOrigin ? (
                        <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>warehouse</span>
                      ) : isDest ? (
                        <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>school</span>
                      ) : (
                        String(idx).padStart(2, "0")
                      )}
                    </div>

                    {/* Stop Info */}
                    <div className="stitch-stop-info">
                      <div className="stitch-stop-title-row">
                        <input
                          type="text"
                          value={stop.stopName}
                          onChange={(e) => handleRenameStop(idx, e.target.value)}
                          className="stitch-stop-name-editable"
                          title="Click to rename stop"
                        />
                        {isOrigin && <span className="stitch-stop-tag origin">START</span>}
                        {isDest && <span className="stitch-stop-tag dest">END</span>}
                      </div>
                      <span className="stitch-stop-address">{stop.address}</span>

                      {/* Time Pill */}
                      <div className="stitch-stop-time-container">
                        <div className="stitch-time-pill">
                          <span className="material-symbols-outlined" style={{ fontSize: "13px", color: isOrigin ? "#006444" : isDest ? "#645efb" : "#0050c0" }}>
                            {isDest ? "flag" : "schedule"}
                          </span>
                          <input
                            type="time"
                            value={stop.arrivalTime || "07:00"}
                            onChange={(e) => handleTimeChange(idx, e.target.value)}
                            className="stitch-time-input"
                            title="Edit stop arrival time"
                          />
                          {isWaypoint && (
                            <span className="stitch-time-delta">(+{stop.durationDelta || 10}m)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Controls (All stops have move up, move down, and delete!) */}
                    <div className="stitch-stop-actions">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveStop(idx, "up");
                        }}
                        disabled={idx === 0}
                        className="stitch-btn-icon"
                        title="Move up"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>keyboard_arrow_up</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMoveStop(idx, "down");
                        }}
                        disabled={idx === stops.length - 1}
                        className="stitch-btn-icon"
                        title="Move down"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>keyboard_arrow_down</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveStop(idx);
                        }}
                        disabled={stops.length <= 2}
                        className="stitch-btn-icon delete"
                        title="Remove stop"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>close</span>
                      </button>
                    </div>
                  </div>

                  {/* Inline Slot (+ Add Stop) */}
                  {idx < stops.length - 1 && (
                    <div className="stitch-divider-slot">
                      <div className="stitch-divider-line"></div>
                      <button
                        type="button"
                        onClick={() => setActiveInlineSlotIndex(activeInlineSlotIndex === idx + 1 ? null : idx + 1)}
                        className="stitch-divider-btn"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>add</span>
                        <span>Add Stop</span>
                      </button>

                      {/* Inline Popover */}
                      {activeInlineSlotIndex === idx + 1 && (
                        <div className="stitch-search-card" style={{ width: "100%", marginTop: "6px" }}>
                          <div className="stitch-search-input-wrapper">
                            <span className="material-symbols-outlined search-icon">search</span>
                            <input
                              type="text"
                              placeholder="Search location to insert..."
                              value={inlineSearchQuery}
                              onChange={(e) => setInlineSearchQuery(e.target.value)}
                              className="stitch-search-input"
                              autoFocus
                            />
                          </div>
                          {isSearchingInline && (
                            <div style={{ fontSize: "11px", color: "#64748b", padding: "4px 8px" }}>Searching Indian locations...</div>
                          )}
                          <div className="stitch-suggestions-list">
                            {inlineSuggestions.map((sug, sIdx) => (
                              <div key={`inline-sug-${sIdx}`} className="stitch-suggestion-item">
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontSize: "12px", fontWeight: "600", color: "#0b1c30" }}>{sug.name}</div>
                                  <div style={{ fontSize: "10px", color: "#64748b" }}>{sug.address}</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleInsertStop(sug, idx + 1)}
                                  className="stitch-btn-add-suggestion"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>add</span>
                                  <span>Insert</span>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {/* In-Place Bottom Stop Adder (Direct card, does NOT jump or focus top search) */}
            {!isBottomAddOpen ? (
              <button
                type="button"
                onClick={() => {
                  setIsBottomAddOpen(true);
                  setBottomSearchQuery("");
                  setBottomSearchResults([]);
                  setTimeout(() => bottomSearchInputRef.current?.focus(), 50);
                }}
                className="stitch-btn-add-stop-dashed"
                title="Add a new stop directly to this route"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>add_location_alt</span>
                <span>+ Add Stop to Route</span>
              </button>
            ) : (
              <div className="stitch-persistent-add-card">
                <div className="stitch-persistent-add-header">
                  <div className="stitch-persistent-add-title">
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>add_location_alt</span>
                    <span>Add Stop to Route</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsBottomAddOpen(false);
                      setBottomSearchQuery("");
                      setBottomSearchResults([]);
                    }}
                    className="stitch-persistent-add-close"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="stitch-persistent-add-body">
                  <div className="stitch-persistent-search-input-wrapper">
                    <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "#64748b" }}>search</span>
                    <input
                      ref={bottomSearchInputRef}
                      type="text"
                      placeholder="Type stop name, landmark, or street..."
                      value={bottomSearchQuery}
                      onChange={(e) => setBottomSearchQuery(e.target.value)}
                      className="stitch-persistent-search-input"
                    />
                    {bottomSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setBottomSearchQuery("");
                          setBottomSearchResults([]);
                          bottomSearchInputRef.current?.focus();
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "14px" }}
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {isSearchingBottom && (
                    <div style={{ fontSize: "11px", color: "#0050c0", padding: "2px 4px" }}>
                      Searching Indian locations...
                    </div>
                  )}

                  {bottomSearchResults.length > 0 && (
                    <div className="stitch-persistent-suggestions-list">
                      {bottomSearchResults.map((sug, sIdx) => (
                        <div key={`bottom-sug-${sIdx}`} className="stitch-persistent-suggestion-item">
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: "12px", fontWeight: "600", color: "#0b1c30" }}>{sug.name}</div>
                            <div style={{ fontSize: "10px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {sug.address}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const targetIndex = stops.length > 1 ? stops.length - 1 : stops.length;
                              handleInsertStop(sug, targetIndex, "add");
                            }}
                            className="stitch-btn-add-suggestion"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>add</span>
                            <span>Add Stop</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {(!bottomSearchQuery || bottomSearchQuery.trim().length < 2) && (
                    <div className="stitch-persistent-hint-box">
                      <span className="material-symbols-outlined" style={{ fontSize: "15px", color: "#0050c0" }}>tips_and_updates</span>
                      <span>Type stop name above, or click on any road on the map to snap a stop</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Mileage Display: Normal Mileage + Optimized KM & (+ or - %) */}
          <div className="stitch-metrics-bottom-bar">
            <div className="stitch-metrics-pill">
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ color: "#64748b" }}>Route Mileage:</span>
                <span style={{ fontWeight: "700", color: "#0050c0" }}>
                  {preOptimizeDistanceKm && savingsDisplay && !savingsDisplay.isAlreadyOptimal
                    ? `${preOptimizeDistanceKm.toFixed(1)} km`
                    : `${totalDistanceKm.toFixed(1)} km`}
                </span>
                <span style={{ color: "#94a3b8" }}>•</span>
                <span style={{ color: "#475569" }}>{totalDurationMins} mins</span>
              </div>

              {savingsDisplay && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {savingsDisplay.isAlreadyOptimal ? (
                    <span
                      style={{
                        background: "#e0f2fe",
                        color: "#0284c7",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontWeight: "700",
                        fontSize: "11px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "13px" }}>verified</span>
                      Already Optimal (0.0% change)
                    </span>
                  ) : (
                    <>
                      <span style={{ color: "#64748b" }}>→ Optimized:</span>
                      <span style={{ fontWeight: "800", color: "#0b1c30" }}>{totalDistanceKm.toFixed(1)} km</span>
                      <span
                        style={{
                          background: savingsDisplay.isSaving ? "#d3ffe5" : "#fee2e2",
                          color: savingsDisplay.isSaving ? "#006444" : "#dc2626",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: "700",
                          fontSize: "11px",
                        }}
                      >
                        ({savingsDisplay.formatted})
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: FULL-BLEED LEAFLET INTERACTIVE ROAD MAP (Satellite Removed) */}
        <div className={`stitch-map-panel ${mobileTab === "stops" ? "hidden-mobile" : ""}`}>
          <div className="stitch-map-viewport">
            <MapContainer
              center={[stops[0]?.latitude || 16.3045, stops[0]?.longitude || 80.4485]}
              zoom={13}
              style={{ height: "100%", width: "100%", background: "#eff4ff" }}
              zoomControl={false}
            >
              {/* Only Standard Clean OpenStreetMap Layer (Satellite Removed) */}
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                maxZoom={19}
              />

              <MapController
                routeCoords={roadCoordinates.length > 0 ? roadCoordinates : stops.map((s) => [s.latitude, s.longitude])}
                fitTrigger={fitTrigger}
                focusCoord={focusCoord}
              />

              <MapClickHandler onMapClick={handleMapClick} />

              {/* Road Geometry Polyline (OSRM Road Snapped - Solid Continuous Blue Line Path) */}
              {roadCoordinates.length > 0 && (
                <>
                  {/* Subtle soft road casing */}
                  <Polyline
                    positions={roadCoordinates}
                    pathOptions={{
                      color: "#1a68ea",
                      weight: 8,
                      opacity: 0.22,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                  {/* Solid full blue core line */}
                  <Polyline
                    positions={roadCoordinates}
                    pathOptions={{
                      color: "#1a68ea",
                      weight: 5,
                      opacity: 0.95,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                </>
              )}

              {/* Stop Markers */}
              {stops.map((stop, sIdx) => {
                const isOrigin = sIdx === 0;
                const isDest = sIdx === stops.length - 1;
                const isActive = activeStopIndex === sIdx;

                let icon = null;
                if (isOrigin) {
                  icon = createOriginIcon();
                } else if (isDest) {
                  icon = createDestinationIcon();
                } else {
                  icon = createWaypointIcon(sIdx, isActive);
                }

                return (
                  <Marker
                    key={`marker-${stop.id || sIdx}`}
                    position={[stop.latitude, stop.longitude]}
                    icon={icon}
                    eventHandlers={{
                      click: () => {
                        setActiveStopIndex(sIdx);
                        setFocusCoord([stop.latitude, stop.longitude]);
                      },
                    }}
                  />
                );
              })}

              {/* Real Assigned Live Bus Marker (Only if an active vehicle is assigned) */}
              {assignedLiveBus && (
                <Marker
                  position={[assignedLiveBus.latitude, assignedLiveBus.longitude]}
                  icon={createLiveBusIcon(
                    assignedLiveBus.busNumber,
                    assignedLiveBus.speed,
                    assignedLiveBus.heading
                  )}
                />
              )}
            </MapContainer>

            {/* Top-Right Map Controls (Only Fit Bounds; Satellite Removed) */}
            <div className="stitch-map-top-controls">
              <button
                type="button"
                onClick={() => setFitTrigger((c) => c + 1)}
                className="stitch-map-pill-btn"
                title="Fit Route Bounds"
              >
                <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "#0050c0" }}>crop_free</span>
                <span>Fit Route</span>
              </button>
            </div>

            {/* Active Waypoint HUD Preview */}
            {activeStop && (
              <div className="stitch-active-hud-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", color: "#0050c0", textTransform: "uppercase" }}>
                    {activeStopIndex === 0
                      ? "Start Point"
                      : activeStopIndex === stops.length - 1
                      ? "Destination"
                      : `Waypoint #${String(activeStopIndex).padStart(2, "0")}`}
                  </span>
                  <span style={{ fontSize: "10px", fontWeight: "700", background: "#d3ffe5", color: "#006444", padding: "1px 6px", borderRadius: "4px" }}>
                    Active
                  </span>
                </div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "#0b1c30", marginTop: "4px" }}>
                  {activeStop.stopName}
                </div>
                <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
                  {activeStop.address}
                </div>
                <div style={{ marginTop: "8px", paddingTop: "6px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ color: "#64748b" }}>Scheduled Arrival:</span>
                  <span style={{ fontWeight: "700", color: "#0050c0" }}>ETA {formatTime12h(activeStop.arrivalTime || "07:00")}</span>
                </div>
              </div>
            )}

            {/* Map Click Insert Popover */}
            {mapInsertionData && (
              <div className="stitch-map-insert-modal">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="material-symbols-outlined" style={{ color: "#0050c0", fontSize: "17px" }}>pin_drop</span>
                    <span style={{ fontSize: "13px", fontWeight: "700" }}>Insert Stop Here?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMapInsertionData(null)}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "#64748b" }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>close</span>
                  </button>
                </div>
                <p style={{ fontSize: "11px", color: "#475569", margin: "4px 0 12px 0" }}>
                  {mapInsertionData.positionName}
                </p>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      handleInsertStop(
                        {
                          name: mapInsertionData.positionName,
                          address: `${mapInsertionData.lat.toFixed(4)}° N, ${mapInsertionData.lng.toFixed(4)}° E`,
                          lat: mapInsertionData.lat,
                          lng: mapInsertionData.lng,
                          timeDelta: 8,
                        },
                        mapInsertionData.segmentIndex,
                        "add"
                      );
                    }}
                    style={{
                      flex: 1,
                      padding: "6px 8px",
                      borderRadius: "6px",
                      background: "#0050c0",
                      color: "#ffffff",
                      border: "none",
                      fontSize: "11px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Add Stop
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleInsertStop(
                        {
                          name: mapInsertionData.positionName,
                          address: `${mapInsertionData.lat.toFixed(4)}° N, ${mapInsertionData.lng.toFixed(4)}° E`,
                          lat: mapInsertionData.lat,
                          lng: mapInsertionData.lng,
                          timeDelta: 0,
                        },
                        0,
                        "set-start"
                      );
                    }}
                    style={{
                      padding: "6px 8px",
                      borderRadius: "6px",
                      background: "#d3ffe5",
                      color: "#006444",
                      border: "none",
                      fontSize: "11px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Set Start
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleInsertStop(
                        {
                          name: mapInsertionData.positionName,
                          address: `${mapInsertionData.lat.toFixed(4)}° N, ${mapInsertionData.lng.toFixed(4)}° E`,
                          lat: mapInsertionData.lat,
                          lng: mapInsertionData.lng,
                          timeDelta: 8,
                        },
                        stops.length - 1,
                        "set-end"
                      );
                    }}
                    style={{
                      padding: "6px 8px",
                      borderRadius: "6px",
                      background: "#e2dfff",
                      color: "#4b41e1",
                      border: "none",
                      fontSize: "11px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Set End
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Floating Metrics Tray */}
            <div className="stitch-map-metrics-tray">
              <div className="stitch-metric-card">
                <div className="stitch-metric-icon">
                  <span className="material-symbols-outlined">straighten</span>
                </div>
                <div className="stitch-metric-info">
                  <span className="stitch-metric-label">
                    {savingsDisplay && !savingsDisplay.isAlreadyOptimal ? "Optimized Distance" : "Total Distance"}
                  </span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                    <span className="stitch-metric-val">{totalDistanceKm.toFixed(1)} km</span>
                    {savingsDisplay && (
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          color: savingsDisplay.isAlreadyOptimal
                            ? "#0284c7"
                            : (savingsDisplay.isSaving ? "#006444" : "#dc2626"),
                        }}
                      >
                        {savingsDisplay.isAlreadyOptimal ? "(Optimal)" : `(${savingsDisplay.formatted})`}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="stitch-metric-card">
                <div className="stitch-metric-icon" style={{ color: "#4b41e1" }}>
                  <span className="material-symbols-outlined">timer</span>
                </div>
                <div className="stitch-metric-info">
                  <span className="stitch-metric-label">Est. Duration</span>
                  <span className="stitch-metric-val">{totalDurationMins} mins</span>
                </div>
              </div>

              <div className="stitch-metric-card">
                <div className="stitch-metric-icon" style={{ color: "#006444" }}>
                  <span className="material-symbols-outlined">polyline</span>
                </div>
                <div className="stitch-metric-info">
                  <span className="stitch-metric-label">Waypoints</span>
                  <span className="stitch-metric-val">{stops.length} Stops</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
