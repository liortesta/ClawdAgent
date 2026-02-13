import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/auth';
import {
  Brain, Activity, Shield, DollarSign, Target, Eye, Cpu,
  RefreshCw, AlertTriangle, XCircle, TrendingUp, TrendingDown,
  Minus, Zap, Database, GitBranch,
} from 'lucide-react';

interface IntelligenceData {
  ready: boolean;
  health?: { overallScore: number; agentStability: number; failureRate: number; costDrift: number; latencyAnomaly: number; securityRiskLevel: number };
  scorerReport?: { toolStats: Record<string, PerfStats>; agentStats: Record<string, PerfStats>; disabled: { tools: string[]; agents: string[] }; totalToolCalls: number; totalAgentCalls: number };
  costReport?: { totalCost: number; totalRecords: number; costPerWorkflow: WorkflowCost[]; agentROI: AgentROI[]; anomalies: Anomaly[]; forecast: Forecast; suggestions: Suggestion[] };
  governanceBudget?: { dailyBudgetUsd: number; spentToday: number; remainingToday: number; criticalOps: string; highRiskHourly: string };
  goalSummary?: { activeGoals: number; completedGoals: number; pendingTasks: number; avgProgress: number; triggers: number; kpisMet: number; kpisTotal: number };
  safetyStats?: { totalSimulations: number; blocked: number; highRiskApproved: number; snapshotsTaken: number };
  feedbackReport?: { totalPatterns: number; promotedCount: number; topPatterns: { description: string; occurrences: number; promoted: boolean }[] };
  memoryStatus?: Record<string, unknown>;
  modelRankings?: Record<string, unknown>;
  latencyStats?: Record<string, unknown>;
  pendingGoalTasks?: GoalTask[];
  successPatterns?: unknown[];
  failureClusters?: unknown[];
}

interface PerfStats { totalCalls: number; successRate: number; avgLatency: number; avgCost: number; recentTrend: string; lastUsed: number; enabled: boolean }
interface WorkflowCost { workflowType: string; totalCost: number; avgCost: number; count: number; successRate: number }
interface AgentROI { agentId: string; totalCost: number; totalTasks: number; successfulTasks: number; avgCostPerTask: number; trend: string }
interface Anomaly { type: string; description: string; detectedAt: number; severity: string; expectedCost: number; actualCost: number }
interface Forecast { dailyAvgTokens: number; dailyAvgCost: number; projectedMonthlyCost: number; budgetRunoutDate: string | null }
interface Suggestion { workflowType: string; currentAvgCost: number; suggestion: string; potentialSaving: number }
interface GoalTask { id: string; description: string; action: string; priority: string; status: string }

export default function Intelligence() {
  const token = useAuthStore(s => s.token);
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'agents' | 'costs' | 'safety' | 'memory' | 'goals'>('overview');

  const fetchData = async () => {
    try {
      const res = await fetch('/api/dashboard/intelligence', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      setData(json);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 15000); return () => clearInterval(t); }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!data?.ready) return (
    <div className="p-6">
      <div className="bg-dark-800 rounded-xl p-8 text-center border border-gray-800/50">
        <Brain className="w-12 h-12 mx-auto mb-4 text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-400">Intelligence Bridge Not Ready</h2>
        <p className="text-sm text-gray-500 mt-2">The intelligence subsystems are initializing. This usually takes a few seconds after startup.</p>
        <button onClick={fetchData} className="mt-4 px-4 py-2 bg-primary-600 rounded-lg text-sm hover:bg-primary-500 transition">Retry</button>
      </div>
    </div>
  );

  const score = data.health?.overallScore ?? 0;
  const scoreColor = score > 70 ? 'text-green-400' : score > 40 ? 'text-yellow-400' : 'text-red-400';
  const scoreBarColor = score > 70 ? 'bg-green-500' : score > 40 ? 'bg-yellow-500' : 'bg-red-500';

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Eye },
    { id: 'agents', label: 'Agents & Tools', icon: Cpu },
    { id: 'costs', label: 'Costs', icon: DollarSign },
    { id: 'safety', label: 'Safety', icon: Shield },
    { id: 'memory', label: 'Memory', icon: Database },
    { id: 'goals', label: 'Goals', icon: Target },
  ] as const;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Intelligence Command Center</h1>
            <p className="text-xs text-gray-500">9 Subsystems Live</p>
          </div>
        </div>
        <button onClick={fetchData} className="flex items-center gap-2 px-3 py-1.5 text-xs bg-dark-800 border border-gray-700 rounded-lg hover:bg-dark-700 transition">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <MetricCard label="Health" value={`${score}`} sub="/100" icon={Activity} color={scoreColor} />
        <MetricCard label="Cost Today" value={`$${(data.costReport?.totalCost ?? 0).toFixed(4)}`} icon={DollarSign} color="text-green-400" />
        <MetricCard label="Budget" value={`$${(data.governanceBudget?.spentToday ?? 0).toFixed(2)}`} sub={`/$${(data.governanceBudget?.dailyBudgetUsd ?? 10).toFixed(0)}`} icon={Shield} color="text-cyan-400" />
        <MetricCard label="Goals" value={`${data.goalSummary?.activeGoals ?? 0}`} icon={Target} color="text-pink-400" />
        <MetricCard label="Tasks" value={`${data.goalSummary?.pendingTasks ?? 0}`} icon={Zap} color="text-yellow-400" />
        <MetricCard label="Patterns" value={`${data.feedbackReport?.totalPatterns ?? 0}`} icon={GitBranch} color="text-purple-400" />
        <MetricCard label="Anomalies" value={`${(data.costReport?.anomalies ?? []).length}`} icon={AlertTriangle} color="text-red-400" />
        <MetricCard label="Disabled" value={`${((data.scorerReport?.disabled?.tools ?? []).length + (data.scorerReport?.disabled?.agents ?? []).length)}`} icon={XCircle} color="text-red-300" />
      </div>

      {/* Health Bar */}
      <div className="bg-dark-800 rounded-xl p-4 border border-gray-800/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 uppercase tracking-wider">System Intelligence Index</span>
          <span className={`text-lg font-bold font-mono ${scoreColor}`}>{score}/100</span>
        </div>
        <div className="w-full h-3 bg-dark-900 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-1000 ${scoreBarColor}`} style={{ width: `${score}%` }} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-800 rounded-lg p-1 border border-gray-800/50">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition ${tab === t.id ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white hover:bg-dark-700'}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && <OverviewTab data={data} />}
      {tab === 'agents' && <AgentsTab data={data} />}
      {tab === 'costs' && <CostsTab data={data} />}
      {tab === 'safety' && <SafetyTab data={data} />}
      {tab === 'memory' && <MemoryTab data={data} />}
      {tab === 'goals' && <GoalsTab data={data} />}
    </div>
  );
}

function MetricCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: any; color: string }) {
  return (
    <div className="bg-dark-800 rounded-xl p-3 border border-gray-800/50 hover:border-gray-700/50 transition">
      <Icon className={`w-4 h-4 mb-1.5 ${color} opacity-60`} />
      <div className={`text-lg font-bold font-mono ${color}`}>{value}<span className="text-xs text-gray-500">{sub}</span></div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function TrendBadge({ trend }: { trend: string }) {
  if (trend === 'improving') return <span className="text-green-400 flex items-center gap-0.5 text-xs"><TrendingUp className="w-3 h-3" /></span>;
  if (trend === 'degrading') return <span className="text-red-400 flex items-center gap-0.5 text-xs"><TrendingDown className="w-3 h-3" /></span>;
  return <span className="text-gray-500 flex items-center gap-0.5 text-xs"><Minus className="w-3 h-3" /></span>;
}

function SubsystemCard({ name, icon, active, detail }: { name: string; icon: string; active: boolean; detail: string }) {
  return (
    <div className={`rounded-xl p-4 text-center border transition ${active ? 'bg-dark-800 border-green-900/30' : 'bg-dark-800/50 border-gray-800/30'}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className={`text-xs font-semibold ${active ? 'text-green-400' : 'text-gray-500'}`}>{name}</div>
      <div className="text-[10px] text-gray-600 mt-0.5">{detail}</div>
      <div className={`w-2 h-2 rounded-full mx-auto mt-2 ${active ? 'bg-green-500 shadow-lg shadow-green-500/30' : 'bg-gray-700'}`} />
    </div>
  );
}

// ─── Overview Tab ───
function OverviewTab({ data }: { data: IntelligenceData }) {
  const subsystems = [
    { name: 'Scorer', icon: '\u{1F3AF}', active: (data.scorerReport?.totalToolCalls ?? 0) > 0 || Object.keys(data.scorerReport?.toolStats || {}).length > 0, detail: `${data.scorerReport?.totalToolCalls ?? 0} calls` },
    { name: 'Memory', icon: '\u{1F9E0}', active: !!data.memoryStatus, detail: `${Object.keys(data.memoryStatus || {}).length} layers` },
    { name: 'Governance', icon: '\u{1F6E1}\uFE0F', active: !!(data.governanceBudget?.dailyBudgetUsd), detail: data.governanceBudget?.criticalOps ?? 'Ready' },
    { name: 'Cost Intel', icon: '\u{1F4B0}', active: (data.costReport?.totalRecords ?? 0) > 0, detail: `${data.costReport?.totalRecords ?? 0} records` },
    { name: 'Model Router', icon: '\u{1F500}', active: !!data.modelRankings, detail: `${Object.keys(data.modelRankings || {}).length} models` },
    { name: 'Observability', icon: '\u{1F4CA}', active: !!data.health, detail: 'Dashboard ready' },
    { name: 'Goals', icon: '\u{1F3AF}', active: (data.goalSummary?.activeGoals ?? 0) > 0, detail: `${data.goalSummary?.kpisMet ?? 0}/${data.goalSummary?.kpisTotal ?? 0} KPIs` },
    { name: 'Safety', icon: '\u{1F6A8}', active: !!data.safetyStats, detail: `${data.safetyStats?.totalSimulations ?? 0} sims` },
    { name: 'Feedback', icon: '\u{1F504}', active: (data.feedbackReport?.totalPatterns ?? 0) > 0, detail: `${data.feedbackReport?.promotedCount ?? 0} promoted` },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-dark-800 rounded-xl p-5 border border-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">9 Intelligence Subsystems</h3>
        <div className="grid grid-cols-3 gap-2">
          {subsystems.map(s => <SubsystemCard key={s.name} {...s} />)}
        </div>
      </div>
      <div className="bg-dark-800 rounded-xl p-5 border border-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Cost Suggestions</h3>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {(data.costReport?.suggestions ?? []).length === 0
            ? <p className="text-xs text-gray-600">No suggestions yet</p>
            : data.costReport!.suggestions.map((s, i) => (
              <div key={i} className="p-3 bg-dark-900 rounded-lg border border-gray-800/30 text-xs">
                <div className="font-medium text-gray-300">{s.workflowType}</div>
                <div className="text-gray-500 mt-1">{s.suggestion}</div>
                <div className={`mt-1 font-mono ${s.potentialSaving > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {s.potentialSaving > 0 ? 'Save' : 'Cost'}: ${Math.abs(s.potentialSaving).toFixed(4)}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ─── Agents Tab ───
function AgentsTab({ data }: { data: IntelligenceData }) {
  const agents = Object.entries(data.scorerReport?.agentStats || {});
  const tools = Object.entries(data.scorerReport?.toolStats || {});

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-dark-800 rounded-xl p-5 border border-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Agent Performance</h3>
        {agents.length === 0 ? <p className="text-xs text-gray-600">No agent data yet</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-800/50"><th className="pb-2 text-left">Agent</th><th className="pb-2">Calls</th><th className="pb-2">Success</th><th className="pb-2">Latency</th><th className="pb-2">Trend</th></tr></thead>
              <tbody>{agents.map(([id, s]) => (
                <tr key={id} className="border-b border-gray-800/30 hover:bg-dark-700/30">
                  <td className="py-2 font-mono text-[11px]">{id}</td>
                  <td className="py-2 text-center">{s.totalCalls}</td>
                  <td className="py-2 text-center"><span className={s.successRate > 0.7 ? 'text-green-400' : s.successRate > 0.4 ? 'text-yellow-400' : 'text-red-400'}>{(s.successRate * 100).toFixed(0)}%</span></td>
                  <td className="py-2 text-center font-mono">{s.avgLatency.toFixed(0)}ms</td>
                  <td className="py-2 text-center"><TrendBadge trend={s.recentTrend} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <div className="bg-dark-800 rounded-xl p-5 border border-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Tool Performance</h3>
        {tools.length === 0 ? <p className="text-xs text-gray-600">No tool data yet</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-800/50"><th className="pb-2 text-left">Tool</th><th className="pb-2">Calls</th><th className="pb-2">Success</th><th className="pb-2">Latency</th><th className="pb-2">Trend</th></tr></thead>
              <tbody>{tools.map(([id, s]) => (
                <tr key={id} className="border-b border-gray-800/30 hover:bg-dark-700/30">
                  <td className="py-2 font-mono text-[11px]">{id}</td>
                  <td className="py-2 text-center">{s.totalCalls}</td>
                  <td className="py-2 text-center"><span className={s.successRate > 0.7 ? 'text-green-400' : s.successRate > 0.4 ? 'text-yellow-400' : 'text-red-400'}>{(s.successRate * 100).toFixed(0)}%</span></td>
                  <td className="py-2 text-center font-mono">{s.avgLatency.toFixed(0)}ms</td>
                  <td className="py-2 text-center"><TrendBadge trend={s.recentTrend} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Costs Tab ───
function CostsTab({ data }: { data: IntelligenceData }) {
  const cost = data.costReport;
  const fc = cost?.forecast;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-dark-800 rounded-xl p-5 border border-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Cost per Workflow</h3>
        {(cost?.costPerWorkflow ?? []).length === 0 ? <p className="text-xs text-gray-600">No cost data yet</p> : (
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-gray-500 border-b border-gray-800/50"><th className="pb-2 text-left">Workflow</th><th className="pb-2">Total</th><th className="pb-2">Avg</th><th className="pb-2">Count</th></tr></thead>
              <tbody>{cost!.costPerWorkflow.slice(0, 20).map((w, i) => (
                <tr key={i} className="border-b border-gray-800/30">
                  <td className="py-1.5 font-mono text-[10px]">{w.workflowType}</td>
                  <td className="py-1.5 text-center text-green-400 font-mono">${w.totalCost.toFixed(4)}</td>
                  <td className="py-1.5 text-center font-mono">${w.avgCost.toFixed(4)}</td>
                  <td className="py-1.5 text-center">{w.count}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <div className="bg-dark-800 rounded-xl p-5 border border-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Token Forecast</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-dark-900 rounded-lg p-3 border border-gray-800/30">
            <div className="text-lg font-bold font-mono text-cyan-400">{formatNum(fc?.dailyAvgTokens ?? 0)}</div>
            <div className="text-[10px] text-gray-500 uppercase">Daily Avg Tokens</div>
          </div>
          <div className="bg-dark-900 rounded-lg p-3 border border-gray-800/30">
            <div className="text-lg font-bold font-mono text-green-400">${(fc?.dailyAvgCost ?? 0).toFixed(4)}</div>
            <div className="text-[10px] text-gray-500 uppercase">Daily Avg Cost</div>
          </div>
          <div className="bg-dark-900 rounded-lg p-3 border border-gray-800/30">
            <div className="text-lg font-bold font-mono text-yellow-400">${(fc?.projectedMonthlyCost ?? 0).toFixed(2)}</div>
            <div className="text-[10px] text-gray-500 uppercase">Monthly Projection</div>
          </div>
          <div className="bg-dark-900 rounded-lg p-3 border border-gray-800/30">
            <div className={`text-lg font-bold font-mono ${fc?.budgetRunoutDate ? 'text-red-400' : 'text-green-400'}`}>{fc?.budgetRunoutDate ?? 'OK'}</div>
            <div className="text-[10px] text-gray-500 uppercase">Budget Status</div>
          </div>
        </div>
        {(cost?.anomalies ?? []).length > 0 && (
          <>
            <h4 className="text-xs text-gray-400 mt-4 mb-2">Anomalies</h4>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {cost!.anomalies.map((a, i) => (
                <div key={i} className="p-2 bg-dark-900 rounded-lg border border-gray-800/30 text-[11px]">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${a.severity === 'high' ? 'bg-red-900/50 text-red-400' : a.severity === 'medium' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-green-900/50 text-green-400'}`}>{a.severity}</span>
                  <span className="ml-2 text-gray-400">{a.description}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Safety Tab ───
function SafetyTab({ data }: { data: IntelligenceData }) {
  const safety = data.safetyStats;
  const gov = data.governanceBudget;
  const budgetPct = gov ? (gov.spentToday / gov.dailyBudgetUsd) * 100 : 0;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-dark-800 rounded-xl p-5 border border-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Safety Simulator</h3>
        <div className="grid grid-cols-2 gap-3">
          <StatBox label="Simulations" value={safety?.totalSimulations ?? 0} color="text-indigo-400" />
          <StatBox label="Blocked" value={safety?.blocked ?? 0} color="text-red-400" />
          <StatBox label="High Risk OK" value={safety?.highRiskApproved ?? 0} color="text-yellow-400" />
          <StatBox label="Snapshots" value={safety?.snapshotsTaken ?? 0} color="text-green-400" />
        </div>
      </div>
      <div className="bg-dark-800 rounded-xl p-5 border border-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Governance Budget</h3>
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-gray-400">Daily Budget</span>
            <span className="font-mono text-green-400">${(gov?.spentToday ?? 0).toFixed(2)} / ${(gov?.dailyBudgetUsd ?? 10).toFixed(2)}</span>
          </div>
          <div className="w-full h-2.5 bg-dark-900 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${budgetPct > 80 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, budgetPct)}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatBox label="Critical Ops" value={gov?.criticalOps ?? '0/5'} color="text-gray-300" small />
          <StatBox label="High Risk/Hr" value={gov?.highRiskHourly ?? '0/20'} color="text-gray-300" small />
          <StatBox label="Remaining" value={`$${(gov?.remainingToday ?? 0).toFixed(2)}`} color="text-green-400" small />
        </div>
      </div>
    </div>
  );
}

// ─── Memory Tab ───
function MemoryTab({ data }: { data: IntelligenceData }) {
  const patterns = data.feedbackReport?.topPatterns ?? [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-dark-800 rounded-xl p-5 border border-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Memory Hierarchy</h3>
        {Object.keys(data.memoryStatus || {}).length === 0
          ? <p className="text-xs text-gray-600">No memory data yet</p>
          : <div className="space-y-2">{Object.entries(data.memoryStatus || {}).map(([k, v]) => (
            <div key={k} className="p-3 bg-dark-900 rounded-lg border border-gray-800/30">
              <div className="text-xs font-semibold text-gray-300 capitalize">{k.replace(/_/g, ' ')}</div>
              <div className="text-[10px] text-gray-500 mt-1 font-mono">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
            </div>
          ))}</div>}
      </div>
      <div className="bg-dark-800 rounded-xl p-5 border border-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Feedback Patterns</h3>
        {patterns.length === 0 ? <p className="text-xs text-gray-600">No patterns yet</p> : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {patterns.map((p, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 bg-dark-900 rounded-lg border border-gray-800/30">
                <span className="text-xs text-gray-300 truncate flex-1">{p.description}</span>
                <span className={`ml-2 px-2 py-0.5 rounded text-[9px] font-bold ${p.promoted ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-400'}`}>
                  {p.promoted ? 'Promoted' : `${p.occurrences}x`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Goals Tab ───
function GoalsTab({ data }: { data: IntelligenceData }) {
  const goals = data.goalSummary;
  const tasks = data.pendingGoalTasks ?? [];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-dark-800 rounded-xl p-5 border border-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Strategic Goals</h3>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatBox label="Active" value={goals?.activeGoals ?? 0} color="text-indigo-400" />
          <StatBox label="Completed" value={goals?.completedGoals ?? 0} color="text-green-400" />
          <StatBox label="Progress" value={`${(goals?.avgProgress ?? 0).toFixed(0)}%`} color="text-yellow-400" />
          <StatBox label="KPIs Met" value={`${goals?.kpisMet ?? 0}/${goals?.kpisTotal ?? 0}`} color="text-cyan-400" />
        </div>
        <div className="w-full h-2.5 bg-dark-900 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-green-500 transition-all" style={{ width: `${goals?.avgProgress ?? 0}%` }} />
        </div>
      </div>
      <div className="bg-dark-800 rounded-xl p-5 border border-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Self-Initiated Tasks</h3>
        {tasks.length === 0 ? <p className="text-xs text-gray-600">No pending tasks</p> : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {tasks.map((t, i) => (
              <div key={i} className="p-3 bg-dark-900 rounded-lg border border-gray-800/30">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${t.priority === 'high' ? 'bg-red-900/50 text-red-400' : t.priority === 'medium' ? 'bg-yellow-900/50 text-yellow-400' : 'bg-green-900/50 text-green-400'}`}>{t.priority}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{t.action}</span>
                </div>
                <p className="text-xs text-gray-300 mt-1.5">{t.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, color, small }: { label: string; value: string | number; color: string; small?: boolean }) {
  return (
    <div className="bg-dark-900 rounded-lg p-3 border border-gray-800/30">
      <div className={`${small ? 'text-sm' : 'text-xl'} font-bold font-mono ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toFixed(0);
}
