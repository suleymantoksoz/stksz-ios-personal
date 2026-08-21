import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/theme.dart';
import '../../models/models.dart';
import '../../services/file_vault_service.dart';
import '../../services/security_log_service.dart';
import 'quick_auth.dart';
import 'vault_ui_util.dart';

/// FAZ 9 — Korumalı kasa eylemleri: dışa aktarım (auth → decrypt → paylaşım)
/// ve silme (ilişkili tüm veriler + dürüst flash-depolama notu).
class VaultActions {
  VaultActions._();

  /// Kasadan çıkar: 1) kullanıcı onayı 2) doğrulama 3) bellek/disk sınırlı
  /// decrypt 4) sistem paylaşım menüsü — hedefi kullanıcı seçer.
  static Future<void> exportFile(BuildContext context, WidgetRef ref, DecryptedVaultFile f) async {
    final confirm = await showModalBottomSheet<bool>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(children: [
              Icon(Icons.file_upload_outlined, color: AppColors.cyan, size: 20),
              SizedBox(width: 8),
              Text('Kasadan çıkar', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.text)),
            ]),
            const SizedBox(height: 12),
            Text(
              '“${f.name}” şifresi çözülerek sistem paylaşım menüsüne verilecek. '
              'Hedefi (Dosyalar, Drive, Bluetooth…) sen seçersin. Çıkan kopya artık şifreli DEĞİLDİR; '
              'kasadaki kayıt korunmaya devam eder.',
              style: const TextStyle(color: AppColors.textDim, fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () => Navigator.pop(ctx, true),
              icon: const Icon(Icons.lock_open, size: 16),
              label: const Text('Doğrula ve dışa aktar'),
            ),
            const SizedBox(height: 6),
            OutlinedButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Center(child: Text('Vazgeç')),
            ),
          ],
        ),
      ),
    );
    if (confirm != true || !context.mounted) return;

    // 1) AUTHENTICATION (zorunlu — servis katmanı da ayrıca denetler)
    final authed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const QuickAuthDialog(reason: 'Kasadan çıkarmak için doğrula'),
    );
    if (authed != true || !context.mounted) return;

    // 2) DECRYPT (parça akışlı; büyük dosyada RAM şişmez)
    final svc = ref.read(fileVaultProvider.notifier);
    File? tmp;
    try {
      tmp = await svc.decryptToTemp(f.id, authenticated: true, purpose: 'export');
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e is VaultAuthRequired
                ? 'Doğrulama olmadan dışa aktarım yapılamaz'
                : 'Şifre çözülemedi — dosya bozuk olabilir'),
            backgroundColor: AppColors.red.withValues(alpha: 0.15)));
      }
      return;
    }

    // 3) EXPORT — hedefi kullanıcı seçer; tamamlanınca geçici plaintext silinir.
    try {
      await Share.shareXFiles([XFile(tmp.path)], subject: f.name);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Paylaşım menüsü açılamadı')));
      }
    } finally {
      await svc.purgeTemp(tmp);
    }
    // FAZ 10: güvenlik merkezine olay — gerçek dosya adı ASLA loglanmaz.
    await ref.read(securityLogProvider.notifier).add('vaultExport', '${f.kind.tr} dışa aktarıldı');
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Dışa aktarım tamamlandı — geçici şifresiz kopya silindi')));
    }
  }

  /// Sil: içerik + thumbnail + metadata + geçici kopyalar. Dönen: silindi ise true.
  static Future<bool> confirmDelete(BuildContext context, WidgetRef ref, DecryptedVaultFile f) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('${f.kind.tr} silinsin mi?', style: const TextStyle(color: AppColors.text, fontSize: 16)),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Bu işlem geri alınamaz.', style: TextStyle(color: AppColors.textDim, fontSize: 13)),
            SizedBox(height: 8),
            Text(kDeleteNote, style: TextStyle(color: AppColors.textDim, fontSize: 11, height: 1.4)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Vazgeç')),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Sil', style: TextStyle(color: AppColors.red))),
        ],
      ),
    );
    if (ok != true) return false;
    await ref.read(fileVaultProvider.notifier).delete(f.id);
    return true;
  }

  /// Bilgi sayfası (metadata kullanıcıya açık — kullanıcı zaten doğrulanmış).
  static Future<void> showInfo(BuildContext context, DecryptedVaultFile f) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(kindIcon(f.kind), color: kindColor(f.kind), size: 20),
              const SizedBox(width: 8),
              const Text('Dosya bilgisi', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.text)),
            ]),
            const SizedBox(height: 14),
            _row('Ad', f.name),
            _row('Tür', '${f.kind.tr} — ${f.mime}'),
            _row('Boyut', fmtBytes(f.sizeBytes)),
            _row('Kasaya giriş', fmtDate(f.entry.createdAt)),
            _row('Şifreleme', 'AES-256-GCM • PVF1 akış formatı'),
            const SizedBox(height: 8),
            const Text(
              'İçerik, adı ve metadata dahil her şey şifreli saklanır. Anahtar cihazın '
              'güvenli deposundan (Android Keystore / iOS Keychain) asla çıkmaz.',
              style: TextStyle(color: AppColors.textDim, fontSize: 11, height: 1.4),
            ),
          ],
        ),
      ),
    );
  }

  static Widget _row(String k, String v) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          SizedBox(width: 96, child: Text(k, style: const TextStyle(color: AppColors.textDim, fontSize: 12))),
          Expanded(child: Text(v, style: const TextStyle(color: AppColors.text, fontSize: 12))),
        ]),
      );
}
