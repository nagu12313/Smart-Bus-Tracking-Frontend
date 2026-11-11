import api from "./api";

/**
 * Smart Transport Assistant Chatbot API Service
 */
const transportChatService = {
  async sendMessage(message) {
    const res = await api.post("/api/transport-chat/message", { message });
    return res.data?.data || res.data;
  },

  async getInitContext() {
    const res = await api.get("/api/transport-chat/init");
    return res.data?.data || res.data;
  },

  async getHistory() {
    const res = await api.get("/api/transport-chat/history");
    return res.data?.data || res.data || [];
  },

  async clearHistory() {
    const res = await api.delete("/api/transport-chat/history");
    return res.data?.data || res.data;
  },
};

export default transportChatService;
