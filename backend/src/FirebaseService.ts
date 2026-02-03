import admin from 'firebase-admin';

let firebaseApp: admin.app.App | null = null;

export function initializeFirebase() {
    if (firebaseApp) return firebaseApp;

    // Check if we have Firebase service account credentials
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccountKey) {
        console.warn('[FIREBASE] No service account key found. Push notifications disabled.');
        return null;
    }

    try {
        const serviceAccount = JSON.parse(serviceAccountKey);
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        console.log('[FIREBASE] Initialized successfully');
        return firebaseApp;
    } catch (error) {
        console.error('[FIREBASE] Failed to initialize:', error);
        return null;
    }
}

export async function sendPushNotification(
    deviceToken: string,
    command: string,
    payload?: Record<string, string>
) {
    const app = initializeFirebase();
    if (!app) {
        throw new Error('Firebase not initialized');
    }

    const message = {
        token: deviceToken,
        data: {
            command,
            ...payload,
            timestamp: new Date().toISOString(),
        },
        android: {
            priority: 'high' as const,
        },
    };

    try {
        const response = await admin.messaging().send(message);
        console.log(`[FCM] Message sent successfully: ${response}`);
        return { success: true, messageId: response };
    } catch (error: any) {
        console.error(`[FCM] Failed to send message:`, error);
        throw new Error(`Failed to send push notification: ${error.message}`);
    }
}

export async function registerDeviceToken(deviceId: string, fcmToken: string) {
    // Store in Azure Table Storage for retrieval
    // We'll add this to the index.ts
    return { deviceId, fcmToken };
}
