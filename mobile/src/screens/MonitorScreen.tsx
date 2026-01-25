import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';

const MonitorScreen = ({ navigation }: any) => {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.previewContainer}>
                <View style={styles.cameraPlaceholder}>
                    <Text style={styles.placeholderText}>Camera Feed Preview</Text>
                    <View style={styles.recordingDot} />
                </View>
            </View>

            <View style={styles.controls}>
                <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>STATUS: READY</Text>
                </View>

                <TouchableOpacity style={styles.startButton}>
                    <Text style={styles.startButtonText}>START STREAMING</Text>
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
        justifyContent: 'center',
        alignItems: 'center',
    },
    cameraPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#1E293B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderText: {
        color: '#94A3B8',
        fontSize: 18,
        fontStyle: 'italic',
    },
    recordingDot: {
        position: 'absolute',
        top: 40,
        right: 40,
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
});

export default MonitorScreen;
