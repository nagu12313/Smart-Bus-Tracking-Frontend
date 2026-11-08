import api from './api';

export const studentService = {
  getAll: (config = {}) => api.get('/api/students', config).then(r => r.data.data),
  getById: (id, config = {}) => api.get(`/api/students/${id}`, config).then(r => r.data.data),
  create: (data, config = {}) => api.post('/api/students', data, config).then(r => r.data.data),
  update: (id, data, config = {}) => api.put(`/api/students/${id}`, data, config).then(r => r.data.data),
  delete: (id, config = {}) => api.delete(`/api/students/${id}`, config).then(r => r.data),
};

export default studentService;
