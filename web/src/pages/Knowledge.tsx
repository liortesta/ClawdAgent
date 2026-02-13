import { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';
import {
  Database, Upload, Trash2, Search, Link, Loader2,
  FileText, Globe, Brain, AlertCircle, CheckCircle2,
} from 'lucide-react';

export default function Knowledge() {
  const [stats, setStats] = useState<{ documents: number; chunks: number } | null>(null);
  const [documents, setDocuments] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadData = async () => {
    try {
      const [s, d] = await Promise.all([
        api.ragStats().catch(() => null),
        api.ragDocuments().catch(() => null),
      ]);
      if (s) setStats(s);
      if (d) setDocuments(d.documents);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await api.ragUpload(file);
      setToast({ type: 'success', message: `Ingested "${result.source}" — ${result.chunks} chunks` });
      loadData();
    } catch (err: any) {
      setToast({ type: 'error', message: err.message });
    }
    setUploading(false);
  };

  const handleIngestUrl = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setIngesting(true);
    try {
      const result = await api.ragIngestUrl(url);
      setToast({ type: 'success', message: `Ingested "${result.source}" — ${result.chunks} chunks` });
      setUrlInput('');
      loadData();
    } catch (err: any) {
      setToast({ type: 'error', message: err.message });
    }
    setIngesting(false);
  };

  const handleQuery = async () => {
    if (!query.trim()) return;
    setQuerying(true);
    setQueryResult(null);
    try {
      const result = await api.ragQuery(query);
      setQueryResult(result.answer);
    } catch (err: any) {
      setQueryResult(`Error: ${err.message}`);
    }
    setQuerying(false);
  };

  const handleDelete = async (source: string) => {
    try {
      await api.ragDeleteDocument(source);
      setToast({ type: 'success', message: `Deleted "${source}"` });
      loadData();
    } catch (err: any) {
      setToast({ type: 'error', message: err.message });
    }
  };

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
        {/* Toast notification */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-500/20 border border-green-500/30 text-green-300' : 'bg-red-500/20 border border-red-500/30 text-red-300'
          }`}>
            {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span className="text-sm">{toast.message}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-7 h-7 text-primary-500" />
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="p-5 bg-dark-800 rounded-lg border border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-gray-400">Documents</span>
            </div>
            <p className="text-3xl font-bold text-cyan-400">{stats?.documents ?? 0}</p>
          </div>
          <div className="p-5 bg-dark-800 rounded-lg border border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <span className="text-sm text-gray-400">Knowledge Chunks</span>
            </div>
            <p className="text-3xl font-bold text-purple-400">{stats?.chunks ?? 0}</p>
          </div>
        </div>

        {/* Upload Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Ingest Knowledge</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* File Upload */}
            <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
              <div className="flex items-center gap-2 mb-3">
                <Upload className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium">Upload File</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".txt,.md,.csv,.json,.pdf,.docx,.xlsx,.xls,.ts,.js,.py,.jpg,.jpeg,.png,.gif,.webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full py-3 rounded-lg border-2 border-dashed border-gray-700 hover:border-primary-500 text-gray-400 hover:text-primary-400 transition-colors text-sm disabled:opacity-50"
              >
                {uploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
                  </span>
                ) : (
                  'Click to upload PDF, DOCX, TXT, images...'
                )}
              </button>
            </div>

            {/* URL Ingestion */}
            <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium">Ingest URL</span>
              </div>
              <div className="flex gap-2">
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleIngestUrl()}
                  placeholder="https://example.com/article"
                  className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500"
                />
                <button
                  onClick={handleIngestUrl}
                  disabled={ingesting || !urlInput.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {ingesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Query Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Query Knowledge</h2>
          <div className="p-4 bg-dark-800 rounded-lg border border-gray-800">
            <div className="flex gap-2 mb-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                placeholder="Ask a question about your documents..."
                className="flex-1 px-3 py-2 rounded-lg bg-dark-900 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500"
              />
              <button
                onClick={handleQuery}
                disabled={querying || !query.trim()}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
            {queryResult && (
              <div className="p-3 rounded-lg bg-dark-900 border border-gray-700 text-sm text-gray-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                {queryResult}
              </div>
            )}
          </div>
        </div>

        {/* Documents List */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Documents ({documents.length})</h2>
          {documents.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No documents ingested yet</p>
              <p className="text-sm mt-1">Upload files or ingest URLs to build your knowledge base</p>
            </div>
          ) : (
            <div className="bg-dark-800 rounded-lg border border-gray-800 divide-y divide-gray-800">
              {documents.map((doc) => (
                <div key={doc} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {doc.includes('.') && !doc.includes('/') ? (
                      <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                    ) : (
                      <Globe className="w-4 h-4 text-green-400 shrink-0" />
                    )}
                    <span className="text-sm font-mono truncate">{doc}</span>
                  </div>
                  <button
                    onClick={() => handleDelete(doc)}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-dark-700 rounded-lg transition-colors shrink-0"
                    title="Delete document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
