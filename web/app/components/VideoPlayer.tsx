'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Play, Pause, Maximize, Volume2, VolumeX } from 'lucide-react'

interface VideoPlayerProps {
    videoUrl: string
    onClose: () => void
    title?: string
}

export default function VideoPlayer({ videoUrl, onClose, title }: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [isMuted, setIsMuted] = useState(false)
    const [progress, setProgress] = useState(0)

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleEscape)
        return () => window.removeEventListener('keydown', handleEscape)
    }, [onClose])

    const togglePlay = () => {
        if (!videoRef.current) return
        if (isPlaying) {
            videoRef.current.pause()
        } else {
            videoRef.current.play()
        }
        setIsPlaying(!isPlaying)
    }

    const toggleMute = () => {
        if (!videoRef.current) return
        videoRef.current.muted = !isMuted
        setIsMuted(!isMuted)
    }

    const toggleFullscreen = () => {
        if (!videoRef.current) return
        if (document.fullscreenElement) {
            document.exitFullscreen()
        } else {
            videoRef.current.requestFullscreen()
        }
    }

    const handleTimeUpdate = () => {
        if (!videoRef.current) return
        const progress = (videoRef.current.currentTime / videoRef.current.duration) * 100
        setProgress(progress)
    }

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!videoRef.current) return
        const rect = e.currentTarget.getBoundingClientRect()
        const x = e.clientX - rect.left
        const percentage = x / rect.width
        videoRef.current.currentTime = percentage * videoRef.current.duration
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-5xl mx-4"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
                    {title && <h3 className="text-white font-medium">{title}</h3>}
                    <button
                        onClick={onClose}
                        className="ml-auto p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                    >
                        <X className="w-5 h-5 text-white" />
                    </button>
                </div>

                {/* Video */}
                <video
                    ref={videoRef}
                    src={videoUrl}
                    className="w-full rounded-lg"
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => setIsPlaying(false)}
                    autoPlay
                />

                {/* Controls */}
                <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/80 to-transparent">
                    {/* Progress Bar */}
                    <div
                        className="w-full h-1 bg-white/20 rounded-full mb-4 cursor-pointer"
                        onClick={handleSeek}
                    >
                        <div
                            className="h-full bg-indigo-500 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                        />
                    </div>

                    {/* Control Buttons */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <button
                                onClick={togglePlay}
                                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                            >
                                {isPlaying ? (
                                    <Pause className="w-5 h-5 text-white" />
                                ) : (
                                    <Play className="w-5 h-5 text-white" />
                                )}
                            </button>
                            <button
                                onClick={toggleMute}
                                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                            >
                                {isMuted ? (
                                    <VolumeX className="w-5 h-5 text-white" />
                                ) : (
                                    <Volume2 className="w-5 h-5 text-white" />
                                )}
                            </button>
                        </div>
                        <button
                            onClick={toggleFullscreen}
                            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                        >
                            <Maximize className="w-5 h-5 text-white" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
