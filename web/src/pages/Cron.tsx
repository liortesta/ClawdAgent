import { useEffect, useState } from 'react';
import { api } from '../api/client';
import {
  Timer, Plus, Trash2, X, Save, Loader2, ToggleLeft, ToggleRight, Play
} from 'lucide-react';

interface CronTask {
  id: string;
  expression: string;
  action: string;
  description: string;
  enabled: boolean;
  lastRun?: string;
  platform: string;
}

export default function Cron() {
  const [tasks, setTasks] = useState<CronTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ expression: '', action: 'send_message', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    try {
      const data = await api.getCronTasks();
      setTasks(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newTask.expression || !newTask.description) return;
    setSaving(true);
    try {
      await api.createCronTask(newTask);
      setShowCreate(false);
      setNewTask({ expression: '', action: 'send_message', description: '' });
      await loadTasks();
    } catch (err) {
      console.error('Failed to create cron task:', err);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this cron task?')) return;
    try {
      await api.deleteCronTask(id);
      await loadTasks();
    } catch (err) {
      console.error('Failed to delete cron task:', err);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await api.toggleCronTask(id);
      await loadTasks();
    } catch (err) {
      console.error('Failed to toggle cron task:', err);
    }
  };

  const cronExamples = [
    { label: 'Every 5 minutes', value: '*/5 * * * *' },
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Every morning 8:00', value: '0 8 * * *' },
    { label: 'Every day 22:00', value: '0 22 * * *' },
    { label: 'Every Monday 9:00', value: '0 9 * * 1' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Timer className="w-7 h-7 text-primary-500" />
            <h1 className="text-2xl font-bold">Cron Jobs</h1>
            <span className="text-sm text-gray-400">({tasks.length})</span>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            New Job
          </button>
        </div>

        {/* Create Form */}
        {showCreate && (
          <div className="mb-6 p-5 bg-dark-800 rounded-lg border border-primary-600/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Create Cron Job</h3>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <input
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Send morning briefing"
                  className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Schedule (cron expression or natural language)</label>
                <input
                  value={newTask.expression}
                  onChange={(e) => setNewTask({ ...newTask, expression: e.target.value })}
                  placeholder="0 8 * * * or 'every morning'"
                  className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm font-mono"
                />
                <div className="flex gap-2 mt-2 flex-wrap">
                  {cronExamples.map(ex => (
                    <button
                      key={ex.value}
                      onClick={() => setNewTask({ ...newTask, expression: ex.value })}
                      className="text-xs px-2 py-1 bg-dark-900 border border-gray-700 rounded hover:border-gray-500 text-gray-400 hover:text-white transition-colors"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Action</label>
                <select
                  value={newTask.action}
                  onChange={(e) => setNewTask({ ...newTask, action: e.target.value })}
                  className="w-full p-2.5 rounded bg-dark-900 border border-gray-700 text-white text-sm"
                >
                  <option value="send_message">Send Message</option>
                  <option value="news_summary">News Summary</option>
                  <option value="health_check">Server Health Check</option>
                  <option value="backup">Backup</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreate}
                  disabled={saving || !newTask.expression || !newTask.description}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 font-medium"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Create
                </button>
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-dark-900 rounded-lg hover:bg-dark-800 transition-colors text-gray-400">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tasks List */}
        <div className="space-y-3">
          {tasks.map(task => (
            <div key={task.id} className="p-4 bg-dark-800 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Play className="w-4 h-4 text-cyan-400" />
                    <h3 className="font-medium">{task.description || task.action}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${task.enabled !== false ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                      {task.enabled !== false ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <span className="font-mono">{task.expression}</span>
                    <span>Action: {task.action}</span>
                    {task.lastRun && <span>Last: {new Date(task.lastRun).toLocaleString()}</span>}
                  </div>
                </div>
                <div className="flex gap-1 ml-4">
                  <button
                    onClick={() => handleToggle(task.id)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-dark-900 rounded transition-colors"
                    title={task.enabled !== false ? 'Pause' : 'Resume'}
                  >
                    {task.enabled !== false ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-dark-900 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {tasks.length === 0 && (
            <div className="text-center text-gray-500 py-12">
              <Timer className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No cron jobs yet</p>
              <p className="text-sm mt-1">Create scheduled tasks to automate your workflow</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
