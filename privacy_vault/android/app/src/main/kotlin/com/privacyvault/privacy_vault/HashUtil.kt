package com.privacyvault.privacy_vault

import android.util.Base64
import java.security.MessageDigest
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * PBKDF2-HMAC-SHA256 doğrulama — Dart tarafındaki HashService ile BİREBİR aynı parametreler.
 * (PBKDF2 standardında 32 baytlık çıktı için her iki implementasyon da aynı sonucu üretir.)
 */
object HashUtil {
    fun verify(secret: String, saltB64: String, expectedB64: String, iterations: Int): Boolean {
        return try {
            val salt = Base64.decode(saltB64, Base64.NO_WRAP)
            val spec = PBEKeySpec(secret.toCharArray(), salt, iterations, 256)
            val skf = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
            val actual = skf.generateSecret(spec).encoded
            val expected = Base64.decode(expectedB64, Base64.NO_WRAP)
            MessageDigest.isEqual(actual, expected)
        } catch (e: Exception) {
            false
        }
    }
}
