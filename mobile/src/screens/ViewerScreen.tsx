import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, FlatList, ScrollView, Alert, Image, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const CACHE_KEY = '@lyrineye_recordings_cache';

const ThumbnailCycle = ({ primaryUrl }: { primaryUrl: string }) => {
    const [index, setIndex] = React.useState(0);
    const framesCount = 6;

    React.useEffect(() => {
        // If it's a legacy URL (doesn't have _0), don't cycle or handle carefully
        if (!primaryUrl.includes('_0.jpg')) return;

        const interval = setInterval(() => {
            setIndex(prev => (prev + 1) % framesCount);
        }, 1200); // 1.2s per frame
        return () => clearInterval(interval);
    }, [primaryUrl]);

    const getFrameUrl = (idx: number) => {
        return primaryUrl.replace('_0.jpg', `_${idx}.jpg`);
    };

    return (
        <Image
            source={{ uri: getFrameUrl(index) }}
            style={styles.thumbnail}
            resizeMode="cover"
        />
    );
};

const ViewerScreen = ({ navigation }: any) => {
    const [remoteStream, setRemoteStream] = useState<any>(null);
    const [status, setStatus] = useState('Conectando...');
    const [recordings, setRecordings] = useState<any[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'live' | 'recordings'>('recordings');
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedHour, setSelectedHour] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [rotation, setRotation] = useState(0);

    // ...

    const handleTabChange = (tab: 'live' | 'recordings') => {
        if (tab === 'live') {
            if (!selectedDeviceId) {
                Alert.alert("Seleccionar equipo", "Elige un equipo para ver en vivo.");
                return;
            }
            Alert.alert(
                "¿Pausar grabación?",
                "Ver en vivo pausará la grabación actual. ¿Continuar?",
                [
                    { text: "No", style: "cancel" },
                    {
                        text: "Sí", onPress: () => {
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
        loadCacheAndFetch();
        return () => cleanup();
    }, []);

    const loadCacheAndFetch = async () => {
        await loadCachedRecordings();
        fetchRecordings(); // Fetch in background
    };

    const loadCachedRecordings = async () => {
        try {
            const cached = await AsyncStorage.getItem(CACHE_KEY);
            if (cached) {
                const data = JSON.parse(cached);
                console.log(`[APP] Loaded ${data.length} recordings from cache`);
                setRecordings(data);
            }
        } catch (error) {
            console.error('Failed to load cache:', error);
        }
    };

    const fetchRecordings = async (isManualRefresh = false) => {
        if (isManualRefresh) setRefreshing(true);
        else if (recordings.length === 0) setLoading(true);

        try {
            const user = await authService.getCurrentUser();
            const baseUrl = `${CONFIG.SIGNALING_SERVER}/recordings`;
            const url = user ? `${baseUrl}?email=${encodeURIComponent(user.email)}` : baseUrl;

            console.log(`[APP] Fetching recordings for ${user?.email} from ${url}`);
            const response = await fetch(url);
            const data = await response.json();
            if (Array.isArray(data)) {
                console.log(`[APP] Received ${data.length} recordings`);
                setRecordings(data);
                await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));

                // Default to latest date and hour if not set
                if (data.length > 0 && !selectedDate && !selectedHour) {
                    const sorted = [...data].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                    const latest = sorted[0];
                    const dateObj = new Date(latest.timestamp);
                    setSelectedDate(dateObj.toLocaleDateString());
                    setSelectedHour(dateObj.getHours().toString());
                    console.log(`[APP] Auto-filtered to latest: ${dateObj.toLocaleDateString()} ${dateObj.getHours()}:00`);
                }
            } else {
                console.warn(`[APP] Unexpected response format:`, data);
                if (recordings.length === 0) setRecordings([]);
            }
        } catch (error) {
            console.error('Failed to fetch recordings:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const connectToSignaling = async () => {
        const user = await authService.getCurrentUser();
        if (!user || (!selectedDeviceId && activeTab === 'live')) return;

        const targetDevice = selectedDeviceId || 'default-room'; // Fallback if needed
        targetDeviceRef.current = targetDevice;
        socketRef.current = io(CONFIG.SIGNALING_SERVER);

        socketRef.current.on('connect', () => {
            console.log(`[APP] Connected to signaling, joining room ${targetDevice} as viewer (${user.email})`);
            setStatus('Buscando...');
            socketRef.current?.emit('join-room', targetDevice, 'viewer', user.email);
        });

        socketRef.current.on('monitor-online', () => {
            setStatus('Esperando...');
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
            setStatus('Desconectado');
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
                setStatus('VIVO');
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

    const skipToNext = () => {
        const currentIndex = filteredRecordings.findIndex(r => r.url === selectedVideo);
        if (currentIndex < filteredRecordings.length - 1) {
            setSelectedVideo(filteredRecordings[currentIndex + 1].url);
        }
    };

    const skipToPrev = () => {
        const currentIndex = filteredRecordings.findIndex(r => r.url === selectedVideo);
        if (currentIndex > 0) {
            setSelectedVideo(filteredRecordings[currentIndex - 1].url);
        }
    };

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
                    <Text style={[styles.tabText, activeTab === 'live' && styles.activeTabText]}>EN VIVO</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'recordings' && styles.activeTab]}
                    onPress={() => handleTabChange('recordings')}
                >
                    <Text style={[styles.tabText, activeTab === 'recordings' && styles.activeTabText]}>GALERÍA</Text>
                </TouchableOpacity>
            </View>

            {activeTab === 'live' ? (
                <View style={styles.content}>
                    {remoteStream ? (
                        <View style={{ flex: 1 }}>
                            <RTCView
                                streamURL={remoteStream.toURL()}
                                style={[styles.fullVideo, { transform: [{ rotate: `${rotation}deg` }] }]}
                                objectFit="contain"
                                mirror={false}
                            />
                            <TouchableOpacity
                                style={styles.rotateButton}
                                onPress={() => setRotation(prev => (prev + 90) % 360)}
                            >
                                <Text style={{ fontSize: 20 }}>🔄</Text>
                            </TouchableOpacity>
                        </View>
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
                                    <Text style={[styles.filterText, !selectedDeviceId && styles.activeFilterText]}>Todos</Text>
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
                                    <Text style={[styles.filterText, !selectedDate && styles.activeFilterText]}>Todas</Text>
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
                                        <Text style={[styles.filterText, selectedHour === null && styles.activeFilterText]}>Todas</Text>
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
                                style={[styles.fullVideo, { transform: [{ rotate: `${rotation}deg` }] }]}
                                controls={true}
                                resizeMode="contain"
                            />

                            {/* Player Overlays */}
                            <TouchableOpacity
                                style={styles.rotateButton}
                                onPress={() => setRotation(prev => (prev + 90) % 360)}
                            >
                                <Text style={{ fontSize: 20 }}>🔄</Text>
                            </TouchableOpacity>

                            <View style={styles.skipControls}>
                                <TouchableOpacity
                                    style={[styles.skipButton, filteredRecordings.findIndex(r => r.url === selectedVideo) >= filteredRecordings.length - 1 && styles.disabledSkip]}
                                    onPress={skipToPrev}
                                    disabled={filteredRecordings.findIndex(r => r.url === selectedVideo) >= filteredRecordings.length - 1}
                                >
                                    <Text style={styles.skipText}>⏮️ Ant</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.skipButton, filteredRecordings.findIndex(r => r.url === selectedVideo) <= 0 && styles.disabledSkip]}
                                    onPress={skipToNext}
                                    disabled={filteredRecordings.findIndex(r => r.url === selectedVideo) <= 0}
                                >
                                    <Text style={styles.skipText}>Sig ⏭️</Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity
                                style={styles.closePlayer}
                                onPress={() => setSelectedVideo(null)}
                            >
                                <Text style={styles.closePlayerText}>Cerrar</Text>
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
                                            item.thumbnailUrl.includes('_0.jpg') ? (
                                                <ThumbnailCycle primaryUrl={item.thumbnailUrl} />
                                            ) : (
                                                <Image
                                                    source={{ uri: item.thumbnailUrl }}
                                                    style={styles.thumbnail}
                                                    resizeMode="cover"
                                                    onError={() => {
                                                        item.thumbnailUrl = null;
                                                    }}
                                                />
                                            )
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
                            refreshControl={
                                <RefreshControl
                                    refreshing={refreshing}
                                    onRefresh={() => fetchRecordings(true)}
                                    tintColor="#0EA5E9"
                                    colors={["#0EA5E9"]}
                                />
                            }
                            ListEmptyComponent={
                                <View style={styles.centered}>
                                    <Text style={styles.placeholderText}>Sin grabaciones</Text>
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
                        {selectedVideo ? "Cerrar" : "Volver"}
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
    rotateButton: { position: 'absolute', top: 20, right: 20, backgroundColor: 'rgba(255,255,255,0.3)', padding: 10, borderRadius: 25, zIndex: 100 },
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
    skipControls: {
        position: 'absolute',
        top: '50%',
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginTop: -30,
    },
    skipButton: {
        backgroundColor: 'rgba(30, 41, 59, 0.7)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    disabledSkip: {
        opacity: 0.3,
    },
    skipText: {
        color: '#FFF',
        fontWeight: '700',
        fontSize: 14,
    },
});

export default ViewerScreen;
