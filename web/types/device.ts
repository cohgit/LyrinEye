export interface Device {
    id: string
    name: string
    lastSeen: string
    status: 'online' | 'offline'
    battery: number
    cpu: number
    ram: number
    isCharging: boolean
    isTransmitting: boolean
    isRecording: boolean
}

export interface TelemetryData {
    timestamp: string
    cpu: number
    ram: number
    battery: number
    storage: number
}

export interface DeviceDetail extends Device {
    telemetry: any
    location?: {
        latitude: number
        longitude: number
    }
    androidVersion: string
    appVersion: string
    wifiSSID: string
    ipAddress?: string
    streaming?: boolean
}
