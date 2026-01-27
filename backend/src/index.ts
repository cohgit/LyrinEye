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

// WebRTC Rooms
const rooms = new Map<string, { monitor?: string, viewers: string[] }>();

io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-room', async (roomId: string, role: 'monitor' | 'viewer', email?: string) => {
        if (role === 'viewer') {
            if (!email) return socket.emit('error', 'Authentication required');

            // Check authorization in UserDevices table
            try {
                const entity = await userDevicesClient.getEntity(email, roomId);
                console.log(`[AUTH] Access GRANTED for ${email} to device ${roomId}`);
            } catch (e) {
                console.log(`[AUTH-DENIED] Unauthorized access attempt by ${email} to device ${roomId}`);
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

        console.log(`[REG] Registering device ${deviceId} for user ${email}`);
        await userDevicesClient.upsertEntity({
            partitionKey: email,
            rowKey: deviceId,
            registeredAt: new Date().toISOString()
        });

        res.send({ status: 'registered', deviceId, email });
    } catch (error: any) {
        res.status(500).send({ error: error.message });
    }
});

// Share Device with another User
app.post('/share-device', async (req, res) => {
    try {
        const { deviceId, ownerEmail, shareWithEmail } = req.body;

        // Logical check: Is the requester the owner? 
        // In a real app we'd check JWT, here for MVP we trust the payload or assume caller verified.

        await userDevicesClient.upsertEntity({
            partitionKey: shareWithEmail,
            rowKey: deviceId,
            sharedBy: ownerEmail,
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
            console.log(`[QUERY] Fetching recordings for user email: ${email}`);
            const deviceEntities = userDevicesClient.listEntities({
                queryOptions: { filter: `PartitionKey eq '${email}'` }
            });
            for await (const dev of deviceEntities) {
                deviceIds.push(dev.rowKey as string);
            }

            console.log(`[QUERY] User ${email} has devices: ${deviceIds.join(', ')}`);
            if (deviceIds.length === 0) {
                console.log(`[QUERY] No devices found for user ${email}`);
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

app.get('/health', (req, res) => {
    res.send({ status: 'ok', rooms: rooms.size });
});

httpServer.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
