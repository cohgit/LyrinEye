import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, AppState, Modal, TextInput, Dimensions } from 'react-native';
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices, RTCView } from 'react-native-webrtc';
import DeviceInfo from 'react-native-device-info';
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission, Orientation } from 'react-native-vision-camera';
import { io, Socket } from 'socket.io-client';
import { CONFIG } from '../config';
import { AzureLogger } from '../utils/AzureLogger';
import { RecordingUploader } from '../utils/RecordingUploader';
import { authService } from '../utils/AuthService';
import { Telemetry } from '../utils/TelemetryService';
import KeepAwake from 'react-native-keep-awake';

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
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [orientation, setOrientation] = useState<Orientation>('portrait');

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

        // Register Device if logged in
        (async () => {
            const user = await authService.getCurrentUser();
            if (user) {
                const deviceId = await DeviceInfo.getUniqueId();
                try {
                    const normalizedEmail = user.email.toLowerCase();
                    await fetch(`${CONFIG.SIGNALING_SERVER}/register-device`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ deviceId, email: normalizedEmail })
                    });
                    console.log(`[APP] Device ${deviceId} registered for ${normalizedEmail}`);
                    AzureLogger.log('Device Registered', { email: normalizedEmail, deviceId });
                } catch (e) {
                    console.error(`[APP] Device Registration Failed: ${e}`);
                    AzureLogger.log('Device Registration Failed', { error: String(e) }, 'WARN');
                }
            }
        })();

        // Start Telemetry
        Telemetry.start();

        // Orientation listener
        const updateOrientation = () => {
            const { width, height } = Dimensions.get('window');
            setOrientation(width > height ? 'landscape-left' : 'portrait');
        };
        const dimSubscription = Dimensions.addEventListener('change', updateOrientation);
        updateOrientation();

        // App State Logging
        const subscription = AppState.addEventListener('change', nextAppState => {
            AzureLogger.log('App State Changed', { state: nextAppState });
        });

        return () => {
            subscription.remove();
            dimSubscription.remove();
            Telemetry.stop();
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

        socketRef.current = io(CONFIG.SIGNALING_SERVER);

        socketRef.current?.on('viewer-joined', async (viewerId: string) => {
            AzureLogger.log('Viewer Joined - Switching to Stream', { viewerId });
            setMode('streaming');
            pendingViewers.current.push(viewerId);
        });

        // Use uniqueId as roomId
        DeviceInfo.getUniqueId().then(id => {
            socketRef.current?.emit('join-room', id, 'monitor');
        });

        socketRef.current?.on('answer', async ({ from, answer }: any) => {
            const pc = peerConnections.current.get(from);
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });

        socketRef.current?.on('ice-candidate', async ({ from, candidate }: any) => {
            const pc = peerConnections.current.get(from);
            if (pc) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });

        socketRef.current?.on('monitor-offline', () => { /* no-op */ });
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

        (pc as any).onicecandidate = (event: any) => {
            if (event.candidate) {
                DeviceInfo.getUniqueId().then(id => {
                    socketRef.current?.emit('ice-candidate', { roomId: id, candidate: event.candidate, to: viewerId });
                });
            }
        };

        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        const deviceId = await DeviceInfo.getUniqueId();
        socketRef.current?.emit('offer', { roomId: deviceId, offer, to: viewerId });
        AzureLogger.log('Offer Sent', { mode: 'monitor', viewerId });
    };

    // --- RECORDING LOGIC (VisionCamera) ---

    const startRecordingChunk = async () => {
        if (!camera.current || mode !== 'recording') return;

        try {
            if (isRecordingRef.current) return;

            // Take matching snapshot for this chunk
            const photo = await camera.current.takePhoto({ flash: 'off' });
            const snapshotPath = photo.path;

            AzureLogger.log('Starting Recording Chunk with Snapshot');
            isRecordingRef.current = true;

            camera.current.startRecording({
                onRecordingFinished: async (video) => {
                    isRecordingRef.current = false;
                    AzureLogger.log('Recording Finished', { path: video.path });

                    // Upload in background with snapshot
                    RecordingUploader.uploadRecording(video.path, video.duration, snapshotPath);

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
        if (mode === 'idle') {
            AzureLogger.log('User Started Monitoring');
            setMode('recording');
            KeepAwake.activate();
        } else {
            AzureLogger.log('User Stopped Monitoring');
            setMode('idle');
            KeepAwake.deactivate();
        }
    };

    const [showShareModal, setShowShareModal] = useState(false);
    const [shareEmail, setShareEmail] = useState('');
    const [isSharing, setIsSharing] = useState(false);

    const handleShare = async () => {
        if (!shareEmail.trim()) return;
        setIsSharing(true);
        try {
            const user = await authService.getCurrentUser();
            const deviceId = await DeviceInfo.getUniqueId();
            const response = await fetch(`${CONFIG.SIGNALING_SERVER}/share-device`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deviceId,
                    ownerEmail: user?.email,
                    shareWithEmail: shareEmail.trim().toLowerCase()
                })
            });
            if (response.ok) {
                Alert.alert("Success", `Monitor shared with ${shareEmail}`);
                setShowShareModal(false);
                setShareEmail('');
            } else {
                throw new Error("Failed to share");
            }
        } catch (error) {
            Alert.alert("Error", "Could not share monitor. Please try again.");
        } finally {
            setIsSharing(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeepAwake />
            <View style={styles.cameraContainer}>
                {device && (mode === 'recording' || mode === 'idle') ? (
                    <Camera
                        {...({
                            ref: camera,
                            style: StyleSheet.absoluteFill,
                            device: device,
                            isActive: true,
                            video: true,
                            audio: true,
                            photo: true,
                            orientation: orientation
                        } as any)}
                    />
                ) : mode === 'streaming' && localStreamUrl ? (
                    <RTCView
                        streamURL={localStreamUrl}
                        style={StyleSheet.absoluteFill}
                        objectFit="cover"
                    />
                ) : (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0ea5e9" />
                        <Text style={styles.loadingText}>Initializing Camera...</Text>
                    </View>
                )}

                {/* Overlays */}
                <View style={styles.overlay}>
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>Monitor Active</Text>
                            <Text style={styles.status}>
                                {mode === 'streaming' ? 'SHARING LIVE FEED 🔴' :
                                    mode === 'recording' ? 'RECORDING CHUNKS 📹' : 'IDLE ⚪'}
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <TouchableOpacity
                                style={styles.shareButton}
                                onPress={() => setShowShareModal(true)}
                            >
                                <Text style={{ fontSize: 20 }}>👥</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.stopButton} onPress={toggleWork}>
                                <Text style={styles.stopButtonText}>{mode === 'idle' ? 'START' : 'STOP'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>

            <Modal
                visible={showShareModal}
                transparent={true}
                animationType="slide"
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Share Monitor</Text>
                        <Text style={styles.modalSubtitle}>Enter the email of the person you want to share this camera with.</Text>

                        <TextInput
                            style={styles.input}
                            placeholder="user@gmail.com"
                            placeholderTextColor="#94A3B8"
                            value={shareEmail}
                            onChangeText={setShareEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => setShowShareModal(false)}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.confirmButton]}
                                onPress={handleShare}
                                disabled={isSharing}
                            >
                                {isSharing ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmButtonText}>Share</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    cameraContainer: { flex: 1, position: 'relative' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F172A' },
    loadingText: { color: '#94A3B8', fontSize: 16, marginTop: 16 },
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, padding: 24 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { color: '#FFF', fontSize: 24, fontWeight: '900' },
    status: { color: '#94A3B8', fontSize: 12, fontWeight: '700', marginTop: 4 },
    stopButton: { backgroundColor: 'rgba(239, 68, 68, 0.8)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
    stopButtonText: { color: '#FFF', fontWeight: 'bold' },
    shareButton: { backgroundColor: 'rgba(255, 255, 255, 0.2)', padding: 10, borderRadius: 12, marginRight: 10 },
    modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 },
    modalContent: { backgroundColor: '#1E293B', borderRadius: 24, padding: 24 },
    modalTitle: { color: '#FFF', fontSize: 24, fontWeight: '700', marginBottom: 12 },
    modalSubtitle: { color: '#94A3B8', fontSize: 14, marginBottom: 20, lineHeight: 20 },
    input: { backgroundColor: '#0F172A', borderRadius: 12, padding: 16, color: '#FFF', fontSize: 16, marginBottom: 24 },
    modalButtons: { flexDirection: 'row', gap: 12 },
    modalButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    cancelButton: { backgroundColor: 'transparent' },
    confirmButton: { backgroundColor: '#0EA5E9' },
    cancelButtonText: { color: '#94A3B8', fontWeight: '600' },
    confirmButtonText: { color: '#FFF', fontWeight: '700' },
});

export default MonitorScreen;
