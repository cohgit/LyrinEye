import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_SESSION_KEY = '@lyrineye_user_session';

class AuthService {
    constructor() {
        GoogleSignin.configure({
            webClientId: '356025406156-j39p40qrlko37mbff3lb71hjnc4dmmt9.apps.googleusercontent.com',
            offlineAccess: true,
            forceCodeForRefreshToken: true,
        });
    }

    async signIn() {
        try {
            await GoogleSignin.hasPlayServices();
            const userInfo = await GoogleSignin.signIn();
            const standardizedUser = userInfo.data ? userInfo.data.user : userInfo.user;
            await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(standardizedUser));
            return userInfo; // Keep returning original for LoginScreen type check
        } catch (error) {
            console.error('Sign-In Error:', error);
            throw error;
        }
    }

    async signOut() {
        try {
            await GoogleSignin.signOut();
            await AsyncStorage.removeItem(USER_SESSION_KEY);
        } catch (error) {
            console.error('Sign-Out Error:', error);
        }
    }

    async getCurrentUser() {
        const session = await AsyncStorage.getItem(USER_SESSION_KEY);
        if (!session) return null;
        return JSON.parse(session); // Now stores the flattened user object
    }
}

export const authService = new AuthService();
