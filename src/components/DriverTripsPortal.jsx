import React, { useState, useEffect } from "react";
import tripService from "../services/tripService";
import DriverTripLiveTracking from "./DriverTripLiveTracking";
import { ContainerSpinner } from "./Spinner";

export default function DriverTripsPortal({ user }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [error, setError] = useState("");

  const loadTrips = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await tripService.getMyTrips({ skipLoading: true });
      const tripList = Array.isArray(data) ? data : [];
      setTrips(tripList);

      // If there is already an active trip running, directly open it!
      const activeTrip = tripList.find((t) => t.status === "IN_PROGRESS");
      if (activeTrip && !selectedTripId) {
        setSelectedTripId(activeTrip.id);
      }
    } catch (err) {
      console.error("Failed to load driver trips:", err);
      setError("Unable to load assigned trips. Please ensure your driver profile is registered.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrips();
  }, [user?.id]);

  // If driver has opened a trip, directly render the full live tracking screen!
  if (selectedTripId) {
    return (
      <DriverTripLiveTracking
        tripId={selectedTripId}
        onBack={() => {
          setSelectedTripId(null);
          loadTrips();
        }}
        onTripUpdated={loadTrips}
      />
    );
  }

  if (loading && trips.length === 0) {
    return <ContainerSpinner minHeight="350px" />;
  }

  return (
    <div className="driver-assigned-trips-portal">
      {/* Driver Cockpit Modern Transit Hero */}
      <div className="transit-hero-banner mb-4">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 position-relative" style={{ zIndex: 2 }}>
          <div>
            <div className="d-flex align-items-center gap-2 mb-2">
              <span className="badge px-3 py-1 rounded-pill" style={{ background: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", border: "1px solid rgba(245, 158, 11, 0.4)", fontSize: "11px", fontWeight: "700" }}>
                <i className="bi bi-person-badge-fill me-1" /> DRIVER COCKPIT
              </span>
              <span className="badge px-3 py-1 rounded-pill" style={{ background: "rgba(16, 185, 129, 0.2)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.4)", fontSize: "11px", fontWeight: "700" }}>
                <i className="bi bi-broadcast me-1 spin-animation" /> GPS TRANSMITTER READY
              </span>
            </div>
            <h1 className="transit-hero-title">Driver Transit Workspace</h1>
            <p className="transit-hero-subtitle">
              Welcome on duty, <b>{user?.name}</b>. Select your assigned morning or evening run below to start GPS broadcast and passenger checklist.
            </p>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="date-pill" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", borderColor: "rgba(255,255,255,0.2)" }}>
              <i className="bi bi-calendar3" />{" "}
              {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
            <button
              type="button"
              className="btn btn-warning rounded-pill px-4 fw-bold shadow-sm"
              style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none", color: "#0f172a" }}
              onClick={loadTrips}
            >
              <i className="bi bi-arrow-clockwise me-1" /> Refresh Trips
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 mb-4 rounded-3">
          <i className="bi bi-exclamation-triangle-fill me-2" />
          {error}
        </div>
      )}

      {/* Assigned Trips Cards */}
      {trips.length === 0 ? (
        <div className="panel p-5 text-center bg-white rounded-4 border" style={{ borderRadius: "20px", boxShadow: "0 10px 30px -10px rgba(15,23,42,0.08)" }}>
          <div className="text-warning mb-3" style={{ fontSize: "52px" }}>
            <i className="bi bi-bus-front" />
          </div>
          <h4 className="fw-bold text-dark mb-1">No Active Trips Assigned</h4>
          <p className="text-muted small mb-0" style={{ maxWidth: "480px", margin: "auto" }}>
            You do not currently have any scheduled trips assigned to your driver account.
            If you are on duty, please ask your transport supervisor to assign a bus and route.
          </p>
        </div>
      ) : (
        <div className="row g-4">
          {trips.map((trip) => {
            const isInProgress = trip.status === "IN_PROGRESS";
            const isCompleted = trip.status === "COMPLETED";

            return (
              <div key={trip.id} className="col-md-6 col-lg-6">
                <div
                  className={`panel p-4 h-100 d-flex flex-column justify-content-between position-relative ${isInProgress ? "driver-trip-hero-card running" : "driver-trip-hero-card"}`}
                  style={{
                    borderRadius: "20px",
                    background: isInProgress ? "#f0fdf4" : "#ffffff",
                    border: isInProgress ? "2px solid #22c55e" : "1px solid #e2e8f0",
                  }}
                >
                  <div>
                    {/* Status Pill & Trip Type */}
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <span
                        className="badge px-3 py-1 rounded-pill"
                        style={{
                          background: isInProgress ? "#dcfce7" : "#fef3c7",
                          color: isInProgress ? "#15803d" : "#b45309",
                          fontWeight: "800",
                          fontSize: "12px",
                          border: isInProgress ? "1px solid #bbf7d0" : "1px solid #fde68a",
                        }}
                      >
                        <i className={`bi ${isInProgress ? "bi-broadcast" : "bi-clock-fill"} me-1`} />
                        {trip.tripType || "MORNING"} RUN · TRIP #{trip.id}
                      </span>

                      <span
                        className={`badge ${
                          isInProgress
                            ? "bg-success"
                            : isCompleted
                            ? "bg-secondary"
                            : "bg-warning text-dark"
                        } px-3 py-1 rounded-pill fw-bold`}
                      >
                        {isInProgress ? "🔴 IN PROGRESS" : trip.status}
                      </span>
                    </div>

                    {/* Route Name */}
                    <h3 className="fw-bold mb-2 text-dark" style={{ fontSize: "20px" }}>
                      {trip.routeName || "Campus Route"}
                    </h3>

                    {/* Bus Info */}
                    <div className="d-flex align-items-center gap-2 mb-3">
                      <span className="badge px-3 py-1 rounded-2" style={{ background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a", fontWeight: "800", fontSize: "12px" }}>
                        <i className="bi bi-bus-front-fill me-1" />
                        {trip.busNumber}
                      </span>
                      <span className="text-muted small fw-semibold">{trip.busName}</span>
                    </div>

                    {/* Details Lines */}
                    <div className="py-2 border-top border-bottom mb-3" style={{ fontSize: "13px" }}>
                      <div className="d-flex justify-content-between py-1">
                        <span className="text-muted">Scheduled Departure:</span>
                        <b className="text-dark">
                          {trip.startTime
                            ? new Date(trip.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : "07:30 AM"}
                        </b>
                      </div>
                      <div className="d-flex justify-content-between py-1">
                        <span className="text-muted">Assigned Driver:</span>
                        <b className="text-dark">{trip.driverName || user?.name}</b>
                      </div>
                      {trip.notes && (
                        <div className="d-flex justify-content-between py-1">
                          <span className="text-muted">Notes:</span>
                          <span className="text-muted fst-italic text-truncate" style={{ maxWidth: "200px" }}>
                            {trip.notes}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Direct Action Button — Large Touch Target for Tablets */}
                  <button
                    type="button"
                    className={`btn btn-lg w-100 rounded-pill fw-bold btn-driver-big-action ${
                      isInProgress ? "btn-success" : "btn-warning text-dark"
                    }`}
                    style={{
                      background: isInProgress
                        ? "linear-gradient(135deg, #10b981, #059669)"
                        : "linear-gradient(135deg, #f59e0b, #d97706)",
                      border: "none",
                      color: isInProgress ? "#fff" : "#0f172a",
                    }}
                    onClick={() => setSelectedTripId(trip.id)}
                  >
                    {isInProgress ? (
                      <>
                        <i className="bi bi-broadcast me-2" /> Continue Live GPS Tracking <i className="bi bi-arrow-right ms-2" />
                      </>
                    ) : (
                      <>
                        <i className="bi bi-play-circle-fill me-2" /> Start Trip &amp; Broadcast GPS <i className="bi bi-arrow-right ms-2" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
