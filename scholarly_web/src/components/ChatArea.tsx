'use client';

import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, Bot, User, FileText, Loader2, AlertCircle } from 'lucide-react';

interface Source {
  page: number;
  content: string;
}

interface Message {
  role: 'user' | 'bot';
  content: string;
  sources?: Source[];
}

interface ChatAreaProps {
  activePaperId: number | null;
  activeSessionId: number | null;
  activePaperName: string | null;
  onSessionCreated: (sessionId: number) => void;
}

const DEFAULT_MESSAGE: Message = { role: 'bot', content: 'Hello! I am your scholarly assistant. Ask me questions about the uploaded paper.' };

const ChatArea = ({ activePaperId, activeSessionId, activePaperName, onSessionCreated }: ChatAreaProps) => {
  const [messages, setMessages] = useState<Message[]>([DEFAULT_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Fetch history when activeSessionId changes
  useEffect(() => {
    if (activeSessionId) {
      setIsLoading(true);
      axios.get(`http://localhost:8000/api/history/${activeSessionId}/`)
        .then(res => {
          if (res.data && res.data.length > 0) {
            setMessages(res.data);
          } else {
            setMessages([DEFAULT_MESSAGE]);
          }
        })
        .catch(err => {
          console.error("Failed to load chat history", err);
          setMessages([DEFAULT_MESSAGE]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setMessages([DEFAULT_MESSAGE]); // new session
    }
  }, [activeSessionId, activePaperId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    if (!activePaperId) {
       setMessages(prev => [...prev, { role: 'bot', content: 'Please upload or select a paper from the sidebar first!' }]);
       return;
    }

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const payload: any = {
        paper_id: activePaperId,
        question: userMessage
      };
      if (activeSessionId) {
        payload.session_id = activeSessionId;
      }

      const response = await axios.post('http://localhost:8000/api/ask/', payload);

      setMessages(prev => [...prev, {
        role: 'bot',
        content: response.data.answer || "No answer provided.",
        sources: response.data.sources || []
      }]);

      if (response.data.session_id && response.data.session_id !== activeSessionId) {
        onSessionCreated(response.data.session_id);
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'bot',
        content: error.response?.data?.error || 'Sorry, I encountered an error communicating with the research API. Please make sure the backend is running.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const isInputDisabled = isLoading || !activePaperId;

  return (
    <div className="glass-panel flex flex-col h-full bg-[#020617]/60 overflow-hidden shadow-2xl relative">
      
      {/* Global Glow effects behind the chat */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#78350f] rounded-full mix-blend-screen filter blur-[128px] opacity-15 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#F59E0B] rounded-full mix-blend-screen filter blur-[128px] opacity-10 pointer-events-none"></div>

      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10 z-10 flex items-center justify-between bg-black/20 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-semibold text-white tracking-wide flex items-center gap-2">
            Research Assistant
            {activePaperName && (
              <span className="text-xs font-normal bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 text-[#F59E0B]">
                {activePaperName}
              </span>
            )}
          </h2>
          <p className="text-sm text-gray-400">Contextual query across uploaded papers</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <div className="w-3 h-3 rounded-full bg-white/20"></div>
          <div className="w-3 h-3 rounded-full bg-white/30"></div>
          <div className="w-3 h-3 rounded-full bg-[#F59E0B]"></div>
        </div>
      </div>

      {/* Warning Banner if no paper is selected */}
      {!activePaperId && (
         <div className="bg-amber-500/15 border-b border-amber-500/25 px-6 py-2 flex items-center gap-3 z-10 backdrop-blur-sm">
            <AlertCircle className="w-4 h-4 text-[#F59E0B]" />
            <p className="text-sm text-[#F59E0B]">Please upload or select a paper to start asking questions.</p>
         </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 z-10 custom-scrollbar">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${
              msg.role === 'user' ? 'bg-gradient-to-br from-[#F59E0B] to-[#b45309]' : 'bg-gradient-to-br from-[#78350f] to-[#0f172a]'
            }`}>
              {msg.role === 'user' ? <User className="text-white w-5 h-5" /> : <Bot className="text-white w-5 h-5" />}
            </div>
            
            <div className={`max-w-[75%] flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-5 py-3 rounded-2xl ${
                msg.role === 'user' 
                  ? 'bg-gradient-to-br from-white/10 to-white/5 text-white border border-white/10 rounded-tr-none shadow-md backdrop-blur-md'
                  : 'bg-black/40 text-gray-200 border border-amber-500/20 rounded-tl-none shadow-md backdrop-blur-md'
              }`}>
                <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
              
              {/* Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="flex flex-col gap-2 w-full mt-2">
                  <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider pl-1">Sources</span>
                  <div className="flex flex-wrap gap-2">
                    {msg.sources.map((src, srcIdx) => (
                      <div key={srcIdx} className="bg-white/5 border border-white/10 px-3 py-2 rounded-lg flex items-start gap-2 max-w-[280px] hover:bg-white/10 transition-colors cursor-default group shadow-sm">
                        <FileText className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" />
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-gray-300">Page {src.page}</span>
                          <span className="text-[10px] text-gray-500 line-clamp-2 leading-tight group-hover:text-gray-400 transition-colors">
                            &quot;{src.content}&quot;
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4 flex-row">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg bg-gradient-to-br from-[#78350f] to-[#0f172a]">
              <Loader2 className="animate-spin text-white w-5 h-5" />
            </div>
            <div className="px-5 py-3 rounded-2xl bg-black/40 text-gray-200 border border-amber-500/20 rounded-tl-none shadow-md flex items-center h-10">
              <span className="flex space-x-1">
                <span className="w-1.5 h-1.5 bg-[#F59E0B] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-[#F59E0B] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-[#F59E0B] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 z-10">
        <form onSubmit={handleSubmit} className="flex gap-2 relative">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={activePaperId ? "Ask about your document..." : "Upload a paper first..."}
            disabled={isInputDisabled}
            className="w-full bg-black/30 border border-white/10 focus:border-[#F59E0B]/50 focus:ring-1 focus:ring-[#F59E0B]/50 rounded-xl px-5 py-4 text-white placeholder-gray-500 outline-none transition-all shadow-inner disabled:opacity-30 disabled:cursor-not-allowed"
          />
          <button 
            type="submit" 
            disabled={isInputDisabled || !input.trim()}
            className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center glass-button-accent text-[#020617] font-bold rounded-lg disabled:opacity-30 disabled:cursor-not-allowed group"
          >
            <Send className={`w-5 h-5 ${(!isInputDisabled && input.trim()) ? 'group-hover:translate-x-0.5 group-hover:-translate-y-0.5' : ''} transition-transform`} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatArea;
