import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';

import '../core/constants.dart';
import '../models/models.dart';

/// Anahtar deposu soyutlaması (FAZ 9): üretimde flutter_secure_storage
/// (Android Keystore / iOS Keychain), testlerde bellek içi sağlayıcı
/// kullanılır. Anahtar her koşulda yalnızca bu soyutlama üzerinden okunur.
abstract class VaultKeyStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
}

class SecureVaultKeyStore implements VaultKeyStore {
  const SecureVaultKeyStore();
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );
  @override
  Future<String?> read(String key) => _storage.read(key: key);
  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);
}

/// Yalnızca testler için bellek içi anahtar deposu.
class MemoryVaultKeyStore implements VaultKeyStore {
  final _map = <String, String>{};
  @override
  Future<String?> read(String key) async => _map[key];
  @override
  Future<void> write(String key, String value) async => _map[key] = value;
}

/// Gizli Kasa şifreleme motoru — AES-256-GCM (authenticated encryption).
/// Anahtar rastgele üretilir ve yalnızca flutter_secure_storage içinde saklanır
/// (Android Keystore / iOS Keychain korumalı). Diskte açık metin ASLA yok.
/// FAZ 9: dosya kasası da aynı tek anahtarı kullanır (ikinci bir şifreleme
/// sistemi YOK); dosya içeriği için bkz. file_crypto.dart (akış/parça tabanlı).
class VaultCrypto {
  VaultCrypto({VaultKeyStore? keyStore}) : _keyStore = keyStore ?? const SecureVaultKeyStore();
  final VaultKeyStore _keyStore;
  final _aes = AesGcm.with256bits();
  SecretKey? _key;

  Future<SecretKey> _ensureKey() async {
    if (_key != null) return _key!;
    final existing = await _keyStore.read(K.vaultAesKey);
    if (existing != null) {
      _key = SecretKey(base64Decode(existing));
    } else {
      final fresh = await _aes.newSecretKey();
      await _keyStore.write(K.vaultAesKey, base64Encode(await fresh.extractBytes()));
      _key = fresh;
    }
    return _key!;
  }

  /// FAZ 9: dosya kasası motorunun (file_crypto.dart) kullandığı TEK kasa anahtarı.
  Future<SecretKey> vaultKey() => _ensureKey();

  Future<String> encryptText(String plain) async {
    final key = await _ensureKey();
    final nonce = List<int>.generate(12, (_) => Random.secure().nextInt(256));
    final box = await _aes.encrypt(utf8.encode(plain), secretKey: key, nonce: nonce);
    return base64Encode([...nonce, ...box.cipherText, ...box.mac.bytes]);
  }

  Future<String> decryptText(String blob) async {
    final key = await _ensureKey();
    final all = base64Decode(blob);
    final nonce = all.sublist(0, 12);
    final mac = Mac(all.sublist(all.length - 16));
    final cipher = all.sublist(12, all.length - 16);
    final clear = await _aes.decrypt(SecretBox(cipher, nonce: nonce, mac: mac), secretKey: key);
    return utf8.decode(clear);
  }
}

class DecryptedNote {
  final VaultEntry entry;
  final String title;
  final String body;
  DecryptedNote(this.entry, this.title, this.body);
}

/// Şifreli not deposu: dosyada yalnızca {id, createdAt, blob} bulunur.
class VaultService extends StateNotifier<List<DecryptedNote>> {
  VaultService(this._crypto) : super(const []);
  final VaultCrypto _crypto;
  File? _file;

  Future<File> _store() async {
    if (_file != null) return _file!;
    final dir = await getApplicationDocumentsDirectory();
    _file = File('${dir.path}/vault_items.json');
    return _file!;
  }

  Future<List<VaultEntry>> _readRaw() async {
    final f = await _store();
    if (!await f.exists()) return [];
    try {
      final raw = jsonDecode(await f.readAsString()) as List;
      return raw.map((e) => VaultEntry.fromMap(Map<String, dynamic>.from(e))).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> load() async {
    final entries = await _readRaw();
    final out = <DecryptedNote>[];
    for (final e in entries.reversed) {
      try {
        final plain = await _crypto.decryptText(e.blob);
        final decoded = jsonDecode(plain) as Map<String, dynamic>;
        out.add(DecryptedNote(e, decoded['t'] as String? ?? '', decoded['b'] as String? ?? ''));
      } catch (_) {/* bozuk kayıt atlanır */}
    }
    state = out;
  }

  Future<void> add(String title, String body) async {
    final entries = await _readRaw();
    final plain = jsonEncode({'t': title, 'b': body});
    final blob = await _crypto.encryptText(plain);
    entries.add(VaultEntry(
      id: DateTime.now().microsecondsSinceEpoch.toRadixString(16) + Random.secure().nextInt(0xffff).toRadixString(16),
      createdAt: DateTime.now(),
      blob: blob,
    ));
    await _writeRaw(entries);
    await load();
  }

  Future<void> update(String id, String title, String body) async {
    final entries = await _readRaw();
    final i = entries.indexWhere((e) => e.id == id);
    if (i < 0) return;
    final blob = await _crypto.encryptText(jsonEncode({'t': title, 'b': body}));
    entries[i] = VaultEntry(id: id, createdAt: entries[i].createdAt, blob: blob);
    await _writeRaw(entries);
    await load();
  }

  Future<void> delete(String id) async {
    final entries = await _readRaw()..removeWhere((e) => e.id == id);
    await _writeRaw(entries);
    await load();
  }

  Future<void> _writeRaw(List<VaultEntry> entries) async {
    final f = await _store();
    await f.writeAsString(jsonEncode(entries.map((e) => e.toMap()).toList()));
  }
}

final vaultCryptoProvider = Provider<VaultCrypto>((ref) => VaultCrypto());
final vaultProvider = StateNotifierProvider<VaultService, List<DecryptedNote>>(
  (ref) => VaultService(ref.watch(vaultCryptoProvider)),
);
