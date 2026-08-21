import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../models/models.dart';
import '../../services/native_bridge.dart';
import '../../services/protection_service.dart';
import '../../services/security_log_service.dart';
import 'app_config_sheet.dart';

/// "Kilitle" sekmesi: durum paneli + kategorilere ayrılmış uygulama listesi.
class AppsScreen extends ConsumerStatefulWidget {
  const AppsScreen({super.key});

  @override
  ConsumerState<AppsScreen> createState() => _AppsScreenState();
}

class _AppsScreenState extends ConsumerState<AppsScreen> {
  String _query = '';

  static const categoryOrder = ['Sosyal', 'Mesajlaşma', 'Banka & Finans', 'Galeri & Fotoğraf', 'Sistem', 'Oyunlar', 'Diğer'];

  @override
  Widget build(BuildContext context) {
    final protection = ref.watch(protectionProvider);
    final protectionSvc = ref.read(protectionProvider.notifier);
    final appsAsync = ref.watch(deviceAppsProvider);
    final events = ref.watch(securityLogProvider);
    final accent = Theme.of(context).colorScheme.primary;

    return Scaffold(
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            // --- Başlık + durum ---
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                child: Row(
                  children: [
                    const Text('PRIVACY VAULT',
                        style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, letterSpacing: 2.6, color: AppColors.text)),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: (protectionSvc.protectionActive ? AppColors.green : AppColors.textDim).withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                            color: (protectionSvc.protectionActive ? AppColors.green : AppColors.textDim).withValues(alpha: 0.5)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.circle,
                              size: 8, color: protectionSvc.protectionActive ? AppColors.green : AppColors.textDim),
                          const SizedBox(width: 6),
                          Text(
                            protectionSvc.protectionActive ? 'KORUMA AKTİF' : 'KORUMA YOK',
                            style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 1,
                                color: protectionSvc.protectionActive ? AppColors.green : AppColors.textDim),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // --- Dashboard kartları ---
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  children: [
                    Row(
                      children: [
                        _statCard('${protectionSvc.lockedCount}', 'Korunan\nUygulama', Icons.lock, accent),
                        const SizedBox(width: 10),
                        _statCard('${protectionSvc.hiddenCount}', 'Gizli\nUygulama', Icons.visibility_off, AppColors.purple),
                        const SizedBox(width: 10),
                        _statCard(
                          events.isEmpty ? '—' : _eventLabel(events.first.type),
                          'Son Güvenlik\nOlayı',
                          Icons.bolt,
                          events.isNotEmpty && (events.first.type.contains('Fail') || events.first.type.contains('Wrong'))
                              ? AppColors.red
                              : AppColors.green,
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => appsAsync.whenData((apps) {
                              protectionSvc.lockAll(apps);
                              _snack('Tüm uygulamalar kilitlendi');
                            }),
                            icon: const Icon(Icons.lock_clock, size: 18),
                            label: const Text('Tümünü Kilitle'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: protectionSvc.lockedCount == 0
                                ? null
                                : () {
                                    protectionSvc.unlockAll();
                                    _snack('Tüm kilitler kaldırıldı');
                                  },
                            icon: const Icon(Icons.lock_open, size: 18),
                            label: const Text('Kilitleri Aç'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    if (!Platform.isAndroid)
                      _infoCard(
                        'iOS notu',
                        'iOS, kurulu uygulamaları listelemeye ve diğer uygulamaları kilitlemeye (Apple Screen Time yetkisi olmadan) izin vermez. '
                            'Bu sekme Android\'de tam işlevseldir; iOS tarafında Gizli Kasa ve güvenlik özellikleri çalışır.',
                        Icons.info_outline,
                      ),
                  ],
                ),
              ),
            ),
            // --- Arama ---
            if (Platform.isAndroid)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 10),
                  child: TextField(
                    onChanged: (v) => setState(() => _query = v.toLowerCase()),
                    decoration: const InputDecoration(
                      hintText: 'Uygulama ara…',
                      prefixIcon: Icon(Icons.search, color: AppColors.textDim),
                      isDense: true,
                    ),
                  ),
                ),
              ),
            // --- Liste ---
            appsAsync.when(
              loading: () => const SliverFillRemaining(child: Center(child: CircularProgressIndicator())),
              error: (_, __) => const SliverFillRemaining(
                  child: Center(child: Text('Uygulama listesi alınamadı', style: TextStyle(color: AppColors.textDim)))),
              data: (apps) {
                final filtered = _query.isEmpty ? apps : apps.where((a) => a.label.toLowerCase().contains(_query)).toList();
                if (Platform.isAndroid && filtered.isEmpty) {
                  return const SliverFillRemaining(
                      child: Center(child: Text('Sonuç yok', style: TextStyle(color: AppColors.textDim))));
                }
                final grouped = <String, List<InstalledApp>>{};
                for (final a in filtered) {
                  grouped.putIfAbsent(a.category, () => []).add(a);
                }
                final cats = [
                  ...categoryOrder.where(grouped.containsKey),
                  ...grouped.keys.where((c) => !categoryOrder.contains(c)),
                ];
                return SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (context, i) => _buildCategory(cats[i], grouped[cats[i]]!, protection),
                    childCount: cats.length,
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _statCard(String value, String label, IconData icon, Color color) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
          child: Column(
            children: [
              Icon(icon, color: color, size: 20),
              const SizedBox(height: 8),
              Text(value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.text)),
              const SizedBox(height: 4),
              Text(label,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 10, color: AppColors.textDim, height: 1.3)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _infoCard(String title, String body, IconData icon) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: AppColors.purple, size: 20),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w700, fontSize: 13)),
                const SizedBox(height: 4),
                Text(body, style: const TextStyle(color: AppColors.textDim, fontSize: 12, height: 1.4)),
              ]),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategory(String category, List<InstalledApp> apps, Map<String, ProtectedAppConfig> protection) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(22, 14, 22, 6),
          child: Text(category.toUpperCase(),
              style: const TextStyle(fontSize: 11, letterSpacing: 1.6, fontWeight: FontWeight.w700, color: AppColors.textDim)),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Card(
            child: Column(
              children: [
                for (var i = 0; i < apps.length; i++) ...[
                  _appRow(apps[i], protection[apps[i].packageName]),
                  if (i < apps.length - 1) const Divider(indent: 66),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _appRow(InstalledApp app, ProtectedAppConfig? cfg) {
    final locked = cfg?.locked ?? false;
    final hidden = cfg?.hidden ?? false;
    return ListTile(
      onTap: () => _openConfig(app, cfg),
      leading: _AppIcon(app: app),
      title: Text(app.label, style: const TextStyle(color: AppColors.text, fontSize: 14, fontWeight: FontWeight.w600)),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(
          children: [
            if (locked) _chip('Kilitli', AppColors.green),
            if (hidden) ...[const SizedBox(width: 4), _chip('Gizli', AppColors.purple)],
            if (!locked) const Text('Korumasız', style: TextStyle(fontSize: 11, color: AppColors.textDim)),
            if (locked) ...[
              const SizedBox(width: 6),
              Flexible(
                child: Text(cfg!.method.tr,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11, color: AppColors.textDim)),
              ),
            ],
          ],
        ),
      ),
      trailing: Switch(
        value: locked,
        onChanged: (v) => ref.read(protectionProvider.notifier).toggleLock(app, v),
      ),
    );
  }

  Widget _chip(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(text, style: TextStyle(fontSize: 9, color: color, fontWeight: FontWeight.w700)),
    );
  }

  void _openConfig(InstalledApp app, ProtectedAppConfig? cfg) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => AppConfigSheet(app: app, config: cfg ?? ProtectedAppConfig(packageName: app.packageName, label: app.label)),
    );
  }

  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
}

String _eventLabel(String type) => switch (type) {
      'loginSuccess' => 'Başarılı giriş',
      'pinWrong' => 'Yanlış PIN',
      'patternWrong' => 'Yanlış desen',
      'passwordWrong' => 'Yanlış parola',
      'bioFail' => 'Biyo. başarısız',
      'bioSuccess' => 'Biyo. başarılı',
      'lockout3' => 'SECURITY LOCKED',
      'recoveryUsed' => 'Kurtarma kullanıldı',
      'recoveryFail' => 'Kurtarma hatalı',
      'appUnlock' => 'Kilit açıldı',
      'appUnlockFail' => 'Kilit hatası',
      'appLockEngaged' => 'Kilit etkin',
      'notifHidden' => 'Bildirim gizlendi',
      _ => type,
    };

/// Lazy ikon yükleyici (native getAppIcon).
class _AppIcon extends StatefulWidget {
  final InstalledApp app;
  const _AppIcon({required this.app});

  @override
  State<_AppIcon> createState() => _AppIconState();
}

class _AppIconState extends State<_AppIcon> {
  @override
  void initState() {
    super.initState();
    if (widget.app.iconBytes == null) {
      NativeBridge.getAppIcon(widget.app.packageName).then((bytes) {
        if (bytes != null && mounted) setState(() => widget.app.iconBytes = bytes);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final bytes = widget.app.iconBytes;
    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(color: AppColors.surface2, borderRadius: BorderRadius.circular(11)),
      clipBehavior: Clip.antiAlias,
      child: bytes != null
          ? Image.memory(bytes, width: 42, height: 42, fit: BoxFit.cover, gaplessPlayback: true)
          : const Icon(Icons.android, color: AppColors.textDim, size: 22),
    );
  }
}
