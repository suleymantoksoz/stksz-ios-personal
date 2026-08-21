import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../models/models.dart';
import '../../services/security_log_service.dart';
import '../lock/panic_lock.dart';

/// GÜVENLİK MERKEZİ — tüm doğrulama ve kilit olaylarının kaydı.
class SecurityCenterScreen extends ConsumerStatefulWidget {
  const SecurityCenterScreen({super.key});

  @override
  ConsumerState<SecurityCenterScreen> createState() => _SecurityCenterScreenState();
}

class _SecurityCenterScreenState extends ConsumerState<SecurityCenterScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(securityLogProvider.notifier).load());
  }

  @override
  Widget build(BuildContext context) {
    final events = ref.watch(securityLogProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('GÜVENLİK MERKEZİ'),
        actions: [
          // FAZ 10 — Panik kilit: oturumu anında sonlandır (veri silme YOK).
          IconButton(
            tooltip: 'Anında kilitle',
            icon: const Icon(Icons.flash_on, color: AppColors.red),
            onPressed: () => PanicLock.engage(context, ref),
          ),
          if (events.isNotEmpty)
            IconButton(
              tooltip: 'Kayıtları temizle',
              icon: const Icon(Icons.delete_sweep_outlined),
              onPressed: _confirmClear,
            ),
        ],
      ),
      body: events.isEmpty
          ? const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.verified_user_outlined, size: 56, color: AppColors.textDim),
                  SizedBox(height: 12),
                  Text('Henüz güvenlik olayı yok', style: TextStyle(color: AppColors.textDim)),
                ],
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: events.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _eventTile(events[i]),
            ),
    );
  }

  Widget _eventTile(SecurityEvent e) {
    final (icon, color, label) = _meta(e.type);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(label, style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w600, fontSize: 13)),
              if (e.detail.isNotEmpty)
                Text(e.detail, style: const TextStyle(color: AppColors.textDim, fontSize: 11)),
            ]),
          ),
          Text(_rel(e.at), style: const TextStyle(color: AppColors.textDim, fontSize: 10)),
        ],
      ),
    );
  }

  (IconData, Color, String) _meta(String type) => switch (type) {
        'loginSuccess' => (Icons.check_circle_outline, AppColors.green, 'Başarılı giriş'),
        'pinWrong' => (Icons.dialpad, AppColors.red, 'Yanlış PIN'),
        'patternWrong' => (Icons.pattern, AppColors.red, 'Yanlış desen'),
        'passwordWrong' => (Icons.password, AppColors.red, 'Yanlış parola'),
        'bioFail' => (Icons.fingerprint, AppColors.red, 'Biyometrik başarısız'),
        'bioSuccess' => (Icons.fingerprint, AppColors.green, 'Biyometrik doğrulandı'),
        'lockout3' => (Icons.gpp_bad_outlined, AppColors.red, 'SECURITY LOCKED (3 hatalı giriş)'),
        'recoveryUsed' => (Icons.key, AppColors.purple, 'Kurtarma sembolü kullanıldı'),
        'recoveryFail' => (Icons.key_off, AppColors.red, 'Hatalı kurtarma sembolü'),
        'appUnlock' => (Icons.lock_open, AppColors.green, 'Uygulama kilidi açıldı'),
        'appUnlockFail' => (Icons.lock_outline, AppColors.red, 'Uygulama kilit denemesi başarısız'),
        'appLockEngaged' => (Icons.lock, AppColors.green, 'Uygulama koruma altına alındı'),
        'notifHidden' => (Icons.notifications_off_outlined, AppColors.purple, 'Bildirim gizlendi'),
        // FAZ 9 (kasa olayları — FAZ 10 haritası)
        'vaultImport' => (Icons.download_done, AppColors.cyan, 'Kasaya içe aktarım'),
        'vaultExport' => (Icons.file_upload_outlined, AppColors.purple, 'Kasadan dışa aktarım'),
        'vaultDelete' => (Icons.delete_outline, AppColors.red, 'Kasa kaydı silindi'),
        // FAZ 10
        'triggerOk' => (Icons.bolt, AppColors.green, 'Gizli açılış tetiklendi'),
        'triggerFail' => (Icons.bolt_outlined, AppColors.red, 'Gizli açılış denemesi başarısız'),
        'vaultOpened' => (Icons.inventory_2, AppColors.cyan, 'Gizli Kasa açıldı'),
        'panicLock' => (Icons.flash_on, AppColors.red, 'Panik kilidi — anında kilitlendi'),
        'backgroundLock' => (Icons.bedtime_outlined, AppColors.purple, 'Arka planda otomatik kilit'),
        'identityChanged' => (Icons.badge_outlined, AppColors.cyan, 'Başlatıcı kimliği değişti'),
        'adminGranted' => (Icons.admin_panel_settings_outlined, AppColors.green, 'Kaldırma koruması etkin'),
        'adminRevoked' => (Icons.admin_panel_settings_outlined, AppColors.textDim, 'Kaldırma koruması kaldırıldı'),
        'notifMasked' => (Icons.visibility_off_outlined, AppColors.purple, 'Bildirim içeriği maskelendi'),
        _ => (Icons.info_outline, AppColors.textDim, type),
      };

  String _rel(DateTime d) {
    final diff = DateTime.now().difference(d);
    if (diff.inMinutes < 1) return 'şimdi';
    if (diff.inHours < 1) return '${diff.inMinutes} dk önce';
    if (diff.inDays < 1) return '${diff.inHours} sa önce';
    return '${diff.inDays} g önce';
  }

  Future<void> _confirmClear() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Kayıtlar temizlensin mi?', style: TextStyle(color: AppColors.text, fontSize: 16)),
        content: const Text('Tüm güvenlik olayı geçmişi silinir.', style: TextStyle(color: AppColors.textDim)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Vazgeç')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Temizle', style: TextStyle(color: AppColors.red))),
        ],
      ),
    );
    if (ok == true) await ref.read(securityLogProvider.notifier).clear();
  }
}
