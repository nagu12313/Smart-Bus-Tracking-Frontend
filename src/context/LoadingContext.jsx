import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

const LoadingContext = createContext(null);

export function LoadingProvider({ children }) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processing, please wait...');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Monitor network connectivity
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen to centralized API loading events
  useEffect(() => {
    const handleLoadingEvent = (e) => {
      const active = Boolean(e.detail?.loading);
      setIsLoading(active);
      if (e.detail?.message) {
        setLoadingMessage(e.detail.message);
      } else if (!active) {
        setLoadingMessage('Processing, please wait...');
      }
    };

    window.addEventListener('app:global-loading', handleLoadingEvent);
    return () => window.removeEventListener('app:global-loading', handleLoadingEvent);
  }, []);

  // Manual reset in case of emergency or route transition
  const forceResetLoading = useCallback(() => {
    api.resetLoading();
    setIsLoading(false);
  }, []);

  return (
    <LoadingContext.Provider
      value={{
        isLoading,
        loadingMessage,
        setLoadingMessage,
        forceResetLoading,
        isOnline,
      }}
    >
      {/* Offline banner alert */}
      {!isOnline && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            background: '#ef4444',
            color: '#ffffff',
            padding: '8px 16px',
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: '600',
            zIndex: 100000,
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          <i className="bi bi-wifi-off me-2" />
          You are currently offline. Please check your internet connection.
        </div>
      )}
      {children}
    </LoadingContext.Provider>
  );
}

export const useLoading = () => {
  const ctx = useContext(LoadingContext);
  if (!ctx) {
    return {
      isLoading: false,
      loadingMessage: '',
      setLoadingMessage: () => {},
      forceResetLoading: () => {},
      isOnline: true,
    };
  }
  return ctx;
};

export default LoadingContext;
