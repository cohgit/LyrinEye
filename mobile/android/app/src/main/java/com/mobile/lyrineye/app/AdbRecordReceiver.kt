package com.mobile.lyrineye.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Lanzar grabación Monitor sin usar la UI: `adb shell am broadcast -a com.mobile.lyrineye.app.ADB_START_RECORD`
 * Requiere sesión ya iniciada en la app. La actividad usa showWhenLocked para intentar mostrarse sobre el lock screen.
 */
class AdbRecordReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != ACTION) return
        val launch = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse(DEEP_LINK)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        context.startActivity(launch)
    }

    companion object {
        const val ACTION = "com.mobile.lyrineye.app.ADB_START_RECORD"
        const val DEEP_LINK = "lyrineye://adb/record"
    }
}
