import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

/// FAZ 9 — Şifreli dosya kasası için akış (parça tabanlı) AEAD motoru.
///
/// AMAÇ: 100 MB / 500 MB / 1 GB+ dosyaları RAM'e almadan şifrelemek.
/// Dosya sabit boyutlu parçalara bölünür; her parça aynı kasa anahtarı
/// (VaultCrypto'daki TEK AES-256-GCM anahtarı — ikinci bir anahtar sistemi yok)
/// ile bağımsız AES-256-GCM altında mühürlenir.
///
/// PVF1 dosya formatı:
///   header : "PVF1" (4B) | u32 BE sürüm(=1) | u32 BE parçaBoyu
///   chunk i: nonce(12B = 8B rastgele önek + u32 BE sayaç) | şifreliParça | MAC(16B)
///
/// Bütünlük/sıralama koruması:
///   - Her parçanın AAD'i = magic | u64 BE parça indeksi | u8 bittiBayrağı
///     → parçaların YERİNİN değiştirilmesi veya sondan KISALTILMA MAC hatası verir.
///   - Nonce son 4 baytı parça indeksidir; çözümde doğrulanır.
///   - Son parça her zaman işaretlenir; işaret yoksa dosya EKSİK kabul edilir.
///
/// NONCE güvenliği: her dosya için rastgele 8B önek + sayaç → aynı anahtarla
/// asla (nonce, anahtar) tekrarı olmaz.

/// Şifreli bütünlük doğrulaması başarısız: bozuk, yabancı anahtarlı,
/// kısaltılmış veya kurcalanmış veri.
class VaultIntegrityError implements Exception {
  final String reason;
  const VaultIntegrityError(this.reason);
  @override
  String toString() => 'VaultIntegrityError: $reason';
}

/// Yarıda kesme (test ve kullanıcı iptali): import akışını güvenli durdurur.
class VaultCryptoAborted implements Exception {
  const VaultCryptoAborted();
  @override
  String toString() => 'VaultCryptoAborted';
}

/// Bir dosyanın bellek içi görüntüleme sınırını aştığı durum (bozukluk DEĞİL).
class VaultTooLargeToView implements Exception {
  final int maxBytes;
  const VaultTooLargeToView(this.maxBytes);
  @override
  String toString() => 'VaultTooLargeToView($maxBytes)';
}

class VaultFileCrypto {
  VaultFileCrypto({AesGcm? aes}) : _aes = aes ?? AesGcm.with256bits();

  final AesGcm _aes;

  static const _magic = 'PVF1';
  static const _version = 1;
  static const _headerLen = 12; // 4 magic + 4 version + 4 chunkSize
  static const _nonceLen = 12;
  static const _macLen = 16;
  static const _maxChunk = 64 * 1024 * 1024; // kabul edilebilir parça üst sınırı
  static const _minChunk = 1024;

  List<int> _aad(int index, bool last) {
    final counter = ByteData(8)..setUint64(0, index, Endian.big);
    return <int>[..._magic.codeUnits, ...counter.buffer.asUint8List(), last ? 1 : 0];
  }

  Uint8List _nonce(Uint8List prefix, int index) {
    final n = Uint8List(_nonceLen);
    n.setRange(0, 8, prefix);
    (ByteData.view(n.buffer)..setUint32(8, index, Endian.big));
    return n;
  }

  // ---------------------------------------------------------------------
  // ŞİFRELEME
  // ---------------------------------------------------------------------

  /// Açık kaynak akışını [out] havuzuna PVF1 olarak şifreler.
  /// RAM üst sınırı ≈ 2 × [chunkSize]. Dönen değer: açık metin bayt sayısı.
  Future<int> encryptStream({
    required Stream<List<int>> plain,
    required IOSink out,
    required SecretKey key,
    int chunkSize = 4 * 1024 * 1024,
    void Function(int plainBytesDone)? onProgress,
    bool Function()? abort,
  }) async {
    if (chunkSize < _minChunk || chunkSize > _maxChunk) {
      throw ArgumentError.value(chunkSize, 'chunkSize', 'geçersiz parça boyu');
    }
    final prefix = Uint8List.fromList(List.generate(8, (_) => Random.secure().nextInt(256)));

    // header
    final head = ByteData(_headerLen)
      ..setUint8(0, _magic.codeUnitAt(0))
      ..setUint8(1, _magic.codeUnitAt(1))
      ..setUint8(2, _magic.codeUnitAt(2))
      ..setUint8(3, _magic.codeUnitAt(3))
      ..setUint32(4, _version, Endian.big)
      ..setUint32(8, chunkSize, Endian.big);
    out.add(head.buffer.asUint8List());

    var index = 0;
    var total = 0;
    final buf = BytesBuilder(copy: true);

    Future<void> flushChunk(Uint8List chunk, bool last) async {
      final box = await _aes.encrypt(chunk, secretKey: key, nonce: _nonce(prefix, index), aad: _aad(index, last));
      out.add(_nonce(prefix, index));
      out.add(box.cipherText);
      out.add(box.mac.bytes);
      index += 1;
    }

    Uint8List take(BytesBuilder b, int n) {
      final all = b.takeBytes(); // tamponu boşalt (kopya sınırı: ~parça boyu)
      b.add(all.sublist(n));
      return Uint8List.fromList(all.sublist(0, n));
    }

    await for (final piece in plain) {
      if (abort?.call() == true) throw const VaultCryptoAborted();
      total += piece.length;
      buf.add(piece);
      // "Son parça" bayrağı yalnız akış bitiminde yazılır; bu yüzden tampon
      // sadece parça boyunu AŞINCA tam parça düşürülür (tam katında bekleme).
      while (buf.length > chunkSize) {
        await flushChunk(take(buf, chunkSize), false);
        onProgress?.call(total - buf.length);
      }
    }
    // Son parça: kalan baytlar (0..chunkSize). Boş dosyada boş parça —
    // bitti bayrağı her koşulda yazılır.
    await flushChunk(buf.takeBytes(), true);
    onProgress?.call(total);
    await out.flush();
    return total;
  }

  /// Dosya → dosya şifreleme (import hattı bunu kullanır).
  Future<int> encryptFile({
    required File src,
    required File dst,
    required SecretKey key,
    int chunkSize = 4 * 1024 * 1024,
    void Function(int plainBytesDone)? onProgress,
    bool Function()? abort,
  }) async {
    final sink = dst.openWrite();
    try {
      final n = await encryptStream(
        plain: src.openRead(),
        out: sink,
        key: key,
        chunkSize: chunkSize,
        onProgress: onProgress,
        abort: abort,
      );
      await sink.flush();
      await sink.close();
      return n;
    } catch (_) {
      await sink.flush().then((_) => sink.close(), onError: (_) => sink.close());
      rethrow;
    }
  }

  // ---------------------------------------------------------------------
  // ÇÖZME
  // ---------------------------------------------------------------------

  Future<RandomAccessFile> _openChecked(File src) async {
    final raf = await src.open();
    try {
      final len = await raf.length();
      if (len < _headerLen + _nonceLen + _macLen) {
        throw const VaultIntegrityError('dosya PVF1 başlığından küçük');
      }
      final head = ByteData.view((await raf.read(_headerLen)).buffer);
      if (head.getUint8(0) != _magic.codeUnitAt(0) ||
          head.getUint8(1) != _magic.codeUnitAt(1) ||
          head.getUint8(2) != _magic.codeUnitAt(2) ||
          head.getUint8(3) != _magic.codeUnitAt(3)) {
        throw const VaultIntegrityError('PVF1 imzası yok');
      }
      if (head.getUint32(4, Endian.big) != _version) {
        throw const VaultIntegrityError('desteklenmeyen PVF1 sürümü');
      }
      final chunk = head.getUint32(8, Endian.big);
      if (chunk < _minChunk || chunk > _maxChunk) {
        throw const VaultIntegrityError('geçersiz parça boyu');
      }
      return raf;
    } catch (_) {
      await raf.close();
      rethrow;
    }
  }

  /// Parçaları sırayla okur; her parçanın MAC + AAD + nonce-sayaç doğrulamasını yapar
  /// ve çözülmüş parçayı [onChunk] ile dışarı verir (tek parça RAM'de tutulur).
  Future<int> _decryptWalk(
    File src,
    SecretKey key,
    FutureOr<void> Function(Uint8List plainChunk) onChunk, {
    void Function(int plainBytesDone)? onProgress,
    bool Function()? abort,
  }) async {
    final raf = await _openChecked(src);
    try {
      final len = await raf.length();
      // parça boyunu tekrar oku
      await raf.setPosition(8);
      final chunkSize = ByteData.view((await raf.read(4)).buffer).getUint32(0, Endian.big);

      var index = 0;
      var totalPlain = 0;
      var sawLast = false;

      while (true) {
        final pos = await raf.position();
        final remaining = len - pos;
        if (remaining == 0) break;
        if (abort?.call() == true) throw const VaultCryptoAborted();
        if (remaining < _nonceLen + _macLen) {
          throw const VaultIntegrityError('parça üst bilgisi eksik (kısaltılmış)');
        }
        final nonce = await raf.read(_nonceLen);
        // nonce sayacı parça indeksiyle birebir olmalı
        final counter = ByteData.view(nonce.buffer).getUint32(8, Endian.big);
        if (counter != index) {
          throw const VaultIntegrityError('parça sırası bozuk');
        }
        final afterNonce = remaining - _nonceLen;
        // Kalan veri tek bir tam parçadan büyükse bu "son değil" parçasıdır.
        final isLast = afterNonce <= chunkSize + _macLen;
        final cipherLen = isLast ? afterNonce - _macLen : chunkSize;
        if (cipherLen < 0) throw const VaultIntegrityError('parça uzunluğu geçersiz');
        final cipherAndMac = await raf.read(cipherLen + _macLen);
        if (cipherAndMac.length != cipherLen + _macLen) {
          throw const VaultIntegrityError('parça verisi eksik (kısaltılmış)');
        }
        final plain = await _aes.decrypt(
          SecretBox(
            Uint8List.fromList(cipherAndMac.sublist(0, cipherLen)),
            nonce: nonce,
            mac: Mac(cipherAndMac.sublist(cipherLen)),
          ),
          secretKey: key,
          aad: _aad(index, isLast),
        );
        await onChunk(Uint8List.fromList(plain));
        totalPlain += plain.length;
        onProgress?.call(totalPlain);
        index += 1;
        if (isLast) {
          sawLast = true;
          break;
        }
      }
      if (!sawLast) throw const VaultIntegrityError('son parça işareti yok (dosya eksik)');
      return totalPlain;
    } on SecretBoxAuthenticationError {
      throw const VaultIntegrityError('bütünlük doğrulaması başarısız (MAC)');
    } finally {
      await raf.close();
    }
  }

  /// PVF1 dosyasını hedef plaintext dosyaya akışla çözer (video/dışa aktarım).
  Future<int> decryptFile({
    required File src,
    required File dst,
    required SecretKey key,
    void Function(int plainBytesDone)? onProgress,
    bool Function()? abort,
  }) async {
    final sink = dst.openWrite();
    try {
      final n = await _decryptWalk(src, key, sink.add, onProgress: onProgress, abort: abort);
      await sink.flush();
      await sink.close();
      return n;
    } catch (_) {
      await sink.flush().then((_) => sink.close(), onError: (_) => sink.close());
      rethrow;
    }
  }

  /// PVF1 dosyasını belleğe çözer (yalnızca fotoğraf/thumbnail gibi küçük içerikler).
  Future<Uint8List> decryptBytes({
    required File src,
    required SecretKey key,
    int maxBytes = 80 * 1024 * 1024,
  }) async {
    final b = BytesBuilder(copy: false);
    var size = 0;
    await _decryptWalk(src, key, (chunk) {
      size += chunk.length;
      if (size > maxBytes) throw VaultTooLargeToView(maxBytes);
      b.add(chunk);
    });
    return b.takeBytes();
  }

  // ---------------------------------------------------------------------
  // KÜÇÜK BLOB (Thumbnail) — tek parçalık PVF1, dosya yerine bellekte döner
  // ---------------------------------------------------------------------

  Future<Uint8List> encryptBlob(Uint8List plain, SecretKey key) async {
    final prefix = Uint8List.fromList(List.generate(8, (_) => Random.secure().nextInt(256)));
    final nonce = _nonce(prefix, 0);
    final box = await _aes.encrypt(plain, secretKey: key, nonce: nonce, aad: _aad(0, true));
    final head = ByteData(_headerLen)
      ..setUint8(0, _magic.codeUnitAt(0))
      ..setUint8(1, _magic.codeUnitAt(1))
      ..setUint8(2, _magic.codeUnitAt(2))
      ..setUint8(3, _magic.codeUnitAt(3))
      ..setUint32(4, _version, Endian.big)
      ..setUint32(8, _minChunk, Endian.big);
    return Uint8List.fromList([...head.buffer.asUint8List(), ...nonce, ...box.cipherText, ...box.mac.bytes]);
  }

  Future<Uint8List> decryptBlob(Uint8List blob, SecretKey key) async {
    if (blob.length < _headerLen + _nonceLen + _macLen) {
      throw const VaultIntegrityError('blob çok küçük');
    }
    final head = ByteData.view(blob.buffer, blob.offsetInBytes, _headerLen);
    if (head.getUint8(0) != _magic.codeUnitAt(0) ||
        head.getUint8(1) != _magic.codeUnitAt(1) ||
        head.getUint8(2) != _magic.codeUnitAt(2) ||
        head.getUint8(3) != _magic.codeUnitAt(3) ||
        head.getUint32(4, Endian.big) != _version) {
      throw const VaultIntegrityError('blob imzası/sürümü geçersiz');
    }
    final nonce = Uint8List.fromList(blob.sublist(_headerLen, _headerLen + _nonceLen));
    if (ByteData.view(nonce.buffer).getUint32(8, Endian.big) != 0) {
      throw const VaultIntegrityError('blob sayacı geçersiz');
    }
    final body = blob.sublist(_headerLen + _nonceLen);
    try {
      final plain = await _aes.decrypt(
        SecretBox(Uint8List.fromList(body.sublist(0, body.length - _macLen)),
            nonce: nonce, mac: Mac(body.sublist(body.length - _macLen))),
        secretKey: key,
        aad: _aad(0, true),
      );
      return Uint8List.fromList(plain);
    } on SecretBoxAuthenticationError {
      throw const VaultIntegrityError('thumbnail bütünlüğü bozuk');
    }
  }
}
