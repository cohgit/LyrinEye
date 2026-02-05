import { Device, types } from 'mediasoup-client';
import { io, Socket } from 'socket.io-client';
import { CONFIG } from '../config';
import { AzureLogger } from './AzureLogger';

// Polyfills for Mediasoup
import 'react-native-get-random-values';
import { registerGlobals } from 'react-native-webrtc';

// Ensure WebRTC globals are available
registerGlobals();

export class MediasoupClient {
    private socket: Socket | null = null;
    private device: Device | null = null;
    private sendTransport: types.Transport | null = null;
    private producers: Map<string, types.Producer> = new Map();
    private roomId: string | null = null;

    constructor() {
        this.device = new Device();
    }

    // 1. Connect to Signaling Server
    async connect(roomId: string): Promise<void> {
        this.roomId = roomId;

        return new Promise((resolve, reject) => {
            this.socket = io(`https://${CONFIG.MEDIASOUP_HOST}`, {
                transports: ['websocket'],
            });

            this.socket.on('connect', async () => {
                AzureLogger.log('Mediasoup Signaling Connected');
                try {
                    await this.joinRoom();
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });

            this.socket.on('connect_error', (error) => {
                console.error('Signaling connection error:', error);
                reject(error);
            });

            this.socket.on('disconnect', () => {
                AzureLogger.log('Mediasoup Signaling Disconnected');
            });
        });
    }

    // 2. Join Room & Initialize Device
    private async joinRoom() {
        if (!this.socket || !this.roomId) return;

        return new Promise<void>((resolve, reject) => {
            this.socket!.emit('join-room', { roomId: this.roomId, role: 'producer' }, async (response: any) => {
                if (response.error) {
                    return reject(response.error);
                }

                try {
                    // Load Device
                    if (!this.device!.loaded) {
                        await this.device!.load({ routerRtpCapabilities: response.rtpCapabilities });
                    }

                    // Create Transport
                    await this.createSendTransport();
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    // 3. Create Send Transport
    private async createSendTransport() {
        return new Promise<void>((resolve, reject) => {
            this.socket!.emit('create-transport', { roomId: this.roomId, direction: 'send' }, async (response: any) => {
                if (response.error) return reject(response.error);

                // Create local transport
                this.sendTransport = this.device!.createSendTransport({
                    id: response.id,
                    iceParameters: response.iceParameters,
                    iceCandidates: response.iceCandidates,
                    dtlsParameters: response.dtlsParameters,
                });

                // Handle 'connect' event (DTLS exchange)
                this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
                    try {
                        this.socket!.emit('connect-transport', {
                            roomId: this.roomId,
                            transportId: this.sendTransport!.id,
                            dtlsParameters,
                        });
                        callback();
                    } catch (error: any) {
                        errback(error);
                    }
                });

                // Handle 'produce' event (Start streaming)
                this.sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
                    try {
                        this.socket!.emit('produce', {
                            roomId: this.roomId,
                            transportId: this.sendTransport!.id,
                            kind,
                            rtpParameters,
                            appData,
                        }, (response: any) => {
                            if (response.error) errback(new Error(response.error));
                            else callback({ id: response.id });
                        });
                    } catch (error: any) {
                        errback(error);
                    }
                });

                resolve();
            });
        });
    }

    // 4. Produce Media (Audio/Video)
    async produce(track: MediaStreamTrack) {
        if (!this.sendTransport) throw new Error('Transport not ready');

        try {
            const producer = await this.sendTransport.produce({ track });
            this.producers.set(track.kind, producer);

            AzureLogger.log('Mediasoup Producing', { kind: track.kind, id: producer.id });

            producer.on('transportclose', () => {
                this.producers.delete(track.kind);
            });

            producer.on('close', () => {
                this.producers.delete(track.kind);
            });

        } catch (error) {
            console.error('Produce error:', error);
            throw error;
        }
    }

    // 5. Start/Stop Server Recording
    async startServerRecording() {
        if (!this.socket) return;
        return new Promise<void>((resolve, reject) => {
            this.socket!.emit('start-recording', { roomId: this.roomId }, (res: any) => {
                if (res.success) resolve();
                else reject(new Error(res.error));
            });
        });
    }

    async stopServerRecording() {
        if (!this.socket) return;
        return new Promise<void>((resolve, reject) => {
            this.socket!.emit('stop-recording', { roomId: this.roomId }, (res: any) => {
                if (res.success) resolve();
                else reject(new Error(res.error));
            });
        });
    }

    disconnect() {
        this.producers.forEach(p => p.close());
        this.sendTransport?.close();
        this.socket?.disconnect();
        this.socket = null;
        this.sendTransport = null;
        this.producers.clear();
    }
}

export const mediasoupClient = new MediasoupClient();
