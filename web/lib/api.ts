import axios from 'axios'
import { Device, DeviceDetail } from '@/types/device'

const isServer = typeof window === 'undefined';
const BACKEND_API_URL = isServer
    ? (process.env.BACKEND_API_URL || 'http://localhost:8080')
    : ''; // Empty string in client means use relative path

// Helper to determine the corrected base URL
const getBaseUrl = () => {
    if (isServer) return BACKEND_API_URL;
    return '/api/proxy'; // Relative path to our local proxy
};

export async function getDevices(email?: string): Promise<Device[]> {
    try {
        const response = await axios.get(`${getBaseUrl()}/api/devices`, {
            params: { email },
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
                isTransmitting: false,
                isRecording: false
            },
        ];
    }
}

export async function getDeviceDetails(deviceId: string): Promise<DeviceDetail | null> {
    try {
        const response = await axios.get(`${getBaseUrl()}/api/devices/${deviceId}`, {
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
            isTransmitting: false, // Added property
            isRecording: false,    // Added property
            androidVersion: '13',
            appVersion: 'v1.0.0',
            wifiSSID: 'LyrinEye_Secure',
            telemetry: [],         // Ensure this matches types
            location: {
                latitude: -33.45,
                longitude: -70.66
            }
        };
    }
}

export async function sendPushCommand(deviceId: string, command: string) {
    const response = await axios.post(
        `${getBaseUrl()}/api/devices/${deviceId}/commands`,
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
        const response = await axios.get(`${getBaseUrl()}/api/devices/${deviceId}/stats/logs`, {
            params: { start, end, granularity }
        });
        return response.data;
    } catch (error) {
        console.error(`Failed to fetch log stats for ${deviceId}:`, error);
        return [];
    }
}

export interface Recording {
    url: string
    thumbnailUrl?: string
    timestamp: string
    deviceId: string
    duration?: number
    size?: number
}

export async function getRecordings(deviceId: string): Promise<Recording[]> {
    try {
        const response = await axios.get(`${getBaseUrl()}/api/recordings`, {
            params: { roomId: deviceId }
        });
        return response.data;
    } catch (error) {
        console.error(`Failed to fetch recordings for ${deviceId}:`, error);
        return [];
    }
}
