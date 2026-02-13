import { NavLink } from 'react-router-dom';
import {
  MessageSquare, ListTodo, Server, Bot, Clock, Settings,
  LayoutDashboard, Sparkles, DollarSign, ScrollText, Timer, LineChart, Database, Brain, Network
} from 'lucide-react';

const links = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/', icon: MessageSquare, label: 'Chat' },
  { to: '/tasks', icon: ListTodo, label: 'Tasks' },
  { to: '/skills', icon: Sparkles, label: 'Skills' },
  { to: '/servers', icon: Server, label: 'Servers' },
  { to: '/agents', icon: Bot, label: 'Agents' },
  { to: '/cron', icon: Timer, label: 'Cron Jobs' },
  { to: '/trading', icon: LineChart, label: 'Trading' },
  { to: '/knowledge', icon: Database, label: 'Knowledge' },
  { to: '/intelligence', icon: Brain, label: 'Intelligence' },
  { to: '/graph', icon: Network, label: 'System Graph' },
  { to: '/costs', icon: DollarSign, label: 'Costs' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
  { to: '/history', icon: Clock, label: 'History' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-dark-900 border-r border-gray-800/50 flex flex-col">
      {/* Logo */}
      <div className="p-5 border-b border-gray-800/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-primary-600/20">
            <span className="text-xl leading-none select-none" role="img" aria-label="logo">🐙</span>
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">ClawdAgent</h2>
            <p className="text-[10px] text-gray-500 font-medium tracking-wider uppercase">v6.0 Pro</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {links.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group ${
                isActive
                  ? 'bg-gradient-to-r from-primary-600/90 to-primary-700/90 text-white shadow-md shadow-primary-600/10'
                  : 'text-gray-400 hover:bg-dark-800/80 hover:text-gray-200'
              }`
            }
          >
            <link.icon className="w-[18px] h-[18px] transition-transform duration-200 group-hover:scale-110" />
            <span className="text-[13px] font-medium">{link.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Status footer */}
      <div className="p-4 border-t border-gray-800/50">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 bg-green-400 rounded-full pulse-dot" />
          <span className="text-[11px] text-gray-500 font-medium">System Online</span>
        </div>
      </div>
    </aside>
  );
}
