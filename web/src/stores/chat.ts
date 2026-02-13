import { create } from 'zustand';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  agent?: string;
  provider?: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

interface SerializedConversation {
  id: string;
  title: string;
  messages: Array<Omit<Message, 'timestamp'> & { timestamp: string }>;
  createdAt: string;
  updatedAt: string;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  loadingConversationId: string | null;

  // Derived
  isLoading: boolean;

  // Actions
  getMessages: () => Message[];
  newConversation: () => string;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  addMessage: (msg: Omit<Message, 'id' | 'timestamp'>) => void;
  addMessageTo: (conversationId: string, msg: Omit<Message, 'id' | 'timestamp'>) => void;
  setLoading: (loading: boolean) => void;
  setConversationLoading: (conversationId: string | null) => void;
  isConversationLoading: (conversationId: string) => boolean;
  clear: () => void;
}

const STORAGE_KEY = 'clawdagent-conversations';

function saveToStorage(conversations: Conversation[]) {
  try {
    const data: SerializedConversation[] = conversations.map(c => ({
      ...c,
      messages: c.messages.map(m => ({ ...m, timestamp: m.timestamp.toISOString() })),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage full or unavailable */ }
}

function loadFromStorage(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: SerializedConversation[] = JSON.parse(raw);
    return data.map(c => ({
      ...c,
      messages: c.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) })),
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
    }));
  } catch {
    return [];
  }
}

function generateTitle(text: string): string {
  // Take first ~40 chars of the first user message as title
  const clean = text.replace(/\n/g, ' ').trim();
  return clean.length > 40 ? clean.slice(0, 40) + '...' : clean;
}

function createConversation(): Conversation {
  return {
    id: crypto.randomUUID(),
    title: 'New Chat',
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function addMessageToConversation(
  conversations: Conversation[],
  conversationId: string,
  msg: Omit<Message, 'id' | 'timestamp'>,
): Conversation[] {
  const newMessage: Message = { ...msg, id: crypto.randomUUID(), timestamp: new Date() };
  return conversations.map(c => {
    if (c.id !== conversationId) return c;
    const messages = [...c.messages, newMessage];
    const title = c.messages.length === 0 && msg.role === 'user'
      ? generateTitle(msg.content)
      : c.title;
    return { ...c, messages, title, updatedAt: new Date() };
  });
}

const initialConversations = loadFromStorage();
const initialActive = initialConversations.length > 0 ? initialConversations[0].id : null;

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: initialConversations,
  activeConversationId: initialActive,
  loadingConversationId: null,
  isLoading: false,

  getMessages: () => {
    const state = get();
    const conv = state.conversations.find(c => c.id === state.activeConversationId);
    return conv?.messages ?? [];
  },

  newConversation: () => {
    const conv = createConversation();
    set(state => {
      const updated = [conv, ...state.conversations];
      saveToStorage(updated);
      return { conversations: updated, activeConversationId: conv.id };
    });
    return conv.id;
  },

  switchConversation: (id) => set(state => {
    // Derive isLoading for the target conversation
    return {
      activeConversationId: id,
      isLoading: state.loadingConversationId === id,
    };
  }),

  deleteConversation: (id) => set(state => {
    const updated = state.conversations.filter(c => c.id !== id);
    saveToStorage(updated);
    const newActive = state.activeConversationId === id
      ? (updated[0]?.id ?? null)
      : state.activeConversationId;
    return { conversations: updated, activeConversationId: newActive };
  }),

  renameConversation: (id, title) => set(state => {
    const updated = state.conversations.map(c =>
      c.id === id ? { ...c, title } : c
    );
    saveToStorage(updated);
    return { conversations: updated };
  }),

  // Add message to active conversation
  addMessage: (msg) => set(state => {
    let { activeConversationId, conversations } = state;

    // Auto-create conversation if none exists
    if (!activeConversationId || !conversations.find(c => c.id === activeConversationId)) {
      const conv = createConversation();
      conversations = [conv, ...conversations];
      activeConversationId = conv.id;
    }

    const updated = addMessageToConversation(conversations, activeConversationId, msg);
    saveToStorage(updated);
    return { conversations: updated, activeConversationId };
  }),

  // Add message to a SPECIFIC conversation (even if not active)
  addMessageTo: (conversationId, msg) => set(state => {
    const updated = addMessageToConversation(state.conversations, conversationId, msg);
    saveToStorage(updated);
    return { conversations: updated };
  }),

  // Set loading for active conversation (backward compat)
  setLoading: (loading) => set(state => ({
    isLoading: loading && state.loadingConversationId === state.activeConversationId,
    loadingConversationId: loading ? (state.loadingConversationId ?? state.activeConversationId) : null,
  })),

  // Set loading for a specific conversation
  setConversationLoading: (conversationId) => set(state => ({
    loadingConversationId: conversationId,
    isLoading: conversationId === state.activeConversationId,
  })),

  isConversationLoading: (conversationId) => {
    return get().loadingConversationId === conversationId;
  },

  clear: () => set(state => {
    const updated = state.conversations.map(c =>
      c.id === state.activeConversationId
        ? { ...c, messages: [], title: 'New Chat', updatedAt: new Date() }
        : c
    );
    saveToStorage(updated);
    return { conversations: updated };
  }),
}));
