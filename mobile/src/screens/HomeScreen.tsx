import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, StatusBar, Switch } from 'react-native';
import { authService } from '../utils/AuthService';
import { LogcatCapture } from '../utils/LogcatCapture';

const HomeScreen = ({ navigation }: any) => {
  const [isLogcatActive, setIsLogcatActive] = useState(LogcatCapture.getStreamingStatus());

  const toggleLogcat = async () => {
    if (isLogcatActive) {
      LogcatCapture.stopStreaming();
      setIsLogcatActive(false);
    } else {
      await LogcatCapture.startStreaming();
      setIsLogcatActive(true);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.title}>LyrinEye</Text>
        <Text style={styles.subtitle}>Seguridad</Text>
      </View>

      <View style={styles.cardContainer}>
        <View style={styles.logcatRow}>
          <View>
            <Text style={styles.logcatTitle}>Transmitir Logcat</Text>
            <Text style={styles.logcatSubtitle}>Enviar registros al sistema</Text>
          </View>
          <Switch
            value={isLogcatActive}
            onValueChange={toggleLogcat}
            trackColor={{ false: '#334155', true: '#38BDF8' }}
            thumbColor={isLogcatActive ? '#F8FAFC' : '#94A3B8'}
          />
        </View>

        <TouchableOpacity
          style={[styles.card, styles.monitorCard]}
          onPress={() => navigation.navigate('Monitor')}
        >
          <Text style={styles.cardEmoji}>📹</Text>
          <Text style={styles.cardTitle}>Monitor</Text>
          <Text style={styles.cardDescription}>Trasmitir y grabar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, styles.viewerCard]}
          onPress={() => navigation.navigate('Viewer')}
        >
          <Text style={styles.cardEmoji}>📱</Text>
          <Text style={styles.cardTitle}>Galería</Text>
          <Text style={styles.cardDescription}>Ver en vivo y grabaciones</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={async () => {
            await authService.signOut();
            navigation.replace('Login');
          }}
        >
          <Text style={styles.logoutButtonText}>Salir</Text>
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
    gap: 16,
  },
  logcatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(51, 65, 85, 0.4)',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.1)',
    marginBottom: 4,
  },
  logcatTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '600',
  },
  logcatSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
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
  logoutButton: {
    marginTop: 20,
    paddingVertical: 12,
    alignItems: 'center',
    width: '100%',
  },
  logoutButtonText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

export default HomeScreen;
