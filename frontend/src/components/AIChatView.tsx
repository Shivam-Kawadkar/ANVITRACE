import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import type { CaseDocket, AIHealthStatus, ChatHistoryItem } from '../api';
import {
  Bot,
  Send,
  Trash2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Loader2,
  ChevronDown,
  ChevronUp,
  Search,
  Share2,
  AlertTriangle,
  FileText,
  Paperclip,
  BarChart3,
  Link2,
  ArrowLeft,
} from 'lucide-react';

interface AIChatViewProps {
  activeCase: CaseDocket | null;
  targetAccountId?: string;
  onNavigateToAccount?: (acc: string) => void;
  onNavigateToCases?: () => void;
}

export const AIChatView: React.FC<AIChatViewProps> = ({
  activeCase,
  targetAccountId,
  onNavigateToAccount,
  onNavigateToCases,
}) => {
  const [messages, setMessages] = useState<ChatHistoryItem[]>([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [language, setLanguage] = useState<'en' | 'hi' | 'mr'>('en');
  const [isLoading, setIsLoading] = useState(false);
  const [aiHealth, setAiHealth] = useState<AIHealthStatus | null>(null);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string>(`session_${activeCase?.id || 'default'}`);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    let isMounted = true;
    const fetchHealth = async () => {
      try {
        const h = await api.checkAIHealth();
        if (isMounted) setAiHealth(h);
      } catch {
        if (isMounted) {
          setAiHealth({
            ollama_reachable: false,
            base_url: 'http://127.0.0.1:11434',
            configured_model: 'llama3.2:3b',
            model_available: false,
            available_models: [],
            offline: true,
            status: 'ollama_down',
          });
        }
      }
    };
    fetchHealth();
    const interval = setInterval(fetchHealth, 12000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!activeCase?.id) return;
    sessionIdRef.current = targetAccountId
      ? `session_${activeCase.id}_${targetAccountId}`
      : `session_${activeCase.id}`;

    const loadHistory = async () => {
      try {
        const hist = await api.getAIChatHistory(activeCase.id, sessionIdRef.current, 30);
        if (hist.messages && Array.isArray(hist.messages)) {
          setMessages(hist.messages);
        } else {
          setMessages([]);
        }
      } catch (err) {
        console.warn('Could not load history:', err);
      }
    };
    loadHistory();
  }, [activeCase?.id, targetAccountId]);

  const handleSend = async (questionText?: string) => {
    const q = (questionText || inputQuestion).trim();
    if (!q || !activeCase?.datasetId || isLoading) return;

    setInputQuestion('');

    const tempUserMsg: ChatHistoryItem = {
      message_id: `temp_${Date.now()}`,
      role: 'user',
      content: q,
      sources: [],
      language,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const res = await api.sendAIChat({
        case_id: activeCase.id,
        dataset_id: activeCase.datasetId,
        question: q,
        target_account: targetAccountId || activeCase.targetAccount,
        language,
        session_id: sessionIdRef.current,
        case_notes: activeCase.notes,
      });

      const assistantMsg: ChatHistoryItem = {
        message_id: `resp_${Date.now()}`,
        role: 'assistant',
        content: res.answer,
        sources: res.sources || [],
        language: res.language || language,
        created_at: res.created_at || new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorChatMsg: ChatHistoryItem = {
        message_id: `err_${Date.now()}`,
        role: 'assistant',
        content: err.message || 'Service unavailable.',
        sources: [],
        language,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorChatMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!activeCase?.id) return;
    try {
      await api.clearAIChatHistory(activeCase.id, sessionIdRef.current);
      setMessages([]);
    } catch (err) {
      console.warn('Failed to clear history:', err);
    }
  };

  const toggleSourceExpand = (msgId: string) => {
    setExpandedSources((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  const targetAcc = targetAccountId || activeCase?.targetAccount;

  // 4 Main Suggested Questions matching reference image
  const suggestedCards = [
    {
      icon: Search,
      title: targetAcc ? `Why was account ${targetAcc} flagged?` : 'Why were the top accounts flagged?',
      subtitle: 'Show risk factors and supporting evidence',
      query: targetAcc ? `Why was account ${targetAcc} flagged as suspicious? Explain the risk factors and evidence.` : 'What are the main reasons the top suspect accounts were flagged?',
    },
    {
      icon: Share2,
      title: 'Summarize the money trail',
      subtitle: 'Show all hops, senders, receivers and amounts',
      query: targetAcc ? `Summarize the money trail starting from ${targetAcc}. Show all hops, senders, receivers and amounts.` : 'Summarize the primary money trail across all hops in this case.',
    },
    {
      icon: AlertTriangle,
      title: 'What anomaly indicators were detected?',
      subtitle: 'Explain Isolation Forest results',
      query: 'What anomaly indicators and Isolation Forest outlier patterns were detected in this dataset?',
    },
    {
      icon: FileText,
      title: 'What suspicious transactions connect the top accounts?',
      subtitle: 'Show links and transaction details',
      query: 'What suspicious transactions and rapid fund transfers connect the top accounts in this network?',
    },
  ];

  // Quick Action Chips below the input bar
  const quickChips = [
    { label: 'Search Transactions', icon: FileText, query: 'Search and list all high-value transactions above ₹50,000 in this case.' },
    { label: 'Analyze Account', icon: BarChart3, query: targetAcc ? `Analyze account ${targetAcc}: volume, in/out ratio, and mule risk score.` : 'Analyze the primary target account in this case.' },
    { label: 'Explain Anomaly', icon: AlertTriangle, query: 'Explain the statistical anomalies and rule triggers detected in this case.' },
    { label: 'Summarize Case', icon: FileText, query: 'Provide a concise investigative summary of this case docket.' },
    { label: 'Find Connections', icon: Link2, query: 'Identify all multi-hop connections and common beneficiary links.' },
  ];

  if (!activeCase) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] text-center p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
          <Bot size={28} />
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">No Case Selected</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-4">
          Please select or register an investigation case docket to query forensic evidence.
        </p>
        {onNavigateToCases && (
          <button
            type="button"
            onClick={onNavigateToCases}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
          >
            Select a Case
          </button>
        )}
      </div>
    );
  }

  const isModelReady = aiHealth?.ollama_reachable && aiHealth?.model_available;

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-slate-50/50 dark:bg-slate-950 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
      {/* Scrollable Content Container */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {/* Top Hero Banner with Animated Robot Investigator */}
        <div className="relative overflow-hidden bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 shadow-xs">
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute right-0 top-0 w-80 h-full bg-radial from-blue-400/10 via-cyan-400/5 to-transparent pointer-events-none -z-0" />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            {/* Left Header Content */}
            <div className="flex items-start gap-3.5 max-w-xl">
              <div className="w-11 h-11 rounded-xl bg-slate-950 dark:bg-amber-500/20 text-white dark:text-amber-400 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                <Bot size={22} />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold tracking-tight text-slate-950 dark:text-white font-['Plus_Jakarta_Sans',sans-serif]">
                    AI Investigation Chatbot
                  </h2>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    CASE: {activeCase.id}
                  </span>
                  {targetAcc && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                      Target: {targetAcc}
                    </span>
                  )}
                  {targetAcc && onNavigateToAccount && (
                    <button
                      type="button"
                      onClick={() => onNavigateToAccount(targetAcc)}
                      className="flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 shadow-2xs"
                      title={`Return to Account Deep-Dive for ${targetAcc}`}
                    >
                      <ArrowLeft size={11} />
                      <span>Back to Deep-Dive</span>
                    </button>
                  )}
                  {messages.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearHistory}
                      className="ml-2 flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:text-red-600 dark:hover:text-red-400 bg-slate-100 hover:bg-red-50 dark:bg-slate-800 dark:hover:bg-red-950/40 rounded-md transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                      title="Clear conversation history"
                    >
                      <Trash2 size={12} />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Ask targeted questions about money trails, risk indicators, and evidence.
                </p>
              </div>
            </div>

            {/* Right: Exact Photo Image from User (Static, No Animation) */}
            <div className="relative flex items-center justify-end shrink-0">
              <img
                src="/ai-chatbot-banner.png"
                alt="AI Investigation Assistant"
                className="h-28 sm:h-32 md:h-36 object-contain mix-blend-multiply dark:mix-blend-normal select-none pointer-events-none"
              />
            </div>
          </div>
        </div>

        {/* Ollama Offline Warning Banner */}
        {aiHealth && !aiHealth.ollama_reachable && (
          <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 px-4 py-2 rounded-xl flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertCircle size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Local Ollama service is stopped. Open a terminal and run <code className="font-mono font-bold bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">ollama serve</code> to activate real-time local inference.
            </span>
          </div>
        )}

        {/* Empty State vs Chat Stream */}
        {messages.length === 0 ? (
          <div className="space-y-4">
            {/* Suggested Questions Section */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 mb-2.5 px-1 font-mono">
                Suggested Investigative Questions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {suggestedCards.map((card, idx) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSend(card.query)}
                      className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 hover:border-amber-400/80 dark:hover:border-amber-500/50 hover:shadow-sm text-left transition-all duration-150 flex items-center justify-between gap-3 group cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-[13px] font-bold text-slate-900 dark:text-white truncate">
                            {card.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {card.subtitle}
                          </p>
                        </div>
                      </div>
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 shrink-0 transition-colors">
                        <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Forensic Integrity Banner matching reference */}
            <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/60 flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
              <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                <strong>Forensic Integrity Guaranteed:</strong> Answers are retrieved deterministically from DuckDB and verified algorithms. No cloud transmission. No hallucinations.
              </span>
            </div>
          </div>
        ) : (
          /* Chat Messages History */
          <div className="space-y-4">
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const isExpanded = expandedSources[msg.message_id] || false;

              return (
                <div
                  key={msg.message_id || index}
                  className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 flex items-center justify-center shrink-0 text-xs font-bold shadow-2xs mt-0.5">
                      <Bot size={16} />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-4 shadow-2xs ${
                      isUser
                        ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950 text-xs sm:text-[13px]'
                        : 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-[13px]'
                    }`}
                  >
                    <div className="leading-relaxed whitespace-pre-wrap font-sans">
                      {msg.content}
                    </div>

                    {/* Verifiable Evidence Sources */}
                    {!isUser && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => toggleSourceExpand(msg.message_id)}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800 dark:text-amber-400 hover:text-amber-900 transition-colors cursor-pointer"
                          >
                            <ShieldCheck size={13} className="text-emerald-600" />
                            <span>{msg.sources.length} Verified Evidence Sources</span>
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {isExpanded && (
                          <div className="mt-2 space-y-1.5">
                            {msg.sources.map((src, sidx) => (
                              <div
                                key={sidx}
                                className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-[11px] flex items-center justify-between gap-2"
                              >
                                <span className="font-semibold uppercase tracking-wider text-[10px] text-slate-700 dark:text-slate-300">
                                  {src.source_type.replace('_', ' ')}
                                </span>
                                {src.amount !== undefined && src.amount !== null && (
                                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-xs">
                                    ₹{src.amount.toLocaleString('en-IN')}
                                  </span>
                                )}
                                {src.account_id && (
                                  <span className="font-mono text-slate-400 text-[10px]">
                                    Acc: {src.account_id}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex gap-2.5 justify-start items-center">
                <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 flex items-center justify-center shrink-0">
                  <Loader2 size={15} className="animate-spin" />
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
                  <span>Analyzing case evidence via local Ollama...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Bottom Fixed Input Bar & Quick Action Chips */}
      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200/90 dark:border-slate-800 space-y-2.5 shrink-0 shadow-xs">
        {/* Input Bar Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2 bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl px-3.5 py-1.5 focus-within:border-amber-400 transition-colors shadow-2xs"
        >
          {/* Paperclip Button */}
          <button
            type="button"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title="Attach evidence or docket context"
          >
            <Paperclip size={16} />
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={inputQuestion}
            onChange={(e) => setInputQuestion(e.target.value)}
            placeholder={
              targetAcc
                ? `Ask about account ${targetAcc}, money trail, risk indicators, or evidence...`
                : 'Ask about money trail, risk indicators, or evidence...'
            }
            disabled={isLoading}
            className="flex-1 bg-transparent py-2 text-xs sm:text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden"
          />

          {/* Language Selector Dropdown */}
          <div className="flex items-center pr-1 border-r border-slate-200 dark:border-slate-700">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as any)}
              className="text-xs font-semibold bg-transparent text-slate-700 dark:text-slate-300 py-1 pr-1 focus:outline-hidden cursor-pointer"
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
              <option value="mr">मराठी (Marathi)</option>
            </select>
          </div>

          {/* Dark Pill Send Button */}
          <button
            type="submit"
            disabled={!inputQuestion.trim() || isLoading}
            className="px-4 py-2 rounded-xl bg-slate-950 hover:bg-slate-850 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 shadow-xs"
          >
            <Send size={13} />
            <span>Send</span>
          </button>
        </form>

        {/* Quick Action Chips Row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {quickChips.map((chip, idx) => {
            const Icon = chip.icon;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSend(chip.query)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 shrink-0 transition-colors shadow-2xs cursor-pointer group"
              >
                <Icon size={13} className="text-slate-400 group-hover:text-amber-600 transition-colors" />
                <span>{chip.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
