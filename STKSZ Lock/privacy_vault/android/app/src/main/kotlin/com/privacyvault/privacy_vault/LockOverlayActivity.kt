package com.privacyvault.privacy_vault

import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Native kilit ekranı — kilitli uygulama açıldığında gösterilir.
 * Doğrulama yöntemleri: PIN, Parola, Desen, Biyometrik, Bio+PIN, Bio+Parola.
 * 3 hatalı girişte SECURITY LOCKED → yalnızca kurtarma sembolü.
 * Tüm doğrulama PBKDF2 hash karşılaştırmasıyla YERELDE yapılır.
 */
class LockOverlayActivity : FragmentActivity() {

    private lateinit var targetPkg: String
    private lateinit var method: String
    private lateinit var root: LinearLayout
    private lateinit var status: TextView
    private var bioStagePassed = false
    /** FAZ 10: decoy örtüsü (hesap makinesi) tetikleyiciyle aşıldıysa true → normal kilit akışı. */
    private var decoyConsumed = false

    companion object {
        const val EXTRA_PACKAGE = "target_package"
        val SYMBOLS = listOf("★", "✦", "◆", "●", "■", "▲", "✚", "!", "#", "*", ".", "◐")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        targetPkg = intent.getStringExtra(EXTRA_PACKAGE) ?: ""
        method = LockPrefs.methodFor(this, targetPkg)
        if (targetPkg.isEmpty() || !LockPrefs.isLocked(this, targetPkg)) {
            finish(); return
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE or WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        setShowWhenLocked(true)

        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#060A0F"))
            setPadding(48, 48, 48, 48)
        }
        setContentView(root)
        renderStage()
    }

    // ---------- UI ----------
    private fun baseHeader(): List<View> {
        val appLabel = try {
            packageManager.getApplicationLabel(packageManager.getApplicationInfo(targetPkg, 0)).toString()
        } catch (e: Exception) { targetPkg }
        val shield = TextView(this).apply {
            text = "🛡"; textSize = 44f; gravity = Gravity.CENTER
        }
        val title = TextView(this).apply {
            text = appLabel
            textSize = 20f; setTextColor(Color.parseColor("#E9F0FA"))
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        status = TextView(this).apply {
            textSize = 12f; setTextColor(Color.parseColor("#8598B5"))
            gravity = Gravity.CENTER; setPadding(0, 12, 0, 28)
        }
        return listOf(shield, title, status)
    }

    private fun renderStage() {
        root.removeAllViews()

        // FAZ 10 — Gizli kimlik örtüsü: kullanıcı bu uygulama için
        // "Hesap Makinesi" decoy'unu seçtiyse, kilit ekranından ÖNCE tam işlevsel
        // hesap makinesi gösterilir. Gizli tetikleyici (hash) '＝' anında doğrulanır;
        // yanlışsa ifade normal hesaplanır (örtü kırılmaz).
        // Not: diğer decoy kimlikleri (not/saat/hava) yalnızca uygulama İÇİNDEKİ
        // kasa kimliğinde çalışır; burada doğrudan doğrulama ekranı gelir.
        if (!decoyConsumed && !LockPrefs.isLockedOut(this) &&
            LockPrefs.decoyFor(this, targetPkg) == "calculator" &&
            LockPrefs.calcTriggerCred(this) != null) {
            renderCalculatorCover()
            return
        }

        baseHeader().forEach { root.addView(it) }

        if (LockPrefs.isLockedOut(this)) {
            status.text = "SECURITY LOCKED\nKurtarma sembolünü gir"
            status.setTextColor(Color.parseColor("#F87171"))
            renderRecovery()
            return
        }
        val left = (LockPrefs.maxAttempts(this) - LockPrefs.failedAttempts(this))
        status.text = "Devam etmek için doğrula • $left hak"

        when (method) {
            "pin" -> renderPin()
            "password" -> renderPassword()
            "pattern" -> renderPattern()
            "biometric" -> renderBiometricOnly()
            "bioPassword" -> if (bioStagePassed) renderPassword() else renderBiometricOnly()
            else -> if (bioStagePassed) renderPin() else renderBiometricOnly() // bioPin
        }
        val cancel = Button(this).apply {
            text = "Geri (Ana ekran)"
            setTextColor(Color.parseColor("#8598B5"))
            setBackgroundColor(Color.TRANSPARENT)
            setOnClickListener { goHome() }
        }
        root.addView(cancel)
    }

    private fun renderPin() {
        val display = TextView(this).apply {
            textSize = 22f; setTextColor(Color.parseColor("#E9F0FA")); gravity = Gravity.CENTER
        }
        var current = ""
        val grid = numericGrid { d ->
            when (d) {
                "⌫" -> if (current.isNotEmpty()) current = current.dropLast(1)
                else -> if (current.length < 6) current += d
            }
            display.text = "●".repeat(current.length)
            if (current.length == 6) tryVerify { LockPrefs.pinCred(this)?.let { HashUtil.verify(current, it.salt, it.hash, it.iterations) } == true }
        }
        root.addView(display)
        root.addView(grid)
    }

    private fun renderPassword() {
        val input = EditText(this).apply {
            transformationMethod = android.text.method.PasswordTransformationMethod.getInstance()
            setTextColor(Color.WHITE); setHintTextColor(Color.GRAY); hint = "Parola"
        }
        val btn = Button(this).apply {
            text = "Doğrula"
            setOnClickListener {
                tryVerify {
                    LockPrefs.passCred(this@LockOverlayActivity)
                        ?.let { HashUtil.verify(input.text.toString(), it.salt, it.hash, it.iterations) } == true
                }
            }
        }
        root.addView(input)
        root.addView(btn)
    }

    private fun renderPattern() {
        val chosen = mutableListOf<Int>()
        val display = TextView(this).apply {
            textSize = 16f; setTextColor(Color.parseColor("#E9F0FA")); gravity = Gravity.CENTER
        }
        val grid = GridLayout(this).apply { columnCount = 3; rowCount = 3 }
        val size = resources.displayMetrics.density.let { (84 * it).toInt() }
        for (i in 0 until 9) {
            val b = Button(this).apply {
                text = "○"
                setOnClickListener {
                    if (i in chosen) return@setOnClickListener
                    chosen.add(i); text = "●"
                    display.text = chosen.size.toString()
                }
            }
            val lp = GridLayout.LayoutParams().apply { width = size; height = size; setMargins(10, 10, 10, 10) }
            grid.addView(b, lp)
        }
        val row = LinearLayout(this).apply {
            val ok = Button(this@LockOverlayActivity).apply {
                text = "Onayla"
                setOnClickListener {
                    if (chosen.size < 4) { status.text = "Desen en az 4 nokta"; return@setOnClickListener }
                    tryVerify {
                        LockPrefs.patternCred(this@LockOverlayActivity)?.let {
                            HashUtil.verify(chosen.joinToString("-"), it.salt, it.hash, it.iterations)
                        } == true
                    }
                }
            }
            val reset = Button(this@LockOverlayActivity).apply {
                text = "Sıfırla"
                setOnClickListener { renderStage() }
            }
            addView(ok); addView(reset)
        }
        root.addView(display); root.addView(grid); root.addView(row)
    }

    private fun renderBiometricOnly() {
        val btn = Button(this).apply {
            text = "Biyometrik ile doğrula"
            setOnClickListener { promptBiometric() }
        }
        root.addView(btn)
        promptBiometric()
    }

    private fun renderRecovery() {
        val chosen = mutableListOf<String>()
        val display = TextView(this).apply {
            textSize = 18f; setTextColor(Color.parseColor("#E9F0FA")); gravity = Gravity.CENTER
        }
        val wrap = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
        }
        var row: LinearLayout? = null
        SYMBOLS.forEachIndexed { i, s ->
            if (i % 4 == 0) {
                row = LinearLayout(this).apply { gravity = Gravity.CENTER }
                wrap.addView(row)
            }
            val b = Button(this).apply {
                text = s; textSize = 20f
                setOnClickListener {
                    chosen.add(s)
                    display.text = chosen.joinToString(" ")
                    if (chosen.size >= 3) {
                        val cred = LockPrefs.recoveryCred(this@LockOverlayActivity)
                        val ok = cred != null && HashUtil.verify(chosen.joinToString(""), cred.salt, cred.hash, cred.iterations)
                        if (ok) {
                            LockPrefs.resetFailed(this@LockOverlayActivity)
                            LockPrefs.appendEvent(this@LockOverlayActivity, "recoveryUsed", targetPkg)
                            success()
                        } else if (chosen.size >= 8) {
                            chosen.clear(); display.text = ""
                            LockPrefs.appendEvent(this@LockOverlayActivity, "recoveryFail", targetPkg)
                            status.text = "SECURITY LOCKED\nKurtarma sembolünü gir"
                        }
                    }
                }
            }
            row?.addView(b, LinearLayout.LayoutParams(150, 150).apply { setMargins(8, 8, 8, 8) })
        }
        root.addView(display); root.addView(wrap)
    }

    private fun numericGrid(onKey: (String) -> Unit): View {
        val grid = GridLayout(this).apply { columnCount = 3 }
        val keys = listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫")
        val size = resources.displayMetrics.density.let { (72 * it).toInt() }
        for (k in keys) {
            if (k.isEmpty()) {
                grid.addView(View(this), GridLayout.LayoutParams().apply { width = size; height = size })
                continue
            }
            val b = Button(this).apply {
                text = k; textSize = 22f
                setTextColor(Color.WHITE)
                setBackgroundColor(Color.parseColor("#111B30"))
                setOnClickListener { onKey(k) }
            }
            grid.addView(b, GridLayout.LayoutParams().apply { width = size; height = size; setMargins(10, 10, 10, 10) })
        }
        return grid
    }

    // ---------- FAZ 10: tam işlevsel Hesap Makinesi örtüsü ----------
    // Görünen/girilen ifade gerçek hesaplanır; '=' anında önce gizli tetikleyici
    // (PBKDF2 hash — Flutter tarafıyla birebir aynı normalize: ASCII op, boşluksuz)
    // doğrulanır. Doğruysa kilit akışı açılır; yanlışsa hesap makinesi gibi davranır.

    private fun renderCalculatorCover() {
        root.gravity = Gravity.TOP
        var expr = ""
        val history = TextView(this).apply {
            text = ""; textSize = 14f
            setTextColor(Color.parseColor("#5C6B84")); gravity = Gravity.END
            setPadding(16, 72, 24, 0)
        }
        val display = TextView(this).apply {
            text = "0"; textSize = 38f
            setTextColor(Color.parseColor("#E9F0FA")); gravity = Gravity.END
            setPadding(16, 12, 24, 32)
        }
        fun pretty(s: String) = s.replace('*', '×').replace('/', '÷').replace('-', '−')

        fun fmtNum(d: Double): String =
            if (d % 1.0 == 0.0) d.toLong().toString()
            else BigDecimal(d).setScale(8, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()

        fun evalExpr(s: String): Double? {
            val tokens = mutableListOf<String>()
            var i = 0
            while (i < s.length) {
                val c = s[i]
                if (c.isDigit() || c == '.') {
                    var j = i
                    while (j < s.length && (s[j].isDigit() || s[j] == '.')) j++
                    tokens.add(s.substring(i, j)); i = j
                } else if (c in "+-*/") {
                    val unary = c == '-' && (tokens.isEmpty() || tokens.last() in listOf("+", "-", "*", "/"))
                    if (unary) {
                        var j = i + 1
                        while (j < s.length && (s[j].isDigit() || s[j] == '.')) j++
                        if (j == i + 1) return null
                        tokens.add(s.substring(i, j)); i = j
                    } else { tokens.add(c.toString()); i++ }
                } else return null
            }
            if (tokens.isEmpty()) return null
            // önce * ve /
            val t1 = mutableListOf<String>()
            var k = 0
            while (k < tokens.size) {
                val tok = tokens[k]
                if (tok == "*" || tok == "/") {
                    val left = t1.removeLastOrNull()?.toDoubleOrNull() ?: return null
                    val right = tokens.getOrNull(k + 1)?.toDoubleOrNull() ?: return null
                    val r = if (tok == "*") left * right else {
                        if (right == 0.0) return null; left / right
                    }
                    t1.add(fmtNum(r)); k += 2
                } else { t1.add(tok); k++ }
            }
            var acc = t1.firstOrNull()?.toDoubleOrNull() ?: return null
            var m = 1
            while (m < t1.size - 1) {
                val v = t1[m + 1].toDoubleOrNull() ?: return null
                acc = if (t1[m] == "+") acc + v else acc - v
                m += 2
            }
            return acc
        }

        fun percent() {
            val m = Regex("""(\d+\.?\d*)$""").find(expr) ?: return
            val v = m.value.toDoubleOrNull() ?: return
            expr = expr.dropLast(m.value.length) + fmtNum(v / 100)
            display.text = pretty(expr.ifEmpty { "0" })
        }

        fun equals() {
            // 1) Gizli tetikleyici denemesi?
            val cred = LockPrefs.calcTriggerCred(this)
            if (cred != null && expr.isNotEmpty() &&
                HashUtil.verify(expr, cred.salt, cred.hash, cred.iterations)) {
                LockPrefs.appendEvent(this, "triggerOk", targetPkg)
                decoyConsumed = true
                expr = ""
                root.gravity = Gravity.CENTER
                renderStage()
                return
            }
            // 2) Normal hesap makinesi davranışı
            val r = evalExpr(expr)
            if (r != null) {
                history.text = "${pretty(expr)} ="
                expr = fmtNum(r)
                display.text = pretty(expr)
            } else {
                display.text = "Hata"
                expr = ""
            }
        }

        root.addView(history, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        root.addView(display, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        val grid = GridLayout(this).apply { columnCount = 4 }
        val label = mapOf("*" to "×", "/" to "÷", "-" to "−")
        val rows = listOf(
            listOf("C", "⌫", "%", "/"),
            listOf("7", "8", "9", "*"),
            listOf("4", "5", "6", "-"),
            listOf("1", "2", "3", "+"),
            listOf(".", "0", "=", ""),
        )
        for (row in rows) {
            for (key in row) {
                val cellParams = GridLayout.LayoutParams().apply { setMargins(8, 8, 8, 8) }
                if (key.isEmpty()) {
                    val spacer = View(this)
                    cellParams.width = 0; cellParams.height = 0
                    cellParams.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
                    grid.addView(spacer, cellParams)
                    continue
                }
                val b = Button(this).apply {
                    text = label[key] ?: key
                    textSize = if ("+-*/=C⌫%".contains(key)) 22f else 20f
                    setTextColor(
                        when (key) {
                            "C", "⌫", "%" -> Color.parseColor("#8598B5")
                            "=", "+", "-", "*", "/" -> Color.parseColor("#22D3EE")
                            else -> Color.WHITE
                        }
                    )
                    setBackgroundColor(Color.parseColor(if (key == "=") "#111B30" else "#0C1322"))
                    setOnClickListener {
                        when (key) {
                            "C" -> { expr = ""; display.text = "0"; history.text = "" }
                            "⌫" -> { expr = expr.dropLast(1); display.text = pretty(expr.ifEmpty { "0" }) }
                            "%" -> percent()
                            "=" -> equals()
                            else -> {
                                if (expr.length < 24) expr += key
                                display.text = pretty(expr)
                            }
                        }
                    }
                }
                cellParams.columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
                cellParams.width = 0
                cellParams.height = (resources.displayMetrics.density * 64).toInt()
                grid.addView(b, cellParams)
            }
        }
        root.addView(grid, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
    }

    // ---------- doğrulama akışı ----------
    private fun tryVerify(check: () -> Boolean) {
        if (check()) {
            LockPrefs.resetFailed(this)
            success()
            return
        }
        val n = LockPrefs.incFailed(this)
        LockPrefs.appendEvent(this, "appUnlockFail", targetPkg)
        if (n >= LockPrefs.maxAttempts(this)) {
            LockPrefs.appendEvent(this, "lockout3", targetPkg)
            renderStage()
        } else {
            status.text = "Doğrulama başarısız • ${LockPrefs.maxAttempts(this) - n} hak"
            val color = Color.parseColor("#F87171")
            status.setTextColor(color)
            val msg = status.text
            renderStage()
            status.text = msg
            status.setTextColor(color)
        }
    }

    private fun promptBiometric() {
        val mgr = BiometricManager.from(this)
        if (mgr.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) !=
            BiometricManager.BIOMETRIC_SUCCESS) {
            // biyometrik yoksa PIN/parola aşamasına düş
            bioStagePassed = true
            if (method == "biometric") { status.text = "Biyometrik kullanılamıyor"; return }
            renderStage(); return
        }
        val executor = ContextCompat.getMainExecutor(this)
        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                if (method == "biometric") {
                    LockPrefs.resetFailed(this@LockOverlayActivity)
                    success()
                } else {
                    bioStagePassed = true
                    renderStage()
                }
            }
            override fun onAuthenticationError(code: Int, err: CharSequence) {
                if (code == BiometricPrompt.ERROR_NEGATIVE_BUTTON || code == BiometricPrompt.ERROR_USER_CANCELED) {
                    goHome()
                }
            }
        }
        val prompt = BiometricPrompt(this, executor, callback)
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Doğrulama gerekli")
            .setSubtitle("Kilitli uygulama")
            .setNegativeButtonText("Vazgeç")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .build()
        prompt.authenticate(info)
    }

    private fun success() {
        LockPrefs.appendEvent(this, "appUnlock", targetPkg)
        LockPrefs.tempUnlock(this, targetPkg)
        LockAccessibilityService.hideCoverNow()
        finish()
        overridePendingTransition(0, 0)
    }

    private fun goHome() {
        val i = android.content.Intent(android.content.Intent.ACTION_MAIN).apply {
            addCategory(android.content.Intent.CATEGORY_HOME)
            addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        startActivity(i)
        finish()
    }
}
