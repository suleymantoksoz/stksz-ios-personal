import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../core/constants.dart';
import '../models/models.dart';
import 'file_crypto.dart';
import 'security_log_service.dart';
import 'vault_service.dart';

export 'file_crypto.dart' show VaultIntegrityError, VaultCryptoAborted, VaultTooLargeToView;

/// Kaynak dosya izin verilen üst sınırı aşıyor (şifreleme hiç başlamaz).
class VaultTooLarge implements Exception {
  final int maxBytes;
  const VaultTooLarge(this.maxBytes);
  @override
  String toString() => 'VaultTooLarge($maxBytes)';
}

/// Kaynak dosya bozuk/boş/okunamaz.
class VaultMalformed implements Exception {
  final String reason;
  const VaultMalformed(this.reason);
  @override
  String toString() => 'VaultMalformed: $reason';
}

/// Dışa aktarım/korumalı işlem doğrulama olmadan istendi.
class VaultAuthRequired implements Exception {
  const VaultAuthRequired();
  @override
  String toString() => 'VaultAuthRequired';
}

/// Aynı isim kayıtlıysa kullanıcının seçebileceği yol.
enum VaultDupAction { autoSuffix, rename, skip }

class VaultDupChoice {
  final VaultDupAction action;
  final String? newName;
  const VaultDupChoice(this.action, {this.newName});
}

/// Bellekte çözülmüş metadata (içerik DEĞİL — içerik yalnızca gerektiğinde akışla çözülür).
class DecryptedVaultFile {
  final VaultFileEntry entry;
  final String name;
  final String mime;
  final VaultFileKind kind;
  final int sizeBytes;

  const DecryptedVaultFile({
    required this.entry,
    required this.name,
    required this.mime,
    required this.kind,
    required this.sizeBytes,
  });

  String get id => entry.id;
}

/// FAZ 9 — Şifreli dosya kasası.
///
/// Tasarım kuralları:
/// - İçerik <id>.pvf içinde PVF1 parça formatıyla; RAM asla dosya boyuna çıkmaz.
/// - İndeks (index.json) yalnızca {id, createdAt, şifreli metadata} tutar;
///   gerçek ad/MIME/boyut AES-256-GCM meta blob içindedir.
/// - Şifreleme önce <id>.pvf.tmp'ye yazılır, başarıyla bitince atomik olmayan
///   ama güvenli şekilde yeniden adlandırılır; hata durumunda tmp SİLİNİR ve
///   indekse asla yarım kayıt düşmez.
/// - Anahtar VaultCrypto'nun TEK kasa anahtarıdır (yeni şifreleme sistemi yok).
/// - Güvenlik loglarına gerçek dosya adı YAZILMAZ (yalnızca tür etiketi).
class FileVaultService extends StateNotifier<List<DecryptedVaultFile>> {
  FileVaultService({
    required VaultCrypto crypto,
    VaultFileCrypto? fileCrypto,
    Directory? testDir,
    this.logger,
    this.maxBytes = K.vaultFileMaxBytes,
  })  : _crypto = crypto,
        _fileCrypto = fileCrypto ?? VaultFileCrypto(),
        _testDir = testDir,
        super(const []);

  final VaultCrypto _crypto;
  final VaultFileCrypto _fileCrypto;
  final Directory? _testDir;
  final int maxBytes;

  /// (type, detail) — detail'e ASLA gerçek dosya adı konulmaz.
  final void Function(String type, String detail)? logger;

  static const int _indexedNameMax = K.vaultFileNameMax;

  // ---------------------------------------------------------------------
  // Dizinler
  // ---------------------------------------------------------------------

  Future<Directory> _base() async {
    if (_testDir != null) return _testDir;
    return getApplicationDocumentsDirectory();
  }

  Future<Directory> _filesDir() async =>
      Directory('${(await _base()).path}/vault/files')..createSync(recursive: true);
  Future<Directory> _thumbDir() async =>
      Directory('${(await _base()).path}/vault/thumbs')..createSync(recursive: true);
  Future<Directory> _tmpDir() async =>
      Directory('${(await _base()).path}/vault/tmp')..createSync(recursive: true);
  Future<File> _indexFile() async =>
      File('${(await _base()).path}/vault/index.json')..parent.createSync(recursive: true);

  // ---------------------------------------------------------------------
  // Yardımcılar: isim/MIME/tür
  // ---------------------------------------------------------------------

  /// Gerçek ad asla dosya yolu olarak kullanılmaz; yine de metadata'yı temiz tutarız
  /// (path traversal, kontrol karakteri, aşırı uzunluk temizliği).
  static String sanitizeName(String raw) {
    var s = raw.replaceAll(RegExp(r'[/\\\x00-\x1F\x7F]'), '_').trim();
    s = s.replaceAll(RegExp(r'\s+'), ' ');
    while (s.startsWith('.')) {
      s = s.substring(1);
    }
    if (s.isEmpty || s == '_') s = 'dosya';
    if (s.length > _indexedNameMax) s = s.substring(0, _indexedNameMax);
    return s;
  }

  static String mimeForName(String name) {
    final ext = name.contains('.') ? name.split('.').last.toLowerCase() : '';
    const map = {
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif',
      'webp': 'image/webp', 'heic': 'image/heic', 'heif': 'image/heif', 'bmp': 'image/bmp',
      'mp4': 'video/mp4', 'mov': 'video/quicktime', 'mkv': 'video/x-matroska', 'webm': 'video/webm',
      '3gp': 'video/3gpp', 'avi': 'video/x-msvideo',
      'pdf': 'application/pdf', 'txt': 'text/plain', 'md': 'text/markdown',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'zip': 'application/zip', 'rar': 'application/vnd.rar', '7z': 'application/x-7z-compressed',
      'apk': 'application/vnd.android.package-archive', 'json': 'application/json',
      'csv': 'text/csv', 'mp3': 'audio/mpeg', 'wav': 'audio/wav',
    };
    return map[ext] ?? 'application/octet-stream'; // bilinmeyen → generic binary
  }

  static VaultFileKind kindFor(String mime, String name) {
    if (mime.startsWith('image/')) return VaultFileKind.photo;
    if (mime.startsWith('video/')) return VaultFileKind.video;
    return VaultFileKind.file;
  }

  // ---------------------------------------------------------------------
  // Yükleme / budama
  // ---------------------------------------------------------------------

  Future<List<VaultFileEntry>> _readRaw() async {
    final f = await _indexFile();
    if (!await f.exists()) return [];
    try {
      final raw = jsonDecode(await f.readAsString());
      if (raw is! List) return [];
      // FAZ 12 (md.15): TEK bozuk kayıt tüm indeksi çökertmesin — sağlam
      // kayıtlar korunur; aksi halde budama her şeyi yetim sayıp silerdi.
      final out = <VaultFileEntry>[];
      for (final e in raw) {
        try {
          out.add(VaultFileEntry.fromMap(Map<String, dynamic>.from(e as Map)));
        } catch (_) {/* bozuk tek kayıt atlanır */}
      }
      return out;
    } catch (_) {
      return [];
    }
  }

  Future<void> _writeRaw(List<VaultFileEntry> entries) async {
    final f = await _indexFile();
    await f.writeAsString(jsonEncode(entries.map((e) => e.toMap()).toList()));
  }

  Future<void> load() async {
    await _pruneOrphans();
    final entries = await _readRaw();
    final out = <DecryptedVaultFile>[];
    for (final e in entries.reversed) {
      try {
        final plain = await _crypto.decryptText(e.metaBlob);
        final m = jsonDecode(plain) as Map<String, dynamic>;
        out.add(DecryptedVaultFile(
          entry: e,
          name: m['n'] as String? ?? 'dosya',
          mime: m['m'] as String? ?? 'application/octet-stream',
          kind: VaultFileKindX.fromCode(m['k'] as String?),
          sizeBytes: m['s'] as int? ?? 0,
        ));
      } catch (_) {/* bozuk meta atlanır */ }
    }
    state = out;
  }

  /// Yetim/yarım artıkları temizler: *.tmp (ketılmis şifreleme), indeksin
  /// tanımadığı .pvf/.pvt, eskiyen geçici plaintext (export/video temponları).
  Future<void> _pruneOrphans() async {
    try {
      // FAZ 12 (md.15 — migration failure veri SİLMEMELİ): indeks dosyası
      // mevcut ama okunamıyorsa (bozuk JSON) içeriği "boş" saymak yanlış olur;
      // tüm .pvf/.pvt yetim ilan edilip silinir → kasa verisi kaybolur.
      // Bu durumda yetim budamasını atla; yalnızca .tmp yaşlanması uygulanır.
      final idx = await _indexFile();
      final entries = await _readRaw();
      final indexLooksCorrupt =
          await idx.exists() && (await idx.length()) > 2 && entries.isEmpty;
      final known = entries.map((e) => e.id).toSet();
      final files = await _filesDir();
      await for (final ent in files.list()) {
        if (ent is! File) continue;
        final base = ent.uri.pathSegments.last;
        if (base.endsWith('.tmp')) {
          await ent.delete().catchError((_) => ent);
        } else if (!indexLooksCorrupt && base.endsWith('.pvf')) {
          final id = base.substring(0, base.length - 4);
          if (!known.contains(id)) await ent.delete().catchError((_) => ent);
        }
      }
      if (!indexLooksCorrupt) {
        final thumbs = await _thumbDir();
        await for (final ent in thumbs.list()) {
          if (ent is! File) continue;
          final base = ent.uri.pathSegments.last;
          if (base.endsWith('.pvt')) {
            final id = base.substring(0, base.length - 4);
            if (!known.contains(id)) await ent.delete().catchError((_) => ent);
          }
        }
      }
      // geçici plaintext havuzu: belirli yaşın üstündekileri sil
      final tmp = await _tmpDir();
      final cutoff = DateTime.now().subtract(const Duration(minutes: K.vaultTempMaxAgeMin));
      await for (final ent in tmp.list()) {
        if (ent is File) {
          final st = await ent.stat();
          if (st.modified.isBefore(cutoff)) await ent.delete().catchError((_) => ent);
        }
      }
    } catch (_) {/* budama en iyi çaba */ }
  }

  // ---------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------

  String _newId() =>
      DateTime.now().microsecondsSinceEpoch.toRadixString(16) +
      Random.secure().nextInt(0xffffff).toRadixString(16);

  Future<DecryptedVaultFile> importStream({
    required String name,
    String? mime,
    VaultFileKind? kind,
    required int length,
    required Stream<List<int>> Function() openStream,
    Future<VaultDupChoice> Function(String taken)? onDuplicate,
    void Function(double progress)? onProgress,
    bool Function()? abort,
  }) async {
    if (length <= 0) throw const VaultMalformed('boş dosya');
    if (length > maxBytes) throw VaultTooLarge(maxBytes);

    var safeName = sanitizeName(name);

    // Çakışma: mevcut duruma bak (metadata bellekte çözülmüş durumda).
    if (state.any((f) => f.name == safeName)) {
      final choice = onDuplicate != null
          ? await onDuplicate(safeName)
          : const VaultDupChoice(VaultDupAction.autoSuffix);
      switch (choice.action) {
        case VaultDupAction.skip:
          throw const VaultCryptoAborted(); // kullanıcı iptali → iz yok
        case VaultDupAction.rename:
          final rn = sanitizeName(choice.newName ?? '');
          if (rn.isEmpty || state.any((f) => f.name == rn)) {
            throw const VaultMalformed('yeni ad kullanılamıyor');
          }
          safeName = rn;
        case VaultDupAction.autoSuffix:
          safeName = _autoSuffix(safeName);
      }
    }

    final effMime = (mime == null || mime.isEmpty) ? mimeForName(safeName) : mime;
    final effKind = kind ?? kindFor(effMime, safeName);
    final id = _newId();
    final files = await _filesDir();
    final tmpPath = '${files.path}/$id.pvf.tmp';
    final finPath = '${files.path}/$id.pvf';
    final key = await _crypto.vaultKey();

    try {
      final sink = File(tmpPath).openWrite();
      try {
        await _fileCrypto.encryptStream(
          plain: openStream(),
          out: sink,
          key: key,
          chunkSize: K.vaultFileChunkSize,
          onProgress: (done) => onProgress?.call((done / length).clamp(0.0, 1.0)),
          abort: abort,
        );
      } finally {
        await sink.flush().then((_) => sink.close(), onError: (_) => sink.close());
      }
      // başarı: tmp → final
      await File(tmpPath).rename(finPath);
    } catch (_) {
      // Yarıda kalan/yarım dosya → tam temizlik. İndeks hiç güncellenmedi.
      try {
        if (await File(tmpPath).exists()) await File(tmpPath).delete();
      } catch (_) {}
      try {
        if (await File(finPath).exists()) await File(finPath).delete();
      } catch (_) {}
      rethrow;
    }

    final entries = await _readRaw();
    entries.add(VaultFileEntry(
      id: id,
      createdAt: DateTime.now(),
      metaBlob: await _crypto.encryptText(jsonEncode({
        'n': safeName,
        'm': effMime,
        'k': effKind.code,
        's': length,
      })),
    ));
    await _writeRaw(entries);
    await load();
    logger?.call('vaultImport', '${effKind.tr} içe aktarıldı');
    return state.firstWhere((f) => f.id == id);
  }

  Future<DecryptedVaultFile> importFile({
    required String path,
    String? name,
    String? mime,
    VaultFileKind? kind,
    Future<VaultDupChoice> Function(String taken)? onDuplicate,
    void Function(double progress)? onProgress,
    bool Function()? abort,
  }) async {
    final src = File(path);
    if (!await src.exists()) throw const VaultMalformed('kaynak dosya yok');
    final len = await src.length();
    final base = name ?? path.split(Platform.pathSeparator).last;
    final imported = await importStream(
      name: base,
      mime: mime,
      kind: kind,
      length: len,
      openStream: src.openRead,
      onDuplicate: onDuplicate,
      onProgress: onProgress,
      abort: abort,
    );
    return imported;
  }

  String _autoSuffix(String name) {
    String cand(int n) {
      final dot = name.lastIndexOf('.');
      final stem = dot > 0 ? name.substring(0, dot) : name;
      final ext = dot > 0 ? name.substring(dot) : '';
      final s = '$stem ($n)$ext';
      return s.length > _indexedNameMax ? '${stem.substring(0, _indexedNameMax - ext.length - 4)} ($n)$ext' : s;
    }

    var i = 2;
    var c = cand(i);
    while (state.any((f) => f.name == c)) {
      i += 1;
      c = cand(i);
    }
    return c;
  }

  // ---------------------------------------------------------------------
  // Okuma: bellek içi (foto) / geçici dosyaya (video, dışa aktarım)
  // ---------------------------------------------------------------------

  Future<Uint8List> decryptToMemory(String id) async {
    final f = File('${(await _filesDir()).path}/$id.pvf');
    if (!await f.exists()) throw const VaultMalformed('şifreli içerik yok');
    return _fileCrypto.decryptBytes(
      src: f,
      key: await _crypto.vaultKey(),
      maxBytes: K.vaultMemoryViewMaxBytes,
    );
  }

  /// İçeriği uygulama-içi geçici alana çözer (video oynatma / dışa aktarım).
  /// [authenticated] zorunlu: kullanıcı bu oturumda doğrulama geçirmediyse
  /// servis katmanı işlemi REDDEDER (UI'nin atlaması mümkün değildir).
  /// Dönen dosya: [purpose] önekli, vault/tmp altında; kullanıcı sorumluluğunda
  /// silinir + servis eskiyen dosyaları her load()ta otomatik budar.
  Future<File> decryptToTemp(String id, {required bool authenticated, String purpose = 'view'}) async {
    if (!authenticated) throw const VaultAuthRequired();
    final meta = state.firstWhere((f) => f.id == id, orElse: () => throw const VaultMalformed('kayıt yok'));
    final tmp = await _tmpDir();
    final safe = sanitizeName(meta.name);
    final dst = File('${tmp.path}/${purpose}_${id}_$safe');
    final src = File('${(await _filesDir()).path}/$id.pvf');
    if (!await src.exists()) throw const VaultMalformed('şifreli içerik yok');
    try {
      await _fileCrypto.decryptFile(src: src, dst: dst, key: await _crypto.vaultKey());
      return dst;
    } catch (_) {
      try {
        if (await dst.exists()) await dst.delete();
      } catch (_) {}
      rethrow;
    }
  }

  /// Geçici dosyayı en iyi çabayla siler (export/video ekranı kapanınca çağrılır).
  Future<void> purgeTemp(File f) async {
    try {
      if (await f.exists()) await f.delete();
    } catch (_) {/* en iyi çaba */}
  }

  // ---------------------------------------------------------------------
  // Silme
  // ---------------------------------------------------------------------

  /// İçerik + thumbnail + indeks + ilişkili tüm geçici plaintext artıkları siler.
  /// NOT: flash/SSD'de fiziksel üzerine yazma garantisi OS düzeyinde verilemez;
  /// bu gerçek UI'da kullanıcıya açıkça belirtilir.
  Future<void> delete(String id) async {
    DecryptedVaultFile? meta;
    for (final f in state) {
      if (f.id == id) {
        meta = f;
        break;
      }
    }
    final kind = meta?.kind ?? VaultFileKind.file;
    try {
      final f = File('${(await _filesDir()).path}/$id.pvf');
      if (await f.exists()) await f.delete();
    } catch (_) {}
    try {
      final t = File('${(await _thumbDir()).path}/$id.pvt');
      if (await t.exists()) await t.delete();
    } catch (_) {}
    try {
      final tmp = await _tmpDir();
      await for (final ent in tmp.list()) {
        if (ent is File && ent.uri.pathSegments.last.contains('_${id}_')) {
          await ent.delete().catchError((_) => ent);
        }
      }
    } catch (_) {}
    final entries = await _readRaw()..removeWhere((e) => e.id == id);
    await _writeRaw(entries);
    await load();
    logger?.call('vaultDelete', '${kind.tr} silindi');
  }

  // ---------------------------------------------------------------------
  // Thumbnail (şifreli, <id>.pvt — plaintext thumbnail ASLA diske yazılmaz)
  // ---------------------------------------------------------------------

  Future<void> saveThumb(String id, Uint8List pngBytes) async {
    final dir = await _thumbDir();
    final blob = await _fileCrypto.encryptBlob(pngBytes, await _crypto.vaultKey());
    await File('${dir.path}/$id.pvt').writeAsBytes(blob, flush: true);
  }

  /// Şifreli thumbnail'i belleğe çözer. Yoksa/bozuksa null (UI simgeye düşer).
  Future<Uint8List?> readThumb(String id) async {
    try {
      final f = File('${(await _thumbDir()).path}/$id.pvt');
      if (!await f.exists()) return null;
      return await _fileCrypto.decryptBlob(await f.readAsBytes(), await _crypto.vaultKey());
    } catch (_) {
      return null;
    }
  }

  Future<void> deleteThumb(String id) async {
    try {
      final f = File('${(await _thumbDir()).path}/$id.pvt');
      if (await f.exists()) await f.delete();
    } catch (_) {}
  }
}

final fileVaultProvider =
    StateNotifierProvider<FileVaultService, List<DecryptedVaultFile>>((ref) {
  return FileVaultService(
    crypto: ref.watch(vaultCryptoProvider),
    logger: (t, d) => ref.read(securityLogProvider.notifier).add(t, d),
  );
});
