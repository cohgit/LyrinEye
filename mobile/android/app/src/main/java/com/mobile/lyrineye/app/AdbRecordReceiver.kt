package com.mobile.lyrineye.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * ADB control entrypoint for monitor mode:
 * - START: `adb shell am broadcast -a com.mobile.lyrineye.app.ADB_START_RECORD`
 * - STOP:  `adb shell am broadcast -a com.mobile.lyrineye.app.ADB_STOP_RECORD`
 * - TOGGLE:`adb shell am broadcast -a com.mobile.lyrineye.app.ADB_TOGGLE_RECORD`
 *
 * Requires an existing logged-in session.
 */
class AdbRecordReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        val command = when (action) {
            ACTION_START -> "start"
            ACTION_STOP -> "stop"
            ACTION_TOGGLE -> "toggle"
            ACTION_STOP_LEGACY -> "stop"
            ACTION_TOGGLE_LEGACY -> "toggle"
            else -> return
        }
        val commandId = System.currentTimeMillis().toString()
        val launch = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("$DEEP_LINK?cmd=$command&id=$commandId")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        context.startActivity(launch)
    }

    companion object {
        const val ACTION_START = "com.mobile.lyrineye.app.ADB_START_RECORD"
        const val ACTION_STOP = "com.mobile.lyrineye.app.ADB_STOP_RECORD"
        const val ACTION_TOGGLE = "com.mobile.lyrineye.app.ADB_TOGGLE_RECORD"
        // Legacy aliases for compatibility with older scripts.
        const val ACTION_STOP_LEGACY = "com.mobile.lyrineye.app.ADB_STOP"
        const val ACTION_TOGGLE_LEGACY = "com.mobile.lyrineye.app.ADB_TOGGLE"
        const val DEEP_LINK = "lyrineye://adb/record"
    }
}
