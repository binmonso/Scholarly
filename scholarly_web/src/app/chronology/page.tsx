'use client';

import React, { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { Calendar, MessageSquare, Clock, Edit2, Trash2, Check, X, ChevronDown } from 'lucide-react';

interface ChatSession {
  id: number;
  paper_id: number;
  paper_title: string;
  title: string;
  summary?: string;
  updated_at: string;
}

export default function ChronologyPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'alphabetical'>('recent');
  
  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const fetchSessions = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/chats/');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (error) {
      console.error('Failed to fetch chat sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this chat session? This will also delete the associated paper.")) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/chats/${id}/`, { method: 'DELETE' });
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== id));
      } else {
        console.error('Failed to delete session:', await res.text());
        alert('Failed to delete chat session. Please ensure your backend is running the latest code.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error while deleting chat session.');
    }
  };

  const handleRenameSubmit = async (id: number) => {
    if (!editTitle.trim()) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/chats/${id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle })
      });
      if (res.ok) {
        setSessions(prev => prev.map(s => s.id === id ? { ...s, title: editTitle } : s));
        setEditingId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const sortedSessions = [...sessions].sort((a, b) => {
    if (sortBy === 'recent') {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    } else if (sortBy === 'oldest') {
      return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
    } else {
      return a.title.localeCompare(b.title);
    }
  });

  return (
    <div className="flex min-h-screen w-full relative overflow-hidden bg-transparent">
      {/* Background Elements — Midnight Gold */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#78350f] rounded-full mix-blend-color-dodge filter blur-[180px] opacity-20 pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#F59E0B] rounded-full mix-blend-color-dodge filter blur-[200px] opacity-10 pointer-events-none"></div>

      <Sidebar />

      <main className="flex-1 flex flex-col pt-4 pr-4 pb-4 md:pl-0 pl-4 h-screen max-w-7xl mx-auto z-10 w-full overflow-y-auto custom-scrollbar">
        <header className="mb-8 mt-4 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center glass-panel p-8 rounded-2xl mx-2">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-xl">
               <Calendar className="w-8 h-8 text-[#F59E0B]" />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-md">
                Chronology
              </h1>
              <p className="text-gray-300 mt-1">
                Review your past conversations and research queries.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 relative z-20">
            <span className="text-sm text-gray-400">Sort by:</span>
            <div className="relative">
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as any)}
                className="appearance-none bg-black/40 border border-white/10 rounded-xl pl-4 pr-10 py-2 text-white text-sm outline-none focus:border-[#F59E0B]/50 cursor-pointer"
              >
                <option value="recent">Most Recent</option>
                <option value="oldest">Date (Oldest)</option>
                <option value="alphabetical">Alphabetical</option>
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </header>

        <section className="px-2">
          {loading ? (
             <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F59E0B]"></div>
             </div>
          ) : sessions.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-4 border border-dashed border-white/20">
              <MessageSquare className="w-16 h-16 text-gray-500 mb-2" />
              <h3 className="text-xl font-semibold text-white">No chat history</h3>
              <p className="text-gray-400 max-w-md">Start asking questions about your uploaded documents to see your history here.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 pb-8">
              {sortedSessions.map((session) => (
                <div key={session.id} className="glass-panel p-6 rounded-2xl flex flex-col gap-3 hover:bg-white/10 transition-all border border-white/10 group">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="p-3 bg-white/5 rounded-xl border border-white/10 shrink-0 mt-1">
                        <MessageSquare className="w-5 h-5 text-[#F59E0B]" />
                      </div>
                      <div className="flex-1">
                        {editingId === session.id ? (
                          <div className="flex items-center gap-2 mb-2">
                            <input 
                              type="text" 
                              value={editTitle} 
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="bg-black/30 border border-[#F59E0B]/50 rounded-lg px-3 py-1.5 text-white text-sm outline-none flex-1 max-w-md"
                              autoFocus 
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameSubmit(session.id);
                                else if (e.key === 'Escape') setEditingId(null);
                              }}
                            />
                            <button onClick={() => handleRenameSubmit(session.id)} className="p-1.5 bg-amber-500/20 text-[#F59E0B] rounded-md hover:bg-amber-500/30"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1.5 bg-red-500/20 text-red-400 rounded-md hover:bg-red-500/30"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <h3 className="text-white font-medium text-lg mb-1">{session.title}</h3>
                        )}
                        <p className="text-sm text-gray-400 flex items-center gap-2 mb-2">
                          <span className="text-[#F59E0B] bg-amber-500/10 px-2 py-0.5 rounded-md text-xs">{session.paper_title}</span>
                          <span className="flex items-center gap-1 opacity-70"><Clock className="w-3.5 h-3.5" />{new Date(session.updated_at).toLocaleDateString()}</span>
                        </p>
                        {session.summary && (
                          <div className="bg-black/20 rounded-xl p-3 text-sm text-gray-300 border border-white/5 leading-relaxed relative">
                            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#F59E0B] to-[#78350f] rounded-l-xl"></div>
                            {session.summary}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => { setEditingId(session.id); setEditTitle(session.title); }}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        title="Rename Chat"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(session.id)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete Chat"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
