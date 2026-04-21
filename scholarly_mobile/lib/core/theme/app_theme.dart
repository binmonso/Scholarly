import 'package:flutter/material.dart';

class AppTheme {
  static const Color darkPurple = Color(0xFF100720);
  static const Color mediumPurple = Color(0xFF2E1256);
  static const Color lightAccent = Color(0xFFB57BF3);

  static ThemeData get themeData {
    return ThemeData(
      brightness: Brightness.dark,
      primaryColor: lightAccent,
      scaffoldBackgroundColor: Colors.transparent, // Let gradient show through
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
      ),
      fontFamily: 'Inter',
      textTheme: const TextTheme(
        headlineLarge: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        titleLarge: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        bodyLarge: TextStyle(color: Colors.white70),
        bodyMedium: TextStyle(color: Colors.white60),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: lightAccent,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        ),
      ),
    );
  }

  static BoxDecoration get gradientBackground {
    return const BoxDecoration(
      gradient: LinearGradient(
        colors: [darkPurple, mediumPurple],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      ),
    );
  }
}
