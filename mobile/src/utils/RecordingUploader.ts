import ReactNativeBlobUtil from 'react-native-blob-util';
import { CONFIG } from '../config';
import { AzureLogger } from './AzureLogger';
import DeviceInfo from 'react-native-device-info';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const PENDING_UPLOADS_KEY = '@lyrineye_pending_uploads';
const PENDING_DIR = `${ReactNativeBlobUtil.fs.dirs.DocumentDir}/pending_uploads`;

class RecordingUploadService {

    // Cache SAS tokens per container to avoid fetching every time? 
    // For now, fetch fresh for each upload to be safe and simple.

    private isProcessing = false;

    constructor() {
        this.setupConnectivityListener();
        this.ensurePendingDir();
    }

    private async ensurePendingDir() {
        const exists = await ReactNativeBlobUtil.fs.exists(PENDING_DIR);
        if (!exists) {
            await ReactNativeBlobUtil.fs.mkdir(PENDING_DIR);
        }
    }

    private setupConnectivityListener() {
        NetInfo.addEventListener(state => {
            if (state.isConnected) {
                console.log('[UPLOAD] Connection restored, processing queue...');
                this.processPendingQueue();
            }
        });
    }

    async uploadRecording(filePath: string, durationSec: number, thumbnailPath?: string) {
        try {
            const fileName = filePath.split('/').pop();
            if (!fileName) throw new Error("Invalid file path");

            AzureLogger.log('Starting Upload Strategy', { fileName });

            // 1. Upload Thumbnail first if available
            let thumbnailBlobName = '';
            if (thumbnailPath) {
                thumbnailBlobName = fileName.replace('.mp4', '.jpg');
                await this.uploadFile(thumbnailPath, thumbnailBlobName, 'image/jpeg');
            }

            // 2. Get SAS Token and Upload Video
            const sasUrl = `${CONFIG.SIGNALING_SERVER}/sas?blobName=${fileName}`;
            const sasResponse = await fetch(sasUrl);
            if (!sasResponse.ok) throw new Error(`Failed to get SAS token: ${sasResponse.status}`);
            const { uploadUrl } = await sasResponse.json();

            await ReactNativeBlobUtil.fetch('PUT', uploadUrl, {
                'x-ms-blob-type': 'BlockBlob',
                'Content-Type': 'video/mp4',
            }, ReactNativeBlobUtil.wrap(filePath));

            AzureLogger.log('Blob Upload Successful', { fileName });

            // 3. Notify Backend with metadata
            const metadataResponse = await fetch(`${CONFIG.SIGNALING_SERVER}/recordings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    blobName: fileName,
                    thumbnailBlobName: thumbnailBlobName,
                    timestamp: new Date().toISOString(),
                    duration: durationSec,
                    roomId: 'default-room',
                    deviceId: await DeviceInfo.getUniqueId()
                })
            });

            if (!metadataResponse.ok) {
                AzureLogger.log('Metadata Save Failed', { status: metadataResponse.status }, 'WARN');
            }

            return true;
        } catch (error) {
            AzureLogger.log('Upload Failed - Queueing locally', { error: String(error) }, 'WARN');
            await this.enqueueFailedUpload(filePath, durationSec, thumbnailPath);
            return false;
        }
    }

    private async enqueueFailedUpload(filePath: string, durationSec: number, thumbnailPath?: string) {
        try {
            const fileName = filePath.split('/').pop()!;
            const persistentPath = `${PENDING_DIR}/${fileName}`;

            // Move file to persistent storage
            await ReactNativeBlobUtil.fs.cp(filePath, persistentPath);

            let persistentThumbPath = '';
            if (thumbnailPath) {
                const thumbName = thumbnailPath.split('/').pop()!;
                persistentThumbPath = `${PENDING_DIR}/${thumbName}`;
                await ReactNativeBlobUtil.fs.cp(thumbnailPath, persistentThumbPath);
            }

            const pending = await this.getPendingQueue();
            pending.push({
                filePath: persistentPath,
                durationSec,
                thumbnailPath: persistentThumbPath,
                timestamp: new Date().toISOString()
            });

            // Limit queue size (keep most recent 50)
            if (pending.length > 50) {
                const removed = pending.shift();
                if (removed) {
                    await ReactNativeBlobUtil.fs.unlink(removed.filePath);
                    if (removed.thumbnailPath) await ReactNativeBlobUtil.fs.unlink(removed.thumbnailPath);
                }
            }

            await AsyncStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(pending));
            console.log(`[UPLOAD] Enqueued ${fileName} for later. Queue size: ${pending.length}`);
        } catch (e) {
            console.error('[UPLOAD] Failed to enqueue:', e);
        }
    }

    private async getPendingQueue(): Promise<any[]> {
        const stored = await AsyncStorage.getItem(PENDING_UPLOADS_KEY);
        return stored ? JSON.parse(stored) : [];
    }

    async processPendingQueue() {
        if (this.isProcessing) return;

        const net = await NetInfo.fetch();
        if (!net.isConnected) return;

        const queue = await this.getPendingQueue();
        if (queue.length === 0) return;

        this.isProcessing = true;
        console.log(`[UPLOAD] Processing queue of ${queue.length} items...`);

        const remaining = [];
        for (const item of queue) {
            try {
                // Check if files still exist
                if (await ReactNativeBlobUtil.fs.exists(item.filePath)) {
                    const success = await this.performUpload(item.filePath, item.durationSec, item.thumbnailPath);
                    if (success) {
                        // Clean up persistent files
                        await ReactNativeBlobUtil.fs.unlink(item.filePath);
                        if (item.thumbnailPath) await ReactNativeBlobUtil.fs.unlink(item.thumbnailPath);
                        continue;
                    }
                }
                remaining.push(item);
            } catch (e) {
                console.error('[UPLOAD] Failed to process queued item:', e);
                remaining.push(item);
            }
        }

        await AsyncStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(remaining));
        this.isProcessing = false;
        console.log(`[UPLOAD] Queue processing finished. ${remaining.length} items left.`);
    }

    private async performUpload(filePath: string, durationSec: number, thumbnailPath?: string) {
        // Redo the logic from uploadRecording but without re-queueing on failure
        const fileName = filePath.split('/').pop()!;

        let thumbnailBlobName = '';
        if (thumbnailPath && await ReactNativeBlobUtil.fs.exists(thumbnailPath)) {
            thumbnailBlobName = fileName.replace('.mp4', '.jpg').replace('.mov', '.jpg');
            await this.uploadFile(thumbnailPath, thumbnailBlobName, 'image/jpeg');
        }

        const sasUrl = `${CONFIG.SIGNALING_SERVER}/sas?blobName=${fileName}`;
        const sasResponse = await fetch(sasUrl);
        if (!sasResponse.ok) return false;
        const { uploadUrl } = await sasResponse.json();

        await ReactNativeBlobUtil.fetch('PUT', uploadUrl, {
            'x-ms-blob-type': 'BlockBlob',
            'Content-Type': 'video/mp4',
        }, ReactNativeBlobUtil.wrap(filePath));

        await fetch(`${CONFIG.SIGNALING_SERVER}/recordings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                blobName: fileName,
                thumbnailBlobName: thumbnailBlobName,
                timestamp: new Date().toISOString(),
                duration: durationSec,
                roomId: 'default-room',
                deviceId: await DeviceInfo.getUniqueId()
            })
        });

        return true;
    }

    private async uploadFile(localPath: string, blobName: string, contentType: string) {
        const sasUrl = `${CONFIG.SIGNALING_SERVER}/sas?blobName=${blobName}`;
        const sasResponse = await fetch(sasUrl);
        if (!sasResponse.ok) throw new Error(`Failed to get SAS token for ${blobName}`);
        const { uploadUrl } = await sasResponse.json();

        await ReactNativeBlobUtil.fetch('PUT', uploadUrl, {
            'x-ms-blob-type': 'BlockBlob',
            'Content-Type': contentType,
        }, ReactNativeBlobUtil.wrap(localPath));

        AzureLogger.log('File Upload Successful', { blobName });
    }
}

export const RecordingUploader = new RecordingUploadService();
