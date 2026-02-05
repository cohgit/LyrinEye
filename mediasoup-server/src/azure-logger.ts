import axios from 'axios';
import crypto from 'crypto';

const WORKSPACE_ID = process.env.AZURE_LOG_WORKSPACE_ID || '';
const WORKSPACE_KEY = process.env.AZURE_LOG_WORKSPACE_KEY || '';
const LOG_TYPE = 'LyrinEye_MediaServer_Log';

interface LogEntry {
    timestamp: string;
    level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
    event: string;
    roomId?: string;
    socketId?: string;
    producerId?: string;
    consumerId?: string;
    transportId?: string;
    message?: string;
    data?: any;
}

class AzureLogger {
    private buffer: LogEntry[] = [];
    private flushInterval: NodeJS.Timeout | null = null;
    private readonly BATCH_SIZE = 10;
    private readonly FLUSH_INTERVAL_MS = 5000;

    constructor() {
        if (WORKSPACE_ID && WORKSPACE_KEY) {
            this.startFlushInterval();
            console.log('✅ Azure Logger initialized');
        } else {
            console.warn('⚠️  Azure Logger disabled - missing WORKSPACE_ID or WORKSPACE_KEY');
        }
    }

    private startFlushInterval() {
        this.flushInterval = setInterval(() => {
            this.flush();
        }, this.FLUSH_INTERVAL_MS);
    }

    log(event: string, data?: Partial<LogEntry>) {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: data?.level || 'INFO',
            event,
            ...data,
        };

        this.buffer.push(entry);
        console.log(`[${entry.level}] ${event}${data?.roomId ? ` [Room: ${data.roomId}]` : ''}${data?.message ? `: ${data.message}` : ''}`);

        if (this.buffer.length >= this.BATCH_SIZE) {
            this.flush();
        }
    }

    private async flush() {
        if (this.buffer.length === 0 || !WORKSPACE_ID || !WORKSPACE_KEY) return;

        const batch = this.buffer.splice(0, this.buffer.length);
        const jsonBody = JSON.stringify(batch);

        try {
            const url = `https://${WORKSPACE_ID}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01`;
            const date = new Date().toUTCString();
            const signature = this.buildSignature(jsonBody, date);

            await axios.post(url, jsonBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Log-Type': LOG_TYPE,
                    'x-ms-date': date,
                    'Authorization': signature,
                },
            });
        } catch (error: any) {
            console.error('[AzureLogger] Failed to send logs:', error.message);
            // Re-add to buffer if failed (simple retry logic)
            this.buffer.unshift(...batch);
        }
    }

    private buildSignature(body: string, date: string): string {
        const contentLength = Buffer.byteLength(body, 'utf8');
        const stringToSign = `POST\n${contentLength}\napplication/json\nx-ms-date:${date}\n/api/logs`;

        const decodedKey = Buffer.from(WORKSPACE_KEY, 'base64');
        const hmac = crypto.createHmac('sha256', decodedKey);
        hmac.update(stringToSign, 'utf8');
        const signature = hmac.digest('base64');

        return `SharedKey ${WORKSPACE_ID}:${signature}`;
    }

    async shutdown() {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }
        await this.flush();
    }
}

export const logger = new AzureLogger();
