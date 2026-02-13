import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import {
  Settings as SettingsIcon, LogOut, Key, Globe, Bot, DollarSign,
  Eye, EyeOff, CheckCircle, XCircle, Loader2, Save, TestTube
} from 'lucide-react';

export default function Settings() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'keys' | 'services' | 'budget' | 'general'>('keys');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [editKeys, setEditKeys] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { valid: boolean; message: string }>>({});

  useEffect(() => {
    loadSettings();
  }, []);

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
    { id: 'budget' as const, label: 'Budget', icon: DollarSign },
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
