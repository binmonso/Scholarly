import 'package:flutter/material.dart';

class LibraryView extends StatelessWidget {
  const LibraryView({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return const SafeArea(
      child: Center(
        child: Text('Library View', style: TextStyle(color: Colors.white, fontSize: 24)),
      ),
    );
  }
}
