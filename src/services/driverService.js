import api from './api';

export const driverService = {
  getAll: (config = {}) => api.get('/api/drivers', config).then(r => r.data.data),
  getById: (id, config = {}) => api.get(`/api/drivers/${id}`, config).then(r => r.data.data),
  create: (data, config = {}) => api.post('/api/drivers', data, config).then(r => r.data.data),
  update: (id, data, config = {}) => api.put(`/api/drivers/${id}`, data, config).then(r => r.data.data),
  delete: (id, config = {}) => api.delete(`/api/drivers/${id}`, config).then(r => r.data),
};

export default driverService;
