"use client"

import { useState, useEffect } from "react"
import { getTelemetryStats } from "@/lib/api"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts"
import { format } from "date-fns"
import { es } from "date-fns/locale"

interface DeviceChartsProps {
    deviceId: string
}

type TimeRange = '1h' | '12h' | '24h' | '7d' | '30d'

const RANGES: { label: string, value: TimeRange, granularity: '1m' | '1h' | '1d' }[] = [
    { label: '1h', value: '1h', granularity: '1m' },
    { label: '12h', value: '12h', granularity: '1m' },
    { label: '24h', value: '24h', granularity: '1h' },
    { label: '7d', value: '7d', granularity: '1d' },
    { label: '30d', value: '30d', granularity: '1d' }
]

export default function DeviceCharts({ deviceId }: DeviceChartsProps) {
    const [range, setRange] = useState<TimeRange>('1h')
    const [data, setData] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            try {
                const end = new Date().toISOString()
                const start = new Date()

                switch (range) {
                    case '1h': start.setHours(start.getHours() - 1); break;
                    case '12h': start.setHours(start.getHours() - 12); break;
                    case '24h': start.setHours(start.getHours() - 24); break;
                    case '7d': start.setDate(start.getDate() - 7); break;
                    case '30d': start.setDate(start.getDate() - 30); break;
                }

                const granularity = RANGES.find(r => r.value === range)?.granularity || '1h'
                const stats = await getTelemetryStats(deviceId, start.toISOString(), end, granularity)
                setData(stats)
            } catch (error) {
                console.error("Failed to load charts:", error)
            } finally {
                setLoading(false)
            }
        }

        fetchData()
        const interval = setInterval(fetchData, 60000) // Refresh every minute
        return () => clearInterval(interval)
    }, [deviceId, range])

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        if (range === '1h' || range === '12h') return format(date, 'HH:mm')
        if (range === '24h') return format(date, 'HH:mm')
        return format(date, 'd MMM')
    }

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-slate-900/90 border border-slate-700 p-3 rounded-lg shadow-xl backdrop-blur-md">
                    <p className="text-slate-300 text-xs mb-2">{format(new Date(label), "d MMM, HH:mm", { locale: es })}</p>
                    {payload.map((p: any) => (
                        <p key={p.name} className="text-sm font-medium" style={{ color: p.color }}>
                            {p.name}: {p.value.toFixed(1)}{p.unit}
                        </p>
                    ))}
                </div>
            )
        }
        return null
    }

    return (
        <div className="space-y-6">
            <div className="flex gap-2 p-1 bg-slate-800/50 rounded-lg w-fit border border-slate-700">
                {RANGES.map((r) => (
                    <button
                        key={r.value}
                        onClick={() => setRange(r.value)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${range === r.value
                            ? 'bg-indigo-500 text-white shadow-lg'
                            : 'text-slate-400 hover:text-white hover:bg-slate-700'
                            }`}
                    >
                        {r.label}
                    </button>
                ))}
            </div>

            {loading && data.length === 0 ? (
                <div className="h-64 flex items-center justify-center border border-slate-800 rounded-xl bg-slate-900/50">
                    <div className="flex items-center gap-3 text-slate-500">
                        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm">Cargando datos...</span>
                    </div>
                </div>
            ) : data.length === 0 ? (
                <div className="h-64 flex items-center justify-center border border-slate-800 rounded-xl bg-slate-900/50 text-slate-500 text-sm">
                    No hay datos disponibles para este periodo
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* CPU & RAM Chart */}
                    <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm">
                        <h3 className="text-sm font-medium text-slate-300 mb-6 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            Rendimiento (CPU / RAM)
                        </h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data}>
                                    <defs>
                                        <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                    <XAxis
                                        dataKey="timestamp"
                                        tickFormatter={formatDate}
                                        stroke="#64748b"
                                        tick={{ fontSize: 10 }}
                                        tickMargin={10}
                                    />
                                    <YAxis
                                        stroke="#64748b"
                                        tick={{ fontSize: 10 }}
                                        domain={[0, 100]}
                                        unit="%"
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="cpu"
                                        name="CPU"
                                        stroke="#818cf8"
                                        fillOpacity={1}
                                        fill="url(#colorCpu)"
                                        unit="%"
                                        strokeWidth={2}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="ram"
                                        name="RAM"
                                        stroke="#34d399"
                                        fillOpacity={1}
                                        fill="url(#colorRam)"
                                        unit="%"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Battery Chart */}
                    <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6 backdrop-blur-sm">
                        <h3 className="text-sm font-medium text-slate-300 mb-6 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            Nivel de Batería
                        </h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data}>
                                    <defs>
                                        <linearGradient id="colorBattery" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                    <XAxis
                                        dataKey="timestamp"
                                        tickFormatter={formatDate}
                                        stroke="#64748b"
                                        tick={{ fontSize: 10 }}
                                        tickMargin={10}
                                    />
                                    <YAxis
                                        stroke="#64748b"
                                        tick={{ fontSize: 10 }}
                                        domain={[0, 100]}
                                        unit="%"
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="battery"
                                        name="Batería"
                                        stroke="#ec4899"
                                        fillOpacity={1}
                                        fill="url(#colorBattery)"
                                        unit="%"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
