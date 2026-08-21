import 'package:flutter/material.dart';

import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../models/models.dart';

/// FAZ 9 kasa UI ortak küçük yardımcıları.
String fmtBytes(int b) {
  if (b < 1024) return '$b B';
  if (b < 1024 * 1024) return '${(b / 1024).toStringAsFixed(1)} KB';
  if (b < 1024 * 1024 * 1024) return '${(b / (1024 * 1024)).toStringAsFixed(1)} MB';
  return '${(b / (1024 * 1024 * 1024)).toStringAsFixed(2)} GB';
}

String fmtDate(DateTime d) =>
    '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

Color kindColor(VaultFileKind k) => switch (k) {
      VaultFileKind.photo => AppColors.cyan,
      VaultFileKind.video => AppColors.purple,
      VaultFileKind.file => AppColors.green,
    };

IconData kindIcon(VaultFileKind k) => switch (k) {
      VaultFileKind.photo => Icons.photo_outlined,
      VaultFileKind.video => Icons.videocam_outlined,
      VaultFileKind.file => Icons.insert_drive_file_outlined,
    };

/// MIME/dosya adına göre kapsayıcı simge (Dosyalar sekmesi).
IconData fileIconFor(String mime, String name) {
  if (mime == 'application/pdf') return Icons.picture_as_pdf_outlined;
  if (mime.startsWith('text/')) return Icons.notes_outlined;
  if (mime.contains('zip') || mime.contains('rar') || mime.contains('compressed') || mime.contains('7z')) {
    return Icons.folder_zip_outlined;
  }
  if (mime.contains('word') || mime.contains('msword')) return Icons.description_outlined;
  if (mime.contains('sheet') || mime.contains('excel')) return Icons.table_chart_outlined;
  if (mime.contains('presentation') || mime.contains('powerpoint')) return Icons.slideshow_outlined;
  if (mime.startsWith('image/')) return Icons.image_outlined;
  if (mime.startsWith('video/')) return Icons.videocam_outlined;
  if (mime.startsWith('audio/')) return Icons.audiotrack_outlined;
  return Icons.insert_drive_file_outlined;
}

/// Silme onay metni: flash depolama gerçeği (dürüstlük şartı).
const String kDeleteNote =
    'Şifreli içerik, thumbnail, metadata ve geçici kopyalar silinir. '
    'Not: flash/SSD depolamada fiziksel üzerine yazma garantisi işletim sistemi '
    'düzeyinde verilemez; silinen veri anahtar olmadan okunamaz.';

const String kRenameHint = 'Yeni ad (${K.vaultFileNameMax} karakter sınırı)';
