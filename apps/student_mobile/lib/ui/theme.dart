import 'package:flutter/material.dart';

/// Campus Mithra poster style (shared with the website): warm paper, thick ink
/// outlines, condensed headlines, pill buttons and flat colour blocks.
class Brand {
  // palette
  static const ink = Color(0xFF1D1A16);
  static const cream = Color(0xFFE9DCC5);
  static const paper = Color(0xFFF7F0E3);
  static const sun = Color(0xFFF1BD3B);
  static const tangerine = Color(0xFFEE7A22);
  static const bubblegum = Color(0xFFEA8CC1);
  static const periwinkle = Color(0xFF7D8DD6);
  static const mint = Color(0xFF56B49C);
  static const tomato = Color(0xFFD9472B);
  static const muted = Color(0xFF5F5446);

  // Older names, re-tuned so every screen follows the palette.
  static const teal = mint;
  static const tealDark = Color(0xFF2B7562);
  static const saffron = tangerine;
  static const navy = ink;
  static const surface = cream;
  static const violet = Color(0xFFB0478A);
}

/// Headline font: Bricolage Grotesque, condensed ExtraBold (bundled).
const posterFont = 'Poster';
const titleFont = 'Bricolage';

/// The ink outline every block, button and field shares.
const inkBorder = BorderSide(color: Brand.ink, width: 2);

ThemeData campusTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: Brand.sun,
    brightness: Brightness.light,
    primary: Brand.ink,
    onPrimary: Brand.paper,
    secondary: Brand.sun,
    onSecondary: Brand.ink,
    tertiary: Brand.mint,
    surface: Brand.paper,
    onSurface: Brand.ink,
    surfaceContainerHighest: const Color(0xFFE7DAC3),
    outline: Brand.ink,
    error: Brand.tomato,
  );
  final base = ThemeData(colorScheme: scheme, useMaterial3: true, scaffoldBackgroundColor: Brand.cream, fontFamily: 'Figtree');
  const pill = StadiumBorder(side: inkBorder);
  const buttonText = TextStyle(fontFamily: 'Figtree', fontWeight: FontWeight.w800, fontSize: 14, letterSpacing: 0.6);
  final rounded = BorderRadius.circular(26);

  return base.copyWith(
    textTheme: base.textTheme.copyWith(
      displayLarge: const TextStyle(fontFamily: posterFont, fontWeight: FontWeight.w800, height: 0.9, letterSpacing: -1.5, color: Brand.ink),
      displayMedium: const TextStyle(fontFamily: posterFont, fontWeight: FontWeight.w800, height: 0.9, letterSpacing: -1.2, color: Brand.ink),
      displaySmall: const TextStyle(fontFamily: posterFont, fontWeight: FontWeight.w800, height: 0.92, letterSpacing: -0.8, color: Brand.ink),
      headlineMedium: const TextStyle(fontFamily: posterFont, fontWeight: FontWeight.w800, height: 0.95, color: Brand.ink),
      headlineSmall: const TextStyle(fontFamily: titleFont, fontWeight: FontWeight.w800, color: Brand.ink),
      titleLarge: const TextStyle(fontFamily: titleFont, fontWeight: FontWeight.w800, color: Brand.ink),
      titleMedium: const TextStyle(fontFamily: titleFont, fontWeight: FontWeight.w700, color: Brand.ink),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Brand.cream,
      foregroundColor: Brand.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      shape: Border(bottom: inkBorder),
      titleTextStyle: TextStyle(fontFamily: posterFont, fontWeight: FontWeight.w800, fontSize: 28, letterSpacing: -0.5, color: Brand.ink),
    ),
    cardTheme: CardThemeData(
      color: Brand.paper,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: rounded, side: inkBorder),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Brand.paper,
      labelStyle: const TextStyle(fontWeight: FontWeight.w600, color: Brand.muted),
      floatingLabelStyle: const TextStyle(fontWeight: FontWeight.w800, color: Brand.ink),
      border: OutlineInputBorder(borderRadius: rounded, borderSide: inkBorder),
      enabledBorder: OutlineInputBorder(borderRadius: rounded, borderSide: inkBorder),
      focusedBorder: OutlineInputBorder(borderRadius: rounded, borderSide: const BorderSide(color: Brand.ink, width: 3)),
      errorBorder: OutlineInputBorder(borderRadius: rounded, borderSide: const BorderSide(color: Brand.tomato, width: 2)),
      focusedErrorBorder: OutlineInputBorder(borderRadius: rounded, borderSide: const BorderSide(color: Brand.tomato, width: 3)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Brand.sun,
        foregroundColor: Brand.ink,
        disabledBackgroundColor: const Color(0xFFE7DAC3),
        minimumSize: const Size(64, 52),
        padding: const EdgeInsets.symmetric(horizontal: 22),
        shape: pill,
        textStyle: buttonText,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(backgroundColor: Brand.ink, foregroundColor: Brand.paper, elevation: 0, minimumSize: const Size(64, 52), shape: pill, textStyle: buttonText),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(foregroundColor: Brand.ink, side: inkBorder, minimumSize: const Size(64, 52), shape: pill, textStyle: buttonText),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: Brand.ink, textStyle: buttonText)),
    iconButtonTheme: IconButtonThemeData(style: IconButton.styleFrom(foregroundColor: Brand.ink)),
    floatingActionButtonTheme: const FloatingActionButtonThemeData(
      backgroundColor: Brand.tangerine,
      foregroundColor: Brand.ink,
      elevation: 0,
      highlightElevation: 0,
      shape: StadiumBorder(side: inkBorder),
      extendedTextStyle: buttonText,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Brand.paper,
      surfaceTintColor: Colors.transparent,
      height: 72,
      indicatorColor: Brand.sun,
      indicatorShape: pill,
      iconTheme: WidgetStateProperty.all(const IconThemeData(color: Brand.ink)),
      labelTextStyle: WidgetStateProperty.resolveWith((s) => TextStyle(
            fontSize: 11.5,
            letterSpacing: 0.3,
            color: Brand.ink,
            fontWeight: s.contains(WidgetState.selected) ? FontWeight.w800 : FontWeight.w600,
          )),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: Brand.paper,
      selectedColor: Brand.ink,
      checkmarkColor: Brand.paper,
      side: inkBorder,
      shape: const StadiumBorder(side: inkBorder),
      labelStyle: const TextStyle(fontWeight: FontWeight.w700, color: Brand.ink),
      secondaryLabelStyle: const TextStyle(fontWeight: FontWeight.w700, color: Brand.paper),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Brand.paper,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: rounded, side: inkBorder),
      titleTextStyle: const TextStyle(fontFamily: titleFont, fontWeight: FontWeight.w800, fontSize: 22, color: Brand.ink),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Brand.paper,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(26)), side: inkBorder),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: Brand.ink,
      contentTextStyle: TextStyle(fontFamily: 'Figtree', fontWeight: FontWeight.w600, color: Brand.paper),
      shape: StadiumBorder(),
    ),
    tabBarTheme: const TabBarThemeData(
      labelColor: Brand.ink,
      unselectedLabelColor: Brand.muted,
      indicatorColor: Brand.ink,
      indicatorSize: TabBarIndicatorSize.tab,
      dividerColor: Brand.ink,
      indicator: UnderlineTabIndicator(borderSide: BorderSide(color: Brand.ink, width: 4)),
      labelStyle: TextStyle(fontFamily: 'Figtree', fontWeight: FontWeight.w800, fontSize: 14, letterSpacing: 0.4),
      unselectedLabelStyle: TextStyle(fontFamily: 'Figtree', fontWeight: FontWeight.w600, fontSize: 14),
    ),
    dividerTheme: const DividerThemeData(color: Color(0x331D1A16), thickness: 1.5),
    listTileTheme: const ListTileThemeData(iconColor: Brand.ink, titleTextStyle: TextStyle(fontFamily: 'Figtree', fontWeight: FontWeight.w700, fontSize: 16, color: Brand.ink)),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: Brand.ink, linearTrackColor: Color(0xFFE7DAC3)),
    checkboxTheme: CheckboxThemeData(
      side: inkBorder,
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Brand.ink : Colors.transparent),
      checkColor: WidgetStateProperty.all(Brand.paper),
    ),
    switchTheme: SwitchThemeData(
      trackOutlineColor: WidgetStateProperty.all(Brand.ink),
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Brand.paper : Brand.ink),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Brand.mint : Brand.paper),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        side: inkBorder,
        selectedBackgroundColor: Brand.ink,
        selectedForegroundColor: Brand.paper,
        foregroundColor: Brand.ink,
        textStyle: buttonText,
      ),
    ),
  );
}
