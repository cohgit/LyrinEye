import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';

const ViewerScreen = ({ navigation }: any) => {
    const dummyCameras = [
        { id: '1', name: 'Front Door', status: 'Live' },
        { id: '2', name: 'Living Room', status: 'Offline' },
    ];

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>All Cameras</Text>
            </View>

            <FlatList
                data={dummyCameras}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <TouchableOpacity style={styles.cameraCard}>
                        <View style={styles.thumbnailPlaceholder}>
                            <Text style={styles.thumbnailText}>{item.status === 'Live' ? 'LIVE FEED' : 'NO SIGNAL'}</Text>
                        </View>
                        <View style={styles.cameraInfo}>
                            <Text style={styles.cameraName}>{item.name}</Text>
                            <View style={[styles.statusDot, { backgroundColor: item.status === 'Live' ? '#22C55E' : '#94A3B8' }]} />
                        </View>
                    </TouchableOpacity>
                )}
                contentContainerStyle={styles.listContent}
            />

            <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.goBack()}
            >
                <Text style={styles.backButtonText}>Return Home</Text>
            </TouchableOpacity>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F172A',
    },
    header: {
        padding: 24,
        paddingTop: 40,
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: '#F8FAFC',
    },
    listContent: {
        padding: 24,
        gap: 24,
    },
    cameraCard: {
        backgroundColor: '#1E293B',
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    thumbnailPlaceholder: {
        height: 200,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    thumbnailText: {
        color: '#475569',
        fontWeight: '700',
        letterSpacing: 2,
    },
    cameraInfo: {
        padding: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cameraName: {
        color: '#F8FAFC',
        fontSize: 18,
        fontWeight: '600',
    },
    statusDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    backButton: {
        padding: 24,
        alignItems: 'center',
    },
    backButtonText: {
        color: '#64748B',
        fontSize: 16,
    },
});

export default ViewerScreen;
