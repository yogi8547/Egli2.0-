/*
 * AutoFixButton — Shared remediation action button with risk levels,
 * execution states, and result feedback.
 *
 * Used in both AIOpsPanel and AIChat components.
 */

import React from 'react';
import { Terminal, Loader2, Zap, CheckCircle, XCircle } from 'lucide-react';

const RISK_COLORS = {
  low: { border: 'border-success/20', bg: 'bg-success/5', text: 'text-success', badge: 'bg-success/20 text-success' },
  medium: { border: 'border-warning/20', bg: 'bg-warning/5', text: 'text-warning', badge: 'bg-warning/20 text-warning' },
  high: { border: 'border-danger/20', bg: 'bg-danger/5', text: 'text-danger', badge: 'bg-danger/20 text-danger' },
};

export default function AutoFixButton({ action, onExecute, executing, result }) {
  const isExecuting = executing === action.action;
  const actionResult = result && result.action === action.action ? result : null;
  const colors = RISK_COLORS[action.risk] || RISK_COLORS.medium;

  const statusIcon = actionResult
    ? (actionResult.status === 'success' ? CheckCircle :
       actionResult.status === 'failed' ? XCircle :
       actionResult.status === 'pending' ? Loader2 : null)
    : null;

  const statusColor = actionResult
    ? (actionResult.status === 'success' ? 'text-success' :
       actionResult.status === 'failed' ? 'text-danger' :
       actionResult.status === 'pending' ? 'text-warning' : 'text-gray-500')
    : '';

  const isDone = actionResult?.status === 'success' || actionResult?.status === 'failed';

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} overflow-hidden transition-all ${
      isDone ? 'ring-1 ring-success/40' :
      actionResult?.status === 'failed' ? 'ring-1 ring-danger/40' : ''
    }`}>
      <div className="flex items-start gap-2.5 p-2.5">
        <div className={`p-1.5 rounded-lg shrink-0 ${colors.bg}`}>
          {isExecuting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-500" />
          ) : actionResult && statusIcon ? (
            <div className={statusColor}>
              {React.createElement(statusIcon, { className: 'w-3.5 h-3.5' })}
            </div>
          ) : (
            <Terminal className={`w-3.5 h-3.5 ${colors.text}`} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[11px] font-medium text-gray-200">{action.description}</span>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0 ${colors.badge}`}>
              {action.risk}
            </span>
          </div>
          {action.command && (
            <code className="text-[9px] text-gray-500 font-mono block truncate mt-0.5">
              {action.command}
            </code>
          )}
          {actionResult?.output && (
            <div className={`mt-1 text-[9px] font-mono truncate ${
              actionResult.status === 'success' ? 'text-success/70' :
              actionResult.status === 'failed' ? 'text-danger/70' :
              'text-gray-500'
            }`}>
              {actionResult.output.slice(0, 120)}
            </div>
          )}
        </div>
        <button
          onClick={() => onExecute?.(action)}
          disabled={isExecuting}
          className={`shrink-0 p-1.5 rounded-md transition-all ${
            isExecuting ? 'opacity-50 cursor-not-allowed' :
            'text-accent-500 hover:bg-accent-500/10'
          }`}
          title="Execute action"
        >
          <Zap className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
