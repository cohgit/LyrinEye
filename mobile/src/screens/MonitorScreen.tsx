import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Linking } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useMicrophonePermission } from 'react-native-vision-camera';

const MonitorScreen = ({ navigation }: any) => {
    const device = useCameraDevice('back');
    const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
    const { hasPermission: hasMicrophonePermission, requestPermission: requestMicrophonePermission } = useMicrophonePermission();

    const [isStreaming, setIsStreaming] = useState(false);

    useEffect(() => {
        const checkPermissions = async () => {
            if (!hasCameraPermission) {
                await requestCameraPermission();
            }
            if (!hasMicrophonePermission) {
                await requestMicrophonePermission();
            }
        };
        checkPermissions();
    }, [hasCameraPermission, hasMicrophonePermission, requestCameraPermission, requestMicrophonePermission]);

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
                    style={StyleSheet.absoluteFill}
                    device={device}
                    isActive={true}
                    video={true}
                    audio={hasMicrophonePermission}
                />
                <View style={styles.overlay}>
                    {isStreaming && <View style={styles.recordingDot} />}
                    <Text style={styles.liveIndicator}>{isStreaming ? 'LIVE' : 'PREVIEW'}</Text>
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
                    <Text style={styles.startButtonText}>{isStreaming ? 'STOP STREAMING' : 'START STREAMING'}</Text>
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
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    previewContainer: {
        flex: 3,
        backgroundColor: '#000',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        padding: 32,
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
    },
    placeholderText: {
        color: '#94A3B8',
        fontSize: 18,
        marginTop: 16,
    },
    errorText: {
        color: '#EF4444',
        fontSize: 20,
        fontWeight: '700',
        marginBottom: 20,
        textAlign: 'center',
    },
    liveIndicator: {
        color: '#FFF',
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 4,
        fontWeight: '800',
        overflow: 'hidden',
    },
    recordingDot: {
        position: 'absolute',
        top: 32,
        left: 32,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#EF4444',
    },
    controls: {
        flex: 1,
        backgroundColor: '#0F172A',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusBadge: {
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 100,
        marginBottom: 24,
    },
    statusText: {
        color: '#4ADE80',
        fontWeight: '700',
        letterSpacing: 1,
    },
    startButton: {
        backgroundColor: '#0EA5E9',
        width: '100%',
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
        marginBottom: 16,
    },
    stopButton: {
        backgroundColor: '#EF4444',
    },
    startButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '800',
    },
    backButton: {
        padding: 12,
    },
    backButtonText: {
        color: '#64748B',
        fontSize: 16,
    },
    settingsButton: {
        backgroundColor: '#1E293B',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
    },
    settingsButtonText: {
        color: '#F8FAFC',
        fontWeight: '600',
    },
});

export default MonitorScreen;
