/**
 * QuickActionGrid — A premium 4-column grid of quick-action shortcuts
 * inspired by fintech super-app dashboards.
 *
 * Provides one-click access to key infrastructure workflows with
 * animated icons, descriptions, and hover effects.
 */

import React, { useState } from 'react';
import {
  Search,
  AlertTriangle,
  Zap,
  TrendingUp,
  ArrowRight,
  Loader2,
  Network,
  Shield,
  FileText,
  ShieldCheck,
} from 'lucide-react';

const QUICK_ACTIONS = [
  // Row 1
  {
    id: 'quick-diagnose',
    label: 'Run Health Check',
    description: 'Instant system-wide diagnostics',
    icon: Search,
    color: '#00B9F1',
    gradient: 'from-[#00B9F1]/20 to-[#0098CC]/5',
    borderColor: '#00B9F1',
    action: 'diagnose',
  },
  {
    id: 'quick-alerts',
    label: 'Active Incidents',
    description: 'View unresolved alerts & issues',
    icon: AlertTriangle,
    color: '#bf616a',
    gradient: 'from-[#bf616a]/20 to-[#a04a50]/5',
    borderColor: '#bf616a',
    action: 'alerts',
  },
  {
    id: 'quick-auto-fix',
    label: 'Auto-Remediate',
    description: 'Apply AI-driven fixes to issues',
    icon: Zap,
    color: '#ebcb8b',
    gradient: 'from-[#ebcb8b]/20 to-[#c9a95c]/5',
    borderColor: '#ebcb8b',
    action: 'self-healing',
  },
  {
    id: 'quick-forecast',
    label: 'Predictive Analysis',
    description: 'AI-powered capacity forecasts',
    icon: TrendingUp,
    color: '#a3be8c',
    gradient: 'from-[#a3be8c]/20 to-[#8aa672]/5',
    borderColor: '#a3be8c',
    action: 'forecasts',
  },
  // Row 2
  {
    id: 'quick-network-scan',
    label: 'Network Scan',
    description: 'Map live topology & connections',
    icon: Network,
    color: '#b48ead',
    gradient: 'from-[#b48ead]/20 to-[#9a74a0]/5',
    borderColor: '#b48ead',
    action: 'network',
  },
  {
    id: 'quick-backup',
    label: 'Backup Now',
    description: 'Trigger config backup across servers',
    icon: Shield,
    color: '#d08770',
    gradient: 'from-[#d08770]/20 to-[#b06a50]/5',
    borderColor: '#d08770',
    action: 'servers',
  },
  {
    id: 'quick-audit',
    label: 'Audit Logs',
    description: 'Review recent changes & events',
    icon: FileText,
    color: '#00D4FF',
    gradient: 'from-[#00D4FF]/20 to-[#00a0d0]/5',
    borderColor: '#00D4FF',
    action: 'ai',
  },
  {
    id: 'quick-security',
    label: 'Security Audit',
    description: 'Check firewall & access policies',
    icon: ShieldCheck,
    color: '#5e81ac',
    gradient: 'from-[#5e81ac]/20 to-[#406490]/5',
    borderColor: '#5e81ac',
    action: 'alerts',
  },
];

export default function QuickActionGrid({ onAction }) {
  const [executing, setExecuting] = useState(null);

  const handleAction = (action) => {
    setExecuting(action.id);
    setTimeout(() => {
      setExecuting(null);
      if (onAction) onAction(action.action);
    }, 400);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {QUICK_ACTIONS.map((item) => {
        const Icon = item.icon;
        const isExecuting = executing === item.id;

        return (
          <button
            key={item.id}
            onClick={() => handleAction(item)}
            disabled={isExecuting}
            className={`
              group relative overflow-hidden rounded-xl p-4
              transition-all duration-300 ease-out
              hover:scale-[1.03] active:scale-[0.97]
              disabled:opacity-70 disabled:cursor-wait
            `}
            style={{
              background: `linear-gradient(135deg, ${item.gradient})`,
              border: `1px solid ${item.borderColor}30`,
              boxShadow: `0 2px 8px ${item.borderColor}08`,
            }}
          >
            {/* Hover glow overlay */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"
              style={{
                background: `radial-gradient(600px circle at center, ${item.color}10, transparent 60%)`,
              }}
            />

            {/* Top row: icon + status badge */}
            <div className="flex items-center justify-between mb-3">
              <div
                className="p-2.5 rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-[-4deg]"
                style={{ background: `${item.color}15` }}
              >
                {isExecuting ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: item.color }} />
                ) : (
                  <Icon className="w-5 h-5" style={{ color: item.color }} />
                )}
              </div>

              {/* Navigator arrow */}
              <div
                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0"
                style={{ background: `${item.color}10` }}
              >
                <ArrowRight className="w-3.5 h-3.5" style={{ color: item.color }} />
              </div>
            </div>

            {/* Label & Description */}
            <div className="text-left">
              <p className="text-sm font-semibold text-white mb-0.5 group-hover:text-white transition-colors">
                {item.label}
              </p>
              <p className="text-[10px] leading-relaxed" style={{ color: '#8a8ab0' }}>
                {item.description}
              </p>
            </div>

            {/* Bottom accent bar */}
            <div
              className="absolute bottom-0 left-0 right-0 h-0.5 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left"
              style={{ background: `linear-gradient(90deg, ${item.color}, transparent)` }}
            />
          </button>
        );
      })}
    </div>
  );
}
