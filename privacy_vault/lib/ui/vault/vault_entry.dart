import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../models/models.dart';
import '../../services/app_settings.dart';
import '../../services/auth_service.dart';
import '../../services/security_log_service.dart';
import '../../services/security_policies.dart';
import '../decoy/decoy_engine.dart';
import '../lock/pads.dart';
import 'vault_screen.dart';

/// Gizli Kasa sekmesi:
/// - Gizli mod AÇIKSA: önce seçilen decoy kimliği açılır, tetikleyici girilince doğrulama → kasa.
/// - Gizli mod KAPALIYSA: doğrudan doğrulama → kasa.
/// FAZ 10: tetikleyici SONRASI doğrulama seviyesi kullanıcı seçimli (PIN/Desen/Parola/
/// Biyometrik/Bio+PIN). "Yalnızca tetikleyici" modu desteklenir ama ZAYIF olarak işaretlenir.
class VaultEntry extends ConsumerStatefulWidget {
  const VaultEntry({super.key});

  @override
  ConsumerState<VaultEntry> createState() => _VaultEntryState();
}

class _VaultEntryState extends ConsumerState<VaultEntry> {
  bool _granted = false;

  Future<void> _openAuth() async {
    var mode = VaultAuthModeX.parse(ref.read(settingsProvider).vaultAuthMode);

    // Seçilen yöntem kayıtlı/kullanılabilir değilse DÜRÜST düşüş: PIN.
    final auth = ref.read(authProvider.notifier);
    String? fallbackNote;
    if (mode == VaultAuthMode.pattern && !await auth.hasPattern()) {
      mode = VaultAuthMode.pin;
      fallbackNote = 'Desen oluşturulmamış — PIN ile devam';
    } else if (mode == VaultAuthMode.password && !await auth.hasPassword()) {
      mode = VaultAuthMode.pin;
      fallbackNote = 'Parola oluşturulmamış — PIN ile devam';
    } else if ((mode == VaultAuthMode.biometric || mode == VaultAuthMode.bioPin) &&
        !await auth.biometricsAvailable()) {
      mode = VaultAuthMode.pin;
      fallbackNote = 'Biyometrik kullanılamıyor — PIN ile devam';
    }
    if (!mounted) return;
    if (fallbackNote != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(fallbackNote)));
    }

    // Zayıf mod: yalnızca tetikleyici. Kullanıcı Ayarlar'da açıkça uyarılır;
    // burada da üstelik bilgi çubuğu çıkar (dürüstlük).
    if (vaultAuthNeedsWeakWarning(mode)) {
      if (!mounted) return;
      setState(() => _granted = true);
      await ref.read(securityLogProvider.notifier).add('vaultOpened', 'tetikleyici (zayıf mod)');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Zayıf güvenlik modu etkin — Ayarlar > Decoy & Kimlik bölümünden '
                'ikinci faktör (PIN/Desen/Parola/Biyometrik) eklemen önerilir')));
      }
      return;
    }

    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _VaultAuthDialog(mode: mode),
    );
    if (ok == true && mounted) {
      setState(() => _granted = true);
      await ref.read(securityLogProvider.notifier).add('vaultOpened', mode.tr);
    }
  }

  @override
  Widget build(BuildContext context) {
    // FAZ 10: panik kilit / arka plan kilidi oturumu düşürünce kasa da kapanır.
    ref.listen<bool>(appUnlockedProvider, (prev, next) {
      if (next == false && _granted && mounted) setState(() => _granted = false);
    });

    final settings = ref.watch(settingsProvider);
    if (_granted) {
      return const VaultScreen();
    }
    if (settings.stealthVault) {
      // FAZ 8 — Decoy Engine: seçilen kimliği inşa eder (hesap makinesi /
      // not defteri / saat / hava durumu). Arayüzde "şifre" ibaresi YOK.
      return DecoyHost(kind: DecoyKindX.parse(settings.decoyKind), onTrigger: _openAuth);
    }
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.inventory_2_outlined, size: 64, color: AppColors.purple),
            const SizedBox(height: 14),
            const Text('GİZLİ KASA', style: TextStyle(letterSpacing: 2.4, fontWeight: FontWeight.w800, color: AppColors.text)),
            const SizedBox(height: 8),
            const Text('İçerik AES-256 ile şifrelenir', style: TextStyle(color: AppColors.textDim, fontSize: 12)),
            const SizedBox(height: 22),
            ElevatedButton.icon(
              onPressed: _openAuth,
              icon: const Icon(Icons.lock_open, size: 18),
              label: const Text('Kasayı Aç'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Kasa erişim doğrulaması — seviyesi Ayarlar > Decoy & Kimlik bölümünden gelir.
/// Yeni ayrı bir kimlik sistemi YOK: mevcut AuthService (3-hak → SECURITY LOCKED) kullanılır.
class _VaultAuthDialog extends ConsumerStatefulWidget {
  final VaultAuthMode mode;
  const _VaultAuthDialog({required this.mode});

  @override
  ConsumerState<_VaultAuthDialog> createState() => _VaultAuthDialogState();
}

class _VaultAuthDialogState extends ConsumerState<_VaultAuthDialog> {
  String _pin = '';
  List<int> _pattern = [];
  final _passCtrl = TextEditingController();
  bool _busy = false;
  bool _bioFailed = false;

  @override
  void initState() {
    super.initState();
    if (widget.mode == VaultAuthMode.biometric || widget.mode == VaultAuthMode.bioPin) _bio();
  }

  @override
  void dispose() {
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _bio() async {
    if (_busy) return;
    _busy = true;
    final ok = await ref.read(authProvider.notifier).authenticateBiometric('Gizli Kasayı aç');
    _busy = false;
    if (!mounted) return;
    if (ok) {
      Navigator.pop(context, true);
    } else {
      // biyometrik olmadı → yedek: PIN (mümkünse)
      setState(() => _bioFailed = true);
    }
  }

  Future<void> _handle(AuthResult res) async {
    if (!mounted) return;
    if (res == AuthResult.ok) {
      Navigator.pop(context, true);
    } else {
      setState(() {
        _pin = '';
        _pattern = [];
      });
      _passCtrl.clear();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(res == AuthResult.lockedOut ? 'SECURITY LOCKED — kurtarma sembolü gerekli' : 'Doğrulama başarısız')));
      if (res == AuthResult.lockedOut) Navigator.pop(context, false);
    }
  }

  Future<void> _submitPin() async => _handle(await ref.read(authProvider.notifier).verifyPin(_pin));
  Future<void> _submitPassword() async => _handle(await ref.read(authProvider.notifier).verifyPassword(_passCtrl.text));
  Future<void> _submitPattern() async {
    if (_pattern.length < 4) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Desen en az 4 nokta içermeli')));
      return;
    }
    await _handle(await ref.read(authProvider.notifier).verifyPattern(_pattern.join('-')));
  }

  bool get _usesBio =>
      widget.mode == VaultAuthMode.biometric || widget.mode == VaultAuthMode.bioPin;

  bool get _showPinPad {
    if (widget.mode == VaultAuthMode.pin) return true;
    if (widget.mode == VaultAuthMode.bioPin) return true; // bio başarısızsa doğal yedek
    if (widget.mode == VaultAuthMode.biometric && _bioFailed) return true;
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppColors.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      // FAZ 11: klavye açıldığında parola alanının taşması engellenir.
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
            Text('Doğrulama — ${widget.mode.tr.replaceFirst('Tetikleyici + ', '')}',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.text)),
            const SizedBox(height: 16),

            if (widget.mode == VaultAuthMode.pattern) ...[
              PatternPad(value: _pattern, onChanged: (v) => setState(() => _pattern = v)),
              const SizedBox(height: 8),
              ElevatedButton(onPressed: _submitPattern, child: const Text('Onayla')),
            ] else if (widget.mode == VaultAuthMode.password) ...[
              TextField(
                controller: _passCtrl,
                obscureText: true,
                onSubmitted: (_) => _submitPassword(),
                decoration: const InputDecoration(hintText: 'Parola'),
              ),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: _submitPassword, child: const Text('Doğrula')),
            ] else if (_showPinPad) ...[
              if (widget.mode == VaultAuthMode.biometric && _bioFailed)
                const Padding(
                  padding: EdgeInsets.only(bottom: 10),
                  child: Text('Biyometrik açılamadı — PIN ile devam et',
                      style: TextStyle(color: AppColors.textDim, fontSize: 12)),
                ),
              PinDots(filled: _pin.length, total: 6),
              const SizedBox(height: 14),
              PinPad(value: _pin, onChanged: (v) => setState(() => _pin = v), onSubmit: _submitPin),
            ] else if (_usesBio) ...[
              const Icon(Icons.fingerprint, size: 44, color: AppColors.cyan),
              const SizedBox(height: 10),
              const Text('Biyometrik doğrulama bekleniyor…', style: TextStyle(color: AppColors.textDim, fontSize: 12)),
              TextButton(onPressed: _busy ? null : _bio, child: const Text('Tekrar dene')),
            ] else
              ...[],
            const SizedBox(height: 4),
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Vazgeç', style: TextStyle(color: AppColors.textDim)),
            ),
          ],
        ),
      ),
    ),
    );
  }
}
