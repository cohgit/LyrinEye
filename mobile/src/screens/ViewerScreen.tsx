import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, FlatList, ScrollView, Alert, Image } from 'react-native';
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, RTCView } from 'react-native-webrtc';
import { io, Socket } from 'socket.io-client';
import Video from 'react-native-video';
import { CONFIG } from '../config';
import { authService } from '../utils/AuthService';

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
    const [activeTab, setActiveTab] = useState<'live' | 'recordings'>('recordings');
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedHour, setSelectedHour] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // ...

    const handleTabChange = (tab: 'live' | 'recordings') => {
        if (tab === 'live') {
            if (!selectedDeviceId) {
                Alert.alert("Select a Device", "Please select a device from the filter above to watch live feed.");
                return;
            }
            Alert.alert(
                "Stop Recording?",
                "Viewing the live stream will pause recording on the Monitor device. Continue?",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Continue", onPress: () => {
                            setActiveTab('live');
                            connectToSignaling();
                        }
                    }
                ]
            );
        } else {
            setActiveTab('recordings');
            cleanupWebRTC();
            fetchRecordings();
        }
    };

    const socketRef = useRef<Socket | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);

    useEffect(() => {
        connectToSignaling();
        fetchRecordings();
        return () => cleanup();
    }, []);

    const fetchRecordings = async () => {
        setLoading(true);
        try {
            const user = await authService.getCurrentUser();
            const baseUrl = `${CONFIG.SIGNALING_SERVER}/recordings`;
            const url = user ? `${baseUrl}?email=${encodeURIComponent(user.user.email)}` : baseUrl;

            console.log(`[APP] Fetching recordings for ${user.user.email} from ${url}`);
            const response = await fetch(url);
            const data = await response.json();
            console.log(`[APP] Received ${data.length} recordings`);
            setRecordings(data);
        } catch (error) {
            console.error('Failed to fetch recordings:', error);
        } finally {
            setLoading(false);
        }
    };

    const connectToSignaling = async () => {
        const user = await authService.getCurrentUser();
        if (!user || (!selectedDeviceId && activeTab === 'live')) return;

        const targetDevice = selectedDeviceId || 'default-room'; // Fallback if needed
        targetDeviceRef.current = targetDevice;
        socketRef.current = io(CONFIG.SIGNALING_SERVER);

        socketRef.current.on('connect', () => {
            console.log(`[APP] Connected to signaling, joining room ${targetDevice} as viewer (${user.user.email})`);
            setStatus('Searching for monitor...');
            socketRef.current?.emit('join-room', targetDevice, 'viewer', user.user.email);
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

    const targetDeviceRef = useRef<string | null>(null);

    const handleOffer = async (monitorId: string, offer: any) => {
        cleanupWebRTC();
        const pc = new RTCPeerConnection(configuration);
        pcRef.current = pc;

        (pc as any).onicecandidate = (event: any) => {
            if (event.candidate) {
                socketRef.current?.emit('ice-candidate', { roomId: targetDeviceRef.current || 'default-room', candidate: event.candidate, to: monitorId });
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

        socketRef.current?.emit('answer', { roomId: targetDeviceRef.current || 'default-room', answer, to: monitorId });
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

    const uniqueDevices = Array.from(new Set(recordings.map(r => r.deviceId).filter(Boolean)));
    const uniqueDates = Array.from(new Set(recordings.map(r => new Date(r.timestamp).toLocaleDateString()))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    const uniqueHours = selectedDate
        ? Array.from(new Set(recordings
            .filter(r => new Date(r.timestamp).toLocaleDateString() === selectedDate)
            .map(r => new Date(r.timestamp).getHours())))
            .sort((a, b) => a - b)
        : [];

    const filteredRecordings = recordings
        .filter(r => {
            const date = new Date(r.timestamp);
            const matchesDevice = selectedDeviceId ? r.deviceId === selectedDeviceId : true;
            const matchesDate = selectedDate ? date.toLocaleDateString() === selectedDate : true;
            const matchesHour = selectedHour !== null ? date.getHours() === parseInt(selectedHour) : true;
            return matchesDevice && matchesDate && matchesHour;
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return (
        <SafeAreaView style={styles.container}>
            {/* Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'live' && styles.activeTab]}
                    onPress={() => handleTabChange('live')}
                >
                    <Text style={[styles.tabText, activeTab === 'live' && styles.activeTabText]}>LIVE FEED</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'recordings' && styles.activeTab]}
                    onPress={() => handleTabChange('recordings')}
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
                            mirror={false}
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
                    {/* Filters */}
                    {!selectedVideo && (
                        <View>
                            {/* Device Filter */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
                                <TouchableOpacity
                                    style={[styles.filterChip, !selectedDeviceId && styles.activeFilter]}
                                    onPress={() => setSelectedDeviceId(null)}
                                >
                                    <Text style={[styles.filterText, !selectedDeviceId && styles.activeFilterText]}>All Devices</Text>
                                </TouchableOpacity>
                                {uniqueDevices.map(id => (
                                    <TouchableOpacity
                                        key={id}
                                        style={[styles.filterChip, selectedDeviceId === id && styles.activeFilter]}
                                        onPress={() => setSelectedDeviceId(id)}
                                    >
                                        <Text style={[styles.filterText, selectedDeviceId === id && styles.activeFilterText]}>📱 {id.slice(0, 6)}...</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {/* Date Filter */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
                                <TouchableOpacity
                                    style={[styles.filterChip, !selectedDate && styles.activeFilter]}
                                    onPress={() => { setSelectedDate(null); setSelectedHour(null); }}
                                >
                                    <Text style={[styles.filterText, !selectedDate && styles.activeFilterText]}>All Dates</Text>
                                </TouchableOpacity>
                                {uniqueDates.map(date => (
                                    <TouchableOpacity
                                        key={date}
                                        style={[styles.filterChip, selectedDate === date && styles.activeFilter]}
                                        onPress={() => { setSelectedDate(date); setSelectedHour(null); }}
                                    >
                                        <Text style={[styles.filterText, selectedDate === date && styles.activeFilterText]}>📅 {date}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {/* Hour Filter */}
                            {selectedDate && uniqueHours.length > 0 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
                                    <TouchableOpacity
                                        style={[styles.filterChip, selectedHour === null && styles.activeFilter]}
                                        onPress={() => setSelectedHour(null)}
                                    >
                                        <Text style={[styles.filterText, selectedHour === null && styles.activeFilterText]}>All Hours</Text>
                                    </TouchableOpacity>
                                    {uniqueHours.map(hour => (
                                        <TouchableOpacity
                                            key={hour}
                                            style={[styles.filterChip, selectedHour === hour.toString() && styles.activeFilter]}
                                            onPress={() => setSelectedHour(hour.toString())}
                                        >
                                            <Text style={[styles.filterText, selectedHour === hour.toString() && styles.activeFilterText]}>⏰ {hour}:00</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            )}
                        </View>
                    )}

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
                            data={filteredRecordings}
                            keyExtractor={(item) => item.rowKey}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={styles.recordingCard}
                                    onPress={() => setSelectedVideo(item.url)}
                                >
                                    <View style={styles.recordingIcon}>
                                        {item.thumbnailUrl ? (
                                            <Image
                                                source={{ uri: item.thumbnailUrl }}
                                                style={styles.thumbnail}
                                                resizeMode="cover"
                                            />
                                        ) : (
                                            <Text style={{ fontSize: 24 }}>🎥</Text>
                                        )}
                                    </View>
                                    <View style={styles.recordingInfo}>
                                        <Text style={styles.recordingDate}>{formatDate(item.timestamp)}</Text>
                                        <Text style={styles.recordingDetails}>
                                            ⏰ {new Date(item.timestamp).getHours().toString().padStart(2, '0')}:00h • {item.duration}s • {item.deviceId ? `📱 ${item.deviceId.slice(0, 8)}` : 'Unknown'}
                                        </Text>
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
                    onPress={() => {
                        if (selectedVideo) {
                            setSelectedVideo(null);
                        } else {
                            navigation.goBack();
                        }
                    }}
                >
                    <Text style={styles.backButtonText}>
                        {selectedVideo ? "Close Player" : "Return to Home"}
                    </Text>
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
    filterRow: { maxHeight: 50, marginBottom: 8 },
    filterContent: { paddingHorizontal: 16, gap: 8 },
    filterChip: { backgroundColor: '#1E293B', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
    activeFilter: { backgroundColor: '#0EA5E9', borderColor: '#0EA5E9' },
    filterText: { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
    activeFilterText: { color: '#FFF' },
    thumbnail: { width: '100%', height: '100%', borderRadius: 12 },
});

export default ViewerScreen;
