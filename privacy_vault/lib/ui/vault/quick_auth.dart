import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../services/app_settings.dart';
import '../../services/auth_service.dart';
import '../lock/pads.dart';

/// FAZ 9 — Korumalı kasa işlemleri (dışa aktarım) için hızlı doğrulama.
/// Mevcut tek doğrulama sistemini kullanır: biyometrik (açıksa) + mevcut PIN.
/// Yeni ayrı bir PIN/parola sistemi YOK; 3-hak → SECURITY LOCKED sayacı da
/// mevcut AuthService üzerinden işler (recovery akışı bozulmaz).
class QuickAuthDialog extends ConsumerStatefulWidget {
  final String reason;
  const QuickAuthDialog({super.key, this.reason = 'Devam etmek için doğrula'});

  @override
  ConsumerState<QuickAuthDialog> createState() => _QuickAuthDialogState();
}

class _QuickAuthDialogState extends ConsumerState<QuickAuthDialog> {
  String _pin = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _bio();
  }

  Future<void> _bio() async {
    final settings = ref.read(settingsProvider);
    if (!settings.biometricEntry || _busy) return;
    _busy = true;
    final ok = await ref.read(authProvider.notifier).authenticateBiometric(widget.reason);
    _busy = false;
    if (!mounted) return;
    if (ok) Navigator.pop(context, true);
  }

  Future<void> _submit() async {
    if (_busy) return;
    _busy = true;
    final res = await ref.read(authProvider.notifier).verifyPin(_pin);
    _busy = false;
    if (!mounted) return;
    if (res == AuthResult.ok) {
      Navigator.pop(context, true);
    } else {
      final left = ref.read(authProvider).attemptsLeft;
      setState(() => _pin = '');
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(res == AuthResult.lockedOut
              ? 'SECURITY LOCKED — kurtarma sembolü gerekli'
              : 'Doğrulama başarısız — $left hak kaldı')));
      if (res == AuthResult.lockedOut) Navigator.pop(context, false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppColors.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.verified_user_outlined, color: AppColors.cyan, size: 28),
            const SizedBox(height: 10),
            Text(widget.reason,
                textAlign: TextAlign.center,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.text)),
            const SizedBox(height: 16),
            PinDots(filled: _pin.length, total: 6),
            const SizedBox(height: 14),
            PinPad(value: _pin, onChanged: (v) => setState(() => _pin = v), onSubmit: _submit),
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Vazgeç', style: TextStyle(color: AppColors.textDim)),
            ),
          ],
        ),
      ),
    );
  }
}
