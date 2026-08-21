import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../models/models.dart';
import '../../services/file_vault_service.dart';
import 'photo_viewer.dart';
import 'vault_actions.dart';
import 'vault_ui_util.dart';
import 'video_viewer.dart';

/// FAZ 9 — Gizli Kasa dosya sekmeleri (Fotoğraflar / Videolar / Dosyalar).
/// Foto: şifreli thumbnail grid. Video: süreli kapak listesi. Dosya: uzantı rozetli liste.
/// Arama, bellekte çözülmüş metadata üzerinde çalışır; gerçek adlar loglanmaz.
class FilesTab extends ConsumerStatefulWidget {
  final VaultFileKind kind;
  final String query;
  const FilesTab({super.key, required this.kind, this.query = ''});

  @override
  ConsumerState<FilesTab> createState() => _FilesTabState();
}

class _FilesTabState extends ConsumerState<FilesTab> with AutomaticKeepAliveClientMixin {
  final Map<String, Future<Uint8List?>> _thumbCache = {};

  @override
  bool get wantKeepAlive => true;

  List<DecryptedVaultFile> _filtered(List<DecryptedVaultFile> all) {
    final q = widget.query.trim().toLowerCase();
    return all.where((f) {
      if (f.kind != widget.kind) return false;
      if (q.isEmpty) return true;
      return f.name.toLowerCase().contains(q);
    }).toList();
  }

  Future<Uint8List?> _thumb(String id) =>
      _thumbCache[id] ??= ref.read(fileVaultProvider.notifier).readThumb(id);

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final files = _filtered(ref.watch(fileVaultProvider));
    final ids = files.map((e) => e.id).toSet();
    _thumbCache.removeWhere((k, _) => !ids.contains(k));

    if (files.isEmpty) return _empty();

    return switch (widget.kind) {
      VaultFileKind.photo => _photoGrid(files),
      VaultFileKind.video => _videoGrid(files),
      VaultFileKind.file => _docList(files),
    };
  }

  Widget _empty() {
    final (icon, a, b) = switch (widget.kind) {
      VaultFileKind.photo => (Icons.photo_library_outlined, 'Kasada fotoğraf yok', '+ menüsünden galeriden içe aktar'),
      VaultFileKind.video => (Icons.video_library_outlined, 'Kasada video yok', '+ menüsünden galeriden içe aktar'),
      VaultFileKind.file => (Icons.folder_open_outlined, 'Kasada dosya yok', '+ menüsünden PDF, belge, ZIP ekle'),
    };
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 52, color: AppColors.textDim),
          const SizedBox(height: 12),
          Text(a, style: const TextStyle(color: AppColors.textDim)),
          const SizedBox(height: 4),
          Text(b, style: const TextStyle(color: AppColors.textDim, fontSize: 12)),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------
  // FOTOĞRAF — 3 sütunlu thumbnail grid
  // ---------------------------------------------------------------------
  Widget _photoGrid(List<DecryptedVaultFile> files) {
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 3, crossAxisSpacing: 6, mainAxisSpacing: 6),
      itemCount: files.length,
      itemBuilder: (_, i) {
        final f = files[i];
        return GestureDetector(
          onTap: () => _openPhoto(f),
          onLongPress: () => _sheet(f),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Container(
              color: AppColors.surface2,
              child: FutureBuilder<Uint8List?>(
                future: _thumb(f.id),
                builder: (_, snap) {
                  final bytes = snap.data;
                  if (bytes == null) {
                    return const Center(child: Icon(Icons.lock_outline, color: AppColors.textDim, size: 22));
                  }
                  return Image.memory(bytes, fit: BoxFit.cover, gaplessPlayback: true,
                      errorBuilder: (_, __, ___) =>
                          const Center(child: Icon(Icons.broken_image_outlined, color: AppColors.textDim)));
                },
              ),
            ),
          ),
        );
      },
    );
  }

  // ---------------------------------------------------------------------
  // VİDEO — 2 sütunlu kapak
  // ---------------------------------------------------------------------
  Widget _videoGrid(List<DecryptedVaultFile> files) {
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2, crossAxisSpacing: 10, mainAxisSpacing: 10, childAspectRatio: 1.15),
      itemCount: files.length,
      itemBuilder: (_, i) {
        final f = files[i];
        return GestureDetector(
          onTap: () => _openVideo(f),
          onLongPress: () => _sheet(f),
          child: Container(
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.border),
            ),
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Spacer(),
                const Center(
                  child: CircleAvatar(
                    radius: 22,
                    backgroundColor: AppColors.surface2,
                    child: Icon(Icons.play_arrow_rounded, color: AppColors.purple, size: 28),
                  ),
                ),
                const Spacer(),
                Text(f.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppColors.text, fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text('${fmtBytes(f.sizeBytes)} • ${fmtDate(f.entry.createdAt)}',
                    style: const TextStyle(color: AppColors.textDim, fontSize: 10)),
              ],
            ),
          ),
        );
      },
    );
  }

  // ---------------------------------------------------------------------
  // DOSYA — uzantı rozetli liste
  // ---------------------------------------------------------------------
  Widget _docList(List<DecryptedVaultFile> files) {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
      itemCount: files.length,
      itemBuilder: (_, i) {
        final f = files[i];
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            onTap: () => _sheet(f),
            leading: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                  color: AppColors.surface2, borderRadius: BorderRadius.circular(10)),
              child: Icon(fileIconFor(f.mime, f.name), color: AppColors.green, size: 20),
            ),
            title: Text(f.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: AppColors.text, fontSize: 13, fontWeight: FontWeight.w600)),
            subtitle: Text('${fmtBytes(f.sizeBytes)} • ${fmtDate(f.entry.createdAt)}',
                style: const TextStyle(color: AppColors.textDim, fontSize: 10)),
            trailing: const Icon(Icons.more_horiz, color: AppColors.textDim, size: 18),
          ),
        );
      },
    );
  }

  // ---------------------------------------------------------------------
  // Etkileşimler
  // ---------------------------------------------------------------------
  void _openPhoto(DecryptedVaultFile f) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => PhotoViewerScreen(file: f)));
  }

  void _openVideo(DecryptedVaultFile f) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => VideoViewerScreen(file: f)));
  }

  Future<void> _sheet(DecryptedVaultFile f) {
    HapticFeedback.selectionClick();
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                child: Row(children: [
                  Icon(kindIcon(f.kind), color: kindColor(f.kind), size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(f.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w700, fontSize: 13)),
                  ),
                ]),
              ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.info_outline, color: AppColors.cyan, size: 20),
                title: const Text('Bilgi', style: TextStyle(color: AppColors.text, fontSize: 14)),
                onTap: () {
                  Navigator.pop(ctx);
                  VaultActions.showInfo(context, f);
                },
              ),
              ListTile(
                leading: const Icon(Icons.file_upload_outlined, color: AppColors.cyan, size: 20),
                title: const Text('Kasadan çıkar', style: TextStyle(color: AppColors.text, fontSize: 14)),
                subtitle: const Text('Doğrulama + şifre çözme + hedefini sen seç',
                    style: TextStyle(color: AppColors.textDim, fontSize: 11)),
                onTap: () {
                  Navigator.pop(ctx);
                  VaultActions.exportFile(context, ref, f);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline, color: AppColors.red, size: 20),
                title: const Text('Sil', style: TextStyle(color: AppColors.red, fontSize: 14)),
                onTap: () async {
                  Navigator.pop(ctx);
                  await VaultActions.confirmDelete(context, ref, f);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
