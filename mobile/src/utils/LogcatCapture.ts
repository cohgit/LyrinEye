import RNFS from 'react-native-fs';
import { Platform, PermissionsAndroid } from 'react-native';
import axios from 'axios';
import DeviceInfo from 'react-native-device-info';
import { CONFIG } from '../config';

export interface LogcatEntry {
    timestamp: string;
    tag?: string;
    priority?: string;
    message: string;
    pid?: number;
}

class LogcatCaptureService {
    private isStreaming = false;
    private intervalId: any = null;

    async captureLastN(lines: number = 500): Promise<LogcatEntry[]> {
        if (Platform.OS !== 'android') {
            console.warn('[LOGCAT] Only supported on Android');
            return [];
        }

        try {
            const logcatOutput = await this.executeLogcat(lines);
            const entries = this.parseLogcat(logcatOutput);
            return entries;
        } catch (error) {
            console.error('[LOGCAT] Failed to capture logs:', error);
            return [];
        }
    }

    private async executeLogcat(lines: number): Promise<string> {
        // In a real production app with proper signing and sharedUserId/system permissions, 
        // we'd use native modules to execute `logcat`. 
        // For this demo and development, we'll simulate the capture with relevant system info.

        const now = new Date();
        const ts = (d: Date) => `${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}.${d.getMilliseconds()}`;

        const mockLogs = [
            `${ts(now)}  ${process.pid}  ${process.pid} I LyrinEye: Mobile logcat transmission active`,
            `${ts(now)}  ${process.pid}  ${process.pid} D Network : Pinging backend ${CONFIG.SIGNALING_SERVER}`,
            `${ts(now)}  ${process.pid}  ${process.pid} I Battery : Level ${Math.random().toFixed(2)}`,
            `${ts(now)}  ${process.pid}  ${process.pid} W System  : Memory pressure LOW`
        ].join('\n');

        return mockLogs;
    }

    private parseLogcat(output: string): LogcatEntry[] {
        const entries: LogcatEntry[] = [];
        const lines = output.split('\n');

        for (const line of lines) {
            const match = line.match(
                /^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([A-Z])\s+(.+?):\s+(.+)$/
            );

            if (match) {
                const [, timestamp, pid, , priority, tag, message] = match;
                entries.push({
                    timestamp: new Date().toISOString(),
                    pid: parseInt(pid, 10),
                    priority,
                    tag,
                    message,
                });
            } else if (line.trim()) {
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
            await axios.post(`${CONFIG.SIGNALING_SERVER}/api/devices/${deviceId}/logcat`, {
                logs,
            });
            console.log(`[LOGCAT] Sent ${logs.length} logs`);
        } catch (error) {
            console.error('[LOGCAT] Failed to send logs:', error);
        }
    }

    async startStreaming() {
        if (this.isStreaming) return;
        this.isStreaming = true;

        console.log('[LOGCAT] Starting stream...');

        // Initial send
        const initialLogs = await this.captureLastN(100);
        await this.sendToBackend(initialLogs);

        this.intervalId = setInterval(async () => {
            if (!this.isStreaming) return;
            const logs = await this.captureLastN(20);
            if (logs.length > 0) {
                await this.sendToBackend(logs);
            }
        }, 10000); // Every 10 seconds
    }

    stopStreaming() {
        this.isStreaming = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        console.log('[LOGCAT] Stream stopped');
    }

    getStreamingStatus() {
        return this.isStreaming;
    }
}

export const LogcatCapture = new LogcatCaptureService();
