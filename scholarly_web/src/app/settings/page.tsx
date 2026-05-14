'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { Settings, Save, Key, Cpu } from 'lucide-react';

export default function SettingsPage() {
  const [model, setModel] = useState('flash');
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Load from local storage on mount
    const savedModel = localStorage.getItem('scholarly_model') || 'flash';
    const savedKey = localStorage.getItem('scholarly_api_key') || '';
    setModel(savedModel);
    setApiKey(savedKey);
  }, []);

  const handleSave = () => {
    localStorage.setItem('scholarly_model', model);
    localStorage.setItem('scholarly_api_key', apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex min-h-screen w-full relative overflow-hidden bg-transparent">
      {/* Background Elements — Midnight Gold */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#78350f] rounded-full mix-blend-color-dodge filter blur-[180px] opacity-20 pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#F59E0B] rounded-full mix-blend-color-dodge filter blur-[200px] opacity-10 pointer-events-none"></div>

      <Sidebar />

      <main className="flex-1 flex flex-col pt-4 pr-4 pb-4 md:pl-0 pl-4 h-screen max-w-7xl mx-auto z-10 w-full overflow-y-auto custom-scrollbar">
        <header className="mb-8 mt-4 flex flex-col gap-2 glass-panel p-8 rounded-2xl mx-2">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-xl">
               <Settings className="w-8 h-8 text-[#F59E0B]" />
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-md">
                Settings
              </h1>
              <p className="text-gray-300 mt-1">
                Configure your LLM preferences and API keys.
              </p>
            </div>
          </div>
        </header>

        <section className="px-2 max-w-3xl">
          <div className="glass-panel rounded-2xl p-8 flex flex-col gap-8">
            
            {/* Model Selection */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Cpu className="w-5 h-5 text-[#F59E0B]" />
                <h3 className="text-lg font-semibold text-white">Model Selection</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div 
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${model === 'flash' ? 'bg-amber-500/15 border-[#F59E0B]' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}`}
                  onClick={() => setModel('flash')}
                >
                  <h4 className="text-white font-medium mb-1">Gemini Flash</h4>
                  <p className="text-sm text-gray-400">Fast and efficient for general queries. Recommended for most use cases.</p>
                </div>
                <div 
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${model === 'pro' ? 'bg-amber-500/15 border-[#F59E0B]' : 'border-white/10 hover:border-white/20 hover:bg-white/5'}`}
                  onClick={() => setModel('pro')}
                >
                  <h4 className="text-white font-medium mb-1">Gemini Pro</h4>
                  <p className="text-sm text-gray-400">Advanced reasoning and complex task handling. Slower but more accurate.</p>
                </div>
              </div>
            </div>

            {/* API Key */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Key className="w-5 h-5 text-[#F59E0B]" />
                <h3 className="text-lg font-semibold text-white">API Key</h3>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm text-gray-400">Google Gemini API Key</label>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..." 
                  className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#F59E0B] transition-colors w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Your key is stored securely in your browser&apos;s local storage and is never sent to our servers.</p>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-4">
              {saved && <span className="text-green-400 text-sm">Settings saved successfully!</span>}
              <button 
                onClick={handleSave}
                className="bg-[#F59E0B] hover:bg-[#D4AF37] text-black px-6 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Save Preferences
              </button>
            </div>
            
          </div>
        </section>
      </main>
    </div>
  );
}
