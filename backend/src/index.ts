import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 8080;

// Simple store for rooms and their roles
// Room ID -> { monitor: socketId, viewers: [socketId] }
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
            // Notify viewers that monitor is online
            socket.to(roomId).emit('monitor-online');
        } else {
            room.viewers.push(socket.id);
            // If monitor is already there, notify the new viewer
            if (room.monitor) {
                socket.emit('monitor-online');
            }
        }
    });

    // WebRTC Signaling: Offer
    socket.on('offer', (data: { roomId: string, offer: any }) => {
        console.log(`Relaying offer from ${socket.id} in room ${data.roomId}`);
        socket.to(data.roomId).emit('offer', { from: socket.id, offer: data.offer });
    });

    // WebRTC Signaling: Answer
    socket.on('answer', (data: { roomId: string, answer: any, to: string }) => {
        console.log(`Relaying answer from ${socket.id} to ${data.to}`);
        io.to(data.to).emit('answer', { from: socket.id, answer: data.answer });
    });

    // WebRTC Signaling: ICE Candidates
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

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

app.get('/health', (req, res) => {
    res.send({ status: 'ok', rooms: rooms.size });
});

httpServer.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
