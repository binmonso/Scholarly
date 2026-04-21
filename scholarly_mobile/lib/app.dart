import 'package:flutter/material.dart';
import 'core/theme/app_theme.dart';
import 'presentation/navigation/main_nav.dart';

class ScholarlyApp extends StatelessWidget {
  const ScholarlyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Scholarly Mobile',
      theme: AppTheme.themeData,
      debugShowCheckedModeBanner: false,
      home: const MainNav(),
    );
  }
}
