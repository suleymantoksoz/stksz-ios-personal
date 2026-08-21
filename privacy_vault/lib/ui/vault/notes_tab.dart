import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme.dart';
import '../../services/vault_service.dart';
import 'vault_ui_util.dart';

/// Gizli Kasa → Notlar sekmesi (FAZ 1-7'nin şifreli not sistemi; FAZ 9'da
/// sekme içine taşındı, davranış aynı).
class NotesTab extends ConsumerWidget {
  final String query;
  const NotesTab({super.key, this.query = ''});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notes = ref.watch(vaultProvider);
    final q = query.trim().toLowerCase();
    final shown = q.isEmpty
        ? notes
        : notes
            .where((n) => n.title.toLowerCase().contains(q) || n.body.toLowerCase().contains(q))
            .toList();

    if (shown.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.notes_outlined, size: 52, color: AppColors.textDim),
            const SizedBox(height: 12),
            Text(q.isEmpty ? 'Henüz şifreli not yok' : 'Eşleşen not yok',
                style: const TextStyle(color: AppColors.textDim)),
            if (q.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 4),
                child: Text('Sağ alttaki + menüsünden ekleyebilirsin',
                    style: TextStyle(color: AppColors.textDim, fontSize: 12)),
              ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: shown.length,
      itemBuilder: (_, i) {
        final n = shown[i];
        return Card(
          margin: const EdgeInsets.only(bottom: 10),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            title: Text(n.title.isEmpty ? '(Başlıksız)' : n.title,
                style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w600)),
            subtitle: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 4),
                Text(n.body,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: AppColors.textDim, fontSize: 12)),
                const SizedBox(height: 4),
                Text(fmtDate(n.entry.createdAt),
                    style: const TextStyle(color: AppColors.textDim, fontSize: 10)),
              ],
            ),
            trailing: IconButton(
              icon: const Icon(Icons.delete_outline, color: AppColors.textDim, size: 20),
              onPressed: () => _confirmDelete(context, ref, n),
            ),
            onTap: () => _edit(context, ref, existing: n),
          ),
        );
      },
    );
  }

  static Future<void> _confirmDelete(BuildContext context, WidgetRef ref, DecryptedNote n) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Not silinsin mi?', style: TextStyle(color: AppColors.text, fontSize: 16)),
        content: const Text('Şifreli kayıt kalıcı olarak silinir.', style: TextStyle(color: AppColors.textDim)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Vazgeç')),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Sil', style: TextStyle(color: AppColors.red))),
        ],
      ),
    );
    if (ok == true) await ref.read(vaultProvider.notifier).delete(n.entry.id);
  }

  static Future<void> editSheet(BuildContext context, WidgetRef ref, {DecryptedNote? existing}) =>
      _edit(context, ref, existing: existing);

  static Future<void> _edit(BuildContext context, WidgetRef ref, {DecryptedNote? existing}) async {
    final titleCtrl = TextEditingController(text: existing?.title ?? '');
    final bodyCtrl = TextEditingController(text: existing?.body ?? '');
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (ctx) => Padding(
        padding:
            EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom + 16, left: 20, right: 20, top: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(existing == null ? 'Yeni şifreli not' : 'Notu düzenle',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: AppColors.text)),
            const SizedBox(height: 14),
            TextField(controller: titleCtrl, decoration: const InputDecoration(hintText: 'Başlık')),
            const SizedBox(height: 10),
            TextField(
              controller: bodyCtrl,
              maxLines: 6,
              decoration: const InputDecoration(hintText: 'İçerik — uçtan uca şifrelenir'),
            ),
            const SizedBox(height: 14),
            ElevatedButton.icon(
              onPressed: () => Navigator.pop(ctx, true),
              icon: const Icon(Icons.lock, size: 16),
              label: const Text('Şifrele ve Kaydet'),
            ),
          ],
        ),
      ),
    );
    if (saved == true) {
      final svc = ref.read(vaultProvider.notifier);
      if (existing == null) {
        await svc.add(titleCtrl.text.trim(), bodyCtrl.text);
      } else {
        await svc.update(existing.entry.id, titleCtrl.text.trim(), bodyCtrl.text);
      }
    }
  }
}
