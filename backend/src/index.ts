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

        res.status(201).send({ status: 'saved' });
    } catch (error: any) {
        res.status(500).send({ error: error.message });
    }
});

// Register Device to User
app.post('/register-device', async (req, res) => {
    try {
        const { deviceId, email } = req.body;
        if (!deviceId || !email) return res.status(400).send({ error: 'deviceId and email are required' });

        const normalizedEmail = email.toLowerCase();
        console.log(`[REG] Registering device ${deviceId} for user ${normalizedEmail}`);
        await userDevicesClient.upsertEntity({
            partitionKey: normalizedEmail,
            rowKey: deviceId,
            registeredAt: new Date().toISOString()
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
app.get('/recordings', async (req, res) => {
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

        res.send(finalResults.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
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

        const deviceEntities = userDevicesClient.listEntities({
            queryOptions: { filter: `PartitionKey eq '${normalizedEmail}'` }
        });

        const devices = [];
        for await (const entity of deviceEntities) {
            const isTransmitting = LogcatService.isSessionActive(entity.rowKey as string);
            devices.push({
                id: entity.rowKey,
                name: entity.name || (entity.rowKey as string).substring(0, 8),
                status: 'online',
                battery: 0.8,
                cpu: 10,
                ram: 512,
                lastSeen: isTransmitting ? new Date().toISOString() : (entity.registeredAt || new Date().toISOString()),
                isCharging: false,
                isTransmitting: isTransmitting,
                isRecording: false,
                wifiSSID: entity.wifiSSID || null
            });
        }

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

        if (!deviceEntity) {
            // Fallback for demo/missing devices
            return res.send({
                id: deviceId,
                name: deviceId,
                status: 'online',
                lastSeen: isTransmitting ? new Date().toISOString() : new Date().toISOString(),
                isTransmitting: isTransmitting,
                isRecording: false,
                battery: 0.8,
                isCharging: true,
                cpu: 15,
                ram: 512,
                androidVersion: '?',
                appVersion: '?',
                wifiSSID: null
            });
        }

        res.send({
            id: deviceId,
            name: deviceEntity.name || deviceId.substring(0, 8),
            status: 'online',
            lastSeen: isTransmitting ? new Date().toISOString() : (deviceEntity.registeredAt || new Date().toISOString()),
            isTransmitting: isTransmitting,
            isRecording: false,
            battery: 0.8,
            isCharging: true,
            cpu: 15,
            ram: 512,
            androidVersion: deviceEntity.androidVersion || '?',
            appVersion: deviceEntity.appVersion || '?',
            wifiSSID: deviceEntity.wifiSSID || null
        });
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
        const tokenEntity = await deviceTokensClient.getEntity(deviceId, 'fcm');
        const fcmToken = tokenEntity.token as string;

        if (!fcmToken) {
            return res.status(404).send({ error: 'Device token not found' });
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

app.get('/health', (req, res) => {
    res.send({ status: 'ok', rooms: rooms.size });
});

httpServer.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
