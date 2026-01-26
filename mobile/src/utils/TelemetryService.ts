import { AzureLogger } from './AzureLogger';
import DeviceInfo from 'react-native-device-info';
// import { getFreeDiskStorage, getTotalDiskCapacity } from 'react-native-fs'; // Removing FS for now to keep it simple or use if already installed
// We have react-native-fs installed? Yes.
import RNFS from 'react-native-fs';

class TelemetryService {
    private intervalId: ReturnType<typeof setInterval> | null = null;
    private readonly INTERVAL_MS = 60000; // 60 seconds

    start() {
        if (this.intervalId) return;

        console.log('Starting Telemetry Service');
        this.intervalId = setInterval(() => {
            this.collectAndSend();
        }, this.INTERVAL_MS);

        // Send immediately on start
        this.collectAndSend();
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    private async collectAndSend() {
        try {
            const batteryLevel = await DeviceInfo.getBatteryLevel();
            const freeDisk = await RNFS.getFSInfo().then(info => info.freeSpace).catch(() => -1);
            // Ram usage is not directly available in standard RN-device-info without native modules linking sometimes behaving differently on iOS/Android
            // But getTotalMemory is available.
            const totalMemory = await DeviceInfo.getTotalMemory();
            const usedMemory = await DeviceInfo.getUsedMemory(); // Might require newer versions or specific platform support

            const telemetryData = {
                batteryLevel: (batteryLevel * 100).toFixed(1) + '%',
                storageFreeMB: (freeDisk / 1024 / 1024).toFixed(0),
                ramUsedMB: (usedMemory / 1024 / 1024).toFixed(0),
                ramTotalMB: (totalMemory / 1024 / 1024).toFixed(0),
                cpu: 'N/A', // High overhead to measure CPU usage in JS thread reliably without native heavy lifting
                isCharging: await DeviceInfo.isBatteryCharging(),
                timestamp: new Date().toISOString()
            };

            AzureLogger.log('System Telemetry', telemetryData, 'INFO'); // Or a specific 'METRIC' type if we had one

        } catch (error) {
            console.warn('Failed to collect telemetry', error);
        }
    }
}

export const Telemetry = new TelemetryService();
