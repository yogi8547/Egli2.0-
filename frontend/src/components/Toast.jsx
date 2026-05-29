/**
 * Toast — Slide-in notification system for new alerts and events.
 *
 * Usage:
 *   import { ToastProvider, useToast } from './Toast';
 *   const { addToast } = useToast();
 *   addToast({ type: 'warning', title: 'High CPU', message: 'Server-01 at 91%' });
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle, CheckCircle, Info, X, Bell } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle,
  alert: Bell,
};

const COLORS = {
  critical: { border: 'border-danger/40', bg: 'bg-danger/10', icon: 'text-danger', glow: 'shadow-danger/20' },
  warning: { border: 'border-warning/40', bg: 'bg-warning/10', icon: 'text-warning', glow: 'shadow-warning/20' },
  info: { border: 'border-info/40', bg: 'bg-info/10', icon: 'text-info', glow: 'shadow-info/20' },
  success: { border: 'border-success/40', bg: 'bg-success/10', icon: 'text-success', glow: 'shadow-success/20' },
  alert: { border: 'border-accent-500/40', bg: 'bg-accent-500/10', icon: 'text-accent-500', glow: 'shadow-accent-500/20' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);

  const addToast = useCallback(({ type = 'info', title, message, duration = 5000 }) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, type, title, message, duration, entering: true }]);

    // Trigger enter animation
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, entering: false } : t))
      );
    }, 50);

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }

    return id;
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, dismissToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          const colors = COLORS[toast.type] || COLORS.info;
          const Icon = ICONS[toast.type] || ICONS.info;

          return (
            <div
              key={toast.id}
              className={`
                pointer-events-auto
                flex items-start gap-3 p-3 rounded-lg
                bg-dark-800/95 backdrop-blur-md border ${colors.border}
                shadow-lg ${colors.glow}
                transition-all duration-300 ease-out
                ${toast.entering ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
                ${toast.exiting ? 'translate-x-full opacity-0' : ''}
              `}
            >
              <div className={`p-1.5 rounded-md ${colors.bg} shrink-0`}>
                <Icon className={`w-4 h-4 ${colors.icon}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{toast.title}</p>
                {toast.message && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{toast.message}</p>
                )}
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="p-1 rounded text-gray-500 hover:text-white hover:bg-dark-700 transition-all shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
