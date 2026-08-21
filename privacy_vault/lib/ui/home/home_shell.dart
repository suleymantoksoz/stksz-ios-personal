import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../apps/apps_screen.dart';
import '../security/security_center_screen.dart';
import '../settings/settings_screen.dart';
import '../vault/vault_entry.dart';

/// Ana kabuk — Alt navigasyon: Kilitle | Gizli Kasa | Güvenlik | Ayarlar
class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  static const _tabs = [AppsScreen(), VaultEntry(), SecurityCenterScreen(), SettingsScreen()];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _tabs),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.lock_outline), activeIcon: Icon(Icons.lock), label: 'Kilitle'),
          BottomNavigationBarItem(icon: Icon(Icons.inventory_2_outlined), activeIcon: Icon(Icons.inventory_2), label: 'Gizli Kasa'),
          BottomNavigationBarItem(icon: Icon(Icons.security_outlined), activeIcon: Icon(Icons.security), label: 'Güvenlik'),
          BottomNavigationBarItem(icon: Icon(Icons.settings_outlined), activeIcon: Icon(Icons.settings), label: 'Ayarlar'),
        ],
      ),
    );
  }
}
