import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../../services/auth_service.dart';
import '../../services/decoy/notes_store.dart';
import '../../services/security_log_service.dart';
import '../../services/security_policies.dart';

/// FAZ 8 — NOT DEFTERİ decoy'u. GERÇEK çalışan not uygulaması:
/// oluştur / düzenle / kaydet / sil / ara. Kalıcılık: uygulama dizininde json.
/// Tetikleyici: arama çubuğuna gizli ifade yazılır (ör: "!!!") — hiçbir yerde
/// "şifre/giriş" ifadesi yoktur.
class NotesDecoy extends ConsumerStatefulWidget {
  final VoidCallback onTrigger;
  const NotesDecoy({super.key, required this.onTrigger});

  static const amber = Color(0xFFF5B942);
  static const ink = Color(0xFF16130C);

  @override
  ConsumerState<NotesDecoy> createState() => _NotesDecoyState();
}

class _NotesDecoyState extends ConsumerState<NotesDecoy> {
  final _store = NotesStore();
  final _searchCtrl = TextEditingController();
  String _query = '';
  bool _loaded = false;
  // FAZ 11: brute-force freni — aynı adayın art arda denenmesi 800ms bekler
  String? _lastCand;
  int? _lastTryMs;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final dir = await getApplicationDocumentsDirectory();
    final file = File('${dir.path}/decoy_notes.json');
    _store.loader = () async => await file.exists() ? file.readAsString() : null;
    _store.saver = (raw) async => file.writeAsString(raw);
    await _store.load();
    if (mounted) setState(() => _loaded = true);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _onSearchChanged(String v) async {
    setState(() => _query = v);
    // gizli tetikleyici — yalnızca hash karşılaştırması, düz metin saklanmaz
    final auth = ref.read(authProvider.notifier);
    if (!await auth.hasDecoyTrigger('notes')) return;
    final cand = v.trim();
    if (!allowTriggerAttempt(
        candidate: cand,
        lastCandidate: _lastCand,
        lastAttemptMs: _lastTryMs,
        nowMs: DateTime.now().millisecondsSinceEpoch)) {
      return;
    }
    _lastCand = cand;
    _lastTryMs = DateTime.now().millisecondsSinceEpoch;
    final ok = await auth.verifyDecoyTrigger('notes', cand);
    if (ok) {
      // FAZ 10: başarılı/KESIN tetikleyici denemesi güvenlik merkezine yazılır
      // (tetikleyicinin KENDISI asla loglanmaz).
      ref.read(securityLogProvider.notifier).add('triggerOk', 'Not Defteri kimliği');
      _searchCtrl.clear();
      setState(() => _query = '');
      widget.onTrigger();
      return;
    }
    // fail logu yalnızca "tetikleyici formatına benzeyen" girişlerde —
    // normal arama metinleri log'lanmaz (isTriggerLike politikası).
    if (isTriggerLike(v)) {
      ref.read(securityLogProvider.notifier).add('triggerFail', 'Not Defteri kimliği');
    }
  }

  @override
  Widget build(BuildContext context) {
    final notes = _store.search(_query);
    return Scaffold(
      backgroundColor: const Color(0xFF0F0D08),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('Notlar', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: NotesDecoy.amber,
        foregroundColor: Colors.black,
        onPressed: _loaded ? () => _openEditor() : null,
        child: const Icon(Icons.add),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
              child: TextField(
                controller: _searchCtrl,
                onChanged: _onSearchChanged,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  hintText: 'Notlarda ara',
                  hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.35)),
                  prefixIcon: Icon(Icons.search, color: Colors.white.withValues(alpha: 0.4)),
                  filled: true,
                  fillColor: Colors.white.withValues(alpha: 0.07),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none,
                  ),
                  isDense: true,
                ),
              ),
            ),
            Expanded(
              child: !_loaded
                  ? const Center(child: CircularProgressIndicator(color: NotesDecoy.amber))
                  : notes.isEmpty
                      ? Center(
                          child: Text(
                            _query.isEmpty ? 'Not yok\nSağ alttan ilk notunu oluştur' : 'Sonuç bulunamadı',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.35), height: 1.5),
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                          itemCount: notes.length,
                          itemBuilder: (_, i) => _noteCard(notes[i]),
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _noteCard(DecoyNote n) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1910),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: NotesDecoy.amber.withValues(alpha: 0.15)),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        onTap: () => _openEditor(existing: n),
        title: Text(
          n.title.isEmpty ? '(Başlıksız)' : n.title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        ),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                n.body,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 13, height: 1.35),
              ),
              const SizedBox(height: 6),
              Text(_fmt(n.updatedAt),
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.3), fontSize: 11)),
            ],
          ),
        ),
        trailing: IconButton(
          icon: Icon(Icons.delete_outline, color: Colors.white.withValues(alpha: 0.35), size: 20),
          onPressed: () async {
            await _store.delete(n.id);
            if (mounted) setState(() {});
          },
        ),
      ),
    );
  }

  String _fmt(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  Future<void> _openEditor({DecoyNote? existing}) async {
    final titleCtrl = TextEditingController(text: existing?.title ?? '');
    final bodyCtrl = TextEditingController(text: existing?.body ?? '');
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (ctx) => Scaffold(
          backgroundColor: const Color(0xFF0F0D08),
          appBar: AppBar(
            backgroundColor: Colors.transparent,
            leading: IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => Navigator.pop(ctx, true), // geri dönüşte otomatik kaydet
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Bitti', style: TextStyle(color: NotesDecoy.amber, fontSize: 16)),
              ),
            ],
          ),
          body: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                TextField(
                  controller: titleCtrl,
                  style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700),
                  decoration: InputDecoration(
                    hintText: 'Başlık',
                    hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.3)),
                    border: InputBorder.none,
                  ),
                ),
                Expanded(
                  child: TextField(
                    controller: bodyCtrl,
                    maxLines: null,
                    expands: true,
                    textAlignVertical: TextAlignVertical.top,
                    style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 15, height: 1.5),
                    decoration: InputDecoration(
                      hintText: 'Not yazmaya başla…',
                      hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.25)),
                      border: InputBorder.none,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (saved == true) {
      if (titleCtrl.text.trim().isEmpty && bodyCtrl.text.trim().isEmpty) return;
      if (existing == null) {
        await _store.add(titleCtrl.text, bodyCtrl.text);
      } else {
        await _store.update(existing.id, titleCtrl.text, bodyCtrl.text);
      }
      if (mounted) setState(() {});
    }
  }
}
