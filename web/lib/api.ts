import axios from 'axios'

const WORKSPACE_ID = '4293cd25-8e2b-475a-a591-fc110d03fac7'

export async function getDevices() {
    // For now, query Log Analytics directly
    // In production, this should go through the backend API
    const query = `
    union LyrinEyeLogs_CL, LyrinEyeTelemetria_CL
    | summarize 
        LastSeen = max(TimeGenerated),
        AvgCPU = avg(todouble(CPUUsage_s)),
        AvgRAM = avg(todouble(RamUsedMB_s)),
        LastBattery = arg_max(TimeGenerated, todouble(BatteryLevel_s)),
        IsCharging = arg_max(TimeGenerated, IsCharging_b)
      by DeviceName_s
    | extend Status = iff(LastSeen > ago(5m), 'online', 'offline')
    | project 
        id = DeviceName_s,
        name = DeviceName_s,
        lastSeen = LastSeen,
        status = Status,
        cpu = AvgCPU,
        ram = AvgRAM,
        battery = LastBattery,
        isCharging = IsCharging
  `

    // This is a placeholder - in reality you'll need to use Azure SDK or backend proxy
    return [
        {
            id: 'nokia-2',
            name: 'Nokia 2',
            lastSeen: '2026-01-28T21:19:13.501Z',
            status: 'offline' as const,
            battery: 0.38,
            cpu: 91.25,
            ram: 112.4,
            isCharging: true,
        },
    ]
}

export async function getDeviceDetails(deviceId: string) {
    // Placeholder - implement Azure Log Analytics query
    return {
        id: deviceId,
        name: 'Nokia 2',
        lastSeen: '2026-01-28T21:19:13.501Z',
        status: 'offline' as const,
        battery: 0.38,
        cpu: 91.25,
        ram: 112.4,
        isCharging: true,
        androidVersion: '7.1.1',
        appVersion: '0.1.22.46',
        wifiSSID: 'DOOMSDAY',
        location: {
            latitude: -33.457770,
            longitude: -70.651572,
        },
        telemetry: [],
    }
}

export async function sendPushCommand(deviceId: string, command: string) {
    const response = await axios.post(
        `${process.env.BACKEND_API_URL}/api/devices/${deviceId}/commands`,
        { command }
    )
    return response.data
}
