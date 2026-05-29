/*
 * AIChat — Natural language interface for querying infrastructure.
 *
 * Terminal-inspired design with markdown rendering, streaming responses,
 * and context-aware answers about servers, metrics, and alerts.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Terminal,
  User,
  Loader2,
  Server,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const API_BASE = '/api';

const SUGGESTED_QUERIES = [
  'Summarize overall infrastructure health',
  'Which servers have high CPU utilization?',
  'Are there any disk space warnings?',
  'Explain the latest alert and suggest fixes',
  'What is the average memory usage across all servers?',
];

function ChatMessage({ role, content, timestamp }) {
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
      <div className={`max-w-[80%] ${isUser ? 'text-right' : ''}`}>
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
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Handle streaming response
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

    try {
      const res = await fetch(`${API_BASE}/ai/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          server: selectedServer || null,
          include_metrics: true,
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

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: fullText,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setStreamingText('');
    } catch (err) {
      console.error('Chat error:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ **Error:** ${err.message}. Make sure Ollama is running.`,
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
    sendMessage(query);
  }

  async function handleRefreshContext() {
    // Sends a "refresh" by asking for current health summary
    sendMessage('Give me a quick summary of current infrastructure health');
  }

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
            <ChatMessage key={i} role={msg.role} content={msg.content} timestamp={msg.timestamp} />
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
            <Sparkles className="w-3.5 h-3.5" />
            Suggested Queries
          </h3>
          <div className="space-y-2">
            {SUGGESTED_QUERIES.map((query, i) => (
              <button
                key={i}
                onClick={() => handleSuggestedQuery(query)}
                disabled={loading}
                className="w-full text-left text-xs text-gray-400 hover:text-white p-2 rounded-lg hover:bg-dark-800/50 transition-all disabled:opacity-50"
              >
                "{query}"
              </button>
            ))}
          </div>
        </div>

        {/* Context info */}
        <div className="glass-card p-4">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Server className="w-3.5 h-3.5" />
            Context
          </h3>
          <div className="space-y-2 text-xs text-gray-500">
            <p>Servers: {servers.length}</p>
            <p>Metrics available: {Object.keys(metrics).length}</p>
            <p>Active alerts: {alerts.filter((a) => a.status === 'active').length}</p>
            <p>Ollama: {navigator.onLine ? 'Connected' : 'Check connection'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
