'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import UploadZone from '@/components/UploadZone';
import ChatArea from '@/components/ChatArea';
import ConceptMap from '@/components/ConceptMap';

import { usePaperContext } from '@/context/PaperContext';

export default function Home() {
  const { papers, activePaperId, setActivePaperId, refreshPapers, activeSessionId, setActiveSessionId, refreshSessions, prefetchConceptMap } = usePaperContext();
  const [isMapView, setIsMapView] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const handleUploadSuccess = async (paperId: number, name: string) => {
    await refreshPapers();
    setActivePaperId(paperId); // Automatically select newly uploaded paper
    setActiveSessionId(null); // start new session
    setIsUploadOpen(false); // Close upload modal after success
  };
  
  const handleSessionCreated = async (sessionId: number) => {
    setActiveSessionId(sessionId);
    await refreshSessions();
  };

  // ── Background prefetch: start generating concept map as soon as chat loads ──
  useEffect(() => {
    if (activePaperId && !isMapView) {
      // Trigger background generation while user is in Chat View
      prefetchConceptMap(activePaperId);
    }
  }, [activePaperId, isMapView, prefetchConceptMap]);

  const activePaperName = papers.find(p => p.id === activePaperId)?.name || null;

  return (
    <div className="flex h-screen w-full relative bg-transparent" style={{ overflow: 'clip' }}>
      
      {/* Abstract Background Elements — Midnight Gold */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#78350f] rounded-full mix-blend-color-dodge filter blur-[180px] opacity-20 pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#F59E0B] rounded-full mix-blend-color-dodge filter blur-[200px] opacity-10 pointer-events-none"></div>

      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col pt-4 pr-4 pb-4 md:pl-0 pl-4 h-full overflow-y-auto overflow-x-hidden max-w-7xl mx-auto z-10 w-full relative">
        
        {/* Header Section */}
        <header className="mb-6 flex flex-col gap-2">
          <div className="flex justify-between items-start w-full gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">
                Paper Analysis
              </h1>
            </div>
            
            <div className="flex bg-white/5 backdrop-blur-md p-1 rounded-xl border border-white/10 shrink-0">
              <button 
                onClick={() => setIsMapView(false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${!isMapView ? 'bg-amber-500/20 text-[#F59E0B] shadow border border-amber-500/30' : 'text-gray-400 hover:text-white border border-transparent'}`}
              >
                Chat View
              </button>
              <button 
                onClick={() => setIsMapView(true)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${isMapView ? 'bg-amber-500/20 text-[#F59E0B] shadow border border-amber-500/30' : 'text-gray-400 hover:text-white border border-transparent'}`}
              >
                Map View
              </button>
            </div>
          </div>
        </header>

        {/* Upload FAB */}
        <button
          onClick={() => setIsUploadOpen(true)}
          className="fixed bottom-8 right-8 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 shadow-[0_0_20px_rgba(245,158,11,0.5)] flex items-center justify-center hover:scale-105 transition-transform backdrop-blur-md border border-white/20"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
        </button>

        {isUploadOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-3xl">
              <button 
                onClick={() => setIsUploadOpen(false)}
                className="absolute -top-10 right-0 text-white hover:text-amber-400"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
              <UploadZone onUploadSuccess={handleUploadSuccess} />
            </div>
          </div>
        )}

        {/* Bottom Section: Chat Area or Concept Map */}
        <section className="flex-1 w-full min-h-0 bg-transparent rounded-2xl overflow-hidden shadow-xl flex flex-col relative translate-z-0">
          {isMapView ? (
            <ConceptMap activePaperId={activePaperId} />
          ) : (
            <ChatArea 
              activePaperId={activePaperId} 
              activeSessionId={activeSessionId}
              activePaperName={activePaperName} 
              onSessionCreated={handleSessionCreated}
            />
          )}
        </section>

      </main>
    </div>
  );
}
