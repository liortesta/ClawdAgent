import { useState, useEffect, useMemo } from 'react';
import {
  ListTodo, Plus, CheckCircle, Circle, Clock, Trash2,
  Filter, Calendar, Tag, AlertCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  dueDate?: string;
  createdAt: string;
}

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'done';
type PriorityFilter = 'all' | Task['priority'];
type CategoryFilter = 'all' | string;
type SortMode = 'newest' | 'priority' | 'dueDate';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'clawdagent_tasks';

const CATEGORIES = ['Setup', 'Development', 'Content', 'Business', 'Other'] as const;

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  Setup:       { bg: 'bg-cyan-500/15',    text: 'text-cyan-400'    },
  Development: { bg: 'bg-violet-500/15',  text: 'text-violet-400'  },
  Content:     { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  Business:    { bg: 'bg-amber-500/15',   text: 'text-amber-400'   },
  Other:       { bg: 'bg-gray-500/15',    text: 'text-gray-400'    },
};

const PRIORITY_COLORS: Record<Task['priority'], { bg: string; text: string; border: string }> = {
  urgent: { bg: 'bg-red-500/15',    text: 'text-red-400',    border: 'border-red-500/30'    },
  high:   { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  medium: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  low:    { bg: 'bg-gray-500/15',   text: 'text-gray-400',   border: 'border-gray-600/30'   },
};

const PRIORITY_ORDER: Record<Task['priority'], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const STATUS_CYCLE: Record<Task['status'], Task['status']> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTasks(tasks: Task[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCreatedDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Chip({
  label,
  active,
  onClick,
  count,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1.5 rounded-full text-xs font-medium transition-all border
        ${active
          ? `${color ?? 'bg-primary-600/20 text-primary-500 border-primary-500/40'}`
          : 'bg-dark-800 text-gray-400 border-gray-700 hover:border-gray-600 hover:text-gray-300'
        }
      `}
    >
      {label}
      {count !== undefined && (
        <span className={`ml-1.5 ${active ? 'opacity-80' : 'opacity-60'}`}>({count})</span>
      )}
    </button>
  );
}

function StatusIcon({ status }: { status: Task['status'] }) {
  switch (status) {
    case 'done':
      return <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />;
    case 'in_progress':
      return <Clock className="w-5 h-5 text-blue-400 shrink-0" />;
    default:
      return <Circle className="w-5 h-5 text-gray-500 shrink-0" />;
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Tasks() {
  // -- State ----------------------------------------------------------------
  const [tasks, setTasks] = useState<Task[]>(loadTasks);

  // Quick-add
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Task['priority']>('medium');
  const [newCategory, setNewCategory] = useState<string>('Development');
  const [newDueDate, setNewDueDate] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // -- Persistence ----------------------------------------------------------
  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  // -- Derived data ---------------------------------------------------------
  const counts = useMemo(() => {
    const c = { all: tasks.length, pending: 0, in_progress: 0, done: 0 };
    tasks.forEach((t) => { c[t.status]++; });
    return c;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((t) => t.status === statusFilter);
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      result = result.filter((t) => t.priority === priorityFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter((t) => t.category === categoryFilter);
    }

    // Sort
    result.sort((a, b) => {
      if (sortMode === 'priority') {
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      }
      if (sortMode === 'dueDate') {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      // newest
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [tasks, statusFilter, priorityFilter, categoryFilter, sortMode]);

  // -- Handlers -------------------------------------------------------------

  const addTask = () => {
    const title = newTitle.trim();
    if (!title) return;

    const task: Task = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      title,
      status: 'pending',
      priority: newPriority,
      category: newCategory,
      dueDate: newDueDate || undefined,
      createdAt: new Date().toISOString(),
    };

    setTasks((prev) => [task, ...prev]);
    setNewTitle('');
    setNewDueDate('');
  };

  const toggleStatus = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: STATUS_CYCLE[t.status] } : t)),
    );
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setDeleteId(null);
  };

  // -- Render ---------------------------------------------------------------

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-4xl mx-auto">

        {/* ---- Header ---------------------------------------------------- */}
        <div className="flex items-center gap-3 mb-6">
          <ListTodo className="w-7 h-7 text-primary-500" />
          <h1 className="text-2xl font-bold">Tasks</h1>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs bg-gray-500/15 text-gray-400 px-2.5 py-1 rounded-full">
              {counts.pending} pending
            </span>
            <span className="text-xs bg-blue-500/15 text-blue-400 px-2.5 py-1 rounded-full">
              {counts.in_progress} in progress
            </span>
            <span className="text-xs bg-green-500/15 text-green-400 px-2.5 py-1 rounded-full">
              {counts.done} done
            </span>
          </div>
        </div>

        {/* ---- Quick-add ------------------------------------------------- */}
        <div className="bg-dark-800 rounded-xl border border-gray-800 p-4 mb-4">
          <div className="flex gap-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTask()}
              placeholder="Add a new task..."
              className="flex-1 p-3 rounded-lg bg-dark-900 border border-gray-700 text-white
                         placeholder-gray-500 focus:border-primary-500 focus:outline-none
                         transition-colors text-sm"
            />
            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as Task['priority'])}
              className="p-3 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm
                         min-w-[110px] focus:border-primary-500 focus:outline-none transition-colors"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <button
              onClick={addTask}
              disabled={!newTitle.trim()}
              className="px-5 py-3 bg-primary-600 rounded-lg hover:bg-primary-700
                         transition-colors disabled:opacity-40 disabled:cursor-not-allowed
                         flex items-center gap-2 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>

          {/* Toggle for advanced fields */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-gray-500 hover:text-gray-300 mt-3 transition-colors"
          >
            {showAdvanced ? 'Hide options' : 'More options (category, due date)'}
          </button>

          {showAdvanced && (
            <div className="flex gap-2 mt-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">
                  <Tag className="w-3 h-3 inline mr-1" />
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-dark-900 border border-gray-700
                             text-white text-sm focus:border-primary-500 focus:outline-none
                             transition-colors"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  Due date
                </label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-dark-900 border border-gray-700
                             text-white text-sm focus:border-primary-500 focus:outline-none
                             transition-colors"
                />
              </div>
            </div>
          )}
        </div>

        {/* ---- Filter bar ------------------------------------------------ */}
        <div className="bg-dark-800 rounded-xl border border-gray-800 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Filters</span>
          </div>

          {/* Status chips */}
          <div className="flex flex-wrap gap-2 mb-3">
            {(['all', 'pending', 'in_progress', 'done'] as StatusFilter[]).map((s) => (
              <Chip
                key={s}
                label={s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                active={statusFilter === s}
                onClick={() => setStatusFilter(s)}
                count={s === 'all' ? counts.all : counts[s]}
                color={
                  statusFilter === s
                    ? s === 'done'
                      ? 'bg-green-500/15 text-green-400 border-green-500/40'
                      : s === 'in_progress'
                        ? 'bg-blue-500/15 text-blue-400 border-blue-500/40'
                        : s === 'pending'
                          ? 'bg-gray-500/15 text-gray-300 border-gray-500/40'
                          : 'bg-primary-600/20 text-primary-500 border-primary-500/40'
                    : undefined
                }
              />
            ))}
          </div>

          {/* Priority & category chips */}
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="text-xs text-gray-600 self-center mr-1">Priority:</span>
            {(['all', 'urgent', 'high', 'medium', 'low'] as PriorityFilter[]).map((p) => (
              <Chip
                key={p}
                label={p === 'all' ? 'Any' : p.charAt(0).toUpperCase() + p.slice(1)}
                active={priorityFilter === p}
                onClick={() => setPriorityFilter(p)}
                color={
                  priorityFilter === p && p !== 'all'
                    ? `${PRIORITY_COLORS[p as Task['priority']].bg} ${PRIORITY_COLORS[p as Task['priority']].text} ${PRIORITY_COLORS[p as Task['priority']].border}`
                    : undefined
                }
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            <span className="text-xs text-gray-600 self-center mr-1">Category:</span>
            <Chip label="Any" active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')} />
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={c}
                active={categoryFilter === c}
                onClick={() => setCategoryFilter(c)}
                color={
                  categoryFilter === c
                    ? `${CATEGORY_COLORS[c].bg} ${CATEGORY_COLORS[c].text} border-transparent`
                    : undefined
                }
              />
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">Sort:</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="text-xs p-1.5 rounded bg-dark-900 border border-gray-700
                         text-gray-300 focus:outline-none focus:border-primary-500
                         transition-colors"
            >
              <option value="newest">Newest first</option>
              <option value="priority">Priority</option>
              <option value="dueDate">Due date</option>
            </select>
          </div>
        </div>

        {/* ---- Task list ------------------------------------------------- */}
        <div className="space-y-2">
          {filteredTasks.map((task) => {
            const prio = PRIORITY_COLORS[task.priority];
            const cat = CATEGORY_COLORS[task.category] ?? CATEGORY_COLORS.Other;
            const overdue = task.status !== 'done' && isOverdue(task.dueDate);

            return (
              <div
                key={task.id}
                className={`
                  group flex items-center gap-3 p-4 bg-dark-800 rounded-lg border
                  border-gray-800 hover:border-gray-700 transition-all
                  ${task.status === 'done' ? 'opacity-50' : ''}
                `}
              >
                {/* Status toggle */}
                <button
                  onClick={() => toggleStatus(task.id)}
                  className="shrink-0 focus:outline-none"
                  title={`Status: ${task.status} (click to cycle)`}
                >
                  <StatusIcon status={task.status} />
                </button>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-sm font-medium truncate
                        ${task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-100'}`}
                    >
                      {task.title}
                    </span>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {/* Priority badge */}
                    <span
                      className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5
                        rounded ${prio.bg} ${prio.text}`}
                    >
                      {task.priority === 'urgent' && (
                        <AlertCircle className="w-3 h-3 inline mr-0.5 -mt-px" />
                      )}
                      {task.priority}
                    </span>

                    {/* Category badge */}
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded
                        ${cat.bg} ${cat.text}`}
                    >
                      {task.category}
                    </span>

                    {/* Due date */}
                    {task.dueDate && (
                      <span
                        className={`text-[10px] flex items-center gap-1
                          ${overdue ? 'text-red-400 font-semibold' : 'text-gray-500'}`}
                      >
                        <Calendar className="w-3 h-3" />
                        {overdue && <AlertCircle className="w-3 h-3" />}
                        {formatShortDate(task.dueDate)}
                      </span>
                    )}

                    {/* Created date */}
                    <span className="text-[10px] text-gray-600 ml-auto hidden sm:inline">
                      Created {formatCreatedDate(task.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Delete */}
                {deleteId === task.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400
                                 hover:bg-red-500/30 transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteId(null)}
                      className="text-xs px-2 py-1 rounded bg-dark-900 text-gray-400
                                 hover:text-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteId(task.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity
                               text-gray-600 hover:text-red-400"
                    title="Delete task"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Empty state */}
          {filteredTasks.length === 0 && (
            <div className="text-center py-16">
              <ListTodo className="w-12 h-12 mx-auto mb-4 text-gray-700" />
              {tasks.length === 0 ? (
                <>
                  <p className="text-gray-400 text-lg font-medium">No tasks yet</p>
                  <p className="text-gray-600 text-sm mt-1">
                    Add your first task above to get started
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-400 text-lg font-medium">No tasks match filters</p>
                  <p className="text-gray-600 text-sm mt-1">
                    Try changing your filter or sort options
                  </p>
                  <button
                    onClick={() => {
                      setStatusFilter('all');
                      setPriorityFilter('all');
                      setCategoryFilter('all');
                    }}
                    className="mt-4 text-sm text-primary-500 hover:text-primary-400
                               transition-colors"
                  >
                    Clear all filters
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
