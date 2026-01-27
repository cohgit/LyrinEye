import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Image } from 'react-native';
import { authService } from '../utils/AuthService';
import { AzureLogger } from '../utils/AzureLogger';

const LoginScreen = ({ navigation }: any) => {
    const [loading, setLoading] = useState(false);

    React.useEffect(() => {
        const checkUser = async () => {
            const user = await authService.getCurrentUser();
            if (user) {
                navigation.replace('Home');
            }
        };
        checkUser();
    }, []);

    const handleLogin = async () => {
        setLoading(true);
        try {
            const response = await authService.signIn();
            if (response.type === 'success') {
                AzureLogger.log('User Logged In', { email: response.data.user.email.toLowerCase() });
                navigation.replace('Home');
            }
        } catch (error) {
            AzureLogger.log('Login Failed', { error: String(error) }, 'ERROR');
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={styles.logoContainer}>
                    <Image
                        source={require('../../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png')}
                        style={styles.logo}
                    />
                    <Text style={styles.title}>LyrinEye</Text>
                    <Text style={styles.subtitle}>Securing your space, using your past.</Text>
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color="#0EA5E9" />
                ) : (
                    <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
                        <Text style={styles.loginButtonText}>Sign in with Google</Text>
                    </TouchableOpacity>
                )}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    logoContainer: { alignItems: 'center', marginBottom: 60 },
    logo: { width: 120, height: 120, marginBottom: 24, borderRadius: 24 },
    title: { color: '#FFF', fontSize: 32, fontWeight: '800' },
    subtitle: { color: '#94A3B8', fontSize: 16, textAlign: 'center', marginTop: 8 },
    loginButton: { backgroundColor: '#FFF', width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
    loginButtonText: { color: '#0F172A', fontSize: 16, fontWeight: '700' },
});

export default LoginScreen;
