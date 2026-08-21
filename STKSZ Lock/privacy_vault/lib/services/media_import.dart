import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:photo_manager/photo_manager.dart';

/// FAZ 9 — Medya/belge ithalat köprüsü (yalnızca uygulama tarafı; VM testlerinde
/// import edilmez). photo_manager/file_picker plugin çağrılarını tek noktada toplar.
///
/// Dürüstlük notları:
/// - Galeri izni reddedilirse güzelce düşülür, sahte başarı gösterilmez.
/// - [deleteOriginals] Android 11+ / iOS'ta SİSTEM onay diyaloğu çıkarır;
///   OS onaylamazsa silme gerçekleşmez ve dönen sayıya yansır.
/// - [originFileOf] OS'in ürettiği uygulama-içi geçici plaintext kopyayı verir;
///   import sonrası OS bunu kendi zamanlamasıyla temizler (bizim vault/tmp
///   budamamızın dışındadır).
class MediaImport {
  MediaImport._();

  /// Galeri (foto+video) erişim izni. authorized/limited = true.
  static Future<bool> ensureMediaPermission() async {
    try {
      final st = await PhotoManager.requestPermissionExtend();
      return st.hasAccess;
    } catch (_) {
      return false;
    }
  }

  static Future<void> openSystemSettings() => PhotoManager.openSetting();

  static Future<List<AssetPathEntity>> loadAlbums() async {
    try {
      return await PhotoManager.getAssetPathList(type: RequestType.common, hasAll: true);
    } catch (_) {
      return const [];
    }
  }

  /// Bir galeri öğesinden ithalat için gereken her şey.
  static Future<ImportableAsset?> originFileOf(AssetEntity a) async {
    try {
      final f = await a.originFile; // File? — iOS'ta bazı öğelerde null gelebilir
      if (f == null || !await f.exists()) return null;
      final mime = await a.mimeTypeAsync;
      final title = await a.titleAsync;
      return ImportableAsset(
        asset: a,
        file: f,
        name: title.isEmpty ? 'medya_${DateTime.now().millisecondsSinceEpoch}' : title,
        mime: mime,
        isVideo: a.type == AssetType.video,
      );
    } catch (_) {
      return null;
    }
  }

  /// Galeri öğesi için OS ölçekli thumbnail (bellekte plaintext; kalıcı DEĞİL).
  static Future<Uint8List?> osThumb(AssetEntity a, {int maxSide = 360}) async {
    try {
      return await a.thumbnailDataWithSize(ThumbnailSize(maxSide, maxSide), format: ThumbnailFormat.png);
    } catch (_) {
      return null;
    }
  }

  /// Seçilen orijinalleri sil — Android 11+/iOS'ta sistem onayı ister.
  /// Dönen sayı: OS'in fiilen sildiği öğe sayısı.
  static Future<int> deleteOriginals(List<AssetEntity> assets) async {
    try {
      final ids = assets.map((e) => e.id).toList();
      final deleted = await PhotoManager.editor.deleteWithIds(ids);
      return deleted.length;
    } catch (_) {
      return 0;
    }
  }

  /// Belge seçici (SAF / iOS Files) — izin GEREKTİRMEZ, çoklu seçim.
  static Future<List<PickedDocument>> pickDocuments() async {
    try {
      final res = await FilePicker.platform.pickFiles(allowMultiple: true, withData: false);
      if (res == null) return const [];
      final out = <PickedDocument>[];
      for (final p in res.files) {
        final path = p.path;
        if (path == null) continue;
        if (!await File(path).exists()) continue;
        out.add(PickedDocument(path: path, name: p.name));
      }
      return out;
    } catch (_) {
      return const [];
    }
  }

  /// Ham görüntü baytlarından ölçekli PNG thumbnail (bellekte). Bozuk/HEIC
  /// desteklenmeyen içerikte null döner (UI simgeye düşer, sahtesi üretilmez).
  static Future<Uint8List?> makeThumbPng(Uint8List bytes, {int maxSide = 360}) async {
    try {
      final codec = await ui.instantiateImageCodec(bytes, targetWidth: maxSide);
      final frame = await codec.getNextFrame();
      final data = await frame.image.toByteData(format: ui.ImageByteFormat.png);
      frame.image.dispose();
      codec.dispose();
      return data?.buffer.asUint8List();
    } catch (_) {
      return null;
    }
  }
}

class ImportableAsset {
  final AssetEntity asset;
  final File file;
  final String name;
  final String? mime;
  final bool isVideo;
  const ImportableAsset({
    required this.asset,
    required this.file,
    required this.name,
    required this.mime,
    required this.isVideo,
  });
}

class PickedDocument {
  final String path;
  final String name;
  const PickedDocument({required this.path, required this.name});
}
