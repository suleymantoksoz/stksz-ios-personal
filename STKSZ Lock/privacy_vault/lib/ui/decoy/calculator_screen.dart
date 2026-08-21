import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../services/auth_service.dart';
import '../../services/security_log_service.dart';
import '../../services/security_policies.dart';

/// GERÇEK çalışan hesap makinesi decoy'u.
/// - + − × ÷ % ondalık, silme, temizleme ve geçmiş destekler.
/// - Arayüzde gizli giriş/şifre ifadesi YOKTUR; tetikleyici, normal ifade
///   yazımı içinde algılanır (ör. 2580+1 ardından "=").
class CalculatorScreen extends ConsumerStatefulWidget {
  final VoidCallback onTrigger;
  const CalculatorScreen({super.key, required this.onTrigger});

  @override
  ConsumerState<CalculatorScreen> createState() => _CalculatorScreenState();
}

class _CalculatorScreenState extends ConsumerState<CalculatorScreen> {
  String _expr = '';          // görünen ifade (× ÷ − sembolleriyle)
  final List<String> _history = [];
  String _raw = '';           // tetikleyici karşılaştırması için ham tuş dizisi
  // FAZ 11: tetikleyici brute-force freni (aynı ifadeyle '=' spam'i 800ms'de 1 kez)
  String? _lastCand;
  int? _lastTryMs;

  static const _opMap = {'×': '*', '÷': '/', '−': '-'};

  void _press(String k) {
    if (k == '=') {
      _equals();
      return;
    }
    setState(() {
      switch (k) {
        case 'C':
          _expr = '';
          _raw = '';
        case '⌫':
          if (_expr.isNotEmpty) _expr = _expr.substring(0, _expr.length - 1);
          if (_raw.isNotEmpty) _raw = _raw.substring(0, _raw.length - 1);
        case '%':
          _applyPercent();
        default:
          _expr += k;
          _raw += (k == '×' || k == '÷' || k == '−') ? _opMap[k]! : k;
      }
    });
  }

  void _applyPercent() {
    // mevcut sayıyı 100'e böler (standart hesap makinesi davranışı)
    final m = RegExp(r'(\d+\.?\d*)$').firstMatch(_expr.replaceAll('−', '-'));
    if (m == null) return;
    final numStr = m.group(0)!;
    final v = double.tryParse(numStr);
    if (v == null) return;
    final trimmed = _expr.substring(0, _expr.length - numStr.length);
    final scaled = _fmt(v / 100);
    _expr = trimmed + scaled;
    _raw = trimmed.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-') + scaled;
  }

  Future<void> _equals() async {
    final rawSnapshot = _raw;
    // Önce gizli tetikleyici kontrolü (varsa), sonra normal hesaplama.
    final auth = ref.read(authProvider.notifier);
    final triggerAllowed = allowTriggerAttempt(
        candidate: rawSnapshot,
        lastCandidate: _lastCand,
        lastAttemptMs: _lastTryMs,
        nowMs: DateTime.now().millisecondsSinceEpoch); // FAZ 11: '=' spam'ine fren
    if (triggerAllowed) {
      _lastCand = rawSnapshot;
      _lastTryMs = DateTime.now().millisecondsSinceEpoch;
    }
    if (triggerAllowed && await auth.hasCalcTrigger() && await auth.verifyCalcTrigger(rawSnapshot)) {
      // FAZ 10: başarılı gizli açılış. Fail loglanMAZ — her "=" zaten deneme
      // olur; sıradan hesaplama ile tetikleyici denemesi ayrıştırılamaz (dürüst sınır).
      ref.read(securityLogProvider.notifier).add('triggerOk', 'Hesap Makinesi kimliği');
      setState(() {
        _expr = '';
        _raw = '';
      });
      widget.onTrigger();
      return;
    }
    final result = _evaluate(_expr);
    if (!mounted) return;
    if (result != null) {
      final formatted = _fmt(result);
      setState(() {
        _history.insert(0, '$_expr = $formatted');
        if (_history.length > 12) _history.removeLast();
        _expr = formatted;
        _raw = formatted;
      });
    } else if (_expr.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Geçersiz ifade')));
    }
  }

  String _fmt(double v) {
    if (v == v.roundToDouble() && v.abs() < 1e15) return v.toInt().toString();
    var s = v.toStringAsFixed(8);
    while (s.contains('.') && s.endsWith('0')) { s = s.substring(0, s.length - 1); }
    if (s.endsWith('.')) s = s.substring(0, s.length - 1);
    return s;
  }

  /// Shunting-yard → RPN → değerlendirme. + - * / destekler, unary minus dahil.
  double? _evaluate(String expr) {
    if (expr.isEmpty) return null;
    final norm = expr.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-');
    final tokens = <String>[];
    final numBuf = StringBuffer();
    bool expectNumber = true;
    for (var i = 0; i < norm.length; i++) {
      final c = norm[i];
      final isDigit = (c.codeUnitAt(0) >= 48 && c.codeUnitAt(0) <= 57) || c == '.';
      if (isDigit) {
        numBuf.write(c);
        expectNumber = false;
      } else if ('+-*/'.contains(c)) {
        if (numBuf.isNotEmpty) {
          tokens.add(numBuf.toString());
          numBuf.clear();
        }
        if (c == '-' && expectNumber) {
          numBuf.write('-'); // unary minus
        } else {
          tokens.add(c);
          expectNumber = true;
        }
      } else {
        return null;
      }
    }
    if (numBuf.isNotEmpty) tokens.add(numBuf.toString());
    if (tokens.length < 3) return double.tryParse(tokens.isNotEmpty ? tokens[0] : '');

    final prec = {'+': 1, '-': 1, '*': 2, '/': 2};
    final output = <String>[];
    final ops = <String>[];
    for (final t in tokens) {
      if (double.tryParse(t) != null) {
        output.add(t);
      } else {
        while (ops.isNotEmpty && prec[ops.last]! >= prec[t]!) {
          output.add(ops.removeLast());
        }
        ops.add(t);
      }
    }
    while (ops.isNotEmpty) { output.add(ops.removeLast()); }

    final stack = <double>[];
    for (final t in output) {
      final v = double.tryParse(t);
      if (v != null) {
        stack.add(v);
      } else {
        if (stack.length < 2) return null;
        final b = stack.removeLast();
        final a = stack.removeLast();
        switch (t) {
          case '+': stack.add(a + b);
          case '-': stack.add(a - b);
          case '*': stack.add(a * b);
          case '/':
            if (b == 0) return null;
            stack.add(a / b);
        }
      }
    }
    return stack.length == 1 ? _rounded(stack[0]) : null;
  }

  double _rounded(double v) => double.parse(v.toStringAsFixed(10));

  @override
  Widget build(BuildContext context) {
    final buttons = [
      ['C', '⌫', '%', '÷'],
      ['7', '8', '9', '×'],
      ['4', '5', '6', '−'],
      ['1', '2', '3', '+'],
      ['0', '.', '=', '='],
    ];
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0C),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Hesap Makinesi', style: TextStyle(fontWeight: FontWeight.w500, letterSpacing: 0.4)),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // geçmiş
            SizedBox(
              height: 104,
              child: _history.isEmpty
                  ? const SizedBox.shrink()
                  : ListView.builder(
                      reverse: true,
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      itemCount: _history.length > 6 ? 6 : _history.length,
                      itemBuilder: (_, i) => Align(
                        alignment: Alignment.centerRight,
                        child: Text(_history[i],
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.28), fontSize: 14, height: 1.5)),
                      ),
                    ),
            ),
            // ekran
            Expanded(
              child: Container(
                alignment: Alignment.bottomRight,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: Text(
                    _expr.isEmpty ? '0' : _expr,
                    style: const TextStyle(fontSize: 56, fontWeight: FontWeight.w300, color: Colors.white),
                  ),
                ),
              ),
            ),
            // tuşlar
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 18),
              child: Column(
                children: [
                  for (var r = 0; r < buttons.length; r++)
                    Row(
                      children: [
                        for (var c = 0; c < 4; c++)
                          Expanded(
                            child: _CalcKey(
                              label: buttons[r][c],
                              hidden: r == 4 && c == 2,
                              isWide: r == 4 && c == 3,
                              isOp: '÷×−+='.contains(buttons[r][c]),
                              isUtil: 'C⌫%'.contains(buttons[r][c]),
                              onTap: () => _press(buttons[r][c]),
                              onLongPress: buttons[r][c] == 'C'
                                  ? () => setState(() { _history.clear(); _expr = ''; _raw = ''; })
                                  : null,
                            ),
                          ),
                      ],
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CalcKey extends StatelessWidget {
  final String label;
  final bool hidden;
  final bool isWide;
  final bool isOp;
  final bool isUtil;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  const _CalcKey({
    required this.label,
    required this.onTap,
    this.hidden = false,
    this.isWide = false,
    this.isOp = false,
    this.isUtil = false,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    if (hidden) return const SizedBox(height: 78);
    final bg = isOp ? const Color(0xFF22D3EE) : isUtil ? const Color(0xFF232327) : const Color(0xFF17171A);
    final fg = isOp ? Colors.black : Colors.white;
    return Padding(
      padding: const EdgeInsets.all(6),
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(isWide ? 40 : 20),
        child: InkWell(
          onTap: onTap,
          onLongPress: onLongPress,
          borderRadius: BorderRadius.circular(isWide ? 40 : 20),
          child: SizedBox(
            height: 66,
            child: Center(
              child: Text(
                label,
                style: TextStyle(fontSize: 26, fontWeight: isOp ? FontWeight.w700 : FontWeight.w400, color: fg),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
