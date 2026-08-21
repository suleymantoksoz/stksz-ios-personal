package com.privacyvault.privacy_vault

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Kilit motorunun kalıcı deposu (SharedPreferences).
 * Yalnızca PBKDF2 HASH + salt tutulur — düz metin sır asla saklanmaz.
 * Flutter tarafı `syncLockState` kanalı ile burayı besler.
 */
object LockPrefs {
    private const val FILE = "pv_lock"

    private const val LOCKED = "locked_packages"
    private const val METHODS = "methods"          // pkg -> method name
    private const val DECOYS = "decoys"            // FAZ 10: pkg -> decoy name
    private const val NOTIF_HIDE = "notif_hide_pkgs"
    private const val NOTIF_MASK = "notif_mask_pkgs" // FAZ 10: içeriği gizle modu
    private const val NOTIF_HIDE_ENABLED = "notif_hide_enabled"
    private const val TEMP_UNLOCK = "temp_unlock"  // pkg -> unlockedUntilMs
    private const val FAILED = "failed_attempts"

    private const val PIN_HASH = "pin_hash"; private const val PIN_SALT = "pin_salt"
    private const val PASS_HASH = "pass_hash"; private const val PASS_SALT = "pass_salt"
    private const val PAT_HASH = "pat_hash"; private const val PAT_SALT = "pat_salt"
    private const val REC_HASH = "rec_hash"; private const val REC_SALT = "rec_salt"
    private const val CALC_HASH = "calc_hash"; private const val CALC_SALT = "calc_salt" // FAZ 10: native hesap makinesi örtüsü

    private const val KDF_ITER = "kdf_iterations"
    private const val MAX_ATTEMPTS = "max_attempts"
    private const val GRACE_MS = "grace_ms"
    private const val EVENTS = "pending_events"

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    // ---------- sync from Flutter ----------
    fun saveSync(ctx: Context, args: Map<String, Any?>) {
        val p = prefs(ctx).edit()
        @Suppress("UNCHECKED_CAST")
        val locked = (args["lockedPackages"] as? List<*>)?.filterIsInstance<String>() ?: emptyList()
        p.putStringSet(LOCKED, locked.toSet())
        @Suppress("UNCHECKED_CAST")
        val methods = (args["methods"] as? Map<*, *>)?.mapNotNull { (k, v) ->
            if (k is String && v is String) k to v else null
        }?.toMap() ?: emptyMap()
        p.putString(METHODS, JSONObject(methods).toString())
        @Suppress("UNCHECKED_CAST")
        val decoys = (args["decoys"] as? Map<*, *>)?.mapNotNull { (k, v) ->
            if (k is String && v is String) k to v else null
        }?.toMap() ?: emptyMap()
        p.putString(DECOYS, JSONObject(decoys).toString())
        @Suppress("UNCHECKED_CAST")
        val notif = (args["notifHide"] as? List<*>)?.filterIsInstance<String>() ?: emptyList()
        p.putStringSet(NOTIF_HIDE, notif.toSet())
        @Suppress("UNCHECKED_CAST")
        val notifMask = (args["notifMask"] as? List<*>)?.filterIsInstance<String>() ?: emptyList()
        p.putStringSet(NOTIF_MASK, notifMask.toSet())
        p.putString(PIN_HASH, args["pinHash"] as? String ?: "")
        p.putString(PIN_SALT, args["pinSalt"] as? String ?: "")
        p.putString(CALC_HASH, args["calcTriggerHash"] as? String ?: "")
        p.putString(CALC_SALT, args["calcTriggerSalt"] as? String ?: "")
        p.putString(PASS_HASH, args["passHash"] as? String ?: "")
        p.putString(PASS_SALT, args["passSalt"] as? String ?: "")
        p.putString(PAT_HASH, args["patternHash"] as? String ?: "")
        p.putString(PAT_SALT, args["patternSalt"] as? String ?: "")
        p.putString(REC_HASH, args["recHash"] as? String ?: "")
        p.putString(REC_SALT, args["recSalt"] as? String ?: "")
        p.putInt(KDF_ITER, (args["kdfIterations"] as? Number)?.toInt() ?: 60000)
        p.putInt(MAX_ATTEMPTS, (args["maxAttempts"] as? Number)?.toInt() ?: 3)
        p.putLong(GRACE_MS, (args["graceMs"] as? Number)?.toLong() ?: 300000L)
        p.putBoolean(NOTIF_HIDE_ENABLED, args["notifHideEnabled"] as? Boolean ?: false)
        p.apply()
    }

    // ---------- queries ----------
    fun isLocked(ctx: Context, pkg: String): Boolean =
        prefs(ctx).getStringSet(LOCKED, emptySet())?.contains(pkg) == true

    fun methodFor(ctx: Context, pkg: String): String {
        val raw = prefs(ctx).getString(METHODS, "{}") ?: "{}"
        return try { JSONObject(raw).optString(pkg, "bioPin") } catch (e: Exception) { "bioPin" }
    }

    /** FAZ 10: hedef uygulama için seçilen decoy türü (none/calculator/notes/clock/weather). */
    fun decoyFor(ctx: Context, pkg: String): String {
        val raw = prefs(ctx).getString(DECOYS, "{}") ?: "{}"
        return try { JSONObject(raw).optString(pkg, "none") } catch (e: Exception) { "none" }
    }

    /** FAZ 10: 0=normal, 1=maskele (içeriksiz kart), 2=tamamen gizle. */
    fun notifModeFor(ctx: Context, pkg: String): Int {
        val p = prefs(ctx)
        if (!p.getBoolean(NOTIF_HIDE_ENABLED, true)) return 0
        if (p.getStringSet(NOTIF_HIDE, emptySet())?.contains(pkg) == true) return 2
        if (p.getStringSet(NOTIF_MASK, emptySet())?.contains(pkg) == true) return 1
        return 0
    }

    fun shouldHideNotification(ctx: Context, pkg: String): Boolean =
        prefs(ctx).getBoolean(NOTIF_HIDE_ENABLED, true) &&
            prefs(ctx).getStringSet(NOTIF_HIDE, emptySet())?.contains(pkg) == true

    fun isTempUnlocked(ctx: Context, pkg: String): Boolean {
        val raw = prefs(ctx).getString(TEMP_UNLOCK, "{}") ?: "{}"
        val until = try { JSONObject(raw).optLong(pkg, 0L) } catch (e: Exception) { 0L }
        return System.currentTimeMillis() < until
    }

    fun tempUnlock(ctx: Context, pkg: String) {
        val raw = prefs(ctx).getString(TEMP_UNLOCK, "{}") ?: "{}"
        val obj = try { JSONObject(raw) } catch (e: Exception) { JSONObject() }
        obj.put(pkg, System.currentTimeMillis() + prefs(ctx).getLong(GRACE_MS, 300000L))
        prefs(ctx).edit().putString(TEMP_UNLOCK, obj.toString()).apply()
    }

    // ---------- attempts ----------
    fun failedAttempts(ctx: Context): Int = prefs(ctx).getInt(FAILED, 0)
    fun maxAttempts(ctx: Context): Int = prefs(ctx).getInt(MAX_ATTEMPTS, 3)
    fun isLockedOut(ctx: Context): Boolean = failedAttempts(ctx) >= maxAttempts(ctx)

    fun incFailed(ctx: Context): Int {
        val n = failedAttempts(ctx) + 1
        prefs(ctx).edit().putInt(FAILED, n).apply()
        return n
    }

    fun resetFailed(ctx: Context) = prefs(ctx).edit().putInt(FAILED, 0).apply()

    // ---------- credentials ----------
    data class Cred(val hash: String, val salt: String, val iterations: Int)

    fun pinCred(ctx: Context): Cred? = cred(ctx, PIN_HASH, PIN_SALT)
    fun passCred(ctx: Context): Cred? = cred(ctx, PASS_HASH, PASS_SALT)
    fun patternCred(ctx: Context): Cred? = cred(ctx, PAT_HASH, PAT_SALT)
    fun recoveryCred(ctx: Context): Cred? = cred(ctx, REC_HASH, REC_SALT)
    /** FAZ 10: native hesap makinesi örtüsünün gizli tetikleyicisi (hash). */
    fun calcTriggerCred(ctx: Context): Cred? = cred(ctx, CALC_HASH, CALC_SALT)

    private fun cred(ctx: Context, hk: String, sk: String): Cred? {
        val p = prefs(ctx)
        val h = p.getString(hk, "") ?: ""
        val s = p.getString(sk, "") ?: ""
        if (h.isEmpty() || s.isEmpty()) return null
        return Cred(h, s, p.getInt(KDF_ITER, 60000))
    }

    // ---------- native event queue (Flutter açılışta drenaj yapar) ----------
    fun appendEvent(ctx: Context, type: String, detail: String) {
        val raw = prefs(ctx).getString(EVENTS, "[]") ?: "[]"
        val arr = try { JSONArray(raw) } catch (e: Exception) { JSONArray() }
        val o = JSONObject()
        o.put("at", System.currentTimeMillis())
        o.put("type", type)
        o.put("detail", detail)
        arr.put(o)
        prefs(ctx).edit().putString(EVENTS, arr.toString()).apply()
    }

    fun drainEvents(ctx: Context): List<Map<String, Any>> {
        val raw = prefs(ctx).getString(EVENTS, "[]") ?: "[]"
        prefs(ctx).edit().putString(EVENTS, "[]").apply()
        val out = mutableListOf<Map<String, Any>>()
        val arr = try { JSONArray(raw) } catch (e: Exception) { return out }
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out.add(mapOf(
                "at" to o.optLong("at"),
                "type" to o.optString("type"),
                "detail" to o.optString("detail"),
            ))
        }
        return out
    }
}
