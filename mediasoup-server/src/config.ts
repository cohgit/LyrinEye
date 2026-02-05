import * as mediasoup from 'mediasoup';
import { RtpCodecCapability } from 'mediasoup/node/lib/types';

export const config = {
    // HTTP server
    http: {
        listenIp: '0.0.0.0',
        listenPort: 3000,
    },

    // Mediasoup settings
    mediasoup: {
        // Number of workers (CPU cores)
        numWorkers: 2,

        // Worker settings
        worker: {
            rtcMinPort: 10000,
            rtcMaxPort: 10100,
            logLevel: 'warn' as mediasoup.types.WorkerLogLevel,
            logTags: [
                'info',
                'ice',
                'dtls',
                'rtp',
                'srtp',
                'rtcp',
            ] as mediasoup.types.WorkerLogTag[],
        },

        // Router settings
        router: {
            mediaCodecs: [
                {
                    kind: 'audio',
                    mimeType: 'audio/opus',
                    clockRate: 48000,
                    channels: 2,
                },
                {
                    kind: 'video',
                    mimeType: 'video/VP8',
                    clockRate: 90000,
                    parameters: {
                        'x-google-start-bitrate': 1000,
                    },
                },
                {
                    kind: 'video',
                    mimeType: 'video/H264',
                    clockRate: 90000,
                    parameters: {
                        'packetization-mode': 1,
                        'profile-level-id': '42e01f',
                        'level-asymmetry-allowed': 1,
                        'x-google-start-bitrate': 1000,
                    },
                },
            ] as RtpCodecCapability[],
        },

        // WebRTC transport settings
        webRtcTransport: {
            listenIps: [
                {
                    ip: '0.0.0.0',
                    announcedIp: process.env.ANNOUNCED_IP || undefined,
                },
            ],
            maxIncomingBitrate: 1500000,
            initialAvailableOutgoingBitrate: 1000000,
        },

        // Plain RTP transport (for recording)
        plainTransport: {
            listenIp: {
                ip: '0.0.0.0',
                announcedIp: '127.0.0.1',
            },
            rtcpMux: false,
            comedia: true,
        },
    },

    // Recording settings
    recording: {
        chunkDuration: 60, // seconds
        outputDir: '/tmp/recordings',
        videoCodec: 'libx264',
        audioCodec: 'aac',
        format: 'mp4',
    },

    // Azure Storage
    azure: {
        connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
        containerName: 'recordings',
    },

    // Backend API
    backend: {
        url: process.env.BACKEND_URL || 'http://localhost:8080',
    },
};
