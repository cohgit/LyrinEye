'use client'

import { useState, useEffect } from 'react'
import { getRecordings, Recording } from '@/lib/api'
import { Play, Calendar, Video } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface RecordingListProps {
    deviceId: string
}

export default function RecordingList({ deviceId }: RecordingListProps) {
    const [recordings, setRecordings] = useState<Recording[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchRecordings()
    }, [deviceId])

    const fetchRecordings = async () => {
        setLoading(true)
        const data = await getRecordings(deviceId)
        setRecordings(data)
        setLoading(false)
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 bg-slate-800/50 rounded-xl">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        )
    }

    if (recordings.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 bg-slate-800/30 rounded-xl border border-slate-700/50">
                <div className="p-4 bg-slate-800 rounded-full mb-4">
                    <Video className="w-8 h-8 text-slate-500" />
                </div>
                <p className="text-slate-400 font-medium">No hay grabaciones disponibles</p>
                <p className="text-sm text-slate-500 mt-1">Las grabaciones aparecerán aquí cuando se generen</p>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recordings.map((rec) => (
                <a
                    key={rec.url}
                    href={rec.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-video bg-slate-900 rounded-xl overflow-hidden border border-slate-700 hover:border-indigo-500 transition-all hover:shadow-lg hover:shadow-indigo-500/10"
                >
                    {/* Thumbnail */}
                    {rec.thumbnailUrl ? (
                        <img
                            src={rec.thumbnailUrl}
                            alt="Recording thumbnail"
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-800">
                            <Video className="w-12 h-12 text-slate-600" />
                        </div>
                    )}

                    {/* Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-100 group-hover:opacity-90 transition-opacity" />

                    {/* Play Button */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform scale-75 group-hover:scale-100">
                        <div className="w-12 h-12 bg-indigo-500 rounded-full flex items-center justify-center shadow-lg text-white">
                            <Play className="w-5 h-5 ml-1" />
                        </div>
                    </div>

                    {/* Info */}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-300">
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3 h-3" />
                                <span>
                                    {format(new Date(rec.timestamp), "d MMM, HH:mm", { locale: es })}
                                </span>
                            </div>
                            {rec.duration && (
                                <span className="bg-black/50 px-1.5 py-0.5 rounded text-[10px] font-mono border border-white/10">
                                    {rec.duration.toFixed(1)}s
                                </span>
                            )}
                        </div>
                    </div>
                </a>
            ))}
        </div>
    )
}
