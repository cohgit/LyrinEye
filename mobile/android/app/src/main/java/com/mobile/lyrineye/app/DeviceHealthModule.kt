package com.mobile.lyrineye.app

import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

class DeviceHealthModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "DeviceHealthModule"

  private fun thermalStatusCode(): Int {
    val pm = reactContext.getSystemService(PowerManager::class.java) ?: return -1
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      pm.currentThermalStatus
    } else {
      -1
    }
  }

  private fun thermalStatusLabel(code: Int): String {
    return when (code) {
      PowerManager.THERMAL_STATUS_NONE -> "none"
      PowerManager.THERMAL_STATUS_LIGHT -> "light"
      PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
      PowerManager.THERMAL_STATUS_SEVERE -> "severe"
      PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
      PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
      PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
      else -> "unknown"
    }
  }

  private fun batteryTemperatureC(): Double? {
    val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
    val batteryIntent = reactContext.registerReceiver(null, filter) ?: return null
    val tempTenths = batteryIntent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
    if (tempTenths == Int.MIN_VALUE) return null
    return tempTenths / 10.0
  }

  private fun isIgnoringBatteryOptimizations(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val pm = reactContext.getSystemService(PowerManager::class.java) ?: return false
    return pm.isIgnoringBatteryOptimizations(reactContext.packageName)
  }

  private fun isPowerSaveMode(): Boolean {
    val pm = reactContext.getSystemService(PowerManager::class.java) ?: return false
    return pm.isPowerSaveMode
  }

  private fun isDeviceIdleMode(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
    val pm = reactContext.getSystemService(PowerManager::class.java) ?: return false
    return pm.isDeviceIdleMode
  }

  private fun thermalHeadroom(): Double? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
    val pm = reactContext.getSystemService(PowerManager::class.java) ?: return null
    return try {
      pm.getThermalHeadroom(0).toDouble()
    } catch (_: Exception) {
      null
    }
  }

  @ReactMethod
  fun getHealthSnapshot(promise: Promise) {
    try {
      val code = thermalStatusCode()
      val batteryTemp = batteryTemperatureC()
      val snapshot: WritableMap = Arguments.createMap().apply {
        putInt("thermalStatusCode", code)
        putString("thermalStatus", thermalStatusLabel(code))
        if (batteryTemp != null) {
          putDouble("batteryTempC", batteryTemp)
        } else {
          putNull("batteryTempC")
        }
        val headroom = thermalHeadroom()
        if (headroom != null) {
          putDouble("thermalHeadroom", headroom)
        } else {
          putNull("thermalHeadroom")
        }
        putBoolean("powerSaveMode", isPowerSaveMode())
        putBoolean("deviceIdleMode", isDeviceIdleMode())
        putBoolean("ignoringBatteryOptimizations", isIgnoringBatteryOptimizations())
      }
      promise.resolve(snapshot)
    } catch (e: Exception) {
      promise.reject("E_DEVICE_HEALTH", e)
    }
  }

  @ReactMethod
  fun openBatteryOptimizationSettings() {
    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactContext.startActivity(intent)
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
      data = Uri.parse("package:${reactContext.packageName}")
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactContext.startActivity(intent)
  }
}

