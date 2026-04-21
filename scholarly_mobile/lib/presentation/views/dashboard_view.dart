import 'package:flutter/material.dart';
import '../../core/theme/glass_card.dart';
import 'chat_screen.dart';

class DashboardView extends StatelessWidget {
  const DashboardView({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Dashboard', style: Theme.of(context).textTheme.headlineLarge),
            const SizedBox(height: 24),
            GlassCard(
              onTap: () {
                // TODO: Target upload feature
              },
              child: const SizedBox(
                width: double.infinity,
                height: 120,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.upload_file, size: 48, color: Colors.white),
                    SizedBox(height: 8),
                    Text('Upload Research', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 32),
            Text('Recent Papers', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            Expanded(
              child: ListView.builder(
                itemCount: 3,
                itemBuilder: (context, index) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12.0),
                    child: GlassCard(
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (context) => ChatScreen(
                              paperId: 'sample-uuid-1234', 
                              paperTitle: 'Sample Paper ${index + 1}',
                            ),
                          ),
                        );
                      },
                      child: ListTile(
                        leading: const Icon(Icons.description, color: Colors.white70),
                        title: Text('Sample Paper ${index + 1}', style: const TextStyle(color: Colors.white)),
                        subtitle: Text('Last interacted 2h ago', style: TextStyle(color: Colors.white.withOpacity(0.5))),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
