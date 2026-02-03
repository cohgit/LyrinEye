'use client'

import { useState } from 'react'
import { Video, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { sendPushCommand } from '@/lib/api'

interface DeviceActionsProps {
    deviceId: string
    isEnabled?: boolean
}

export default function DeviceActions({ deviceId, isEnabled = true }: DeviceActionsProps) {
    const [loading, setLoading] = useState(false)
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')

    const handleStartRecording = async () => {
        setLoading(true)
        setStatus('idle')
        try {
            await sendPushCommand(deviceId, 'start_recording')
            setStatus('success')
            setTimeout(() => setStatus('idle'), 3000)
        } catch (error) {
            console.error('Failed to start recording:', error)
            setStatus('error')
            setTimeout(() => setStatus('idle'), 3000)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex items-center gap-2">
            <button
                onClick={handleStartRecording}
                disabled={loading || !isEnabled}
                className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
                    ${status === 'success'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                        : status === 'error'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed
                `}
            >
                {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : status === 'success' ? (
                    <CheckCircle className="w-5 h-5" />
                ) : status === 'error' ? (
                    <XCircle className="w-5 h-5" />
                ) : (
                    <Video className="w-5 h-5" />
                )}

                {status === 'success' ? 'Solicitud Enviada' :
                    status === 'error' ? 'Error' :
                        'Iniciar Grabación Remota'}
            </button>
        </div>
    )
}
