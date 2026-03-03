import React, { useEffect, useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Skills from './pages/Skills';
import Servers from './pages/Servers';
import Agents from './pages/Agents';
import Cron from './pages/Cron';
import Costs from './pages/Costs';
import Logs from './pages/Logs';
import History from './pages/History';
import Settings from './pages/Settings';
import Trading from './pages/Trading';
import Knowledge from './pages/Knowledge';
import Intelligence from './pages/Intelligence';
import Graph from './pages/Graph';
import OpenClaw from './pages/OpenClaw';
import Evolution from './pages/Evolution';
import BrowserView from './pages/BrowserView';
import VoiceAgent from './pages/VoiceAgent';
import TerminalPage from './pages/Terminal';
import ToastContainer, { pushToast } from './components/shared/ToastContainer';
import { useAuthStore } from './stores/auth';
import { useNotificationsStore } from './stores/notifications';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!token) { setChecked(true); return; }

    // Validate token with server on load
    fetch('/health')
      .then(() => {
        // Server is reachable — verify token with an auth-protected endpoint
        return fetch('/api/status', { headers: { Authorization: `Bearer ${token}` } });
      })
      .then((res) => {
        if (res.status === 401) logout();
        setChecked(true);
      })
      .catch(() => setChecked(true)); // Server unreachable — allow offline view
  }, [token, logout]);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return token ? <>{children}</> : <Navigate to="/login" />;
}

/** Global WebSocket listener for real-time notifications */
function NotificationWSListener() {
  const token = useAuthStore((s) => s.token);
  const addFromWebSocket = useNotificationsStore((s) => s.addFromWebSocket);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`, token);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'notification' && msg.data) {
          addFromWebSocket(msg.data);
          // Show toast for warning/critical severity
          if (msg.data.severity === 'warning' || msg.data.severity === 'critical') {
            pushToast({ title: msg.data.title, body: msg.data.body, severity: msg.data.severity });
          }
        }
      } catch { /* ignore parse errors */ }
    };

    return () => { ws.close(); wsRef.current = null; };
  }, [token, addFromWebSocket]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <NotificationWSListener />
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Chat />} />
          <Route path="openclaw" element={<OpenClaw />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="skills" element={<Skills />} />
          <Route path="browser" element={<BrowserView />} />
          <Route path="voice-agent" element={<VoiceAgent />} />
          <Route path="terminal" element={<TerminalPage />} />
          <Route path="servers" element={<Servers />} />
          <Route path="agents" element={<Agents />} />
          <Route path="cron" element={<Cron />} />
          <Route path="trading" element={<Trading />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="intelligence" element={<Intelligence />} />
          <Route path="evolution" element={<Evolution />} />
          <Route path="graph" element={<Graph />} />
          <Route path="costs" element={<Costs />} />
          <Route path="logs" element={<Logs />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
