import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar } from 'react-native';

const HomeScreen = ({ navigation }: any) => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.title}>LyrinEye</Text>
        <Text style={styles.subtitle}>Smart Surveillance System</Text>
      </View>

      <View style={styles.cardContainer}>
        <TouchableOpacity 
          style={[styles.card, styles.monitorCard]} 
          onPress={() => navigation.navigate('Monitor')}
        >
          <Text style={styles.cardEmoji}>📹</Text>
          <Text style={styles.cardTitle}>Monitor Mode</Text>
          <Text style={styles.cardDescription}>Use this device as a security camera.</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.card, styles.viewerCard]} 
          onPress={() => navigation.navigate('Viewer')}
        >
          <Text style={styles.cardEmoji}>📱</Text>
          <Text style={styles.cardTitle}>Viewer Mode</Text>
          <Text style={styles.cardDescription}>Watch your live streams and recordings.</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 24,
  },
  header: {
    marginTop: 60,
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 18,
    color: '#94A3B8',
    marginTop: 8,
  },
  cardContainer: {
    flex: 1,
    gap: 20,
  },
  card: {
    flex: 1,
    borderRadius: 24,
    padding: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  monitorCard: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  viewerCard: {
    backgroundColor: 'rgba(129, 140, 248, 0.1)',
    borderColor: 'rgba(129, 140, 248, 0.2)',
  },
  cardEmoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 12,
  },
  cardDescription: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default HomeScreen;
