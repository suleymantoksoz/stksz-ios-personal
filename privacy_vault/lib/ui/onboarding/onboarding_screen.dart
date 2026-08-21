import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../services/app_settings.dart';
import '../../services/auth_service.dart';
import '../../services/native_bridge.dart';
import '../../services/protection_service.dart';
import '../home/home_shell.dart';
import '../lock/pads.dart';

/// İlk kurulum: PIN oluştur → (ops.) biyometrik → kurtarma sembolü →
/// Android izinleri → korunacak uygulamalar → tamamla.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _page = PageController();
  int _step = 0;
  bool _busy = false;

  // oluşturma sırasında geçici bellekte tutulur; son adımda hash'lenip silinir
  String _pin = '';
  String _pinConfirm = '';
  List<String> _recovery = [];
  List<String> _recoveryConfirm = [];
  bool _bioEnabled = false;
  bool _bioAvailable = false;

  bool _accEnabled = false, _overlayPerm = false, _notifPerm = false;

  @override
  void initState() {
    super.initState();
    _checkBio();
  }

  Future<void> _checkBio() async {
    final ok = await ref.read(authProvider.notifier).biometricsAvailable();
    if (mounted) setState(() => _bioAvailable = ok);
  }

  Future<void> _refreshPerms() async {
    if (!Platform.isAndroid) return;
    final acc = await NativeBridge.isAccessibilityEnabled();
    final ov = await NativeBridge.canDrawOverlays();
    final nt = await NativeBridge.isNotificationListenerEnabled();
    if (mounted) setState(() { _accEnabled = acc; _overlayPerm = ov; _notifPerm = nt; });
  }

  int get _lastStep => Platform.isAndroid ? 7 : 5; // Android: izin + uygulama seçimi dahil

  bool get _valid {
    switch (_step) {
      case 1: return _pin.length == 6;
      case 2: return _pinConfirm.length == 6;
      case 4: return _recovery.length >= 3;
      case 5: return _recoveryConfirm.length >= 3;
      default: return true;
    }
  }

  Future<void> _next() async {
    if (_step == 2 && _pin != _pinConfirm) {
      _toast('PIN\'ler eşleşmiyor — yeniden oluştur');
      setState(() { _pin = ''; _pinConfirm = ''; _step = 1; });
      _page.jumpToPage(1);
      return;
    }
    if (_step == 5 && _recovery.join() != _recoveryConfirm.join()) {
      _toast('Kurtarma sembolleri eşleşmiyor — yeniden oluştur');
      setState(() { _recovery = []; _recoveryConfirm = []; _step = 4; });
      _page.jumpToPage(4);
      return;
    }
    if (_step == _lastStep) return _finish();
    final to = _step + 1;
    setState(() => _step = to);
    _page.nextPage(duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
    if (Platform.isAndroid && to >= 6) _refreshPerms();
  }

  Future<void> _finish() async {
    setState(() => _busy = true);
    final auth = ref.read(authProvider.notifier);
    await auth.enrollPin(_pin);
    await auth.enrollRecovery(_recovery.join());
    final settings = ref.read(settingsProvider.notifier);
    if (_bioEnabled && _bioAvailable) await settings.setBiometricEntry(true);
    await ref.read(protectionProvider.notifier).syncNative();
    await settings.completeOnboarding();
    _pin = ''; _pinConfirm = ''; _recovery = []; _recoveryConfirm = [];
    if (!mounted) return;
    ref.read(appUnlockedProvider.notifier).state = true;
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const HomeShell()));
  }

  void _toast(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 6),
              child: Row(
                children: [
                  Text('KURULUM', style: TextStyle(letterSpacing: 2, color: accent, fontWeight: FontWeight.w800, fontSize: 12)),
                  const Spacer(),
                  Text('${_step + 1}/${_lastStep + 1}', style: const TextStyle(color: AppColors.textDim, fontSize: 12)),
                ],
              ),
            ),
            LinearProgressIndicator(
              value: (_step + 1) / (_lastStep + 1),
              backgroundColor: AppColors.surface2,
              color: accent,
              minHeight: 3,
            ),
            Expanded(
              child: PageView(
                controller: _page,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _welcome(accent),
                  _pinStep(false),
                  _pinStep(true),
                  _bioStep(accent),
                  _recoveryStep(false),
                  _recoveryStep(true),
                  if (Platform.isAndroid) _permsStep(accent),
                  if (Platform.isAndroid) _pickAppsStep(accent),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  ElevatedButton(
                    onPressed: (_valid && !_busy) ? _next : null,
                    child: Text(_step == _lastStep ? 'Korumayı Başlat' : 'Devam'),
                  ),
                  if (_step >= 3)
                    TextButton(
                      onPressed: _busy ? null : _next,
                      child: Text(_step == 3 ? 'Şimdi değil' : 'Atla', style: const TextStyle(color: AppColors.textDim)),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _welcome(Color accent) => Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.shield_moon_outlined, size: 84, color: accent),
            const SizedBox(height: 18),
            const Text('PRIVACY VAULT',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, letterSpacing: 4, color: AppColors.text)),
            const SizedBox(height: 12),
            const Text(
              'Uygulamalarını kilitle, gizle,\nözel kimliklerle koru.\n\nKurulum 1 dakikadan kısa sürer.',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.textDim, height: 1.5),
            ),
          ],
        ),
      );

  Widget _pinStep(bool confirm) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const SizedBox(height: 20),
            Text(confirm ? 'PIN\'i doğrula' : 'Ana PIN oluştur',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.text)),
            const SizedBox(height: 6),
            const Text('6 haneli — yalnızca hash\'i saklanır, düz metin asla tutulmaz',
                textAlign: TextAlign.center, style: TextStyle(color: AppColors.textDim, fontSize: 12)),
            const Spacer(),
            PinDots(filled: confirm ? _pinConfirm.length : _pin.length, total: 6),
            const SizedBox(height: 22),
            PinPad(
              value: confirm ? _pinConfirm : _pin,
              onChanged: (v) => setState(() => confirm ? _pinConfirm = v : _pin = v),
              onSubmit: _next,
            ),
            const Spacer(),
          ],
        ),
      );

  Widget _bioStep(Color accent) => Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.fingerprint, size: 76, color: _bioAvailable ? accent : AppColors.textDim),
            const SizedBox(height: 18),
            Text(_bioAvailable ? 'Biyometrik kilit açma' : 'Biyometrik kullanılamıyor',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.text)),
            const SizedBox(height: 10),
            Text(
              _bioAvailable
                  ? 'Parmak izi / yüz tanıma, işletim sisteminin güvenli biyometrik API\'si ile kullanılır.\nBiyometrik veri uygulamaya hiçbir zaman ulaşmaz.'
                  : 'Bu cihazda kayıtlı biyometrik bulunamadı. Sistem ayarlarından ekledikten sonra kullanabilirsin.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textDim, height: 1.5),
            ),
            const SizedBox(height: 22),
            if (_bioAvailable)
              SwitchListTile(
                value: _bioEnabled,
                onChanged: (v) => setState(() => _bioEnabled = v),
                title: const Text('Biyometrik girişi etkinleştir', style: TextStyle(color: AppColors.text)),
                subtitle: const Text('İsteğe bağlı', style: TextStyle(color: AppColors.textDim, fontSize: 12)),
              ),
          ],
        ),
      );

  Widget _recoveryStep(bool confirm) => Padding(
        padding: const EdgeInsets.all(24),
        child: SingleChildScrollView(
          child: Column(
            children: [
              const Icon(Icons.key, size: 52, color: AppColors.purple),
              const SizedBox(height: 12),
              Text(confirm ? 'Kurtarma sembolünü doğrula' : 'Kurtarma sembolü oluştur',
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.text)),
              const SizedBox(height: 8),
              const Text(
                '3 hatalı girişte normal doğrulama kapanır ve yalnızca bu sembol dizisi kilidi sıfırlar.\nEn az 3 sembol seç. Ör: ★★★. veya *.*!',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textDim, fontSize: 12, height: 1.5),
              ),
              const SizedBox(height: 20),
              SymbolPad(
                value: confirm ? _recoveryConfirm : _recovery,
                onChanged: (v) => setState(() => confirm ? _recoveryConfirm = v : _recovery = v),
              ),
            ],
          ),
        ),
      );

  Widget _permsStep(Color accent) {
    Widget row(IconData icon, String title, String desc, bool granted, VoidCallback open) => Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Icon(icon, color: granted ? AppColors.green : accent),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(title, style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 2),
                    Text(desc, style: const TextStyle(color: AppColors.textDim, fontSize: 12, height: 1.35)),
                  ]),
                ),
                const SizedBox(width: 8),
                granted
                    ? const Icon(Icons.check_circle, color: AppColors.green)
                    : TextButton(onPressed: open, child: const Text('Aç')),
              ],
            ),
          ),
        );
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Android koruma izinleri', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.text)),
          const SizedBox(height: 6),
          const Text('Kilit ekranının başka uygulamaların üzerinde çalışması için gereklidir. Ayarlardan istediğin zaman geri alabilirsin.',
              style: TextStyle(color: AppColors.textDim, fontSize: 12, height: 1.4)),
          const SizedBox(height: 16),
          row(Icons.accessibility_new, 'Erişilebilirlik Servisi', 'Açılan uygulamayı anında algılayıp kilit ekranını gösterir (ana koruma motoru).', _accEnabled, () => NativeBridge.openAccessibilitySettings()),
          const SizedBox(height: 10),
          row(Icons.layers_outlined, 'Üzerine Çizim', 'Kilit örtüsünü korunan uygulamanın üstünde tutar.', _overlayPerm, () => NativeBridge.openOverlaySettings()),
          const SizedBox(height: 10),
          row(Icons.notifications_off_outlined, 'Bildirim Erişimi', 'Gizli uygulamaların bildirim içeriklerini engellemek için (isteğe bağlı).', _notifPerm, () => NativeBridge.openNotificationListenerSettings()),
          const SizedBox(height: 10),
          OutlinedButton.icon(onPressed: _refreshPerms, icon: const Icon(Icons.refresh, size: 18), label: const Text('Durumu yenile')),
        ],
      ),
    );
  }

  Widget _pickAppsStep(Color accent) {
    final appsAsync = ref.watch(deviceAppsProvider);
    final protection = ref.watch(protectionProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.fromLTRB(24, 16, 24, 4),
          child: Text('Korunacak uygulamaları seç', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.text)),
        ),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 24),
          child: Text('Sonradan değiştirebilirsin. Her uygulamanın yöntemi ayrıca ayarlanır.',
              style: TextStyle(color: AppColors.textDim, fontSize: 12)),
        ),
        Expanded(
          child: appsAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => const Center(child: Text('Uygulama listesi alınamadı', style: TextStyle(color: AppColors.textDim))),
            data: (apps) {
              if (apps.isEmpty) {
                return const Center(child: Text('Bu platformda uygulama listesi desteklenmiyor', style: TextStyle(color: AppColors.textDim)));
              }
              return ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: apps.length > 40 ? 40 : apps.length,
                itemBuilder: (_, i) {
                  final app = apps[i];
                  final cfg = protection[app.packageName];
                  final locked = cfg?.locked ?? false;
                  return Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppColors.border)),
                    child: ListTile(
                      dense: true,
                      leading: const Icon(Icons.android, color: AppColors.textDim),
                      title: Text(app.label, style: const TextStyle(color: AppColors.text, fontSize: 14)),
                      subtitle: Text(app.category, style: const TextStyle(color: AppColors.textDim, fontSize: 11)),
                      trailing: Switch(
                        value: locked,
                        onChanged: (v) => ref.read(protectionProvider.notifier).toggleLock(app, v),
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}
