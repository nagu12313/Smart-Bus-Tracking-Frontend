import api from './api';

// ============================================================
// Attendance Service — student pickup/dropoff attendance
// ============================================================

export const attendanceService = {
  record: (studentId, tripId, type, notes) =>
    api.post('/api/attendance', { studentId, tripId, type, notes }).then(r => r.data.data),

  getAll: (page = 0, size = 20) =>
    api.get('/api/attendance', { params: { page, size } }).then(r => r.data.data),

  getByStudent: (studentId, page = 0, size = 20) =>
    api.get(`/api/attendance/student/${studentId}`, { params: { page, size } })
      .then(r => r.data.data),
};

export default attendanceService;
