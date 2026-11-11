import api from './api';

export const routeService = {
  getAll: (config = {}) => api.get('/api/routes', config).then(r => r.data.data),
  getById: (id, config = {}) => api.get(`/api/routes/${id}`, config).then(r => r.data.data),
  create: (data, config = {}) => api.post('/api/routes', data, config).then(r => r.data.data),
  update: (id, data, config = {}) => api.put(`/api/routes/${id}`, data, config).then(r => r.data.data),
  delete: (id, config = {}) => api.delete(`/api/routes/${id}`, config).then(r => r.data),
  preview: (stops, config = {}) => api.post('/api/routes/preview', { stops }, config).then(r => r.data.data),
  optimize: (stops, config = {}) => api.post('/api/routes/optimize', { stops }, config).then(r => r.data.data),
};

export default routeService;
