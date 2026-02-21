import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  Settings as SettingsIcon, LogOut, Key, Globe, Bot, DollarSign,
  Eye, EyeOff, CheckCircle, XCircle, Loader2, Save, TestTube, Terminal,
  Server, Plus, Trash2, Wifi, WifiOff, TrendingUp
} from 'lucide-react';

export default function Settings() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'keys' | 'services' | 'budget' | 'general' | 'cli' | 'servers' | 'exchanges'>('keys');
  const [cliStatus, setCliStatus] = useState<{ available: boolean; authenticated: boolean; cliPath: string; lastCheckAt: number } | null>(null);
  const [cliLoading, setCLILoading] = useState(false);
  const [cliMessage, setCLIMessage] = useState('');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [editKeys, setEditKeys] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { valid: boolean; message: string }>>({});

  // Servers state
  const [servers, setServers] = useState<any[]>([]);
  const [showAddServer, setShowAddServer] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', host: '', port: 22, user: 'root', authMethod: 'password' as 'key' | 'password', keyPath: '', password: '', tags: '' });
  const [serverLoading, setServerLoading] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSettings();
  }, []);

  // Load CLI status when CLI tab is active
  useEffect(() => {
    if (activeTab === 'cli') {
      api.cliStatus().then(setCliStatus).catch(() => {});
    }
    if (activeTab === 'servers') {
      api.getServers().then(setServers).catch(() => {});
    }
  }, [activeTab]);

  const loadSettings = async () => {
    try {
      const data = await api.getSettings();
      setSettings(data);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
    setLoading(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const updates: any = { ...settings };
      for (const [field, value] of Object.entries(editKeys)) {
        const [section, provider, key] = field.split('.');
        if (updates[section]?.[provider]) {
          updates[section][provider][key] = value;
        }
      }
      const result = await api.updateSettings(updates);
      setSettings(result.settings);
      setEditKeys({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
    setSaving(false);
  };

  const testApiKey = async (provider: string, key: string) => {
    setTesting(prev => ({ ...prev, [provider]: true }));
    try {
      const result = await api.testKey(provider, key);
      setTestResults(prev => ({ ...prev, [provider]: result }));
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [provider]: { valid: false, message: err.message } }));
    }
    setTesting(prev => ({ ...prev, [provider]: false }));
  };

  const getKeyValue = (section: string, provider: string, key: string): string => {
    const editKey = `${section}.${provider}.${key}`;
    if (editKeys[editKey] !== undefined) return editKeys[editKey];
    return settings?.[section]?.[provider]?.[key] ?? '';
  };

  const setKeyValue = (section: string, provider: string, key: string, value: string) => {
    setEditKeys(prev => ({ ...prev, [`${section}.${provider}.${key}`]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const tabs = [
    { id: 'keys' as const, label: 'API Keys', icon: Key },
    { id: 'services' as const, label: 'Services', icon: Globe },
    { id: 'servers' as const, label: 'Servers', icon: Server },
    { id: 'exchanges' as const, label: 'Exchanges', icon: TrendingUp },
    { id: 'budget' as const, label: 'Budget', icon: DollarSign },
    { id: 'cli' as const, label: 'Claude CLI', icon: Terminal },
    { id: 'general' as const, label: 'General', icon: Bot },
  ];

  const providerKeys = [
    { provider: 'anthropic', label: 'Anthropic (Claude)', section: 'providers', keyField: 'apiKey', placeholder: 'sk-ant-...' },
    { provider: 'openrouter', label: 'OpenRouter', section: 'providers', keyField: 'apiKey', placeholder: 'sk-or-...' },
    { provider: 'openai', label: 'OpenAI', section: 'providers', keyField: 'apiKey', placeholder: 'sk-...' },
  ];

  const serviceKeys = [
    { provider: 'github', label: 'GitHub Token', section: 'services', keyField: 'token', placeholder: 'ghp_...' },
    { provider: 'brave', label: 'Brave Search', section: 'services', keyField: 'apiKey', placeholder: 'BSA...' },
    { provider: 'telegram', label: 'Telegram Bot', section: 'services', keyField: 'botToken', placeholder: '123456:ABC...' },
    { provider: 'discord', label: 'Discord Bot', section: 'services', keyField: 'botToken', placeholder: 'MTk...' },
  ];

  const renderKeyRow = (item: typeof providerKeys[0]) => {
    const value = getKeyValue(item.section, item.provider, item.keyField);
    const visible = showKeys[item.provider] ?? false;
    const isTesting = testing[item.provider];
    const result = testResults[item.provider];
    const isEnabled = settings?.[item.section]?.[item.provider]?.enabled ?? false;

    return (
      <div key={item.provider} className="p-4 bg-dark-800 rounded-lg border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="font-medium">{item.label}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isEnabled ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
              {isEnabled ? 'Active' : 'Inactive'}
            </span>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => {
                const updated = { ...settings };
                updated[item.section] = { ...updated[item.section] };
                updated[item.section][item.provider] = { ...updated[item.section][item.provider], enabled: e.target.checked };
                setSettings(updated);
              }}
              className="w-4 h-4 rounded border-gray-600 bg-dark-900 accent-primary-600"
            />
            <span className="text-xs text-gray-400">Enabled</span>
          </label>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type={visible ? 'text' : 'password'}
              value={value}
              onChange={(e) => setKeyValue(item.section, item.provider, item.keyField, e.target.value)}
              placeholder={item.placeholder}
              className="w-full p-2.5 pr-10 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono"
            />
            <button
              onClick={() => setShowKeys(prev => ({ ...prev, [item.provider]: !prev[item.provider] }))}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={() => {
              const keyToTest = editKeys[`${item.section}.${item.provider}.${item.keyField}`] || '';
              if (keyToTest && !keyToTest.includes('\u2022')) {
                testApiKey(item.provider, keyToTest);
              }
            }}
            disabled={isTesting}
            className="px-3 py-2 bg-dark-900 border border-gray-700 rounded hover:bg-dark-800 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TestTube className="w-4 h-4" />}
            <span className="text-xs">Test</span>
          </button>
        </div>

        {result && (
          <div className={`mt-2 flex items-center gap-2 text-xs ${result.valid ? 'text-green-400' : 'text-red-400'}`}>
            {result.valid ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
            {result.message}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <SettingsIcon className="w-7 h-7 text-primary-500" />
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>

        <div className="flex gap-1 mb-6 bg-dark-900 p-1 rounded-lg border border-gray-800">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
                activeTab === tab.id ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white hover:bg-dark-800'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'keys' && (
          <div className="space-y-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-1">AI Provider Keys</h2>
              <p className="text-sm text-gray-400">Configure API keys for AI model providers. Keys are encrypted and masked.</p>
            </div>
            {providerKeys.map(renderKeyRow)}
          </div>
        )}

        {activeTab === 'services' && (
          <div className="space-y-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-1">External Services</h2>
              <p className="text-sm text-gray-400">Configure API keys for GitHub, search, and messaging platforms.</p>
            </div>
            {serviceKeys.map(renderKeyRow)}
          </div>
        )}

        {activeTab === 'servers' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold mb-1">SSH Servers</h2>
                <p className="text-sm text-gray-400">Manage remote servers the agent can connect to and work on.</p>
              </div>
              <button onClick={() => setShowAddServer(true)} className="flex items-center gap-2 px-3 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium">
                <Plus className="w-4 h-4" /> Add Server
              </button>
            </div>

            {showAddServer && (
              <div className="p-5 bg-dark-800 rounded-lg border border-primary-600/50">
                <h3 className="font-semibold mb-4">Add New Server</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Name</label>
                    <input value={newServer.name} onChange={e => setNewServer({ ...newServer, name: e.target.value })} placeholder="production-1" className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Host (IP / Domain)</label>
                    <input value={newServer.host} onChange={e => setNewServer({ ...newServer, host: e.target.value })} placeholder="1.2.3.4" className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Port</label>
                    <input type="number" value={newServer.port} onChange={e => setNewServer({ ...newServer, port: parseInt(e.target.value) || 22 })} className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Username</label>
                    <input value={newServer.user} onChange={e => setNewServer({ ...newServer, user: e.target.value })} placeholder="root" className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Auth Method</label>
                    <select value={newServer.authMethod} onChange={e => setNewServer({ ...newServer, authMethod: e.target.value as 'key' | 'password' })} className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm">
                      <option value="password">Password</option>
                      <option value="key">SSH Key</option>
                    </select>
                  </div>
                  {newServer.authMethod === 'password' ? (
                    <div className="md:col-span-2">
                      <label className="block text-sm text-gray-400 mb-1">Password</label>
                      <input type="password" value={newServer.password} onChange={e => setNewServer({ ...newServer, password: e.target.value })} placeholder="Server password" className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm" />
                    </div>
                  ) : (
                    <div className="md:col-span-2">
                      <label className="block text-sm text-gray-400 mb-1">SSH Key Path</label>
                      <input value={newServer.keyPath} onChange={e => setNewServer({ ...newServer, keyPath: e.target.value })} placeholder="~/.ssh/id_rsa" className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono" />
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Tags (comma-separated)</label>
                    <input value={newServer.tags} onChange={e => setNewServer({ ...newServer, tags: e.target.value })} placeholder="web, production" className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={async () => {
                      if (!newServer.name || !newServer.host) return;
                      setServerLoading(true);
                      try {
                        await api.addServer({
                          name: newServer.name, host: newServer.host, port: newServer.port, user: newServer.user,
                          authMethod: newServer.authMethod, keyPath: newServer.keyPath || undefined, password: newServer.password || undefined,
                          tags: newServer.tags ? newServer.tags.split(',').map(t => t.trim()) : [],
                        });
                        setShowAddServer(false);
                        setNewServer({ name: '', host: '', port: 22, user: 'root', authMethod: 'password', keyPath: '', password: '', tags: '' });
                        const updated = await api.getServers();
                        setServers(updated);
                      } catch (err: any) {
                        alert(err.message);
                      }
                      setServerLoading(false);
                    }}
                    disabled={serverLoading || !newServer.name || !newServer.host}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
                  >
                    {serverLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Server
                  </button>
                  <button onClick={() => setShowAddServer(false)} className="px-4 py-2 bg-dark-900 rounded-lg hover:bg-dark-800 text-gray-400 text-sm">Cancel</button>
                </div>
              </div>
            )}

            {servers.map(server => (
              <div key={server.id} className="p-4 bg-dark-800 rounded-lg border border-gray-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {server.status === 'online' ? <Wifi className="w-5 h-5 text-green-400" /> : <WifiOff className="w-5 h-5 text-gray-500" />}
                    <div>
                      <h3 className="font-medium">{server.name}</h3>
                      <p className="text-sm text-gray-400 font-mono">{server.user}@{server.host}:{server.port} ({server.authMethod})</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${server.status === 'online' ? 'bg-green-500/20 text-green-400' : server.status === 'offline' ? 'bg-red-500/20 text-red-400' : 'bg-gray-700 text-gray-400'}`}>
                      {server.status}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setCheckingHealth(p => ({ ...p, [server.id]: true }));
                        try {
                          const health = await api.serverHealth(server.id);
                          const updated = await api.getServers();
                          setServers(updated);
                          if (health.status === 'online') alert(`Server online!\n${health.raw?.join('\n') ?? ''}`);
                          else alert(`Server offline: ${health.error}`);
                        } catch (err: any) { alert(err.message); }
                        setCheckingHealth(p => ({ ...p, [server.id]: false }));
                      }}
                      disabled={checkingHealth[server.id]}
                      className="px-3 py-1.5 text-xs bg-dark-900 border border-gray-700 rounded hover:bg-dark-700 disabled:opacity-50"
                    >
                      {checkingHealth[server.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Test'}
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Remove server "${server.name}"?`)) return;
                        await api.removeServer(server.id);
                        setServers(await api.getServers());
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-dark-900 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {server.tags?.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {server.tags.map((t: string) => <span key={t} className="text-xs px-2 py-0.5 bg-dark-900 rounded text-gray-400">{t}</span>)}
                  </div>
                )}
                {server.lastChecked && <p className="text-xs text-gray-500 mt-1">Last checked: {new Date(server.lastChecked).toLocaleString()}</p>}
              </div>
            ))}
            {servers.length === 0 && !showAddServer && (
              <div className="text-center text-gray-500 py-12">
                <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No servers configured</p>
                <p className="text-sm mt-1">Add SSH servers so the agent can manage them remotely</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'exchanges' && (
          <div className="space-y-4">
            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-1">Exchange API Keys</h2>
              <p className="text-sm text-gray-400">Configure API keys for cryptocurrency exchanges. Enable trading by providing your exchange credentials.</p>
            </div>
            {[
              { provider: 'binance', label: 'Binance', section: 'exchanges', keyField: 'apiKey', placeholder: 'Binance API Key' },
              { provider: 'binance_secret', label: 'Binance Secret', section: 'exchanges', keyField: 'apiSecret', placeholder: 'Binance API Secret' },
              { provider: 'okx', label: 'OKX', section: 'exchanges', keyField: 'apiKey', placeholder: 'OKX API Key' },
              { provider: 'okx_secret', label: 'OKX Secret', section: 'exchanges', keyField: 'apiSecret', placeholder: 'OKX API Secret' },
              { provider: 'okx_passphrase', label: 'OKX Passphrase', section: 'exchanges', keyField: 'passphrase', placeholder: 'OKX Passphrase' },
            ].map(renderKeyRow)}
            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <p className="text-sm text-amber-400">Tip: Start with Paper Trading mode enabled (in Trading page) to test strategies without risking real funds. Exchange keys are required only for live trading.</p>
            </div>
          </div>
        )}

        {activeTab === 'budget' && (
          <div className="space-y-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-1">Budget & Cost Control</h2>
              <p className="text-sm text-gray-400">Set spending limits and preferences for AI model usage.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
                <label className="block text-sm text-gray-400 mb-2">Daily Budget Limit ($)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={settings?.budget?.dailyLimit ?? 5}
                  onChange={(e) => setSettings({ ...settings, budget: { ...settings?.budget, dailyLimit: parseFloat(e.target.value) } })}
                  className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white"
                />
              </div>
              <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
                <label className="block text-sm text-gray-400 mb-2">Monthly Budget Limit ($)</label>
                <input
                  type="number"
                  step="5"
                  min="0"
                  value={settings?.budget?.monthlyLimit ?? 100}
                  onChange={(e) => setSettings({ ...settings, budget: { ...settings?.budget, monthlyLimit: parseFloat(e.target.value) } })}
                  className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white"
                />
              </div>
            </div>
            <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings?.budget?.preferFree ?? false}
                  onChange={(e) => setSettings({ ...settings, budget: { ...settings?.budget, preferFree: e.target.checked } })}
                  className="w-4 h-4 rounded border-gray-600 bg-dark-900 accent-primary-600"
                />
                <div>
                  <p className="font-medium">Prefer Free Models</p>
                  <p className="text-sm text-gray-400">Use free OpenRouter models for simple/medium tasks when possible</p>
                </div>
              </label>
            </div>
            <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
              <label className="block text-sm text-gray-400 mb-2">Provider Mode</label>
              <select
                value={settings?.providerMode ?? 'balanced'}
                onChange={(e) => setSettings({ ...settings, providerMode: e.target.value })}
                className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white"
              >
                <option value="free">Free — Only free models (OpenRouter :free)</option>
                <option value="cheap">Cheap — Free + budget models (DeepSeek, Haiku)</option>
                <option value="balanced">Balanced — Smart routing based on complexity</option>
                <option value="max">Max — Best model for every task (Claude Code CLI)</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === 'cli' && (
          <div className="space-y-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-1">Claude Code CLI</h2>
              <p className="text-sm text-gray-400">Connect your Claude Max subscription via CLI for free, unlimited AI usage.</p>
            </div>

            {/* Status Card */}
            <div className={`p-5 rounded-lg border ${cliStatus?.authenticated ? 'bg-green-500/5 border-green-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cliStatus?.authenticated ? 'bg-green-500/20' : 'bg-amber-500/20'}`}>
                    <Terminal className={`w-5 h-5 ${cliStatus?.authenticated ? 'text-green-400' : 'text-amber-400'}`} />
                  </div>
                  <div>
                    <p className="font-medium">{cliStatus?.authenticated ? 'CLI Connected' : 'CLI Not Connected'}</p>
                    <p className="text-xs text-gray-400">
                      {cliStatus?.authenticated
                        ? 'Using Claude Max subscription (FREE)'
                        : 'Click Authenticate to connect via browser'}
                    </p>
                  </div>
                </div>
                <span className={`text-xs px-3 py-1 rounded-full font-medium ${cliStatus?.authenticated ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {cliStatus?.authenticated ? 'Active' : 'Disconnected'}
                </span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    setCLILoading(true);
                    setCLIMessage('');
                    try {
                      const result = await api.cliAuth();
                      setCLIMessage(result.message);
                      // Poll for connection
                      let attempts = 0;
                      const poller = setInterval(async () => {
                        attempts++;
                        try {
                          const status = await api.cliRecheck();
                          setCliStatus(status);
                          if (status.authenticated || attempts >= 20) {
                            clearInterval(poller);
                            setCLILoading(false);
                            setCLIMessage(status.authenticated ? 'Successfully connected!' : 'Timeout — complete login in browser and click Re-check');
                          }
                        } catch {
                          if (attempts >= 20) { clearInterval(poller); setCLILoading(false); }
                        }
                      }, 3000);
                    } catch (err: any) {
                      setCLIMessage(err.message);
                      setCLILoading(false);
                    }
                  }}
                  disabled={cliLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 text-sm font-medium"
                >
                  {cliLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                  {cliLoading ? 'Waiting for browser auth...' : 'Authenticate'}
                </button>
                <button
                  onClick={async () => {
                    try {
                      const status = await api.cliRecheck();
                      setCliStatus(status);
                      setCLIMessage(status.authenticated ? 'Connected!' : 'Not authenticated yet');
                      setTimeout(() => setCLIMessage(''), 3000);
                    } catch {}
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-dark-800 border border-gray-700 rounded-lg hover:bg-dark-700 transition-colors text-sm"
                >
                  Re-check
                </button>
              </div>

              {cliMessage && (
                <div className={`mt-3 flex items-center gap-2 text-sm ${cliMessage.includes('Success') || cliMessage.includes('Connected') ? 'text-green-400' : 'text-gray-300'}`}>
                  {cliMessage.includes('Success') || cliMessage.includes('Connected')
                    ? <CheckCircle className="w-4 h-4" />
                    : <Terminal className="w-4 h-4" />}
                  {cliMessage}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
              <h3 className="font-medium mb-3">Connection Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">CLI Path</span>
                  <span className="font-mono text-gray-300">{cliStatus?.cliPath ?? 'claude'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Available</span>
                  <span className={cliStatus?.available ? 'text-green-400' : 'text-red-400'}>{cliStatus?.available ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Authenticated</span>
                  <span className={cliStatus?.authenticated ? 'text-green-400' : 'text-red-400'}>{cliStatus?.authenticated ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Last Check</span>
                  <span className="text-gray-300">{cliStatus?.lastCheckAt ? new Date(cliStatus.lastCheckAt).toLocaleTimeString() : 'Never'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Cost</span>
                  <span className="text-green-400 font-medium">FREE (Max subscription)</span>
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
              <h3 className="font-medium mb-3">How It Works</h3>
              <ol className="space-y-2 text-sm text-gray-400 list-decimal list-inside">
                <li>Click <strong className="text-white">Authenticate</strong> — opens Anthropic login in your browser</li>
                <li>Sign in with your Anthropic account (Max subscription required)</li>
                <li>The CLI authenticates automatically — no API key needed</li>
                <li>All AI requests use your Max subscription at <strong className="text-green-400">zero cost</strong></li>
              </ol>
            </div>
          </div>
        )}

        {activeTab === 'general' && (
          <div className="space-y-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold mb-1">General Settings</h2>
              <p className="text-sm text-gray-400">Language, behavior, and system preferences.</p>
            </div>
            <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
              <label className="block text-sm text-gray-400 mb-2">Language</label>
              <select
                value={settings?.language ?? 'auto'}
                onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white"
              >
                <option value="auto">Auto-detect (Hebrew/English)</option>
                <option value="he">Hebrew</option>
                <option value="en">English</option>
              </select>
            </div>
            <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
              <h3 className="font-medium mb-3">System Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Version</span><span className="font-mono">6.0.0</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Dashboard</span><span className="font-mono">React + Vite + Tailwind</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Backend</span><span className="font-mono">Node.js + Express + TypeScript</span></div>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-gray-800 pt-6 mt-8">
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
