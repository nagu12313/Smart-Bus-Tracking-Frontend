import { Client } from '@stomp/stompjs';
import { getWsBaseUrl } from './api';

/**
 * Robust WebSocket Service for Real-Time GPS Tracking & Fleet Updates
 * - Automatic connection management & reconnect with backoff
 * - Clean STOMP topic subscription & unsubscribe lifecycle
 * - Safe error handling without crashing UI or leaking timers
 */
class WebSocketService {
  constructor() {
    this.client = null;
    this.subscriptions = new Map();
    this.statusListeners = new Set();
    this.status = 'DISCONNECTED';
  }

  connect() {
    if (this.client && this.client.active) {
      return;
    }

    const brokerURL = getWsBaseUrl();
    if (!brokerURL || (!brokerURL.startsWith('ws://') && !brokerURL.startsWith('wss://'))) {
      console.warn('[WebSocket] Invalid WS URL, skipping live connection:', brokerURL);
      return;
    }

    this.client = new Client({
      brokerURL,
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: () => {}, // Keep quiet in production
      onConnect: () => {
        this.status = 'CONNECTED';
        this.notifyStatus('CONNECTED');
        // Resubscribe all registered topics upon reconnect
        this.subscriptions.forEach((sub, topic) => {
          this.executeSubscription(topic, sub.callback);
        });
      },
      onDisconnect: () => {
        this.status = 'DISCONNECTED';
        this.notifyStatus('DISCONNECTED');
      },
      onStompError: (frame) => {
        console.warn('[WebSocket] STOMP protocol message:', frame.headers?.message || 'frame error');
      },
      onWebSocketClose: () => {
        this.status = 'DISCONNECTED';
        this.notifyStatus('DISCONNECTED');
      },
      onWebSocketError: () => {
        this.status = 'DISCONNECTED';
        this.notifyStatus('DISCONNECTED');
      },
    });

    try {
      this.client.activate();
    } catch (err) {
      console.warn('[WebSocket] Activation failed, will retry on next poll:', err.message);
    }
  }

  subscribe(topic, callback) {
    if (!topic || typeof callback !== 'function') return () => {};

    this.subscriptions.set(topic, { callback, stompSub: null });

    if (this.status === 'CONNECTED' && this.client?.connected) {
      this.executeSubscription(topic, callback);
    } else {
      this.connect();
    }

    return () => this.unsubscribe(topic);
  }

  executeSubscription(topic, callback) {
    const existing = this.subscriptions.get(topic);
    if (existing?.stompSub) {
      try {
        existing.stompSub.unsubscribe();
      } catch {}
    }

    if (this.client && this.client.connected) {
      try {
        const stompSub = this.client.subscribe(topic, (message) => {
          try {
            const data = JSON.parse(message.body);
            callback(data);
          } catch (e) {
            console.warn('[WebSocket] Error parsing message payload:', e);
          }
        });
        this.subscriptions.set(topic, { callback, stompSub });
      } catch (err) {
        console.warn(`[WebSocket] Subscription to ${topic} failed:`, err);
      }
    }
  }

  unsubscribe(topic) {
    const entry = this.subscriptions.get(topic);
    if (entry?.stompSub) {
      try {
        entry.stompSub.unsubscribe();
      } catch {}
    }
    this.subscriptions.delete(topic);
  }

  disconnect() {
    if (this.client) {
      this.subscriptions.forEach((entry) => {
        if (entry.stompSub) {
          try {
            entry.stompSub.unsubscribe();
          } catch {}
        }
      });
      this.subscriptions.clear();
      try {
        this.client.deactivate();
      } catch {}
      this.client = null;
      this.status = 'DISCONNECTED';
      this.notifyStatus('DISCONNECTED');
    }
  }

  onStatusChange(listener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  notifyStatus(newStatus) {
    this.statusListeners.forEach((listener) => {
      try {
        listener(newStatus);
      } catch {}
    });
  }
}

export const websocketService = new WebSocketService();
export default websocketService;
