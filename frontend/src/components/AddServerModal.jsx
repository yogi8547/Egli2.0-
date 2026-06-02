/**
 * AddServerModal — Modal form for registering a new server for SNMP monitoring.
 *
 * Fields: id, name, host, port, snmp_version, snmp_community, tags
 * Submits to POST /api/servers and notifies parent on success.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Server,
  Globe,
  Fingerprint,
  Network,
  Shield,
  Tags,
  Loader,
  Plus,
  Trash2,
  Check,
  Key,
  Lock,
} from 'lucide-react';

const SNMP_VERSIONS = ['2c', '3'];

function TagRow({ tag, index, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        placeholder="Key"
        value={tag.key}
        onChange={(e) => onChange(index, 'key', e.target.value)}
        className="flex-1 bg-dark-800 border border-dark-700/50 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-accent-500/40 focus:ring-1 focus:ring-accent-500/20 transition-all font-mono"
      />
      <span className="text-gray-600 text-xs">=</span>
      <input
        type="text"
        placeholder="Value"
        value={tag.value}
        onChange={(e) => onChange(index, 'value', e.target.value)}
        className="flex-1 bg-dark-800 border border-dark-700/50 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-accent-500/40 focus:ring-1 focus:ring-accent-500/20 transition-all"
      />
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="p-1.5 rounded-lg text-gray-500 hover:text-danger hover:bg-danger/10 transition-all"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function AddServerModal({ isOpen, onClose, onServerAdded, editServer }) {
  const isEditing = Boolean(editServer);
  const [form, setForm] = useState({
    id: '',
    name: '',
    host: '',
    port: 161,
    snmp_version: '2c',
    snmp_community: 'public',
    snmp_username: '',
    snmp_auth_protocol: 'SHA',
    snmp_auth_password: '',
    snmp_priv_protocol: 'AES',
    snmp_priv_password: '',
  });
  const [tags, setTags] = useState([{ key: '', value: '' }]);

  // ── Pre-fill form when editing ──────────────────────────────────────
  useEffect(() => {
    if (editServer) {
      setForm({
        id: editServer.id || '',
        name: editServer.name || '',
        host: editServer.host || '',
        port: editServer.port || 161,
        snmp_version: editServer.snmp_version || '2c',
        snmp_community: editServer.snmp_community || 'public',
        snmp_username: editServer.snmp_username || '',
        snmp_auth_protocol: editServer.snmp_auth_protocol || 'SHA',
        snmp_auth_password: '',
        snmp_priv_protocol: editServer.snmp_priv_protocol || 'AES',
        snmp_priv_password: '',
      });
      // Pre-fill tags
      if (editServer.tags && Object.keys(editServer.tags).length > 0) {
        setTags(
          Object.entries(editServer.tags).map(([key, value]) => ({ key, value: String(value) }))
        );
      } else {
        setTags([{ key: '', value: '' }]);
      }
      setError(null);
    }
  }, [editServer, isOpen]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function resetForm() {
    setForm({ id: '', name: '', host: '', port: 161, snmp_version: '2c', snmp_community: 'public', snmp_username: '', snmp_auth_protocol: 'SHA', snmp_auth_password: '', snmp_priv_protocol: 'AES', snmp_priv_password: '' });
    setTags([{ key: '', value: '' }]);
    setError(null);
    setSubmitting(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function handleTagChange(index, field, value) {
    setTags((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function addTagRow() {
    setTags((prev) => [...prev, { key: '', value: '' }]);
  }

  function removeTagRow(index) {
    setTags((prev) => prev.filter((_, i) => i !== index));
  }

  function buildTagsObject() {
    const obj = {};
    tags.forEach((t) => {
      const key = t.key.trim();
      const value = t.value.trim();
      if (key && value) obj[key] = value;
    });
    return obj;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    // Validate required fields
    if (!form.id.trim()) { setError('Server ID is required'); return; }
    if (!form.name.trim()) { setError('Display name is required'); return; }
    if (!form.host.trim()) { setError('Host address is required'); return; }
    if (!form.port || form.port < 1 || form.port > 65535) { setError('Port must be 1–65535'); return; }

    setSubmitting(true);

    try {
      const payload = {
        id: form.id.trim(),
        name: form.name.trim(),
        host: form.host.trim(),
        port: parseInt(form.port, 10),
        snmp_version: form.snmp_version,
        tags: buildTagsObject(),
      };

      // Send only the fields relevant to the selected SNMP version
      if (form.snmp_version === '3') {
        payload.snmp_community = '';
        payload.snmp_username = form.snmp_username;
        payload.snmp_auth_protocol = form.snmp_auth_protocol || null;
        payload.snmp_auth_password = form.snmp_auth_password || null;
        payload.snmp_priv_protocol = form.snmp_priv_protocol || null;
        payload.snmp_priv_password = form.snmp_priv_password || null;
      } else {
        payload.snmp_community = form.snmp_community || 'public';
      }

      const url = isEditing ? `/api/servers/${encodeURIComponent(editServer.id)}` : '/api/servers';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error (${res.status})`);
      }

      const server = await res.json();

      // Toast notification
      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: 'success',
          title: isEditing ? 'Server Updated' : 'Server Registered',
          message: `${server.name} (${server.host}) ${isEditing ? 'has been updated.' : 'is now being monitored.'}`,
          duration: 5000,
        });
      }

      resetForm();
      onServerAdded?.(server);
    } catch (err) {
      setError(err.message);
      if (window.__toast?.addToast) {
        window.__toast.addToast({
          type: 'critical',
          title: 'Registration Failed',
          message: err.message,
          duration: 8000,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg glass-card border border-dark-600/50 shadow-2xl shadow-black/40 animate-scale-in max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-accent-500/20 rounded-lg flex items-center justify-center">
              <Server className="w-4 h-4 text-accent-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">{isEditing ? 'Edit Server' : 'Add Server'}</h2>
              <p className="text-[10px] text-gray-500">{isEditing ? 'Update monitoring target details' : 'Register a new SNMP monitoring target'}</p>
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
        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto">
          {/* ID & Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                <Fingerprint className="w-3 h-3" />
                Server ID
              </label>
              <input
                type="text"
                placeholder="prod-web-01"
                value={form.id}
                onChange={(e) => updateField('id', e.target.value)}
                disabled={isEditing}
                className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-500/40 focus:ring-1 focus:ring-accent-500/20 transition-all font-mono disabled:opacity-40 disabled:cursor-not-allowed"
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                <Server className="w-3 h-3" />
                Display Name
              </label>
              <input
                type="text"
                placeholder="Production Web 01"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-500/40 focus:ring-1 focus:ring-accent-500/20 transition-all"
              />
            </div>
          </div>

          {/* Host & Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                <Globe className="w-3 h-3" />
                Host Address
              </label>
              <input
                type="text"
                placeholder="10.0.1.50"
                value={form.host}
                onChange={(e) => updateField('host', e.target.value)}
                className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-500/40 focus:ring-1 focus:ring-accent-500/20 transition-all font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                <Network className="w-3 h-3" />
                Port
              </label>
              <input
                type="number"
                min="1"
                max="65535"
                value={form.port}
                onChange={(e) => updateField('port', parseInt(e.target.value) || '')}
                className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-500/40 focus:ring-1 focus:ring-accent-500/20 transition-all font-mono"
              />
            </div>
          </div>

          {/* SNMP Config */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                <Shield className="w-3 h-3" />
                SNMP Version
              </label>
              <div className="flex gap-1 p-0.5 bg-dark-800 rounded-lg border border-dark-700/50">
                {SNMP_VERSIONS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => updateField('snmp_version', v)}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      form.snmp_version === v
                        ? 'bg-accent-500/20 text-accent-500 shadow-sm'
                        : 'text-gray-500 hover:text-white'
                    }`}
                  >
                    v{v}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-600">
                {form.snmp_version === '3' ? 'Authenticated SNMPv3' : 'Community-string SNMPv2c'}
              </p>
            </div>

            {/* v2c: Community */}
            {form.snmp_version === '2c' && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                  <Shield className="w-3 h-3" />
                  Community String
                </label>
                <input
                  type="text"
                  placeholder="public"
                  value={form.snmp_community}
                  onChange={(e) => updateField('snmp_community', e.target.value)}
                  className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-500/40 focus:ring-1 focus:ring-accent-500/20 transition-all font-mono"
                />
              </div>
            )}

            {/* v3: Username */}
            {form.snmp_version === '3' && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                  <Key className="w-3 h-3" />
                  Security Username
                </label>
                <input
                  type="text"
                  placeholder="monitor"
                  value={form.snmp_username}
                  onChange={(e) => updateField('snmp_username', e.target.value)}
                  className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-500/40 focus:ring-1 focus:ring-accent-500/20 transition-all font-mono"
                />
              </div>
            )}
          </div>

          {/* SNMPv3 Auth section — only visible when version is 3 */}
          {form.snmp_version === '3' && (
            <>
              <div className="border-t border-dark-700/30 pt-3">
                <h4 className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-3">
                  <Lock className="w-3 h-3" />
                  Authentication
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                      Auth Protocol
                    </label>
                    <div className="flex gap-1 p-0.5 bg-dark-800 rounded-lg border border-dark-700/50">
                      {['MD5', 'SHA'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => updateField('snmp_auth_protocol', p)}
                          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                            form.snmp_auth_protocol === p
                              ? 'bg-accent-500/20 text-accent-500 shadow-sm'
                              : 'text-gray-500 hover:text-white'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                      <Key className="w-3 h-3" />
                      Auth Password
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={form.snmp_auth_password}
                      onChange={(e) => updateField('snmp_auth_password', e.target.value)}
                      className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-500/40 focus:ring-1 focus:ring-accent-500/20 transition-all font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-dark-700/30 pt-3">
                <h4 className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-3">
                  <Lock className="w-3 h-3" />
                  Privacy / Encryption
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                      Priv Protocol
                    </label>
                    <div className="flex gap-1 p-0.5 bg-dark-800 rounded-lg border border-dark-700/50">
                      {['DES', 'AES'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => updateField('snmp_priv_protocol', p)}
                          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                            form.snmp_priv_protocol === p
                              ? 'bg-accent-500/20 text-accent-500 shadow-sm'
                              : 'text-gray-500 hover:text-white'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                      <Key className="w-3 h-3" />
                      Priv Password
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={form.snmp_priv_password}
                      onChange={(e) => updateField('snmp_priv_password', e.target.value)}
                      className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-500/40 focus:ring-1 focus:ring-accent-500/20 transition-all font-mono"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Tags */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                <Tags className="w-3 h-3" />
                Tags
              </label>
              <button
                type="button"
                onClick={addTagRow}
                className="flex items-center gap-1 text-[10px] text-accent-500 hover:text-accent-400 transition-all"
              >
                <Plus className="w-3 h-3" />
                Add Tag
              </button>
            </div>
            <div className="space-y-2">
              {tags.map((tag, i) => (
                <TagRow
                  key={i}
                  tag={tag}
                  index={i}
                  onChange={handleTagChange}
                  onRemove={removeTagRow}
                />
              ))}
            </div>
            {tags.length === 1 && !tags[0].key && !tags[0].value && (
              <p className="text-[10px] text-gray-600">
                Optional: e.g. environment=production, role=web
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-danger/10 border border-danger/20">
              <span className="text-xs text-danger font-medium">{error}</span>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-dark-700/30">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-gray-400 hover:text-white bg-dark-800 hover:bg-dark-700 rounded-lg transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-accent-500/20 hover:bg-accent-500/30 border border-accent-500/30 rounded-lg transition-all disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                  {isEditing ? 'Saving...' : 'Registering...'}
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  {isEditing ? 'Save Changes' : 'Register Server'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
