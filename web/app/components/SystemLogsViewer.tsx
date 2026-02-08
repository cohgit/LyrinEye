'use client';

import { useState, useEffect } from 'react';
import {
    Terminal,
    Search,
    RefreshCw,
    Table,
    Clock,
    ChevronDown,
    ChevronUp,
    Download,
    AlertCircle
} from 'lucide-react';
import { getSystemLogs, getSystemTables } from '@/lib/api';

const TIME_RANGES = [
    { label: 'Última hora', value: 'PT1H' },
    { label: 'Último día', value: 'P1D' },
    { label: 'Última semana', value: 'P7D' },
    { label: 'Último mes', value: 'P30D' },
];

export default function SystemLogsViewer() {
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string>('');
    const [logs, setLogs] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [timespan, setTimespan] = useState('PT1H');
    const [error, setError] = useState<string | null>(null);
    const [expandedRow, setExpandedRow] = useState<number | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        const loadTables = async () => {
            const fetchedTables = await getSystemTables();
            const customTables = fetchedTables.filter(t => t.endsWith('_CL')).sort();
            setTables(customTables);
            if (customTables.length > 0) {
                const initial = customTables.find(t => t.includes('Mobile_Log')) || customTables[0];
                setSelectedTable(initial);
            }
        };
        loadTables();
    }, []);

    useEffect(() => {
        if (selectedTable) {
            fetchLogs();
        }
    }, [selectedTable, timespan]);

    const fetchLogs = async () => {
        setIsLoading(true);
        setError(null);
        try {
            let kql = 'order by TimeGenerated desc | take 200';
            if (query) {
                kql = `where * has "${query}" | ` + kql;
            }

            const data = await getSystemLogs({
                table: selectedTable,
                query: kql,
                timespan
            });
            setLogs(data);
        } catch (err: any) {
            setError('Error al cargar los logs. Verifica la conexión con Azure.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchLogs();
    };

    const downloadCsv = () => {
        if (logs.length === 0) return;
        const headers = Object.keys(logs[0]).join(',');
        const rows = logs.map(log =>
            Object.values(log).map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
        );
        const csvContent = [headers, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `${selectedTable}_${new Date().toISOString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getKeys = () => {
        if (logs.length === 0) return [];
        const keys = Object.keys(logs[0]);
        const priority = ['TimeGenerated', 'LogText_s', 'Message_s', 'message', 'Level_s', 'priority', 'DeviceName_s', 'Type'];
        return [
            ...priority.filter(k => keys.includes(k)),
            ...keys.filter(k => !priority.includes(k))
        ].slice(0, 7);
    };

    return (
        <div className={`bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex flex-col shadow-2xl transition-all duration-300 ${isCollapsed ? 'h-[72px]' : 'h-[700px]'}`}>
            {/* Header / Title Area (Always Visible) */}
            <div
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-5 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center justify-between cursor-pointer hover:bg-slate-800/40 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                        <Terminal size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white tracking-tight">Sistema</h2>
                        <p className="text-xs text-slate-500">Explorador de Log Analytics • Azure Monitor</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {isCollapsed && logs.length > 0 && (
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full border border-indigo-500/20">
                            {logs.length} registros cargados
                        </span>
                    )}
                    {isCollapsed ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronUp size={20} className="text-slate-400" />}
                </div>
            </div>

            {/* Collapsible Content */}
            {!isCollapsed && (
                <>
                    {/* Controls */}
                    <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/30">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-3">
                                {/* Table Select */}
                                <div className="relative group">
                                    <Table className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-indigo-400 transition-colors" size={14} />
                                    <select
                                        value={selectedTable}
                                        onChange={(e) => setSelectedTable(e.target.value)}
                                        className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl py-2 pl-9 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 hover:border-slate-600 transition-all cursor-pointer"
                                    >
                                        {tables.map(t => (
                                            <option key={t} value={t}>{t.replace('_CL', '').replace('LyrinEye_', '')}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={12} />
                                </div>

                                {/* Range Select */}
                                <div className="relative group">
                                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-hover:text-indigo-400 transition-colors" size={14} />
                                    <select
                                        value={timespan}
                                        onChange={(e) => setTimespan(e.target.value)}
                                        className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl py-2 pl-9 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 hover:border-slate-600 transition-all cursor-pointer"
                                    >
                                        {TIME_RANGES.map(r => (
                                            <option key={r.value} value={r.value}>{r.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={12} />
                                </div>

                                <button
                                    onClick={fetchLogs}
                                    disabled={isLoading}
                                    className={`p-2 rounded-xl transition-all ${isLoading
                                        ? 'bg-indigo-900/30 text-indigo-400 animate-pulse'
                                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                                        }`}
                                >
                                    <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                                </button>

                                <button
                                    onClick={downloadCsv}
                                    disabled={logs.length === 0}
                                    className="p-2 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Descargar CSV"
                                >
                                    <Download size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Filter Input */}
                        <form onSubmit={handleSearch} className="mt-4 flex gap-2">
                            <div className="relative flex-grow">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                                <input
                                    type="text"
                                    placeholder="Buscar en logs (ej: 'Error', 'Nokia', 'WiFi')..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl py-2 pl-10 pr-4 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-600 transition-all"
                                />
                            </div>
                            <button
                                type="submit"
                                className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/20"
                            >
                                Filtrar
                            </button>
                        </form>
                    </div>

                    {/* Content Area */}
                    <div className="flex-grow overflow-auto bg-[#0a0c10]">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-full gap-3 text-slate-500">
                                <RefreshCw size={24} className="animate-spin text-indigo-500" />
                                <span>Consultando Azure Log Analytics...</span>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center h-full text-red-400 gap-4 p-10 text-center">
                                <AlertCircle size={48} className="opacity-50" />
                                <div>
                                    <p className="font-bold text-lg">Error de Consulta</p>
                                    <p className="text-sm text-slate-500 max-w-md mt-1">{error}</p>
                                </div>
                                <button onClick={fetchLogs} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-2 rounded-xl text-sm transition-all">
                                    Reintentar
                                </button>
                            </div>
                        ) : logs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-4">
                                <Search size={48} className="opacity-20" />
                                <p className="text-sm italic">No se encontraron registros para el periodo seleccionado</p>
                            </div>
                        ) : (
                            <div className="w-full text-[12px]">
                                {/* Header */}
                                <div className="sticky top-0 bg-slate-900 border-b border-slate-800 z-10 flex px-4 shadow-sm">
                                    <div className="w-10"></div>
                                    {getKeys().map(key => (
                                        <div key={key} className="flex-1 py-3 px-2 font-semibold text-slate-400 uppercase tracking-wider overflow-hidden text-ellipsis whitespace-nowrap">
                                            {key.replace('_s', '').replace('_d', '').replace('_b', '')}
                                        </div>
                                    ))}
                                </div>

                                {/* Rows */}
                                <div className="divide-y divide-slate-800/50">
                                    {logs.map((log, idx) => {
                                        const isExpanded = expandedRow === idx;
                                        return (
                                            <div key={idx} className="group/row">
                                                <div
                                                    onClick={() => setExpandedRow(isExpanded ? null : idx)}
                                                    className="flex items-center px-4 hover:bg-indigo-500/5 transition-colors cursor-pointer"
                                                >
                                                    <div className="w-10 py-3 flex items-center justify-center">
                                                        {isExpanded ? <ChevronUp size={14} className="text-indigo-400" /> : <ChevronDown size={14} className="text-slate-600 group-hover/row:text-slate-400" />}
                                                    </div>
                                                    {getKeys().map(key => {
                                                        const val = log[key];
                                                        const isTime = key === 'TimeGenerated';
                                                        const isLevel = key.toLowerCase().includes('level') || key.toLowerCase().includes('priority');

                                                        return (
                                                            <div key={key} className="flex-1 py-3 px-2 text-slate-300 whitespace-nowrap overflow-hidden text-ellipsis">
                                                                {isTime ? (
                                                                    <span className="text-slate-500 font-mono">
                                                                        {new Date(val).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                                    </span>
                                                                ) : isLevel ? (
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${val === 'ERROR' || val === 'E' ? 'bg-red-900/30 text-red-400' :
                                                                            val === 'WARNING' || val === 'W' ? 'bg-yellow-900/30 text-yellow-500' :
                                                                                'bg-slate-800 text-slate-400'
                                                                        }`}>
                                                                        {val}
                                                                    </span>
                                                                ) : (
                                                                    val === null || val === undefined ? '-' : String(val)
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {isExpanded && (
                                                    <div className="bg-slate-950/80 p-6 px-14 border-y border-slate-800/50">
                                                        <h4 className="text-indigo-400 font-bold mb-4 uppercase tracking-widest text-[10px]">Detalle Completo del Registro</h4>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-8">
                                                            {Object.entries(log).sort().map(([k, v]) => (
                                                                <div key={k} className="flex flex-col gap-1">
                                                                    <span className="text-slate-600 font-semibold">{k}</span>
                                                                    <span className="text-slate-300 break-all font-mono bg-slate-900/50 p-2 rounded-lg border border-slate-800/50">
                                                                        {String(v)}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="bg-slate-900/80 border-t border-slate-800 px-5 py-3 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-4 text-slate-500">
                            <span className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.4)]"></div>
                                En línea
                            </span>
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-700"></span>
                            <span>{logs.length} registros cargados de <strong>{selectedTable}</strong></span>
                        </div>
                        <div className="text-slate-600 italic">
                            Log Engine V2 • {new Date().toLocaleTimeString()}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
