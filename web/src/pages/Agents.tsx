import React from 'react';
import { Bot, Shield, Code, Search, ListTodo, MessageSquare } from 'lucide-react';

const agents = [
  { name: 'General Assistant', icon: MessageSquare, color: 'bg-blue-600', desc: 'General conversation, Q&A, creative writing', status: 'Active' },
  { name: 'Server Manager', icon: Shield, color: 'bg-red-600', desc: 'SSH, Docker, monitoring, deployment, auto-fix', status: 'Active' },
  { name: 'Code Assistant', icon: Code, color: 'bg-purple-600', desc: 'GitHub repos, PRs, code review, issues', status: 'Active' },
  { name: 'Researcher', icon: Search, color: 'bg-green-600', desc: 'Web search, summarization, data analysis', status: 'Active' },
  { name: 'Task Planner', icon: ListTodo, color: 'bg-yellow-600', desc: 'Task management, reminders, scheduling', status: 'Active' },
  { name: 'Security Guard', icon: Shield, color: 'bg-orange-600', desc: 'Reviews dangerous commands, validates operations', status: 'Active' },
];

export default function Agents() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Bot className="w-7 h-7 text-primary-500" />
        <h1 className="text-2xl font-bold">AI Agents</h1>
        <span className="text-sm bg-green-600/20 text-green-400 px-2 py-0.5 rounded-full">{agents.length} Active</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(agent => (
          <div key={agent.name} className="bg-dark-800 rounded-lg p-5 border border-gray-800 hover:border-gray-700 transition-colors">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 ${agent.color} rounded-lg flex items-center justify-center`}>
                <agent.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">{agent.name}</h3>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                  <span className="text-xs text-green-400">{agent.status}</span>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-400">{agent.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
