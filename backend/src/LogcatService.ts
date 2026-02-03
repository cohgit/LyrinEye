import { TableClient } from '@azure/data-tables';
import crypto from 'crypto';
import axios from 'axios';
import { LogsQueryClient, LogsTable } from '@azure/monitor-query';
import { DefaultAzureCredential } from '@azure/identity';

const CONNECTION_STRING = process.env.STORAGE_CONNECTION_STRING || '';
const logcatTableClient = TableClient.fromConnectionString(CONNECTION_STRING, 'logcat');

// Azure Log Analytics credentials from Terraform
const WORKSPACE_ID = process.env.LOG_ANALYTICS_WORKSPACE_ID || '';
const SHARED_KEY = process.env.LOG_ANALYTICS_SHARED_KEY || '';

// Monitor Query Client for reading logs
const logsQueryClient = new LogsQueryClient(new DefaultAzureCredential());

export async function initializeLogcatTable() {
    try {
        await logcatTableClient.createTable().catch((e: any) => {
            if (e.statusCode !== 409) throw e;
        });
        console.log('[LOGCAT] Storage initialized');
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

    // Store in Azure Table Storage (Backup)
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
            console.error(`[LOGCAT] Failed to store log in table:`, error);
        }
    }

    // Forward to Azure Log Analytics (Primary for Web Viewer)
    await forwardToAzureLogAnalytics(deviceId, logs);
}

async function forwardToAzureLogAnalytics(deviceId: string, logs: LogcatEntry[]) {
    if (!WORKSPACE_ID || !SHARED_KEY) {
        console.warn('[LOGCAT] No Azure Log Analytics credentials configured');
        return;
    }

    try {
        const logName = 'logcat';
        const date = new Date().toUTCString();

        // Prepare data for ingestion
        const data = logs.map(l => ({
            ...l,
            DeviceName: deviceId, // For easy KQL filtering
            LogTimestamp: l.timestamp,
            TimeGenerated: new Date().toISOString()
        }));

        const body = JSON.stringify(data);
        const contentLength = Buffer.byteLength(body);
        const stringToSign = `POST\n${contentLength}\napplication/json\nx-ms-date:${date}\n/api/logs`;
        const signature = crypto.createHmac('sha256', Buffer.from(SHARED_KEY, 'base64'))
            .update(stringToSign, 'utf-8')
            .digest('base64');

        const authorization = `SharedKey ${WORKSPACE_ID}:${signature}`;

        const host = `${WORKSPACE_ID}.ods.opinsights.azure.com`;
        const url = `https://${host}/api/logs?api-version=2016-04-01`;

        await axios.post(url, body, {
            headers: {
                'content-type': 'application/json',
                'Authorization': authorization,
                'Log-Type': logName,
                'x-ms-date': date,
                'time-generated-field': 'TimeGenerated'
            }
        });

        console.log(`[LOGCAT] Successfully forwarded ${logs.length} logs to Log Analytics`);
    } catch (error: any) {
        console.error('[LOGCAT] Error forwarding to Log Analytics:', error.response?.data || error.message);
    }
}

export async function queryLogs(deviceId: string, kqlQuery?: string, timespan: string = 'PT1H') {
    if (!WORKSPACE_ID) return [];

    try {
        // Base query filters by device and the correct log type (appends _CL automatically by Azure)
        const baseQuery = `logcat_CL | where DeviceName == "${deviceId}"`;
        const finalQuery = kqlQuery ? `${baseQuery} | ${kqlQuery}` : `${baseQuery} | order by LogTimestamp desc | take 100`;

        const result = await logsQueryClient.queryWorkspace(
            WORKSPACE_ID,
            finalQuery,
            { duration: timespan as any }
        );

        if (result.status === 'Success') {
            return result.tables[0].rows.map(row => {
                const entry: any = {};
                result.tables[0].columnDescriptors.forEach((col, idx) => {
                    entry[col.name] = row[idx];
                });
                return entry;
            });
        }
        return [];
    } catch (error: any) {
        console.error('[LOGCAT] Error querying logs:', error.message);
        return [];
    }
}
