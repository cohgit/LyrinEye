import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Linking, Alert } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';
import { io, Socket } from 'socket.io-client';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { CONFIG } from '../config';

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

const CHUNK_DURATION_MS = 30000; // 30 seconds

const MonitorScreen = ({ navigation }: any) => {
    const device = useCameraDevice('back');
    const cameraRef = useRef<Camera>(null);
    const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
    const { hasPermission: hasMicrophonePermission, requestPermission: requestMicrophonePermission } = useMicrophonePermission();

    const [isStreaming, setIsStreaming] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const socketRef = useRef<Socket | null>(null);
    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
    const localStream = useRef<any>(null);
    const recordingTimer = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const checkPermissions = async () => {
            if (!hasCameraPermission) await requestCameraPermission();
            if (!hasMicrophonePermission) await requestMicrophonePermission();
        };
        checkPermissions();
    }, [hasCameraPermission, hasMicrophonePermission, requestCameraPermission, requestMicrophonePermission]);

    useEffect(() => {
        if (isStreaming) {
            startSignaling();
            startRecordingCycle();
        } else {
            stopSignaling();
            stopRecordingCycle();
        }
        return () => {
            stopSignaling();
            stopRecordingCycle();
        };
    }, [isStreaming]);

    const startSignaling = async () => {
        try {
            socketRef.current = io(CONFIG.SIGNALING_SERVER);

            const stream = await mediaDevices.getUserMedia({
                audio: true,
                video: {
                    width: 640,
                    height: 480,
                    frameRate: 30,
                    facingMode: 'environment',
                }
            });
            localStream.current = stream;

            socketRef.current.on('connect', () => {
                socketRef.current?.emit('join-room', 'default-room', 'monitor');
            });

            socketRef.current.on('viewer-joined', async (viewerId: string) => {
                await initiateConnection(viewerId);
            });

            socketRef.current.on('answer', async ({ from, answer }: any) => {
                const pc = peerConnections.current.get(from);
                if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription(answer));
                }
            });

            socketRef.current.on('ice-candidate', async ({ from, candidate }: any) => {
                const pc = peerConnections.current.get(from);
                if (pc) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
            });

        } catch (error) {
            console.error('Failed to start signaling:', error);
            setIsStreaming(false);
        }
    };

    const initiateConnection = async (viewerId: string) => {
        const pc = new RTCPeerConnection(configuration);
        peerConnections.current.set(viewerId, pc);

        localStream.current.getTracks().forEach((track: any) => {
            pc.addTrack(track, localStream.current);
        });

        (pc as any).onicecandidate = (event: any) => {
            if (event.candidate) {
                socketRef.current?.emit('ice-candidate', { roomId: 'default-room', candidate: event.candidate, to: viewerId });
            }
        };

        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        socketRef.current?.emit('offer', { roomId: 'default-room', offer, to: viewerId });
    };

    const startRecordingCycle = async () => {
        setIsRecording(true);
        recordNextChunk();
    };

    const recordNextChunk = async () => {
        if (!isStreaming || !cameraRef.current) return;

        try {
            const blobName = `rec_${Date.now()}.mp4`;

            cameraRef.current.startRecording({
                onRecordingFinished: (video) => {
                    console.log('Recording finished:', video.path);
                    uploadVideo(video.path, blobName);
                },
                onRecordingError: (error) => console.error('Recording error:', error),
            });

            // Set timer for next chunk
            recordingTimer.current = setTimeout(async () => {
                if (cameraRef.current) {
                    await cameraRef.current.stopRecording();
                    recordNextChunk(); // Chain next recording
                }
            }, CHUNK_DURATION_MS);

        } catch (error) {
            console.error('Failed to start chunk recording:', error);
        }
    };

    const uploadVideo = async (filePath: string, blobName: string) => {
        try {
            // 1. Get SAS URL
            const sasResponse = await fetch(`${CONFIG.SIGNALING_SERVER}/sas?blobName=${blobName}`);
            const { uploadUrl } = await sasResponse.json();

            // 2. Upload to Azure
            await ReactNativeBlobUtil.fetch('PUT', uploadUrl, {
                'x-ms-blob-type': 'BlockBlob',
                'Content-Type': 'video/mp4',
            }, ReactNativeBlobUtil.wrap(filePath));

            console.log('Upload success:', blobName);

            // 3. Save Metadata
            await fetch(`${CONFIG.SIGNALING_SERVER}/recordings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    blobName,
                    roomId: 'default-room',
                    timestamp: Date.now(),
                    duration: CHUNK_DURATION_MS / 1000
                })
            });

            // 4. Clean up local file
            await ReactNativeBlobUtil.fs.unlink(filePath);

        } catch (error) {
            console.error('Failed to upload video:', error);
        }
    };

    const stopRecordingCycle = async () => {
        setIsRecording(false);
        if (recordingTimer.current) {
            clearTimeout(recordingTimer.current);
            recordingTimer.current = null;
        }
        if (cameraRef.current) {
            try {
                await cameraRef.current.stopRecording();
            } catch (e) { }
        }
    };

    const stopSignaling = () => {
        socketRef.current?.disconnect();
        peerConnections.current.forEach(pc => pc.close());
        peerConnections.current.clear();
        if (localStream.current) {
            localStream.current.getTracks().forEach((track: any) => track.stop());
            localStream.current = null;
        }
    };

    if (!hasCameraPermission) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centered}>
                    <Text style={styles.errorText}>No Camera Permission</Text>
                    <TouchableOpacity style={styles.settingsButton} onPress={() => Linking.openSettings()}>
                        <Text style={styles.settingsButtonText}>Grant Permission in Settings</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    if (device == null) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#0EA5E9" />
                    <Text style={styles.placeholderText}>Initializing Camera...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.previewContainer}>
                <Camera
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    device={device}
                    isActive={true}
                    video={true}
                    audio={hasMicrophonePermission}
                />
                <View style={styles.overlay}>
                    {isStreaming && <View style={styles.recordingDot} />}
                    <Text style={styles.liveIndicator}>{isStreaming ? 'LIVE & RECORDING' : 'PREVIEW'}</Text>
                </View>
            </View>

            <View style={styles.controls}>
                <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>STATUS: {isStreaming ? 'STREAMING' : 'READY'}</Text>
                </View>

                <TouchableOpacity
                    style={[styles.startButton, isStreaming && styles.stopButton]}
                    onPress={() => setIsStreaming(!isStreaming)}
                >
                    <Text style={styles.startButtonText}>{isStreaming ? 'STOP MONITORING' : 'START MONITORING'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.backButtonText}>Exit Monitor Mode</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    previewContainer: { flex: 3 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    overlay: { ...StyleSheet.absoluteFillObject, padding: 32, alignItems: 'flex-end' },
    placeholderText: { color: '#94A3B8', fontSize: 18, marginTop: 16 },
    errorText: { color: '#EF4444', fontSize: 20, fontWeight: '700', marginBottom: 20 },
    liveIndicator: { color: '#FFF', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4, fontWeight: '800' },
    recordingDot: { position: 'absolute', top: 32, left: 32, width: 20, height: 20, borderRadius: 10, backgroundColor: '#EF4444' },
    controls: { flex: 1, backgroundColor: '#0F172A', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, alignItems: 'center', justifyContent: 'center' },
    statusBadge: { backgroundColor: 'rgba(34, 197, 94, 0.2)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 100, marginBottom: 24 },
    statusText: { color: '#4ADE80', fontWeight: '700', letterSpacing: 1 },
    startButton: { backgroundColor: '#0EA5E9', width: '100%', paddingVertical: 18, borderRadius: 16, alignItems: 'center', marginBottom: 16 },
    stopButton: { backgroundColor: '#EF4444' },
    startButtonText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
    backButton: { padding: 12 },
    backButtonText: { color: '#64748B', fontSize: 16 },
    settingsButton: { backgroundColor: '#1E293B', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
    settingsButtonText: { color: '#F8FAFC', fontWeight: '600' },
});

export default MonitorScreen;
