import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, AppState, Modal, TextInput, Dimensions, PermissionsAndroid, Platform, TouchableWithoutFeedback } from 'react-native';
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
import ScreenBrightness from 'react-native-screen-brightness';
import { mediasoupClient } from '../utils/MediasoupClient';
import NetInfo from '@react-native-community/netinfo';

const RECORDING_DURATION_MS = 60000; // 1 minute per chunk

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
    const initialBrightness = useRef<number>(1.0);
    const [isScreenLocked, setIsScreenLocked] = useState(false);
    const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // WebRTC Refs
    // Mediasoup does not use peerConnections map in the component
    const socketRef = useRef<Socket | null>(null);
    const localStream = useRef<any>(null);

    // VisionCamera Refs
    const device = useCameraDevice('back');
    const { hasPermission: hasCamPermission, requestPermission: requestCamPermission } = useCameraPermission();
    const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } = useMicrophonePermission();
    const camera = useRef<Camera>(null);
    const isRecordingRef = useRef(false);
    const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const snapshotInterval = useRef<ReturnType<typeof setInterval> | null>(null);
    const currentSnapshots = useRef<string[]>([]);

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

            if (Platform.OS === 'android') {
                const hasBrightnessPerm = await ScreenBrightness.hasPermission();
                if (!hasBrightnessPerm) {
                    Alert.alert(
                        "Permiso de Brillo",
                        "LyrinEye necesita permiso para modificar los ajustes del sistema para ahorrar batería.",
                        [
                            { text: "Cancelar", style: "cancel" },
                            { text: "Configurar", onPress: () => ScreenBrightness.requestPermission() }
                        ]
                    );
                }

                // Request Location Permission for Telemetry
                try {
                    const granted = await PermissionsAndroid.request(
                        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                        {
                            title: 'Ubicación',
                            message: 'LyrinEye usa el GPS para el reporte de telemetría.',
                            buttonNeutral: 'Después',
                            buttonNegative: 'Cancelar',
                            buttonPositive: 'OK',
                        }
                    );
                    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                        console.log('[MONITOR] Location permission denied');
                    }
                } catch (err) {
                    console.warn(err);
                }
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
                    const netState = await NetInfo.fetch();
                    await fetch(`${CONFIG.SIGNALING_SERVER}/register-device`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            deviceId,
                            email: normalizedEmail,
                            wifiSSID: (netState.details as any)?.ssid || null,
                            appVersion: `${DeviceInfo.getVersion()}.${DeviceInfo.getBuildNumber()}`,
                            androidVersion: DeviceInfo.getSystemVersion()
                        })
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

        // Initialize Brightness
        ScreenBrightness.getBrightness().then(value => {
            initialBrightness.current = value;
        });

        // App State Logging
        const subscription = AppState.addEventListener('change', nextAppState => {
            AzureLogger.log('App State Changed', { state: nextAppState });
        });

        return () => {
            subscription.remove();
            dimSubscription.remove();
            Telemetry.stop();
            cleanupEverything();
            // Restore brightness on unmount
            ScreenBrightness.setBrightness(initialBrightness.current);
        };
    }, []);

    const resetInactivityTimer = useCallback(() => {
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);

        // Wake up screen if it was locked
        if (isScreenLocked) {
            setIsScreenLocked(false);
            ScreenBrightness.setBrightness(initialBrightness.current);
            AzureLogger.log('Screen Waked Up');
        }

        // Only auto-lock if in an active mode
        if (mode !== 'idle') {
            inactivityTimer.current = setTimeout(() => {
                setIsScreenLocked(true);
                // On Android, 0 is full off.
                ScreenBrightness.setBrightness(0);
                AzureLogger.log('Screen Auto-Locked due to inactivity');
            }, 30000); // 30 seconds
        }
    }, [mode, isScreenLocked]);

    useEffect(() => {
        AzureLogger.log('Mode Changed', { mode });

        if (mode === 'recording') {
            // Give camera a moment to mount
            setTimeout(() => startRecordingChunk(), 1000);
            resetInactivityTimer();
        } else if (mode === 'streaming') {
            startWebRTC();
            resetInactivityTimer();
        } else {
            // Restore
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
            setIsScreenLocked(false);
            ScreenBrightness.setBrightness(initialBrightness.current);
        }

        return () => {
            // Cleanup when leaving mode
            if (mode === 'recording') stopRecordingLoop();
            if (mode === 'streaming') stopWebRTC();
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        };
    }, [mode]);

    const setupSocket = () => {
        if (socketRef.current) {
            AzureLogger.log('Legacy Socket Setup', { status: 'already_exists' }, 'WARN');
            return;
        }

        AzureLogger.log('Legacy Socket Setup', { status: 'initializing', server: CONFIG.SIGNALING_SERVER });
        socketRef.current = io(CONFIG.SIGNALING_SERVER);

        // Connection events
        socketRef.current?.on('connect', () => {
            AzureLogger.log('Legacy Socket Connected', { socketId: socketRef.current?.id });
        });

        socketRef.current?.on('disconnect', (reason) => {
            AzureLogger.log('Legacy Socket Disconnected', { reason, socketId: socketRef.current?.id }, 'WARN');
        });

        socketRef.current?.on('reconnect', (attemptNumber) => {
            AzureLogger.log('Legacy Socket Reconnected', { attemptNumber });
        });

        socketRef.current?.on('connect_error', (error) => {
            AzureLogger.log('Legacy Socket Connect Error', { error: error.message }, 'ERROR');
        });

        // Viewer joined event
        socketRef.current?.on('viewer-joined', async (viewerId: string) => {
            AzureLogger.log('Viewer Joined - Switching to Stream', {
                viewerId,
                currentMode: mode,
                socketConnected: socketRef.current?.connected,
                socketId: socketRef.current?.id
            });
            setMode('streaming');
            pendingViewers.current.push(viewerId);
        });

        // Use uniqueId as roomId for signaling presence
        DeviceInfo.getUniqueId().then(id => {
            AzureLogger.log('Legacy Socket Joining Room', { roomId: id, role: 'monitor' });
            socketRef.current?.emit('join-room', id, 'monitor');
        });

        socketRef.current?.on('monitor-offline', () => {
            AzureLogger.log('Legacy Socket Monitor Offline Event');
        });
    };

    // --- STREAMING LOGIC (Mediasoup SFU) ---

    const startWebRTC = async () => {
        try {
            AzureLogger.log('Starting Mediasoup Stream');

            // 1. Get User Media
            AzureLogger.log('WebRTC Step', { step: 1, action: 'Getting user media' });
            const stream = await mediaDevices.getUserMedia({
                audio: true,
                video: { width: 640, height: 480, frameRate: 30, facingMode: 'environment' }
            });
            localStream.current = stream;
            setLocalStreamUrl(stream.toURL());
            AzureLogger.log('WebRTC Step', { step: 1, action: 'Got user media', tracks: stream.getTracks().length });

            // 2. Connect to SFU using Unique Device ID as Room ID
            const deviceId = await DeviceInfo.getUniqueId();
            AzureLogger.log('WebRTC Step', { step: 2, action: 'Connecting to Mediasoup', deviceId });
            await mediasoupClient.connect(deviceId);
            AzureLogger.log('WebRTC Step', { step: 2, action: 'Connected to Mediasoup' });

            // 3. Produce (Publish) Tracks
            const tracks = stream.getTracks();
            AzureLogger.log('WebRTC Step', { step: 3, action: 'Starting produce loop', trackCount: tracks.length });

            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i];
                AzureLogger.log('WebRTC Step', { step: 3, action: 'Producing track', index: i, kind: track.kind });
                await mediasoupClient.produce(track);
                AzureLogger.log('WebRTC Step', { step: 3, action: 'Track produced', index: i, kind: track.kind });
            }

            AzureLogger.log('WebRTC Step', { step: 3, action: 'All tracks produced successfully' });

            // 4. Start Server-Side Recording
            AzureLogger.log('WebRTC Step', { step: 4, action: 'Starting server recording' });
            try {
                await mediasoupClient.startServerRecording();
                AzureLogger.log('Server-side Recording Started');
            } catch (err) {
                console.warn('Failed to start server recording:', err);
                AzureLogger.log('Server Recording Failed', { error: String(err) }, 'WARN');
            }

            setMode('streaming');
            AzureLogger.log('WebRTC Started Successfully');
        } catch (e: any) {
            AzureLogger.log('Mediasoup Start Failed', {
                error: String(e),
                message: e?.message,
                name: e?.name
            }, 'ERROR');
            Alert.alert('Error', 'No se pudo iniciar la transmisión.');
            setMode('idle');
            stopWebRTC();
        }
    };

    const stopWebRTC = async () => {
        try {
            // Stop Server Recording
            await mediasoupClient.stopServerRecording();
        } catch (e) {
            console.warn('Error stopping server recording', e);
        }

        // Disconnect Mediasoup
        mediasoupClient.disconnect();

        // Stop Local Stream
        if (localStream.current) {
            localStream.current.getTracks().forEach((t: any) => t.stop());
            localStream.current = null;
        }
        setLocalStreamUrl(null);
        isRecordingRef.current = false;
    };

    // --- RECORDING LOGIC (VisionCamera) ---

    const startRecordingChunk = async () => {
        if (!camera.current || mode !== 'recording') return;

        try {
            if (isRecordingRef.current) return;

            // Prepare for multi-frame snapshots
            currentSnapshots.current = [];
            const takeSnapshot = async () => {
                if (camera.current && isRecordingRef.current) {
                    try {
                        const photo = await camera.current.takePhoto({ flash: 'off' });
                        currentSnapshots.current.push(photo.path);
                        console.log(`[APP] Captured snapshot ${currentSnapshots.current.length}/6`);
                    } catch (e) {
                        console.warn('[APP] Snapshot failed during recording', e);
                    }
                }
            };

            // First snapshot immediately
            await takeSnapshot();

            AzureLogger.log('Starting 1m Recording Chunk');
            isRecordingRef.current = true;

            // Start interval for remaining 5 snapshots (every 10s)
            snapshotInterval.current = setInterval(() => {
                if (currentSnapshots.current.length < 6) {
                    takeSnapshot();
                } else {
                    if (snapshotInterval.current) clearInterval(snapshotInterval.current);
                }
            }, 10000);

            camera.current.startRecording({
                onRecordingFinished: async (video) => {
                    isRecordingRef.current = false;
                    if (snapshotInterval.current) clearInterval(snapshotInterval.current);

                    AzureLogger.log('Recording Finished', { path: video.path, snapshots: currentSnapshots.current.length });

                    // Upload in background with all snapshots
                    RecordingUploader.uploadRecording(video.path, video.duration, currentSnapshots.current);

                    // Start next chunk immediately if still in recording mode
                    if (mode === 'recording') {
                        startRecordingChunk();
                    }
                },
                onRecordingError: (error) => {
                    isRecordingRef.current = false;
                    if (snapshotInterval.current) clearInterval(snapshotInterval.current);
                    AzureLogger.log('Recording Error', { error: JSON.stringify(error) }, 'ERROR');
                    // Retry?
                    if (mode === 'recording') setTimeout(startRecordingChunk, 2000);
                }
            });

            // Stop after duration (60s)
            recordingTimer.current = setTimeout(async () => {
                if (camera.current && isRecordingRef.current) {
                    await camera.current.stopRecording();
                }
            }, RECORDING_DURATION_MS);

        } catch (e) {
            console.error(e);
            isRecordingRef.current = false;
            if (snapshotInterval.current) clearInterval(snapshotInterval.current);
        }
    };

    const stopRecordingLoop = async () => {
        if (recordingTimer.current) clearTimeout(recordingTimer.current);
        if (snapshotInterval.current) clearInterval(snapshotInterval.current);
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
                Alert.alert("Éxito", `Compartido con ${shareEmail}`);
                setShowShareModal(false);
                setShareEmail('');
            } else {
                throw new Error("Failed to share");
            }
        } catch (error) {
            Alert.alert("Error", "No se pudo compartir.");
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
                        <Text style={styles.loadingText}>Iniciando...</Text>
                    </View>
                )}

                {/* Overlays */}
                <View style={[styles.overlay, orientation.includes('landscape') && { padding: 12 }]}>
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>Monitor</Text>
                            <Text style={styles.status}>
                                {mode === 'streaming' ? 'VIVO 🔴' :
                                    mode === 'recording' ? 'REC 📹' : 'LISTO ⚪'}
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
                                <Text style={styles.stopButtonText}>{mode === 'idle' ? 'INICIAR' : 'PARAR'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                {/* Lock Overlay */}
                <View
                    style={[
                        StyleSheet.absoluteFill,
                        {
                            backgroundColor: isScreenLocked ? 'black' : 'transparent',
                            zIndex: isScreenLocked ? 9999 : -1
                        }
                    ]}
                    pointerEvents={isScreenLocked ? 'auto' : 'none'}
                >
                    <TouchableWithoutFeedback onPress={resetInactivityTimer}>
                        <View style={styles.lockInfo}>
                            {isScreenLocked && (
                                <>
                                    <Text style={styles.lockText}>BLOQUEADO</Text>
                                    <Text style={styles.lockSubtext}>Tocar</Text>
                                </>
                            )}
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </View>

            <Modal
                visible={showShareModal}
                transparent={true}
                animationType="slide"
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Compartir</Text>
                        <Text style={styles.modalSubtitle}>Email de destino:</Text>

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
                                <Text style={styles.cancelButtonText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.confirmButton]}
                                onPress={handleShare}
                                disabled={isSharing}
                            >
                                {isSharing ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmButtonText}>Enviar</Text>}
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
    lockInfo: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    lockText: { color: '#FFF', fontSize: 32, fontWeight: '900', letterSpacing: 4 },
    lockSubtext: { color: '#94A3B8', fontSize: 16, marginTop: 12 },
});

export default MonitorScreen;
