import { AzureLogger } from './AzureLogger';
import DeviceInfo from 'react-native-device-info';
// import { getFreeDiskStorage, getTotalDiskCapacity } from 'react-native-fs'; // Removing FS for now to keep it simple or use if already installed
// We have react-native-fs installed? Yes.
import RNFS from 'react-native-fs';
import Geolocation from '@react-native-community/geolocation';
import { NativeModules, Platform } from 'react-native';

type ThermalInfo = {
    batteryTempC: number | null;
    thermalStatus: string;
    thermalStatusCode: number;
    thermalHeadroom: number | null;
    cpuUsagePercent: number | null;
    powerSaveMode: boolean;
    deviceIdleMode: boolean;
    ignoringBatteryOptimizations: boolean;
};

const deviceHealth = (NativeModules as any).DeviceHealthModule as {
    getHealthSnapshot?: () => Promise<Partial<ThermalInfo>>;
} | undefined;

type MemInfoKpis = {
    memTotalKb: number;
    memFreeKb: number;
    memAvailableKb: number;
    buffersKb: number;
    cachedKb: number;
};

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

    private async getCoordinates(): Promise<{ lat: number; lon: number } | null> {
        return new Promise((resolve) => {
            Geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    });
                },
                (error) => {
                    console.warn('[TELEMETRY] Geolocation error:', error.message);
                    resolve(null);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
            );
        });
    }

    private async collectAndSend() {
        try {
            const freeDiskBytes = await RNFS.getFSInfo().then(info => info.freeSpace).catch(() => -1);
            const thermal = await this.getThermalInfo();
            const memInfo = await this.getMemInfoKpis();

            // CPU usage: prefer Android native snapshot (more reliable), fallback to proc/stat.
            const cpuUsage = await this.getCpuUsage(thermal);

            // Device Metrics
            const powerState = await DeviceInfo.getPowerState();
            const batteryLevel = powerState.batteryLevel ?? 0;

            // Geolocation
            const coords = await this.getCoordinates();

            // Emit telemetry only when required KPIs are available.
            // CPU may be unavailable on some Android builds; in that case
            // we still send the rest of the snapshot without fabricating CPU.
            if (
                !memInfo ||
                !Number.isFinite(batteryLevel) ||
                freeDiskBytes < 0
            ) {
                console.warn('[TELEMETRY] Skipping send due to incomplete KPI snapshot', {
                    hasMemInfo: !!memInfo,
                    cpuUsage,
                    batteryLevel,
                    freeDiskBytes
                });
                return;
            }

            const ramUsedKb = Math.max(0, memInfo.memTotalKb - memInfo.memAvailableKb);
            if (cpuUsage == null) {
                console.warn('[TELEMETRY] CPU KPI unavailable; sending partial telemetry snapshot');
            }

            const telemetryData: Record<string, unknown> = {
                BatteryLevel: Number(batteryLevel.toFixed(4)),
                StorageFreeMB: Number((freeDiskBytes / 1024 / 1024).toFixed(2)),
                RamUsedMB: Number((ramUsedKb / 1024).toFixed(2)),
                RamTotalMB: Number((memInfo.memTotalKb / 1024).toFixed(2)),
                MemTotalKB: memInfo.memTotalKb,
                MemFreeKB: memInfo.memFreeKb,
                MemAvailableKB: memInfo.memAvailableKb,
                BuffersKB: memInfo.buffersKb,
                CachedKB: memInfo.cachedKb,
                IsCharging: powerState.batteryState === 'charging' || powerState.batteryState === 'full',
                BatteryStatus: powerState.batteryState || 'unknown',
                LowPowerMode: powerState.lowPowerMode ? 'Yes' : 'No',
                Mode: 'owner', // Defaulting to owner for now, could be made configurable
                Latitude: coords?.lat?.toFixed(6) ?? 'N/A',
                Longitude: coords?.lon?.toFixed(6) ?? 'N/A',
                BatteryTempC: thermal.batteryTempC != null ? thermal.batteryTempC.toFixed(1) : 'N/A',
                DeviceTempC: thermal.batteryTempC != null ? thermal.batteryTempC.toFixed(1) : 'N/A',
                ThermalStatus: thermal.thermalStatus || 'unknown',
                ThermalStatusCode: thermal.thermalStatusCode ?? -1,
                ThermalStatusLevel: thermal.thermalStatusCode ?? -1,
                ThermalHeadroom: thermal.thermalHeadroom ?? 'N/A',
                PowerSaveMode: thermal.powerSaveMode,
                DeviceIdleMode: thermal.deviceIdleMode,
                IgnoringBatteryOptimizations: thermal.ignoringBatteryOptimizations,
                Timestamp: new Date().toISOString()
            };

            if (cpuUsage != null) {
                telemetryData.CPUUsage = Number(cpuUsage.toFixed(2));
            }

            console.log('[TELEMETRY] Prepared payload', {
                hasCpu: cpuUsage != null,
                batteryLevel: telemetryData.BatteryLevel,
                ramUsedMB: telemetryData.RamUsedMB,
                ramTotalMB: telemetryData.RamTotalMB,
                storageFreeMB: telemetryData.StorageFreeMB,
                isCharging: telemetryData.IsCharging,
                timestamp: telemetryData.Timestamp
            });

            await AzureLogger.telemetry(telemetryData);

        } catch (error) {
            console.warn('Failed to collect telemetry', error);
        }
    }

    private async getThermalInfo(): Promise<ThermalInfo> {
        if (Platform.OS !== 'android' || !deviceHealth?.getHealthSnapshot) {
            return {
                batteryTempC: null,
                thermalStatus: 'unsupported',
                thermalStatusCode: -1,
                thermalHeadroom: null,
                cpuUsagePercent: null,
                powerSaveMode: false,
                deviceIdleMode: false,
                ignoringBatteryOptimizations: false,
            };
        }
        try {
            const info = await deviceHealth.getHealthSnapshot();
            return {
                batteryTempC: info?.batteryTempC ?? null,
                thermalStatus: info?.thermalStatus || 'unknown',
                thermalStatusCode: typeof info?.thermalStatusCode === 'number' ? info.thermalStatusCode : -1,
                thermalHeadroom: typeof info?.thermalHeadroom === 'number' ? info.thermalHeadroom : null,
                cpuUsagePercent: typeof info?.cpuUsagePercent === 'number' ? info.cpuUsagePercent : null,
                powerSaveMode: info?.powerSaveMode === true,
                deviceIdleMode: info?.deviceIdleMode === true,
                ignoringBatteryOptimizations: info?.ignoringBatteryOptimizations === true,
            };
        } catch {
            return {
                batteryTempC: null,
                thermalStatus: 'error',
                thermalStatusCode: -1,
                thermalHeadroom: null,
                cpuUsagePercent: null,
                powerSaveMode: false,
                deviceIdleMode: false,
                ignoringBatteryOptimizations: false,
            };
        }
    }

    private async getCpuUsage(thermal: ThermalInfo): Promise<number | null> {
        if (typeof thermal.cpuUsagePercent === 'number' && Number.isFinite(thermal.cpuUsagePercent)) {
            return Math.max(0, Math.min(100, thermal.cpuUsagePercent));
        }
        return this.getCPUUsage();
    }

    private async getCPUUsage(): Promise<number | null> {
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
            await new Promise<void>(resolve => setTimeout(resolve, 500));
            const end = await readStat();

            const idleDelta = end.idle - start.idle;
            const totalDelta = end.total - start.total;

            if (totalDelta === 0) return 0;

            const usage = 100 * (1 - idleDelta / totalDelta);
            return Number.isFinite(usage) ? Math.max(0, Math.min(100, usage)) : null;

        } catch (error) {
            return null;
        }
    }

    private async getMemInfoKpis(): Promise<MemInfoKpis | null> {
        try {
            const meminfo = await RNFS.readFile('/proc/meminfo', 'utf8');
            const lines = meminfo.split('\n');
            const values: Record<string, number> = {};

            for (const line of lines) {
                const match = line.match(/^([A-Za-z_()]+):\s+(\d+)\s+kB$/);
                if (!match) continue;
                const [, key, raw] = match;
                const parsed = Number(raw);
                if (Number.isFinite(parsed)) {
                    values[key] = parsed;
                }
            }

            const memTotalKb = values.MemTotal;
            const memFreeKb = values.MemFree;
            const memAvailableKb = values.MemAvailable;
            const buffersKb = values.Buffers;
            const cachedKb = values.Cached;

            if (
                !Number.isFinite(memTotalKb) ||
                !Number.isFinite(memFreeKb) ||
                !Number.isFinite(memAvailableKb) ||
                !Number.isFinite(buffersKb) ||
                !Number.isFinite(cachedKb)
            ) {
                return null;
            }

            return {
                memTotalKb,
                memFreeKb,
                memAvailableKb,
                buffersKb,
                cachedKb
            };
        } catch {
            return null;
        }
    }
}

export const Telemetry = new TelemetryService();
