'use client';
import { useEffect, useRef, useState } from 'react';
import { MediasoupViewer } from '@/lib/MediasoupViewer';

interface Props {
    deviceId: string;
}

const LEGACY_SIGNALING_URL = 'https://lyrineye-backend.icymoss-5b66c974.eastus.azurecontainerapps.io';
import { io, Socket } from 'socket.io-client';

export default function LiveViewer({ deviceId }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const viewerRef = useRef<MediasoupViewer | null>(null);
    const legacySocketRef = useRef<Socket | null>(null);

    const startStreaming = async () => {
        try {
            setStatus('connecting');
            // 1. Wake up Device via Legacy Signaling
            console.log('📡 Sending Wake-Up signal (Legacy Socket)...');
            const legacySocket = io(LEGACY_SIGNALING_URL);
            legacySocketRef.current = legacySocket;
            legacySocket.emit('join-room', deviceId, 'viewer');

            // 2. Connect Mediasoup
            const viewer = new MediasoupViewer((track) => {
                if (videoRef.current) {
                    console.log('Got track:', track.kind);
                    // Create a new stream or add to existing?
                    // For simplicity, srcObject usually takes a stream.
                    // If we receive audio and video separately, we need to combine them.
                    let stream = videoRef.current.srcObject as MediaStream;
                    if (!stream) {
                        stream = new MediaStream();
                        videoRef.current.srcObject = stream;
                    }
                    stream.addTrack(track);

                    videoRef.current.play().catch(e => console.error("Auto-play failed", e));
                }
            });

            await viewer.connect(deviceId);
            viewerRef.current = viewer;
            setStatus('connected');
        } catch (e) {
            console.error(e);
            setStatus('error');
        }
    };

    const stopStreaming = () => {
        viewerRef.current?.disconnect();
        viewerRef.current = null;

        if (legacySocketRef.current) {
            legacySocketRef.current.disconnect();
            legacySocketRef.current = null;
        }

        setStatus('idle');
        if (videoRef.current) {
            const stream = videoRef.current.srcObject as MediaStream;
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
            videoRef.current.srcObject = null;
        }
    };

    // Cleanup
    useEffect(() => {
        return () => {
            stopStreaming();
        }
    }, []);

    return (
        <div className="border rounded-lg p-4 bg-gray-900 border-gray-700 mb-6">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">Live View</h3>
                    {status === 'connected' && <span className="animate-pulse text-red-500 text-xs">● LIVE</span>}
                </div>
                <div className="space-x-2">
                    {status === 'idle' || status === 'error' ? (
                        <button
                            onClick={startStreaming}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                        >
                            Ver en Vivo
                        </button>
                    ) : (
                        <button
                            onClick={stopStreaming}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                        >
                            Detener
                        </button>
                    )}
                </div>
            </div>

            {status !== 'idle' && (
                <div className="relative aspect-video bg-black rounded overflow-hidden shadow-lg">
                    {status === 'connecting' && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/50">
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                                <span className="text-white text-sm">Conectando con Servidor SFU...</span>
                            </div>
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/80">
                            <span className="text-red-500 font-medium">Error de conexión. Verifica que la app esté transmitiendo.</span>
                        </div>
                    )}
                    <video
                        ref={videoRef}
                        className="w-full h-full object-contain"
                        autoPlay
                        playsInline
                        muted
                        controls
                    />
                </div>
            )}
        </div>
    );
}
