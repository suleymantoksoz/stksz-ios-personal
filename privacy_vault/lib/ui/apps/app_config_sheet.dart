import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../models/models.dart';
import '../../services/native_bridge.dart';
import '../../services/protection_service.dart';

/// Uygulama bazlı koruma profili: Kilit / Gizle / Kimlik (decoy) / yöntem / bildirim modu.
class AppConfigSheet extends ConsumerStatefulWidget {
  final InstalledApp app;
  final ProtectedAppConfig config;
  const AppConfigSheet({super.key, required this.app, required this.config});

  @override
  ConsumerState<AppConfigSheet> createState() => _AppConfigSheetState();
}

class _AppConfigSheetState extends ConsumerState<AppConfigSheet> {
  late ProtectedAppConfig cfg = ProtectedAppConfig.fromMap(widget.config.toMap());

  Future<void> _save() async {
    await ref.read(protectionProvider.notifier).upsert(cfg);
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom + 20, left: 20, right: 20, top: 14),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(width: 38, height: 4, decoration: BoxDecoration(color: AppColors.border, borderRadius: BorderRadius.circular(4))),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                const Icon(Icons.tune, color: AppColors.textDim),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(widget.app.label,
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.text)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(widget.app.packageName, style: const TextStyle(fontSize: 11, color: AppColors.textDim)),
            const SizedBox(height: 18),

            _switchRow(
              icon: Icons.lock,
              color: AppColors.green,
              title: 'Kilitle',
              subtitle: 'Uygulama açıldığında doğrulama istenir',
              value: cfg.locked,
              onChanged: (v) => setState(() => cfg.locked = v),
            ),
            _switchRow(
              icon: Icons.visibility_off,
              color: AppColors.purple,
              title: 'Gizle',
              subtitle: 'Kilitli tutulur; bildirim engelleme ve sessiz profil önerilir',
              value: cfg.hidden,
              onChanged: cfg.locked ? (v) => setState(() => cfg.hidden = v) : null,
            ),
            if (cfg.hidden)
              const Padding(
                padding: EdgeInsets.only(left: 12, bottom: 8),
                child: Text(
                  'Not: Android, başka bir uygulamayı başlatıcıdan tamamen kaldırmaya izin vermez. "Gizle" modu kilit + bildirim engelleme ile birlikte çalışır.',
                  style: TextStyle(color: AppColors.textDim, fontSize: 11, height: 1.4),
                ),
              ),

            if (cfg.locked) ...[
              const Divider(height: 26),
              const Text('GÜVENLİK YÖNTEMİ',
                  style: TextStyle(fontSize: 11, letterSpacing: 1.4, fontWeight: FontWeight.w700, color: AppColors.textDim)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final m in AuthMethod.values)
                    ChoiceChip(
                      label: Text(m.tr, style: const TextStyle(fontSize: 12)),
                      selected: cfg.method == m,
                      onSelected: (_) => setState(() => cfg.method = m),
                      selectedColor: accent.withValues(alpha: 0.2),
                    ),
                ],
              ),
              const Divider(height: 26),
              const Text('GİZLİ KİMLİK (DECOY)',
                  style: TextStyle(fontSize: 11, letterSpacing: 1.4, fontWeight: FontWeight.w700, color: AppColors.textDim)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ChoiceChip(
                    label: const Text('Yok', style: TextStyle(fontSize: 12)),
                    selected: cfg.decoy == DecoyKind.none,
                    onSelected: (_) => setState(() => cfg.decoy = DecoyKind.none),
                  ),
                  ChoiceChip(
                    avatar: const Icon(Icons.calculate_outlined, size: 16),
                    label: Text(DecoyKind.calculator.tr, style: const TextStyle(fontSize: 12)),
                    selected: cfg.decoy == DecoyKind.calculator,
                    onSelected: (_) => setState(() => cfg.decoy = DecoyKind.calculator),
                  ),
                  ChoiceChip(
                    avatar: const Icon(Icons.note_alt_outlined, size: 16),
                    label: Text(DecoyKind.notes.tr, style: const TextStyle(fontSize: 12)),
                    selected: cfg.decoy == DecoyKind.notes,
                    onSelected: (_) => setState(() => cfg.decoy = DecoyKind.notes),
                  ),
                  ChoiceChip(
                    avatar: const Icon(Icons.schedule, size: 16),
                    label: Text(DecoyKind.clock.tr, style: const TextStyle(fontSize: 12)),
                    selected: cfg.decoy == DecoyKind.clock,
                    onSelected: (_) => setState(() => cfg.decoy = DecoyKind.clock),
                  ),
                  ChoiceChip(
                    avatar: const Icon(Icons.wb_sunny_outlined, size: 16),
                    label: Text(DecoyKind.weather.tr, style: const TextStyle(fontSize: 12)),
                    selected: cfg.decoy == DecoyKind.weather,
                    onSelected: (_) => setState(() => cfg.decoy = DecoyKind.weather),
                  ),
                ],
              ),
              const Divider(height: 26),
              const Text('BİLDİRİM GİZLİLİĞİ',
                  style: TextStyle(fontSize: 11, letterSpacing: 1.4, fontWeight: FontWeight.w700, color: AppColors.textDim)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final m in NotifMode.values)
                    ChoiceChip(
                      label: Text(m.tr, style: const TextStyle(fontSize: 12)),
                      selected: cfg.notifMode == m,
                      onSelected: (_) => setState(() => cfg.notifMode = m),
                      selectedColor: accent.withValues(alpha: 0.2),
                    ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                switch (cfg.notifMode) {
                  NotifMode.normal => 'Bildirimler sistemde olduğu gibi görünür.',
                  NotifMode.mask =>
                    'Bildirim kaldırılır; yerine içeriksiz, sessiz “gizlendi” kartı bırakılır. Ses/titreşim davranışını Android bildirim kanalı ayarından yönetirsin. Bildirim erişimi izni gerekir.',
                  NotifMode.hide =>
                    'Bildirimler tamamen kaldırılır (yalnızca bildirim erişimi izni verilmişse). Uygulamanın KENDİ içindeki bildirim geçmişine dokunulmaz — dürüst sınır.',
                },
                style: const TextStyle(color: AppColors.textDim, fontSize: 11, height: 1.4),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: () => NativeBridge.openAppNotificationSettings(widget.app.packageName),
                  child: const Text('Sistem bildirim ayarını aç', style: TextStyle(fontSize: 12)),
                ),
              ),
            ],

            const SizedBox(height: 14),
            ElevatedButton.icon(onPressed: _save, icon: const Icon(Icons.check, size: 18), label: const Text('Kaydet')),
          ],
        ),
      ),
    );
  }

  Widget _switchRow({
    required IconData icon,
    required Color color,
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool>? onChanged,
  }) {
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      value: value,
      onChanged: onChanged,
      secondary: Icon(icon, color: value ? color : AppColors.textDim),
      title: Text(title, style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w600)),
      subtitle: Text(subtitle, style: const TextStyle(color: AppColors.textDim, fontSize: 11)),
    );
  }
}
