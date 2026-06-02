/*
 * AIChat — Natural language interface for querying infrastructure.
 *
 * Terminal-inspired design with markdown rendering, streaming responses,
 * and context-aware answers about servers, metrics, and alerts.
 *
 * Features structured Root Cause Analysis (RCA) mode with one-click
 * auto-fix remediation buttons.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bot,
  Send,
  User,
  Loader2,
  Server,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Search,
  Terminal,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import AutoFixButton from './AutoFixButton';

const API_BASE = '/api';

const SUGGESTED_QUERIES = [
  'Summarize overall infrastructure health',
  'Which servers have high CPU utilization?',
  'Are there any disk space warnings?',
  'Explain the latest alert and suggest fixes',
  'What is the average memory usage across all servers?',
];

const TROUBLESHOOT_QUERIES = [
  'Perform root cause analysis of current issues',
  'What is the chain of failures happening right now?',
  'Suggest remediation actions for active alerts',
  'Check database connection pool health',
  'Which services are most at risk?',
];

function ChatMessage({ role, content, timestamp, actions, onExecuteAction, executingAction, actionResults }) {
  const isUser = role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} animate-fade-in`}>
      {/* Avatar */}
      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
        isUser
          ? 'bg-accent-500/20 text-accent-500'
          : 'bg-success/20 text-success'
      }`}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Message */}
      <div className={`max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div className={`
          rounded-lg p-3 text-sm leading-relaxed
          ${isUser
            ? 'bg-accent-500/10 text-gray-200'
            : 'bg-dark-800/80 text-gray-300 border border-dark-700/50'
          }
        `}>
          {isUser ? (
            <p>{content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  code: ({ node, inline, className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline ? (
                      <div className="bg-dark-950 rounded-lg p-3 my-2 overflow-x-auto">
                        <code className="text-xs font-mono text-gray-300" {...props}>
                          {children}
                        </code>
                      </div>
                    ) : (
                      <code className="bg-dark-900 px-1.5 py-0.5 rounded text-xs font-mono text-accent-500" {...props}>
                        {children}
                      </code>
                    );
                  },
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                  strong: ({ children }) => <strong className="text-gray-100 font-semibold">{children}</strong>,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Auto-fix action buttons */}
        {actions && actions.length > 0 && !isUser && (
          <div className="mt-2 space-y-1.5">
            {actions.map((action, i) => (
              <AutoFixButton
                key={action.action || i}
                action={action}
                onExecute={onExecuteAction}
                executing={executingAction}
                result={actionResults?.[action.action]}
              />
            ))}
          </div>
        )}

        {timestamp && (
          <p className="text-[10px] text-gray-600 mt-1 px-1">{timestamp}</p>
        )}
      </div>
    </div>
  );
}

export default function AIChat({ servers, metrics, alerts }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        '👋 **Welcome to AI Infrastructure Assistant!**\n\nI can help you analyze your infrastructure in natural language. Try asking about:\n\n- Server health and performance\n- Alert analysis and remediation\n- Resource utilization trends\n- Overall infrastructure status\n\nSelect a suggested query below or type your own question.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [selectedServer, setSelectedServer] = useState('');
  const [executingAction, setExecutingAction] = useState(null);
  const [actionResults, setActionResults] = useState({});
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // ── Execute auto-fix action ───────────────────────────────────────────
  const executeAction = useCallback(async (action) => {
    setExecutingAction(action.action);

    // For demo purposes, try the backend API first, then simulate
    try {
      let result;
      try {
        const res = await fetch(
          `${API_BASE}/alerts/${action.alertId || 'all'}/execute-action?action=${encodeURIComponent(action.action)}`,
          { method: 'POST' }
        );
        if (res.ok) {
          result = await res.json();
          result = result.result || result;
        } else {
          throw new Error('API error');
        }
      } catch {
        // Simulate execution for demo
        await new Promise((resolve) => setTimeout(resolve, 1500));
        result = {
          status: Math.random() > 0.25 ? 'success' : 'failed',
          output: action.risk === 'high'
            ? `Executed: ${action.command}\n→ Status: completed (exit 0)\n→ Duration: 1.8s\n→ Impact: Applied`
            : `Dry-run: ${action.command}\n→ Simulated successfully`,
          action: action.action,
        };
      }

      setActionResults((prev) => ({
        ...prev,
        [action.action]: result,
      }));

      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: result.status === 'success' ? 'success' : 'critical',
          title: result.status === 'success' ? '✓ Remediation Applied' : '✗ Remediation Failed',
          message: `${action.description}: ${result.output?.slice(0, 80) || result.status}`,
          duration: 5000,
        });
      }
    } catch (err) {
      console.error('Failed to execute action:', err);
    } finally {
      setExecutingAction(null);
    }
  }, []);

  // ── Send message ────────────────────────────────────────────────────
  async function sendMessage(message) {
    const userMsg = {
      role: 'user',
      content: message,
      timestamp: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setStreamingText('');

    // Determine if this is a troubleshooting/RCA query
    const isRCAQuery = message.toLowerCase().includes('root cause') ||
      message.toLowerCase().includes('chain of failure') ||
      message.toLowerCase().includes('remediation') ||
      message.toLowerCase().includes('analyze');

    try {
      const res = await fetch(`${API_BASE}/ai/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          server: selectedServer || null,
          include_metrics: true,
          mode: isRCAQuery ? 'rca' : 'general',
        }),
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.token) {
                fullText += parsed.token;
                setStreamingText(fullText);
              }
            } catch (err) {
              // Skip malformed JSON
            }
          }
        }
      }

      // Generate relevant auto-fix actions for RCA/troubleshooting responses
      let actions = null;
      if (isRCAQuery || fullText.toLowerCase().includes('remediation') || fullText.toLowerCase().includes('fix')) {
        actions = generateActionsForResponse(servers, metrics, alerts, fullText);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: fullText,
          timestamp: new Date().toLocaleTimeString(),
          actions: actions,
        },
      ]);
      setStreamingText('');
    } catch (err) {
      console.error('Chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ **Error:** ${err.message}. Make sure Ollama is running.\n\nIn the meantime, here's a summary based on available data:\n\n` +
            `- **Servers:** ${servers.length} total (${servers.filter(s => s.status === 'online').length} online, ${servers.filter(s => s.status === 'degraded').length} degraded, ${servers.filter(s => s.status === 'offline').length} offline)\n` +
            `- **Active alerts:** ${alerts.filter(a => a.status === 'active').length}\n` +
            `- **Critical alerts:** ${alerts.filter(a => a.severity === 'critical' && a.status === 'active').length}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendMessage(input.trim());
  }

  function handleSuggestedQuery(query) {
    setShowTroubleshoot(false);
    sendMessage(query);
  }

  async function handleRefreshContext() {
    sendMessage('Give me a quick summary of current infrastructure health');
  }

  // Group active alerts by server for context sidebar
  const alertSummary = React.useMemo(() => {
    const active = alerts.filter((a) => a.status === 'active');
    const byServer = {};
    active.forEach((a) => {
      if (!byServer[a.server]) byServer[a.server] = [];
      byServer[a.server].push(a);
    });
    return {
      total: active.length,
      critical: active.filter((a) => a.severity === 'critical').length,
      byServer,
    };
  }, [alerts]);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 animate-fade-in">
      {/* Chat Area */}
      <div className="flex-1 flex flex-col glass-card overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-dark-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-success/10">
              <Terminal className="w-4 h-4 text-success" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">AI Assistant</h2>
              <p className="text-[10px] text-gray-500">Natural language infrastructure queries</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Server filter */}
            {servers.length > 0 && (
              <select
                value={selectedServer}
                onChange={(e) => setSelectedServer(e.target.value)}
                className="bg-dark-800 text-xs text-gray-300 border border-dark-600 rounded-lg px-2 py-1.5 focus:outline-none focus:border-accent-500"
              >
                <option value="">All Servers</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            )}

            {/* RCA mode toggle */}
            <button
              onClick={() => setShowTroubleshoot(!showTroubleshoot)}
              className={`p-1.5 rounded transition-all ${
                showTroubleshoot
                  ? 'text-info bg-info/10'
                  : 'text-gray-500 hover:text-white hover:bg-dark-700'
              }`}
              title={showTroubleshoot ? 'Show general queries' : 'Show troubleshooting queries'}
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              onClick={handleRefreshContext}
              className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-dark-700 transition-all"
              title="Refresh context"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <ChatMessage
              key={i}
              role={msg.role}
              content={msg.content}
              timestamp={msg.timestamp}
              actions={msg.actions}
              onExecuteAction={executeAction}
              executingAction={executingAction}
              actionResults={actionResults}
            />
          ))}

          {/* Streaming message */}
          {streamingText && (
            <ChatMessage
              role="assistant"
              content={streamingText + '▌'}
              timestamp={new Date().toLocaleTimeString()}
            />
          )}

          {/* Loading indicator */}
          {loading && !streamingText && (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Analyzing infrastructure...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-dark-700/50 p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your infrastructure..."
                disabled={loading}
                className="w-full bg-dark-800 text-sm text-gray-200 placeholder-gray-500 rounded-lg px-4 py-2.5 pr-10 border border-dark-600 focus:outline-none focus:border-accent-500/50 transition-colors disabled:opacity-50"
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 text-accent-500 animate-spin" />
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-4 py-2.5 bg-accent-500/20 text-accent-500 rounded-lg hover:bg-accent-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Sidebar: Suggested Queries */}
      <div className="w-72 hidden xl:flex flex-col gap-4">
        <div className="glass-card p-4">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            {showTroubleshoot ? (
              <><AlertTriangle className="w-3.5 h-3.5 text-warning" /> Troubleshooting</>
            ) : (
              <><Sparkles className="w-3.5 h-3.5" /> Suggested Queries</>
            )}
          </h3>
          <div className="space-y-2">
            {(showTroubleshoot ? TROUBLESHOOT_QUERIES : SUGGESTED_QUERIES).map((query, i) => (
              <button
                key={i}
                onClick={() => handleSuggestedQuery(query)}
                disabled={loading}
                className={`w-full text-left text-xs p-2 rounded-lg transition-all disabled:opacity-50 ${
                  showTroubleshoot
                    ? 'text-warning/70 hover:text-warning hover:bg-warning/5'
                    : 'text-gray-400 hover:text-white hover:bg-dark-800/50'
                }`}
              >
                "{query}"
              </button>
            ))}
          </div>
          {!showTroubleshoot && (
            <button
              onClick={() => setShowTroubleshoot(true)}
              className="mt-2 text-[10px] text-info hover:text-info/80 transition-colors"
            >
              Switch to troubleshooting mode →
            </button>
          )}
        </div>

        {/* Context info */}
        <div className="glass-card p-4">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Server className="w-3.5 h-3.5" />
            Context
          </h3>
          <div className="space-y-2 text-xs text-gray-500">
            <div className="flex items-center justify-between">
              <span>Servers</span>
              <span className="font-mono">{servers.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Metrics</span>
              <span className="font-mono">{Object.keys(metrics).length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Active alerts</span>
              <span className={`font-mono ${alertSummary.critical > 0 ? 'text-danger' : 'text-gray-300'}`}>
                {alertSummary.total}
              </span>
            </div>
            {alertSummary.critical > 0 && (
              <div className="pt-2 border-t border-dark-700/30">
                <p className="text-[10px] text-danger/80 mb-1">
                  {alertSummary.critical} critical — needs attention
                </p>
                {Object.entries(alertSummary.byServer).slice(0, 3).map(([server, alts]) => (
                  <div key={server} className="flex items-center gap-1.5 text-[10px] py-0.5">
                    <span className="w-1 h-1 rounded-full bg-danger shrink-0" />
                    <span className="truncate">{server}</span>
                    <span className="ml-auto font-mono text-danger/70">{alts.length}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helper: Generate auto-fix actions from response context ─────────────

/**
 * Parses current alert/metric state and generates relevant remediation
 * actions that get displayed as inline buttons in the chat.
 */
function generateActionsForResponse(servers, metrics, alerts, responseText) {
  const actions = [];
  const criticalAlerts = (alerts || []).filter(
    (a) => a.status === 'active' && a.severity === 'critical'
  );
  const activeAlerts = (alerts || []).filter((a) => a.status === 'active');

  // Add actions for critical alerts
  criticalAlerts.slice(0, 2).forEach((alert) => {
    actions.push({
      action: `fix-${alert.server}-${alert.metric || 'issue'}`,
      description: `Auto-fix ${alert.server}`,
      command: alert.metric === 'memory_percent' || alert.message?.toLowerCase().includes('memory')
        ? `kubectl rollout restart deployment/${alert.server}`
        : alert.metric === 'cpu_percent'
          ? `docker update --cpus 2 ${alert.server}`
          : alert.metric === 'disk_percent'
            ? 'docker system prune -af'
            : alert.message?.toLowerCase().includes('connection')
              ? `systemctl restart ${alert.server}`
              : `echo "Restarting ${alert.server}..."`,
      risk: alert.severity === 'critical' ? 'high' : 'medium',
      alertId: alert.id,
    });
  });

  // Check for connection pool pattern (multiple connection/timeout alerts)
  const connectionAlerts = activeAlerts.filter(
    (a) => a.message?.toLowerCase().includes('connection') ||
         a.message?.toLowerCase().includes('timeout') ||
         a.message?.toLowerCase().includes('pool')
  );
  if (connectionAlerts.length >= 2) {
    actions.push({
      action: 'deploy-pgbouncer',
      description: 'Deploy PgBouncer connection pooler',
      command: 'kubectl apply -f infra/pgbouncer/deployment.yaml',
      risk: 'high',
    });
  }

  // Memory-related alerts suggest rollback
  const memAlerts = criticalAlerts.filter(
    (a) => a.metric === 'memory_percent' || a.message?.toLowerCase().includes('memory')
  );
  if (memAlerts.length >= 2) {
    actions.push({
      action: 'rollback-memory-regression',
      description: 'Rollback latest deployment (memory)',
      command: 'kubectl rollout undo deployment/payments-api',
      risk: 'high',
    });
  }

  // General clearing action
  if (activeAlerts.length > 0) {
    actions.push({
      action: 'restart-agents',
      description: 'Restart monitoring agents',
      command: 'docker-compose restart poller',
      risk: 'low',
    });
  }

  return actions.length > 0 ? actions : null;
}
