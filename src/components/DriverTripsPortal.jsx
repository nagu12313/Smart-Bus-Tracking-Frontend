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
      {/* Header — Clean and Focused, No Unnecessary Widgets */}
      <div className="page-title mb-4">
        <div>
          <span className="eyebrow dark">DRIVER WORKSPACE</span>
          <h1>My Assigned Trips</h1>
          <p className="text-muted mb-0">
            Welcome back, <b>{user?.name}</b>. Select your assigned trip to open live route tracking.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline-primary rounded-pill px-3 py-1"
          onClick={loadTrips}
        >
          <i className="bi bi-arrow-clockwise me-1" /> Refresh Trips
        </button>
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 mb-4 rounded-3">
          <i className="bi bi-exclamation-triangle-fill me-2" />
          {error}
        </div>
      )}

      {/* Assigned Trips Cards */}
      {trips.length === 0 ? (
        <div className="panel p-5 text-center bg-white rounded-4 border">
          <div className="text-muted mb-3" style={{ fontSize: "42px" }}>
            <i className="bi bi-journal-x" />
          </div>
          <h5 className="fw-bold text-dark">No Trips Currently Assigned</h5>
          <p className="text-muted small mb-0">
            You do not have any scheduled trips assigned to your driver account at this time.
            Please contact the transport administrator.
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
                  className="panel p-4 h-100 d-flex flex-column justify-content-between position-relative"
                  style={{
                    borderRadius: "16px",
                    border: isInProgress ? "2px solid #22c55e" : "1px solid #e2e8f0",
                    background: isInProgress ? "#f0fdf4" : "#ffffff",
                    boxShadow: isInProgress ? "0 8px 24px rgba(34,197,94,0.12)" : "none",
                  }}
                >
                  <div>
                    {/* Status Pill & Trip Type */}
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <span
                        className="badge px-3 py-1 rounded-pill"
                        style={{
                          background: isInProgress ? "#dcfce7" : "#eff6ff",
                          color: isInProgress ? "#15803d" : "#2563eb",
                          fontWeight: "700",
                          fontSize: "12px",
                        }}
                      >
                        <i className={`bi ${isInProgress ? "bi-broadcast" : "bi-clock"} me-1`} />
                        {trip.tripType || "MORNING"} RUN · TRIP #{trip.id}
                      </span>

                      <span
                        className={`badge ${
                          isInProgress
                            ? "bg-success"
                            : isCompleted
                            ? "bg-secondary"
                            : "bg-primary"
                        } px-3 py-1 rounded-pill fw-bold`}
                      >
                        {isInProgress ? "🔴 IN PROGRESS" : trip.status}
                      </span>
                    </div>

                    {/* Route Name */}
                    <h4 className="fw-bold mb-2 text-dark">
                      {trip.routeName || "Campus Route"}
                    </h4>

                    {/* Bus Info */}
                    <div className="d-flex align-items-center gap-2 mb-3">
                      <span className="badge bg-light text-dark border px-2 py-1">
                        <i className="bi bi-bus-front-fill text-warning me-1" />
                        {trip.busNumber}
                      </span>
                      <span className="text-muted small">{trip.busName}</span>
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
                        <b>{trip.driverName || user?.name}</b>
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

                  {/* Direct Action Button — Opens Live Tracking Immediately */}
                  <button
                    type="button"
                    className={`btn btn-lg w-100 rounded-pill fw-bold py-2 ${
                      isInProgress ? "btn-success" : "btn-primary"
                    }`}
                    onClick={() => setSelectedTripId(trip.id)}
                  >
                    {isInProgress ? (
                      <>
                        Continue Live Tracking <i className="bi bi-arrow-right ms-2" />
                      </>
                    ) : (
                      <>
                        Open Live Tracking <i className="bi bi-arrow-right ms-2" />
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
