import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { Router, Producer, PlainTransport, RtpCodecCapability } from 'mediasoup/node/lib/types';
import { config } from './config';
import { BlobServiceClient } from '@azure/storage-blob';
import axios from 'axios';

export class Recorder {
    private transport?: PlainTransport;
    private process?: ChildProcess;
    private consumer?: any; // Mediasoup consumer
    private readonly router: Router;
    private readonly roomId: string;
    private readonly producerId: string;
    private readonly isAudio: boolean;
    private blobServiceClient?: BlobServiceClient;
    private segmentTimer?: NodeJS.Timeout;
    private currentSdpPath?: string;
    private segmentStartedAt?: number;

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

        if (this.segmentTimer) {
            clearInterval(this.segmentTimer);
            this.segmentTimer = undefined;
        }

        await this.stopCurrentSegment();
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
        const sdpContent = this.createSdp(rtpPort);
        const sdpPath = path.join(recordingDir, `${this.producerId}-${Date.now()}.sdp`);
        fs.writeFileSync(sdpPath, sdpContent);
        this.currentSdpPath = sdpPath;

        await this.startNewSegment();
        this.segmentTimer = setInterval(() => {
            this.rotateSegment().catch((error) => {
                console.error('❌ Failed rotating segment:', error);
            });
        }, config.recording.chunkDuration * 1000);
    }

    private async rotateSegment() {
        await this.stopCurrentSegment();
        await this.startNewSegment();
    }

    private async startNewSegment() {
        if (!this.currentSdpPath) {
            throw new Error('Missing SDP path for recorder segment');
        }
        const recordingDir = config.recording.outputDir;
        const filename = `${this.roomId}-${this.producerId}-${Date.now()}.${config.recording.format}`;
        const filepath = path.join(recordingDir, filename);

        const args = [
            '-protocol_whitelist', 'file,udp,rtp',
            '-analyzeduration', '10000000',
            '-probesize', '10000000'
        ];

        if (this.isAudio) {
            args.push('-i', this.currentSdpPath);
            args.push('-c:a', config.recording.audioCodec);
            args.push('-b:a', '128k');
        } else {
            // For video, specify size to avoid 'unspecified size' errors with VP8
            args.push('-video_size', '640x480');
            args.push('-i', this.currentSdpPath);
            args.push('-c:v', config.recording.videoCodec);
            args.push('-preset', 'veryfast');
            args.push('-tune', 'zerolatency');
        }

        args.push('-movflags', 'faststart', '-y', filepath);

        console.log(`🎬 Spawning FFmpeg segment: ffmpeg ${args.join(' ')}`);
        this.segmentStartedAt = Date.now();
        this.process = spawn('ffmpeg', args);

        this.process.stderr?.on('data', (data) => {
            const msg = data.toString().trim();
            if (msg) console.log(`[FFmpeg] ${msg.slice(0, 500)}`);
        });

        this.process.on('close', async (code) => {
            console.log(`FFmpeg segment exited with code ${code}`);
            await this.finalizeSegment(filepath, filename);
        });
    }

    private async stopCurrentSegment() {
        if (!this.process) return;
        const proc = this.process;
        this.process = undefined;
        await new Promise<void>((resolve) => {
            proc.once('close', () => resolve());
            proc.kill('SIGINT');
            setTimeout(() => {
                if (!proc.killed) {
                    proc.kill('SIGKILL');
                }
                resolve();
            }, 5000);
        });
    }

    private async finalizeSegment(filepath: string, filename: string) {
        try {
            if (!fs.existsSync(filepath)) return;
            const ageMs = this.segmentStartedAt ? Date.now() - this.segmentStartedAt : 0;
            if (ageMs < 500) {
                console.warn(`⚠️ Segment too short (${ageMs}ms), discarding.`);
                fs.unlinkSync(filepath);
                return;
            }

            const uploaded = await this.uploadToAzure(filepath, filename);
            if (!uploaded) return;

            const thumbnailName = await this.generateAndUploadThumbnail(filepath, filename);
            await this.notifyBackend(filename, thumbnailName, Math.max(1, Math.round(ageMs / 1000)));
            fs.unlinkSync(filepath);
        } catch (error) {
            console.error('❌ Failed finalizing segment:', error);
        }
    }

    private createSdp(port: number): string {
        const codec = this.consumer.rtpParameters.codecs[0];
        const codecName = codec.mimeType.split('/')[1].toUpperCase();
        const isAudio = this.isAudio;

        // VP8 requires explicit video size in SDP for FFmpeg to accept the stream
        const videoSizeLine = !isAudio ? 'a=framesize:101 640-480\n' : '';

        return `v=0
o=- 0 0 IN IP4 127.0.0.1
s=Mediasoup Recorder
c=IN IP4 127.0.0.1
t=0 0
m=${isAudio ? 'audio' : 'video'} ${port} RTP/AVP ${codec.payloadType}
a=rtpmap:${codec.payloadType} ${codec.mimeType.split('/')[1]}/${codec.clockRate}${isAudio ? '/' + codec.channels : ''}
${videoSizeLine}${codec.parameters ? this.fmtpString(codec.payloadType, codec.parameters) : ''}
`;
    }

    private fmtpString(payloadType: number, params: any): string {
        const paramStr = Object.keys(params)
            .map(key => `${key}=${params[key]}`)
            .join(';');
        return `a=fmtp:${payloadType} ${paramStr}`;
    }

    private async uploadToAzure(filepath: string, blobName: string): Promise<boolean> {
        if (!this.blobServiceClient) {
            console.warn('⚠️ No Azure connection string, skipping upload');
            return false;
        }

        try {
            console.log(`📤 Uploading ${blobName} to Azure...`);
            const containerClient = this.blobServiceClient.getContainerClient(config.azure.containerName);
            await containerClient.createIfNotExists();

            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            await blockBlobClient.uploadFile(filepath);

            console.log(`✅ Upload successful: ${blobName}`);
            return true;
        } catch (error) {
            console.error('❌ Upload failed:', error);
            return false;
        }
    }

    private async generateAndUploadThumbnail(videoPath: string, videoBlobName: string): Promise<string> {
        const thumbnailName = videoBlobName.replace(/\.[^.]+$/, '.jpg');
        const thumbnailPath = path.join(config.recording.outputDir, thumbnailName);
        try {
            await new Promise<void>((resolve, reject) => {
                const args = ['-y', '-i', videoPath, '-ss', '00:00:01.000', '-vframes', '1', thumbnailPath];
                const thumb = spawn('ffmpeg', args);
                thumb.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`thumbnail ffmpeg exited with ${code}`));
                });
                thumb.on('error', reject);
            });

            if (!this.blobServiceClient || !fs.existsSync(thumbnailPath)) return '';
            const containerClient = this.blobServiceClient.getContainerClient(config.azure.containerName);
            await containerClient.createIfNotExists();
            const blob = containerClient.getBlockBlobClient(thumbnailName);
            await blob.uploadFile(thumbnailPath);
            fs.unlinkSync(thumbnailPath);
            return thumbnailName;
        } catch (error) {
            console.warn('⚠️ Thumbnail generation/upload failed:', error);
            if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
            return '';
        }
    }

    private async notifyBackend(blobName: string, thumbnailBlobName: string, durationSec: number) {
        try {
            await axios.post(`${config.backend.url}/recordings`, {
                blobName,
                thumbnailBlobName,
                roomId: this.roomId,
                deviceId: this.roomId,
                timestamp: new Date().toISOString(),
                duration: durationSec,
            }, {
                timeout: 10000
            });
        } catch (error) {
            console.warn('⚠️ Failed notifying backend recording metadata:', error);
        }
    }
}
