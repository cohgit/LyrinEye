import messaging from '@react-native-firebase/messaging';
import axios from 'axios';
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

const BACKEND_URL = 'https://lyrineye-backend.icymoss-5b66c974.eastus.azurecontainerapps.io';

class FCMService {
    private deviceId: string = '';

    async init() {
        try {
            this.deviceId = await DeviceInfo.getUniqueId();

            // Request notification permission (iOS requires this, Android for API 33+)
            const authStatus = await messaging().requestPermission();
            const enabled =
                authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                authStatus === messaging.AuthorizationStatus.PROVISIONAL;

            if (!enabled) {
                console.warn('[FCM] Notification permission denied');
                return;
            }

            console.log('[FCM] Notification permission granted');

            // Get FCM token
            const token = await messaging().getToken();
            console.log('[FCM] Device token:', token.substring(0, 20) + '...');

            // Register token with backend
            await this.registerToken(token);

            // Listen for token refresh
            messaging().onTokenRefresh(async (newToken) => {
                console.log('[FCM] Token refreshed');
                await this.registerToken(newToken);
            });

            // Listen for foreground messages
            messaging().onMessage(async (remoteMessage) => {
                console.log('[FCM] Foreground message received:', remoteMessage.data);
                await this.handleMessage(remoteMessage);
            });

            // Background/Quit state message handler
            messaging().setBackgroundMessageHandler(async (remoteMessage) => {
                console.log('[FCM] Background message received:', remoteMessage.data);
                await this.handleMessage(remoteMessage);
            });

            console.log('[FCM] Service initialized successfully');
        } catch (error) {
            console.error('[FCM] Initialization failed:', error);
        }
    }

    private async registerToken(token: string) {
        try {
            await axios.post(`${BACKEND_URL}/api/devices/register-token`, {
                deviceId: this.deviceId,
                fcmToken: token,
            });
            console.log('[FCM] Token registered with backend');
        } catch (error) {
            console.error('[FCM] Failed to register token:', error);
        }
    }

    private async handleMessage(remoteMessage: any) {
        const { data } = remoteMessage;

        if (!data || !data.command) {
            console.warn('[FCM] Invalid message format');
            return;
        }

        console.log(`[FCM] Executing command: ${data.command}`);

        switch (data.command) {
            case 'request_logcat':
                await this.handleLogcatRequest();
                break;
            case 'start_recording':
                await this.handleRecordingRequest();
                break;
            default:
                console.warn(`[FCM] Unknown command: ${data.command}`);
        }
    }

    private async handleLogcatRequest() {
        console.log('[FCM] Logcat request received - will implement capture');
        // This will be implemented in LogcatCapture.ts
    }

    private async handleRecordingRequest() {
        console.log('[FCM] Recording request received - waking up camera');
        // TODO: Implement actual camera wake up and recording start logic
        // This requires permissions and foreground service management
    }
}

export const FCM = new FCMService();
