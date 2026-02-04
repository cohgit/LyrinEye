'use client'

import { useState } from 'react'
import LogViewer from './LogViewer'
import CalendarView from './CalendarView'
import { Activity, History } from 'lucide-react'

interface DeviceViewsProps {
    deviceId: string
    isLiveEnabled?: boolean
}

export default function DeviceViews({ deviceId, isLiveEnabled = true }: DeviceViewsProps) {
    const [view, setView] = useState<'live' | 'history'>(isLiveEnabled ? 'live' : 'history')

    return (
        <div className="space-y-6">
            {/* Tabs */}
            <div className="flex space-x-4 border-b border-slate-700/50">
                {isLiveEnabled && (
                    <button
                        onClick={() => setView('live')}
                        className={`pb-3 px-2 flex items-center gap-2 text-sm font-medium transition-colors relative ${view === 'live'
                            ? 'text-indigo-400'
                            : 'text-slate-400 hover:text-slate-300'
                            }`}
                    >
                        <Activity className="w-4 h-4" />
                        En Vivo
                        {view === 'live' && (
                            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full" />
                        )}
                    </button>
                )}
                <button
                    onClick={() => setView('history')}
                    className={`pb-3 px-2 flex items-center gap-2 text-sm font-medium transition-colors relative ${view === 'history'
                        ? 'text-indigo-400'
                        : 'text-slate-400 hover:text-slate-300'
                        }`}
                >
                    <History className="w-4 h-4" />
                    Historial
                    {view === 'history' && (
                        <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full" />
                    )}
                </button>
            </div>

            {/* Content */}
            <div className="min-h-[500px]">
                {view === 'live' && <LogViewer deviceId={deviceId} />}
                {view === 'history' && <CalendarView deviceId={deviceId} />}
            </div>
        </div>
    )
}
