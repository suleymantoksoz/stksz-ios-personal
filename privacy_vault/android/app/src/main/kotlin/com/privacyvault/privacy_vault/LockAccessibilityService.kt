package com.privacyvault.privacy_vault

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * ANA KORUMA MOTORU.
 * Erişilebilirlik olaylarıyla ön plan uygulamasını algılar; kilitli uygulama
 * açılırsa (1) karanlık kilit örtüsünü basar, (2) LockOverlayActivity'i açar.
 * Görünür pencere muafiyeti sayesinde activity arka plandan başlatılabilir.
 */
class LockAccessibilityService : AccessibilityService() {

    private var coverView: View? = null
    private var lastHandledAt = 0L
    private var lastHandledPkg = ""

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onDestroy() {
        instance = null
        hideCover()
        super.onDestroy()
    }

    override fun onInterrupt() {}

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString() ?: return
        if (pkg == packageName) return
        if (IGNORED.any { pkg.startsWith(it) }) {
            hideCover()
            return
        }
        if (!LockPrefs.isLocked(this, pkg)) {
            hideCover()
            return
        }
        if (LockPrefs.isTempUnlocked(this, pkg)) {
            hideCover()
            return
        }
        // debounce
        val now = System.currentTimeMillis()
        if (pkg == lastHandledPkg && now - lastHandledAt < 400) return
        lastHandledPkg = pkg
        lastHandledAt = now

        showCover(pkg)
        launchLockScreen(pkg)
    }

    private fun launchLockScreen(pkg: String) {
        try {
            val i = Intent(this, LockOverlayActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                putExtra(LockOverlayActivity.EXTRA_PACKAGE, pkg)
            }
            startActivity(i)
        } catch (e: Exception) {
            // activity başlatılamazsa örtü korur
        }
    }

    // ---------- kilit örtüsü (overlay) ----------
    private fun showCover(pkg: String) {
        if (!Settings.canDrawOverlays(this)) return
        if (coverView != null) return
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#F2060A0F")) }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        val appLabel = try {
            packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
        } catch (e: Exception) { pkg }
        val title = TextView(this).apply {
            text = appLabel
            textSize = 22f
            setTextColor(Color.parseColor("#E9F0FA"))
            gravity = Gravity.CENTER
        }
        val sub = TextView(this).apply {
            text = "🔒"
            textSize = 40f
            gravity = Gravity.CENTER
            setPadding(0, 24, 0, 24)
        }
        val btn = Button(this).apply {
            text = "Kilidi Aç"
            setOnClickListener { launchLockScreen(pkg) }
        }
        col.addView(title)
        col.addView(sub)
        col.addView(btn)
        root.addView(col, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER))

        val type = if (Build.VERSION.SDK_INT >= 26)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            // FAZ 11 hardening: örtü ekran görüntüsü/kayıtlarda da çıkmasın.
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_SECURE,
            PixelFormat.OPAQUE,
        )
        try {
            wm.addView(root, lp)
            coverView = root
        } catch (e: Exception) { /* overlay izni yok */ }
    }

    fun hideCover() {
        val v = coverView ?: return
        try {
            val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            wm.removeView(v)
        } catch (e: Exception) {}
        coverView = null
    }

    companion object {
        var instance: LockAccessibilityService? = null
            private set

        private val IGNORED = listOf(
            "com.android.systemui",
            "com.android.launcher",
            "com.google.android.apps.nexuslauncher",
            "com.miui.home",
            "com.sec.android.app.launcher",
        )

        fun hideCoverNow() = instance?.hideCover()
    }
}
