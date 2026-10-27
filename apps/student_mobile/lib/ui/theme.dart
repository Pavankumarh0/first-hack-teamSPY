import 'package:flutter/material.dart';

/// Campus Mithra brand: teal and saffron on deep navy (as on the kiosk and website).
class Brand {
  static const teal = Color(0xFF0F9B8E);
  static const tealDark = Color(0xFF0A6C63);
  static const saffron = Color(0xFFF08A24);
  static const navy = Color(0xFF0B1020);
  static const surface = Color(0xFFF8FAFC);
  static const violet = Color(0xFF7C3AED);
}

ThemeData campusTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: Brand.teal,
    primary: Brand.tealDark,
    secondary: Brand.saffron,
    surface: Colors.white,
    brightness: Brightness.light,
  );
  final base = ThemeData(colorScheme: scheme, useMaterial3: true, scaffoldBackgroundColor: Brand.surface);
  return base.copyWith(
    appBarTheme: const AppBarTheme(backgroundColor: Colors.white, foregroundColor: Brand.navy, elevation: 0, scrolledUnderElevation: 1, centerTitle: false),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: Color(0xFFE2E8F0))),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Color(0xFFCBD5E1))),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size(64, 48), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: const Size(64, 48), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: Brand.teal.withValues(alpha: 0.15),
      labelTextStyle: WidgetStateProperty.all(const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
    ),
    chipTheme: base.chipTheme.copyWith(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
  );
}
