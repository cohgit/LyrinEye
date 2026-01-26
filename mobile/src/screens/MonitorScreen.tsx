import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, AppState } from 'react-native';
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices, RTCView } from 'react-native-webrtc';
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import { io, Socket } from 'socket.io-client';
import { CONFIG } from '../config';
import { AzureLogger } from '../utils/AzureLogger';
import { RecordingUploader } from '../utils/RecordingUploader';

const RECORDING_DURATION_MS = 15000; // 15 seconds per chunk

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

const MonitorScreen = ({ navigation }: any) => {
    // Modes: 'idle' (nothing), 'recording' (VisionCamera + Upload), 'streaming' (WebRTC Loop)
    const [mode, setMode] = useState<'idle' | 'recording' | 'streaming'>('idle');
    const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);

    // WebRTC Refs
    const socketRef = useRef<Socket | null>(null);
    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
    const localStream = useRef<any>(null);

    // VisionCamera Refs
    const device = useCameraDevice('back');
    const { hasPermission: hasCamPermission, requestPermission: requestCamPermission } = useCameraPermission();
    const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } = useMicrophonePermission();
    const camera = useRef<Camera>(null);
    const isRecordingRef = useRef(false);
    const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Initial Permissions & Setup
    useEffect(() => {
        (async () => {
            if (!hasCamPermission) {
                const status = await requestCamPermission();
                if (!status) Alert.alert("Permission required", "Camera permission is needed.");
            }
            if (!hasMicPermission) {
                const status = await requestMicPermission();
                if (!status) Alert.alert("Permission required", "Microphone permission is needed for recording.");
            }
        })();

        // Connect Socket immediately to listen for viewers
        setupSocket();

        return () => {
            cleanupEverything();
        };
    }, []);

    // Mode Handling
    useEffect(() => {
        AzureLogger.log('Mode Changed', { mode });

        if (mode === 'recording') {
            // Give camera a moment to mount
            setTimeout(() => startRecordingChunk(), 1000);
        } else if (mode === 'streaming') {
            startWebRTC();
        } else {
            // Idle: Cleanup strictly done via cleanupEverything usually
        }

        return () => {
            // Cleanup when leaving mode
            if (mode === 'recording') stopRecordingLoop();
            if (mode === 'streaming') stopWebRTC();
        };
    }, [mode]);

    const setupSocket = () => {
        if (socketRef.current) return;

        AzureLogger.log('Connecting to Signaling Server', { url: CONFIG.SIGNALING_SERVER });
        socketRef.current = io(CONFIG.SIGNALING_SERVER, {
            transports: ['websocket'],
            path: '/socket.io'
        });

        socketRef.current.on('connect', () => {
            AzureLogger.log('Connected to Backend', { socketId: socketRef.current?.id });
            socketRef.current?.emit('join-room', 'default-room', 'monitor');
        });

        socketRef.current.on('viewer-joined', async (viewerId: string) => {
            AzureLogger.log('Viewer Joined - Switching to Stream', { viewerId });
            // Priority Interrupt: Stop recording, Start Streaming
            setMode('streaming');
            pendingViewers.current.push(viewerId);
        });

        socketRef.current.on('answer', async ({ from, answer }: any) => {
            const pc = peerConnections.current.get(from);
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socketRef.current.on('ice-candidate', async ({ from, candidate }: any) => {
            const pc = peerConnections.current.get(from);
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
        });

        socketRef.current.on('monitor-offline', () => { /* no-op */ });
    };

    const pendingViewers = useRef<string[]>([]);

    // --- STREAMING LOGIC (WebRTC) ---

    const startWebRTC = async () => {
        try {
            AzureLogger.log('Starting WebRTC Stream');
            const stream = await mediaDevices.getUserMedia({
                audio: true,
                video: { width: 640, height: 480, frameRate: 30, facingMode: 'environment' }
            });
            localStream.current = stream;
            setLocalStreamUrl(stream.toURL());

            // Process any pending viewers who triggered this mode switch
            while (pendingViewers.current.length > 0) {
                const viewerId = pendingViewers.current.shift()!;
                await initiateConnection(viewerId, stream);
            }
        } catch (e) {
            AzureLogger.log('WebRTC Start Failed', { error: String(e) }, 'ERROR');
            setMode('idle'); // Fallback
        }
    };

    const stopWebRTC = () => {
        if (localStream.current) {
            localStream.current.getTracks().forEach((t: any) => t.stop());
            localStream.current = null;
        }
        setLocalStreamUrl(null);
        peerConnections.current.forEach(pc => pc.close());
        peerConnections.current.clear();
        isRecordingRef.current = false;
    };

    const initiateConnection = async (viewerId: string, stream: any) => {
        AzureLogger.log('Connecting to Viewer', { viewerId });
        const pc = new RTCPeerConnection(configuration);
        peerConnections.current.set(viewerId, pc);

        stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));

        pc.onicecandidate = (event: any) => {
            if (event.candidate) {
                socketRef.current?.emit('ice-candidate', { roomId: 'default-room', candidate: event.candidate, to: viewerId });
            }
        };

        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('offer', { roomId: 'default-room', offer, to: viewerId });
        AzureLogger.log('Offer Sent', { mode: 'monitor', viewerId });
    };

    // --- RECORDING LOGIC (VisionCamera) ---

    const startRecordingChunk = async () => {
        if (!camera.current || mode !== 'recording') return;

        try {
            if (isRecordingRef.current) return; // Prevent double start

            AzureLogger.log('Starting Recording Chunk');
            isRecordingRef.current = true;

            camera.current.startRecording({
                onRecordingFinished: async (video) => {
                    isRecordingRef.current = false;
                    AzureLogger.log('Recording Finished', { path: video.path });

                    // Upload in background
                    RecordingUploader.uploadRecording(video.path, video.duration)
                        .catch(e => AzureLogger.log('Upload Failed', { error: String(e) }, 'ERROR'));

                    // Start next chunk immediately if still in recording mode
                    if (mode === 'recording') {
                        startRecordingChunk();
                    }
                },
                onRecordingError: (error) => {
                    isRecordingRef.current = false;
                    AzureLogger.log('Recording Error', { error: JSON.stringify(error) }, 'ERROR');
                    // Retry?
                    if (mode === 'recording') setTimeout(startRecordingChunk, 2000);
                }
            });

            // Stop after duration
            recordingTimer.current = setTimeout(async () => {
                if (camera.current && isRecordingRef.current) {
                    await camera.current.stopRecording();
                }
            }, RECORDING_DURATION_MS);

        } catch (e) {
            console.error(e);
            isRecordingRef.current = false;
        }
    };

    const stopRecordingLoop = async () => {
        if (recordingTimer.current) clearTimeout(recordingTimer.current);
        if (camera.current && isRecordingRef.current) {
            await camera.current.stopRecording();
        }
        isRecordingRef.current = false;
    };

    const cleanupEverything = () => {
        stopRecordingLoop();
        stopWebRTC();
        socketRef.current?.disconnect();
    };

    const toggleWork = () => {
        // Simple toggle: Idle <-> Recording
        // Streaming is automatic triggered by viewers
        if (mode === 'idle') setMode('recording');
        else setMode('idle');
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.previewContainer}>
                {mode === 'recording' && device && hasCamPermission && hasMicPermission ? (
                    <Camera
                        ref={camera}
                        style={StyleSheet.absoluteFill}
                        device={device}
                        isActive={true}
                        video={true}
                        audio={true}
                    />
                ) : mode === 'streaming' && localStreamUrl ? (
                    <RTCView
                        streamURL={localStreamUrl}
                        style={styles.fullVideo}
                        objectFit="cover"
                        mirror={false}
                    />
                ) : (
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color="#0EA5E9" />
                        <Text style={styles.placeholderText}>
                            {mode === 'idle' ? 'Ready to Monitor' : 'Initializing...'}
                        </Text>
                    </View>
                )}

                <View style={styles.overlay}>
                    <Text style={[styles.liveIndicator, mode === 'recording' ? { backgroundColor: '#EF4444' } : {}]}>
                        {mode.toUpperCase()}
                    </Text>
                </View>
            </View>

            <View style={styles.controls}>
                <TouchableOpacity
                    style={[styles.startButton, mode !== 'idle' && styles.stopButton]}
                    onPress={toggleWork}
                >
                    <Text style={styles.startButtonText}>
                        {mode === 'idle' ? 'START MONITORING' : 'STOP MONITORING'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    previewContainer: { flex: 3 },
    fullVideo: { ...StyleSheet.absoluteFillObject },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    overlay: { position: 'absolute', top: 32, right: 32 },
    placeholderText: { color: '#94A3B8', fontSize: 18, marginTop: 16 },
    liveIndicator: { color: '#FFF', backgroundColor: 'rgba(34, 197, 94, 0.8)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4, fontWeight: '800' },
    controls: { flex: 1, backgroundColor: '#0F172A', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, alignItems: 'center', justifyContent: 'center' },
    startButton: { backgroundColor: '#0EA5E9', width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 16 },
    stopButton: { backgroundColor: '#64748B' },
    startButtonText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
    backButton: { padding: 12 },
    backButtonText: { color: '#64748B', fontSize: 16 },
});

export default MonitorScreen;
