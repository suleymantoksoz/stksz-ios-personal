import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:privacy_vault/core/hash_service.dart';

void main() {
  // RFC 7914 / PBKDF2-HMAC-SHA256 bilinen test vektörü (1 tur, dkLen=32)
  test('PBKDF2-HMAC-SHA256 bilinen vektörle eşleşir', () {
    final out = HashService.pbkdf2('password', utf8.encode('salt'), iterations: 1);
    const expected = '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b';
    final hex = out.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    expect(hex, expected);
  });

  test('verify: doğru sır geçer, yanlış sır geçmez', () {
    final salt = HashService.randomSalt();
    final hash = HashService.hashB64('2580+1', salt);
    expect(HashService.verify('2580+1', base64Encode(salt), hash), isTrue);
    expect(HashService.verify('2580+2', base64Encode(salt), hash), isFalse);
  });

  test('constantTimeEquals farklı uzunluklarda güvenle false döner', () {
    expect(HashService.constantTimeEquals(base64Encode([1, 2, 3]), base64Encode([1, 2])), isFalse);
  });
}
