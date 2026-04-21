from django.urls import path
from .views import PDFUploadView, AskQuestionView, ChatHistoryView, LibraryView, ChronologyView, ChatSessionDetailView, ResearchPaperDetailView, ConceptMapView, ConceptChunkView

urlpatterns = [
    path('concept-map/<int:paper_id>/', ConceptMapView.as_view(), name='concept-map'),
    path('concept-chunks/<int:paper_id>/', ConceptChunkView.as_view(), name='concept-chunks'),
    path('upload/', PDFUploadView.as_view(), name='pdf-upload'),
    path('ask/', AskQuestionView.as_view(), name='ask-question'),
    path('history/<int:session_id>/', ChatHistoryView.as_view(), name='chat-history'),
    path('papers/', LibraryView.as_view(), name='library-list'),
    path('papers/<int:paper_id>/', ResearchPaperDetailView.as_view(), name='paper-detail'),
    path('chats/', ChronologyView.as_view(), name='chronology-list'),
    path('chats/<int:session_id>/', ChatSessionDetailView.as_view(), name='chat-detail'),
]