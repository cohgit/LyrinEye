'use client';

import { useState, useEffect, useRef } from 'react';
import { Terminal, Search, Trash2, Play, RefreshCw, Filter } from 'lucide-react';

interface LogEntry {
    LogTimestamp: string;
    priority: string;
    tag: string;
    message: string;
    DeviceName: string;
}

interface LogViewerProps {
    deviceId: string;
}

export default function LogViewer({ deviceId }: LogViewerProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [duration, setDuration] = useState(15);
    const [sessionInfo, setSessionInfo] = useState<{ expiresAt: string; remainingMinutes: number } | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const checkSession = async () => {
        try {
            const response = await fetch(`/api/proxy/api/devices/${deviceId}/session`);
            if (response.ok) {
                const data = await response.json();
                setSessionInfo(data.expiresAt ? data : null);
            }
        } catch (error) {
            console.error('Failed to check session:', error);
        }
    };

    const fetchLogs = async (isManual = false) => {
        if (isLoading && !isManual) return;
        setIsLoading(true);
        try {
            const q = query ? `| where message contains "${query}" or tag contains "${query}"` : '';
            const response = await fetch(`/api/proxy/api/devices/${deviceId}/logs?query=${encodeURIComponent(q)}&timespan=PT1H`);
            if (response.ok) {
                const data = await response.json();
                setLogs(data);
            }
        } catch (error) {
            console.error('Failed to fetch logs:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const requestFreshLogs = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/proxy/api/devices/${deviceId}/commands`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: 'request_logcat', durationMinutes: duration }),
            });
            if (response.ok) {
                checkSession();
                // Wait a bit for the device to send logs and for Azure to ingest them
                setTimeout(() => fetchLogs(true), 5000);
            } else {
                const err = await response.json();
                alert(err.message || err.error || 'Error al iniciar sesión de logcat');
            }
        } catch (error) {
            console.error('Failed to request logs:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
        checkSession();
        let logInterval: any;
        if (autoRefresh) {
            logInterval = setInterval(fetchLogs, 10000);
        }
        const sessionInterval = setInterval(checkSession, 30000);
        return () => {
            clearInterval(logInterval);
            clearInterval(sessionInterval);
        };
    }, [deviceId, autoRefresh]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const getPriorityColor = (p: string) => {
        switch (p) {
            case 'E': return 'text-red-400';
            case 'W': return 'text-yellow-400';
            case 'D': return 'text-blue-400';
            case 'V': return 'text-gray-400';
            default: return 'text-green-400';
        }
    };

    return (
        <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden flex flex-col h-[600px] shadow-2xl">
            {/* Toolbar */}
            <div className="bg-slate-800 p-3 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Terminal size={18} className="text-indigo-400" />
                    <h3 className="text-slate-100 font-semibold text-sm">Logcat Explorer</h3>
                    <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded uppercase tracking-wider">KQL Ready</span>
                </div>

                <div className="flex items-center gap-2 flex-grow max-w-md">
                    <div className="relative flex-grow">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input
                            type="text"
                            placeholder="Filter logs (e.g. message contains 'Error')..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-1.5 pl-9 pr-3 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-600 transition-all"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchLogs(true)}
                        />
                    </div>
                    <button
                        onClick={() => fetchLogs(true)}
                        className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200 transition-colors"
                        title="Execute Query"
                    >
                        <Play size={14} />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={duration}
                        onChange={(e) => setDuration(parseInt(e.target.value))}
                        className="bg-slate-700 border border-slate-600 rounded-lg py-1 px-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                        title="Duración de la sesión"
                    >
                        <option value={15}>15 min</option>
                        <option value={30}>30 min</option>
                        <option value={60}>1 hora</option>
                        <option value={1440}>1 día</option>
                    </select>

                    <button
                        onClick={requestFreshLogs}
                        disabled={isLoading}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isLoading ? 'bg-indigo-900/30 text-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                            }`}
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                        Solicitar Logcat
                    </button>

                    <div className="h-6 w-[1px] bg-slate-700 mx-1"></div>

                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`p-1.5 rounded-lg transition-colors ${autoRefresh ? 'bg-green-900/40 text-green-400' : 'bg-slate-700 text-slate-400 hover:text-slate-200'}`}
                        title={autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
                    >
                        <RefreshCw size={16} />
                    </button>

                    <button
                        onClick={() => setLogs([])}
                        className="p-1.5 bg-slate-700 hover:bg-red-900/40 hover:text-red-400 rounded-lg text-slate-400 transition-colors"
                        title="Clear View"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            {/* Terminal Area */}
            <div
                ref={scrollRef}
                className="flex-grow overflow-y-auto p-4 font-mono text-[11px] leading-relaxed bg-[#0a0c10]"
            >
                {logs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3">
                        <Filter size={40} className="opacity-20" />
                        <p className="text-sm italic">No hay logs disponibles para mostrar</p>
                        <button
                            onClick={requestFreshLogs}
                            className="text-xs text-indigo-400 hover:underline"
                        >
                            Iniciar captura ahora
                        </button>
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {logs.map((log, i) => (
                            <div key={i} className="flex gap-3 py-0.5 hover:bg-slate-800/30 rounded px-1 group transition-colors">
                                <span className="text-slate-500 w-32 shrink-0">
                                    {new Date(log.LogTimestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                                </span>
                                <span className={`w-4 font-bold shrink-0 ${getPriorityColor(log.priority || 'I')}`}>
                                    {log.priority || 'I'}
                                </span>
                                <span className="text-indigo-400/80 w-32 shrink-0 truncate font-semibold" title={log.tag}>
                                    {log.tag}:
                                </span>
                                <span className="text-slate-300 break-all group-hover:text-white transition-colors">
                                    {log.message}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Status Bar */}
            <div className="bg-slate-800 px-4 py-1.5 border-t border-slate-700 flex items-center justify-between text-[10px] text-slate-500">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${sessionInfo ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-slate-500'}`}></span>
                        {sessionInfo ? `Activo (${sessionInfo.remainingMinutes}m rest)` : 'Inactivo'}
                    </span>
                    <span className="h-3 w-[1px] bg-slate-700"></span>
                    <span>{logs.length} entradas cargadas</span>
                </div>
                <div>
                    Azure Log Analytics • lyrineye-law
                </div>
            </div>
        </div>
    );
}
