import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Shield, ShieldOff, Settings2, Trash2, Send, AlertCircle,
  ChevronDown, X, Plus, Eye, EyeOff, Lock, Paperclip,
} from "lucide-react";
import type { ApiConfig, ChatMessage, MaskingMode, Provider, ProviderInfo } from "./types";
import MessageBubble from "./components/MessageBubble";
import FileUpload from "./components/FileUpload";

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ApiConfig = {
  provider: "demo" as Provider,
  apiKey: "",
  model: "openai",
  systemPrompt: "",
  temperature: 0.7,
  maxTokens: 2048,
  maskingMode: "auto",
  restorePiiInResponse: false,
};

function uid() { return Math.random().toString(36).slice(2, 10); }

function loadConfig(): ApiConfig {
  try {
    const raw = localStorage.getItem("privacyllm_v5");
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_CONFIG;
}

function persistConfig(c: ApiConfig) {
  const { apiKey: _, ...rest } = c; // never persist the key
  localStorage.setItem("privacyllm_v5", JSON.stringify(rest));
}

// ── Sub-components (inline, small) ────────────────────────────────────────────

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 text-sm transition-colors ${on ? "text-indigo-600" : "text-gray-400"}`}
    >
      <div className={`relative w-9 h-5 rounded-full transition-colors ${on ? "bg-indigo-600" : "bg-gray-200"}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : ""}`} />
      </div>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function NativeSelect({
  value, onChange, options, className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={13} className="absolute right-2 top-2.5 text-gray-400 pointer-events-none" />
    </div>
  );
}

// ── Settings Drawer ───────────────────────────────────────────────────────────

function SettingsDrawer({
  config, onChange, onClose,
}: {
  config: ApiConfig;
  onChange: (c: ApiConfig) => void;
  onClose: () => void;
}) {
  function set<K extends keyof ApiConfig>(key: K, val: ApiConfig[K]) {
    onChange({ ...config, [key]: val });
  }
  const [showKey, setShowKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const needsKey = config.provider !== "demo";

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-semibold text-sm text-gray-800">Settings</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* API key */}
        {needsKey && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
              API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={config.apiKey}
                onChange={e => set("apiKey", e.target.value)}
                placeholder="sk-..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button onClick={() => setShowKey(v => !v)} className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600">
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Kept in your browser tab only — never written to disk or sent to us.</p>
          </div>
        )}

        {/* Privacy controls */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Privacy</p>
          <Toggle
            on={config.restorePiiInResponse}
            onToggle={() => set("restorePiiInResponse", !config.restorePiiInResponse)}
            label="Restore my private info in replies"
          />
          <p className="text-xs text-gray-500 leading-relaxed">
            When on, placeholders like <span className="font-mono">[PERSON_1]</span> in the model's reply
            are swapped back to your real values before display. The model itself never sees them.
          </p>
        </div>

        {/* Advanced disclosure */}
        <div className="border-t border-gray-100 pt-4">
          <button
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 uppercase tracking-wide"
          >
            <ChevronDown size={13} className={`transition-transform ${showAdvanced ? "" : "-rotate-90"}`} />
            Advanced
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  System prompt <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={config.systemPrompt}
                  onChange={e => set("systemPrompt", e.target.value)}
                  rows={3}
                  placeholder="e.g. You are a helpful coding assistant."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Added on top of a built-in instruction that explains the privacy placeholders to the model.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Creativity (temperature): {config.temperature.toFixed(2)}
                </label>
                <input
                  type="range" min="0" max="2" step="0.05"
                  value={config.temperature}
                  onChange={e => set("temperature", parseFloat(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max reply length (tokens)</label>
                <input
                  type="number" min="64" max="8192" step="64"
                  value={config.maxTokens}
                  onChange={e => set("maxTokens", parseInt(e.target.value, 10))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Custom masks input ────────────────────────────────────────────────────────

function CustomMaskBar({
  masks, onAdd, onRemove,
}: {
  masks: string[];
  onAdd: (m: string) => void;
  onRemove: (m: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const v = draft.trim();
    if (v && !masks.includes(v)) { onAdd(v); }
    setDraft("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-gray-100 bg-pink-50/40 min-h-[36px]">
      <Lock size={12} className="text-pink-500 flex-shrink-0" />
      <span className="text-xs text-pink-600 font-medium flex-shrink-0">Private words:</span>
      {masks.map(m => (
        <span key={m} className="inline-flex items-center gap-1 bg-pink-100 text-pink-700 text-xs rounded-full px-2 py-0.5 font-mono">
          {m}
          <button onClick={() => onRemove(m)} className="hover:text-pink-900"><X size={10} /></button>
        </span>
      ))}
      <div className="flex items-center gap-1">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="add word…"
          className="text-xs border border-pink-200 rounded-full px-2 py-0.5 w-24 focus:outline-none focus:ring-1 focus:ring-pink-400 bg-white"
        />
        <button
          onClick={add}
          disabled={!draft.trim()}
          className="text-pink-500 hover:text-pink-700 disabled:opacity-30"
        >
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [config, setConfig] = useState<ApiConfig>(loadConfig);
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [customMasks, setCustomMasks] = useState<string[]>([]);
  const [selection, setSelection] = useState("");     // selected text in textarea

  const sessionMappingRef = useRef<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load providers on mount, then snap config back to a known provider if
  // localStorage has something stale from a previous version of the app.
  useEffect(() => {
    fetch("/api/providers")
      .then(r => r.json())
      .then((p: Record<string, ProviderInfo>) => {
        setProviders(p);
        if (!p[config.provider]) {
          const fallback = (Object.keys(p)[0] ?? "demo") as Provider;
          setConfig(c => ({ ...c, provider: fallback, model: p[fallback]?.default_model ?? c.model }));
        }
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { persistConfig(config); }, [config]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  // Detect text selection in textarea
  function handleTextareaSelect() {
    const ta = textareaRef.current;
    if (!ta) return;
    const sel = ta.value.substring(ta.selectionStart, ta.selectionEnd).trim();
    setSelection(sel);
  }

  function markSelection() {
    if (!selection || customMasks.includes(selection)) return;
    setCustomMasks(prev => [...prev, selection]);
    setSelection("");
  }

  function handleProviderChange(provider: Provider) {
    const info = providers[provider];
    setConfig(prev => ({
      ...prev,
      provider,
      model: info?.default_model ?? prev.model,
    }));
  }

  function handleModelChange(model: string) {
    setConfig(prev => ({ ...prev, model }));
  }

  const currentProviderInfo = providers[config.provider];
  const providerModels = currentProviderInfo?.models ?? [config.model];
  const needsKey = config.provider !== "demo";

  const providerOptions = Object.entries(providers).map(([k, v]) => ({
    value: k,
    label: v.label,
  }));

  const modelOptions = providerModels.map(m => ({ value: m, label: m }));

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    // Only require API key for non-demo providers
    if (needsKey && !config.apiKey) {
      setError("Please enter your API key in Advanced Settings (⚙).");
      setShowSettings(true);
      return;
    }

    setError("");
    setInput("");
    setSelection("");

    const userMsg: ChatMessage = { id: uid(), role: "user", content: trimmed };
    const loadingMsg: ChatMessage = { id: uid(), role: "assistant", content: "", isLoading: true };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setSending(true);

    try {
      // Build history — include raw/masked assistant content for context consistency
      const history = [...messages, userMsg].map(m => ({
        role: m.role,
        // For assistant messages send the placeholder version so the LLM stays consistent
        content: m.role === "assistant" ? (m.rawResponse ?? m.content) : m.content,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: config.provider,
          api_key: config.apiKey,
          model: config.model,
          messages: history,
          system_prompt: config.systemPrompt || undefined,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          masking_mode: config.maskingMode,
          restore_pii_in_response: config.restorePiiInResponse,
          session_mapping: sessionMappingRef.current,
          custom_masks: customMasks,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      sessionMappingRef.current = data.session_mapping ?? {};

      setMessages(prev =>
        prev
          .map(m => m.id === userMsg.id
            ? { ...m, maskedContent: data.masked_user_message, entities: data.new_entities, mapping: data.new_mapping }
            : m
          )
          .map(m => m.isLoading
            ? {
                id: uid(),
                role: "assistant" as const,
                content: data.restored_response ?? data.raw_response,
                rawResponse: data.raw_response,
                restoredResponse: data.restored_response,
              }
            : m
          )
      );
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
      setMessages(prev => prev.filter(m => !m.isLoading));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearConversation() {
    setMessages([]);
    sessionMappingRef.current = {};
    setError("");
  }

  const totalProtected = messages.reduce((s, m) => s + (m.entities?.length ?? 0), 0);

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 overflow-hidden font-sans">

      {/* ── Main column ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <header className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200 shadow-sm flex-wrap">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
              <Shield size={16} className="text-white" />
            </div>
            <span className="font-bold text-base tracking-tight text-gray-900 hidden sm:block">PrivacyLLM</span>
          </div>

          {/* Provider selector */}
          {providerOptions.length > 0 && (
            <NativeSelect
              value={config.provider}
              onChange={v => handleProviderChange(v as Provider)}
              options={providerOptions}
              className="w-44"
            />
          )}

          {/* Model selector */}
          {modelOptions.length > 0 && (
            <NativeSelect
              value={config.model}
              onChange={handleModelChange}
              options={modelOptions}
              className="w-56"
            />
          )}

          {/* API key inline (collapsed, non-demo only) */}
          {needsKey && !config.apiKey && (
            <button
              onClick={() => setShowSettings(true)}
              className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 hover:bg-amber-100 transition-colors flex-shrink-0"
            >
              ⚠ Add API key
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Status pill */}
          {totalProtected > 0 && (
            <span className="hidden sm:flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-1 font-medium flex-shrink-0">
              <Shield size={11} />
              {totalProtected} protected
            </span>
          )}

          {/* Mode segmented control */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5 text-xs flex-shrink-0">
            {(["off", "manual", "auto"] as MaskingMode[]).map(m => (
              <button
                key={m}
                onClick={() => setConfig(c => ({ ...c, maskingMode: m }))}
                title={
                  m === "off" ? "No masking — sends messages unmodified"
                  : m === "manual" ? "Only mask words you mark as private"
                  : "Auto-detect names, emails, phone numbers, etc."
                }
                className={`px-2.5 py-1 rounded-md transition-colors capitalize ${
                  config.maskingMode === m
                    ? "bg-white shadow-sm font-medium text-indigo-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Clear */}
          {messages.length > 0 && (
            <button onClick={clearConversation} title="Clear conversation"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0">
              <Trash2 size={16} />
            </button>
          )}

          {/* Settings */}
          <button
            onClick={() => setShowSettings(v => !v)}
            title="Advanced settings"
            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
              showSettings ? "text-indigo-600 bg-indigo-50" : "text-gray-400 hover:bg-gray-100"
            }`}
          >
            <Settings2 size={16} />
          </button>
        </header>

        {/* ── Status bar (mode-aware) ───────────────────────────────────────── */}
        {config.maskingMode === "off" && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
            <ShieldOff size={12} />
            Masking is off — messages are sent unmodified.
          </div>
        )}
        {config.maskingMode === "manual" && (
          <div className="flex items-center gap-2 px-4 py-1.5 bg-pink-50 border-b border-pink-200 text-xs text-pink-700">
            <Lock size={12} />
            Manual mode — only words you mark as private will be masked.
          </div>
        )}

        {/* ── Message list ────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-5 text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg">
                <Shield size={32} className="text-white" />
              </div>
              <div className="max-w-sm">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Chat without leaking</h2>
                {config.maskingMode === "auto" && (
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Names, emails, phone numbers, and other sensitive data are replaced with
                    placeholders <span className="font-mono text-indigo-600">[PERSON_1]</span> before
                    anything is sent to the AI provider.
                  </p>
                )}
                {config.maskingMode === "manual" && (
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Select any text in the message box and click <span className="font-medium text-pink-600">Mark private</span> —
                    those exact words become <span className="font-mono text-pink-600">[CUSTOM_1]</span> before being sent.
                    Nothing else is touched.
                  </p>
                )}
                {config.maskingMode === "off" && (
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Masking is off. Messages are sent to the AI provider unmodified.
                  </p>
                )}
              </div>
              {config.maskingMode === "auto" && (
                <div className="flex flex-wrap justify-center gap-2 text-xs">
                  {["PERSON", "EMAIL", "PHONE", "LOCATION", "CREDIT CARD", "SSN"].map(t => (
                    <span key={t} className="bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-3 py-1 font-medium">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {config.provider === "demo" && (
                <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  Running in Demo mode — no API key needed. Select a provider above for a real model.
                </p>
              )}
              {needsKey && !config.apiKey && (
                <button onClick={() => setShowSettings(true)}
                  className="text-sm text-indigo-600 hover:underline">
                  Add your API key to get started →
                </button>
              )}
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4">
              {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
              <div ref={bottomRef} className="h-4" />
            </div>
          )}
        </div>

        {/* ── Error banner ─────────────────────────────────────────────────────── */}
        {error && (
          <div className="mx-4 mb-2 flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-3 py-2.5">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span className="flex-1 leading-snug">{error}</span>
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 text-lg leading-none ml-1">×</button>
          </div>
        )}

        {/* ── Custom masks bar (hidden when masking is fully off) ─────────────── */}
        {config.maskingMode !== "off" && (
          <CustomMaskBar
            masks={customMasks}
            onAdd={m => setCustomMasks(prev => prev.includes(m) ? prev : [...prev, m])}
            onRemove={m => setCustomMasks(prev => prev.filter(x => x !== m))}
          />
        )}

        {/* ── Input area ────────────────────────────────────────────────────────── */}
        <div className="px-4 pb-4 pt-2 bg-white border-t border-gray-100">
          <div className="max-w-3xl mx-auto">
            {/* "Mark selection" hint */}
            {selection && config.maskingMode !== "off" && (
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs text-gray-400">Selected:</span>
                <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 max-w-xs truncate">{selection}</span>
                <button
                  onClick={markSelection}
                  className="text-xs text-pink-600 bg-pink-50 border border-pink-200 rounded-full px-2.5 py-0.5 hover:bg-pink-100 transition-colors flex items-center gap-1"
                >
                  <Lock size={10} />
                  Mark private
                </button>
                <button onClick={() => setSelection("")} className="text-gray-400 hover:text-gray-600">
                  <X size={11} />
                </button>
              </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-shadow">
              <FileUpload onTextExtracted={(text, name) => setInput(p => p ? `${p}\n\n[From ${name}]\n${text}` : `[From ${name}]\n${text}`)} />
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onMouseUp={handleTextareaSelect}
                onKeyUp={handleTextareaSelect}
                placeholder={config.provider === "demo"
                  ? "Type a message… (Demo mode — free, no key needed)"
                  : "Type a message… (Shift+Enter for newline, select text to mark private)"}
                rows={1}
                className="flex-1 text-sm leading-relaxed outline-none bg-transparent py-1 max-h-40 overflow-y-auto"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <Send size={15} />
              </button>
            </div>

            <p className="text-xs text-center text-gray-400 mt-1.5">
              {config.maskingMode === "auto" && "PII is detected and masked locally before being sent to the model provider."}
              {config.maskingMode === "manual" && "Only words you mark as private are masked — nothing else is touched."}
              {config.maskingMode === "off" && "Masking is off — your message is sent as-is."}
            </p>
          </div>
        </div>
      </div>

      {/* ── Settings drawer ──────────────────────────────────────────────────── */}
      <div className={`flex-shrink-0 transition-all duration-200 overflow-hidden ${showSettings ? "w-80" : "w-0"}`}>
        {showSettings && (
          <SettingsDrawer
            config={config}
            onChange={setConfig}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>
    </div>
  );
}
