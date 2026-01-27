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
                BatteryLevel: (batteryLevel * 100).toFixed(1) + '%',
                StorageFreeMB: (freeDisk / 1024 / 1024).toFixed(0),
                RamUsedMB: (usedMemory / 1024 / 1024).toFixed(0),
                RamTotalMB: (totalMemory / 1024 / 1024).toFixed(0),
                CPUUsage: 'N/A',
                IsCharging: await DeviceInfo.isBatteryCharging(),
                Timestamp: new Date().toISOString()
            };

            await AzureLogger.telemetry(telemetryData);

        } catch (error) {
            console.warn('Failed to collect telemetry', error);
        }
    }
}

export const Telemetry = new TelemetryService();
