import api from './api';

// ============================================================
// Notification Service — user notifications
// ============================================================

export const notificationService = {
  getAll: (page = 0, size = 20) =>
    api.get('/api/notifications', { params: { page, size } }).then(r => r.data.data),

  getUnreadCount: () =>
    api.get('/api/notifications/unread-count').then(r => r.data.data),

  markAsRead: (id) =>
    api.put(`/api/notifications/${id}/read`).then(r => r.data),

  markAllAsRead: () =>
    api.put('/api/notifications/read-all').then(r => r.data),
};

export default notificationService;
