import api from './api';

// ============================================================
// Auth Service — Login, Register, Logout, Token management
// ============================================================

const TOKEN_KEY  = 'edutrack_token';
const USER_KEY   = 'edutrack_user';

export const authService = {
  /**
   * Login with email and password.
   * Stores JWT token and user info in localStorage.
   */
  async login(email, password) {
    const response = await api.post('/api/auth/login', { email, password });
    const { token, ...user } = response.data.data;
    if (user && !user.id && user.userId) {
      user.id = user.userId;
    }

    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    return { token, user };
  },

  /**
   * Send 6-digit OTP to user's email via Gmail SMTP
   */
  async sendOtp(email) {
    const response = await api.post('/api/auth/send-otp', { email });
    return response.data;
  },

  /**
   * Verify 6-digit OTP code
   */
  async verifyOtp(email, otp) {
    const response = await api.post('/api/auth/verify-otp', { email, otp });
    return response.data;
  },

  /**
   * Request 6-digit password reset OTP
   */
  async forgotPassword(email) {
    const response = await api.post('/api/auth/forgot-password', { email });
    return response.data;
  },

  /**
   * Reset password with 6-digit OTP and new password
   */
  async resetPassword(email, otp, newPassword) {
    const response = await api.post('/api/auth/reset-password', { email, otp, newPassword });
    return response.data;
  },

  /**
   * Register a new user with verified email OTP.
   */
  async register(name, email, password, role, otp) {
    const response = await api.post('/api/auth/register', { name, email, password, role, otp });
    const { token, ...user } = response.data.data;

    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));

    return { token, user };
  },

  /**
   * Logout — clear localStorage.
   */
  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  /**
   * Get stored JWT token.
   */
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  /**
   * Get stored user object.
   */
  getUser() {
    const userStr = localStorage.getItem(USER_KEY);
    if (!userStr) return null;
    try {
      const user = JSON.parse(userStr);
      if (user && !user.id && user.userId) {
        user.id = user.userId;
      }
      return user;
    } catch {
      return null;
    }
  },

  /**
   * Check if user is currently logged in.
   */
  isAuthenticated() {
    return !!this.getToken();
  },
};

export default authService;
