import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, RTCView } from 'react-native-webrtc';
import { io, Socket } from 'socket.io-client';
import { CONFIG } from '../config';

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

const ViewerScreen = ({ navigation }: any) => {
    const [remoteStream, setRemoteStream] = useState<any>(null);
    const [status, setStatus] = useState('Connecting...');
    const socketRef = useRef<Socket | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);

    useEffect(() => {
        connectToSignaling();
        return () => cleanup();
    }, []);

    const connectToSignaling = () => {
        socketRef.current = io(CONFIG.SIGNALING_SERVER);

        socketRef.current.on('connect', () => {
            setStatus('Searching for monitor...');
            socketRef.current?.emit('join-room', 'default-room', 'viewer');
        });

        socketRef.current.on('monitor-online', () => {
            setStatus('Waiting for video feed...');
        });

        socketRef.current.on('offer', async ({ from, offer }: any) => {
            console.log('Received offer from monitor');
            await handleOffer(from, offer);
        });

        socketRef.current.on('ice-candidate', async ({ candidate }: any) => {
            if (pcRef.current) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            }
        });

        socketRef.current.on('monitor-offline', () => {
            setStatus('Monitor disconnected');
            setRemoteStream(null);
            cleanupWebRTC();
        });
    };

    const handleOffer = async (monitorId: string, offer: any) => {
        cleanupWebRTC();
        const pc = new RTCPeerConnection(configuration);
        pcRef.current = pc;

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socketRef.current?.emit('ice-candidate', { roomId: 'default-room', candidate: event.candidate, to: monitorId });
            }
        };

        pc.ontrack = (event) => {
            console.log('Received remote track');
            if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
                setStatus('LIVE');
            }
        };

        // Fallback for older WebRTC versions
        (pc as any).onaddstream = (event: any) => {
            setRemoteStream(event.stream);
            setStatus('LIVE');
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socketRef.current?.emit('answer', { roomId: 'default-room', answer, to: monitorId });
    };

    const cleanupWebRTC = () => {
        pcRef.current?.close();
        pcRef.current = null;
    };

    const cleanup = () => {
        socketRef.current?.disconnect();
        cleanupWebRTC();
        setRemoteStream(null);
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.videoContainer}>
                {remoteStream ? (
                    <RTCView
                        streamURL={remoteStream.toURL()}
                        style={styles.remoteVideo}
                        objectFit="cover"
                    />
                ) : (
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color="#0EA5E9" />
                        <Text style={styles.placeholderText}>{status}</Text>
                    </View>
                )}

                <View style={styles.header}>
                    <View style={[styles.statusBadge, { backgroundColor: remoteStream ? '#EF4444' : '#1E293B' }]}>
                        <Text style={styles.statusText}>{status.toUpperCase()}</Text>
                    </View>
                </View>
            </View>

            <View style={styles.controls}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.backButtonText}>Return to LyrinEye</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    videoContainer: { flex: 4, backgroundColor: '#000' },
    remoteVideo: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    placeholderText: { color: '#94A3B8', fontSize: 18, marginTop: 16, textAlign: 'center' },
    header: { position: 'absolute', top: 20, left: 20 },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    statusText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
    controls: { flex: 1, padding: 32, justifyContent: 'center' },
    backButton: { backgroundColor: '#1E293B', padding: 18, borderRadius: 16, alignItems: 'center' },
    backButtonText: { color: '#F8FAFC', fontSize: 16, fontWeight: '700' },
});

export default ViewerScreen;
