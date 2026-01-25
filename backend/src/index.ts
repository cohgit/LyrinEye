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

// WebRTC Rooms
const rooms = new Map<string, { monitor?: string, viewers: string[] }>();

io.on('connection', (socket: Socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-room', (roomId: string, role: 'monitor' | 'viewer') => {
        socket.join(roomId);
        console.log(`User ${socket.id} joined room ${roomId} as ${role}`);

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
        if (data.to) {
            io.to(data.to).emit('offer', { from: socket.id, offer: data.offer });
        } else {
            socket.to(data.roomId).emit('offer', { from: socket.id, offer: data.offer });
        }
    });

    socket.on('answer', (data: { roomId: string, answer: any, to: string }) => {
        io.to(data.to).emit('answer', { from: socket.id, answer: data.answer });
    });

    socket.on('ice-candidate', (data: { roomId: string, candidate: any, to?: string }) => {
        if (data.to) {
            io.to(data.to).emit('ice-candidate', { from: socket.id, candidate: data.candidate });
        } else {
            socket.to(data.roomId).emit('ice-candidate', { from: socket.id, candidate: data.candidate });
        }
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
        const { blobName, roomId, timestamp, duration } = req.body;

        await tableClient.createEntity({
            partitionKey: roomId || 'default',
            rowKey: blobName,
            timestamp: new Date(timestamp),
            duration,
            url: blobServiceClient.getContainerClient('recordings').getBlobClient(blobName).url
        });

        res.status(201).send({ status: 'saved' });
    } catch (error: any) {
        res.status(500).send({ error: error.message });
    }
});

// List Recordings
app.get('/recordings', async (req, res) => {
    try {
        const roomId = req.query.roomId as string || 'default';
        const entities = tableClient.listEntities({
            queryOptions: { filter: `PartitionKey eq '${roomId}'` }
        });

        const list = [];
        for await (const entity of entities) {
            list.push(entity);
        }
        res.send(list.sort((a: any, b: any) => b.timestamp - a.timestamp));
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
