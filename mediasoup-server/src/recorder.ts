import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { Router, Producer, PlainTransport, RtpCodecCapability } from 'mediasoup/node/lib/types';
import { config } from './config';
import { BlobServiceClient } from '@azure/storage-blob';

export class Recorder {
    private transport?: PlainTransport;
    private process?: ChildProcess;
    private consumer?: any; // Mediasoup consumer
    private readonly router: Router;
    private readonly roomId: string;
    private readonly producerId: string;
    private readonly isAudio: boolean;
    private blobServiceClient?: BlobServiceClient;

    constructor(
        router: Router,
        roomId: string,
        producerId: string,
        isAudio: boolean = false
    ) {
        this.router = router;
        this.roomId = roomId;
        this.producerId = producerId;
        this.isAudio = isAudio;

        if (config.azure.connectionString) {
            this.blobServiceClient = BlobServiceClient.fromConnectionString(config.azure.connectionString);
        }
    }

    async start() {
        console.log(`🎥 Starting recorder for ${this.isAudio ? 'audio' : 'video'} producer: ${this.producerId}`);

        // 1. Create Plain Transport for recording
        this.transport = await this.router.createPlainTransport({
            listenIp: config.mediasoup.plainTransport.listenIp,
            rtcpMux: false,
            comedia: false // We define the port
        });

        // 2. Consume the stream
        const rtpCapabilities: RtpCodecCapability[] = config.mediasoup.router.mediaCodecs;

        this.consumer = await this.transport.consume({
            producerId: this.producerId,
            rtpCapabilities: {
                codecs: rtpCapabilities // Simplification: assume default capabilities work
            },
            paused: true
        });

        // 3. Connect transport (needs remote port, but for plain transport FFmpeg binds to local)
        // In PlainTransport, we get `tuple.localPort` where mediasoup listens.
        // FFmpeg should SEND to this port? No, Mediasoup SENDS to FFmpeg.
        // So we need to tell Mediasoup WHERE FFmpeg is listening.

        // Actually, simple flow:
        // Mediasoup (PlainTransport) -> send RTP -> FFmpeg (UDP input)

        // We need to pick a port for FFmpeg to listen on.
        const remotePort = await this.getPort();
        const remoteIp = '127.0.0.1';

        await this.transport.connect({
            ip: remoteIp,
            port: remotePort,
            // RTCP port usually +1
            rtcpPort: remotePort + 1
        });

        // 4. Start FFmpeg process
        await this.startFFmpeg(remotePort);

        // 5. Resume consumer
        await this.consumer.resume();

        console.log(`✅ Recorder started on port ${remotePort}`);
    }

    async stop() {
        console.log(`🛑 Stopping recorder for ${this.producerId}`);

        if (this.consumer) {
            this.consumer.close();
        }

        if (this.transport) {
            this.transport.close();
        }

        if (this.process) {
            this.process.kill('SIGINT');
        }
    }

    // Helper to find a free UDP port (simplified)
    // In production use a port manager
    private async getPort(): Promise<number> {
        return Math.floor(Math.random() * (20000 - 15000) + 15000);
    }

    private async startFFmpeg(rtpPort: number) {
        const recordingDir = config.recording.outputDir; // e.g. /tmp/recordings
        if (!fs.existsSync(recordingDir)) {
            fs.mkdirSync(recordingDir, { recursive: true });
        }

        const filename = `${this.roomId}-${this.producerId}-${Date.now()}.${config.recording.format}`;
        const filepath = path.join(recordingDir, filename);

        // Create SDP file for FFmpeg to understand the RTP stream
        // This is crucial. FFmpeg needs to know codec parameters.
        const sdpContent = this.createSdp(rtpPort);
        const sdpPath = path.join(recordingDir, `${this.producerId}.sdp`);
        fs.writeFileSync(sdpPath, sdpContent);

        // FFmpeg args
        const args = [
            '-protocol_whitelist', 'file,udp,rtp',
            '-i', sdpPath,
            '-c:v', 'copy', // Save raw stream (re-encoding is expensive)
            '-c:a', 'copy',
            '-y',
            filepath
        ];

        console.log(`🎬 Spawning FFmpeg: ffmpeg ${args.join(' ')}`);

        this.process = spawn('ffmpeg', args);

        this.process.stderr?.on('data', (data) => {
            // FFmpeg logs to stderr
            // console.log(`FFmpeg: ${data}`);
        });

        this.process.on('close', async (code) => {
            console.log(`FFmpeg exited with code ${code}`);
            // Clean up SDP
            if (fs.existsSync(sdpPath)) fs.unlinkSync(sdpPath);

            // Upload to Azure
            await this.uploadToAzure(filepath, filename);
        });
    }

    private createSdp(port: number): string {
        const codec = this.consumer.rtpParameters.codecs[0];

        return `v=0
o=- 0 0 IN IP4 127.0.0.1
s=Mediasoup Recorder
c=IN IP4 127.0.0.1
t=0 0
m=${this.isAudio ? 'audio' : 'video'} ${port} RTP/AVP ${codec.payloadType}
a=rtpmap:${codec.payloadType} ${codec.mimeType.split('/')[1]}/${codec.clockRate}${this.isAudio ? '/' + codec.channels : ''}
${codec.parameters ? this.fmtpString(codec.payloadType, codec.parameters) : ''}
`;
    }

    private fmtpString(payloadType: number, params: any): string {
        const paramStr = Object.keys(params)
            .map(key => `${key}=${params[key]}`)
            .join(';');
        return `a=fmtp:${payloadType} ${paramStr}`;
    }

    private async uploadToAzure(filepath: string, blobName: string) {
        if (!this.blobServiceClient) {
            console.warn('⚠️ No Azure connection string, skipping upload');
            return;
        }

        try {
            console.log(`📤 Uploading ${blobName} to Azure...`);
            const containerClient = this.blobServiceClient.getContainerClient(config.azure.containerName);
            await containerClient.createIfNotExists();

            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.uploadFile(filepath);

            console.log(`✅ Upload successful: ${blobName}`);

            // Delete local file after upload
            fs.unlinkSync(filepath);
        } catch (error) {
            console.error('❌ Upload failed:', error);
        }
    }
}
