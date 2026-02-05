import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { config } from './config';
import { MediasoupManager } from './mediasoup-manager';
import { RoomManager } from './room-manager';
import { Recorder } from './recorder';
import { logger } from './azure-logger';
import { DtlsParameters, RtpCapabilities, RtpParameters } from 'mediasoup/node/lib/types';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors());
app.use(express.json());

// Socket.IO
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

// Managers
const mediasoupManager = new MediasoupManager();
const roomManager = new RoomManager();

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        workers: mediasoupManager.getWorkerStats(),
        rooms: roomManager.getRoomStats(),
    });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    logger.log('client-connected', { socketId: socket.id });

    // Join room
    socket.on('join-room', async ({ roomId, role }, callback) => {
        try {
            console.log(`📥 join-room: ${roomId}, role: ${role}`);
            logger.log('join-room', { roomId, socketId: socket.id, data: { role } });

            let room = roomManager.getRoom(roomId);

            // Create room if it doesn't exist
            if (!room) {
                let router = mediasoupManager.getRouter(roomId);
                if (!router) {
                    router = await mediasoupManager.createRouter(roomId);
                }
                room = roomManager.createRoom(roomId, router);
            }

            socket.join(roomId);
            socket.data.roomId = roomId;
            socket.data.role = role;

            callback({
                success: true,
                rtpCapabilities: room.router.rtpCapabilities,
            });
        } catch (error: any) {
            console.error('❌ join-room error:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Create WebRTC transport
    socket.on('create-transport', async ({ roomId, direction }, callback) => {
        try {
            console.log(`📥 create-transport: ${roomId}, direction: ${direction}`);

            const room = roomManager.getRoom(roomId);
            if (!room) {
                throw new Error('Room not found');
            }

            const transport = await room.router.createWebRtcTransport({
                listenIps: config.mediasoup.webRtcTransport.listenIps,
                enableUdp: true,
                enableTcp: true,
                preferUdp: true,
                initialAvailableOutgoingBitrate: config.mediasoup.webRtcTransport.initialAvailableOutgoingBitrate,
            });

            // Store transport
            roomManager.addTransport(roomId, transport.id, transport);

            callback({
                success: true,
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            });
        } catch (error: any) {
            console.error('❌ create-transport error:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Connect transport
    socket.on('connect-transport', async ({ roomId, transportId, dtlsParameters }, callback) => {
        try {
            console.log(`📥 connect-transport: ${transportId}`);

            const transport = roomManager.getTransport(roomId, transportId);
            if (!transport) {
                throw new Error('Transport not found');
            }

            await transport.connect({ dtlsParameters });
            callback({ success: true });
        } catch (error: any) {
            console.error('❌ connect-transport error:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Produce (device starts streaming)
    socket.on('produce', async ({ roomId, transportId, kind, rtpParameters }, callback) => {
        try {
            console.log(`📥 produce: ${roomId}, kind: ${kind}`);
            logger.log('produce-request', { roomId, transportId, socketId: socket.id, data: { kind } });

            const transport = roomManager.getTransport(roomId, transportId);
            if (!transport) {
                throw new Error('Transport not found');
            }

            const producer = await transport.produce({
                kind,
                rtpParameters,
            });

            roomManager.addProducer(roomId, producer);

            logger.log('producer-created', { roomId, producerId: producer.id, socketId: socket.id, data: { kind } });

            // Notify all viewers in the room
            const viewersInRoom = Array.from(io.sockets.adapter.rooms.get(roomId) || []).filter(id => id !== socket.id);
            logger.log('emitting-new-producer', {
                roomId,
                producerId: producer.id,
                socketId: socket.id,
                data: { kind, viewerCount: viewersInRoom.length, viewers: viewersInRoom }
            });

            socket.to(roomId).emit('new-producer', {
                producerId: producer.id,
                kind: producer.kind,
            });

            callback({
                success: true,
                id: producer.id,
            });
        } catch (error: any) {
            console.error('❌ produce error:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Consume (viewer starts receiving)
    socket.on('consume', async ({ roomId, transportId, producerId, rtpCapabilities }, callback) => {
        try {
            console.log(`📥 consume: ${roomId}, producer: ${producerId}`);
            logger.log('consume-request', { roomId, transportId, producerId, socketId: socket.id });

            const room = roomManager.getRoom(roomId);
            const transport = roomManager.getTransport(roomId, transportId);

            if (!room || !transport) {
                throw new Error('Room or transport not found');
            }

            // Check if we can consume
            if (!room.router.canConsume({ producerId, rtpCapabilities })) {
                logger.log('consume-cannot-consume', { roomId, producerId, socketId: socket.id, level: 'WARN' });
                throw new Error('Cannot consume');
            }

            const consumer = await transport.consume({
                producerId,
                rtpCapabilities,
                paused: false,
            });

            roomManager.addConsumer(roomId, consumer.id, consumer);
            logger.log('consumer-created', { roomId, consumerId: consumer.id, producerId, socketId: socket.id, data: { kind: consumer.kind } });

            callback({
                success: true,
                id: consumer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
                producerId: consumer.producerId,
            });
        } catch (error: any) {
            console.error('❌ consume error:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Resume consumer
    socket.on('resume-consumer', async ({ roomId, consumerId }, callback) => {
        try {
            const room = roomManager.getRoom(roomId);
            const consumer = room?.consumers.get(consumerId);

            if (!consumer) {
                throw new Error('Consumer not found');
            }

            await consumer.resume();
            callback({ success: true });
        } catch (error: any) {
            console.error('❌ resume-consumer error:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Start recording
    socket.on('start-recording', async ({ roomId }, callback) => {
        try {
            console.log(`📥 start-recording: ${roomId}`);

            const room = roomManager.getRoom(roomId);
            if (!room || !room.producer) {
                throw new Error('Room or producer not found');
            }

            if (room.recorder) {
                throw new Error('Recording already in progress');
            }

            // Initialize recorder
            const recorder = new Recorder(
                room.router,
                roomId,
                room.producer.id,
                room.producer.kind === 'audio'
            );

            await recorder.start();
            room.recorder = recorder;

            callback({ success: true });
        } catch (error: any) {
            console.error('❌ start-recording error:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Stop recording
    socket.on('stop-recording', async ({ roomId }, callback) => {
        try {
            console.log(`📥 stop-recording: ${roomId}`);

            const room = roomManager.getRoom(roomId);
            if (!room || !room.recorder) {
                throw new Error('Recording not found');
            }

            await room.recorder.stop();
            delete room.recorder;

            callback({ success: true });
        } catch (error: any) {
            console.error('❌ stop-recording error:', error);
            callback({ success: false, error: error.message });
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);

        const roomId = socket.data.roomId;
        if (roomId) {
            // Clean up room if no more clients
            const room = io.sockets.adapter.rooms.get(roomId);
            if (!room || room.size === 0) {
                roomManager.deleteRoom(roomId);
                mediasoupManager.deleteRouter(roomId);
            }
        }
    });
});

// Start server
async function start() {
    try {
        // Initialize Mediasoup
        await mediasoupManager.init();

        // Start HTTP server
        httpServer.listen(config.http.listenPort, config.http.listenIp, () => {
            console.log(`\n🚀 Mediasoup SFU Server running on http://${config.http.listenIp}:${config.http.listenPort}`);
            console.log(`📡 WebRTC ports: ${config.mediasoup.worker.rtcMinPort}-${config.mediasoup.worker.rtcMaxPort}`);
            console.log(`✅ Server ready!\n`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Handle shutdown
process.on('SIGINT', () => {
    console.log('\n⚠️  Shutting down gracefully...');
    httpServer.close(() => {
        console.log('✓ Server closed');
        process.exit(0);
    });
});

start();
