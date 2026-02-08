import React from 'react';
import { useAuthStore } from '../stores/auth';
import { useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, LogOut, Key, Globe, Bot, Bell } from 'lucide-react';

export default function Settings() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const sections = [
    { icon: Key, label: 'API Keys', desc: 'Manage Anthropic, GitHub, and Brave Search API keys' },
    { icon: Globe, label: 'Interfaces', desc: 'Configure Telegram, Discord, and WhatsApp connections' },
    { icon: Bot, label: 'Agent Behavior', desc: 'Customize agent prompts and response styles' },
    { icon: Bell, label: 'Notifications', desc: 'Configure alerts and reminder settings' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon className="w-7 h-7 text-primary-500" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <div className="space-y-3 mb-8">
        {sections.map(s => (
          <div key={s.label} className="flex items-center gap-4 p-4 bg-dark-800 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors cursor-pointer">
            <s.icon className="w-5 h-5 text-gray-400" />
            <div>
              <p className="font-medium">{s.label}</p>
              <p className="text-sm text-gray-400">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-800 pt-6">
        <button onClick={() => { logout(); navigate('/login'); }} className="flex items-center gap-2 px-4 py-2.5 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors">
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
