/// FAZ 8 — Tetikleyici normalizasyon & doğrulama araçları.
/// Her decoy türünün doğal giriş formatı farklıdır; hepsi aynı güvenlik
/// hattına (PBKDF2 hash) bağlanır. Tetikleyici ASLA loglanmaz/düz saklanmaz.
class TriggerNorm {
  TriggerNorm._();

  static const kinds = ['calculator', 'notes', 'clock', 'weather'];

  /// Kullanıcının girdiğini decoy türünün doğal formatına indirger.
  static String normalize(String kind, String raw) {
    final t = raw.trim();
    switch (kind) {
      case 'clock':
        // "7:5" / "07.05" -> "07:05"
        final m = RegExp(r'^(\d{1,2})[:.](\d{1,2})$').firstMatch(t);
        if (m != null) {
          final h = int.parse(m.group(1)!);
          final mi = int.parse(m.group(2)!);
          if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) {
            return '${h.toString().padLeft(2, '0')}:${mi.toString().padLeft(2, '0')}';
          }
        }
        return t;
      case 'calculator':
        return t.replaceAll(' ', '').replaceAll('−', '-').replaceAll('×', '*').replaceAll('÷', '/');
      default: // notes, weather: serbest metin (ör: "!!!", "....")
        return t;
    }
  }

  /// Tür kurallarına göre geçerlilik (kaydetmeden ÖNCE çağrılır).
  static bool isValid(String kind, String raw) {
    final t = normalize(kind, raw);
    switch (kind) {
      case 'calculator':
        return RegExp(r'^[0-9+\-*/.]{3,20}$').hasMatch(t) && RegExp(r'\d').hasMatch(t);
      case 'clock':
        return RegExp(r'^([01]\d|2[0-3]):[0-5]\d$').hasMatch(t);
      case 'notes':
      case 'weather':
        // FAZ 11: brute-force'a karşı minimum karmaşıklık (yeni kayıtlar için;
        // daha önce kaydedilmiş kısa tetikleyiciler çalışmaya devam eder).
        return t.length >= 3 && t.length <= 24;
      default:
        return false;
    }
  }

  /// Ayarlar ekranında gösterilecek örnek ipucu (tür başına).
  static String hint(String kind) => switch (kind) {
        'calculator' => 'Örn: 2580+1 — hesap makinesine yazıp "=" basılır',
        'notes' => 'Örn: !!! — not arama çubuğuna yazılır (en az 3 karakter)',
        'clock' => 'Örn: 12:34 — o saatte alarm oluşturulmaya çalışılır',
        'weather' => 'Örn: .... — şehir aramasına yazılır (en az 3 karakter)',
        _ => '',
      };
}
