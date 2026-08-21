package com.privacyvault.privacy_vault

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.WindowManager
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream

/**
 * Flutter ↔ native köprüsü: uygulama listesi, ikonlar, izin ekranları,
 * FLAG_SECURE ve kilit yapılandırması senkronu.
 * FlutterFragmentActivity: local_auth biyometrik API'si için gerekli.
 */
class MainActivity : FlutterFragmentActivity() {

    private val channelName = "privacy_vault/native"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName).setMethodCallHandler { call, result ->
            when (call.method) {
                "getInstalledApps" -> result.success(installedApps())
                "getAppIcon" -> {
                    val pkg = call.argument<String>("package")
                    result.success(if (pkg != null) appIcon(pkg) else null)
                }
                "syncLockState" -> {
                    @Suppress("UNCHECKED_CAST")
                    val args = (call.arguments as? Map<String, Any?>) ?: emptyMap()
                    LockPrefs.saveSync(this, args)
                    result.success(true)
                }
                "setFlagSecure" -> {
                    val enabled = call.argument<Boolean>("enabled") ?: false
                    setFlagSecure(enabled)
                    result.success(true)
                }
                "isAccessibilityEnabled" -> result.success(isServiceEnabled(
                    "enabled_accessibility_services",
                    "$packageName/.LockAccessibilityService",
                ))
                "canDrawOverlays" -> result.success(Settings.canDrawOverlays(this))
                "isNotificationListenerEnabled" -> result.success(isServiceEnabled(
                    "enabled_notification_listeners",
                    "$packageName/.NotificationGuardService",
                ))
                "openAccessibilitySettings" -> { openIntent(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); result.success(true) }
                "openOverlaySettings" -> {
                    openIntent(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
                    result.success(true)
                }
                "openNotificationListenerSettings" -> {
                    openIntent(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); result.success(true)
                }
                "openAppNotificationSettings" -> {
                    val pkg = call.argument<String>("package") ?: packageName
                    val i = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    openIntent(i)
                    result.success(true)
                }
                "drainNativeEvents" -> result.success(LockPrefs.drainEvents(this))
                // ---------- FAZ 10: başlatıcı kimliği (activity-alias) ----------
                "setLauncherIdentity" -> {
                    val id = call.argument<String>("id") ?: "default"
                    result.success(setLauncherIdentity(id))
                }
                // ---------- FAZ 10: kaldırmaya karşı koruma (Device Admin) ----------
                "isDeviceAdminActive" -> result.success(isDeviceAdminActive())
                "requestDeviceAdmin" -> { requestDeviceAdmin(); result.success(true) }
                "removeDeviceAdmin" -> { removeDeviceAdmin(); result.success(true) }
                else -> result.notImplemented()
            }
        }
    }

    // ---------- yerleşik uygulamalar ----------
    private fun installedApps(): List<Map<String, Any>> {
        val pm = packageManager
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val flags = PackageManager.MATCH_ALL.toLong()
        val resolved = if (Build.VERSION.SDK_INT >= 33)
            pm.queryIntentActivities(launcher, PackageManager.ResolveInfoFlags.of(flags))
        else
            @Suppress("DEPRECATION") pm.queryIntentActivities(launcher, 0)

        val seen = HashSet<String>()
        val out = ArrayList<Map<String, Any>>()
        for (ri in resolved) {
            val pkg = ri.activityInfo.packageName
            if (!seen.add(pkg)) continue
            val label = ri.loadLabel(pm).toString()
            val category = categorize(pm, pkg)
            out.add(mapOf("package" to pkg, "label" to label, "category" to category))
        }
        return out
    }

    private fun categorize(pm: PackageManager, pkg: String): String {
        // OS kategorisi (API 26+) öncelikli
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                val ai = pm.getApplicationInfo(pkg, 0)
                when (ai.category) {
                    ApplicationInfo.CATEGORY_SOCIAL -> return "Sosyal"
                    ApplicationInfo.CATEGORY_GAME -> return "Oyunlar"
                    ApplicationInfo.CATEGORY_VIDEO, ApplicationInfo.CATEGORY_AUDIO -> return "Medya"
                    ApplicationInfo.CATEGORY_PRODUCTIVITY -> return "Sistem"
                }
            }
        } catch (e: Exception) {}
        // paket adı sezgiselleri
        val p = pkg.lowercase()
        return when {
            listOf("whatsapp", "telegram", "signal", "messenger", "viber", "threema", "imessage").any { p.contains(it) } -> "Mesajlaşma"
            listOf("instagram", "facebook", "twitter", "tiktok", "snapchat", "reddit", "linkedin", "pinterest", "threads").any { p.contains(it) } -> "Sosyal"
            listOf("bank", "finans", "isbank", "garanti", "ziraat", "yapikredi", "akbank", "vakifbank", "halkbank", "papara", "paypal", "binance", "borsa", "kripto", "wallet").any { p.contains(it) } -> "Banka & Finans"
            listOf("gallery", "photos", "camera", "galeri", "foto").any { p.contains(it) } -> "Galeri & Fotoğraf"
            listOf("game", "play.games").any { p.contains(it) } -> "Oyunlar"
            p.startsWith("com.android.") || p.startsWith("com.google.android.") || p.startsWith("com.samsung.") -> "Sistem"
            else -> "Diğer"
        }
    }

    private fun appIcon(pkg: String): ByteArray? {
        return try {
            val d = packageManager.getApplicationIcon(pkg)
            val bmp = if (d is BitmapDrawable && d.bitmap != null) d.bitmap
            else {
                val b = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
                val c = Canvas(b)
                d.setBounds(0, 0, 96, 96)
                d.draw(c)
                b
            }
            val scaled = Bitmap.createScaledBitmap(bmp, 96, 96, true)
            val stream = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.PNG, 90, stream)
            stream.toByteArray()
        } catch (e: Exception) {
            null
        }
    }

    // ---------- izin durumları ----------
    private fun isServiceEnabled(settingsKey: String, component: String): Boolean {
        val enabled = Settings.Secure.getString(contentResolver, settingsKey) ?: return false
        return enabled.contains(component) || enabled.contains(component.replace("/.", "/"))
    }

    private fun openIntent(i: Intent) {
        try { startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e: Exception) {}
    }

    private fun setFlagSecure(enabled: Boolean) {
        runOnUiThread {
            if (enabled) window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    // ---------- FAZ 10: başlatıcı kimliği ----------
    // Resmi mekanizma: Android activity-alias. Seçilen alias etkinleştirilir,
    // diğerleri + ana bileşen kapatılır (veya tersi). Kimlik manifest'te
    // TANIMLI olmalı — çalışma zamanında sahte ikon/etiket üretilmez.
    // Dikkat: bazı başlatıcılar simge önbelleği tutar; değişim launcher'ın
    // yenilenmesini veya cihaz yeniden başlatmayı gerektirebilir (OS davranışı).
    private fun setLauncherIdentity(id: String): Boolean {
        val aliasFor = mapOf(
            "default" to "$packageName.MainActivity",
            "calculator" to "$packageName.AliasCalculator",
            "notes" to "$packageName.AliasNotes",
            "clock" to "$packageName.AliasClock",
            "weather" to "$packageName.AliasWeather",
        )
        val chosen = aliasFor[id] ?: aliasFor["default"]!!
        return try {
            for ((_, component) in aliasFor) {
                val state = if (component == chosen)
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                else
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED
                packageManager.setComponentEnabledSetting(
                    android.content.ComponentName(this, component),
                    state,
                    PackageManager.DONT_KILL_APP,
                )
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    // ---------- FAZ 10: Device Admin (kaldırmaya karşı opsiyonel koruma) ----------
    private fun adminComponent(): android.content.ComponentName =
        android.content.ComponentName(this, PvDeviceAdminReceiver::class.java)

    private fun isDeviceAdminActive(): Boolean {
        val dpm = getSystemService(DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        return dpm.isAdminActive(adminComponent())
    }

    private fun requestDeviceAdmin() {
        // Açık, geri alınabilir sistem izin ekranı — kullanıcı onaylamazsa etkinleşmez.
        val i = Intent(android.app.admin.DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(android.app.admin.DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent())
            putExtra(
                android.app.admin.DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "Kaldırmaya karşı koruma: etkinken uygulamanın kaldırılması, önce bu korumanın " +
                    "kapatılmasını gerektirir. İstediğiniz zaman Ayarlar'dan geri alabilirsiniz. " +
                    "Privacy Vault bu izni başka bir yönetim işlevi için kullanmaz.",
            )
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        openIntent(i)
    }

    private fun removeDeviceAdmin() {
        val dpm = getSystemService(DEVICE_POLICY_SERVICE) as android.app.admin.DevicePolicyManager
        if (dpm.isAdminActive(adminComponent())) dpm.removeActiveAdmin(adminComponent())
    }
}
