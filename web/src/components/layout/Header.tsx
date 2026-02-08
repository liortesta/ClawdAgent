import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/auth';
import { LogOut, Activity } from 'lucide-react';

export default function Header() {
  const logout = useAuthStore((s) => s.logout);
  const [uptime, setUptime] = useState('--');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (res.ok) {
          const data = await res.json();
          const mins = Math.floor(data.uptime / 60);
          const hrs = Math.floor(mins / 60);
          setUptime(hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`);
        }
      } catch { /* ignore */ }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 border-b border-gray-800 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <Activity className="w-4 h-4 text-green-500" />
        <span className="text-sm text-gray-400">Uptime: {uptime}</span>
      </div>
      <button onClick={logout} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm">
        <LogOut className="w-4 h-4" />
        Logout
      </button>
    </header>
  );
}
