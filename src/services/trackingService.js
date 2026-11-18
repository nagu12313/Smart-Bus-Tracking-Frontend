import api from './api';

export const trackingService = {
  getLatestLocation: (busId, config = {}) =>
    api.get(`/api/tracking/bus/${busId}/location`, { skipLoading: true, ...config }).then(r => r.data.data),

  getHistory: (busId, limit = 50, config = {}) =>
    api.get(`/api/tracking/bus/${busId}/history`, { params: { limit }, ...config })
      .then(r => r.data.data),

  getAllLatest: (config = {}) =>
    api.get('/api/tracking/all/latest', { skipLoading: true, ...config }).then(r => r.data.data),

  getActiveBuses: (config = {}) =>
    api.get('/api/tracking/active-buses', { skipLoading: true, ...config }).then(r => r.data.data),

  getDashboard: (config = {}) =>
    api.get('/api/admin/dashboard', config).then(r => r.data.data),

  sendDriverLocation: (locationData, config = {}) =>
    api.post('/api/tracking/driver/location', locationData, { skipLoading: true, ...config })
      .then(r => r.data.data),
};

export default trackingService;
