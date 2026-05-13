from django.db import models

import os

class ResearchPaper(models.Model):
    title = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    pdf_file = models.FileField(upload_to='papers/')
    concept_map_data = models.JSONField(blank=True, null=True)
    publication_year = models.IntegerField(blank=True, null=True)

    def delete(self, *args, **kwargs):
        if self.pdf_file and os.path.isfile(self.pdf_file.path):
            os.remove(self.pdf_file.path)
        super().delete(*args, **kwargs)

    def __str__(self):
        return self.title

class PaperChunk(models.Model):
    # Linking each chunk to its parent paper
    paper = models.ForeignKey(ResearchPaper, related_name='chunks', on_delete=models.CASCADE)
    
    # The actual "index card" text
    content = models.TextField()
    
    # Metadata to show the user where the answer came from
    page_number = models.IntegerField()
    
    # The "GPS Coordinates" (Vector). 
    # We use TextField because vectors are long lists of numbers.
    embedding_vector = models.TextField() 

    def __str__(self):
        return f"Chunk from {self.paper.title} - Page {self.page_number}"

class ChatSession(models.Model):
    paper = models.ForeignKey(ResearchPaper, related_name='chat_sessions', on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    title = models.CharField(max_length=255, default="New Chat")
    summary = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Session for {self.paper.title} at {self.created_at}"

class ChatMessage(models.Model):
    session = models.ForeignKey(ChatSession, related_name='messages', on_delete=models.CASCADE, null=True, blank=True)
    role = models.CharField(max_length=10, choices=[('user', 'User'), ('bot', 'Bot')])
    content = models.TextField()
    sources = models.JSONField(blank=True, null=True) # store sources for bot messages
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.role} message on {self.session.paper.title}"