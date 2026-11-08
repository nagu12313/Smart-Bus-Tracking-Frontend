import api from './api';

export const busService = {
  getAll: (config = {}) => api.get('/api/buses', config).then(r => r.data.data),
  getById: (id, config = {}) => api.get(`/api/buses/${id}`, config).then(r => r.data.data),
  create: (data, config = {}) => api.post('/api/buses', data, config).then(r => r.data.data),
  update: (id, data, config = {}) => api.put(`/api/buses/${id}`, data, config).then(r => r.data.data),
  delete: (id, config = {}) => api.delete(`/api/buses/${id}`, config).then(r => r.data),
  getStudents: (id, config = {}) => api.get(`/api/buses/${id}/students`, config).then(r => r.data.data),
};

export default busService;
