import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

/// FAZ 8 — Hava Durumu decoy mantığı (saf Dart, test edilebilir).
/// - Önce ücretsiz/genel uç (wttr.in, API anahtarı gerektirmez) denenir.
/// - İnternet/yanıt yoksa DETERMİNİSTİK yerel tahmin üretir (şehir+gün tohumlu).
class WeatherHour {
  final String label; // "14:00"
  final double tempC;
  final String condition;
  WeatherHour(this.label, this.tempC, this.condition);
}

class WeatherDay {
  final String label; // "Pzt", "Sal"...
  final double minC;
  final double maxC;
  final String condition;
  WeatherDay(this.label, this.minC, this.maxC, this.condition);
}

class WeatherData {
  final String city;
  final double tempC;
  final double feelsC;
  final String condition;
  final int humidity;
  final int windKmph;
  final double minC;
  final double maxC;
  final bool offline; // yerel tahmin mi üretildi
  final List<WeatherHour> hours;
  final List<WeatherDay> days;

  WeatherData({
    required this.city,
    required this.tempC,
    required this.feelsC,
    required this.condition,
    required this.humidity,
    required this.windKmph,
    required this.minC,
    required this.maxC,
    required this.offline,
    required this.hours,
    required this.days,
  });
}

class WeatherLogic {
  WeatherLogic._();

  static const trDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  /// Canlı veri: wttr.in JSON (anahtarsız). 4 sn zaman aşımı.
  /// Hata/timeout durumunda null döner — çağıran yerel fallback'e düşer.
  static Future<WeatherData?> fetch(String city) async {
    try {
      final client = HttpClient()..connectionTimeout = const Duration(seconds: 4);
      final req = await client
          .getUrl(Uri.parse('https://wttr.in/${Uri.encodeComponent(city)}?format=j1'))
          .timeout(const Duration(seconds: 5));
      final res = await req.close().timeout(const Duration(seconds: 5));
      if (res.statusCode != 200) return null;
      final body = await res.transform(utf8.decoder).join();
      client.close(force: true);
      return parseWttr(city, body);
    } catch (_) {
      return null;
    }
  }

  /// wttr.in j1 çıktısını ayrıştırır (testlerde örnek JSON ile çağrılır).
  static WeatherData? parseWttr(String city, String jsonBody) {
    try {
      final j = jsonDecode(jsonBody) as Map<String, dynamic>;
      final cur = (j['current_condition'] as List).first as Map<String, dynamic>;
      final w = (j['weather'] as List);
      final today = w.first as Map<String, dynamic>;

      String condOf(Map<String, dynamic> m) {
        final desc = m['weatherDesc'];
        if (desc is List && desc.isNotEmpty) {
          return trCondition((desc.first as Map)['value'] as String? ?? '');
        }
        return '';
      }

      final hours = <WeatherHour>[];
      final todayHourly = (today['hourly'] as List? ?? []);
      for (final h in todayHourly) {
        final hm = h as Map<String, dynamic>;
        final t = int.tryParse('${hm['time']}') ?? 0;
        hours.add(WeatherHour(
          '${(t ~/ 100).toString().padLeft(2, '0')}:00',
          double.tryParse('${hm['tempC']}') ?? 0,
          condOf(hm),
        ));
      }

      final days = <WeatherDay>[];
      for (var i = 0; i < w.length && i < 7; i++) {
        final d = w[i] as Map<String, dynamic>;
        final date = DateTime.tryParse('${d['date']}') ?? DateTime.now();
        days.add(WeatherDay(
          trDays[date.weekday - 1],
          double.tryParse('${d['mintempC']}') ?? 0,
          double.tryParse('${d['maxtempC']}') ?? 0,
          condOf(d),
        ));
      }

      return WeatherData(
        city: city,
        tempC: double.tryParse('${cur['temp_C']}') ?? 0,
        feelsC: double.tryParse('${cur['FeelsLikeC']}') ?? 0,
        condition: condOf(cur),
        humidity: int.tryParse('${cur['humidity']}') ?? 0,
        windKmph: int.tryParse('${cur['windspeedKmph']}') ?? 0,
        minC: double.tryParse('${today['mintempC']}') ?? 0,
        maxC: double.tryParse('${today['maxtempC']}') ?? 0,
        offline: false,
        hours: hours,
        days: days,
      );
    } catch (_) {
      return null;
    }
  }

  /// Çevrimdışı deterministik tahmin — şehir adı + yılın günü tohumlu.
  /// Aynı şehir aynı gün → aynı tahmin (gerçekçilik için tutarlı).
  static WeatherData local(String city, DateTime now) {
    int seed = 0;
    for (final r in city.toLowerCase().runes) { seed = (seed * 31 + r) & 0x7fffffff; }
    final doy = int.parse(DateTime.now().difference(DateTime(now.year)).inDays.toString()) + 1;
    final s = seed + doy;

    // mevsimsel eğri (kuzey yarımküre) + günlük sapma
    final seasonal = 16 + 12 * math.sin((doy / 365) * 2 * math.pi - 1.9);
    final dayVar = 2.5 * math.sin(s * 0.37);
    final base = seasonal + dayVar;

    const conds = ['Güneşli', 'Parçalı bulutlu', 'Bulutlu', 'Yağmurlu', 'Rüzgarlı'];
    String condAt(int k) => conds[(s + k * 7) % conds.length];

    final hours = <WeatherHour>[];
    for (var k = 0; k < 24; k++) {
      final h = (now.hour + k) % 24;
      final t = base + 5 * math.cos((h - 15) / 24 * 2 * math.pi);
      hours.add(WeatherHour('${h.toString().padLeft(2, '0')}:00', t, condAt(k ~/ 3)));
    }

    final days = <WeatherDay>[];
    for (var d = 0; d < 7; d++) {
      final dd = now.add(Duration(days: d));
      final spread = 2 + (s + d * 3) % 4;
      final mid = base + 2 * math.sin((s + d) * 0.9);
      days.add(WeatherDay(
        trDays[dd.weekday - 1],
        mid - spread,
        mid + spread + 1.5,
        condAt(d + 1),
      ));
    }

    final cur = base + 5 * math.cos((now.hour - 15) / 24 * 2 * math.pi);
    return WeatherData(
      city: city,
      tempC: cur,
      feelsC: cur - 1.5 + (s % 30) / 10,
      condition: condAt(0),
      humidity: 35 + s % 45,
      windKmph: 4 + s % 22,
      minC: days.first.minC,
      maxC: days.first.maxC,
      offline: true,
      hours: hours,
      days: days,
    );
  }

  /// İngilizce hava durumu ifadelerini Türkçe'ye çevirir (bilinmeyen ham döner).
  static String trCondition(String en) {
    final s = en.toLowerCase();
    if (s.contains('sleet')) return 'Sulu kar';
    if (s.contains('snow')) return 'Karlı';
    if (s.contains('thunder')) return 'Fırtınalı';
    if (s.contains('heavy rain')) return 'Şiddetli yağmur';
    if (s.contains('rain') || s.contains('drizzle') || s.contains('shower')) return 'Yağmurlu';
    if (s.contains('fog') || s.contains('mist')) return 'Sisli';
    if (s.contains('partly')) return 'Parçalı bulutlu';
    if (s.contains('cloud') || s.contains('overcast')) return 'Bulutlu';
    if (s.contains('sunny') || s.contains('clear')) return 'Güneşli';
    if (s.contains('wind')) return 'Rüzgarlı';
    return en;
  }

  /// UI ikon eşlemesi (UI katmanında IconData'ya çevrilir).
  static String iconKey(String condition) {
    final s = condition.toLowerCase();
    if (s.contains('kar')) return 'snow';
    if (s.contains('fırtına')) return 'storm';
    if (s.contains('yağmur') || s.contains('sulu')) return 'rain';
    if (s.contains('sis')) return 'fog';
    if (s.contains('parçalı')) return 'partly';
    if (s.contains('bulutlu')) return 'cloud';
    if (s.contains('rüzgar')) return 'wind';
    return 'sun';
  }
}
