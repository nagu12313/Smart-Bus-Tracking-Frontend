import api from './api';

// ============================================================
// Trip Service — start, end, and query trips
// ============================================================

export const tripService = {
  /** Start a new trip */
  startTrip: (busId, driverId, routeId, tripType = 'MORNING', notes = '') =>
    api.post('/api/trips/start', { busId, driverId, routeId, tripType, notes })
      .then(r => r.data.data),

  /** End an active trip */
  endTrip: (tripId) =>
    api.put(`/api/trips/${tripId}/end`).then(r => r.data.data),

  /** Get currently active trips */
  getActiveTrips: () =>
    api.get('/api/trips/active').then(r => r.data.data),

  /** Get all trips (paginated) */
  getAll: (page = 0, size = 20) =>
    api.get('/api/trips', { params: { page, size } }).then(r => r.data.data),
};

export default tripService;
