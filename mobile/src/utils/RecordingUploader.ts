import ReactNativeBlobUtil from 'react-native-blob-util';
import { CONFIG } from '../config';
import { AzureLogger } from './AzureLogger';
import DeviceInfo from 'react-native-device-info';

class RecordingUploadService {

    // Cache SAS tokens per container to avoid fetching every time? 
    // For now, fetch fresh for each upload to be safe and simple.

    async uploadRecording(filePath: string, durationSec: number) {
        try {
            const fileName = filePath.split('/').pop();
            if (!fileName) throw new Error("Invalid file path");

            AzureLogger.log('Starting Upload Strategy', { fileName });

            // 1. Get SAS Token from Backend
            // Note: CONFIG.SIGNALING_SERVER is the base URL
            const sasUrl = `${CONFIG.SIGNALING_SERVER}/sas?blobName=${fileName}`;
            const sasResponse = await fetch(sasUrl);

            if (!sasResponse.ok) {
                throw new Error(`Failed to get SAS token: ${sasResponse.status}`);
            }

            const { uploadUrl } = await sasResponse.json();
            AzureLogger.log('Got SAS Token', { uploadUrl: uploadUrl.split('?')[0] + '...[SAS]' });

            // 2. Upload to Azure Blob Storage using PUT
            await ReactNativeBlobUtil.fetch('PUT', uploadUrl, {
                'x-ms-blob-type': 'BlockBlob',
                'Content-Type': 'video/mp4',
            }, ReactNativeBlobUtil.wrap(filePath));

            AzureLogger.log('Blob Upload Successful', { fileName });

            // 3. Notify Backend to save metadata
            const metadataResponse = await fetch(`${CONFIG.SIGNALING_SERVER}/recordings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    blobName: fileName,
                    timestamp: new Date().toISOString(),
                    duration: durationSec,
                    // roomId could be retrieved from a store or context
                    roomId: 'default-room',
                    deviceId: await DeviceInfo.getUniqueId()
                })
            });

            if (!metadataResponse.ok) {
                AzureLogger.log('Metadata Save Failed', { status: metadataResponse.status }, 'WARN');
            } else {
                AzureLogger.log('Metadata Saved Successfully');
            }

            // 4. Cleanup Local File
            // await ReactNativeBlobUtil.fs.unlink(filePath);
            return true;

        } catch (error) {
            AzureLogger.log('Upload Failed', { error: String(error) }, 'ERROR');
            throw error;
        }
    }
}

export const RecordingUploader = new RecordingUploadService();
