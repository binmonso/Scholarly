import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../../core/theme/app_theme.dart';
import '../../core/network/research_service.dart';
import '../../models/chat_message_model.dart';

class ChatScreen extends StatefulWidget {
  final String paperId;
  final String paperTitle;

  const ChatScreen({
    Key? key,
    required this.paperId,
    required this.paperTitle,
  }) : super(key: key);

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final ResearchService _researchService = ResearchService();
  final TextEditingController _textController = TextEditingController();
  final List<ChatMessage> _messages = [];
  bool _isLoading = true;
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    try {
      final history = await _researchService.getHistory(widget.paperId);
      // Backend likely returns list of Q & A dicts, adapt logic based on real API schema
      final loadedMessages = history.map((e) => ChatMessage.fromJson(e as Map<String, dynamic>)).toList();
      setState(() {
        // Reverse because Listview is reversed (newest bottom)
        _messages.addAll(loadedMessages.reversed); 
        _isLoading = false;
      });
    } catch (e) {
      // Mock Data if API not ready
      setState(() {
        _isLoading = false;
        _messages.add(ChatMessage(text: 'Hello! I am ready to answer questions about this paper.', isUser: false));
      });
    }
  }

  Future<void> _sendMessage() async {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    _textController.clear();
    setState(() {
      _messages.insert(0, ChatMessage(text: text, isUser: true));
      _isSending = true;
    });

    try {
      final response = await _researchService.askQuestion(widget.paperId, text);
      setState(() {
        _messages.insert(0, ChatMessage.fromJson(response));
        _isSending = false;
      });
    } catch (e) {
      setState(() {
        _isSending = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  Widget _buildSourcesList(List<String> sources) {
    if (sources.isEmpty) return const SizedBox.shrink();

    return Container(
      height: 80,
      margin: const EdgeInsets.only(top: 8.0),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: sources.length,
        itemBuilder: (context, index) {
          return Container(
            width: 220,
            margin: const EdgeInsets.only(right: 8.0),
            padding: const EdgeInsets.all(8.0),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(8.0),
              border: Border.all(color: Colors.white12),
            ),
            child: SingleChildScrollView(
              child: Text(
                sources[index],
                style: const TextStyle(color: Colors.white70, fontSize: 11, fontStyle: FontStyle.italic),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildMessageBubble(ChatMessage message) {
    return Align(
      alignment: message.isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 16.0),
        padding: const EdgeInsets.all(16.0),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.85,
        ),
        decoration: BoxDecoration(
          color: message.isUser ? AppTheme.lightAccent : Colors.black.withOpacity(0.4),
          borderRadius: BorderRadius.circular(20.0),
          border: Border.all(color: Colors.white.withOpacity(0.1)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            MarkdownBody(
              data: message.text,
              styleSheet: MarkdownStyleSheet(
                p: const TextStyle(color: Colors.white, fontSize: 15),
              ),
            ),
            if (!message.isUser && message.sources.isNotEmpty)
              _buildSourcesList(message.sources),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: AppTheme.gradientBackground,
      child: Scaffold(
        backgroundColor: Colors.transparent,
        appBar: AppBar(
          title: Text(widget.paperTitle, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.of(context).pop(),
          ),
        ),
        body: Column(
          children: [
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator(color: AppTheme.lightAccent))
                  : ListView.builder(
                      reverse: true, // Show latest messages at the bottom
                      itemCount: _messages.length,
                      itemBuilder: (context, index) {
                        return _buildMessageBubble(_messages[index]);
                      },
                    ),
            ),
            if (_isSending)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text("Thinking...", style: TextStyle(color: Colors.white54, fontStyle: FontStyle.italic)),
                ),
              ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.5),
              ),
              child: SafeArea(
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _textController,
                        style: const TextStyle(color: Colors.white),
                        decoration: InputDecoration(
                          hintText: 'Ask a question...',
                          hintStyle: const TextStyle(color: Colors.white54),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(24.0),
                            borderSide: BorderSide.none,
                          ),
                          filled: true,
                          fillColor: Colors.white.withOpacity(0.1),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 12.0),
                        ),
                        onSubmitted: (_) => _sendMessage(),
                      ),
                    ),
                    const SizedBox(width: 12.0),
                    Container(
                      decoration: const BoxDecoration(
                        color: AppTheme.lightAccent,
                        shape: BoxShape.circle,
                      ),
                      child: IconButton(
                        icon: const Icon(Icons.send, color: Colors.white),
                        onPressed: _sendMessage,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
