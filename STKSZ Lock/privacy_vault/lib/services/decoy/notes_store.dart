import 'dart:convert';

/// FAZ 8 — Not Defteri decoy'unun saf iş mantığı.
/// UI'dan bağımsızdır; kalıcılık enjeksiyonla yapılır
/// (cihazda dosya, testte bellek) → birim testi mümkün.
class DecoyNote {
  final String id;
  String title;
  String body;
  DateTime updatedAt;

  DecoyNote({required this.id, required this.title, required this.body, required this.updatedAt});

  Map<String, dynamic> toMap() => {
        'id': id,
        'title': title,
        'body': body,
        'updatedAt': updatedAt.toIso8601String(),
      };

  factory DecoyNote.fromMap(Map<String, dynamic> m) => DecoyNote(
        id: m['id'] as String,
        title: m['title'] as String? ?? '',
        body: m['body'] as String? ?? '',
        updatedAt: DateTime.tryParse(m['updatedAt'] as String? ?? '') ?? DateTime.now(),
      );
}

typedef RawLoader = Future<String?> Function();
typedef RawSaver = Future<void> Function(String rawJson);

class NotesStore {
  NotesStore({this.loader, this.saver});

  /// Kalıcılık enjeksiyonu — UI/test bunları SONRADAN atar.
  RawLoader? loader;
  RawSaver? saver;
  final List<DecoyNote> notes = [];
  int _seq = 0;

  Future<void> load() async {
    if (loader == null) return;
    final raw = await loader!();
    if (raw == null || raw.isEmpty) return;
    try {
      final list = jsonDecode(raw) as List;
      notes
        ..clear()
        ..addAll(list.map((e) => DecoyNote.fromMap(Map<String, dynamic>.from(e))));
      _sort();
    } catch (_) {
      // bozuk dosya → boş başlangıç
    }
  }

  List<DecoyNote> get sorted {
    _sort();
    return notes;
  }

  void _sort() => notes.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));

  Future<DecoyNote> add(String title, String body) async {
    final note = DecoyNote(
      id: 'n${DateTime.now().microsecondsSinceEpoch.toRadixString(36)}${_seq++}',
      title: title.trim(),
      body: body,
      updatedAt: DateTime.now(),
    );
    notes.add(note);
    await _persist();
    return note;
  }

  Future<void> update(String id, String title, String body) async {
    final i = notes.indexWhere((n) => n.id == id);
    if (i < 0) return;
    notes[i]
      ..title = title.trim()
      ..body = body
      ..updatedAt = DateTime.now();
    await _persist();
  }

  Future<void> delete(String id) async {
    notes.removeWhere((n) => n.id == id);
    await _persist();
  }

  /// Başlık + içerik üzerinde büyük/küçük harf duyarsız arama.
  List<DecoyNote> search(String query) {
    final q = query.toLowerCase();
    if (q.isEmpty) return sorted;
    return sorted
        .where((n) => n.title.toLowerCase().contains(q) || n.body.toLowerCase().contains(q))
        .toList();
  }

  Future<void> _persist() async {
    if (saver == null) return;
    await saver!(jsonEncode(notes.map((e) => e.toMap()).toList()));
  }
}
