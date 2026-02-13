import { useEffect, useState } from 'react';
import { api } from '../api/client';
import {
  Bot, Shield, Code, Search, ListTodo, MessageSquare,
  Monitor, Hammer, Globe, Palette, GitBranch, Smartphone,
  Cpu, Zap, Loader2, CheckCircle2, LucideIcon
} from 'lucide-react';

interface AgentDef {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
  borderColor: string;
  description: string;
  capabilities: string[];
  tools: string[];
}

const AGENTS: AgentDef[] = [
  {
    id: 'server-manager',
    name: 'Server Manager',
    icon: Monitor,
    color: 'bg-red-500/15 text-red-400',
    borderColor: 'border-l-red-500',
    description: 'SSH connections, Docker management, monitoring, deployment, and auto-fix for remote servers.',
    capabilities: ['SSH into servers and execute commands', 'Docker container lifecycle management', 'System monitoring and auto-remediation'],
    tools: ['SSH', 'Docker', 'PM2', 'Nginx'],
  },
  {
    id: 'code-assistant',
    name: 'Code Assistant',
    icon: Code,
    color: 'bg-purple-500/15 text-purple-400',
    borderColor: 'border-l-purple-500',
    description: 'GitHub repository management, pull requests, code review, and issue tracking.',
    capabilities: ['Clone repos and manage branches', 'Create and review pull requests', 'Automated code review and suggestions'],
    tools: ['GitHub', 'Git', 'ESLint', 'Prettier'],
  },
  {
    id: 'researcher',
    name: 'Researcher',
    icon: Search,
    color: 'bg-green-500/15 text-green-400',
    borderColor: 'border-l-green-500',
    description: 'Web search, content summarization, data analysis, and trend research.',
    capabilities: ['Search the web for real-time info', 'Summarize articles and documents', 'Comparative analysis and reports'],
    tools: ['Web Search', 'Scraper', 'Summarizer'],
  },
  {
    id: 'task-planner',
    name: 'Task Planner',
    icon: ListTodo,
    color: 'bg-yellow-500/15 text-yellow-400',
    borderColor: 'border-l-yellow-500',
    description: 'Task management, reminders, scheduling, and project planning.',
    capabilities: ['Create and track tasks with deadlines', 'Set recurring reminders', 'Break down complex projects into steps'],
    tools: ['Tasks DB', 'Cron', 'Calendar'],
  },
  {
    id: 'general',
    name: 'General Assistant',
    icon: MessageSquare,
    color: 'bg-blue-500/15 text-blue-400',
    borderColor: 'border-l-blue-500',
    description: 'General conversation, Q&A, creative writing, and everyday assistance.',
    capabilities: ['Answer questions on any topic', 'Creative writing and brainstorming', 'Translation and text processing'],
    tools: ['LLM', 'TTS', 'Translation'],
  },
  {
    id: 'security-guard',
    name: 'Security Guard',
    icon: Shield,
    color: 'bg-orange-500/15 text-orange-400',
    borderColor: 'border-l-orange-500',
    description: 'Reviews dangerous commands, validates operations, and enforces safety policies.',
    capabilities: ['Validate commands before execution', 'Detect potentially harmful operations', 'Audit trail and permission checks'],
    tools: ['Validator', 'Audit Log', 'Policy Engine'],
  },
  {
    id: 'desktop-controller',
    name: 'Desktop Controller',
    icon: Cpu,
    color: 'bg-indigo-500/15 text-indigo-400',
    borderColor: 'border-l-indigo-500',
    description: 'Desktop automation using nutjs for mouse, keyboard, and screen control.',
    capabilities: ['Mouse movement and click automation', 'Keyboard input and shortcuts', 'Screen capture and OCR reading'],
    tools: ['nutjs', 'Screen OCR', 'Clipboard'],
  },
  {
    id: 'project-builder',
    name: 'Project Builder',
    icon: Hammer,
    color: 'bg-teal-500/15 text-teal-400',
    borderColor: 'border-l-teal-500',
    description: 'Full project scaffolding, boilerplate generation, and build pipeline setup.',
    capabilities: ['Scaffold complete project structures', 'Generate boilerplate with best practices', 'Configure CI/CD pipelines'],
    tools: ['Templates', 'NPM', 'Git Init', 'Docker'],
  },
  {
    id: 'web-agent',
    name: 'Web Agent',
    icon: Globe,
    color: 'bg-cyan-500/15 text-cyan-400',
    borderColor: 'border-l-cyan-500',
    description: 'Browser automation, web scraping, form filling, and website testing.',
    capabilities: ['Automate browser interactions', 'Scrape and extract web data', 'Fill forms and run UI tests'],
    tools: ['Puppeteer', 'Cheerio', 'Fetch'],
  },
  {
    id: 'content-creator',
    name: 'Content Creator',
    icon: Palette,
    color: 'bg-pink-500/15 text-pink-400',
    borderColor: 'border-l-pink-500',
    description: 'Content generation, social media posts, marketing copy, and creative assets.',
    capabilities: ['Generate blog posts and articles', 'Create social media content', 'Write marketing copy and ads'],
    tools: ['LLM', 'Image Gen', 'Markdown'],
  },
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    icon: GitBranch,
    color: 'bg-amber-500/15 text-amber-400',
    borderColor: 'border-l-amber-500',
    description: 'Multi-agent coordination, complex task decomposition, and pipeline execution.',
    capabilities: ['Coordinate multiple agents in sequence', 'Decompose complex tasks automatically', 'Manage execution pipelines and retries'],
    tools: ['Agent Router', 'Pipeline', 'Queue'],
  },
  {
    id: 'device-controller',
    name: 'Device Controller',
    icon: Smartphone,
    color: 'bg-emerald-500/15 text-emerald-400',
    borderColor: 'border-l-emerald-500',
    description: 'IoT and device management, smart home control, and device automation.',
    capabilities: ['Control IoT devices and sensors', 'Smart home automation routines', 'Monitor device status and health'],
    tools: ['MQTT', 'HTTP', 'Webhooks'],
  },
];

export default function Agents() {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await api.dashboardStatus();
      setDashboardData(data);
    } catch {
      // Fall back to static agent list
    }
    setLoading(false);
  };

  const getAgentStatus = (agentId: string): string => {
    if (!dashboardData?.agents) return 'Active';
    const found = dashboardData.agents.find?.((a: any) => a.id === agentId || a.name === agentId);
    return found?.status ?? 'Active';
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'online':
      case 'running':
        return { dot: 'bg-green-500', text: 'text-green-400' };
      case 'idle':
      case 'standby':
        return { dot: 'bg-yellow-500', text: 'text-yellow-400' };
      case 'disabled':
      case 'offline':
        return { dot: 'bg-red-500', text: 'text-red-400' };
      default:
        return { dot: 'bg-green-500', text: 'text-green-400' };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const activeCount = AGENTS.filter(a => {
    const status = getAgentStatus(a.id);
    return ['active', 'online', 'running'].includes(status.toLowerCase());
  }).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Bot className="w-7 h-7 text-primary-500" />
          <h1 className="text-2xl font-bold">AI Agents</h1>
          <span className="text-sm bg-green-600/20 text-green-400 px-3 py-0.5 rounded-full font-medium">
            {activeCount} Active
          </span>
          <span className="text-sm text-gray-500">/ {AGENTS.length} Total</span>
        </div>

        {/* System info bar */}
        {dashboardData && (
          <div className="flex items-center gap-4 mb-6 p-3 bg-dark-800 rounded-lg border border-gray-800 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span>Routing engine online</span>
            </div>
            <span className="text-gray-700">|</span>
            <span>Agents auto-selected per message intent</span>
          </div>
        )}

        {/* Agent Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {AGENTS.map(agent => {
            const status = getAgentStatus(agent.id);
            const statusColor = getStatusColor(status);
            const Icon = agent.icon;

            return (
              <div
                key={agent.id}
                className={`bg-dark-800 rounded-lg border border-gray-800 border-l-4 ${agent.borderColor} hover:border-gray-600 hover:shadow-lg hover:shadow-black/20 transition-all duration-200 group`}
              >
                <div className="p-5">
                  {/* Agent header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${agent.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white group-hover:text-primary-400 transition-colors">
                          {agent.name}
                        </h3>
                        <span className="text-xs text-gray-500 font-mono">{agent.id}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className={`w-2 h-2 rounded-full ${statusColor.dot} animate-pulse`} />
                      <span className={`text-xs font-medium ${statusColor.text}`}>{status}</span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-400 mb-4 leading-relaxed">{agent.description}</p>

                  {/* Capabilities */}
                  <div className="mb-4 space-y-1.5">
                    {agent.capabilities.map((cap, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{cap}</span>
                      </div>
                    ))}
                  </div>

                  {/* Tools */}
                  <div className="flex flex-wrap gap-1.5 pt-3 border-t border-gray-800/80">
                    {agent.tools.map(tool => (
                      <span
                        key={tool}
                        className="text-[10px] px-2 py-0.5 rounded bg-dark-900 text-gray-400 border border-gray-700/50 font-medium"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
