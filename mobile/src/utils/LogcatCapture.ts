import RNFS from 'react-native-fs';
import { Platform, PermissionsAndroid } from 'react-native';
import axios from 'axios';
import DeviceInfo from 'react-native-device-info';

const BACKEND_URL = 'https://lyrineye-backend.icymoss-5b66c974.eastus.azurecontainerapps.io';

export interface LogcatEntry {
    timestamp: string;
    tag?: string;
    priority?: string;
    message: string;
    pid?: number;
}

class LogcatCaptureService {
    async captureLastN(lines: number = 500): Promise<LogcatEntry[]> {
        if (Platform.OS !== 'android') {
            console.warn('[LOGCAT] Only supported on Android');
            return [];
        }

        try {
            // Note: READ_LOGS permission is restricted in Android
            // This will only work in debug builds or on rooted devices
            console.log(`[LOGCAT] Attempting to capture last ${lines} logs...`);

            // Try to read from /proc/kmsg or use logcat command
            // In most cases, this will require root or adb
            const logcatOutput = await this.executeLogcat(lines);

            const entries = this.parseLogcat(logcatOutput);
            console.log(`[LOGCAT] Captured ${entries.length} log entries`);

            return entries;
        } catch (error) {
            console.error('[LOGCAT] Failed to capture logs:', error);
            return [];
        }
    }

    private async executeLogcat(lines: number): Promise<string> {
        // Attempt to execute logcat command
        // This requires READ_LOGS permission or adb/root access
        try {
            // On most devices, this will fail due to permission restrictions
            // Alternative: Use adb bridge or request user to enable developer options

            // For now, return a mock entry indicating the limitation
            return `01-01 00:00:00.000  1234  1234 I LyrinEye: Logcat capture requires READ_LOGS permission or adb access
01-01 00:00:00.001  1234  1234 W System  : This is a demonstration log entry
01-01 00:00:00.002  1234  1234 E LyrinEye: To enable full logcat capture:
01-01 00:00:00.003  1234  1234 I LyrinEye: 1. Connect device to adb
01-01 00:00:00.004  1234  1234 I LyrinEye: 2. Run: adb shell pm grant com.mobile.lyrineye.app android.permission.READ_LOGS`;
        } catch (error) {
            throw new Error('Failed to execute logcat command');
        }
    }

    private parseLogcat(output: string): LogcatEntry[] {
        const entries: LogcatEntry[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
            // Parse Android logcat format: MM-DD HH:MM:SS.mmm  PID  TID PRIORITY TAG: Message
            const match = line.match(
                /^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([A-Z])\s+(.+?):\s+(.+)$/
            );

            if (match) {
                const [, timestamp, pid, , priority, tag, message] = match;
                entries.push({
                    timestamp: new Date().toISOString(), // Convert to ISO
                    pid: parseInt(pid, 10),
                    priority,
                    tag,
                    message,
                });
            } else if (line.trim()) {
                // Fallback for lines that don't match the standard format
                entries.push({
                    timestamp: new Date().toISOString(),
                    message: line,
                });
            }
        }

        return entries;
    }

    async sendToBackend(logs: LogcatEntry[]): Promise<void> {
        try {
            const deviceId = await DeviceInfo.getUniqueId();

            await axios.post(`${BACKEND_URL}/api/devices/${deviceId}/logcat`, {
                logs,
            });

            console.log(`[LOGCAT] Successfully sent ${logs.length} logs to backend`);
        } catch (error) {
            console.error('[LOGCAT] Failed to send logs to backend:', error);
            throw error;
        }
    }

    async captureAndSend(): Promise<void> {
        console.log('[LOGCAT] Starting capture and send process...');
        const logs = await this.captureLastN(500);

        if (logs.length === 0) {
            console.warn('[LOGCAT] No logs captured');
            return;
        }

        await this.sendToBackend(logs);
    }
}

export const LogcatCapture = new LogcatCaptureService();
