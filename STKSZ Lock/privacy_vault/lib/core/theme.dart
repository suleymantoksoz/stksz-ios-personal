import 'package:flutter/material.dart';

/// PRIVACY VAULT görsel kimliği — koyu, premium, sade.
class AppColors {
  AppColors._();
  static const bg = Color(0xFF06090F);
  static const surface = Color(0xFF0C1322);
  static const surface2 = Color(0xFF111B30);
  static const border = Color(0x14FFFFFF);

  static const cyan = Color(0xFF22D3EE); // vurgu (varsayılan)
  static const purple = Color(0xFFA78BFA); // gizli
  static const green = Color(0xFF34D399); // güvenli
  static const red = Color(0xFFF87171); // uyarı

  static const text = Color(0xFFE9F0FA);
  static const textDim = Color(0xFF8598B5);
}

class AppTheme {
  static ThemeData dark(Color accent) {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.bg,
      colorScheme: ColorScheme.dark(
        primary: accent,
        secondary: AppColors.purple,
        surface: AppColors.surface,
        error: AppColors.red,
        onPrimary: Colors.black,
        onSurface: AppColors.text,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(color: AppColors.text, fontSize: 18, fontWeight: FontWeight.w700, letterSpacing: 1.2),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: AppColors.border),
        ),
        margin: EdgeInsets.zero,
      ),
      textTheme: const TextTheme(
        headlineSmall: TextStyle(color: AppColors.text, fontWeight: FontWeight.w700),
        titleMedium: TextStyle(color: AppColors.text, fontWeight: FontWeight.w600),
        bodyMedium: TextStyle(color: AppColors.textDim, height: 1.35),
        labelLarge: TextStyle(color: AppColors.text, fontWeight: FontWeight.w600),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface2,
        hintStyle: const TextStyle(color: AppColors.textDim),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: accent,
          foregroundColor: Colors.black,
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.text,
          side: const BorderSide(color: AppColors.border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.surface,
        selectedItemColor: AppColors.cyan,
        unselectedItemColor: AppColors.textDim,
        type: BottomNavigationBarType.fixed,
        showUnselectedLabels: true,
        selectedLabelStyle: TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
        unselectedLabelStyle: TextStyle(fontSize: 11),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Colors.black : AppColors.textDim),
        trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? accent : AppColors.surface2),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.border, space: 1),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.surface2,
        contentTextStyle: const TextStyle(color: AppColors.text),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
