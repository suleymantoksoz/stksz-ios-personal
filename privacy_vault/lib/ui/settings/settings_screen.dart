import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../models/models.dart';
import '../../services/app_settings.dart';
import '../../services/auth_service.dart';
import '../../services/decoy/trigger_tools.dart';
import '../../services/native_bridge.dart';
import '../../services/protection_service.dart';
import '../../services/security_policies.dart';
import '../lock/pads.dart';
import '../lock/panic_lock.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    final accent = Theme.of(context).colorScheme.primary;

    return Scaffold(
      appBar: AppBar(title: const Text('AYARLAR')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _section('GÜVENLİK'),
          _tile(Icons.dialpad, 'Ana PIN\'i değiştir', '6 haneli', () => _changePin(context, ref)),
          _tile(Icons.password, 'Parola oluştur / değiştir', 'Girişe alternatif yöntem ekler', () => _changePassword(context, ref)),
          _tile(Icons.pattern, 'Desen oluştur / değiştir', 'Girişe alternatif yöntem ekler', () => _changePattern(context, ref)),
          _switch(Icons.fingerprint, 'Biyometrik giriş', 'Uygulama açılışında parmak izi / yüz',
              settings.biometricEntry, (v) => _toggleBio(context, ref, v)),
          _dropdown<int>(
            Icons.timer_outlined,
            'Otomatik kilitleme',
            settings.autoLockSec,
            const {0: 'Hemen', 30: '30 saniye', 60: '1 dakika', 300: '5 dakika'},
            (v) => ref.read(settingsProvider.notifier).setAutoLockSec(v!),
          ),
          _infoTile(Icons.gpp_maybe_outlined, '3 hatalı giriş koruması',
              'Aktif — 3 yanlış denemede SECURITY LOCKED devreye girer, yalnızca kurtarma sembolü açar.', AppColors.green),

          _section('ACİL KURTARMA'),
          _tile(Icons.key, 'Kurtarma sembolünü değiştir', 'Mevcut sembol doğrulanır', () => _changeRecovery(context, ref)),
          _tile(Icons.verified_outlined, 'Kurtarma testi', 'Sembolünün çalıştığını doğrula', () => _testRecovery(context, ref)),

          _section('DECOY & KİMLİK'),
          _decoyPicker(context, ref),
          _switch(Icons.auto_awesome_outlined, 'Gizli mod etkin',
              'Kasa sekmesi seçilen decoy kimliğiyle açılır',
              settings.stealthVault, (v) => _toggleStealth(context, ref, v)),
          _triggerTile(context, ref),
          _vaultAuthModeDropdown(context, ref),
          _identityTile(context, ref),

          _section('GÖRÜNÜM'),
          _accentPicker(context, ref, accent),
          _infoTile(Icons.dark_mode_outlined, 'Tema', 'Koyu — premium güvenlik kimliği', accent),

          _section('GİZLİLİK'),
          _switch(Icons.photo_library_outlined, 'Son uygulamalarda içeriği gizle',
              'Bu uygulamanın ekran görüntüsü recent apps önizlemesinde gizlenir (FLAG_SECURE)',
              settings.flagSecure, (v) => ref.read(settingsProvider.notifier).setFlagSecure(v)),
          _switch(Icons.bedtime_outlined, 'Arka plana geçince kilitle',
              'Uygulama arka plana gidince oturum anında sonlanır; tekrar girişte doğrulama istenir',
              settings.bgLock, (v) => ref.read(settingsProvider.notifier).setBgLock(v)),
          if (Platform.isAndroid) ...[
            _switch(Icons.notifications_off_outlined, 'Gizli uygulamaların bildirimlerini engelle',
                'Kilitli + gizli uygulamaların bildirimleri gösterilmez',
                settings.notifHide, (v) async {
              await ref.read(settingsProvider.notifier).setNotifHide(v);
              await ref.read(protectionProvider.notifier).syncNative();
            }),
            _tile(Icons.settings_applications_outlined, 'Bildirim erişimi izni', 'Engelleme için sistem izni gerekir',
                () => NativeBridge.openNotificationListenerSettings()),
            _tile(Icons.accessibility_new, 'Erişilebilirlik servisi durumu', 'Kilit motorunun durumunu kontrol et',
                () => _permStatus(context)),
          ],
          _infoTile(Icons.privacy_tip_outlined, 'Platform sınırları (gerçek)',
              'Android: başka uygulamayı başlatıcıdan tamamen silmek veya onun recent apps önizlemesini '
              'değiştirmek sistem tarafından izin verilmez. iOS: diğer uygulamalara kilit yalnızca Apple '
              'Screen Time (FamilyControls) yetkisiyle mümkündür. Bu uygulama, OS\'in izin verdiği en güçlü resmi yöntemleri kullanır.',
              AppColors.textDim),

          _section('KORUMA'),
          _panicTile(context, ref),
          if (Platform.isAndroid) _deviceAdminTile(context, ref),

          _section('HAKKINDA'),
          _infoTile(Icons.shield_outlined, 'PRIVACY VAULT v0.1.0',
              'PIN/parola/desen yalnızca PBKDF2 hash olarak saklanır (Android Keystore / iOS Keychain korumalı). '
              'Kasa içeriği AES-256-GCM ile şifrelenir. Biyometrik veri uygulamaya asla ulaşmaz.',
              accent),
        ],
      ),
    );
  }

  // ---------- yardımcı yapı taşları ----------
  Widget _section(String title) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
        child: Text(title,
            style: const TextStyle(fontSize: 11, letterSpacing: 1.8, fontWeight: FontWeight.w800, color: AppColors.textDim)),
      );

  Widget _tile(IconData icon, String title, String subtitle, VoidCallback onTap) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: ListTile(
          leading: Icon(icon, color: AppColors.textDim),
          title: Text(title, style: const TextStyle(color: AppColors.text, fontSize: 14, fontWeight: FontWeight.w600)),
          subtitle: Text(subtitle, style: const TextStyle(color: AppColors.textDim, fontSize: 11)),
          trailing: const Icon(Icons.chevron_right, color: AppColors.textDim),
          onTap: onTap,
        ),
      );

  Widget _switch(IconData icon, String title, String subtitle, bool value, ValueChanged<bool> onChanged) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: SwitchListTile(
          secondary: Icon(icon, color: value ? AppColors.green : AppColors.textDim),
          title: Text(title, style: const TextStyle(color: AppColors.text, fontSize: 14, fontWeight: FontWeight.w600)),
          subtitle: Text(subtitle, style: const TextStyle(color: AppColors.textDim, fontSize: 11)),
          value: value,
          onChanged: onChanged,
        ),
      );

  Widget _dropdown<T>(IconData icon, String title, T value, Map<T, String> items, ValueChanged<T?> onChanged) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: ListTile(
          leading: Icon(icon, color: AppColors.textDim),
          title: Text(title, style: const TextStyle(color: AppColors.text, fontSize: 14, fontWeight: FontWeight.w600)),
          trailing: DropdownButton<T>(
            value: value,
            underline: const SizedBox.shrink(),
            dropdownColor: AppColors.surface2,
            items: items.entries
                .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value, style: const TextStyle(fontSize: 13))))
                .toList(),
            onChanged: onChanged,
          ),
        ),
      );

  Widget _infoTile(IconData icon, String title, String body, Color color) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w700, fontSize: 13)),
                const SizedBox(height: 4),
                Text(body, style: const TextStyle(color: AppColors.textDim, fontSize: 11, height: 1.45)),
              ]),
            ),
          ]),
        ),
      );

  Widget _accentPicker(BuildContext context, WidgetRef ref, Color current) {
    final settings = ref.watch(settingsProvider);
    Widget dot(String id, Color c) => GestureDetector(
          onTap: () => ref.read(settingsProvider.notifier).setAccent(id),
          child: Container(
            width: 34, height: 34,
            margin: const EdgeInsets.only(right: 10),
            decoration: BoxDecoration(
              color: c, shape: BoxShape.circle,
              border: Border.all(color: settings.accent == id ? Colors.white : Colors.transparent, width: 2.5),
            ),
          ),
        );
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(children: [
          const Icon(Icons.palette_outlined, color: AppColors.textDim, size: 20),
          const SizedBox(width: 12),
          const Expanded(child: Text('Vurgu rengi', style: TextStyle(color: AppColors.text, fontWeight: FontWeight.w600, fontSize: 13))),
          dot('cyan', AppColors.cyan), dot('purple', AppColors.purple), dot('green', AppColors.green),
        ]),
      ),
    );
  }

  void _toast(BuildContext context, String m) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  // ---------- FAZ 8: decoy seçici + decoy başına tetikleyici ----------
  Widget _decoyPicker(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    const items = [
      (DecoyKind.calculator, Icons.calculate_outlined),
      (DecoyKind.notes, Icons.note_alt_outlined),
      (DecoyKind.clock, Icons.schedule),
      (DecoyKind.weather, Icons.wb_sunny_outlined),
    ];
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Row(children: [
            Icon(Icons.layers_outlined, color: AppColors.textDim, size: 20),
            SizedBox(width: 12),
            Text('Decoy kimliği', style: TextStyle(color: AppColors.text, fontWeight: FontWeight.w600, fontSize: 13)),
          ]),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final (kind, icon) in items)
                ChoiceChip(
                  avatar: Icon(icon, size: 16),
                  label: Text(kind.tr, style: const TextStyle(fontSize: 12)),
                  selected: settings.decoyKind == kind.name,
                  onSelected: (_) => ref.read(settingsProvider.notifier).setDecoyKind(kind.name),
                ),
            ],
          ),
          const SizedBox(height: 8),
          const Text('Her kimliğin kendi gizli tetikleyicisi vardır.',
              style: TextStyle(color: AppColors.textDim, fontSize: 11)),
        ]),
      ),
    );
  }

  Widget _triggerTile(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    final kind = settings.decoyKind;
    return FutureBuilder<bool>(
      future: ref.read(authProvider.notifier).hasDecoyTrigger(kind),
      builder: (context, snap) {
        final has = snap.data ?? false;
        return _tile(
          Icons.bolt,
          '${DecoyKindX.parse(kind).tr} tetikleyicisi',
          has ? 'Tanımlı ✓ — değiştirmek için dokun (hash saklanır)' : TriggerNorm.hint(kind),
          () => _editTrigger(context, ref, kind),
        );
      },
    );
  }

  // ---------- FAZ 10: tetikleyici sonrası doğrulama seviyesi ----------
  Widget _vaultAuthModeDropdown(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    final mode = VaultAuthModeX.parse(settings.vaultAuthMode);
    final items = {
      for (final m in VaultAuthMode.values) m: m.tr,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _dropdown<VaultAuthMode>(
          Icons.fact_check_outlined,
          'Gizli açılış sonrası doğrulama',
          mode,
          items,
          (v) async {
            if (v == null) return;
            // Kayıtlı olmayan yönteme geçişte dürüst uyarı (yine de seçilebilir → kullanım anında PIN'e düşer).
            final auth = ref.read(authProvider.notifier);
            if (v == VaultAuthMode.pattern && !await auth.hasPattern()) {
              if (context.mounted) _toast(context, 'Not: desen henüz oluşturulmadı — kullanımda PIN istenir');
            }
            if (v == VaultAuthMode.password && !await auth.hasPassword()) {
              if (context.mounted) _toast(context, 'Not: parola henüz oluşturulmadı — kullanımda PIN istenir');
            }
            await ref.read(settingsProvider.notifier).setVaultAuthMode(v.name);
          },
        ),
        if (vaultAuthNeedsWeakWarning(mode))
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              color: AppColors.red.withValues(alpha: 0.08),
              child: const Padding(
                padding: EdgeInsets.all(12),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Icon(Icons.warning_amber_outlined, color: AppColors.red, size: 18),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'ZAYIF GÜVENLİK: yalnızca tetikleyici. Tetikleyici gizli bir sır olsa da '
                      'tahmin edilebilir/gözlenebilir. Kasa için ikinci faktör (PIN, Desen, Parola, '
                      'Biyometrik — önerilen: Biyometrik + PIN) ekle.',
                      style: TextStyle(color: AppColors.red, fontSize: 11, height: 1.45),
                    ),
                  ),
                ]),
              ),
            ),
          ),
      ],
    );
  }

  // ---------- FAZ 10: uygulama kimliği & görünüm (başlatıcı) ----------
  Widget _identityTile(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    final id = launcherIdentityFor(settings.launcherIdentity);
    return _tile(
      Icons.badge_outlined,
      'Uygulama kimliği & görünüm',
      Platform.isAndroid
          ? 'Şu an: ${id.label} — başlatıcı simgesi ve adı değişir (activity-alias)'
          : 'iOS: yalnızca alternatif SİMGE mümkündür; uygulama adı Apple politikası gereği değişmez',
      () => _identityPicker(context, ref),
    );
  }

  Future<void> _identityPicker(BuildContext context, WidgetRef ref) async {
    final current = launcherIdentityFor(ref.read(settingsProvider).launcherIdentity);
    final picked = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Başlatıcı kimliği', style: TextStyle(color: AppColors.text, fontSize: 16)),
        children: [
          for (final id in kLauncherIdentities)
            ListTile(
              onTap: () => Navigator.pop(ctx, id.id),
              leading: Icon(
                id.id == current.id ? Icons.radio_button_checked : Icons.radio_button_off,
                color: id.id == current.id ? AppColors.cyan : AppColors.textDim,
                size: 20,
              ),
              title: Text(id.label, style: const TextStyle(color: AppColors.text, fontSize: 14)),
              subtitle: Text(
                id.id == 'default'
                    ? 'Varsayılan görünüm'
                    : '${id.decoy.tr} kimliği — simge ve ad değişir',
                style: const TextStyle(color: AppColors.textDim, fontSize: 11),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 14),
            child: Text(
              Platform.isAndroid
                  ? 'Resmi activity-alias mekanizması kullanılır. Bazı başlatıcılar simge önbelleği '
                      'tutar; değişim başlatıcının yenilenmesini veya cihaz yeniden başlatmayı gerektirebilir. '
                      'Uygulamayı bulamazsan işlevsel davranış aynı kalır.'
                  : 'iOS: uygulama ADI değiştirilemez. Alternatif simge yalnızca geliştirici hesabıyla '
                      'yapılandırılmış kurulumlarda çalışır; AltStore imzasında simge desteği garanti değildir.',
              style: const TextStyle(color: AppColors.textDim, fontSize: 11, height: 1.45),
            ),
          ),
        ],
      ),
    );
    if (picked == null || picked == current.id) return;
    if (!context.mounted) return;
    // onay: kimlik değişince başlatıcıdaki simge/ad değişir — bilinçli seçim şart
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text('“${launcherIdentityFor(picked).label}” kimliğine geçilsin mi?',
            style: const TextStyle(color: AppColors.text, fontSize: 16)),
        content: const Text(
          'Başlatıcıdaki uygulama simgesi ve adı değişecek. Geri almak için bu ekrana '
          'uygulama içinden tekrar girebilirsin.',
          style: TextStyle(color: AppColors.textDim, fontSize: 13, height: 1.4),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Vazgeç')),
          TextButton(onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Uygula', style: TextStyle(color: AppColors.cyan))),
        ],
      ),
    );
    if (ok != true) return;
    final applied = await NativeBridge.setLauncherIdentity(picked);
    if (!context.mounted) return;
    if (applied) {
      await ref.read(settingsProvider.notifier).setLauncherIdentity(picked);
      if (context.mounted) _toast(context, 'Kimlik uygulandı: ${launcherIdentityFor(picked).label}');
    } else {
      _toast(context, Platform.isAndroid
          ? 'Kimlik uygulanamadı — sistem reddetti'
          : 'Bu kurulumda alternatif simge kullanılamıyor (iOS yapılandırması gerekli)');
    }
  }

  // ---------- FAZ 10: panik kilit tile ----------
  Widget _panicTile(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: const Icon(Icons.flash_on, color: AppColors.red),
        title: const Text('Anında kilitle', style: TextStyle(color: AppColors.text, fontSize: 14, fontWeight: FontWeight.w600)),
        subtitle: const Text(
          'Tüm oturumları tek dokunuşla sonlandırır (veri silinmez). Güvenlik Merkezi üst çubuğunda da vardır.',
          style: TextStyle(color: AppColors.textDim, fontSize: 11),
        ),
        trailing: FilledButton.tonal(
          onPressed: () => PanicLock.engage(context, ref),
          child: const Text('Kilitle'),
        ),
      ),
    );
  }

  // ---------- FAZ 10: kaldırmaya karşı koruma (Device Admin) ----------
  Widget _deviceAdminTile(BuildContext context, WidgetRef ref) =>
      _DeviceAdminTile(onVerify: (t) => _verifyGate(context, ref, t), onToast: (m) => _toast(context, m));

  // ---------- akışlar ----------
  Future<void> _changePin(BuildContext context, WidgetRef ref) async {
    final ok = await _verifyGate(context, ref, 'Mevcut PIN ile doğrula');
    if (ok != true) return;
    if (!context.mounted) return;
    final newPin = await _pinWizard(context, 'Yeni PIN oluştur');
    if (newPin == null) return;
    await ref.read(authProvider.notifier).enrollPin(newPin);
    await ref.read(protectionProvider.notifier).syncNative();
    if (context.mounted) _toast(context, 'PIN güncellendi');
  }

  Future<void> _changePassword(BuildContext context, WidgetRef ref) async {
    final ok = await _verifyGate(context, ref, 'Devam etmek için PIN ile doğrula');
    if (ok != true) return;
    if (!context.mounted) return;
    final ctrl = TextEditingController();
    final saved = await _dialog<String>(
      context,
      title: 'Parola oluştur',
      body: TextField(
        controller: ctrl,
        obscureText: true,
        decoration: const InputDecoration(hintText: 'En az 4 karakter (ASCII)'),
      ),
      onOk: () => ctrl.text.length >= 4 ? ctrl.text : null,
    );
    if (saved == null) return;
    await ref.read(authProvider.notifier).enrollPassword(saved);
    await ref.read(protectionProvider.notifier).syncNative();
    if (context.mounted) _toast(context, 'Parola etkinleştirildi — giriş ekranından seçebilirsin');
  }

  Future<void> _changePattern(BuildContext context, WidgetRef ref) async {
    final ok = await _verifyGate(context, ref, 'Devam etmek için PIN ile doğrula');
    if (ok != true) return;
    if (!context.mounted) return;
    List<int> first = [];
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          backgroundColor: AppColors.surface,
          title: const Text('Desen oluştur', style: TextStyle(color: AppColors.text, fontSize: 16)),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            const Text('En az 4 nokta seç', style: TextStyle(color: AppColors.textDim, fontSize: 12)),
            const SizedBox(height: 12),
            PatternPad(value: first, onChanged: (v) => setS(() => first = v)),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Vazgeç')),
            TextButton(
                onPressed: first.length >= 4 ? () => Navigator.pop(ctx, true) : null, child: const Text('Kaydet')),
          ],
        ),
      ),
    );
    if (saved != true) return;
    await ref.read(authProvider.notifier).enrollPattern(first.join('-'));
    await ref.read(protectionProvider.notifier).syncNative();
    if (context.mounted) _toast(context, 'Desen etkinleştirildi');
  }

  Future<void> _toggleBio(BuildContext context, WidgetRef ref, bool v) async {
    if (v) {
      final available = await ref.read(authProvider.notifier).biometricsAvailable();
      if (!available) {
        if (context.mounted) _toast(context, 'Bu cihazda kullanılabilir biyometrik yok');
        return;
      }
      final ok = await ref.read(authProvider.notifier).authenticateBiometric('Biyometrik girişi doğrula');
      if (!ok) return;
    }
    await ref.read(settingsProvider.notifier).setBiometricEntry(v);
  }

  Future<void> _toggleStealth(BuildContext context, WidgetRef ref, bool v) async {
    final kind = ref.read(settingsProvider).decoyKind;
    if (v && !(await ref.read(authProvider.notifier).hasDecoyTrigger(kind))) {
      if (context.mounted) _toast(context, 'Önce ${DecoyKindX.parse(kind).tr} için gizli tetikleyici oluştur');
      return;
    }
    await ref.read(settingsProvider.notifier).setStealthVault(v);
  }

  Future<void> _editTrigger(BuildContext context, WidgetRef ref, String kind) async {
    final ctrl = TextEditingController();
    var invalid = false;
    final saved = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          backgroundColor: AppColors.surface,
          title: Text('${DecoyKindX.parse(kind).tr} — gizli tetikleyici',
              style: const TextStyle(color: AppColors.text, fontSize: 16)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(TriggerNorm.hint(kind),
                  style: const TextStyle(color: AppColors.textDim, fontSize: 12, height: 1.4)),
              const SizedBox(height: 12),
              TextField(
                controller: ctrl,
                decoration: InputDecoration(
                  hintText: 'Tetikleyici',
                  errorText: invalid ? 'Bu format geçersiz' : null,
                ),
                onChanged: (_) => setS(() => invalid = false),
              ),
            ],
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Vazgeç')),
            TextButton(
              onPressed: () {
                final raw = ctrl.text;
                if (!TriggerNorm.isValid(kind, raw)) {
                  setS(() => invalid = true);
                  return;
                }
                Navigator.pop(ctx, TriggerNorm.normalize(kind, raw));
              },
              child: const Text('Kaydet'),
            ),
          ],
        ),
      ),
    );
    if (saved == null) return;
    await ref.read(authProvider.notifier).enrollDecoyTrigger(kind, saved);
    if (context.mounted) _toast(context, 'Tetikleyici kaydedildi (hash olarak saklanır)');
  }

  Future<void> _changeRecovery(BuildContext context, WidgetRef ref) async {
    final ok = await _recoveryDialog(context, ref, 'Mevcut kurtarma sembolünü gir');
    if (!ok) return;
    if (!context.mounted) return;
    List<String> first = [];
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          backgroundColor: AppColors.surface,
          title: const Text('Yeni kurtarma sembolü', style: TextStyle(color: AppColors.text, fontSize: 16)),
          content: SymbolPad(value: first, onChanged: (v) => setS(() => first = v)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Vazgeç')),
            TextButton(
                onPressed: first.length >= 3 ? () => Navigator.pop(ctx, true) : null, child: const Text('Kaydet')),
          ],
        ),
      ),
    );
    if (saved != true) return;
    await ref.read(authProvider.notifier).enrollRecovery(first.join());
    await ref.read(protectionProvider.notifier).syncNative();
    if (context.mounted) _toast(context, 'Kurtarma sembolü güncellendi');
  }

  Future<void> _testRecovery(BuildContext context, WidgetRef ref) async {
    final ok = await _recoveryDialog(context, ref, 'Kurtarma sembolünü gir');
    if (context.mounted) _toast(context, ok ? 'Sembol çalışıyor ✓' : 'Sembol doğrulanamadı');
  }

  Future<bool> _recoveryDialog(BuildContext context, WidgetRef ref, String title) async {
    List<String> current = [];
    final auth = ref.read(authProvider.notifier);
    final res = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          backgroundColor: AppColors.surface,
          title: Text(title, style: const TextStyle(color: AppColors.text, fontSize: 16)),
          content: SymbolPad(value: current, onChanged: (v) => setS(() => current = v)),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Vazgeç')),
            TextButton(
              onPressed: current.length >= 3
                  ? () async {
                      final ok = await auth.verifyRecovery(current.join());
                      if (ctx.mounted) Navigator.pop(ctx, ok);
                    }
                  : null,
              child: const Text('Doğrula'),
            ),
          ],
        ),
      ),
    );
    return res ?? false;
  }

  Future<bool?> _verifyGate(BuildContext context, WidgetRef ref, String title) async {
    final auth = ref.read(authProvider.notifier);
    String pin = '';
    return showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          backgroundColor: AppColors.surface,
          title: Text(title, style: const TextStyle(color: AppColors.text, fontSize: 16)),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            PinDots(filled: pin.length, total: 6),
            const SizedBox(height: 12),
            PinPad(
              value: pin,
              onChanged: (v) => setS(() => pin = v),
              onSubmit: () async {
                final res = await auth.verifyPin(pin);
                if (ctx.mounted) Navigator.pop(ctx, res == AuthResult.ok);
              },
            ),
          ]),
        ),
      ),
    );
  }

  Future<String?> _pinWizard(BuildContext context, String title) async {
    String first = '';
    String confirm = '';
    int phase = 0;
    return showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          backgroundColor: AppColors.surface,
          title: Text(phase == 0 ? title : 'Yeni PIN\'i doğrula',
              style: const TextStyle(color: AppColors.text, fontSize: 16)),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            PinDots(filled: (phase == 0 ? first : confirm).length, total: 6),
            const SizedBox(height: 12),
            PinPad(
              value: phase == 0 ? first : confirm,
              onChanged: (v) => setS(() => phase == 0 ? first = v : confirm = v),
              onSubmit: () {
                if (phase == 0) {
                  setS(() => phase = 1);
                } else if (first == confirm) {
                  Navigator.pop(ctx, first);
                } else {
                  Navigator.pop(ctx, null);
                }
              },
            ),
          ]),
        ),
      ),
    );
  }

  Future<T?> _dialog<T>(BuildContext context, {required String title, required Widget body, required T? Function() onOk}) {
    return showDialog<T>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: Text(title, style: const TextStyle(color: AppColors.text, fontSize: 16)),
        content: body,
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Vazgeç')),
          TextButton(
            onPressed: () {
              final v = onOk();
              if (v != null) Navigator.pop(ctx, v);
            },
            child: const Text('Kaydet'),
          ),
        ],
      ),
    );
  }

  Future<void> _permStatus(BuildContext context) async {
    final acc = await NativeBridge.isAccessibilityEnabled();
    final ov = await NativeBridge.canDrawOverlays();
    if (!context.mounted) return;
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Koruma durumu', style: TextStyle(color: AppColors.text, fontSize: 16)),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${acc ? "✅" : "❌"} Erişilebilirlik servisi ${acc ? "aktif" : "kapalı"}',
              style: const TextStyle(color: AppColors.text)),
          const SizedBox(height: 6),
          Text('${ov ? "✅" : "❌"} Üzerine çizim izni ${ov ? "verildi" : "verilmedi"}',
              style: const TextStyle(color: AppColors.text)),
        ]),
        actions: [
          if (!acc)
            TextButton(onPressed: () => NativeBridge.openAccessibilitySettings(), child: const Text('Ayarları aç')),
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Kapat')),
        ],
      ),
    );
  }
}

/// FAZ 11 — Device Admin kartı: durumu her "resumed" olayında tazeler
/// (IndexedStack içindeki sekme unmount olmadığı için FutureBuilder zamanla
/// bayatlıyordu; bu kart kendi yaşam döngüsü gözlemcisini taşır).
class _DeviceAdminTile extends StatefulWidget {
  final Future<bool?> Function(String title) onVerify;
  final void Function(String message) onToast;
  const _DeviceAdminTile({required this.onVerify, required this.onToast});

  @override
  State<_DeviceAdminTile> createState() => _DeviceAdminTileState();
}

class _DeviceAdminTileState extends State<_DeviceAdminTile> with WidgetsBindingObserver {
  bool? _active;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    final v = await NativeBridge.isDeviceAdminActive();
    if (mounted) setState(() => _active = v);
  }

  @override
  Widget build(BuildContext context) {
    final active = _active ?? false;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.admin_panel_settings_outlined,
                color: active ? AppColors.green : AppColors.textDim, size: 20),
            const SizedBox(width: 12),
            const Expanded(
              child: Text('Kaldırmaya karşı koruma',
                  style: TextStyle(color: AppColors.text, fontWeight: FontWeight.w700, fontSize: 13)),
            ),
            Text(active ? 'ETKİN' : 'Kapalı',
                style: TextStyle(
                    color: active ? AppColors.green : AppColors.textDim,
                    fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1)),
          ]),
          const SizedBox(height: 6),
          const Text(
            'Resmi Android Device Admin API’si. Etkinken uygulamanın kaldırılması, koruma '
            'kapatılana dek sistem tarafından engellenir. Hiçbir ek politika uygulanmaz; '
            'istediğin an buradan veya sistem “Cihaz yönetici uygulamalar” ekranından geri alabilirsin. '
            'iOS bu özelliği desteklemez.',
            style: TextStyle(color: AppColors.textDim, fontSize: 11, height: 1.45),
          ),
          const SizedBox(height: 10),
          Row(children: [
            if (!active)
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    await NativeBridge.requestDeviceAdmin();
                    // sistem diyaloğundan dönüşte resumed → otomatik tazelenir
                    await Future<void>.delayed(const Duration(milliseconds: 600));
                    await _refresh();
                  },
                  icon: const Icon(Icons.shield_outlined, size: 16),
                  label: const Text('Sistem izni ile etkinleştir'),
                ),
              )
            else
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final ok = await widget.onVerify('Korumayı kapatmak için PIN ile doğrula');
                    if (ok == true) {
                      await NativeBridge.removeDeviceAdmin();
                      await _refresh();
                      widget.onToast('Kaldırma koruması kapatıldı');
                    }
                  },
                  icon: const Icon(Icons.remove_moderator_outlined, size: 16),
                  label: const Text('Korumayı kapat (PIN gerekir)'),
                ),
              ),
          ]),
        ]),
      ),
    );
  }
}
