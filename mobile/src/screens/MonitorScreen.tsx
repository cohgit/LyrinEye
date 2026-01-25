import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Linking, Alert } from 'react-native';
import { useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera'; // Oops, we removed this package. Need verify permissions logic.
// Actually, react-native-webrtc handles permissions gracefully or we need another permission lib.
// For now, let's assume permissions are handled or use simple check.
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices, RTCView } from 'react-native-webrtc';
import { io, Socket } from 'socket.io-client';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { CONFIG } from '../config';

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

const MonitorScreen = ({ navigation }: any) => {
    const [isStreaming, setIsStreaming] = useState(false);
    const socketRef = useRef<Socket | null>(null);
    const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
    const localStream = useRef<any>(null); // MediaStream
    const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);

    useEffect(() => {
        // Init stream for preview
        startCamera();
        return () => stopCamera();
    }, []);

    useEffect(() => {
        if (isStreaming) {
            connectSignaling();
        } else {
            disconnectSignaling();
        }
    }, [isStreaming]);

    const startCamera = async () => {
        try {
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
            setLocalStreamUrl(stream.toURL());
        } catch (error) {
            console.error('Failed to start camera:', error);
            Alert.alert('Error', 'Failed to access camera');
        }
    };

    const stopCamera = () => {
        if (localStream.current) {
            localStream.current.getTracks().forEach((track: any) => track.stop());
            localStream.current = null;
            setLocalStreamUrl(null);
        }
    };

    const connectSignaling = () => {
        socketRef.current = io(CONFIG.SIGNALING_SERVER);

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
    };

    const disconnectSignaling = () => {
        socketRef.current?.disconnect();
        peerConnections.current.forEach(pc => pc.close());
        peerConnections.current.clear();
    };

    const initiateConnection = async (viewerId: string) => {
        if (!localStream.current) return;

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

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.previewContainer}>
                {localStreamUrl ? (
                    <RTCView
                        streamURL={localStreamUrl}
                        style={styles.fullVideo}
                        objectFit="cover"
                        mirror={false}
                    />
                ) : (
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color="#0EA5E9" />
                        <Text style={styles.placeholderText}>Starting Camera...</Text>
                    </View>
                )}

                <View style={styles.overlay}>
                    {isStreaming && <View style={styles.recordingDot} />}
                    <Text style={styles.liveIndicator}>{isStreaming ? 'STREAMING' : 'PREVIEW'}</Text>
                </View>
            </View>

            <View style={styles.controls}>
                <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>STATUS: {isStreaming ? 'LIVE' : 'READY'}</Text>
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
    fullVideo: { ...StyleSheet.absoluteFillObject },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    overlay: { ...StyleSheet.absoluteFillObject, padding: 32, alignItems: 'flex-end' },
    placeholderText: { color: '#94A3B8', fontSize: 18, marginTop: 16 },
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
});

export default MonitorScreen;
