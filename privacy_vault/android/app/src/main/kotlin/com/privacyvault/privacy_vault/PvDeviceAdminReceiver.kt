package com.privacyvault.privacy_vault

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

/**
 * FAZ 10 — Kaldırmaya karşı OPSİYONEL koruma (Device Admin).
 * Kullanıcının sistem izin ekranından açıkça onayladığı resmi Android API'sidir.
 * Aktifken uygulamanın kaldırılması sistem tarafından, koruma kapatılana dek engellenir.
 * Kullanıcı her zaman Ayarlar → KORUMA bölümünden veya sistem
 * "Cihaz yönetici uygulamalar" ekranından geri alabilir.
 * Bu receiver hiçbir politika (parola zorlama, silme vb.) talep ETMEZ.
 */
class PvDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        LockPrefs.appendEvent(context, "adminGranted", "Kaldırma koruması etkin")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        LockPrefs.appendEvent(context, "adminRevoked", "Kaldırma koruması kapatıldı")
    }
}
