/*
 * Layout — Main shell with sidebar, header, and content area.
 *
 * Provides navigation between views and shows connection/alert status.
 */

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Server,
  Bell,
  Bot,
  Wifi,
  WifiOff,
  Menu,
  Shield,
  TrendingUp,
} from 'lucide-react';
import LiveClock from './LiveClock';
import CountdownTimer from './CountdownTimer';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'servers', label: 'Servers', icon: Server },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'self-healing', label: 'Self-Healing', icon: Shield },
  { id: 'forecasts', label: 'Forecasts', icon: TrendingUp },
  { id: 'ai', label: 'AI Assistant', icon: Bot },
];

export default function Layout({ children, activeView, onNavigate, connected, alertCount, pollRemaining = 60, pollInterval = 60 }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-dark-950">
      {/* ── Sidebar ──────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          bg-dark-900 border-r border-dark-700/50
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-64' : 'w-20'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo */}
        <div className={`flex items-center h-16 px-4 border-b border-dark-700/50 ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {sidebarOpen && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-accent-500/20 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-accent-500" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Egli2.0</h2>
                <p className="text-[10px] text-gray-500">Infrastructure</p>
              </div>
            </div>
          )}
          {!sidebarOpen && (
            <div className="w-10 h-10 bg-accent-500/20 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-accent-500" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                  transition-all duration-200 text-sm font-medium
                  ${isActive
                    ? 'bg-accent-500/15 text-accent-500 shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-dark-800/50'
                  }
                  ${!sidebarOpen && 'justify-center px-0'}
                `}
                title={item.label}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {sidebarOpen && (
                  <span className="truncate">{item.label}</span>
                )}
                {sidebarOpen && item.id === 'alerts' && alertCount > 0 && (
                  <span className="ml-auto bg-danger/20 text-danger text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Connection Status */}
        <div className={`absolute bottom-0 left-0 right-0 p-4 border-t border-dark-700/50 ${!sidebarOpen && 'flex justify-center'}`}>
          <div className={`flex items-center gap-2 ${!sidebarOpen && 'flex-col'}`}>
            {connected ? (
              <Wifi className="w-4 h-4 text-success" />
            ) : (
              <WifiOff className="w-4 h-4 text-danger animate-pulse" />
            )}
            {sidebarOpen && (
              <span className={`text-xs ${connected ? 'text-success' : 'text-danger'}`}>
                {connected ? 'Live Connected' : 'Reconnecting...'}
              </span>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 border-b border-dark-700/50 bg-dark-900/50 backdrop-blur-sm flex items-center px-6 gap-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <Menu className="w-6 h-6" />
          </button>

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:block text-gray-400 hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1" />

          {/* Alert badge */}
          {alertCount > 0 && (
            <button
              onClick={() => onNavigate('alerts')}
              className="flex items-center gap-2 px-3 py-1.5 bg-danger/10 text-danger text-sm rounded-lg hover:bg-danger/20 transition-colors"
            >
              <Bell className="w-4 h-4" />
              <span className="font-medium">{alertCount} active</span>
            </button>
          )}

          {/* Poll countdown */}
          <CountdownTimer seconds={pollInterval} remaining={pollRemaining} size={32} />

          {/* Live clock */}
          <LiveClock />

          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-success' : 'bg-danger'} ${connected ? '' : 'animate-pulse'}`} />
            <span className={`text-[10px] font-mono ${connected ? 'text-success' : 'text-danger'}`}>
              {connected ? 'Live' : 'Reconnecting'}
            </span>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
