import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../services/file_vault_service.dart';
import 'vault_actions.dart';
import 'vault_ui_util.dart';

/// FAZ 9 — Tam ekran şifreli fotoğraf görüntüleyici.
/// Çözüm RAM'de yapılır (üst sınır: K.vaultMemoryViewMaxBytes), diske plaintext yazılmaz.
class PhotoViewerScreen extends ConsumerStatefulWidget {
  final DecryptedVaultFile file;
  const PhotoViewerScreen({super.key, required this.file});

  @override
  ConsumerState<PhotoViewerScreen> createState() => _PhotoViewerScreenState();
}

class _PhotoViewerScreenState extends ConsumerState<PhotoViewerScreen> {
  late final Future<Uint8List> _bytesF =
      ref.read(fileVaultProvider.notifier).decryptToMemory(widget.file.id);

  @override
  Widget build(BuildContext context) {
    final f = widget.file;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: AppColors.text),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(f.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: AppColors.text, fontSize: 13, fontWeight: FontWeight.w600)),
            Text('${fmtBytes(f.sizeBytes)} • şifreli kasa',
                style: const TextStyle(color: AppColors.textDim, fontSize: 10)),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Kasadan çıkar',
            icon: const Icon(Icons.file_upload_outlined, size: 20),
            onPressed: () => VaultActions.exportFile(context, ref, f),
          ),
          IconButton(
            tooltip: 'Sil',
            icon: const Icon(Icons.delete_outline, size: 20, color: AppColors.red),
            onPressed: () async {
              final deleted = await VaultActions.confirmDelete(context, ref, f);
              if (deleted && context.mounted) Navigator.of(context).pop();
            },
          ),
        ],
      ),
      body: FutureBuilder<Uint8List>(
        future: _bytesF,
        builder: (_, snap) {
          if (snap.hasError) {
            final e = snap.error;
            final msg = switch (e) {
              VaultTooLargeToView _ =>
                'Bu dosya bellek içi görüntüleme sınırını aşıyor (${fmtBytes(e.maxBytes)}).',
              VaultIntegrityError _ => 'Bütünlük doğrulaması başarısız — dosya bozuk veya kasa anahtarı farklı.',
              _ => 'Fotoğraf açılamadı.',
            };
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, color: AppColors.red, size: 40),
                    const SizedBox(height: 12),
                    Text(msg, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textDim)),
                  ],
                ),
              ),
            );
          }
          final bytes = snap.data;
          if (bytes == null) {
            return const Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.cyan));
          }
          return InteractiveViewer(
            maxScale: 6,
            minScale: 0.5,
            child: Center(
              child: Image.memory(
                bytes,
                gaplessPlayback: true,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const Padding(
                  padding: EdgeInsets.all(32),
                  child: Text(
                    'Bu görüntü biçimi cihazın çözücüsü tarafından desteklenmiyor (ör. bazı HEIC/RAW). '
                    'Dosya kasada güvende; “Kasadan çıkar” ile dışa aktarabilirsin.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AppColors.textDim),
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
