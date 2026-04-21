import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;

class ResearchService {
  static const String baseUrl = 'http://10.0.2.2:8000';

  Future<Map<String, dynamic>> uploadResearch(File file) async {
    var uri = Uri.parse('$baseUrl/api/upload/');
    var request = http.MultipartRequest('POST', uri);
    
    // Add file to multipart request
    request.files.add(
      await http.MultipartFile.fromPath('file', file.path),
    );

    var response = await request.send();
    var responseData = await response.stream.bytesToString();
    
    if (response.statusCode == 200 || response.statusCode == 201) {
      return json.decode(responseData);
    } else {
      throw Exception('Failed to upload file: ${response.statusCode}');
    }
  }

  Future<List<dynamic>> getHistory(String paperId) async {
    var uri = Uri.parse('$baseUrl/api/history/$paperId/');
    var response = await http.get(uri);

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to load history');
    }
  }

  Future<Map<String, dynamic>> askQuestion(String paperId, String question) async {
    var uri = Uri.parse('$baseUrl/api/ask/');
    var response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json'},
      body: json.encode({
        'paper_id': paperId,
        'question': question,
      }),
    );

    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Failed to ask question: ${response.body}');
    }
  }
}
