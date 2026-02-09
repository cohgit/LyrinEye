import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from '@azure/storage-blob';
import { TableClient } from '@azure/data-tables';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 8080;
const CONNECTION_STRING = process.env.STORAGE_CONNECTION_STRING || '';

// Azure Storage Initialization
const blobServiceClient = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
const tableClient = TableClient.fromConnectionString(CONNECTION_STRING, 'camerametadata');
const userDevicesClient = TableClient.fromConnectionString(CONNECTION_STRING, 'userdevices');
const deviceTokensClient = TableClient.fromConnectionString(CONNECTION_STRING, 'devicetokens');

// Firebase and Logcat Services
import { initializeFirebase, sendPushNotification } from './FirebaseService';
import * as LogcatService from './LogcatService';

// Ensure resources exist
async function initStorage() {
    try {
        console.log('Initializing Azure Storage resources...');
        const recordingsContainer = blobServiceClient.getContainerClient('recordings');
        await recordingsContainer.createIfNotExists();

        await tableClient.createTable().catch((e: any) => {
            if (e.statusCode !== 409) throw e; // 409 means table already exists
        });

        await userDevicesClient.createTable().catch((e: any) => {
            if (e.statusCode !== 409) throw e;
        });

        await deviceTokensClient.createTable().catch((e: any) => {
            if (e.statusCode !== 409) throw e;
        });

        await LogcatService.initializeLogcatTable();
        initializeFirebase();

        console.log('Azure Storage resources ready.');
    } catch (error) {
        console.error('Failed to initialize Azure Storage:', error);
    }
}

initStorage();

// WebRTC Rooms
const rooms = new Map<string, { monitor?: string, viewers: string[] }>();

io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-room', async (roomId: string, role: 'monitor' | 'viewer', email?: string) => {
        if (role === 'viewer') {
            if (!email) return socket.emit('error', 'Authentication required');

            // Check authorization in UserDevices table
            const normalizedEmail = email.toLowerCase();
            try {
                const entity = await userDevicesClient.getEntity(normalizedEmail, roomId);
                console.log(`[AUTH] Access GRANTED for ${normalizedEmail} to device ${roomId}`);
            } catch (e) {
                console.log(`[AUTH-DENIED] Unauthorized access attempt by ${normalizedEmail} to device ${roomId}`);
                return socket.emit('error', 'Unauthorized access');
            }
        }

        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId} as ${role} (${email || 'system'})`);

        if (!rooms.has(roomId)) {
            rooms.set(roomId, { viewers: [] });
        }

        const room = rooms.get(roomId)!;

        if (role === 'monitor') {
            room.monitor = socket.id;
            socket.to(roomId).emit('monitor-online');
        } else {
            room.viewers.push(socket.id);
            if (room.monitor) {
                socket.emit('monitor-online');
                io.to(room.monitor).emit('viewer-joined', socket.id);
            }
        }
    });

    socket.on('offer', (data: { roomId: string, offer: any, to?: string }) => {
        console.log(`Offer received from ${socket.id} to ${data.to || 'room ' + data.roomId}`);
        if (data.to) {
            io.to(data.to).emit('offer', { from: socket.id, offer: data.offer });
        } else {
            socket.to(data.roomId).emit('offer', { from: socket.id, offer: data.offer });
        }
    });

    socket.on('answer', (data: { roomId: string, answer: any, to: string }) => {
        console.log(`Answer received from ${socket.id} to ${data.to}`);
        io.to(data.to).emit('answer', { from: socket.id, answer: data.answer });
    });

    socket.on('ice-candidate', (data: { roomId: string, candidate: any, to?: string }) => {
        console.log(`ICE candidate from ${socket.id} to ${data.to || 'room ' + data.roomId}`);
        if (data.to) {
            io.to(data.to).emit('ice-candidate', { from: socket.id, candidate: data.candidate });
        } else {
            socket.to(data.roomId).emit('ice-candidate', { from: socket.id, candidate: data.candidate });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });

    socket.on('client-log', (data: { level: string, message: string, timestamp: string }) => {
        console.log(`[MOBILE-${data.level.toUpperCase()}] ${socket.id}: ${data.message}`);
    });

    socket.on('disconnecting', () => {
        for (const roomId of socket.rooms) {
            const room = rooms.get(roomId);
            if (room) {
                if (room.monitor === socket.id) {
                    room.monitor = undefined;
                    socket.to(roomId).emit('monitor-offline');
                } else {
                    room.viewers = room.viewers.filter(id => id !== socket.id);
                }
                if (!room.monitor && room.viewers.length === 0) {
                    rooms.delete(roomId);
                }
            }
        }
    });
});

// --- Recording Endpoints ---

// Get SAS Token for Direct Upload
app.get('/sas', async (req, res) => {
    try {
        const blobName = req.query.blobName as string;
        if (!blobName) return res.status(400).send({ error: 'blobName is required' });

        const containerName = 'recordings';
        const containerClient = blobServiceClient.getContainerClient(containerName);

        // Ensure container exists
        await containerClient.createIfNotExists();

        const expiresOn = new Date();
        expiresOn.setMinutes(expiresOn.getMinutes() + 30); // 30 mins valid

        // We need account name and key from connection string for SAS
        // A cleaner way is using StorageSharedKeyCredential if we had them separate, 
        // but we can parse connection string or use the SDK's built-in if available.
        // For simplicity in ACA, we use the connection string.

        // Extract account name and key from connection string
        const parts = CONNECTION_STRING.split(';');
        const accountName = parts.find(p => p.startsWith('AccountName='))?.split('=')[1] || '';
        const accountKey = parts.find(p => p.startsWith('AccountKey='))?.split('=')[1] || '';

        const sasToken = generateBlobSASQueryParameters({
            containerName,
            blobName,
            permissions: BlobSASPermissions.parse("cw"), // create, write
            expiresOn,
        }, new StorageSharedKeyCredential(accountName, accountKey)).toString();

        const uploadUrl = `${containerClient.getBlobClient(blobName).url}?${sasToken}`;
        res.send({ uploadUrl });
    } catch (error: any) {
        res.status(500).send({ error: error.message });
    }
});

// Save Recording Metadata
app.post('/recordings', async (req, res) => {
    try {
        const { blobName, thumbnailBlobName, roomId, timestamp, duration, deviceId } = req.body;

        await tableClient.createEntity({
            partitionKey: roomId || 'default',
            rowKey: blobName,
            timestamp: new Date(timestamp),
            duration,
            deviceId: deviceId || 'unknown',
            thumbnailBlobName: thumbnailBlobName || '',
            url: blobServiceClient.getContainerClient('recordings').getBlobClient(blobName).url
        });

        // Update last activity for this device in userDevices table
        if (deviceId && deviceId !== 'unknown') {
            const wifiSSID = req.body.wifiSSID;
            const appVersion = req.body.appVersion;
            const androidVersion = req.body.androidVersion;

            const userDevicesEntities = userDevicesClient.listEntities({
                queryOptions: { filter: `RowKey eq '${deviceId}'` }
            });

            for await (const entity of userDevicesEntities) {
                if (entity.partitionKey && entity.rowKey) {
                    await userDevicesClient.upsertEntity({
                        partitionKey: entity.partitionKey as string,
                        rowKey: entity.rowKey as string,
                        registeredAt: new Date().toISOString(), // This is our 'lastSeen'
                        lastRecordingAt: new Date().toISOString(),
                        wifiSSID: wifiSSID || entity.wifiSSID || null,
                        appVersion: appVersion || entity.appVersion || null,
                        androidVersion: androidVersion || entity.androidVersion || null
                    });
                }
            }
        }

        res.status(201).send({ status: 'saved' });
    } catch (error: any) {
        console.error(`[RECORDINGS] Failed to save/update:`, error);
        res.status(500).send({ error: error.message });
    }
});

// Register Device to User
app.post('/register-device', async (req, res) => {
    try {
        const { deviceId, email, wifiSSID, appVersion, androidVersion } = req.body;
        if (!deviceId || !email) return res.status(400).send({ error: 'deviceId and email are required' });

        const normalizedEmail = email.toLowerCase();
        console.log(`[REG] Registering device ${deviceId} for user ${normalizedEmail}`);
        await userDevicesClient.upsertEntity({
            partitionKey: normalizedEmail,
            rowKey: deviceId,
            registeredAt: new Date().toISOString(),
            wifiSSID: wifiSSID || null,
            appVersion: appVersion || null,
            androidVersion: androidVersion || null
        });

        res.send({ status: 'registered', deviceId, email: normalizedEmail });
    } catch (error: any) {
        res.status(500).send({ error: error.message });
    }
});

// Share Device with another User
app.post('/share-device', async (req, res) => {
    try {
        const { deviceId, ownerEmail, shareWithEmail } = req.body;
        const normalizedOwnerEmail = ownerEmail.toLowerCase();
        const normalizedShareWithEmail = shareWithEmail.toLowerCase();

        await userDevicesClient.upsertEntity({
            partitionKey: normalizedShareWithEmail,
            rowKey: deviceId,
            sharedBy: normalizedOwnerEmail,
            sharedAt: new Date().toISOString(),
            isShared: true
        });

        res.send({ status: 'shared' });
    } catch (error: any) {
        res.status(500).send({ error: error.message });
    }
});

// List Recordings
app.get('/api/recordings', async (req, res) => {
    try {
        const roomId = req.query.roomId as string;
        const email = req.query.email as string;

        let entities;

        // 1. Get all devices for this user (owned or shared)
        const deviceIds: string[] = [];
        if (email) {
            const normalizedEmail = email.toLowerCase();
            console.log(`[QUERY] Fetching recordings for user email: ${normalizedEmail}`);
            const deviceEntities = userDevicesClient.listEntities({
                queryOptions: { filter: `PartitionKey eq '${normalizedEmail}'` }
            });
            for await (const dev of deviceEntities) {
                deviceIds.push(dev.rowKey as string);
            }

            console.log(`[QUERY] User ${normalizedEmail} has devices: ${deviceIds.join(', ')}`);
            if (deviceIds.length === 0) {
                console.log(`[QUERY] No devices found for user ${normalizedEmail}`);
                return res.send([]);
            }
            entities = tableClient.listEntities();
        } else {
            entities = tableClient.listEntities({
                queryOptions: { filter: `PartitionKey eq '${roomId || 'default'}'` }
            });
        }

        const parts = CONNECTION_STRING.split(';');
        const accountName = parts.find(p => p.startsWith('AccountName='))?.split('=')[1] || '';
        const accountKey = parts.find(p => p.startsWith('AccountKey='))?.split('=')[1] || '';
        const credential = new StorageSharedKeyCredential(accountName, accountKey);
        const containerName = 'recordings';

        const list = [];
        for await (const entity of entities) {
            const blobName = entity.rowKey as string;
            if (!blobName) continue;

            const sasToken = generateBlobSASQueryParameters({
                containerName,
                blobName,
                permissions: BlobSASPermissions.parse("r"),
                expiresOn: new Date(new Date().valueOf() + 3600 * 1000),
            }, credential).toString();

            const fullUrl = `${blobServiceClient.getContainerClient(containerName).getBlobClient(blobName).url}?${sasToken}`;

            let thumbnailUrl = '';
            if (entity.thumbnailBlobName) {
                const thumbBlobName = entity.thumbnailBlobName as string;
                const thumbSasToken = generateBlobSASQueryParameters({
                    containerName,
                    blobName: thumbBlobName,
                    permissions: BlobSASPermissions.parse("r"),
                    expiresOn: new Date(new Date().valueOf() + 3600 * 1000),
                }, credential).toString();
                thumbnailUrl = `${blobServiceClient.getContainerClient(containerName).getBlobClient(thumbBlobName).url}?${thumbSasToken}`;
            }

            list.push({
                ...entity,
                url: fullUrl,
                thumbnailUrl
            });
        }

        const finalResults = email
            ? list.filter((r: any) => deviceIds.includes(r.deviceId))
            : list;

        // Apply time-range filtering if provided
        const startTime = req.query.startTime as string;
        const endTime = req.query.endTime as string;

        let filteredResults = finalResults;
        if (startTime || endTime) {
            filteredResults = finalResults.filter((r: any) => {
                const recordingTime = new Date(r.timestamp).getTime();
                if (startTime && recordingTime < new Date(startTime).getTime()) return false;
                if (endTime && recordingTime > new Date(endTime).getTime()) return false;
                return true;
            });
        }

        res.send(filteredResults.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    } catch (error: any) {
        res.status(500).send({ error: error.message });
    }
});

// --- Device Management Endpoints ---

// Register Device FCM Token
app.post('/api/devices/register-token', async (req, res) => {
    try {
        const { deviceId, fcmToken } = req.body;
        if (!deviceId || !fcmToken) {
            return res.status(400).send({ error: 'deviceId and fcmToken are required' });
        }

        console.log(`[FCM] Registering token for device ${deviceId}`);
        await deviceTokensClient.upsertEntity({
            partitionKey: deviceId,
            rowKey: 'fcm',
            token: fcmToken,
            updatedAt: new Date().toISOString(),
        });

        res.send({ status: 'registered', deviceId });
    } catch (error: any) {
        console.error(`[FCM] Failed to register token:`, error);
        res.status(500).send({ error: error.message });
    }
});

// List Devices for a User
app.get('/api/devices', async (req, res) => {
    try {
        const email = req.query.email as string;
        if (!email) {
            return res.status(400).send({ error: 'Email is required to list devices' });
        }

        const normalizedEmail = email.toLowerCase();
        console.log(`[DEVICES] Fetching devices for user: ${normalizedEmail}`);

        const deviceEntities = [];
        const deviceIds = [];
        const entities = userDevicesClient.listEntities({
            queryOptions: { filter: `PartitionKey eq '${normalizedEmail}'` }
        });

        for await (const entity of entities) {
            deviceEntities.push(entity);
            deviceIds.push(entity.rowKey as string);
        }

        const telemetries = await LogcatService.getLatestTelemetries(deviceIds);

        // Helper to get value regardless of Azure suffix (_s, _d, _b)
        const getVal = (obj: any, baseKey: string) => {
            if (!obj) return null;
            return obj[baseKey] ?? obj[`${baseKey}_s`] ?? obj[`${baseKey}_d`] ?? obj[`${baseKey}_b`] ?? obj[`${baseKey}_g`];
        };

        const devices = deviceEntities.map(entity => {
            const deviceId = entity.rowKey as string;
            const isTransmitting = LogcatService.isSessionActive(deviceId);
            const telemetry = telemetries.get(deviceId);

            // Recording status: was there an upload in the last 2 minutes?
            let isRecording = false;
            if (entity.lastRecordingAt) {
                const lastRec = new Date(entity.lastRecordingAt as string).getTime();
                isRecording = (Date.now() - lastRec) < 120000;
            }

            const deviceName = getVal(telemetry, 'DeviceName');
            const appVer = getVal(telemetry, 'AppVersion');
            const androidVer = getVal(telemetry, 'AndroidVersion');

            return {
                id: deviceId,
                name: deviceName || entity.name || deviceId.substring(0, 8),
                status: 'online',
                battery: (entity.battery as number) || getVal(telemetry, 'BatteryLevel') || null,
                cpu: (entity.cpu as number) || getVal(telemetry, 'CPUUsage') || null,
                ram: (entity.ram as number) || getVal(telemetry, 'RamTotalMB') || null,
                lastSeen: isTransmitting || isRecording ? new Date().toISOString() : (entity.registeredAt || new Date().toISOString()),
                isCharging: getVal(telemetry, 'IsCharging') === true || getVal(telemetry, 'IsCharging') === "true",
                isTransmitting: isTransmitting,
                isRecording: isRecording,
                wifiSSID: entity.wifiSSID || getVal(telemetry, 'WifiSSID') || null,
                appVersion: appVer || entity.appVersion || null,
                androidVersion: androidVer || entity.androidVersion || null
            };
        });

        res.send(devices);
    } catch (error: any) {
        console.error(`[DEVICES] Failed to list devices:`, error);
        res.status(500).send({ error: error.message });
    }
});

// Get Device Details
app.get('/api/devices/:id', async (req, res) => {
    try {
        const { id: deviceId } = req.params;

        // Find device in userdevices table
        // Since PartitionKey is the email and we don't have it, we search by RowKey
        const entities = userDevicesClient.listEntities({
            queryOptions: { filter: `RowKey eq '${deviceId}'` }
        });

        let deviceEntity = null;
        for await (const entity of entities) {
            deviceEntity = entity;
            break;
        }

        const isTransmitting = LogcatService.isSessionActive(deviceId);
        const telemetry = await LogcatService.getLatestTelemetry(deviceId);

        // Helper to get value regardless of Azure suffix (_s, _d, _b)
        const getVal = (obj: any, baseKey: string) => {
            if (!obj) return null;
            return obj[baseKey] ?? obj[`${baseKey}_s`] ?? obj[`${baseKey}_d`] ?? obj[`${baseKey}_b`] ?? obj[`${baseKey}_g`];
        };

        const cpu = getVal(telemetry, 'CPUUsage');
        const ram = getVal(telemetry, 'RamTotalMB');
        const appVer = getVal(telemetry, 'AppVersion');
        const androidVer = getVal(telemetry, 'AndroidVersion');
        const wifi = getVal(telemetry, 'WifiSSID');
        const ip = getVal(telemetry, 'ClientIP');
        const streaming = getVal(telemetry, 'Streaming');
        const battery = getVal(telemetry, 'BatteryLevel');
        const isConn = getVal(telemetry, 'ConnectionStart');
        const isCharging = getVal(telemetry, 'IsCharging');
        const deviceName = getVal(telemetry, 'DeviceName');
        const mode = getVal(telemetry, 'Mode');
        const storageFree = getVal(telemetry, 'StorageFreeMB');
        const ramUsed = getVal(telemetry, 'RamUsedMB');
        const batteryStatus = getVal(telemetry, 'BatteryStatus');
        const lowPowerMode = getVal(telemetry, 'LowPowerMode');
        const lat = getVal(telemetry, 'Latitude');
        const lon = getVal(telemetry, 'Longitude');

        console.log(`[DEVICES] Found telemetry for ${deviceId}: ${telemetry ? 'YES' : 'NO'}`);

        const deviceData: any = {
            id: deviceId,
            name: deviceName || (deviceEntity as any)?.name || deviceId.substring(0, 8),
            status: 'online',
            lastSeen: isTransmitting || streaming ? new Date().toISOString() : ((deviceEntity as any)?.registeredAt || new Date().toISOString()),
            isTransmitting: isTransmitting || streaming === true || streaming === "true",
            isRecording: false, // Will be calculated below
            battery: battery ? parseFloat(battery) : null,
            isCharging: isCharging === true || isCharging === "true",
            cpu: cpu ? parseFloat(cpu) : null,
            ram: ram ? parseFloat(ram) : null,
            androidVersion: androidVer || (deviceEntity as any)?.androidVersion || '?',
            appVersion: appVer || (deviceEntity as any)?.appVersion || '?',
            wifiSSID: wifi || (deviceEntity as any)?.wifiSSID || null,
            ipAddress: ip || null,
            streaming: streaming === true || streaming === "true",
            connectionStart: isConn === true || isConn === "true",
            mode: mode || 'unknown',
            storageFree: storageFree ? parseFloat(storageFree) : undefined,
            ramUsed: ramUsed ? parseFloat(ramUsed) : undefined,
            batteryStatus: batteryStatus || undefined,
            lowPowerMode: lowPowerMode === 'Yes' || lowPowerMode === true || lowPowerMode === "true",
            telemetry: telemetry || {}
        };

        if (lat && lon && lat !== 'N/A' && lon !== 'N/A') {
            deviceData.location = {
                latitude: parseFloat(lat),
                longitude: parseFloat(lon)
            };
        }

        // Recalculate isRecording based on lastRecordingAt (from recordings table)
        if ((deviceEntity as any)?.lastRecordingAt) {
            const lastRec = new Date((deviceEntity as any).lastRecordingAt as string).getTime();
            deviceData.isRecording = (Date.now() - lastRec) < 120000;
            if (deviceData.isRecording) deviceData.lastSeen = new Date().toISOString();
        }

        res.send(deviceData);
    } catch (error: any) {
        console.error(`[DEVICES] Failed to get device details:`, error);
        res.status(500).send({ error: error.message });
    }
});

// Send Remote Command to Device
app.get('/api/devices/:id/logs', async (req, res) => {
    try {
        const { id } = req.params;
        const { query, timespan } = req.query;
        const logs = await LogcatService.queryLogs(
            id,
            query as string,
            timespan as string || 'PT1H'
        );
        res.send(logs);
    } catch (error: any) {
        res.status(500).send({ error: error.message });
    }
});

app.post('/api/devices/:id/commands', async (req, res) => {
    try {
        const { id: deviceId } = req.params;
        const { command } = req.body;

        if (!command) {
            return res.status(400).send({ error: 'command is required' });
        }

        if (command === 'request_logcat') {
            const { durationMinutes = 15 } = req.body;
            if (!LogcatService.canStartSession(deviceId)) {
                return res.status(429).send({
                    error: 'Limite de concurrencia alcanzado',
                    message: 'Solo un dispositivo puede tener una sesión de logcat activa a la vez.'
                });
            }
            LogcatService.startSession(deviceId, durationMinutes);
        } else if (command === 'start_recording') {
            console.log(`[COMMAND] Starting remote recording for ${deviceId}`);
            // Logic to track recording state could go here
        }

        console.log(`[COMMAND] Sending '${command}' to device ${deviceId}`);

        // Get device FCM token
        let fcmToken: string;
        try {
            const tokenEntity = await deviceTokensClient.getEntity(deviceId, 'fcm');
            fcmToken = tokenEntity.token as string;
        } catch (e: any) {
            console.error(`[COMMAND] Token not found for ${deviceId}:`, e.message);
            return res.status(404).send({
                error: 'Device token not found',
                message: 'El dispositivo no ha registrado su token de notificaciones or el ID es incorrecto.'
            });
        }

        // Send push notification
        const result = await sendPushNotification(fcmToken, command);
        res.send({ status: 'sent', ...result });
    } catch (error: any) {
        console.error(`[COMMAND] Failed to send command:`, error);
        if (error.message.includes('not found')) {
            res.status(404).send({ error: 'Device not found or token not registered' });
        } else {
            res.status(500).send({ error: error.message });
        }
    }
});

// Check Logcat Session Status
app.get('/api/devices/:id/session', (req, res) => {
    const { id: deviceId } = req.params;
    const session = LogcatService.getActiveSessionInfo(deviceId);
    res.send(session || { active: false });
});

app.get('/api/devices/:id/stats/logs', async (req, res) => {
    try {
        const { id: deviceId } = req.params;
        const { start, end, granularity } = req.query;

        if (!start || !end || !granularity) {
            return res.status(400).send({ error: 'Missing required parameters: start, end, granularity' });
        }

        const stats = await LogcatService.getLogStats(
            deviceId,
            start as string,
            end as string,
            granularity as '1d' | '1h' | '1m'
        );
        res.send(stats);
    } catch (error: any) {
        console.error(`[STATS] Failed to get log stats:`, error);
        res.status(500).send({ error: error.message });
    }
});

app.get('/api/devices/:id/stats/telemetry', async (req, res) => {
    try {
        const { id: deviceId } = req.params;
        const { start, end, granularity } = req.query;

        if (!start || !end || !granularity) {
            return res.status(400).send({ error: 'Missing required parameters: start, end, granularity' });
        }

        const stats = await LogcatService.getTelemetryStats(
            deviceId,
            start as string,
            end as string,
            granularity as '1d' | '1h' | '1m'
        );
        res.send(stats);
    } catch (error: any) {
        console.error(`[STATS] Failed to get telemetry stats:`, error);
        res.status(500).send({ error: error.message });
    }
});

// Query Web Logs
app.get('/api/web/logs', async (req, res) => {
    try {
        const { query, timespan } = req.query;
        const logs = await LogcatService.queryWebLogs(
            query as string,
            timespan as string
        );
        res.send(logs);
    } catch (error: any) {
        console.error(`[WEB-LOGS] Failed to query web logs:`, error);
        res.status(500).send({ error: error.message });
    }
});

// Generic System Logs
app.get('/api/system/tables', async (req, res) => {
    try {
        const tables = await LogcatService.getAvailableTables();
        res.send(tables);
    } catch (error: any) {
        res.status(500).send({ error: error.message });
    }
});

app.get('/api/system/logs', async (req, res) => {
    try {
        const { table, query, timespan } = req.query;
        if (!table) return res.status(400).send({ error: 'table parameter is required' });

        const logs = await LogcatService.queryGenericLogs(
            table as string,
            query as string,
            timespan as string || 'PT1H'
        );
        res.send(logs);
    } catch (error: any) {
        console.error(`[SYSTEM-LOGS] Failed to query logs:`, error);
        res.status(500).send({ error: error.message });
    }
});

// Receive Logcat from Device
app.post('/api/devices/:id/logcat', async (req, res) => {
    try {
        const { id: deviceId } = req.params;
        const { logs } = req.body;

        if (!Array.isArray(logs)) {
            return res.status(400).send({ error: 'logs must be an array' });
        }

        await LogcatService.receiveLogcat(deviceId, logs as LogcatService.LogcatEntry[]);
        res.send({ status: 'received', count: logs.length });
    } catch (error: any) {
        console.error(`[LOGCAT] Failed to receive logs:`, error);
        res.status(500).send({ error: error.message });
    }
});

app.post('/api/web/logs', async (req, res) => {
    try {
        const { logs, source } = req.body;
        if (Array.isArray(logs)) {
            await LogcatService.receiveWebLogs(logs, source);
            res.send({ status: 'ok' });
        } else {
            res.status(400).send({ error: 'logs must be an array' });
        }
    } catch (error: any) {
        console.error('Failed to ingest web logs:', error);
        res.status(500).send({ error: error.message });
    }
});

app.get('/health', (req, res) => {
    res.send({ status: 'ok', rooms: rooms.size });
});

httpServer.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
