import { Device } from 'mediasoup-client';
import { Transport, Consumer } from 'mediasoup-client/lib/types';
import { io, Socket } from 'socket.io-client';
import { MEDIASOUP_CONFIG } from './MediasoupConfig';

export class MediasoupViewer {
    private socket: Socket | null = null;
    private device: Device | null = null;
    private recvTransport: Transport | null = null;
    private consumer: Consumer | null = null;
    private roomId: string | null = null;
    private onTrack: (track: MediaStreamTrack) => void;

    constructor(onTrack: (track: MediaStreamTrack) => void) {
        this.onTrack = onTrack;
        this.device = new Device();
    }

    async connect(roomId: string): Promise<void> {
        this.roomId = roomId;

        return new Promise((resolve, reject) => {
            this.socket = io(MEDIASOUP_CONFIG.SERVER_URL, {
                transports: ['websocket'],
            });

            this.socket.on('connect', async () => {
                console.log('✅ Connected to Mediasoup Signaling');
                try {
                    await this.joinRoom();
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });

            this.socket.on('connect_error', (err) => {
                console.error('❌ Signaling Connect Error:', err);
                reject(err);
            });

            // Handle new producer in room
            this.socket.on('new-producer', async ({ producerId }) => {
                console.log('📹 New producer announced:', producerId);
                await this.consume(producerId);
            });
        });
    }

    private async joinRoom() {
        if (!this.socket || !this.roomId) return;

        return new Promise<void>((resolve, reject) => {
            this.socket!.emit('join-room', { roomId: this.roomId, role: 'viewer' }, async (response: any) => {
                if (response.error) return reject(response.error);

                try {
                    const { rtpCapabilities } = response;

                    if (!this.device!.loaded) {
                        await this.device!.load({ routerRtpCapabilities: rtpCapabilities });
                    }

                    // Create Transport
                    await this.createRecvTransport();
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    private async createRecvTransport() {
        return new Promise<void>((resolve, reject) => {
            this.socket!.emit('create-transport', { roomId: this.roomId, direction: 'recv' }, async (response: any) => {
                if (response.error) return reject(response.error);

                this.recvTransport = this.device!.createRecvTransport({
                    id: response.id,
                    iceParameters: response.iceParameters,
                    iceCandidates: response.iceCandidates,
                    dtlsParameters: response.dtlsParameters,
                });

                this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                    try {
                        this.socket!.emit('connect-transport', {
                            roomId: this.roomId,
                            transportId: this.recvTransport!.id,
                            dtlsParameters,
                        });
                        callback();
                    } catch (error: any) {
                        errback(error);
                    }
                });

                resolve();
            });
        });
    }

    // Allow manual consumption if we know the producer ID (or just try to consume 'video'/'audio')
    // For simplicity, we assume we receive 'new-producer' event or we ask for streams.
    // Ideally, the join-room response should list existing producers.
    // Mediasoup server implementation: socket.emit('new-producer') to existing peers?
    // Let's assume we consume upon notification.
    // BUT: If producer is already there, we missed the event.
    // The server implementation of 'join-room' didn't return producers list. 
    // We might need to ask the server "who is producing?".
    // Or just try to consume broadly? No, we need producerId.

    // Improvement: The UI will trigger consumption or we add 'get-producers' to server.
    // For now MVP: Mobile starts producing effectively *after* we join (trigger by viewer presence).
    // AND: Mobile *starts* streaming when viewer joins. So we receive 'new-producer'.

    async consume(producerId: string) {
        if (!this.recvTransport) return;

        const { rtpCapabilities } = this.device!;

        return new Promise<void>((resolve, reject) => {
            this.socket!.emit('consume', {
                roomId: this.roomId,
                transportId: this.recvTransport!.id,
                producerId,
                rtpCapabilities,
            }, async (response: any) => {
                if (response.error) return reject(response.error);

                const { id, kind, rtpParameters } = response;

                this.consumer = await this.recvTransport!.consume({
                    id,
                    producerId,
                    kind,
                    rtpParameters,
                });

                const { track } = this.consumer;
                this.onTrack(track);

                // Resume consumer
                this.socket!.emit('resume-consumer', { roomId: this.roomId, consumerId: this.consumer.id });
                resolve();
            });
        });
    }

    disconnect() {
        this.recvTransport?.close();
        this.socket?.disconnect();
    }
}
