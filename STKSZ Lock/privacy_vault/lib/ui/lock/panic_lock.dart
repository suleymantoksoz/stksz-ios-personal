import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../services/auth_service.dart';
import '../../services/security_log_service.dart';

/// FAZ 10 — PANİK / ANINDA KİLİT.
/// Tek dokunuşla oturum sonlandırılır: uygulama LockGate'e, kasa girişi
/// doğrulama ekranına geri döner. VERİ SİLME YOK — yalnızca bellek içi
/// oturum bayrağı düşürülür (kilit/şifreleme durumu zaten kalıcı).
class PanicLock {
  PanicLock._();

  static Future<void> engage(BuildContext context, WidgetRef ref) async {
    final wasUnlocked = ref.read(appUnlockedProvider);
    ref.read(appUnlockedProvider.notifier).state = false;
    await ref.read(securityLogProvider.notifier).add('panicLock', 'Tek dokunuşla anında kilit');
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(wasUnlocked
            ? 'Her şey kilitlendi — yeniden girmek için doğrula'
            : 'Oturum zaten kilitli'),
      ));
    }
  }
}
