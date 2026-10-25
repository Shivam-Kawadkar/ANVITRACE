import React from 'react';
import {
  FolderArchive,
  ScanSearch,
  FileCheck2,
  Cpu,
  LogOut,
  PanelLeftClose,
  Lock,
  Bot,
  Sparkles,
} from 'lucide-react';
import type { OfficerProfile } from './AuthModal';

export type ActiveTab =
  | 'overview'
  | 'cases'
  | 'investigate'
  | 'documents'
  | 'ai-chat'
  | 'ai-summarizer'
  | 'dataset-status';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  hasCases?: boolean;
  backendOnline?: boolean;
  officer?: OfficerProfile | null;
  onLogout?: () => void;
  isOpen?: boolean;
  onToggleSidebar?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  hasCases = false,
  officer,
  onLogout,
  isOpen = true,
  onToggleSidebar,
}) => {
  const navItems = [
    {
      id: 'cases' as const,
      label: 'Cases & Evidence',
      icon: FolderArchive,
      description: 'Dockets & evidence datasets',
    },
    {
      id: 'investigate' as const,
      label: 'Account Deep-Dive',
      icon: ScanSearch,
      description: 'Money trail & risk scoring',
    },
    {
      id: 'documents' as const,
      label: 'Legal Documents',
      icon: FileCheck2,
      description: 'Freeze notices & case diaries',
    },
    {
      id: 'ai-chat' as const,
      label: 'AI Chatbot',
      icon: Bot,
      description: 'Evidence-grounded offline Q&A',
    },
    {
      id: 'ai-summarizer' as const,
      label: 'Case Summarizer',
      icon: Sparkles,
      description: 'Structured investigation summaries',
    },
  ];

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md z-50 flex flex-col justify-between border-r border-slate-200 dark:border-slate-800 shadow-[2px_0_12px_rgba(15,23,42,0.03)] select-none transition-all duration-300 ease-in-out ${
        isOpen
          ? 'w-72 translate-x-0'
          : 'w-16 -translate-x-full lg:translate-x-0'
      }`}
    >
      {isOpen ? (
        /* EXPANDED SIDEBAR */
        <div className="flex flex-col flex-1 min-h-0">
          {/* Brand Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#0f172a]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 p-1 flex items-center justify-center shadow-xs shrink-0 overflow-hidden">
                  <img src="/anvitrace-icon.png" alt="ANVITRACE Logo" className="w-full h-full object-contain" />
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-base tracking-tight text-slate-950 dark:text-white font-['Plus_Jakarta_Sans',sans-serif]">
                      ANVITRACE
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
                    Cyber Forensics &amp; Financial Lineage
                  </span>
                </div>
              </div>

              {onToggleSidebar && (
                <button
                  type="button"
                  onClick={onToggleSidebar}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  title="Collapse sidebar (Ctrl+B)"
                  aria-label="Collapse sidebar"
                  id="sidebar-collapse-btn"
                >
                  <PanelLeftClose size={18} />
                </button>
              )}
            </div>
          </div>

          {/* Navigation Section */}
          <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              const isDeepDiveOnly = item.id === 'ai-chat' || item.id === 'ai-summarizer';
              const isLocked = (!hasCases && (item.id === 'investigate' || item.id === 'documents')) || (isDeepDiveOnly && !isActive);

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (isLocked) return;
                    setActiveTab(item.id);
                  }}
                  disabled={isLocked}
                  title={
                    isDeepDiveOnly
                      ? 'Launch via Account Deep-Dive for a specific Account ID'
                      : isLocked
                      ? 'Register a case docket first to unlock this module'
                      : item.description
                  }
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all duration-150 ${
                    isLocked
                      ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-600 hover:bg-transparent'
                      : isActive
                      ? 'bg-slate-900 dark:bg-amber-500/15 text-white dark:text-amber-300 font-medium shadow-sm dark:border dark:border-amber-500/30 cursor-pointer'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/80 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isLocked
                          ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-400 dark:text-slate-600'
                          : isActive
                          ? 'bg-slate-800 dark:bg-amber-400/20 text-slate-100 dark:text-amber-300'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <Icon size={17} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-[13px] font-semibold tracking-tight leading-tight">
                        {item.label}
                      </span>
                      <span
                        className={`text-[11px] truncate leading-tight mt-0.5 ${
                          isLocked
                            ? 'text-slate-400 dark:text-slate-600'
                            : isActive
                            ? 'text-slate-400 dark:text-amber-400/80'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {isDeepDiveOnly && isLocked ? 'Launch via Account Deep-Dive' : item.description}
                      </span>
                    </div>
                  </div>

                  {isLocked && (
                    <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                      <Lock size={10} />
                      <span>{isDeepDiveOnly ? 'Deep-Dive' : 'Locked'}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Bottom Officer Session & Sign Out */}
          <div className="p-3.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/80 flex items-center justify-between gap-2">
            {officer ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-[10px] shrink-0 ${officer.themeColor}`}
                >
                  {officer.initials}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate leading-tight">
                    {officer.name.split(' ')[0]} {officer.name.split(' ')[1]}
                  </span>
                  <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400 leading-tight">
                    #{officer.badge}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Session Active</div>
            )}

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800 text-xs font-semibold transition-all cursor-pointer shadow-2xs group shrink-0"
                title="Log out and return to landing page"
                id="sidebar-logout-button"
              >
                <LogOut size={13} className="text-slate-400 dark:text-slate-400 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" />
                <span>Log Out</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* MINIMAL COLLAPSED SIDEBAR (when hamburger is closed) */
        <div className="flex flex-col justify-between h-full py-4 items-center w-full">
          <div className="flex flex-col items-center w-full">
            {/* Top Logo Icon */}
            <button
              type="button"
              onClick={onToggleSidebar}
              className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 p-1.5 flex items-center justify-center shadow-xs hover:border-amber-400 transition-colors cursor-pointer"
              title="Expand navigation sidebar"
            >
              <img src="/anvitrace-icon.png" alt="ANVITRACE" className="w-full h-full object-contain" />
            </button>

            {/* Minimal Nav Icons positioned matching open sidebar */}
            <nav className="flex flex-col items-center gap-2.5 w-full px-2 mt-5">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;
                const isDeepDiveOnly = item.id === 'ai-chat' || item.id === 'ai-summarizer';
                const isLocked = (!hasCases && (item.id === 'investigate' || item.id === 'documents')) || (isDeepDiveOnly && !isActive);

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (isLocked) return;
                      setActiveTab(item.id);
                    }}
                    disabled={isLocked}
                    title={
                      isDeepDiveOnly
                        ? `${item.label} (Launch via Account Deep-Dive)`
                        : isLocked
                        ? `${item.label} (Requires active case)`
                        : item.label
                    }
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative ${
                      isLocked
                        ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-600'
                        : isActive
                        ? 'bg-slate-900 dark:bg-amber-500/20 text-white dark:text-amber-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer'
                    }`}
                  >
                    <Icon size={18} />
                    {isLocked && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-2xs">
                        <Lock size={8} />
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Minimal Bottom: Officer & Logout */}
          <div className="flex flex-col items-center gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 w-full px-2">
            {officer && (
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-[10px] shadow-2xs ${officer.themeColor}`}
                title={`${officer.name} (#${officer.badge})`}
              >
                {officer.initials}
              </div>
            )}

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800 transition-colors cursor-pointer group"
                title="Log Out"
                id="sidebar-minimal-logout-button"
              >
                <LogOut size={16} className="text-slate-500 dark:text-slate-400 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" />
              </button>
            )}
          </div>
        </div>

      )}
    </aside>
  );
};

