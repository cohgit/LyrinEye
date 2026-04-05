declare module 'react-native-keep-awake';

declare module 'react-native' {
  interface NativeModulesStatic {
    DeviceHealthModule?: {
      getHealthSnapshot(): Promise<{
        batteryTempC: number | null
        thermalStatus: string
        thermalStatusCode: number
        powerSaveMode: boolean
        deviceIdleMode: boolean
        ignoringBatteryOptimizations: boolean
      }>
      openBatteryOptimizationSettings(): void
      requestIgnoreBatteryOptimizations(): void
    }
  }
}
