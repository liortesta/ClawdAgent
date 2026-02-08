import React, { useState } from 'react';
import { ListTodo, Plus, CheckCircle, Circle, Clock } from 'lucide-react';

interface Task { id: number; title: string; status: 'pending' | 'in_progress' | 'done'; priority: 'low' | 'medium' | 'high'; }

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: 1, title: 'Configure Brave Search API', status: 'pending', priority: 'high' },
    { id: 2, title: 'Connect GitHub token', status: 'pending', priority: 'high' },
    { id: 3, title: 'Add conversation memory persistence', status: 'pending', priority: 'medium' },
    { id: 4, title: 'Set up SSH server connections', status: 'pending', priority: 'low' },
  ]);
  const [newTask, setNewTask] = useState('');

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks([...tasks, { id: Date.now(), title: newTask.trim(), status: 'pending', priority: 'medium' }]);
    setNewTask('');
  };

  const toggleTask = (id: number) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, status: t.status === 'done' ? 'pending' : 'done' } : t));
  };

  const priorityColor = { low: 'text-gray-400', medium: 'text-yellow-400', high: 'text-red-400' };

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <ListTodo className="w-7 h-7 text-primary-500" />
        <h1 className="text-2xl font-bold">Tasks</h1>
        <span className="text-sm bg-dark-800 text-gray-400 px-2 py-0.5 rounded-full">{tasks.filter(t => t.status !== 'done').length} pending</span>
      </div>

      <div className="flex gap-2 mb-6">
        <input value={newTask} onChange={e => setNewTask(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTask()} placeholder="Add a task..." className="flex-1 p-3 rounded-lg bg-dark-800 border border-gray-700 text-white focus:border-primary-500 focus:outline-none" />
        <button onClick={addTask} className="px-4 py-3 bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"><Plus className="w-5 h-5" /></button>
      </div>

      <div className="space-y-2">
        {tasks.map(task => (
          <div key={task.id} onClick={() => toggleTask(task.id)} className={`flex items-center gap-3 p-4 bg-dark-800 rounded-lg border border-gray-800 cursor-pointer hover:border-gray-700 transition-colors ${task.status === 'done' ? 'opacity-50' : ''}`}>
            {task.status === 'done' ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" /> : <Circle className="w-5 h-5 text-gray-600 shrink-0" />}
            <span className={`flex-1 ${task.status === 'done' ? 'line-through text-gray-500' : ''}`}>{task.title}</span>
            <span className={`text-xs ${priorityColor[task.priority]}`}>{task.priority}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
