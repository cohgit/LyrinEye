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
            const totalMemory = await DeviceInfo.getTotalMemory();
            const usedMemory = await DeviceInfo.getUsedMemory();

            // Real-time CPU Usage calculation for Android
            const cpuUsage = await this.getCPUUsage();

            const telemetryData = {
                BatteryLevel: (batteryLevel * 100).toFixed(1) + '%',
                StorageFreeMB: (freeDisk / 1024 / 1024).toFixed(0),
                RamUsedMB: (usedMemory / 1024 / 1024).toFixed(0),
                RamTotalMB: (totalMemory / 1024 / 1024).toFixed(0),
                CPUUsage: cpuUsage,
                IsCharging: await DeviceInfo.isBatteryCharging(),
                Timestamp: new Date().toISOString()
            };

            await AzureLogger.telemetry(telemetryData);

        } catch (error) {
            console.warn('Failed to collect telemetry', error);
        }
    }

    private async getCPUUsage(): Promise<string> {
        try {
            // proc/stat is standard on Android for CPU metrics
            const readStat = async () => {
                const stat = await RNFS.readFile('/proc/stat', 'utf8');
                const line = stat.split('\n')[0]; // First line is 'cpu' aggregate
                const parts = line.split(/\s+/).slice(1).map(Number);
                const idle = parts[3]; // idle time is index 3
                const total = parts.reduce((acc, current) => acc + current, 0);
                return { idle, total };
            };

            const start = await readStat();
            // Wait 500ms for a differential reading
            await new Promise(resolve => setTimeout(resolve, 500));
            const end = await readStat();

            const idleDelta = end.idle - start.idle;
            const totalDelta = end.total - start.total;

            if (totalDelta === 0) return '0.0%';

            const usage = 100 * (1 - idleDelta / totalDelta);
            return usage.toFixed(1) + '%';

        } catch (error) {
            // Fail silently to 'N/A' on non-Android or restricted systems
            return 'N/A';
        }
    }
}

export const Telemetry = new TelemetryService();
