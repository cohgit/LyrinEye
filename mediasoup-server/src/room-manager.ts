import { Router, Producer, Consumer, WebRtcTransport, RtpCapabilities } from 'mediasoup/node/lib/types';
import { Recorder } from './recorder';

export interface Room {
    id: string;
    router: Router;
    producer?: Producer; // The device streaming
    consumers: Map<string, Consumer>; // Viewers
    transports: Map<string, WebRtcTransport>;
    recorder?: Recorder;
}

export class RoomManager {
    private rooms: Map<string, Room> = new Map();

    createRoom(roomId: string, router: Router): Room {
        const room: Room = {
            id: roomId,
            router,
            consumers: new Map(),
            transports: new Map(),
        };

        this.rooms.set(roomId, room);
        console.log(`✓ Room created: ${roomId}`);
        return room;
    }

    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    deleteRoom(roomId: string) {
        const room = this.rooms.get(roomId);
        if (room) {
            // Close all transports
            room.transports.forEach(transport => transport.close());

            // Close producer
            if (room.producer) {
                room.producer.close();
            }

            // Close all consumers
            room.consumers.forEach(consumer => consumer.close());

            this.rooms.delete(roomId);
            console.log(`✓ Room deleted: ${roomId}`);
        }
    }

    addProducer(roomId: string, producer: Producer) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.producer = producer;
            console.log(`✓ Producer added to room: ${roomId}`);
        }
    }

    addConsumer(roomId: string, consumerId: string, consumer: Consumer) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.consumers.set(consumerId, consumer);
            console.log(`✓ Consumer ${consumerId} added to room: ${roomId}`);
        }
    }

    removeConsumer(roomId: string, consumerId: string) {
        const room = this.rooms.get(roomId);
        if (room) {
            const consumer = room.consumers.get(consumerId);
            if (consumer) {
                consumer.close();
                room.consumers.delete(consumerId);
                console.log(`✓ Consumer ${consumerId} removed from room: ${roomId}`);
            }
        }
    }

    addTransport(roomId: string, transportId: string, transport: WebRtcTransport) {
        const room = this.rooms.get(roomId);
        if (room) {
            room.transports.set(transportId, transport);
        }
    }

    getTransport(roomId: string, transportId: string): WebRtcTransport | undefined {
        const room = this.rooms.get(roomId);
        return room?.transports.get(transportId);
    }

    getRoomStats() {
        const stats: any[] = [];
        this.rooms.forEach((room, roomId) => {
            stats.push({
                roomId,
                hasProducer: !!room.producer,
                consumerCount: room.consumers.size,
                transportCount: room.transports.size,
            });
        });
        return stats;
    }
}
