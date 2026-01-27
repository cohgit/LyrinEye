import { GoogleSignin } from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_SESSION_KEY = '@lyrineye_user_session';

class AuthService {
    constructor() {
        GoogleSignin.configure({
            webClientId: '356025406156-j39p40qrlko37mbff3lb71hjnc4dmmt9.apps.googleusercontent.com',
            offlineAccess: true,
            forceCodeForRefreshToken: true,
            scopes: ['email', 'profile'],
        });
    }

    async signIn() {
        try {
            await GoogleSignin.hasPlayServices();
            const userInfo = await GoogleSignin.signIn();

            // Raw log for debugging email absence
            console.log('Raw Auth Object:', JSON.stringify(userInfo, null, 2));

            if ('user' in userInfo || (userInfo as any).data) {
                const standardizedUser = (userInfo as any).data ? (userInfo as any).data.user : (userInfo as any).user;
                console.log('Standardized User:', JSON.stringify(standardizedUser, null, 2));
                await AsyncStorage.setItem(USER_SESSION_KEY, JSON.stringify(standardizedUser));
            }
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
        let userInfo = JSON.parse(session);

        // Handle legacy wraps: { type: 'success', data: { user: { ... } } }
        if (userInfo.data && userInfo.data.user) {
            return userInfo.data.user;
        }
        // Handle intermediate wraps: { user: { ... } }
        if (userInfo.user) {
            return userInfo.user;
        }

        return userInfo;
    }
}

export const authService = new AuthService();
