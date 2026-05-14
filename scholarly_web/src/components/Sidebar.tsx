import React, { useState } from 'react';
import { BookOpen, Map, Calendar, Settings, ChevronDown, FileText, MessageSquare, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePaperContext } from '@/context/PaperContext';

const Sidebar = () => {
  const pathname = usePathname();
  const { papers, sessions, activePaperId, activeSessionId, setActivePaperId, setActiveSessionId } = usePaperContext();
  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <div className={`glass-panel ${isCollapsed ? 'w-20' : 'w-64'} h-full flex flex-col justify-between p-4 m-4 hidden md:flex sticky top-4 transition-all duration-300`} style={{ height: 'calc(100vh - 32px)' }}>
      <div className="flex-1 overflow-y-auto custom-scrollbar overflow-x-hidden pr-1">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} mb-10`}>
          {!isCollapsed && (
            <div className="flex items-center gap-3 pl-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#F59E0B] to-[#FBBF24] flex items-center justify-center shadow-lg">
                <BookOpen className="text-black w-4 h-4" />
              </div>
              <span className="text-xl font-bold tracking-wide">Scholarly</span>
            </div>
          )}
          <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-2 hover:bg-white/10 rounded-lg text-gray-300 transition-colors">
            <Menu className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-2">
          <Link href="/" className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl transition-colors font-medium border ${pathname === '/' ? 'bg-amber-500/10 text-white border-amber-500/20' : 'hover:bg-white/5 text-gray-300 border-transparent'}`} title="Dashboard">
            <Map className={`w-5 h-5 ${pathname === '/' ? 'text-[#F59E0B]' : ''}`} />
            {!isCollapsed && "Dashboard"}
          </Link>
          <Link href="/library" className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl transition-colors font-medium border ${pathname === '/library' ? 'bg-amber-500/10 text-white border-amber-500/20' : 'hover:bg-white/5 text-gray-300 border-transparent'}`} title="Library">
            <BookOpen className={`w-5 h-5 ${pathname === '/library' ? 'text-[#F59E0B]' : ''}`} />
            {!isCollapsed && "Library"}
          </Link>
          <Link href="/chronology" className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl transition-colors font-medium border ${pathname === '/chronology' ? 'bg-amber-500/10 text-white border-amber-500/20' : 'hover:bg-white/5 text-gray-300 border-transparent'}`} title="Chronology">
            <Calendar className={`w-5 h-5 ${pathname === '/chronology' ? 'text-[#F59E0B]' : ''}`} />
            {!isCollapsed && "Chronology"}
          </Link>
          <Link href="/settings" className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl transition-colors font-medium border ${pathname === '/settings' ? 'bg-amber-500/10 text-white border-amber-500/20' : 'hover:bg-white/5 text-gray-300 border-transparent'}`} title="Settings">
            <Settings className={`w-5 h-5 ${pathname === '/settings' ? 'text-[#F59E0B]' : ''}`} />
            {!isCollapsed && "Settings"}
          </Link>
        </nav>

        <div className="mt-8">
          {!isCollapsed && <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3 px-4">Recent Chats</h3>}
          {sessions.length === 0 ? (
            !isCollapsed && <p className="text-xs text-gray-500 px-4 italic">No recent chats.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {sessions.map((session) => (
                <li 
                  key={`session-${session.id}`}
                  onClick={() => {
                    setActiveSessionId(session.id);
                    setActivePaperId(session.paper_id);
                  }}
                  className={`py-2 rounded-lg text-sm cursor-pointer truncate transition-colors flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-4 gap-3'} ${
                    activeSessionId === session.id
                      ? 'bg-amber-500/10 text-[#F59E0B] border border-amber-500/20 font-medium'
                      : 'text-gray-300 hover:bg-white/5 border border-transparent'
                  }`}
                  title={session.title}
                >
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${activeSessionId === session.id ? 'bg-amber-500/20' : 'bg-white/5'}`}>
                    <MessageSquare className={`w-4 h-4 ${activeSessionId === session.id ? 'text-[#F59E0B]' : 'text-gray-400'}`} />
                  </div>
                  {!isCollapsed && (
                    <div className="flex flex-col overflow-hidden leading-tight">
                      <span className="truncate text-sm">{session.title}</span>
                      <span className="text-[10px] text-gray-500 truncate mt-0.5 max-w-[140px] block">{session.paper_title}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8">
          {!isCollapsed && <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3 px-4">Papers</h3>}
          {papers.length === 0 ? (
            !isCollapsed && <p className="text-xs text-gray-500 px-4 italic">No papers uploaded yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {papers.map((paper) => (
                <li 
                  key={`paper-${paper.id}`}
                  onClick={() => {
                    setActivePaperId(paper.id);
                    setActiveSessionId(null);
                  }}
                  className={`py-2 rounded-lg text-sm cursor-pointer truncate transition-colors flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-4 gap-2'} ${
                    activePaperId === paper.id && !activeSessionId
                      ? 'bg-amber-500/10 text-[#F59E0B] border border-amber-500/20 font-medium'
                      : 'text-gray-300 hover:bg-white/5'
                  }`}
                  title={paper.name}
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{paper.name}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={`flex items-center mt-4 pt-6 border-t border-white/10 cursor-pointer hover:bg-white/5 rounded-xl p-2 transition-colors shrink-0 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-3 relative">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#F59E0B] to-[#D4AF37] border-2 border-white/20 flex-shrink-0"></div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold">User Elham</span>
              <span className="text-xs text-gray-400">Researcher</span>
            </div>
          )}
        </div>
        {!isCollapsed && <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>
    </div>
  );
};

export default Sidebar;
