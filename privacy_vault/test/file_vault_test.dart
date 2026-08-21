import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privacy_vault/services/file_crypto.dart';
import 'package:privacy_vault/services/file_vault_service.dart';
import 'package:privacy_vault/services/vault_service.dart';

/// FAZ 9 — Şifreli dosya kasası birim/entegrasyon testleri (saf VM, plugin yok).
/// Mevcut testler (widget_test.dart, decoy_test.dart) aynen durur.

// Deterministik sözde-rastgele üreteç: sıkıştırılamayan veri, hızlı üretim.
Uint8List _genBytes(int n, int seed) {
  final out = Uint8List(n);
  var x = seed & 0x7fffffff;
  for (var i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (x >> 8) & 0xff;
  }
  return out;
}

File _tmpFile(Directory dir, String name) => File('${dir.path}/$name');

Future<File> _write(Directory dir, String name, Uint8List bytes) =>
    _tmpFile(dir, name).writeAsBytes(bytes, flush: true);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory dir;
  setUp(() async => dir = await Directory.systemTemp.createTemp('pv9_test'));
  tearDown(() async {
    if (await dir.exists()) await dir.delete(recursive: true);
  });

  final keyA = SecretKey(List<int>.generate(32, (i) => i + 1));
  final keyB = SecretKey(List<int>.generate(32, (i) => 255 - i));

  group('VaultFileCrypto (PVF1 akış AEAD)', () {
    test('küçük dosya şifrele/çöz roundtrip', () async {
      final crypto = VaultFileCrypto();
      final plain = utf8.encode('Privacy Vault gizli içerik ✓ ');
      final enc = _tmpFile(dir, 'a.pvf');
      await crypto.encryptFile(src: await _write(dir, 'a.bin', plain), dst: enc, key: keyA);
      // başlık imzası diskte görünmeliyken açık metin görünmemeli
      final encBytes = await enc.readAsBytes();
      expect(utf8.decode(encBytes.sublist(0, 4)), 'PVF1');
      expect(encBytes.length, greaterThan(plain.length));
      final dec = _tmpFile(dir, 'a.out');
      final n = await crypto.decryptFile(src: enc, dst: dec, key: keyA);
      expect(n, plain.length);
      expect(await dec.readAsBytes(), plain);
    });

    test('büyük dosya — 12 MB, çok parçalı, akış roundtrip', () async {
      final crypto = VaultFileCrypto();
      final plain = _genBytes(12 * 1024 * 1024, 7);
      final src = await _write(dir, 'big.bin', plain);
      final enc = _tmpFile(dir, 'big.pvf');
      final encLen = await crypto.encryptFile(src: src, dst: enc, key: keyA, chunkSize: 1024 * 1024);
      expect(encLen, plain.length);
      // 12 parça × (12 nonce + 16 mac) + 12 başlık genel gideri
      expect(await enc.length(), plain.length + 12 + 12 * 28);
      final dec = _tmpFile(dir, 'big.out');
      await crypto.decryptFile(src: enc, dst: dec, key: keyA);
      expect(sha256.convert(await dec.readAsBytes()), sha256.convert(plain));
    });

    test('bozuk şifreli dosya → VaultIntegrityError (sessizce GEÇMEZ)', () async {
      final crypto = VaultFileCrypto();
      final plain = _genBytes(3 * 1024 * 1024, 11); // 3 parça
      final enc = _tmpFile(dir, 'c.pvf');
      await crypto.encryptFile(src: await _write(dir, 'c.bin', plain), dst: enc, key: keyA, chunkSize: 1024 * 1024);
      final bytes = await enc.readAsBytes();
      bytes[1024 * 1024] ^= 0xff; // ortadaki şifreli baytı boz
      await enc.writeAsBytes(bytes, flush: true);
      await expectLater(
        crypto.decryptFile(src: enc, dst: _tmpFile(dir, 'c.out'), key: keyA),
        throwsA(isA<VaultIntegrityError>()),
      );
    });

    test('kısaltılmış dosya → VaultIntegrityError (eksik veri REDDedilir)', () async {
      final crypto = VaultFileCrypto();
      final plain = _genBytes(2 * 1024 * 1024, 13);
      final enc = _tmpFile(dir, 't.pvf');
      await crypto.encryptFile(src: await _write(dir, 't.bin', plain), dst: enc, key: keyA, chunkSize: 512 * 1024);
      final bytes = await enc.readAsBytes();
      final cut = _tmpFile(dir, 't_cut.pvf');
      await cut.writeAsBytes(bytes.sublist(0, bytes.length - 500), flush: true);
      await expectLater(
        crypto.decryptFile(src: cut, dst: _tmpFile(dir, 't.out'), key: keyA),
        throwsA(isA<VaultIntegrityError>()),
      );
    });

    test('yanlış anahtar → VaultIntegrityError', () async {
      final crypto = VaultFileCrypto();
      final enc = _tmpFile(dir, 'w.pvf');
      await crypto.encryptFile(src: await _write(dir, 'w.bin', _genBytes(64 * 1024, 3)), dst: enc, key: keyA);
      await expectLater(
        crypto.decryptFile(src: enc, dst: _tmpFile(dir, 'w.out'), key: keyB),
        throwsA(isA<VaultIntegrityError>()),
      );
      await expectLater(crypto.decryptBytes(src: enc, key: keyB), throwsA(isA<VaultIntegrityError>()));
    });

    test('thumbnail blob roundtrip + bozuk blob reddi', () async {
      final crypto = VaultFileCrypto();
      final thumb = _genBytes(40 * 1024, 5);
      final blob = await crypto.encryptBlob(thumb, keyA);
      expect(await crypto.decryptBlob(blob, keyA), thumb);
      final broken = Uint8List.fromList(blob)..[blob.length - 20] ^= 0x01;
      await expectLater(crypto.decryptBlob(broken, keyA), throwsA(isA<VaultIntegrityError>()));
      await expectLater(crypto.decryptBlob(blob, keyB), throwsA(isA<VaultIntegrityError>()));
    });

    test('bellek içi çözümde boyut sınırı aşımı → VaultTooLargeToView', () async {
      final crypto = VaultFileCrypto();
      final enc = _tmpFile(dir, 'm.pvf');
      await crypto.encryptFile(src: await _write(dir, 'm.bin', _genBytes(200 * 1024, 9)), dst: enc, key: keyA);
      await expectLater(
        crypto.decryptBytes(src: enc, key: keyA, maxBytes: 100 * 1024),
        throwsA(isA<VaultTooLargeToView>()),
      );
    });
  });

  group('FileVaultService (indeks/import/export/silme)', () {
    FileVaultService svc({int? maxBytes}) => FileVaultService(
          crypto: VaultCrypto(keyStore: MemoryVaultKeyStore()),
          testDir: dir,
          maxBytes: maxBytes ?? 50 * 1024 * 1024,
        );

    test('import: içerik+metadata şifreli; gerçek ad diske YAZILMAZ', () async {
      final s = svc();
      final src = await _write(dir, 'gizli_aile_fotografi_XYZ.jpg', _genBytes(100 * 1024, 21));
      final f = await s.importFile(path: src.path);
      expect(f.name, 'gizli_aile_fotografi_XYZ.jpg');
      expect(f.kind.name, 'photo');
      // indeks + içerik plaintext ad içermemeli
      final indexRaw = await File('${dir.path}/vault/index.json').readAsString();
      expect(indexRaw.contains('gizli_aile_fotografi'), isFalse);
      expect(indexRaw.contains('.jpg'), isFalse);
      final pvf = File('${dir.path}/vault/files/${f.id}.pvf');
      expect(await pvf.exists(), isTrue);
      final raw = await pvf.readAsBytes();
      expect(utf8.decode(raw.sublist(0, 4)), 'PVF1');
      expect(utf8.decode(raw, allowMalformed: true).contains('gizli_aile_fotografi'), isFalse);
    });

    test('duplicate dosya adı → otomatik sonek (a.txt, a (2).txt)', () async {
      final s = svc();
      final src = await _write(dir, 'a.txt', utf8.encode('birinci'));
      final f1 = await s.importStream(
          name: 'a.txt', length: await src.length(), openStream: src.openRead);
      final src2 = await _write(dir, 'a2.txt', utf8.encode('ikinci'));
      final f2 = await s.importStream(
          name: 'a.txt', length: await src2.length(), openStream: src2.openRead);
      expect(f1.name, 'a.txt');
      expect(f2.name, 'a (2).txt');
      // içerikler korunur
      final b2 = await s.decryptToMemory(f2.id);
      expect(utf8.decode(b2), 'ikinci');
    });

    test('import → export roundtrip (decrypt kopya birebir)', () async {
      final s = svc();
      final plain = _genBytes(500 * 1024, 31);
      final src = await _write(dir, 'rapor.pdf', plain);
      final f = await s.importFile(path: src.path);
      final out = await s.decryptToTemp(f.id, authenticated: true, purpose: 'export');
      expect(await out.readAsBytes(), plain);
      expect(out.path.contains('rapor.pdf'), isTrue); // hedef kopya adı taşınır
      await s.purgeTemp(out);
      expect(await out.exists(), isFalse);
    });

    test('authentication requirement: doğrulamasız decrypt YOK', () async {
      final s = svc();
      final src = await _write(dir, 'k.docx', utf8.encode('gizli sözleşme'));
      final f = await s.importFile(path: src.path);
      await expectLater(
        s.decryptToTemp(f.id, authenticated: false),
        throwsA(isA<VaultAuthRequired>()),
      );
      // doğrulanmış çağrı çalışır
      final out = await s.decryptToTemp(f.id, authenticated: true);
      expect(await out.exists(), isTrue);
    });

    test('kesintiye uğrayan şifreleme → iz dosyası/indeks kaydı YOK', () async {
      final s = svc();
      Stream<List<int>> broken() => Stream.fromFuture(
            Future<List<int>>.error(const FileSystemException('okuma koptu')),
          );
      await expectLater(
        s.importStream(name: 'foto.jpg', length: 1000, openStream: broken),
        throwsA(isA<Exception>()),
      );
      await s.load();
      expect(s.state, isEmpty);
      // vault/files içinde ne .pvf ne .tmp kalmalı
      final files = Directory('${dir.path}/vault/files');
      if (await files.exists()) {
        final leftovers = await files.list().toList();
        expect(leftovers, isEmpty);
      }
      expect(await File('${dir.path}/vault/index.json').exists(), isFalse);
    });

    test('delete: içerik + thumbnail + indeks + geçici kopya hepsi temizlenir', () async {
      final s = svc();
      final src = await _write(dir, 'v.mp4', _genBytes(256 * 1024, 41));
      final f = await s.importFile(path: src.path);
      await s.saveThumb(f.id, _genBytes(10 * 1024, 43));
      expect(await File('${dir.path}/vault/thumbs/${f.id}.pvt').exists(), isTrue);
      final tmp = await s.decryptToTemp(f.id, authenticated: true, purpose: 'video');
      expect(await tmp.exists(), isTrue);

      await s.delete(f.id);
      expect(s.state, isEmpty);
      expect(await File('${dir.path}/vault/files/${f.id}.pvf').exists(), isFalse);
      expect(await File('${dir.path}/vault/thumbs/${f.id}.pvt').exists(), isFalse);
      expect(await tmp.exists(), isFalse); // ilişkili geçici kopya da silindi
    });

    test('thumbnail: kaydet/oku roundtrip, silinince null', () async {
      final s = svc();
      final src = await _write(dir, 'p.png', _genBytes(60 * 1024, 51));
      final f = await s.importFile(path: src.path);
      expect(await s.readThumb(f.id), isNull); // hiç yokken
      final png = _genBytes(8 * 1024, 53);
      await s.saveThumb(f.id, png);
      expect(await s.readThumb(f.id), png);
      await s.deleteThumb(f.id);
      expect(await s.readThumb(f.id), isNull);
    });

    test('path traversal / isim temizliği: yol ayracı ve kontrol karakterleri giderilir', () async {
      final s = svc();
      final src = await _write(dir, 'x.jpg', _genBytes(8 * 1024, 61));
      final f = await s.importFile(path: src.path, name: '../../../etc/\x01kotu.jpg');
      expect(f.name.contains('/'), isFalse);
      expect(f.name.contains('\\'), isFalse);
      expect(f.name.startsWith('.'), isFalse);
      await src.delete(); // kaynak kaldır: artık dizinde yalnız kasa çıktıları kalmalı
      // testDir altında vault/ dışına hiçbir dosya yazılmamış olmalı
      await for (final ent in dir.list(recursive: true)) {
        if (ent is File) {
          final rel = ent.path.substring(dir.path.length + 1);
          expect(rel.startsWith('vault/'), isTrue,
              reason: 'vault dışına yazma: $rel');
          // kullanıcı adı SADECE şifreli metadata'da; dosya adı id tabanlı
          if (rel.startsWith('vault/files/')) {
            expect(rel.endsWith('.pvf'), isTrue);
          }
        }
      }
    });

    test('oversized dosya reddedilir (şifreleme hiç başlamaz)', () async {
      final s = svc(maxBytes: 16);
      final src = await _write(dir, 'huge.bin', _genBytes(1024, 71));
      await expectLater(s.importFile(path: src.path), throwsA(isA<VaultTooLarge>()));
      await s.load();
      expect(s.state, isEmpty);
    });

    test('boş/bozuk kaynak → VaultMalformed', () async {
      final s = svc();
      final src = await _write(dir, 'bos.txt', Uint8List(0));
      await expectLater(s.importFile(path: src.path), throwsA(isA<VaultMalformed>()));
      await expectLater(
          s.importFile(path: '${dir.path}/yok_boyle_dosya.bin'), throwsA(isA<VaultMalformed>()));
    });

    test('bilinmeyen MIME → generic binary, dosya türünde', () async {
      final s = svc();
      final src = await _write(dir, 'yedeğim.xyzq', _genBytes(4 * 1024, 81));
      final f = await s.importFile(path: src.path);
      expect(f.mime, 'application/octet-stream');
      expect(f.kind.name, 'file');
      final back = await s.decryptToMemory(f.id);
      expect(back, _genBytes(4 * 1024, 81));
    });

    test('AES metin roundtrip (kasa anahtarı motoru aynı kalır)', () async {
      final crypto = VaultCrypto(keyStore: MemoryVaultKeyStore());
      final blob = await crypto.encryptText('şifreli not: 1234');
      expect(await crypto.decryptText(blob), 'şifreli not: 1234');
      final other = VaultCrypto(keyStore: MemoryVaultKeyStore());
      await expectLater(other.decryptText(blob), throwsA(isA<Exception>()));
    });
  });
}
