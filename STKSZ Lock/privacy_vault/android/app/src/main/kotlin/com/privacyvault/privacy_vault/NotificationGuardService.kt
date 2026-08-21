package com.privacyvault.privacy_vault

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.concurrent.Executors

/**
 * Bildirim gizliliği (FAZ 10 — seviyeli politika):
 * Kullanıcının açıkça işaretlediği kilitli uygulamalar için:
 *   MOD 2 (Bildirimi gizle): bildirim tamamen kaldırılır.
 *   MOD 1 (İçeriği gizle): bildirim kaldırılır; yerine içeriksiz, SESSİZ
 *     "gizlendi" kartı bırakılır. Ses/titreşim davranışı Android'in bildirim
 *     kanalı ayarından kullanıcı tarafından yönetilir (varsayılan: sessiz).
 * Yalnızca kullanıcının verdiği bildirim erişimi izniyle çalışır.
 * Dürüstlük: OS, uygulama İÇİNDEKİ bildirim üretimini engellemez; kaldırılan
 * bildirim hedef uygulamada ulaştığı gibi durur — yalnızca gölgede gösterilmez.
 *
 * Sertleştirme: SharedPreferences/JSON okuma-yazma ve NotificationManager
 * çağrıları ana iş parçacığından ÇIKARILDI (tek iş parçacıklı yürütücü).
 * Bildirim fırtınalarında ANR/blokaj riski kalmaz; olaylar sırayla işlenir.
 */
class NotificationGuardService : NotificationListenerService() {

    companion object {
        private const val MASK_CHANNEL = "pv_masked"
        private const val MASK_NOTIF_ID = 73101
    }

    // Sıralı, tek arka plan yürütücüsü: prefs okuma/yazma + iptal/postalama burada.
    private val executor = Executors.newSingleThreadExecutor()

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val pkg = sbn?.packageName ?: return
        if (pkg == packageName) return
        val key = sbn.key ?: return
        val mode = LockPrefs.notifModeFor(this, pkg)
        if (mode == 0) return
        // Kilidi açık bir oturum varsa (tempUnlock) dokunma.
        if (LockPrefs.isTempUnlocked(this, pkg)) return
        executor.execute {
            try {
                cancelNotification(key)
                if (mode == 1) {
                    postMasked(pkg)
                    LockPrefs.appendEvent(this, "notifMasked", pkg)
                } else {
                    LockPrefs.appendEvent(this, "notifHidden", pkg)
                }
            } catch (e: Exception) { /* sistem reddedebilir */ }
        }
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }

    private fun postMasked(pkg: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(MASK_CHANNEL, "Gizlenen bildirimler", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "İçeriği gizlenen bildirimlerin sessiz yer tutucuları"
                    setSound(null, null)
                    enableVibration(false)
                }
            )
        }
        val label = try {
            packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
        } catch (e: Exception) { pkg }
        val b: Notification.Builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, MASK_CHANNEL)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        val n = b
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentTitle(label)
            .setContentText("1 bildirim gizlendi — içerik korumada")
            .setAutoCancel(true)
            .build()
        nm.notify(MASK_NOTIF_ID + (pkg.hashCode() and 0xFFF), n)
    }
}
