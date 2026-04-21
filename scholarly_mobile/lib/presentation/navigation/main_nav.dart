import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';
import '../views/dashboard_view.dart';
import '../views/library_view.dart';
import '../views/settings_view.dart';

class MainNav extends StatefulWidget {
  const MainNav({Key? key}) : super(key: key);

  @override
  State<MainNav> createState() => _MainNavState();
}

class _MainNavState extends State<MainNav> {
  int _currentIndex = 0;

  final List<Widget> _views = [
    const DashboardView(),
    const LibraryView(),
    const SettingsView(),
  ];

  @override
  Widget build(BuildContext context) {
    // Scaffold background is transparent, so wrapping it all in Container
    return Container(
      decoration: AppTheme.gradientBackground,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: _views[_currentIndex],
        bottomNavigationBar: BottomNavigationBar(
          backgroundColor: Colors.black.withOpacity(0.5),
          selectedItemColor: AppTheme.lightAccent,
          unselectedItemColor: Colors.white54,
          currentIndex: _currentIndex,
          onTap: (index) {
            setState(() {
              _currentIndex = index;
            });
          },
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'Dashboard'),
            BottomNavigationBarItem(icon: Icon(Icons.library_books), label: 'Library'),
            BottomNavigationBarItem(icon: Icon(Icons.settings), label: 'Settings'),
          ],
        ),
      ),
    );
  }
}
