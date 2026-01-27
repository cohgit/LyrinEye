import ReactNativeBlobUtil from 'react-native-blob-util';
import { CONFIG } from '../config';
import { AzureLogger } from './AzureLogger';
import DeviceInfo from 'react-native-device-info';

class RecordingUploadService {

    // Cache SAS tokens per container to avoid fetching every time? 
    // For now, fetch fresh for each upload to be safe and simple.

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
            AzureLogger.log('Upload Failed', { error: String(error) }, 'ERROR');
            throw error;
        }
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
