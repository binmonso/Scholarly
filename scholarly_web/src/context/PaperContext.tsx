'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';

export interface Paper {
  id: number;
  name: string;
}

export interface ChatSession {
  id: number;
  paper_id: number;
  paper_title: string;
  title: string;
  summary?: string;
  updated_at: string;
}

interface PaperContextType {
  papers: Paper[];
  sessions: ChatSession[];
  activePaperId: number | null;
  activeSessionId: number | null;
  setActivePaperId: (id: number | null) => void;
  setActiveSessionId: (id: number | null) => void;
  refreshPapers: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  // Concept map prefetch cache
  prefetchedMapData: Record<number, any>;
  prefetchConceptMap: (paperId: number) => void;
  clearPrefetchedMap: (paperId: number) => void;
}

const PaperContext = createContext<PaperContextType | undefined>(undefined);

export const PaperProvider = ({ children }: { children: ReactNode }) => {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activePaperId, setActivePaperId] = useState<number | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  // ── Concept map prefetch cache ──
  const [prefetchedMapData, setPrefetchedMapData] = useState<Record<number, any>>({});
  const prefetchInFlight = useRef<Set<number>>(new Set());
  const prefetchedRef = useRef(prefetchedMapData);
  prefetchedRef.current = prefetchedMapData;

  const prefetchConceptMap = useCallback((paperId: number) => {
    // Use ref to avoid stale closure — don't include prefetchedMapData in deps
    if (prefetchedRef.current[paperId] || prefetchInFlight.current.has(paperId)) return;
    
    prefetchInFlight.current.add(paperId);
    
    fetch(`http://127.0.0.1:8000/api/concept-map/${paperId}/`)
      .then(res => {
        if (!res.ok) throw new Error('Prefetch failed');
        return res.json();
      })
      .then(data => {
        setPrefetchedMapData(prev => ({ ...prev, [paperId]: data }));
      })
      .catch(err => {
        console.warn('Concept map prefetch error:', err);
      })
      .finally(() => {
        prefetchInFlight.current.delete(paperId);
      });
  }, []);

  const clearPrefetchedMap = useCallback((paperId: number) => {
    setPrefetchedMapData(prev => {
      const next = { ...prev };
      delete next[paperId];
      return next;
    });
  }, []);

  const fetchPapers = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/papers/');
      if (res.ok) {
        const data = await res.json();
        setPapers(data);
      }
    } catch (error) {
      console.error('Failed to fetch papers:', error);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/chats/');
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  useEffect(() => {
    fetchPapers();
    fetchSessions();
  }, []);

  return (
    <PaperContext.Provider value={{ 
      papers, 
      sessions, 
      activePaperId, 
      activeSessionId, 
      setActivePaperId, 
      setActiveSessionId, 
      refreshPapers: fetchPapers,
      refreshSessions: fetchSessions,
      prefetchedMapData,
      prefetchConceptMap,
      clearPrefetchedMap,
    }}>
      {children}
    </PaperContext.Provider>
  );
};

export const usePaperContext = () => {
  const context = useContext(PaperContext);
  if (context === undefined) {
    throw new Error('usePaperContext must be used within a PaperProvider');
  }
  return context;
};
