'use client'

import { useState, useEffect } from 'react'
import { getLogStats } from '@/lib/api'
import {
    format,
    startOfMonth,
    endOfMonth,
    eachDayOfInterval,
    isSameDay,
    addMonths,
    subMonths,
    startOfDay,
    endOfDay,
    eachHourOfInterval,
    addDays,
    subDays,
    startOfHour,
    endOfHour,
    eachMinuteOfInterval,
    addHours,
    subHours,
    parseISO
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Video, Calendar, Clock, ArrowLeft } from 'lucide-react'

interface CalendarViewProps {
    deviceId: string
}

type ViewMode = 'month' | 'day' | 'hour'

interface LogStat {
    Timestamp: string
    Count: number
}

export default function CalendarView({ deviceId }: CalendarViewProps) {
    const [viewMode, setViewMode] = useState<ViewMode>('month')
    const [currentDate, setCurrentDate] = useState(new Date())
    const [stats, setStats] = useState<LogStat[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        fetchStats()
    }, [currentDate, viewMode, deviceId])

    const fetchStats = async () => {
        setLoading(true)
        let start, end, granularity: '1d' | '1h' | '1m'

        if (viewMode === 'month') {
            start = startOfMonth(currentDate).toISOString()
            end = endOfMonth(currentDate).toISOString()
            granularity = '1d'
        } else if (viewMode === 'day') {
            start = startOfDay(currentDate).toISOString()
            end = endOfDay(currentDate).toISOString()
            granularity = '1h'
        } else {
            start = startOfHour(currentDate).toISOString()
            end = endOfHour(currentDate).toISOString()
            granularity = '1m'
        }

        const data = await getLogStats(deviceId, start, end, granularity)
        setStats(data)
        setLoading(false)
    }

    const navigation = {
        prev: () => {
            if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1))
            else if (viewMode === 'day') setCurrentDate(subDays(currentDate, 1))
            else setCurrentDate(subHours(currentDate, 1))
        },
        next: () => {
            if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1))
            else if (viewMode === 'day') setCurrentDate(addDays(currentDate, 1))
            else setCurrentDate(addHours(currentDate, 1))
        },
        up: () => {
            if (viewMode === 'hour') setViewMode('day')
            else if (viewMode === 'day') setViewMode('month')
        }
    }

    const getCountForDate = (date: Date) => {
        // Backend returns ISO string in Timestamp
        // For '1d', check if same day
        // For '1h', check if same hour
        // For '1m', check if same minute

        const stat = stats.find(s => {
            const statDate = parseISO(s.Timestamp)
            if (viewMode === 'month') return isSameDay(date, statDate)
            if (viewMode === 'day') return statDate.getHours() === date.getHours()
            if (viewMode === 'hour') return statDate.getMinutes() === date.getMinutes()
            return false
        })
        return stat ? stat.Count : 0
    }

    // --- Render Functions ---

    const renderHeader = () => {
        let title = ''
        if (viewMode === 'month') title = format(currentDate, 'MMMM yyyy', { locale: es })
        else if (viewMode === 'day') title = format(currentDate, "d 'de' MMMM, yyyy", { locale: es })
        else title = format(currentDate, "d MMM, HH:mm", { locale: es })

        return (
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    {viewMode !== 'month' && (
                        <button
                            onClick={navigation.up}
                            className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}
                    <h2 className="text-xl font-semibold capitalize text-white flex items-center gap-2">
                        {viewMode === 'month' && <Calendar className="w-5 h-5 text-indigo-400" />}
                        {viewMode === 'day' && <Calendar className="w-5 h-5 text-indigo-400" />}
                        {viewMode === 'hour' && <Clock className="w-5 h-5 text-indigo-400" />}
                        {title}
                    </h2>
                </div>
                <div className="flex items-center bg-slate-800 rounded-lg p-1">
                    <button onClick={navigation.prev} className="p-2 hover:bg-slate-700 rounded-md transition-colors">
                        <ChevronLeft className="w-5 h-5 text-slate-300" />
                    </button>
                    <button onClick={navigation.next} className="p-2 hover:bg-slate-700 rounded-md transition-colors">
                        <ChevronRight className="w-5 h-5 text-slate-300" />
                    </button>
                </div>
            </div>
        )
    }

    const renderMonthView = () => {
        const days = eachDayOfInterval({
            start: startOfMonth(currentDate),
            end: endOfMonth(currentDate)
        })

        return (
            <div className="grid grid-cols-7 gap-4">
                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                    <div key={d} className="text-center text-sm font-medium text-slate-500 py-2">
                        {d}
                    </div>
                ))}
                {Array.from({ length: (days[0].getDay() + 6) % 7 }).map((_, i) => (
                    <div key={`empty-${i}`} />
                ))}
                {days.map(day => {
                    const count = getCountForDate(day)
                    return (
                        <button
                            key={day.toISOString()}
                            onClick={() => {
                                setCurrentDate(day)
                                setViewMode('day')
                            }}
                            className={`
                                aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all
                                ${loading ? 'opacity-50 cursor-wait' : 'hover:scale-105'}
                                ${count > 0 ? 'bg-indigo-500/10 border border-indigo-500/30 hover:border-indigo-500/60' : 'bg-slate-800/50 border border-slate-800 hover:bg-slate-800'}
                            `}
                        >
                            <span className={`text-sm font-medium ${count > 0 ? 'text-indigo-400' : 'text-slate-400'}`}>
                                {format(day, 'd')}
                            </span>
                            {count > 0 && (
                                <div className="flex items-center gap-1">
                                    <Video className="w-3 h-3 text-indigo-400" />
                                    <span className="text-[10px] text-indigo-300">{count > 99 ? '99+' : count}</span>
                                </div>
                            )}
                        </button>
                    )
                })}
            </div>
        )
    }

    const renderDayView = () => {
        const hours = eachHourOfInterval({
            start: startOfDay(currentDate),
            end: endOfDay(currentDate)
        })

        return (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-3">
                {hours.map(hour => {
                    const count = getCountForDate(hour)
                    // Heatmap intensity
                    let bgClass = 'bg-slate-800/50 border-slate-800'
                    if (count > 0) bgClass = 'bg-indigo-900/40 border-indigo-500/30'
                    if (count > 50) bgClass = 'bg-indigo-600/40 border-indigo-500/50'
                    if (count > 200) bgClass = 'bg-indigo-500/60 border-indigo-400/60'

                    return (
                        <button
                            key={hour.toISOString()}
                            onClick={() => {
                                setCurrentDate(hour)
                                setViewMode('hour')
                            }}
                            className={`
                                aspect-square rounded-lg flex flex-col items-center justify-center transition-all border
                                ${bgClass} hover:border-indigo-400
                            `}
                        >
                            <span className="text-xs text-slate-400 mb-1">{format(hour, 'HH:00')}</span>
                            {count > 0 && (
                                <span className="text-xs font-bold text-white shadow-sm">{count}</span>
                            )}
                        </button>
                    )
                })}
            </div>
        )
    }

    const renderHourView = () => {
        const minutes = eachMinuteOfInterval({
            start: startOfHour(currentDate),
            end: endOfHour(currentDate)
        })

        return (
            <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-[repeat(15,minmax(0,1fr))] gap-2">
                {minutes.map(minute => {
                    const count = getCountForDate(minute)
                    return (
                        <div
                            key={minute.toISOString()}
                            className={`
                                aspect-square rounded flex items-center justify-center transition-all
                                ${count > 0 ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)] scale-110 z-10' : 'bg-slate-800/30'}
                            `}
                            title={`${format(minute, 'HH:mm')} - ${count} logs`}
                        >
                            {count > 0 && <Video className="w-3 h-3 text-white" />}
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-800/60 shadow-xl backdrop-blur-sm">
            {renderHeader()}

            <div className="min-h-[400px]">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-20 backdrop-blur-[1px] rounded-2xl">
                        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}

                {viewMode === 'month' && renderMonthView()}
                {viewMode === 'day' && renderDayView()}
                {viewMode === 'hour' && renderHourView()}
            </div>
        </div>
    )
}
