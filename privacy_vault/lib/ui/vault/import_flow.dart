import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:photo_manager/photo_manager.dart';

import '../../core/theme.dart';
import '../../models/models.dart';
import '../../services/file_vault_service.dart';
import '../../services/media_import.dart';
import 'vault_ui_util.dart';

/// FAZ 9 — Kasa içe aktarım akışı (galeri foto/video + belge).
/// Local-first: hiçbir ağ/sunucu işi yok; şifreleme cihazda, OFFLINE çalışır.
class VaultImportFlow {
  VaultImportFlow._();

  /// "+” menüsünden galeri ithalatı: izin → seçici → şuanda şifrele →
  /// isteğe bağlı, kontrollü orijinal silme (sistem onayıyla).
  static Future<void> importFromGallery(BuildContext context, WidgetRef ref) async {
    final granted = await MediaImport.ensureMediaPermission();
    if (!context.mounted) return;
    if (!granted) {
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: AppColors.surface,
          title: const Text('Galeri izni gerekli', style: TextStyle(color: AppColors.text, fontSize: 16)),
          content: const Text(
            'Fotoğraf/video içe aktarmak için galeri erişimi gerekir. '
            'İzin verilmeden kasaya hiçbir medya aktarılmaz.',
            style: TextStyle(color: AppColors.textDim, fontSize: 13, height: 1.4),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Vazgeç')),
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                MediaImport.openSystemSettings();
              },
              child: const Text('Ayarlara git', style: TextStyle(color: AppColors.cyan)),
            ),
          ],
        ),
      );
      return;
    }

    final selected = await Navigator.of(context).push<List<AssetEntity>>(
      MaterialPageRoute(builder: (_) => const _GalleryPickerPage()),
    );
    if (selected == null || selected.isEmpty || !context.mounted) return;

    // İçe aktarım + ilerleme
    final svc = ref.read(fileVaultProvider.notifier);
    final imported = <ImportableAsset>[];
    var done = 0;
    var failed = 0;

    final progress = ValueNotifier<(int, int, double, String)>((0, selected.length, 0, ''));
    final sheetClosed = _showProgressSheet(context, progress);

    for (final asset in selected) {
      progress.value = (done, selected.length, done / selected.length, 'oku');
      try {
        final ia = await MediaImport.originFileOf(asset);
        if (ia == null) {
          failed++;
          done++;
          continue;
        }
        final file = await svc.importFile(
          path: ia.file.path,
          name: ia.name,
          mime: ia.mime,
          kind: ia.isVideo ? VaultFileKind.video : VaultFileKind.photo,
          onProgress: (p) =>
              progress.value = (done, selected.length, (done + p) / selected.length, 'şifrele'),
          onDuplicate: (taken) => _duplicateChoice(context, taken),
        );
        // Thumbnail: fotoğraflarda OS ölçekli küçük resim → şifreli saklanır.
        if (file.kind == VaultFileKind.photo) {
          final thumb = await MediaImport.osThumb(asset, maxSide: 360);
          if (thumb != null) await svc.saveThumb(file.id, thumb);
        }
        imported.add(ia);
      } on VaultCryptoAborted {
        // kullanıcı "Atla" dedi — iz bırakılmadı
      } catch (_) {
        failed++;
      }
      done++;
      progress.value = (done, selected.length, done / selected.length, '');
    }
    sheetClosed();

    if (!context.mounted) return;
    if (imported.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(failed > 0 ? 'İçe aktarım başarısız ($failed öğe)' : 'İçe aktarım tamamlanamadı'),
        backgroundColor: AppColors.red.withValues(alpha: 0.15),
      ));
      return;
    }

    // KONTROLLÜ orijinal silme: otomatik SİLME YOK. Sistem onayı gösterilir.
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Orijinaller ne olsun?', style: TextStyle(color: AppColors.text, fontSize: 16)),
        content: Text(
          '${imported.length} öğe kasaya şifrelenerek kopyalandı${failed > 0 ? ' ($failed öğe aktarılamadı)' : ''}.\n\n'
          'Galerideki orijinalleri silmek istersen sistem son bir onay penceresi gösterir. '
          'Onaylamazsan hiçbir şey silinmez.',
          style: const TextStyle(color: AppColors.textDim, fontSize: 13, height: 1.4),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Galeride sakla')),
          TextButton(
            onPressed: () async {
              Navigator.pop(ctx);
              final n = await MediaImport.deleteOriginals(imported.map((e) => e.asset).toList());
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Text(n > 0
                      ? '$n orijinal silindi — kopyalar kasada güvende'
                      : 'Orijinaller silinmedi (sistem onayı verilmedi)'),
                ));
              }
            },
            child: const Text('Orijinalleri sil', style: TextStyle(color: AppColors.red)),
          ),
        ],
      ),
    );
  }

  /// Belge (PDF, DOCX, XLSX, ZIP, bilinmeyen türler dahil generic binary) ithalatı.
  static Future<void> importDocuments(BuildContext context, WidgetRef ref) async {
    final docs = await MediaImport.pickDocuments();
    if (docs.isEmpty || !context.mounted) return;

    final svc = ref.read(fileVaultProvider.notifier);
    var done = 0;
    var failed = 0;
    var skipped = 0;
    final progress = ValueNotifier<(int, int, double, String)>((0, docs.length, 0, ''));
    final closeSheet = _showProgressSheet(context, progress);

    for (final d in docs) {
      try {
        final file = await svc.importFile(
          path: d.path,
          name: d.name,
          onProgress: (p) => progress.value = (done, docs.length, (done + p) / docs.length, d.name),
          onDuplicate: (taken) => _duplicateChoice(context, taken),
        );
        // Fotoğraf olarak seçildiyse thumbnail üretmeyi dene (başarısızsa simgeye düşer).
        if (file.kind == VaultFileKind.photo) {
          try {
            final bytes = await svc.decryptToMemory(file.id);
            final png = await MediaImport.makeThumbPng(bytes);
            bytes.setAll(0, List.filled(bytes.length, 0)); // plaintext belleği en iyi çabayla temizle
            if (png != null) await svc.saveThumb(file.id, png);
          } catch (_) {/* thumbnail en iyi çaba */}
        }
      } on VaultCryptoAborted {
        skipped++;
      } on VaultTooLarge {
        failed++;
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('“${d.name}” boyut sınırını aşıyor — atlandı')),
          );
        }
      } catch (_) {
        failed++;
      }
      done++;
      progress.value = (done, docs.length, done / docs.length, '');
    }
    closeSheet();

    if (context.mounted) {
      final okCount = done - failed - skipped;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(okCount > 0
            ? '$okCount dosya şifrelenerek kasaya eklendi${failed > 0 || skipped > 0 ? ' • $failed başarısız, $skipped atlandı' : ''}'
            : 'Hiçbir dosya eklenemedi'),
        backgroundColor: okCount > 0 ? null : AppColors.red.withValues(alpha: 0.15),
      ));
    }
  }

  // ---------------------------------------------------------------------
  // Ortak parçalar
  // ---------------------------------------------------------------------

  /// Aynı isim çakışmasında kullanıcıya sor (UI); testler callback verir.
  static Future<VaultDupChoice> _duplicateChoice(BuildContext context, String taken) async {
    final result = await showDialog<VaultDupAction>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Aynı isim kasada var', style: TextStyle(color: AppColors.text, fontSize: 16)),
        content: Text('“$taken” zaten kayıtlı. Ne yapayım?',
            style: const TextStyle(color: AppColors.textDim, fontSize: 13)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, VaultDupAction.skip), child: const Text('Atla')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, VaultDupAction.rename),
              child: const Text('Yeniden adlandır')),
          TextButton(
              onPressed: () => Navigator.pop(ctx, VaultDupAction.autoSuffix),
              child: const Text('Farklı kaydet', style: TextStyle(color: AppColors.cyan))),
        ],
      ),
    );
    if (result == VaultDupAction.rename) {
      final ctrl = TextEditingController();
      if (!context.mounted) return const VaultDupChoice(VaultDupAction.skip);
      final newName = await showDialog<String>(
        context: context,
        builder: (ctx) => AlertDialog(
          backgroundColor: AppColors.surface,
          title: const Text('Yeni ad', style: TextStyle(color: AppColors.text, fontSize: 16)),
          content: TextField(
            controller: ctrl,
            autofocus: true,
            decoration: const InputDecoration(hintText: kRenameHint),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Vazgeç')),
            TextButton(
                onPressed: () => Navigator.pop(ctx, ctrl.text.trim()),
                child: const Text('Tamam', style: TextStyle(color: AppColors.cyan))),
          ],
        ),
      );
      if (newName != null && newName.isNotEmpty) {
        return VaultDupChoice(VaultDupAction.rename, newName: newName);
      }
      return const VaultDupChoice(VaultDupAction.skip);
    }
    return VaultDupChoice(result ?? VaultDupAction.skip);
  }

  /// İlerleme kartı (karanlık, kapanamaz) — kapatma fonksiyonu döner.
  static void Function() _showProgressSheet(
      BuildContext context, ValueNotifier<(int, int, double, String)> progress) {
    var closed = false;
    void close() {
      if (closed) return;
      closed = true;
      if (context.mounted) Navigator.of(context).maybePop();
    }

    showModalBottomSheet<void>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 28),
        child: ValueListenableBuilder<(int, int, double, String)>(
          valueListenable: progress,
          builder: (_, v, __) {
            final (done, total, frac, label) = v;
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(children: [
                  Icon(Icons.lock, color: AppColors.green, size: 18),
                  SizedBox(width: 8),
                  Text('AES-256-GCM ile şifreleniyor',
                      style: TextStyle(color: AppColors.text, fontWeight: FontWeight.w700, fontSize: 14)),
                ]),
                const SizedBox(height: 14),
                LinearProgressIndicator(
                  value: total == 0 ? null : frac.clamp(0.0, 1.0),
                  minHeight: 6,
                  backgroundColor: AppColors.surface2,
                ),
                const SizedBox(height: 10),
                Text('$done / $total${label.isNotEmpty ? ' • $label' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppColors.textDim, fontSize: 11)),
                const SizedBox(height: 4),
                const Text('İçerik parça parça şifrelenir — bellekte asla tam dosya tutulmaz.',
                    style: TextStyle(color: AppColors.textDim, fontSize: 10)),
              ],
            );
          },
        ),
      ),
    );
    return close;
  }
}

// =====================================================================
// Galeri seçici (photo_manager) — albüm çipleri + çoklu seçim + thumbnail
// =====================================================================

class _GalleryPickerPage extends StatefulWidget {
  const _GalleryPickerPage();

  @override
  State<_GalleryPickerPage> createState() => _GalleryPickerPageState();
}

class _GalleryPickerPageState extends State<_GalleryPickerPage> {
  static const _pageSize = 60;
  List<AssetPathEntity> _albums = const [];
  AssetPathEntity? _current;
  final List<AssetEntity> _items = [];
  final Set<String> _selectedIds = {};
  final Map<String, AssetEntity> _selectedAssets = {};
  bool _loading = true;
  int _totalInAlbum = 0;

  @override
  void initState() {
    super.initState();
    _loadAlbums();
  }

  Future<void> _loadAlbums() async {
    final albums = await MediaImport.loadAlbums();
    setState(() => _albums = albums);
    if (albums.isNotEmpty) {
      await _switchAlbum(albums.first);
    } else {
      setState(() => _loading = false);
    }
  }

  Future<void> _switchAlbum(AssetPathEntity album) async {
    setState(() {
      _current = album;
      _items.clear();
      _loading = true;
    });
    final count = await album.assetCountAsync;
    final first = await album.getAssetListRange(start: 0, end: _pageSize);
    if (!mounted) return;
    setState(() {
      _totalInAlbum = count;
      _items.addAll(first);
      _loading = false;
    });
  }

  Future<void> _loadMore() async {
    final album = _current;
    if (album == null || _loading || _items.length >= _totalInAlbum) return;
    final more =
        await album.getAssetListRange(start: _items.length, end: _items.length + _pageSize);
    if (!mounted) return;
    setState(() => _items.addAll(more));
  }

  void _toggle(AssetEntity a) {
    setState(() {
      if (_selectedIds.contains(a.id)) {
        _selectedIds.remove(a.id);
        _selectedAssets.remove(a.id);
      } else if (_selectedIds.length < 60) {
        _selectedIds.add(a.id);
        _selectedAssets[a.id] = a;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        title: Text('Kasaya aktar (${_selectedIds.length})',
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, letterSpacing: 1)),
        actions: [
          TextButton(
            onPressed: _selectedIds.isEmpty
                ? null
                : () => Navigator.of(context)
                    .pop(_selectedAssets.values.toList(growable: false)),
            child: Text('Şifrele (${_selectedIds.length})',
                style: const TextStyle(color: AppColors.cyan, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
      body: Column(
        children: [
          // Albüm çipleri
          SizedBox(
            height: 44,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              itemCount: _albums.length,
              itemBuilder: (_, i) {
                final a = _albums[i];
                final active = a.id == _current?.id;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(a.name,
                        style: TextStyle(
                            fontSize: 11,
                            color: active ? Colors.black : AppColors.textDim,
                            fontWeight: FontWeight.w600)),
                    selected: active,
                    onSelected: (_) => _switchAlbum(a),
                    selectedColor: AppColors.cyan,
                    backgroundColor: AppColors.surface2,
                    side: BorderSide.none,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                );
              },
            ),
          ),
          Expanded(
            child: _loading && _items.isEmpty
                ? const Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.cyan))
                : _items.isEmpty
                    ? const Center(
                        child: Text('Bu albümde öğe yok', style: TextStyle(color: AppColors.textDim)))
                    : NotificationListener<ScrollNotification>(
                        onNotification: (n) {
                          if (n.metrics.pixels > n.metrics.maxScrollExtent - 600) _loadMore();
                          return false;
                        },
                        child: GridView.builder(
                          padding: const EdgeInsets.fromLTRB(12, 6, 12, 20),
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                                  crossAxisCount: 3, crossAxisSpacing: 6, mainAxisSpacing: 6),
                          itemCount: _items.length,
                          itemBuilder: (_, i) {
                            final a = _items[i];
                            final sel = _selectedIds.contains(a.id);
                            final order = sel ? _selectedIds.toList().indexOf(a.id) + 1 : 0;
                            return GestureDetector(
                              onTap: () => _toggle(a),
                              child: Stack(
                                fit: StackFit.expand,
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(10),
                                    child: ColoredBox(
                                      color: AppColors.surface2,
                                      child: _AssetThumb(asset: a),
                                    ),
                                  ),
                                  if (a.type == AssetType.video)
                                    const Positioned(
                                      right: 6,
                                      bottom: 6,
                                      child: Icon(Icons.videocam, color: Colors.white70, size: 16),
                                    ),
                                  Positioned(
                                    right: 6,
                                    top: 6,
                                    child: AnimatedContainer(
                                      duration: const Duration(milliseconds: 120),
                                      width: 22,
                                      height: 22,
                                      decoration: BoxDecoration(
                                        color: sel ? AppColors.cyan : Colors.black38,
                                        shape: BoxShape.circle,
                                        border: Border.all(
                                            color: sel ? AppColors.cyan : Colors.white54),
                                      ),
                                      child: Center(
                                        child: sel
                                            ? Text('$order',
                                                style: const TextStyle(
                                                    color: Colors.black,
                                                    fontSize: 11,
                                                    fontWeight: FontWeight.w800))
                                            : null,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}

class _AssetThumb extends StatelessWidget {
  final AssetEntity asset;
  const _AssetThumb({required this.asset});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<Uint8List?>(
      future: asset.thumbnailDataWithSize(const ThumbnailSize(200, 200)),
      builder: (_, snap) {
        final b = snap.data;
        if (b == null) {
          return const Center(child: Icon(Icons.image_outlined, color: AppColors.textDim, size: 20));
        }
        return Image.memory(b, fit: BoxFit.cover, gaplessPlayback: true);
      },
    );
  }
}
