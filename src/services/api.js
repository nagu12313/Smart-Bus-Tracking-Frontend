import axios from 'axios';

// ============================================================
// Centralized Axios instance for Smart Bus Tracking API
// High-Reliability Loading Management & Fault Tolerance
// ============================================================

/**
 * Resolve centralized API Base URL safely:
 * 1. Honors explicit VITE_API_BASE_URL (development or production).
 * 2. In local dev, falls back to http://localhost:8080.
 * 3. In production, falls back to window.location.origin (preventing localhost leakage).
 */
export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  const isRemoteDevice = typeof window !== 'undefined' && 
                         window.location && 
                         window.location.hostname !== 'localhost' && 
                         window.location.hostname !== '127.0.0.1';

  // If accessed from a phone/tablet on local Wi-Fi, never send localhost to the phone
  if (isRemoteDevice && !window.location.hostname.includes('vercel.app')) {
    if (envUrl && !envUrl.includes('localhost')) {
      return envUrl.trim().replace(/\/+$/, '');
    }
    return `http://${window.location.hostname}:8080`;
  }

  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:8080';
  }
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Resolve WebSocket Base URL safely (STOMP over WebSocket):
 * 1. Honors explicit VITE_WS_BASE_URL.
 * 2. Auto-converts http(s):// to ws(s):// matching the API base.
 * 3. Guarantees wss:// in production environments.
 */
export function getWsBaseUrl() {
  const envWs = import.meta.env.VITE_WS_BASE_URL;
  const isRemoteDevice = typeof window !== 'undefined' && 
                         window.location && 
                         window.location.hostname !== 'localhost' && 
                         window.location.hostname !== '127.0.0.1';

  if (isRemoteDevice && !window.location.hostname.includes('vercel.app')) {
    if (envWs && !envWs.includes('localhost')) {
      return envWs.trim().replace(/\/+$/, '');
    }
    return `ws://${window.location.hostname}:8080/ws`;
  }

  if (envWs && typeof envWs === 'string' && envWs.trim() !== '') {
    return envWs.trim().replace(/\/+$/, '');
  }
  const apiBase = getApiBaseUrl();
  if (apiBase.startsWith('https://')) {
    return apiBase.replace(/^https:\/\//i, 'wss://') + '/ws';
  }
  if (apiBase.startsWith('http://')) {
    return apiBase.replace(/^http:\/\//i, 'ws://') + '/ws';
  }
  return 'ws://localhost:8080/ws';
}

const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000, // 20 second hard timeout prevents hanging requests
  headers: {
    'Content-Type': 'application/json',
  },
});

// Map of currently in-flight request IDs: id -> { url, startedAt }
const activeRequestsMap = new Map();
let debounceTimer = null;

/**
 * Check if a request URL should be excluded from full-page global loading
 */
function shouldSkipGlobalLoading(config) {
  if (config.skipLoading || config.headers?.['X-Skip-Loading']) {
    return true;
  }
  const url = config.url || '';
  // Exclude ALL tracking endpoints (telemetry, history, GPS pings) and notifications
  if (
    url.includes('/api/tracking') ||
    url.includes('/api/notifications/unread-count')
  ) {
    return true;
  }
  return false;
}

/**
 * Dispatch global loading event with 150ms debounce
 */
function dispatchLoadingState(forceImmediate = false) {
  const count = activeRequestsMap.size;

  if (count > 0) {
    if (forceImmediate) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      window.dispatchEvent(
        new CustomEvent('app:global-loading', {
          detail: { loading: true },
        })
      );
      return;
    }

    if (!debounceTimer) {
      // 150ms debounce prevents flickering on instant responses
      debounceTimer = setTimeout(() => {
        if (activeRequestsMap.size > 0) {
          window.dispatchEvent(
            new CustomEvent('app:global-loading', {
              detail: { loading: true },
            })
          );
        }
        debounceTimer = null;
      }, 150);
    }
  } else {
    // All requests have finished - immediately cancel debounce & clear loader
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    window.dispatchEvent(
      new CustomEvent('app:global-loading', {
        detail: { loading: false },
      })
    );
  }
}

/**
 * Hard Watchdog: runs every 3 seconds to auto-recover any orphaned requests
 * Ensures the app can NEVER be left stuck in an endless loading state.
 */
setInterval(() => {
  if (activeRequestsMap.size === 0) return;

  const now = Date.now();
  let cleaned = 0;

  for (const [id, req] of activeRequestsMap.entries()) {
    if (now - req.startedAt > 22000) {
      console.warn(`[API Watchdog] Automatically cleared hanging request: ${req.url}`);
      activeRequestsMap.delete(id);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    dispatchLoadingState(true);
  }
}, 3000);

/**
 * Exported manual reset function
 */
api.resetLoading = () => {
  activeRequestsMap.clear();
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  window.dispatchEvent(
    new CustomEvent('app:global-loading', {
      detail: { loading: false },
    })
  );
};

// ============================================================
// REQUEST INTERCEPTOR — Attach JWT & register request tracking
// ============================================================
api.interceptors.request.use(
  (config) => {
    // Attach unique identifier to request configuration
    const reqId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
    config._loadingId = reqId;

    if (!shouldSkipGlobalLoading(config)) {
      activeRequestsMap.set(reqId, {
        url: config.url,
        startedAt: Date.now(),
      });
      dispatchLoadingState(false);
    }

    // Attach JWT Authorization token
    const token = localStorage.getItem('edutrack_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    // Request failed to send
    if (error.config?._loadingId) {
      activeRequestsMap.delete(error.config._loadingId);
      dispatchLoadingState(true);
    }
    return Promise.reject(error);
  }
);

// ============================================================
// RESPONSE INTERCEPTOR — Release request tracking & handle errors
// ============================================================
api.interceptors.response.use(
  (response) => {
    if (response.config?._loadingId) {
      activeRequestsMap.delete(response.config._loadingId);
      dispatchLoadingState();
    }
    return response;
  },
  (error) => {
    // Guarantee cleanup on ANY failure (4xx, 5xx, Network Error, Timeout, Cancel)
    if (error.config?._loadingId) {
      activeRequestsMap.delete(error.config._loadingId);
    } else {
      // In case error.config was stripped by Axios, safety scan & clean oldest
      if (activeRequestsMap.size > 0) {
        const oldestKey = activeRequestsMap.keys().next().value;
        if (oldestKey) activeRequestsMap.delete(oldestKey);
      }
    }
    dispatchLoadingState(true);

    // Authentication expiry handling
    const isAuthEndpoint = error.config?.url?.includes('/api/auth/');
    if (error.response?.status === 401 && !isAuthEndpoint) {
      api.resetLoading();
      localStorage.removeItem('edutrack_token');
      localStorage.removeItem('edutrack_user');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default api;
