import api from './api';

// ============================================================
// Trip Service — start, end, and query trips
// ============================================================

export const tripService = {
  /** Start a new trip */
  startTrip: (busId, driverId, routeId, tripType = 'MORNING', notes = '') =>
    api.post('/api/trips/start', { busId, driverId, routeId, tripType, notes })
      .then(r => r.data.data),

  /** Start an existing scheduled trip directly */
  startScheduledTrip: (tripId) =>
    api.put(`/api/trips/${tripId}/start`).then(r => r.data.data),

  /** End an active trip */
  endTrip: (tripId) =>
    api.put(`/api/trips/${tripId}/end`).then(r => r.data.data),

  /** Get trips assigned to the currently logged in driver */
  getMyTrips: (config = {}) =>
    api.get('/api/trips/my-trips', config).then(r => r.data.data),

  /** Get trip by ID */
  getById: (tripId, config = {}) =>
    api.get(`/api/trips/${tripId}`, config).then(r => r.data.data),

  /** Get currently active trips */
  getActiveTrips: (config = {}) =>
    api.get('/api/trips/active', config).then(r => r.data.data),

  /** Get all trips (paginated) */
  getAll: (page = 0, size = 20) =>
    api.get('/api/trips', { params: { page, size } }).then(r => r.data.data),
};

export default tripService;
