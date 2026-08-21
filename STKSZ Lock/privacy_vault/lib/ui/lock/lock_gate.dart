import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../services/app_settings.dart';
import '../../services/auth_service.dart';
import '../../services/security_log_service.dart';
import '../../services/security_policies.dart';
import 'pads.dart';

/// Uygulamanın ana güvenlik geçidi. PIN / Desen / Parola / Biyometrik destekler.
/// 3 hatalı girişte SECURITY LOCKED → yalnızca kurtarma sembolü açar.
class LockGate extends ConsumerStatefulWidget {
  final Widget child;
  const LockGate({super.key, required this.child});

  @override
  ConsumerState<LockGate> createState() => _LockGateState();
}

class _LockGateState extends ConsumerState<LockGate> with WidgetsBindingObserver {
  String _pin = '';
  List<int> _pattern = [];
  List<String> _symbols = [];
  final _passwordCtrl = TextEditingController();
  String _alt = 'pin'; // pin | password | pattern
  DateTime? _pausedAt;
  Timer? _bioKick;
  bool _bioInFlight = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _alt = ref.read(settingsProvider).masterAlt;
    // native kilit ekranından biriken olayları güvenlik merkezine aktar
    Future.microtask(() => ref.read(securityLogProvider.notifier).drainNative());
    // açılışta biyometrik istemi (etkinse)
    _bioKick = Timer(const Duration(milliseconds: 400), _tryBio);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _bioKick?.cancel();
    _passwordCtrl.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final settings = ref.read(settingsProvider);
    if (state == AppLifecycleState.paused || state == AppLifecycleState.inactive) {
      _pausedAt = DateTime.now();
      // FAZ 10 — "Arka plana geçince kilitle": politikası pure katmanda (security_policies).
      if (shouldRelockOnBackground(
          bgLockEnabled: settings.bgLock, sessionUnlocked: ref.read(appUnlockedProvider))) {
        ref.read(appUnlockedProvider.notifier).state = false;
        ref.read(securityLogProvider.notifier).add('backgroundLock', 'Uygulama arka plana geçti');
      } else if (settings.autoLockSec == 0) {
        ref.read(appUnlockedProvider.notifier).state = false;
      }
    } else if (state == AppLifecycleState.resumed) {
      final paused = _pausedAt;
      if (paused != null &&
          settings.autoLockSec > 0 &&
          DateTime.now().difference(paused).inSeconds >= settings.autoLockSec) {
        ref.read(appUnlockedProvider.notifier).state = false;
      }
      // native olayları tekrar drenajla
      ref.read(securityLogProvider.notifier).drainNative();
    }
  }

  Future<void> _tryBio() async {
    if (_bioInFlight) return;
    final settings = ref.read(settingsProvider);
    if (!settings.biometricEntry) return;
    if (ref.read(authProvider).lockedOut) return;
    _bioInFlight = true;
    final ok = await ref.read(authProvider.notifier).authenticateBiometric('Privacy Vault kilidini aç');
    _bioInFlight = false;
    if (ok && mounted) ref.read(appUnlockedProvider.notifier).state = true;
  }

  Future<void> _submitPin() async {
    final res = await ref.read(authProvider.notifier).verifyPin(_pin);
    await _handle(res);
    if (res != AuthResult.ok) setState(() => _pin = '');
  }

  Future<void> _submitPassword() async {
    final res = await ref.read(authProvider.notifier).verifyPassword(_passwordCtrl.text);
    await _handle(res);
    _passwordCtrl.clear();
  }

  Future<void> _submitPattern() async {
    if (_pattern.length < 4) {
      _snack('Desen en az 4 nokta içermeli');
      return;
    }
    final res = await ref.read(authProvider.notifier).verifyPattern(_pattern.join('-'));
    await _handle(res);
    if (res != AuthResult.ok) setState(() => _pattern = []);
  }

  Future<void> _submitRecovery() async {
    if (_symbols.length < 3) {
      _snack('Kurtarma sembolü en az 3 adımdan oluşur');
      return;
    }
    final ok = await ref.read(authProvider.notifier).verifyRecovery(_symbols.join(''));
    if (ok) {
      _snack('Kilit sıfırlandı — şimdi doğrulama yapabilirsin');
      setState(() => _symbols = []);
    } else {
      _snack('Sembol doğrulanamadı');
      setState(() => _symbols = []);
    }
  }

  Future<void> _handle(AuthResult res) async {
    if (res == AuthResult.ok) {
      ref.read(appUnlockedProvider.notifier).state = true;
    } else if (res == AuthResult.lockedOut) {
      setState(() {});
      _snack('SECURITY LOCKED — 3 hatalı giriş');
    }
  }

  void _snack(String msg) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  @override
  Widget build(BuildContext context) {
    final unlocked = ref.watch(appUnlockedProvider);
    if (unlocked) return widget.child;

    final auth = ref.watch(authProvider);
    final accent = Theme.of(context).colorScheme.primary;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 74,
                  height: 74,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: AppColors.surface2,
                    border: Border.all(color: auth.lockedOut ? AppColors.red : accent, width: 1.4),
                  ),
                  child: Icon(
                    auth.lockedOut ? Icons.gpp_bad_outlined : Icons.shield_outlined,
                    color: auth.lockedOut ? AppColors.red : accent,
                    size: 34,
                  ),
                ),
                const SizedBox(height: 14),
                const Text('PRIVACY VAULT',
                    style: TextStyle(letterSpacing: 3, fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.text)),
                const SizedBox(height: 6),
                Text(
                  auth.lockedOut
                      ? 'SECURITY LOCKED\nKurtarma sembolünü gir'
                      : 'Devam etmek için doğrula • ${auth.attemptsLeft} hak',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: auth.lockedOut ? AppColors.red : AppColors.textDim, fontSize: 13),
                ),
                const SizedBox(height: 26),
                if (auth.lockedOut) ...[
                  SymbolPad(value: _symbols, onChanged: (v) => setState(() => _symbols = v)),
                  const SizedBox(height: 16),
                  ElevatedButton(onPressed: _submitRecovery, child: const Text('Kilidi Sıfırla')),
                ] else ...[
                  _methodSwitcher(),
                  const SizedBox(height: 18),
                  if (_alt == 'pin') ...[
                    PinDots(filled: _pin.length, total: 6),
                    const SizedBox(height: 20),
                    PinPad(value: _pin, onChanged: (v) => setState(() => _pin = v), onSubmit: _submitPin),
                  ] else if (_alt == 'password') ...[
                    TextField(
                      controller: _passwordCtrl,
                      obscureText: true,
                      onSubmitted: (_) => _submitPassword(),
                      decoration: const InputDecoration(hintText: 'Parola'),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(onPressed: _submitPassword, child: const Text('Doğrula')),
                  ] else ...[
                    PatternPad(value: _pattern, onChanged: (v) => setState(() => _pattern = v)),
                    const SizedBox(height: 8),
                    ElevatedButton(onPressed: _submitPattern, child: const Text('Onayla')),
                  ],
                  const SizedBox(height: 16),
                  IconButton(
                    tooltip: 'Biyometrik',
                    onPressed: _tryBio,
                    icon: Icon(Icons.fingerprint, size: 42, color: accent),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _methodSwitcher() {
    final auth = ref.read(authProvider.notifier);
    return FutureBuilder<List<bool>>(
      future: Future.wait([auth.hasPassword(), auth.hasPattern()]),
      builder: (context, snap) {
        final hasPw = snap.data?[0] ?? false;
        final hasPattern = snap.data?[1] ?? false;
        Widget chip(String id, IconData icon, String label, bool visible) => !visible
            ? const SizedBox.shrink()
            : Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: ChoiceChip(
                  avatar: Icon(icon, size: 16),
                  label: Text(label, style: const TextStyle(fontSize: 12)),
                  selected: _alt == id,
                  onSelected: (_) => setState(() => _alt = id),
                ),
              );
        return Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            chip('pin', Icons.dialpad, 'PIN', true),
            chip('password', Icons.password, 'Parola', hasPw),
            chip('pattern', Icons.pattern, 'Desen', hasPattern),
          ],
        );
      },
    );
  }
}
