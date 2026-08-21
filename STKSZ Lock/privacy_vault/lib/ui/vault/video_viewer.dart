import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';

import '../../core/theme.dart';
import '../../services/file_vault_service.dart';
import 'vault_actions.dart';
import 'vault_ui_util.dart';

/// FAZ 9 — Şifreli video oynatıcı.
///
/// Güvenlik modeli (dürüst): OS video çözücüleri yalnızca dosya yolundan/URL'den
/// okuyabilir; şifreli akışı doğrudan besleyemeyiz. Bu nedenle oynatma öncesi
/// içerik parça akışıyla (RAM şişmeden) UYGULAMA-İÇİ geçici alana çözülür:
///   - yalnızca bu uygulamanın erişebildiği vault/tmp altına yazılır,
///   - ekran kapanınca hemen silinir,
///   - ayrıca kasa her açılışında eskiyen geçici kopyalar otomatik budanır.
/// Kullanıcı bu davranışı ekranda görür; "iz bırakmaz" diye pazarlamayız.
class VideoViewerScreen extends ConsumerStatefulWidget {
  final DecryptedVaultFile file;
  const VideoViewerScreen({super.key, required this.file});

  @override
  ConsumerState<VideoViewerScreen> createState() => _VideoViewerScreenState();
}

class _VideoViewerScreenState extends ConsumerState<VideoViewerScreen> {
  VideoPlayerController? _controller;
  File? _tmp;
  Object? _error;
  bool _playing = false;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    try {
      // Kullanıcı kasaya zaten doğrulanarak girdi (kasa geçidi); servis
      // katmanı yine de doğrulama bayrağı olmadan çözüm YAPMAZ.
      final tmp = await ref
          .read(fileVaultProvider.notifier)
          .decryptToTemp(widget.file.id, authenticated: true, purpose: 'video');
      if (!mounted) {
        await ref.read(fileVaultProvider.notifier).purgeTemp(tmp);
        return;
      }
      final c = VideoPlayerController.file(tmp);
      await c.initialize();
      if (!mounted) {
        await c.dispose();
        await ref.read(fileVaultProvider.notifier).purgeTemp(tmp);
        return;
      }
      setState(() {
        _tmp = tmp;
        _controller = c;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  void dispose() {
    final c = _controller;
    final tmp = _tmp;
    _controller = null;
    _tmp = null;
    Future(() async {
      try {
        await c?.dispose();
      } catch (_) {}
      if (tmp != null) {
        try {
          await ref.read(fileVaultProvider.notifier).purgeTemp(tmp);
        } catch (_) {}
      }
    });
    super.dispose();
  }

  void _toggle() {
    final c = _controller;
    if (c == null) return;
    setState(() {
      _playing = !_playing;
      _playing ? c.play() : c.pause();
    });
  }

  @override
  Widget build(BuildContext context) {
    final f = widget.file;
    final c = _controller;
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
            Text('${fmtBytes(f.sizeBytes)} • oynatma: uygulama-içi geçici kopya',
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
      body: _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, color: AppColors.red, size: 40),
                    const SizedBox(height: 12),
                    Text(
                      _error is VaultIntegrityError
                          ? 'Bütünlük doğrulaması başarısız — dosya bozuk veya kasa anahtarı farklı.'
                          : 'Video çözülemedi veya bu biçim cihazda oynatılamıyor.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.textDim),
                    ),
                  ],
                ),
              ),
            )
          : c == null
              ? const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      CircularProgressIndicator(strokeWidth: 2, color: AppColors.cyan),
                      SizedBox(height: 12),
                      Text('Şifre çözülüyor…', style: TextStyle(color: AppColors.textDim, fontSize: 12)),
                    ],
                  ),
                )
              : Column(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: _toggle,
                        child: Center(
                          child: AspectRatio(
                            aspectRatio: c.value.aspectRatio > 0 ? c.value.aspectRatio : 16 / 9,
                            child: VideoPlayer(c),
                          ),
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
                      child: VideoProgressIndicator(c, allowScrubbing: true, colors: const VideoProgressColors(playedColor: AppColors.purple)),
                    ),
                    SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            IconButton(
                              iconSize: 36,
                              color: AppColors.text,
                              icon: Icon(_playing ? Icons.pause_circle_filled : Icons.play_circle_fill),
                              onPressed: _toggle,
                            ),
                            const SizedBox(width: 8),
                            Text(_fmtDur(c.value.position), style: const TextStyle(color: AppColors.textDim, fontSize: 11)),
                            const Text(' / ', style: TextStyle(color: AppColors.textDim, fontSize: 11)),
                            Text(_fmtDur(c.value.duration), style: const TextStyle(color: AppColors.textDim, fontSize: 11)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
    );
  }

  String _fmtDur(Duration d) {
    String two(int v) => v.toString().padLeft(2, '0');
    final h = d.inHours;
    final m = d.inMinutes % 60;
    final s = d.inSeconds % 60;
    return h > 0 ? '${two(h)}:${two(m)}:${two(s)}' : '${two(m)}:${two(s)}';
  }
}
