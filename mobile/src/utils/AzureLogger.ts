import DeviceInfo from 'react-native-device-info';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';
import { sha256 } from 'js-sha256';

// DEBUGGING ONLY: Shared Key should not be frontend exposed in production
const WORKSPACE_ID = '4293cd25-8e2b-475a-a591-fc110d03fac7';
const SHARED_KEY = 'PJPAhdMxZ2302xbfz5PDgfnkNTb1JHt/c5T1UFz7Q53S5gIYr6UxZwPbpTPm7OEIsbJPnhAEMxw7BAGXAGikuw==';

class AzureLoggerService {
    private appVersion = `${DeviceInfo.getVersion()}.${DeviceInfo.getBuildNumber()}`;
    private deviceName = '';
    private androidVersion = DeviceInfo.getSystemVersion();

    constructor() {
        DeviceInfo.getDeviceName().then(name => this.deviceName = name);
    }

    async checkInstallation() {
        try {
            const hasRun = await AsyncStorage.getItem('LYRINEYE_HAS_RUN');
            if (!hasRun) {
                await this.log('App Installed (First Run)', { mode: 'system' });
                await AsyncStorage.setItem('LYRINEYE_HAS_RUN', 'true');
            }
        } catch (e) {
            console.error('Failed to check installation status', e);
        }
    }

    async getSystemMetrics() {
        try {
            const batteryLevel = await DeviceInfo.getBatteryLevel();
            const freeDisk = await DeviceInfo.getFreeDiskStorage();
            const totalMemory = await DeviceInfo.getTotalMemory();

            return {
                BatteryLevel: (batteryLevel * 100).toFixed(1) + '%',
                FreeDisk: (freeDisk / 1024 / 1024 / 1024).toFixed(2) + ' GB',
                TotalMemory: (totalMemory / 1024 / 1024 / 1024).toFixed(2) + ' GB'
            };
        } catch (e) {
            return { error: 'Failed to retrieve metrics' };
        }
    }

    async log(message: string, context: Record<string, any> = {}, level: 'INFO' | 'ERROR' | 'WARN' = 'INFO') {
        try {
            const netState = await NetInfo.fetch();

            const logEntry = {
                AppVersion: this.appVersion,
                LogText: message,
                Timestamp: new Date().toISOString(),
                ClientIP: (netState.details as any)?.ipAddress || 'unknown',
                WifiSSID: (netState.details as any)?.ssid || 'unknown', // Android specific, requires location permission often
                DeviceName: this.deviceName,
                AndroidVersion: this.androidVersion,
                ConnectionStart: netState.isConnected,
                Mode: context.mode || 'unknown',
                Streaming: context.streaming || false,
                Exceptions: context.error ? String(context.error) : null,
                LogLevel: level
            };

            await this.sendToAzure(logEntry);
        } catch (err) {
            console.error('Failed to send log to Azure:', err);
        }
    }

    private async sendToAzure(jsonPayload: any) {
        const date = new Date().toUTCString();
        const body = JSON.stringify([jsonPayload]); // Azure expects an array
        const contentLength = Buffer.byteLength(body, 'utf8');

        const signature = this.buildSignature(date, contentLength);

        await fetch(`https://${WORKSPACE_ID}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01`, {
            method: 'POST',
            headers: {
                'Authorization': signature,
                'Log-Type': 'LyrinEyeLogs',
                'x-ms-date': date,
                'time-generated-field': 'Timestamp',
                'Content-Type': 'application/json'
            },
            body: body
        });
    }

    private buildSignature(date: string, contentLength: number): string {
        const method = 'POST';
        const contentType = 'application/json';
        const resource = '/api/logs';

        const stringToSign = `${method}\n${contentLength}\n${contentType}\nx-ms-date:${date}\n${resource}`;

        // HMAC-SHA256 decoding key from base64 first
        const keyBytes = Buffer.from(SHARED_KEY, 'base64');

        // Using js-sha256 correctly with hmac
        const hmac = sha256.hmac.create(keyBytes);
        hmac.update(stringToSign);
        const signature = Buffer.from(hmac.array()).toString('base64');

        return `SharedKey ${WORKSPACE_ID}:${signature}`;
    }
}

export const AzureLogger = new AzureLoggerService();
