import React, { useState } from 'react';
import {
  Check,
  ArrowRight,
  X,
  User,
} from 'lucide-react';

export interface OfficerProfile {
  id: string;
  name: string;
  badge: string;
  role: string;
  department: string;
  agency: string;
  pin: string;
  clearance: string;
  initials: string;
  themeColor: string;
}

export const DUMMY_OFFICERS: OfficerProfile[] = [
  {
    id: 'off_01',
    name: 'Vikram Sharma',
    badge: 'CY-8842',
    role: 'Cyber Forensics',
    department: 'Cyber Crime Division',
    agency: 'State Cyber Cell',
    pin: '8842',
    clearance: 'Level 3',
    initials: 'VS',
    themeColor: 'bg-slate-900 text-amber-400',
  },
  {
    id: 'off_02',
    name: 'Rajesh Kulkarni',
    badge: 'FIU-2091',
    role: 'Financial Intelligence',
    department: 'Mule Tracking Wing',
    agency: 'FIU',
    pin: '2091',
    clearance: 'Level 4',
    initials: 'RK',
    themeColor: 'bg-slate-900 text-blue-400',
  },
  {
    id: 'off_03',
    name: 'Priya Menon',
    badge: 'FAS-5134',
    role: 'AML Forensics',
    department: 'AML Lab',
    agency: 'Forensic Sciences',
    pin: '5134',
    clearance: 'Level 2',
    initials: 'PM',
    themeColor: 'bg-slate-900 text-emerald-400',
  },
];

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticate: (officer: OfficerProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticate,
}) => {
  const [mode, setMode] = useState<'select' | 'custom'>('select');
  const [selectedOfficer, setSelectedOfficer] = useState<OfficerProfile>(DUMMY_OFFICERS[0]);
  const [customName, setCustomName] = useState('');
  const [customBadge, setCustomBadge] = useState('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = () => {
    setIsVerifying(true);
    setTimeout(() => {
      setIsVerifying(false);
      if (mode === 'custom' && customName.trim()) {
        const initials = customName
          .trim()
          .split(' ')
          .map((n) => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase() || 'IN';
        onAuthenticate({
          id: `off_${Date.now()}`,
          name: customName.trim(),
          badge: customBadge.trim() || 'INV-01',
          role: 'Investigator',
          department: 'Cyber Forensics',
          agency: 'State Cyber Cell',
          pin: '0000',
          clearance: 'Level 3',
          initials,
          themeColor: 'bg-slate-900 text-amber-400',
        });
      } else {
        onAuthenticate(selectedOfficer);
      }
    }, 200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-5 text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1.5 flex items-center justify-center shadow-xs shrink-0 overflow-hidden">
              <img src="/anvitrace-icon.png" alt="ANVITRACE Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm tracking-tight text-slate-950 dark:text-white font-['Plus_Jakarta_Sans',sans-serif]">
                  ANVITRACE
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Cyber Forensics &amp; Financial Audit
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Minimal Mode Toggle */}
        <div className="flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 mb-3 text-xs">
          <button
            type="button"
            onClick={() => setMode('select')}
            className={`flex-1 py-1 rounded-md font-medium transition-all cursor-pointer ${
              mode === 'select'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Quick Select
          </button>
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`flex-1 py-1 rounded-md font-medium transition-all cursor-pointer ${
              mode === 'custom'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-semibold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Custom ID
          </button>
        </div>

        {/* Content */}
        {mode === 'select' ? (
          <div className="space-y-1.5 mb-4">
            {DUMMY_OFFICERS.map((officer) => {
              const isSelected = selectedOfficer.id === officer.id;
              return (
                <button
                  type="button"
                  key={officer.id}
                  onClick={() => setSelectedOfficer(officer)}
                  onDoubleClick={handleSubmit}
                  className={`w-full p-2.5 rounded-xl border text-left transition-all duration-150 flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-200'
                      : 'bg-white dark:bg-slate-800/60 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center font-mono font-bold text-[11px] shrink-0 ${
                        isSelected
                          ? 'bg-slate-800 text-amber-400 dark:bg-amber-400/20 dark:text-amber-300'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {officer.initials}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-semibold truncate leading-tight">
                        {officer.name}
                      </span>
                      <span
                        className={`text-[10px] truncate leading-tight mt-0.5 ${
                          isSelected ? 'text-slate-300 dark:text-amber-300/80' : 'text-slate-400'
                        }`}
                      >
                        {officer.role} • #{officer.badge}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-amber-400 text-slate-950'
                        : 'border border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {isSelected && <Check size={10} strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2.5 mb-4">
            <div>
              <input
                type="text"
                placeholder="Name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-amber-500"
              />
            </div>
            <div>
              <input
                type="text"
                placeholder="Badge / ID"
                value={customBadge}
                onChange={(e) => setCustomBadge(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-amber-500"
              />
            </div>
          </div>
        )}

        {/* Primary Action Button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isVerifying || (mode === 'custom' && !customName.trim())}
          className="w-full h-9 bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          {isVerifying ? (
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight size={13} />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
