import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../services/auth_service.dart';
import '../../services/decoy/weather_logic.dart';
import '../../services/security_log_service.dart';
import '../../services/security_policies.dart';

/// FAZ 8 — HAVA DURUMU decoy'u. Gerçekçi arayüz:
/// canlı veri (wttr.in, anahtarsız) → yoksa yerel deterministik tahmin.
/// Tetikleyici: şehir aramasına gizli ifade yazılır (ör: "....").
class WeatherDecoy extends ConsumerStatefulWidget {
  final VoidCallback onTrigger;
  const WeatherDecoy({super.key, required this.onTrigger});

  @override
  ConsumerState<WeatherDecoy> createState() => _WeatherDecoyState();
}

class _WeatherDecoyState extends ConsumerState<WeatherDecoy> {
  WeatherData? _data;
  bool _loading = true;
  String _city = 'Karaman';
  final _searchCtrl = TextEditingController();
  // FAZ 11: brute-force freni (aynı aday 800ms'de en çok 1 kez doğrulanır)
  String? _lastCand;
  int? _lastTryMs;

  @override
  void initState() {
    super.initState();
    _load(_city);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load(String city) async {
    setState(() => _loading = true);
    final live = await WeatherLogic.fetch(city);
    if (!mounted) return;
    setState(() {
      _data = live ?? WeatherLogic.local(city, DateTime.now());
      _city = city;
      _loading = false;
    });
  }

  Future<void> _onSearch(String q) async {
    final query = q.trim();
    if (query.isEmpty) return;
    // gizli tetikleyici — hash karşılaştırması
    final auth = ref.read(authProvider.notifier);
    if (await auth.hasDecoyTrigger('weather') &&
        allowTriggerAttempt(
            candidate: query,
            lastCandidate: _lastCand,
            lastAttemptMs: _lastTryMs,
            nowMs: DateTime.now().millisecondsSinceEpoch)) {
      _lastCand = query;
      _lastTryMs = DateTime.now().millisecondsSinceEpoch;
      final ok = await auth.verifyDecoyTrigger('weather', query);
      if (ok) {
        ref.read(securityLogProvider.notifier).add('triggerOk', 'Hava Durumu kimliği');
        _searchCtrl.clear();
        widget.onTrigger();
        return;
      }
      if (isTriggerLike(query)) {
        ref.read(securityLogProvider.notifier).add('triggerFail', 'Hava Durumu kimliği');
      }
    }
    await _load(query);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF16324F), Color(0xFF0A1522)],
          ),
        ),
        child: SafeArea(
          child: _loading || _data == null
              ? const Center(child: CircularProgressIndicator(color: Colors.white70))
              : _body(_data!),
        ),
      ),
    );
  }

  Widget _body(WeatherData d) {
    return CustomScrollView(
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchCtrl,
                    onSubmitted: _onSearch,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: 'Şehir ara',
                      hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.4)),
                      prefixIcon: Icon(Icons.search, color: Colors.white.withValues(alpha: 0.5)),
                      filled: true,
                      fillColor: Colors.white.withValues(alpha: 0.1),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                      isDense: true,
                    ),
                  ),
                ),
                IconButton(
                  onPressed: () => _load(_city),
                  icon: const Icon(Icons.my_location, color: Colors.white70),
                ),
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: Column(
            children: [
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(_displayCity(d.city),
                      style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w300, color: Colors.white)),
                  if (d.offline)
                    Container(
                      margin: const EdgeInsets.only(left: 8),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text('yerel tahmin',
                          style: TextStyle(color: Colors.white60, fontSize: 10, letterSpacing: 0.6)),
                    ),
                ],
              ),
              Icon(_iconFor(d.condition), size: 86, color: Colors.white.withValues(alpha: 0.9)),
              Text('${d.tempC.round()}°',
                  style: const TextStyle(fontSize: 82, fontWeight: FontWeight.w200, color: Colors.white, height: 1)),
              Text(d.condition, style: const TextStyle(fontSize: 17, color: Colors.white70)),
              const SizedBox(height: 4),
              Text(
                'Hissedilen ${d.feelsC.round()}°  •  E:${d.maxC.round()}°  D:${d.minC.round()}°',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 13),
              ),
              const SizedBox(height: 18),
            ],
          ),
        ),
        // saatlik şerit
        SliverToBoxAdapter(
          child: SizedBox(
            height: 106,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              itemCount: d.hours.length,
              itemBuilder: (_, i) {
                final h = d.hours[i];
                return Container(
                  width: 66,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: i == 0 ? 0.22 : 0.08),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(h.label, style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 11)),
                      const SizedBox(height: 6),
                      Icon(_iconFor(h.condition), size: 22, color: Colors.white),
                      const SizedBox(height: 6),
                      Text('${h.tempC.round()}°', style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w500)),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
        // haftalık
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 18, 18, 0),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Column(
                children: [
                  for (var i = 0; i < d.days.length; i++) ...[
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                      child: Row(
                        children: [
                          SizedBox(width: 44, child: Text(i == 0 ? 'Bugün' : d.days[i].label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w500))),
                          Icon(_iconFor(d.days[i].condition), size: 20, color: Colors.white70),
                          const Spacer(),
                          Text('${d.days[i].minC.round()}°', style: TextStyle(color: Colors.white.withValues(alpha: 0.5))),
                          const SizedBox(width: 12),
                          Text('${d.days[i].maxC.round()}°', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                    if (i < d.days.length - 1)
                      Divider(height: 1, color: Colors.white.withValues(alpha: 0.07)),
                  ],
                ],
              ),
            ),
          ),
        ),
        // metrikler
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 14, 18, 24),
            child: Row(
              children: [
                _metric('NEM', '%${d.humidity}', Icons.water_drop_outlined),
                const SizedBox(width: 10),
                _metric('RÜZGAR', '${d.windKmph} km/sa', Icons.air),
                const SizedBox(width: 10),
                _metric('HİSSEDİLEN', '${d.feelsC.round()}°', Icons.thermostat),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _metric(String label, String value, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          children: [
            Icon(icon, color: Colors.white54, size: 18),
            const SizedBox(height: 6),
            Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 15)),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(color: Colors.white.withValues(alpha: 0.45), fontSize: 10, letterSpacing: 1)),
          ],
        ),
      ),
    );
  }

  String _displayCity(String raw) =>
      raw.isEmpty ? raw : raw[0].toUpperCase() + raw.substring(1);

  IconData _iconFor(String condition) {
    switch (WeatherLogic.iconKey(condition)) {
      case 'snow': return Icons.ac_unit;
      case 'storm': return Icons.thunderstorm;
      case 'rain': return Icons.umbrella;
      case 'fog': return Icons.foggy;
      case 'partly': return Icons.wb_cloudy;
      case 'cloud': return Icons.cloud;
      case 'wind': return Icons.air;
      default: return Icons.wb_sunny;
    }
  }
}
