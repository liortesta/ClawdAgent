import React, { useEffect, useState } from 'react';
import { Server, Database, HardDrive, Cpu, Activity } from 'lucide-react';

export default function Servers() {
  const [status, setStatus] = useState<{ uptime: number; memory: number } | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (res.ok) setStatus(await res.json());
      } catch { /* ignore */ }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const services = [
    { name: 'ClawdAgent Backend', icon: Server, status: 'Running', port: '3000', color: 'text-green-400' },
    { name: 'PostgreSQL', icon: Database, status: 'Running', port: '5432', color: 'text-green-400' },
    { name: 'Redis', icon: HardDrive, status: 'Running', port: '6379', color: 'text-green-400' },
    { name: 'Telegram Bot', icon: Activity, status: 'Connected', port: '--', color: 'text-green-400' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Cpu className="w-7 h-7 text-primary-500" />
        <h1 className="text-2xl font-bold">System Status</h1>
      </div>

      {status && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-dark-800 rounded-lg p-4 border border-gray-800">
            <p className="text-sm text-gray-400">Uptime</p>
            <p className="text-2xl font-bold">{Math.floor(status.uptime / 60)}m {Math.floor(status.uptime % 60)}s</p>
          </div>
          <div className="bg-dark-800 rounded-lg p-4 border border-gray-800">
            <p className="text-sm text-gray-400">Memory Usage</p>
            <p className="text-2xl font-bold">{(status.memory / 1024 / 1024).toFixed(0)} MB</p>
          </div>
          <div className="bg-dark-800 rounded-lg p-4 border border-gray-800">
            <p className="text-sm text-gray-400">Status</p>
            <p className="text-2xl font-bold text-green-400">Online</p>
          </div>
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">Services</h2>
      <div className="bg-dark-800 rounded-lg border border-gray-800 divide-y divide-gray-800">
        {services.map(svc => (
          <div key={svc.name} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <svc.icon className="w-5 h-5 text-gray-400" />
              <span className="font-medium">{svc.name}</span>
            </div>
            <div className="flex items-center gap-6">
              <span className="text-sm text-gray-500">Port {svc.port}</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className={`text-sm ${svc.color}`}>{svc.status}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
