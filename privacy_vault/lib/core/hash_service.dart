import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import 'constants.dart';

/// PBKDF2-HMAC-SHA256 — Android taraftaki `HashUtil.kt` ile BİREBİR aynı parametreler.
/// Flutter tarafındaki hash, native kilit ekranına gönderilir ve Kotlin tarafı
/// aynı algoritmayla doğrulama yapar. Düz metin asla saklanmaz.
class HashService {
  HashService._();

  static Uint8List randomSalt([int length = 16]) {
    final r = Random.secure();
    return Uint8List.fromList(List.generate(length, (_) => r.nextInt(256)));
  }

  /// PBKDF2-HMAC-SHA256 (dkLen = 32 byte).
  static Uint8List pbkdf2(String secret, Uint8List salt,
      {int iterations = K.kdfIterations, int dkLen = 32}) {
    final password = utf8.encode(secret);
    final hmac = Hmac(sha256, password);
    final blocks = (dkLen + 31) ~/ 32;
    final out = BytesBuilder();
    for (var block = 1; block <= blocks; block++) {
      final saltBlock = Uint8List(salt.length + 4);
      saltBlock.setRange(0, salt.length, salt);
      saltBlock[salt.length] = (block >> 24) & 0xff;
      saltBlock[salt.length + 1] = (block >> 16) & 0xff;
      saltBlock[salt.length + 2] = (block >> 8) & 0xff;
      saltBlock[salt.length + 3] = block & 0xff;
      var u = hmac.convert(saltBlock).bytes;
      final t = Uint8List.fromList(u);
      for (var i = 1; i < iterations; i++) {
        u = hmac.convert(u).bytes;
        for (var j = 0; j < t.length; j++) {
          t[j] ^= u[j];
        }
      }
      out.add(t);
    }
    final bytes = out.toBytes();
    return Uint8List.fromList(bytes.sublist(0, dkLen));
  }

  static String hashB64(String secret, Uint8List salt, {int iterations = K.kdfIterations}) =>
      base64Encode(pbkdf2(secret, salt, iterations: iterations));

  /// Zaman-sabit karşılaştırma — timing saldırılarına karşı.
  static bool constantTimeEquals(String aB64, String bB64) {
    final a = base64Decode(aB64);
    final b = base64Decode(bB64);
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a[i] ^ b[i];
    }
    return diff == 0;
  }

  static bool verify(String secret, String saltB64, String expectedHashB64,
      {int iterations = K.kdfIterations}) {
    final actual = hashB64(secret, base64Decode(saltB64), iterations: iterations);
    return constantTimeEquals(actual, expectedHashB64);
  }
}
