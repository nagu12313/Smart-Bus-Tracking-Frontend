import api from './api';

// ============================================================
// Auth Service — Production Login, Register, Logout, Token management
// ============================================================

const TOKEN_KEY  = 'edutrack_token';
const USER_KEY   = 'edutrack_user';

function handleAuthError(err, fallbackMessage) {
  if (err.response?.data?.data && typeof err.response.data.data === 'object' && !Array.isArray(err.response.data.data)) {
    const fieldErrors = Object.values(err.response.data.data).filter(Boolean);
    if (fieldErrors.length > 0) {
      throw new Error(fieldErrors.join('. '));
    }
  }
  if (err.response?.data?.message) {
    throw new Error(err.response.data.message);
  }
  if (err.response?.data?.error) {
    throw new Error(err.response.data.error);
  }
  if (!err.response) {
    throw new Error('Unable to connect to the backend server. Please verify that the backend is running at http://localhost:8080.');
  }
  throw new Error(err.message || fallbackMessage);
}

export const authService = {
  /**
   * Login with email and password via backend REST API.
   * Stores JWT token and user info in localStorage.
   */
  async login(email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    try {
      const response = await api.post('/api/auth/login', { email: cleanEmail, password: cleanPassword });
      const { token, ...user } = response.data.data;
      if (user && !user.id && user.userId) {
        user.id = user.userId;
      }

      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      return { token, user };
    } catch (err) {
      handleAuthError(err, 'Failed to sign in. Please verify your credentials.');
    }
  },

  /**
   * Send 6-digit OTP to user's email via Gmail SMTP / Brevo API
   */
  async sendOtp(email) {
    try {
      const response = await api.post('/api/auth/send-otp', { email: (email || '').trim().toLowerCase() });
      return response.data;
    } catch (err) {
      handleAuthError(err, 'Failed to send verification code. Please check the email address.');
    }
  },

  /**
   * Verify 6-digit OTP code
   */
  async verifyOtp(email, otp) {
    try {
      const response = await api.post('/api/auth/verify-otp', { email: (email || '').trim().toLowerCase(), otp: (otp || '').trim() });
      return response.data;
    } catch (err) {
      handleAuthError(err, 'Invalid or expired verification code.');
    }
  },

  /**
   * Request 6-digit password reset OTP
   */
  async forgotPassword(email) {
    try {
      const response = await api.post('/api/auth/forgot-password', { email: (email || '').trim().toLowerCase() });
      return response.data;
    } catch (err) {
      handleAuthError(err, 'Failed to send reset code. Please ensure the email is registered.');
    }
  },

  /**
   * Reset password with 6-digit OTP and new password
   */
  async resetPassword(email, otp, newPassword) {
    try {
      const response = await api.post('/api/auth/reset-password', {
        email: (email || '').trim().toLowerCase(),
        otp: (otp || '').trim(),
        newPassword,
      });
      return response.data;
    } catch (err) {
      handleAuthError(err, 'Failed to reset password. Please check your verification code.');
    }
  },

  /**
   * Register a new user with verified email OTP.
   */
  async register(name, email, password, role, otp) {
    try {
      const response = await api.post('/api/auth/register', {
        name: (name || '').trim(),
        email: (email || '').trim().toLowerCase(),
        password,
        role,
        otp: (otp || '').trim(),
      });
      const { token, ...user } = response.data.data;
      if (user && !user.id && user.userId) {
        user.id = user.userId;
      }

      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      return { token, user };
    } catch (err) {
      handleAuthError(err, 'Registration failed. Please check your details.');
    }
  },

  /**
   * Logout — clear stored authentication tokens and user state.
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
