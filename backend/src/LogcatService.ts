import { TableClient } from '@azure/data-tables';

const CONNECTION_STRING = process.env.STORAGE_CONNECTION_STRING || '';
const logcatTableClient = TableClient.fromConnectionString(CONNECTION_STRING, 'logcat');

export async function initializeLogcatTable() {
    try {
        await logcatTableClient.createTable().catch((e: any) => {
            if (e.statusCode !== 409) throw e; // 409 means table already exists
        });
        console.log('[LOGCAT] Table initialized');
    } catch (error) {
        console.error('[LOGCAT] Failed to initialize table:', error);
    }
}

export interface LogcatEntry {
    deviceId: string;
    timestamp: string;
    tag?: string;
    priority?: string;
    message: string;
    pid?: number;
}

export async function receiveLogcat(deviceId: string, logs: LogcatEntry[]) {
    console.log(`[LOGCAT] Received ${logs.length} logs from device ${deviceId}`);

    // Store in Azure Table Storage
    for (const log of logs) {
        try {
            await logcatTableClient.createEntity({
                partitionKey: deviceId,
                rowKey: `${log.timestamp}_${Date.now()}`,
                timestamp: new Date(log.timestamp),
                tag: log.tag || '',
                priority: log.priority || 'I',
                message: log.message,
                pid: log.pid || 0,
            });
        } catch (error) {
            console.error(`[LOGCAT] Failed to store log:`, error);
        }
    }

    // Also forward to Azure Log Analytics (same workspace as telemetry)
    await forwardToAzureLogAnalytics(deviceId, logs);
}

async function forwardToAzureLogAnalytics(deviceId: string, logs: LogcatEntry[]) {
    const WORKSPACE_ID = '4293cd25-8e2b-475a-a591-fc110d03fac7';
    const SHARED_KEY = process.env.AZURE_LOG_ANALYTICS_KEY;

    if (!SHARED_KEY) {
        console.warn('[LOGCAT] No Azure Log Analytics key configured');
        return;
    }

    // Implementation would use the same signature method as mobile app
    // For now, just log that we would forward
    console.log(`[LOGCAT] Would forward ${logs.length} logs to Azure Log Analytics`);
}
