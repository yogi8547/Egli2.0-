/**
 * ImportServersModal — Modal for batch-importing servers from a JSON file.
 *
 * Supports:
 * - File picker and drag-and-drop
 * - JSON validation + preview of parsed servers
 * - Submit to POST /api/servers/bulk-import
 * - Per-server result display (created/skipped/error)
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  X,
  Upload,
  FileText,
  Check,
  AlertTriangle,
  Loader,
  Server,
  Download,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Info,
} from 'lucide-react';

export default function ImportServersModal({ isOpen, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [parsedServers, setParsedServers] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [skipDupes, setSkipDupes] = useState(true);
  const [expandedErrors, setExpandedErrors] = useState(false);
  const fileInputRef = useRef(null);

  // ── Reset state when modal opens/closes ────────────────────────────
  function resetAll() {
    setFile(null);
    setParsedServers([]);
    setParseError(null);
    setSubmitting(false);
    setResults(null);
    setDragOver(false);
    setExpandedErrors(false);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  // ── JSON parsing ───────────────────────────────────────────────────
  function parseJSON(text) {
    try {
      let data = JSON.parse(text);

      // Accept either a plain array or { "servers": [...] }
      if (!Array.isArray(data)) {
        if (data.servers && Array.isArray(data.servers)) {
          data = data.servers;
        } else {
          throw new Error('JSON must be an array of server objects, or an object with a "servers" array');
        }
      }

      if (data.length === 0) {
        throw new Error('The JSON array is empty — no servers to import');
      }

      // Validate each entry has at least id, name, host
      for (let i = 0; i < data.length; i++) {
        const s = data[i];
        if (!s.id || !s.name || !s.host) {
          throw new Error(
            `Entry ${i + 1} is missing required fields (id, name, host). Got: ${JSON.stringify(s)}`
          );
        }
      }

      setParsedServers(data);
      setParseError(null);
    } catch (err) {
      setParsedServers([]);
      setParseError(err.message);
    }
  }

  function handleFile(file) {
    setFile(file);
    setResults(null);
    const reader = new FileReader();
    reader.onload = (e) => parseJSON(e.target.result);
    reader.onerror = () => setParseError('Failed to read file');
    reader.readAsText(file);
  }

  function handleFileInput(e) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  // ── Drag & drop ────────────────────────────────────────────────────
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (parsedServers.length === 0) return;

    setSubmitting(true);
    setResults(null);

    try {
      const res = await fetch('/api/servers/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          servers: parsedServers,
          skip_duplicates: skipDupes,
        }),
      });

      const data = await res.json();
      setResults(data);

      if (!res.ok) {
        throw new Error(data.detail || `Server error (${res.status})`);
      }

      if (window.__toast?.addToast) {
        const hasErrors = data.errors > 0;
        window.__toast.addToast({
          type: hasErrors ? 'warning' : 'success',
          title: 'Import Complete',
          message: `${data.created} created, ${data.skipped} skipped, ${data.errors} errors (${data.total} total)`,
          duration: 6000,
        });
      }

      if (data.created > 0) {
        onImported?.();
      }
    } catch (err) {
      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: 'critical',
          title: 'Import Failed',
          message: err.message,
          duration: 8000,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  const hasErrors = results && results.errors > 0;
  const hasSkipped = results && results.skipped > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl glass-card border border-dark-600/50 shadow-2xl shadow-black/40 animate-scale-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-accent-500/20 rounded-lg flex items-center justify-center">
              <Upload className="w-4 h-4 text-accent-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Import Servers</h2>
              <p className="text-[10px] text-gray-500">Batch-register servers from a JSON file</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-dark-700 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto">
          {/* Results summary (shown after import) */}
          {results && (
            <div className={`p-3 rounded-lg border ${
              hasErrors
                ? 'bg-warning/10 border-warning/20'
                : 'bg-success/10 border-success/20'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {hasErrors ? (
                  <AlertTriangle className="w-4 h-4 text-warning" />
                ) : (
                  <Check className="w-4 h-4 text-success" />
                )}
                <span className="text-sm font-medium text-white">Import Results</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-success">{results.created} created</span>
                {results.skipped > 0 && (
                  <span className="text-gray-400">{results.skipped} skipped</span>
                )}
                {results.errors > 0 && (
                  <span className="text-danger">{results.errors} failed</span>
                )}
                <span className="text-gray-500">({results.total} total)</span>
              </div>

              {/* Per-server error details */}
              {(hasErrors || hasSkipped) && (
                <div className="mt-2">
                  <button
                    onClick={() => setExpandedErrors(!expandedErrors)}
                    className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white transition-all"
                  >
                    {expandedErrors ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    View details
                  </button>
                  {expandedErrors && (
                    <div className="mt-1 space-y-1 max-h-32 overflow-y-auto">
                      {results.results.filter((r) => r.status !== 'created').map((r, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-2 p-1.5 rounded text-[10px] ${
                            r.status === 'error'
                              ? 'bg-danger/10 text-danger'
                              : 'bg-dark-800 text-gray-400'
                          }`}
                        >
                          {r.status === 'error' ? (
                            <AlertCircle className="w-3 h-3 flex-shrink-0" />
                          ) : (
                            <Info className="w-3 h-3 flex-shrink-0" />
                          )}
                          <span className="font-mono">{r.id}</span>
                          <span className="text-gray-600">—</span>
                          <span>{r.error || r.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={resetAll}
                className="mt-3 text-[10px] text-accent-500 hover:text-accent-400 transition-all"
              >
                Import another file
              </button>
            </div>
          )}

          {/* File upload area (hidden after results) */}
          {!results && (
            <>
              {/* Drop zone */}
              <div
                ref={fileInputRef}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => document.getElementById('import-file-input')?.click()}
                className={`
                  border-2 border-dashed rounded-xl p-8
                  flex flex-col items-center justify-center gap-3
                  cursor-pointer transition-all duration-200
                  ${dragOver
                    ? 'border-accent-500 bg-accent-500/10'
                    : file
                      ? 'border-success/40 bg-success/5'
                      : 'border-dark-600/50 bg-dark-800/50 hover:border-dark-500/50'
                  }
                `}
              >
                {file ? (
                  <>
                    <FileText className="w-8 h-8 text-success" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-white">{file.name}</p>
                      <p className="text-[10px] text-gray-500">
                        {(file.size / 1024).toFixed(1)} KB — {parsedServers.length} server{parsedServers.length !== 1 ? 's' : ''} found
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setParsedServers([]);
                        setParseError(null);
                      }}
                      className="text-[10px] text-gray-400 hover:text-danger transition-all"
                    >
                      Remove file
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-500" />
                    <div className="text-center">
                      <p className="text-sm text-gray-300">
                        <span className="text-accent-500">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-[10px] text-gray-500 mt-1">
                        JSON file with an array of server objects
                      </p>
                    </div>
                  </>
                )}
                <input
                  id="import-file-input"
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </div>

              {/* JSON format hint */}
              {!file && (
                <div className="bg-dark-800/50 border border-dark-700/30 rounded-lg p-3">
                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mb-1.5">Expected format</p>
                  <pre className="text-[10px] text-gray-400 font-mono leading-relaxed">
{`[
  {
    "id": "prod-web-01",
    "name": "Production Web 01",
    "host": "10.0.1.50",
    "port": 161,
    "snmp_version": "2c",
    "snmp_community": "public",
    "tags": {
      "environment": "production",
      "role": "web"
    }
  }
]`}
                  </pre>
                  <p className="text-[10px] text-gray-600 mt-1">
                    Required: <span className="text-gray-400">id</span>, <span className="text-gray-400">name</span>, <span className="text-gray-400">host</span>. All other fields optional.
                  </p>
                </div>
              )}

              {/* Parse error */}
              {parseError && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-danger/10 border border-danger/20">
                  <AlertCircle className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs text-danger font-medium">Parse Error</span>
                    <p className="text-[10px] text-danger/80 mt-0.5">{parseError}</p>
                  </div>
                </div>
              )}

              {/* Parsed server preview */}
              {parsedServers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                      Preview ({parsedServers.length} server{parsedServers.length !== 1 ? 's' : ''})
                    </h4>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skipDupes}
                        onChange={(e) => setSkipDupes(e.target.checked)}
                        className="w-3 h-3 rounded border-dark-600 bg-dark-800 text-accent-500 focus:ring-accent-500/30"
                      />
                      <span className="text-[10px] text-gray-500">Skip duplicates</span>
                    </label>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {parsedServers.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-2 bg-dark-800/50 border border-dark-700/30 rounded-lg"
                      >
                        <Server className="w-3.5 h-3.5 text-accent-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-white truncate">{s.name}</span>
                            <span className="text-[10px] font-mono text-gray-500">{s.id}</span>
                          </div>
                          <p className="text-[10px] text-gray-500 font-mono">
                            {s.host}:{s.port || 161}
                            {s.snmp_version && ` · v${s.snmp_version}`}
                            {s.tags && Object.keys(s.tags).length > 0 && (
                              ` · ${Object.entries(s.tags).map(([k, v]) => `${k}=${v}`).join(', ')}`
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!results && (
          <div className="flex items-center justify-between p-4 border-t border-dark-700/30">
            <div className="flex items-center gap-2">
              <a
                href="/api/servers/export"
                download="servers-export.json"
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-gray-400 hover:text-white bg-dark-800 hover:bg-dark-700 rounded-lg transition-all"
              >
                <Download className="w-3 h-3" />
                Download example from existing servers
              </a>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white bg-dark-800 hover:bg-dark-700 rounded-lg transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || parsedServers.length === 0}
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-accent-500/20 hover:bg-accent-500/30 border border-accent-500/30 rounded-lg transition-all disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader className="w-3.5 h-3.5 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    Import {parsedServers.length > 0 ? `${parsedServers.length} Server${parsedServers.length !== 1 ? 's' : ''}` : 'Servers'}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
