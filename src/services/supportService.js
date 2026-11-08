import api from "./api";

/**
 * Support Ticket & Helpdesk API Service
 */
const supportService = {
  // User operations
  async createTicket(payload) {
    const res = await api.post("/api/support/tickets", payload);
    return res.data?.data || res.data;
  },

  async getMyTickets() {
    const res = await api.get("/api/support/tickets/my");
    return res.data?.data || res.data || [];
  },

  async getTicketDetails(ticketId) {
    const res = await api.get(`/api/support/tickets/${ticketId}`);
    return res.data?.data || res.data;
  },

  async postMessage(ticketId, payload) {
    const res = await api.post(`/api/support/tickets/${ticketId}/messages`, payload);
    return res.data?.data || res.data;
  },

  async getMessages(ticketId) {
    const res = await api.get(`/api/support/tickets/${ticketId}/messages`);
    return res.data?.data || res.data || [];
  },

  // Administrator operations
  async getAllTicketsAdmin(params = {}) {
    const res = await api.get("/api/admin/support/tickets", { params });
    return res.data?.data || res.data;
  },

  async updateStatus(ticketId, payload) {
    const res = await api.patch(`/api/admin/support/tickets/${ticketId}/status`, payload);
    return res.data?.data || res.data;
  },

  async updatePriority(ticketId, payload) {
    const res = await api.patch(`/api/admin/support/tickets/${ticketId}/priority`, payload);
    return res.data?.data || res.data;
  },

  async assignTicket(ticketId, payload) {
    const res = await api.patch(`/api/admin/support/tickets/${ticketId}/assign`, payload);
    return res.data?.data || res.data;
  },

  async adminReply(ticketId, payload) {
    const res = await api.post(`/api/admin/support/tickets/${ticketId}/reply`, payload);
    return res.data?.data || res.data;
  },

  async emailAdminReport(email = "bollanagu6868@gmail.com") {
    const res = await api.post(`/api/admin/support/tickets/email-report?email=${encodeURIComponent(email)}`);
    return res.data?.data || res.data;
  },
};

export default supportService;
