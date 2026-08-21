import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../services/auth_service.dart';
import '../../services/decoy/trigger_tools.dart';
import '../../services/security_log_service.dart';
import '../../services/security_policies.dart';

/// Saf biçimlendirme yardımcıları (birim testi için UI'dan bağımsız).
class ClockFmt {
  ClockFmt._();
  static String hms(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}:${d.second.toString().padLeft(2, '0')}';
  static String hm(DateTime d) =>
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  static String stopwatch(Duration d) {
    final cs = (d.inMilliseconds % 1000) ~/ 10;
    return '${d.inMinutes.toString().padLeft(2, '0')}:${(d.inSeconds % 60).toString().padLeft(2, '0')}.${cs.toString().padLeft(2, '0')}';
  }
  static String timer(Duration d) {
    if (d.inHours >= 1) {
      return '${d.inHours}:${(d.inMinutes % 60).toString().padLeft(2, '0')}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';
    }
    return '${d.inMinutes.toString().padLeft(2, '0')}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';
  }
}

/// FAZ 8 — SAAT decoy'u. GERÇEK işlevler: canlı saat+tarih, alarm (uygulama
/// açıkken çalar), kronometre (tur süreli), zamanlayıcı (ilerleme halkalı).
/// Tetikleyici: gizli saat değerinde (ör: 12:34) alarm eklenmeye çalışılınca.
class ClockDecoy extends ConsumerStatefulWidget {
  final VoidCallback onTrigger;
  const ClockDecoy({super.key, required this.onTrigger});

  static const a1 = Color(0xFF0C0F14);

  @override
  ConsumerState<ClockDecoy> createState() => _ClockDecoyState();
}

class _DecoyAlarm {
  final String time; // "HH:MM"
  bool enabled = true;
  _DecoyAlarm(this.time);
}

class _ClockDecoyState extends ConsumerState<ClockDecoy> with SingleTickerProviderStateMixin {
  late final TabController _tab;
  Timer? _ticker;
  DateTime _now = DateTime.now();
  // FAZ 11: brute-force freni (aynı saat adayı 800ms'de en çok 1 kez doğrulanır)
  String? _lastCand;
  int? _lastTryMs;

  final List<_DecoyAlarm> _alarms = [];
  String? _ringing; // çalan alarm/zamanlayıcı etiketi

  // kronometre
  final Stopwatch _sw = Stopwatch();
  final List<Duration> _laps = [];
  Duration _swShown = Duration.zero;
  bool _swRunning = false;

  // zamanlayıcı
  Duration _timerTotal = const Duration(minutes: 5);
  Duration _timerLeft = Duration.zero;
  bool _timerRunning = false;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 3, vsync: this);
    _ticker = Timer.periodic(const Duration(milliseconds: 100), (_) => _tick());
  }

  void _tick() {
    final now = DateTime.now();
    setState(() {
      _now = now;
      if (_swRunning) _swShown = _sw.elapsed;
      if (_timerRunning) {
        _timerLeft = _timerTotal - _swElapsedForTimer();
        if (_timerLeft <= Duration.zero) {
          _timerRunning = false;
          _timerLeft = Duration.zero;
          _ringing = 'Zamanlayıcı';
        }
      }
      // alarm kontrolü — dakika ve saniye 0 iken tetikle
      for (final a in _alarms) {
        if (a.enabled && ClockFmt.hm(now) == a.time && now.second == 0) {
          _ringing = 'Alarm ${a.time}';
        }
      }
    });
  }

  // kronometre ile aynı Stopwatch'ı zamanlayıcı için de kullanma — bağımsız:
  final Stopwatch _timerSw = Stopwatch();
  Duration _timerBank = Duration.zero;
  Duration _swElapsedForTimer() => _timerBank + _timerSw.elapsed;

  @override
  void dispose() {
    _ticker?.cancel();
    _tab.dispose();
    super.dispose();
  }

  // ---------- tetikleyici: gizli saatte alarm oluşturma ----------
  Future<void> _pickAlarm() async {
    final t = await showTimePicker(context: context, initialTime: TimeOfDay.now());
    if (t == null) return;
    final normalized = TriggerNorm.normalize('clock', '${t.hour}:${t.minute}');
    final auth = ref.read(authProvider.notifier);
    if (await auth.hasDecoyTrigger('clock') &&
        allowTriggerAttempt(
            candidate: normalized,
            lastCandidate: _lastCand,
            lastAttemptMs: _lastTryMs,
            nowMs: DateTime.now().millisecondsSinceEpoch) &&
        await auth.verifyDecoyTrigger('clock', normalized)) {
      _lastCand = normalized;
      _lastTryMs = DateTime.now().millisecondsSinceEpoch;
      // FAZ 10: başarılı gizli açılış — tetikleyicinin kendisi loglanMAZ.
      ref.read(securityLogProvider.notifier).add('triggerOk', 'Saat kimliği');
      widget.onTrigger();
      return; // gizli kapı — görünür alarm oluşturulmaz
    }
    setState(() {
      final time =
          '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';
      if (_alarms.any((a) => a.time == time)) return;
      _alarms.add(_DecoyAlarm(time));
      _alarms.sort((a, b) => a.time.compareTo(b.time));
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ClockDecoy.a1,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('Saat', style: TextStyle(fontWeight: FontWeight.w600)),
        bottom: TabBar(
          controller: _tab,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white38,
          tabs: const [Tab(text: 'SAAT'), Tab(text: 'KRONOMETRE'), Tab(text: 'ZAMANLAYICI')],
        ),
      ),
      body: Stack(
        children: [
          TabBarView(
            controller: _tab,
            children: [_clockTab(), _stopwatchTab(), _timerTab()],
          ),
          if (_ringing != null) _ringingOverlay(_ringing!),
        ],
      ),
    );
  }

  // ---------- SAAT ----------
  Widget _clockTab() {
    return Column(
      children: [
        const SizedBox(height: 20),
        Text(ClockFmt.hms(_now),
            style: const TextStyle(fontSize: 52, fontWeight: FontWeight.w200, color: Colors.white, letterSpacing: 2)),
        const SizedBox(height: 4),
        Text(_trDate(_now), style: const TextStyle(color: Colors.white54, fontSize: 14)),
        const SizedBox(height: 16),
        Expanded(
          child: _alarms.isEmpty
              ? const Center(child: Text('Alarm yok', style: TextStyle(color: Colors.white30)))
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  itemCount: _alarms.length,
                  itemBuilder: (_, i) {
                    final a = _alarms[i];
                    return ListTile(
                      title: Text(a.time, style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w300)),
                      subtitle: const Text('Alarm', style: TextStyle(color: Colors.white38, fontSize: 12)),
                      trailing: Switch(
                        value: a.enabled,
                        onChanged: (v) => setState(() => a.enabled = v),
                      ),
                      onLongPress: () => setState(() => _alarms.removeAt(i)),
                    );
                  },
                ),
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: FloatingActionButton(
            onPressed: _pickAlarm,
            backgroundColor: Colors.white,
            foregroundColor: Colors.black,
            child: const Icon(Icons.add_alarm),
          ),
        ),
      ],
    );
  }

  // ---------- KRONOMETRE ----------
  Widget _stopwatchTab() {
    return Column(
      children: [
        const SizedBox(height: 40),
        Text(ClockFmt.stopwatch(_swShown),
            style: const TextStyle(fontSize: 54, fontWeight: FontWeight.w200, color: Colors.white, fontFeatures: [])),
        const SizedBox(height: 26),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _roundBtn(_swRunning ? 'Duraklat' : 'Başlat', _swRunning ? Colors.orange : Colors.green, () {
              setState(() {
                if (_swRunning) {
                  _sw.stop();
                } else {
                  _sw.start();
                }
                _swRunning = !_swRunning;
              });
            }),
            const SizedBox(width: 16),
            _roundBtn('Tur', Colors.blueGrey, _swRunning
                ? () => setState(() => _laps.insert(0, _swShown))
                : null),
            const SizedBox(width: 16),
            _roundBtn('Sıfırla', Colors.redAccent, _swRunning ? null : () {
              setState(() {
                _sw.stop();
                _sw.reset();
                _swShown = Duration.zero;
                _swRunning = false;
                _laps.clear();
              });
            }),
          ],
        ),
        const SizedBox(height: 20),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 40),
            itemCount: _laps.length,
            itemBuilder: (_, i) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Tur ${_laps.length - i}', style: const TextStyle(color: Colors.white38, fontSize: 13)),
                  Text(ClockFmt.stopwatch(_laps[i]), style: const TextStyle(color: Colors.white70, fontSize: 15)),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ---------- ZAMANLAYICI ----------
  Widget _timerTab() {
    final running = _timerRunning || _timerLeft > Duration.zero;
    final progress = _timerTotal.inSeconds == 0 ? 0.0 : (_timerLeft.inMilliseconds / _timerTotal.inMilliseconds);
    return Column(
      children: [
        const SizedBox(height: 30),
        if (!running) ...[
          const Text('Süre seç', style: TextStyle(color: Colors.white54)),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (final m in const [1, 5, 10, 15, 25, 45])
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 5),
                  child: ChoiceChip(
                    label: Text('$m dk'),
                    selected: _timerTotal.inMinutes == m,
                    onSelected: (_) => setState(() => _timerTotal = Duration(minutes: m)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                onPressed: () => setState(() {
                  final sec = (_timerTotal.inSeconds - 60).clamp(60, 36000);
                  _timerTotal = Duration(seconds: sec);
                }),
                icon: const Icon(Icons.remove_circle_outline, color: Colors.white54, size: 32),
              ),
              Text(ClockFmt.timer(_timerTotal),
                  style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w200, color: Colors.white)),
              IconButton(
                onPressed: () => setState(() {
                  final sec = (_timerTotal.inSeconds + 60).clamp(60, 36000);
                  _timerTotal = Duration(seconds: sec);
                }),
                icon: const Icon(Icons.add_circle_outline, color: Colors.white54, size: 32),
              ),
            ],
          ),
        ] else ...[
          SizedBox(
            width: 190,
            height: 190,
            child: Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(
                  width: 190,
                  height: 190,
                  child: CircularProgressIndicator(
                    value: progress.clamp(0.0, 1.0),
                    strokeWidth: 7,
                    backgroundColor: Colors.white12,
                    color: Colors.white,
                  ),
                ),
                Text(ClockFmt.timer(_timerLeft),
                    style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w200, color: Colors.white)),
              ],
            ),
          ),
        ],
        const SizedBox(height: 30),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _roundBtn(_timerRunning ? 'Duraklat' : 'Başlat', _timerRunning ? Colors.orange : Colors.green, () {
              setState(() {
                if (_timerRunning) {
                  _timerSw.stop();
                  _timerBank += _timerSw.elapsed;
                  _timerSw.reset();
                  _timerLeft = _timerTotal - _timerBank;
                } else {
                  if (_timerLeft <= Duration.zero) {
                    _timerBank = Duration.zero;
                    _timerLeft = _timerTotal;
                  }
                  _timerSw.reset();
                  _timerSw.start();
                }
                _timerRunning = !_timerRunning;
              });
            }),
            const SizedBox(width: 16),
            _roundBtn('İptal', Colors.redAccent, running
                ? () => setState(() {
                      _timerRunning = false;
                      _timerSw.stop();
                      _timerSw.reset();
                      _timerBank = Duration.zero;
                      _timerLeft = Duration.zero;
                    })
                : null),
          ],
        ),
      ],
    );
  }

  Widget _roundBtn(String label, Color color, VoidCallback? onTap) {
    return Material(
      color: onTap == null ? Colors.white10 : color.withValues(alpha: 0.85),
      borderRadius: BorderRadius.circular(40),
      child: InkWell(
        borderRadius: BorderRadius.circular(40),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
          child: Text(label, style: TextStyle(color: onTap == null ? Colors.white24 : Colors.black, fontWeight: FontWeight.w700)),
        ),
      ),
    );
  }

  Widget _ringingOverlay(String label) {
    return Container(
      color: Colors.black87,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.alarm_on, size: 72, color: Colors.white),
            const SizedBox(height: 16),
            Text(label, style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w600)),
            const SizedBox(height: 26),
            _roundBtn('Kapat', Colors.white, () => setState(() => _ringing = null)),
          ],
        ),
      ),
    );
  }

  static const _months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  static const _days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

  String _trDate(DateTime d) => '${d.day} ${_months[d.month - 1]} ${d.year} ${_days[d.weekday - 1]}';
}
