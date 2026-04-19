import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, AppState, Modal, TextInput, Dimensions, PermissionsAndroid, Platform, TouchableWithoutFeedback } from 'react-native';
import { mediaDevices, RTCView } from 'react-native-webrtc';
import DeviceInfo from 'react-native-device-info';
import { useMicrophonePermission, useCameraPermission, Orientation } from 'react-native-vision-camera';
import { io, Socket } from 'socket.io-client';
import { CONFIG } from '../config';
import { AzureLogger } from '../utils/AzureLogger';
import { authService } from '../utils/AuthService';
import { Telemetry } from '../utils/TelemetryService';
import KeepAwake from 'react-native-keep-awake';
import ScreenBrightness from 'react-native-screen-brightness';
import { mediasoupClient } from '../utils/MediasoupClient';
import NetInfo from '@react-native-community/netinfo';
import { AdbCommand } from '../utils/adbDeepLink';

const requestIgnoreBatteryOptimization = async () => {
    if (Platform.OS !== 'android') return;
    try {
        const { DeviceHealthModule } = require('react-native').NativeModules as any;
        if (DeviceHealthModule?.requestIgnoreBatteryOptimizations) {
            await DeviceHealthModule.requestIgnoreBatteryOptimizations();
            AzureLogger.log('Requested ignore battery optimizations');
        }
    } catch (e) {
        AzureLogger.log('Failed requesting battery optimization ignore', { error: String(e) }, 'WARN');
    }
};

const MonitorScreen = ({ navigation, route }: any) => {
    // Streaming-only on device: chunks + thumbnails are server-side.
    const [mode, setMode] = useState<'idle' | 'streaming'>('idle');
    const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);
    const [orientation, setOrientation] = useState<Orientation>('portrait');
    const initialBrightness = useRef<number>(1.0);
    const [isScreenLocked, setIsScreenLocked] = useState(false);
    const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const socketRef = useRef<Socket | null>(null);
    const localStream = useRef<any>(null);
    const lastAdbCommandId = useRef<string | null>(null);

    const { hasPermission: hasMicPermission, requestPermission: requestMicPermission } = useMicrophonePermission();
    const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();

    useEffect(() => {
        (async () => {
            if (!hasMicPermission) {
                const status = await requestMicPermission();
                if (!status) Alert.alert("Permission required", "Microphone permission is needed for streaming.");
            }

            if (!hasCameraPermission) {
                const status = await requestCameraPermission();
                if (!status) Alert.alert("Permission required", "Camera permission is needed for streaming.");
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

                await requestIgnoreBatteryOptimization();
            }
        })();

        setupSocket();

        (async () => {
            const user = await authService.getCurrentUser();
            if (!user) return;
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
                AzureLogger.log('Device Registered', { email: normalizedEmail, deviceId });
            } catch (e) {
                AzureLogger.log('Device Registration Failed', { error: String(e) }, 'WARN');
            }
        })();

        Telemetry.start();

        const updateOrientation = () => {
            const { width, height } = Dimensions.get('window');
            setOrientation(width > height ? 'landscape-left' : 'portrait');
        };
        const dimSubscription = Dimensions.addEventListener('change', updateOrientation);
        updateOrientation();

        ScreenBrightness.getBrightness().then(value => {
            initialBrightness.current = value;
        });

        const subscription = AppState.addEventListener('change', nextAppState => {
            AzureLogger.log('App State Changed', { state: nextAppState });
        });

        return () => {
            subscription.remove();
            dimSubscription.remove();
            Telemetry.stop();
            cleanupEverything();
            ScreenBrightness.setBrightness(initialBrightness.current);
        };
    }, []);

    const applyAdbCommand = useCallback((command: AdbCommand, commandId?: string) => {
        if (commandId && lastAdbCommandId.current === commandId) return;
        if (commandId) lastAdbCommandId.current = commandId;

        if (command === 'start') {
            AzureLogger.log('ADB command: start streaming', { commandId: commandId || null });
            setMode('streaming');
            KeepAwake.activate();
            return;
        }

        if (command === 'stop') {
            AzureLogger.log('ADB command: stop monitoring', { commandId: commandId || null });
            setMode('idle');
            KeepAwake.deactivate();
            return;
        }

        if (command === 'toggle') {
            AzureLogger.log('ADB command: toggle monitoring', { commandId: commandId || null });
            setMode(prev => {
                const next = prev === 'idle' ? 'streaming' : 'idle';
                if (next === 'streaming') KeepAwake.activate();
                else KeepAwake.deactivate();
                return next;
            });
        }
    }, []);

    useEffect(() => {
        if (route.params?.adbAutoRecord) {
            applyAdbCommand('start', route.params?.adbCommandId || `legacy-${Date.now()}`);
            navigation.setParams({ adbAutoRecord: undefined });
            return;
        }

        const adbCommand = route.params?.adbCommand as AdbCommand | undefined;
        if (!adbCommand) return;

        applyAdbCommand(adbCommand, route.params?.adbCommandId);
        navigation.setParams({ adbCommand: undefined, adbCommandId: undefined });
    }, [
        route.params?.adbAutoRecord,
        route.params?.adbCommand,
        route.params?.adbCommandId,
        applyAdbCommand,
        navigation
    ]);

    const resetInactivityTimer = useCallback(() => {
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);

        if (isScreenLocked) {
            setIsScreenLocked(false);
            ScreenBrightness.setBrightness(initialBrightness.current);
            AzureLogger.log('Screen Waked Up');
        }

        if (mode !== 'idle') {
            inactivityTimer.current = setTimeout(() => {
                setIsScreenLocked(true);
                ScreenBrightness.setBrightness(0);
                AzureLogger.log('Screen Auto-Locked due to inactivity');
            }, 30000);
        }
    }, [mode, isScreenLocked]);

    const startWebRTC = async () => {
        if (localStream.current) return;
        try {
            AzureLogger.log('Starting Mediasoup Stream');

            const stream = await mediaDevices.getUserMedia({
                audio: true,
                video: { width: 640, height: 480, frameRate: 30, facingMode: 'environment' }
            });

            localStream.current = stream;
            setLocalStreamUrl(stream.toURL());

            const deviceId = await DeviceInfo.getUniqueId();
            await mediasoupClient.connect(deviceId);

            const tracks = stream.getTracks();
            for (const track of tracks) {
                await mediasoupClient.produce(track);
            }

            try {
                await mediasoupClient.startServerRecording();
                AzureLogger.log('Server-side Recording Started');
            } catch (err) {
                AzureLogger.log('Server Recording Failed', { error: String(err) }, 'WARN');
            }
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
            await mediasoupClient.stopServerRecording();
        } catch {
            // Best effort; server-side recorder may not have started.
        }

        mediasoupClient.disconnect();

        if (localStream.current) {
            localStream.current.getTracks().forEach((t: any) => t.stop());
            localStream.current = null;
        }
        setLocalStreamUrl(null);
    };

    useEffect(() => {
        AzureLogger.log('Mode Changed', { mode });
        if (mode === 'streaming') {
            startWebRTC();
            resetInactivityTimer();
        } else {
            stopWebRTC();
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
            setIsScreenLocked(false);
            ScreenBrightness.setBrightness(initialBrightness.current);
        }

        return () => {
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        };
    }, [mode]);

    const setupSocket = () => {
        if (socketRef.current) return;

        socketRef.current = io(CONFIG.SIGNALING_SERVER);
        socketRef.current?.on('connect', () => {
            AzureLogger.log('Legacy Socket Connected', { socketId: socketRef.current?.id });
        });
        socketRef.current?.on('disconnect', (reason) => {
            AzureLogger.log('Legacy Socket Disconnected', { reason, socketId: socketRef.current?.id }, 'WARN');
        });
        socketRef.current?.on('connect_error', (error) => {
            AzureLogger.log('Legacy Socket Connect Error', { error: error.message }, 'ERROR');
        });
        socketRef.current?.on('viewer-joined', async (viewerId: string) => {
            AzureLogger.log('Viewer Joined - Switching to Stream', {
                viewerId,
                currentMode: mode,
                socketConnected: socketRef.current?.connected,
                socketId: socketRef.current?.id
            });
            setMode('streaming');
            KeepAwake.activate();
        });

        DeviceInfo.getUniqueId().then(id => {
            socketRef.current?.emit('join-room', { roomId: id, role: 'monitor' });
        });
    };

    const cleanupEverything = () => {
        stopWebRTC();
        socketRef.current?.disconnect();
    };

    const toggleWork = () => {
        if (mode === 'idle') {
            AzureLogger.log('User Started Monitoring');
            setMode('streaming');
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
                {mode === 'streaming' && localStreamUrl ? (
                    <RTCView
                        streamURL={localStreamUrl}
                        style={StyleSheet.absoluteFill}
                        objectFit="cover"
                    />
                ) : (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0ea5e9" />
                        <Text style={styles.loadingText}>Modo espera</Text>
                        <Text style={styles.loadingHint}>INICIAR para transmitir en vivo</Text>
                    </View>
                )}

                {/* Overlays */}
                <View style={[styles.overlay, orientation.includes('landscape') && { padding: 12 }]}>
                    <View style={styles.header}>
                        <View>
                            <Text style={styles.title}>Monitor</Text>
                            <Text style={styles.status}>
                                {mode === 'streaming' ? 'VIVO 🔴' : 'LISTO ⚪'}
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
    loadingHint: { color: '#64748B', fontSize: 12, marginTop: 8 },
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
