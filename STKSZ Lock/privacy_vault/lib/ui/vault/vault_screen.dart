import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../models/models.dart';
import '../../services/file_vault_service.dart';
import '../../services/vault_service.dart';
import 'files_tab.dart';
import 'import_flow.dart';
import 'notes_tab.dart';

/// Gizli Kasa — FAZ 9: Secure File Vault
/// Sekmeler: Fotoğraflar | Videolar | Dosyalar | Notlar.
/// Tüm içerik AES-256-GCM (PVF1 akış formatı) ile şifreli; metadata bile şifrelidir.
/// Local-first: hiçbir bulut/ağ bağımlılığı yok.
class VaultScreen extends ConsumerStatefulWidget {
  const VaultScreen({super.key});

  @override
  ConsumerState<VaultScreen> createState() => _VaultScreenState();
}

class _VaultScreenState extends ConsumerState<VaultScreen> {
  bool _searching = false;
  String _query = '';
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(vaultProvider.notifier).load();
      ref.read(fileVaultProvider.notifier).load();
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final files = ref.watch(fileVaultProvider);
    final notes = ref.watch(vaultProvider);
    int countOf(VaultFileKind k) => files.where((f) => f.kind == k).length;

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: _searching
              ? TextField(
                  controller: _searchCtrl,
                  autofocus: true,
                  style: const TextStyle(color: AppColors.text, fontSize: 14),
                  decoration: const InputDecoration(
                    hintText: 'Kasada ara (ad)…',
                    border: InputBorder.none,
                    filled: false,
                    contentPadding: EdgeInsets.zero,
                  ),
                  onChanged: (v) => setState(() => _query = v),
                )
              : const Text('GİZLİ KASA'),
          actions: [
            IconButton(
              tooltip: _searching ? 'Aramayı kapat' : 'Ara',
              icon: Icon(_searching ? Icons.close : Icons.search, size: 20),
              onPressed: () => setState(() {
                _searching = !_searching;
                if (!_searching) {
                  _query = '';
                  _searchCtrl.clear();
                }
              }),
            ),
            const Padding(
              padding: EdgeInsets.only(right: 8),
              child: Row(children: [
                Icon(Icons.enhanced_encryption, size: 14, color: AppColors.green),
                SizedBox(width: 4),
                Text('AES-256', style: TextStyle(fontSize: 10, color: AppColors.green, letterSpacing: 1)),
              ]),
            ),
          ],
          bottom: TabBar(
            labelColor: AppColors.cyan,
            unselectedLabelColor: AppColors.textDim,
            indicatorColor: AppColors.cyan,
            labelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
            tabs: [
              Tab(text: 'Foto ${countOf(VaultFileKind.photo)}'),
              Tab(text: 'Video ${countOf(VaultFileKind.video)}'),
              Tab(text: 'Dosya ${countOf(VaultFileKind.file)}'),
              Tab(text: 'Not ${notes.length}'),
            ],
          ),
        ),
        floatingActionButton: FloatingActionButton(
          onPressed: _importSheet,
          child: const Icon(Icons.add),
        ),
        body: TabBarView(
          children: [
            FilesTab(kind: VaultFileKind.photo, query: _query),
            FilesTab(kind: VaultFileKind.video, query: _query),
            FilesTab(kind: VaultFileKind.file, query: _query),
            NotesTab(query: _query),
          ],
        ),
      ),
    );
  }

  void _importSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(20, 4, 20, 12),
                child: Row(children: [
                  Icon(Icons.lock, color: AppColors.green, size: 16),
                  SizedBox(width: 8),
                  Text('Kasaya ekle',
                      style: TextStyle(color: AppColors.text, fontWeight: FontWeight.w700, fontSize: 15)),
                ]),
              ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined, color: AppColors.cyan, size: 22),
                title: const Text('Fotoğraf / Video ekle', style: TextStyle(color: AppColors.text, fontSize: 14)),
                subtitle: const Text('Galeriden çoklu seç — şifrelenerek kopyalanır',
                    style: TextStyle(color: AppColors.textDim, fontSize: 11)),
                onTap: () {
                  Navigator.pop(ctx);
                  VaultImportFlow.importFromGallery(context, ref);
                },
              ),
              ListTile(
                leading: const Icon(Icons.upload_file_outlined, color: AppColors.purple, size: 22),
                title: const Text('Dosya ekle (PDF, belge, ZIP…)', style: TextStyle(color: AppColors.text, fontSize: 14)),
                subtitle: const Text('Sistem dosya seçici — bilinmeyen türler de desteklenir',
                    style: TextStyle(color: AppColors.textDim, fontSize: 11)),
                onTap: () {
                  Navigator.pop(ctx);
                  VaultImportFlow.importDocuments(context, ref);
                },
              ),
              ListTile(
                leading: const Icon(Icons.note_add_outlined, color: AppColors.green, size: 22),
                title: const Text('Şifreli not yaz', style: TextStyle(color: AppColors.text, fontSize: 14)),
                onTap: () {
                  Navigator.pop(ctx);
                  NotesTab.editSheet(context, ref);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}
