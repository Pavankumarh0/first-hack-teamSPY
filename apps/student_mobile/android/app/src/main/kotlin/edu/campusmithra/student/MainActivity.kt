package edu.campusmithra.student

import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Push notifications arrive on this channel (AndroidManifest.xml names it
        // as FCM's default; the id is "push.androidChannel" in constants.json).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "campus_updates", "Campus updates", NotificationManager.IMPORTANCE_HIGH,
            ).apply { description = "New notices and events from the campus" }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }
}
