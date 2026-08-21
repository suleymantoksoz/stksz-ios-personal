import 'package:flutter_test/flutter_test.dart';
import 'package:privacy_vault/models/models.dart';
import 'package:privacy_vault/services/decoy/notes_store.dart';
import 'package:privacy_vault/services/decoy/trigger_tools.dart';
import 'package:privacy_vault/services/decoy/weather_logic.dart';
import 'package:privacy_vault/ui/decoy/clock_decoy.dart';

void main() {
  group('TriggerNorm — decoy başına tetikleyici parsing', () {
    test('calculator: boşluk ve unicode operatörler normalize edilir', () {
      expect(TriggerNorm.normalize('calculator', ' 2580 + 1 '), '2580+1');
      expect(TriggerNorm.normalize('calculator', '12×3'), '12*3');
      expect(TriggerNorm.normalize('calculator', '8÷2'), '8/2');
      expect(TriggerNorm.normalize('calculator', '9−1'), '9-1');
    });

    test('calculator: geçerlilik kuralları', () {
      expect(TriggerNorm.isValid('calculator', '2580+1'), isTrue);
      expect(TriggerNorm.isValid('calculator', '++'), isFalse); // rakam yok
      expect(TriggerNorm.isValid('calculator', 'abc'), isFalse);
    });

    test('clock: "7:5" → "07:05"; geçersiz saatler reddedilir', () {
      expect(TriggerNorm.normalize('clock', '7:5'), '07:05');
      expect(TriggerNorm.normalize('clock', '12:34'), '12:34');
      expect(TriggerNorm.normalize('clock', '07.05'), '07:05');
      expect(TriggerNorm.isValid('clock', '12:34'), isTrue);
      expect(TriggerNorm.isValid('clock', '25:00'), isFalse);
      expect(TriggerNorm.isValid('clock', '10:75'), isFalse);
      expect(TriggerNorm.isValid('clock', 'yazı'), isFalse);
    });

    test('notes/weather: serbest metin kırpma + sınır', () {
      expect(TriggerNorm.normalize('notes', '  !!! '), '!!!');
      expect(TriggerNorm.normalize('weather', '....'), '....');
      expect(TriggerNorm.isValid('notes', '!!!'), isTrue);
      expect(TriggerNorm.isValid('notes', ''), isFalse);
      expect(TriggerNorm.isValid('weather', 'x' * 25), isFalse);
    });
  });

  group('NotesStore — decoy not defteri mantığı', () {
    Future<void> setup(NotesStore store, List<String> box) async {
      store.loader = () async => box.isEmpty ? null : box.first;
      store.saver = (raw) async {
        box
          ..clear()
          ..add(raw);
      };
    }

    test('oluştur / düzenle / ara / sil döngüsü', () async {
      final box = <String>[];
      final store = NotesStore();
      await setup(store, box);

      final n1 = await store.add('Market', 'Süt, yumurta');
      await store.add('Fikir', 'Yeni proje planı');
      expect(store.notes.length, 2);
      expect(store.search('süt').length, 1); // içerikte arama
      expect(store.search('FİKİR').length, 1); // büyük/küçük harf duyarsız
      expect(store.search('yok').length, 0);

      await store.update(n1.id, 'Market listesi', 'Ekmek de al');
      expect(store.search('ekmek').length, 1);

      await store.delete(n1.id);
      expect(store.notes.length, 1);
      expect(box.length, 1); // kalıcılık yazıldı
    });

    test('kalıcılık: kaydedilen JSON geri yüklenir', () async {
      final box = <String>[];
      final s1 = NotesStore();
      await setup(s1, box);
      await s1.add('Test', 'Merhaba dünya');

      final s2 = NotesStore();
      await setup(s2, box);
      await s2.load();
      expect(s2.notes.length, 1);
      expect(s2.notes.first.title, 'Test');
      expect(s2.notes.first.body, 'Merhaba dünya');
    });
  });

  group('ClockFmt — saat decoy biçimlendirme', () {
    test('hms/hm', () {
      final d = DateTime(2026, 8, 17, 7, 5, 3);
      expect(ClockFmt.hms(d), '07:05:03');
      expect(ClockFmt.hm(d), '07:05');
    });
    test('stopwatch ve timer formatları', () {
      expect(ClockFmt.stopwatch(const Duration(minutes: 2, seconds: 3, milliseconds: 456)), '02:03.45');
      expect(ClockFmt.timer(const Duration(minutes: 5, seconds: 5)), '05:05');
      expect(ClockFmt.timer(const Duration(hours: 1, minutes: 2, seconds: 3)), '1:02:03');
    });
  });

  group('WeatherLogic — hava durumu decoy', () {
    test('yerel tahmin deterministik (aynı şehir+gün = aynı sonuç)', () {
      final now = DateTime(2026, 8, 17, 12, 0);
      final a = WeatherLogic.local('Karaman', now);
      final b = WeatherLogic.local('Karaman', now);
      expect(a.tempC, b.tempC);
      expect(a.humidity, b.humidity);
      expect(a.days.length, 7);
      expect(a.hours.length, 24);
      expect(a.offline, isTrue);
    });

    test('farklı şehirler farklı tahmin üretir', () {
      final now = DateTime(2026, 8, 17, 12, 0);
      final a = WeatherLogic.local('Karaman', now);
      final b = WeatherLogic.local('Rize', now);
      expect(a.tempC == b.tempC && a.humidity == b.humidity, isFalse);
    });

    test('wttr.in JSON ayrıştırma', () {
      const sample = '''
      {"current_condition":[{"temp_C":"28","FeelsLikeC":"27","humidity":"41","windspeedKmph":"14","weatherDesc":[{"value":"Sunny"}]}],
       "weather":[{"date":"2026-08-17","maxtempC":"31","mintempC":"19","weatherDesc":[{"value":"Sunny"}],"hourly":[{"time":"1200","tempC":"29","weatherDesc":[{"value":"Sunny"}]}]},
                  {"date":"2026-08-18","maxtempC":"30","mintempC":"18","weatherDesc":[{"value":"Partly cloudy"}],"hourly":[]}]}''';
      final d = WeatherLogic.parseWttr('Karaman', sample);
      expect(d, isNotNull);
      expect(d!.tempC, 28);
      expect(d.condition, 'Güneşli');
      expect(d.offline, isFalse);
      expect(d.days.first.maxC, 31);
      expect(d.hours.first.label, '12:00');
    });

    test('durum çevirisi + ikon anahtarı', () {
      expect(WeatherLogic.trCondition('Partly cloudy'), 'Parçalı bulutlu');
      expect(WeatherLogic.trCondition('Light rain shower'), 'Yağmurlu');
      expect(WeatherLogic.iconKey('Parçalı bulutlu'), 'partly');
      expect(WeatherLogic.iconKey('Güneşli'), 'sun');
    });
  });

  group('SecurityProfile entegrasyonu — decoy seçimi', () {
    test('DecoyKind parse', () {
      expect(DecoyKindX.parse('notes'), DecoyKind.notes);
      expect(DecoyKindX.parse('weather'), DecoyKind.weather);
      expect(DecoyKindX.parse('clock'), DecoyKind.clock);
      expect(DecoyKindX.parse('bilinmeyen'), DecoyKind.none);
      expect(DecoyKindX.parse(null), DecoyKind.none);
    });

    test('ProtectedAppConfig decoy alanı JSON tur-atımı', () {
      final cfg = ProtectedAppConfig(
        packageName: 'com.whatsapp',
        label: 'WhatsApp',
        locked: true,
        hidden: true,
        method: AuthMethod.bioPin,
        decoy: DecoyKind.notes,
      );
      final round = ProtectedAppConfig.decodeList(ProtectedAppConfig.encodeList([cfg]));
      expect(round.single.decoy, DecoyKind.notes);
      expect(round.single.method, AuthMethod.bioPin);
      expect(round.single.hidden, isTrue);
    });

    test('decoy etiketleri TR', () {
      expect(DecoyKind.notes.tr, 'Not Defteri');
      expect(DecoyKind.clock.tr, 'Saat');
      expect(DecoyKind.weather.tr, 'Hava Durumu');
    });
  });
}
