import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import '../core/constants.dart';
import '../models/models.dart';
import 'native_bridge.dart';
import 'security_policies.dart';

/// Güvenlik Merkezi olay kaydı. Cihaz içi json dosyasında tutulur (halka tampon, 300 kayıt).
/// ASLA PIN/parola/sembol/tetikleyici gibi sırlar loglanmaz.
class SecurityLogService extends StateNotifier<List<SecurityEvent>> {
  SecurityLogService() : super(const []);

  File? _file;

  Future<File> _logFile() async {
    if (_file != null) return _file!;
    final dir = await getApplicationDocumentsDirectory();
    _file = File('${dir.path}/security_log.json');
    return _file!;
  }

  Future<void> load() async {
    try {
      final f = await _logFile();
      if (!await f.exists()) return;
      final raw = jsonDecode(await f.readAsString()) as List;
      state = raw
          .map((e) => SecurityEvent.fromMap(Map<String, dynamic>.from(e)))
          .toList()
          .reversed
          .toList(growable: false);
    } catch (_) {
      state = const [];
    }
  }

  Future<void> add(String type, [String detail = '']) => addAt(type, detail, DateTime.now());

  Future<void> addAt(String type, String detail, DateTime at) async {
    // FAZ 10 — son savunma hattı: PIN benzeri rakam dizileri / sembol dizileri
    // günlüğe asla girmesin (gerçek sır değerleri zaten hiçbir çağrıcıda loglanmaz).
    final ev = SecurityEvent(at: at, type: type, detail: redactLogDetail(detail));
    final list = [ev, ...state];
    state = list.length > K.maxSecurityEvents ? list.sublist(0, K.maxSecurityEvents) : list;
    await _persist(state.reversed.toList());
  }

  /// Native kilit ekranı kuyruğundaki olayları log havuzuna aktarır.
  Future<void> drainNative() async {
    final events = await NativeBridge.drainNativeEvents();
    for (final e in events) {
      final ms = e['at'];
      await addAt(
        e['type'] as String? ?? 'unknown',
        e['detail'] as String? ?? '',
        ms is int ? DateTime.fromMillisecondsSinceEpoch(ms) : DateTime.now(),
      );
    }
  }

  Future<void> clear() async {
    state = const [];
    try {
      await (await _logFile()).writeAsString('[]');
    } catch (_) {}
  }

  Future<void> _persist(List<SecurityEvent> events) async {
    try {
      final f = await _logFile();
      await f.writeAsString(jsonEncode(events.map((e) => e.toMap()).toList()));
    } catch (_) {}
  }
}

final securityLogProvider =
    StateNotifierProvider<SecurityLogService, List<SecurityEvent>>((ref) => SecurityLogService());
