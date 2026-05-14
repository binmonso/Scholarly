'use client';

import React, { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { usePaperContext } from '@/context/PaperContext';
import { BookOpen, FileText, Calendar, Trash2 } from 'lucide-react';

export default function LibraryPage() {
  const { papers, activePaperId, setActivePaperId, refreshPapers, refreshSessions } = usePaperContext();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDeletePaper = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent activating the paper
    if (!confirm("Are you sure you want to delete this paper? This will also wipe its file and all associated chat history forever.")) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/papers/${id}/`, { method: 'DELETE' });
      if (res.ok) {
        if (activePaperId === id) setActivePaperId(null);
        refreshPapers();
        refreshSessions();
      } else {
        console.error('Failed to delete paper:', await res.text());
        alert('Failed to delete paper. Please ensure your backend is running the latest code and it has been restarted.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error while deleting paper.');
    }
  };

  if (!mounted) return null;

  return (
    <div className="flex min-h-screen w-full relative overflow-hidden bg-transparent">
      
      {/* Abstract Background Elements — Midnight Gold */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#78350f] rounded-full mix-blend-color-dodge filter blur-[180px] opacity-20 pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#F59E0B] rounded-full mix-blend-color-dodge filter blur-[200px] opacity-10 pointer-events-none"></div>

      <Sidebar />

      <main className="flex-1 flex flex-col pt-4 pr-4 pb-4 md:pl-0 pl-4 h-screen max-w-7xl mx-auto z-10 w-full overflow-y-auto custom-scrollbar">
        <header className="mb-8 mt-4 flex flex-col gap-2 glass-panel p-8 rounded-2xl mx-2">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-xl">
               <BookOpen className="w-8 h-8 text-[#F59E0B]" />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-md">
                Your Library
              </h1>
              <p className="text-gray-300 mt-1">
                Browse, manage, and revisit your uploaded documents.
              </p>
            </div>
          </div>
        </header>

        <section className="px-2">
          {papers.length === 0 ? (
            <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-4 border border-dashed border-white/20">
              <BookOpen className="w-16 h-16 text-gray-500 mb-2" />
              <h3 className="text-xl font-semibold text-white">Your library is empty</h3>
              <p className="text-gray-400 max-w-md">Upload research papers from the dashboard to see them appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {papers.map((paper) => (
                <div 
                  key={paper.id} 
                  className="glass-panel p-6 rounded-2xl relative group overflow-hidden hover:bg-white/10 transition-all duration-300 border border-white/10 hover:border-white/20 flex flex-col cursor-pointer"
                  onClick={() => setActivePaperId(paper.id)}
                >
                  <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-500/15 rounded-full blur-2xl group-hover:bg-amber-400/25 transition-colors"></div>
                  
                  <div className="flex items-start justify-between mb-4 relative z-10">
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                      <FileText className="w-6 h-6 text-[#F59E0B]" />
                    </div>
                    <button 
                      onClick={(e) => handleDeletePaper(paper.id, e)}
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete Paper"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="relative z-10 flex-1">
                    <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2" title={paper.name}>
                      {paper.name}
                    </h3>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-gray-400 relative z-10">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{(paper as any).uploaded_at ? new Date((paper as any).uploaded_at).toLocaleDateString() : 'Recently Added'}</span>
                    </div>
                    {activePaperId === paper.id && (
                      <span className="text-[#F59E0B] font-medium bg-amber-500/10 px-2 py-1 rounded-md">Active</span>
                    )}
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
