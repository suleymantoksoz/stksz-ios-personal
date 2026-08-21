import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
import 'services/app_settings.dart';
import 'ui/home/home_shell.dart';
import 'ui/lock/lock_gate.dart';
import 'ui/onboarding/onboarding_screen.dart';

class PrivacyVaultApp extends ConsumerWidget {
  const PrivacyVaultApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    return MaterialApp(
      title: 'PRIVACY VAULT',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark(settings.accentColor),
      home: settings.onboarded ? const LockGate(child: HomeShell()) : const OnboardingScreen(),
    );
  }
}
