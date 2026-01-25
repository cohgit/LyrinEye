import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, FlatList, ScrollView } from 'react-native';
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, RTCView } from 'react-native-webrtc';
import { io, Socket } from 'socket.io-client';
import Video from 'react-native-video'; // We should probably use this for recorded files
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
    const [recordings, setRecordings] = useState<any[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'live' | 'recordings'>('live');

    const socketRef = useRef<Socket | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);

    useEffect(() => {
        connectToSignaling();
        fetchRecordings();
        return () => cleanup();
    }, []);

    const fetchRecordings = async () => {
        try {
            const response = await fetch(`${CONFIG.SIGNALING_SERVER}/recordings?roomId=default-room`);
            const data = await response.json();
            setRecordings(data);
        } catch (error) {
            console.error('Failed to fetch recordings:', error);
        }
    };

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

        (pc as any).onicecandidate = (event: any) => {
            if (event.candidate) {
                socketRef.current?.emit('ice-candidate', { roomId: 'default-room', candidate: event.candidate, to: monitorId });
            }
        };

        (pc as any).ontrack = (event: any) => {
            if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
                setStatus('LIVE');
            }
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

    const formatDate = (isoString: string) => {
        const d = new Date(isoString);
        return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'live' && styles.activeTab]}
                    onPress={() => setActiveTab('live')}
                >
                    <Text style={[styles.tabText, activeTab === 'live' && styles.activeTabText]}>LIVE FEED</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'recordings' && styles.activeTab]}
                    onPress={() => {
                        setActiveTab('recordings');
                        fetchRecordings();
                    }}
                >
                    <Text style={[styles.tabText, activeTab === 'recordings' && styles.activeTabText]}>RECORDINGS</Text>
                </TouchableOpacity>
            </View>

            {activeTab === 'live' ? (
                <View style={styles.content}>
                    {remoteStream ? (
                        <RTCView
                            streamURL={remoteStream.toURL()}
                            style={styles.fullVideo}
                            objectFit="cover"
                        />
                    ) : (
                        <View style={styles.centered}>
                            <ActivityIndicator size="large" color="#0EA5E9" />
                            <Text style={styles.placeholderText}>{status}</Text>
                        </View>
                    )}
                </View>
            ) : (
                <View style={styles.content}>
                    {selectedVideo ? (
                        <View style={styles.playerContainer}>
                            <Video
                                source={{ uri: selectedVideo }}
                                style={styles.fullVideo}
                                controls={true}
                                resizeMode="contain"
                            />
                            <TouchableOpacity
                                style={styles.closePlayer}
                                onPress={() => setSelectedVideo(null)}
                            >
                                <Text style={styles.closePlayerText}>Close Player</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <FlatList
                            data={recordings}
                            keyExtractor={(item) => item.rowKey}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.recordingCard}
                                    onPress={() => setSelectedVideo(item.url)}
                                >
                                    <View style={styles.recordingIcon}>
                                        <Text style={{ fontSize: 24 }}>🎥</Text>
                                    </View>
                                    <View style={styles.recordingInfo}>
                                        <Text style={styles.recordingDate}>{formatDate(item.timestamp)}</Text>
                                        <Text style={styles.recordingDetails}>{item.duration}s • {item.rowKey}</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                            contentContainerStyle={styles.listContent}
                            ListEmptyComponent={
                                <View style={styles.centered}>
                                    <Text style={styles.placeholderText}>No recordings found</Text>
                                </View>
                            }
                        />
                    )}
                </View>
            )}

            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.backButtonText}>Return to Home</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    tabContainer: { flexDirection: 'row', backgroundColor: '#1E293B', padding: 4, margin: 16, borderRadius: 12 },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
    activeTab: { backgroundColor: '#0EA5E9' },
    tabText: { color: '#94A3B8', fontWeight: '700', fontSize: 13 },
    activeTabText: { color: '#FFF' },
    content: { flex: 1 },
    fullVideo: { flex: 1, backgroundColor: '#000' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    placeholderText: { color: '#94A3B8', fontSize: 16, marginTop: 16 },
    listContent: { padding: 16, gap: 12 },
    recordingCard: { backgroundColor: '#1E293B', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center' },
    recordingIcon: { width: 50, height: 50, backgroundColor: 'rgba(14, 165, 233, 0.1)', borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    recordingInfo: { flex: 1 },
    recordingDate: { color: '#F8FAFC', fontSize: 16, fontWeight: '600' },
    recordingDetails: { color: '#64748B', fontSize: 12, marginTop: 4 },
    playerContainer: { flex: 1, backgroundColor: '#000' },
    closePlayer: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
    closePlayerText: { color: '#FFF', fontWeight: '600' },
    footer: { padding: 16 },
    backButton: { padding: 16, alignItems: 'center' },
    backButtonText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
});

export default ViewerScreen;
