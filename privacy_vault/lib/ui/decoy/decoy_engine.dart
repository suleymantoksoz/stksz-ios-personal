import 'package:flutter/material.dart';

import '../../models/models.dart';
import 'calculator_screen.dart';
import 'clock_decoy.dart';
import 'notes_decoy.dart';
import 'weather_decoy.dart';

/// FAZ 8 — Decoy Engine: seçilen gizli kimliği inşa eder.
/// Her decoy bağımsız bir modüldür; tetikleyici eşleşince [onTrigger] ateşlenir
/// → doğrulama → Gizli Kasa. (Hesap makinesi FAZ 7'den değişmeden çalışır.)
class DecoyHost extends StatelessWidget {
  final DecoyKind kind;
  final VoidCallback onTrigger;
  const DecoyHost({super.key, required this.kind, required this.onTrigger});

  @override
  Widget build(BuildContext context) {
    switch (kind) {
      case DecoyKind.notes:
        return NotesDecoy(onTrigger: onTrigger);
      case DecoyKind.clock:
        return ClockDecoy(onTrigger: onTrigger);
      case DecoyKind.weather:
        return WeatherDecoy(onTrigger: onTrigger);
      case DecoyKind.calculator:
      case DecoyKind.none:
        return CalculatorScreen(onTrigger: onTrigger);
    }
  }
}
