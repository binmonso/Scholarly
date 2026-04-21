class ChatMessage {
  final String text;
  final bool isUser;
  final List<String> sources; // List of source snippets

  ChatMessage({
    required this.text,
    required this.isUser,
    this.sources = const [],
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    // Depending on the Django API response shape
    // Assuming 'answer' or 'text' holds the main content
    // and 'sources' holds the list of source references/snippets
    List<String> parsedSources = [];
    if (json['sources'] != null && json['sources'] is List) {
      parsedSources = (json['sources'] as List).map((e) => e.toString()).toList();
    }

    return ChatMessage(
      text: json['text'] ?? json['answer'] ?? json['question'] ?? '',
      isUser: json['is_user'] ?? false, // Ensure backend provides this or default to false
      sources: parsedSources,
    );
  }
}
