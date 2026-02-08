import React, { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../stores/chat';
import { api } from '../api/client';

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, isLoading, addMessage, setLoading } = useChatStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput('');
    addMessage({ role: 'user', content: text });
    setLoading(true);
    try {
      const res = await api.chat(text);
      addMessage({ role: 'assistant', content: res.message, agent: res.agent });
    } catch (err: any) {
      addMessage({ role: 'assistant', content: `Error: ${err.message}` });
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && <div className="text-center text-gray-500 mt-20"><p className="text-4xl mb-4">ClawdAgent</p><p>Send a message to start chatting with ClawdAgent</p></div>}
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-2xl p-3 rounded-lg ${m.role === 'user' ? 'bg-primary-600' : 'bg-dark-800'}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.agent && <p className="text-xs text-gray-400 mt-1">Agent: {m.agent}</p>}
            </div>
          </div>
        ))}
        {isLoading && <div className="flex justify-start"><div className="bg-dark-800 p-3 rounded-lg"><p className="animate-pulse">Thinking...</p></div></div>}
        <div ref={bottomRef} />
      </div>
      <div className="p-4 border-t border-gray-800">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Type a message..." className="flex-1 p-3 rounded bg-dark-800 border border-gray-700 text-white" />
          <button onClick={send} disabled={isLoading} className="px-6 py-3 bg-primary-600 rounded font-bold hover:bg-primary-700 disabled:opacity-50">Send</button>
        </div>
      </div>
    </div>
  );
}
