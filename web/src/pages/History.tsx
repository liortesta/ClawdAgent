import React from 'react';
import { Clock, MessageSquare } from 'lucide-react';

export default function History() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Clock className="w-7 h-7 text-primary-500" />
        <h1 className="text-2xl font-bold">Conversation History</h1>
      </div>
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg">No conversations saved yet</p>
        <p className="text-sm mt-1">Chat history will appear here once memory persistence is enabled</p>
      </div>
    </div>
  );
}
