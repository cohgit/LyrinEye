declare module 'react-native-keep-awake';

declare module 'react-native' {
  interface NativeModulesStatic {
    DeviceHealthModule?: {
      getHealthSnapshot(): Promise<{
        batteryTempC: number | null
        thermalStatus: string
        thermalStatusCode: number
        thermalHeadroom: number | null
        cpuUsagePercent: number | null
        powerSaveMode: boolean
        deviceIdleMode: boolean
        ignoringBatteryOptimizations: boolean
      }>
      openBatteryOptimizationSettings(): void
      requestIgnoreBatteryOptimizations(): void
    }
  }
}
