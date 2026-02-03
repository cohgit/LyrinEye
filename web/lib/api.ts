import axios from 'axios'
import { Device, DeviceDetail } from '@/types/device'

const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8080'

export async function getDevices(): Promise<Device[]> {
    try {
        const response = await axios.get(`${BACKEND_API_URL}/api/devices`, {
            timeout: 5000
        });
        return response.data;
    } catch (error) {
        console.error('Failed to fetch devices:', error);
        // Fallback for development if backend is not reachable
        return [
            {
                id: 'nokia-2',
                name: 'Nokia 2',
                lastSeen: new Date().toISOString(),
                status: 'online',
                battery: 0.85,
                cpu: 12.5,
                ram: 450,
                isCharging: false,
            },
        ];
    }
}

export async function getDeviceDetails(deviceId: string): Promise<DeviceDetail | null> {
    try {
        const response = await axios.get(`${BACKEND_API_URL}/api/devices/${deviceId}`, {
            timeout: 5000
        });
        return response.data;
    } catch (error) {
        console.error(`Failed to fetch device details for ${deviceId}:`, error);
        // Fallback for development
        return {
            id: deviceId,
            name: 'Device ' + deviceId,
            lastSeen: new Date().toISOString(),
            status: 'online',
            battery: 0.85,
            cpu: 12.5,
            ram: 450,
            isCharging: false,
            androidVersion: '13',
            appVersion: 'v1.0.0',
            wifiSSID: 'LyrinEye_Secure',
            telemetry: [],
            location: {
                latitude: -33.45,
                longitude: -70.66
            }
        };
    }
}

export async function sendPushCommand(deviceId: string, command: string) {
    const response = await axios.post(
        `${BACKEND_API_URL}/api/devices/${deviceId}/commands`,
        { command }
    )
    return response.data
}

export async function getLogStats(
    deviceId: string,
    start: string,
    end: string,
    granularity: '1d' | '1h' | '1m'
) {
    try {
        const response = await axios.get(`${BACKEND_API_URL}/api/devices/${deviceId}/stats/logs`, {
            params: { start, end, granularity }
        });
        return response.data;
    } catch (error) {
        console.error(`Failed to fetch log stats for ${deviceId}:`, error);
        return [];
    }
}
