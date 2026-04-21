import fitz  # PyMuPDF
import json
import numpy as np
import threading
import re
import google.generativeai as genai
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from .models import ResearchPaper, PaperChunk, ChatMessage, ChatSession

# Configure Gemini
genai.configure(api_key="AIzaSyA-7-xZC9h6JjI7ZJ4LLwDSaFRFgpVn6F0")

# --- Stage 4 Conflict Detection Logic ---
INCREASE_KEYWORDS = ["increase", "enhance", "promote", "stimulate", "upregulate"]
DECREASE_KEYWORDS = ["decrease", "inhibit", "suppress", "reduce", "downregulate"]

_pool_cache = {}

def get_keyword_pool_mean_vector(keywords, pool_name):
    if pool_name in _pool_cache:
        return _pool_cache[pool_name]
    
    try:
        # Use gemini-embedding-001
        res = genai.embed_content(
            model="models/gemini-embedding-001",
            content=keywords,
            task_type="retrieval_query"
        )
        vectors = [np.array(v) for v in res['embedding']]
        mean_vec = np.mean(vectors, axis=0)
        _pool_cache[pool_name] = mean_vec
        return mean_vec
    except Exception as e:
        print(f"Error batch-embedding {pool_name} keywords: {e}")
        return np.zeros(768)

def cosine_sim(a, b):
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0: return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))

def get_edge_polarity(edge_label):
    if not edge_label:
        return "neutral", 0.0

    inc_mean = get_keyword_pool_mean_vector(INCREASE_KEYWORDS, "increase")
    dec_mean = get_keyword_pool_mean_vector(DECREASE_KEYWORDS, "decrease")

    try:
        res = genai.embed_content(
            model="models/gemini-embedding-001",
            content=edge_label,
            task_type="retrieval_query"
        )
        edge_vec = np.array(res['embedding'])
    except Exception as e:
        print(f"Error embedding edge '{edge_label}': {e}")
        return "neutral", 0.0

    sim_inc = cosine_sim(edge_vec, inc_mean)
    sim_dec = cosine_sim(edge_vec, dec_mean)

    THRESHOLD = 0.5
    if sim_inc > sim_dec and sim_inc > THRESHOLD:
        return "increase", float(sim_inc)
    elif sim_dec > sim_inc and sim_dec > THRESHOLD:
        return "decrease", float(sim_dec)
    
    return "neutral", max(float(sim_inc), float(sim_dec))

def normalize_concept(concept_str):
    if not concept_str: return ""
    return re.sub(r'[^a-z0-9\s]', ' ', concept_str.lower()).strip()

def detect_conflicts(paper_id, current_graph):
    """
    Scans all other papers for conflicting claims based on node labels and polarities.
    Optimized to use sets for O(1) lookups.
    """
    all_papers = ResearchPaper.objects.exclude(id=paper_id)
    
    # Pre-compute global concepts dictionary
    global_concepts = {}
    for paper in all_papers:
        if not paper.concept_map_data:
            continue
            
        g = paper.concept_map_data
        
        # Build node id -> label mapping
        node_labels = {
            n['id']: normalize_concept(n.get('data', {}).get('label'))
            for n in g.get('nodes', []) if n.get('data', {}).get('label')
        }
                
        for e in g.get('edges', []):
            polarity = e.get('data', {}).get('polarity', 'neutral')
            if polarity == 'neutral': continue
                
            target_id = e.get('target')
            if target_id in node_labels:
                target_concept = node_labels[target_id]
                global_concepts.setdefault(target_concept, set()).add(polarity)

    # Process current graph nodes
    current_node_labels = {
        n['id']: normalize_concept(n.get('data', {}).get('label'))
        for n in current_graph.get('nodes', []) if n.get('data', {}).get('label')
    }
    
    # Map each node in current graph to the polarities it receives
    current_node_received_polarities = {}
    for e in current_graph.get('edges', []):
        polarity = e.get('data', {}).get('polarity', 'neutral')
        if polarity == 'neutral': continue
        
        target_id = e.get('target')
        if target_id:
            current_node_received_polarities.setdefault(target_id, set()).add(polarity)

    # Mark conflicts
    for n in current_graph.get('nodes', []):
        node_id = n['id']
        norm_label = current_node_labels.get(node_id)
        if not norm_label: continue
            
        polarities_here = current_node_received_polarities.get(node_id, set())
        polarities_elsewhere = global_concepts.get(norm_label, set())
        
        has_conflict = len(polarities_here) > 1
        
        if not has_conflict:
            for p_here in polarities_here:
                if any(p_ext != p_here for p_ext in polarities_elsewhere):
                    has_conflict = True
                    break
            
        if has_conflict:
            n.setdefault('data', {})['conflict'] = True

    return current_graph

class ConceptMapView(APIView):
    """
    GET /api/concept-map/<int:paper_id>/?refresh=true
    """
    def get(self, request, paper_id):
        force_refresh = request.query_params.get('refresh', 'false').lower() == 'true'
        try:
            paper = ResearchPaper.objects.get(id=paper_id)
        except ResearchPaper.DoesNotExist:
            return Response({"error": "Paper not found"}, status=404)
            
        if paper.concept_map_data and not force_refresh:
            return Response(paper.concept_map_data)
            
        # 1. Fetch deep context chunks (up to 15 semantic chunks ~ 4000 words)
        # This captures the abstract, introduction, and core methodology for high-quality graphs
        chunks = list(PaperChunk.objects.filter(paper_id=paper_id).order_by('page_number', 'id')[:15])
        if not chunks:
            return Response({"error": "No text chunks found for this paper"}, status=404)
            
        context_text = "\n\n".join([f"--- Page {c.page_number} ---\n{c.content}" for c in chunks])
        
        # 2. Prompt Gemini
        prompt = f"""
        Analyze the following text to extract a knowledge graph consisting of the 
        8-12 most critical scientific entities/concepts and their relationships.
        
        CRITICAL REQUIREMENT: 
        You MUST extract the data as triples (Subject-Predicate-Object) ensuring that 
        we capture the specific verbs or logical relationships connecting them.
        
        Return the result STRICTLY as a JSON object formatted for React Flow.
        Schema:
        {{
            "nodes": [
                {{"id": "node_id", "data": {{"label": "Concept Name"}}, "position": {{"x": 0, "y": 0}}}}
            ],
            "edges": [
                {{"id": "edge_id", "source": "source_node_id", "target": "target_node_id", "label": "Predicate/Relationship Description"}}
            ]
        }}
        
        TEXT CONTEXT:
        {context_text}
        """
        
        try:
            model = genai.GenerativeModel('gemini-flash-latest')
            try:
                response = model.generate_content(
                    prompt,
                    generation_config=genai.types.GenerationConfig(
                        response_mime_type="application/json"
                    )
                )
            except Exception as flash_e:
                print(f"Flash failed: {flash_e}. Attempting Pro fallback.")
                try:
                    model = genai.GenerativeModel('gemini-2.0-flash')
                    response = model.generate_content(
                        prompt,
                        generation_config=genai.types.GenerationConfig(
                            response_mime_type="application/json"
                        )
                    )
                except Exception as pro_e:
                    raise Exception(f"Flash Error: {flash_e} | Pro Error: {pro_e}")
            
            data = json.loads(response.text)
            
            # Post-process: Add Polarity
            for e in data.get('edges', []):
                pol, score = get_edge_polarity(e.get('label', ''))
                e.setdefault('data', {})['polarity'] = pol
            
            # Conflict Detection
            data = detect_conflicts(paper_id, data)
            
            # Save
            paper.concept_map_data = data
            paper.save(update_fields=['concept_map_data'])
            
            return Response(data)
        except Exception as e:
            return Response({"error": f"Failed to generate map: {str(e)}"}, status=500)

def update_session_summary(session_id):
    try:
        session = ChatSession.objects.get(id=session_id)
        messages = ChatMessage.objects.filter(session=session).order_by('created_at')
        if not messages.exists():
            return
            
        chat_text = "\n".join([f"{m.role}: {m.content}" for m in messages])
        prompt = f"Summarize this conversation briefly in one or two sentences:\n{chat_text}"
        
        model = genai.GenerativeModel('gemini-flash-latest')
        response = model.generate_content(prompt)
        session.summary = response.text
        session.save(update_fields=['summary'])
    except Exception as e:
        print(f"Failed to generate summary: {e}", flush=True)

class PDFUploadView(APIView):

    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"error": "No file uploaded"}, status=400)

        ext = file_obj.name.split('.')[-1].lower() if '.' in file_obj.name else ''
        if ext not in ['pdf', 'epub', 'docx', 'doc', 'txt', 'md']:
            return Response({"error": f"Unsupported file format: .{ext}. Please upload PDF, EPUB, DOCX, DOC, TXT, or MD."}, status=400)

        # 1. Save Paper Metadata
        paper = ResearchPaper.objects.create(
            title=file_obj.name,
            pdf_file=file_obj
        )
        file_obj.seek(0)
        
        full_text_data = []
        
        # 2. Extract Text based on file type
        if ext == 'pdf':
            doc = fitz.open(stream=file_obj.read(), filetype="pdf")
            for page_num, page in enumerate(doc):
                full_text_data.append((page_num + 1, page.get_text()))
        elif ext == 'docx':
            import mammoth
            result = mammoth.extract_raw_text(file_obj)
            text = result.value
            full_text_data.append((1, text))
        elif ext == 'epub':
            import ebooklib
            from ebooklib import epub
            from bs4 import BeautifulSoup
            import tempfile
            import os
            
            with tempfile.NamedTemporaryFile(delete=False, suffix='.epub') as temp_file:
                for chunk in file_obj.chunks():
                    temp_file.write(chunk)
                temp_file_path = temp_file.name
                
            try:
                book = epub.read_epub(temp_file_path)
                page_num = 1
                for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
                    soup = BeautifulSoup(item.get_body_content(), 'html.parser')
                    text = soup.get_text(separator=' ')
                    if len(text.strip()) > 10:
                        full_text_data.append((page_num, text))
                        page_num += 1
            finally:
                os.remove(temp_file_path)
        elif ext in ['txt', 'md']:
            # Plain text files — read directly, skip OCR
            raw_bytes = file_obj.read()
            text = raw_bytes.decode('utf-8', errors='replace')
            full_text_data.append((1, text))
        elif ext == 'doc':
            # Legacy .doc — try mammoth (works for many .doc files)
            import mammoth
            result = mammoth.extract_raw_text(file_obj)
            text = result.value
            full_text_data.append((1, text))

        # 3. Semantic Sentence-Aware Chunking (~250 words)
        chunks = []
        for page_id, text in full_text_data:
            # Clean and normalize text
            text = re.sub(r'\s+', ' ', text).strip()
            
            # Split by sentence boundaries (period, question mark, exclamation point followed by space)
            sentences = re.split(r'(?<=[.!?])\s+', text)
            
            current_chunk = []
            current_word_count = 0
            
            for sentence in sentences:
                words = sentence.split()
                if not words: continue
                
                current_chunk.extend(words)
                current_word_count += len(words)
                
                # Target chunk size is ~250 words for optimal context retention
                if current_word_count >= 250:
                    chunk_str = " ".join(current_chunk)
                    chunks.append({"page": page_id, "text": chunk_str})
                    
                    # Overlap: retain the last ~50 words for continuity
                    current_chunk = current_chunk[-50:]
                    current_word_count = len(current_chunk)

            # Flush remaining chunk if it has substantive content
            if current_word_count > 25:
                chunk_str = " ".join(current_chunk)
                chunks.append({"page": page_id, "text": chunk_str})

        # 4. Generate Contextualized Embeddings
        batch_size = 100
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i+batch_size]
            try:
                # Prepend the title to contextualize the chunk for the embedding model
                batch_texts = [f"Title: {paper.title}\n{item['text']}" for item in batch]
                
                res = genai.embed_content(
                    model="models/gemini-embedding-001",
                    content=batch_texts,
                    task_type="retrieval_document"
                )
                
                embeddings = res['embedding']
                
                # Bulk insert chunks for maximum database efficiency
                new_chunks = [
                    PaperChunk(
                        paper=paper,
                        content=item['text'],
                        page_number=item['page'],
                        embedding_vector=json.dumps(emb)
                    )
                    for item, emb in zip(batch, embeddings)
                ]
                PaperChunk.objects.bulk_create(new_chunks)
                
            except Exception as e:
                print(f"Critical Embedding Error: {e}")

        return Response({
            "message": "Paper deeply analyzed and vectorized successfully", 
            "paper_id": paper.id, 
            "chunks_created": len(chunks)
        })

class AskQuestionView(APIView):
    def post(self, request):
        paper_id = request.data.get('paper_id')
        question = request.data.get('question')
        if not paper_id or not question:
            return Response({"error": "Missing paper_id or question"}, status=400)

        session_id = request.data.get('session_id')
        if session_id:
            try:
                session = ChatSession.objects.get(id=session_id)
            except ChatSession.DoesNotExist:
                return Response({"error": "Session not found"}, status=404)
        else:
            session = ChatSession.objects.create(paper_id=paper_id, title=question[:50] + "...")

        # 1. Get chunks for this paper
        chunks = PaperChunk.objects.filter(paper_id=paper_id)
        if not chunks.exists():
            return Response({"error": "No data found for this paper ID"}, status=404)
        
        print("--- AVAILABLE MODELS ---", flush=True)
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
             print(f"MODEL: {m.name}", flush=True)
        print("------------------------", flush=True)
        # 2. Embed the user's question
        q_res = genai.embed_content(
            model="models/gemini-embedding-001",
            content=question,
            task_type="retrieval_query"
        )
        q_vector = np.array(q_res['embedding'])
        
        # DEBUG: Verify dimensions
        print(f"\n[DEBUG] Question Vector Dim: {len(q_vector)}", flush=True)

        # 3. Calculate Cosine Similarity
        scored_chunks = []
        for chunk in chunks:
            c_vector = np.array(json.loads(chunk.embedding_vector))
            
            # Math
            dot_product = np.dot(q_vector, c_vector)
            norm_q = np.linalg.norm(q_vector)
            norm_c = np.linalg.norm(c_vector)
            similarity = dot_product / (norm_q * norm_c)
            
            scored_chunks.append((similarity, chunk))
            # Debugging similarity per chunk
            print(f"[DEBUG] Chunk {chunk.id} | Score: {similarity:.4f}", flush=True)

        # 4. Sort and select top 3
        scored_chunks.sort(key=lambda x: x[0], reverse=True)
        top_matches = scored_chunks[:3]
        
        # Log the highest score to terminal
        if top_matches:
            print(f"--- WINNING SCORE: {top_matches[0][0]:.4f} ---", flush=True)

        # 5. Build Context for LLM
        context_text = "\n\n".join([
            f"Source (Page {c.page_number}): {c.content}" 
            for score, c in top_matches
        ])

        # 6. Generate Grounded Answer (Using Gemini 3 Flash)
        model = genai.GenerativeModel('gemini-flash-latest') # Or 'gemini-1.5-flash' depending on your tier
        prompt = f"""
        You are a research assistant. Use the context below to answer the user's question.
        Guidelines:
        - Use ONLY the provided context.
        - If the answer isn't there, say "I cannot find the answer in the provided document."
        - Cite the page number in your answer.

        CONTEXT:
        {context_text}

        USER QUESTION:
        {question}
        """

        response = model.generate_content(prompt)

        # Build sources list
        sources_list = [{"page": c.page_number, "content": c.content} for score, c in top_matches]

        # Save the user and bot messages to the database
        ChatMessage.objects.create(
            session=session,
            role='user',
            content=question
        )
        ChatMessage.objects.create(
            session=session,
            role='bot',
            content=response.text,
            sources=sources_list
        )

        # Spawn background thread to update the session summary
        threading.Thread(target=update_session_summary, args=(session.id,)).start()

        return Response({
            "answer": response.text,
            "sources": sources_list,
            "session_id": session.id
        })

class LibraryView(APIView):
    def get(self, request):
        papers = ResearchPaper.objects.all().order_by('-uploaded_at')
        return Response([
            {"id": p.id, "name": p.title, "uploaded_at": p.uploaded_at} for p in papers
        ])

class ResearchPaperDetailView(APIView):
    def delete(self, request, paper_id):
        try:
            paper = ResearchPaper.objects.get(id=paper_id)
            paper.delete()
            return Response({"message": "Paper and associated connections deleted successfully"}, status=200)
        except ResearchPaper.DoesNotExist:
            return Response({"error": "Paper not found"}, status=404)

class ChronologyView(APIView):
    def get(self, request):
        sessions = ChatSession.objects.all().order_by('-updated_at')
        return Response([
            {
                "id": s.id, 
                "paper_id": s.paper_id,
                "paper_title": s.paper.title,
                "title": s.title,
                "summary": s.summary,
                "updated_at": s.updated_at
            } for s in sessions
        ])

class ChatSessionDetailView(APIView):
    def patch(self, request, session_id):
        try:
            session = ChatSession.objects.get(id=session_id)
        except ChatSession.DoesNotExist:
            return Response({"error": "Session not found"}, status=404)
        
        new_title = request.data.get('title')
        if new_title:
            session.title = new_title
            session.save(update_fields=['title'])
            return Response({"message": "Session renamed successfully", "title": session.title})
        return Response({"error": "No title provided"}, status=400)

    def delete(self, request, session_id):
        try:
            session = ChatSession.objects.get(id=session_id)
            paper = session.paper
            session.delete()
            # Also delete the associated paper
            if paper:
                paper.delete()
            return Response({"message": "Session and associated paper deleted successfully"}, status=200)
        except ChatSession.DoesNotExist:
            return Response({"error": "Session not found"}, status=404)

class ChatHistoryView(APIView):
    def get(self, request, session_id):
        try:
            session = ChatSession.objects.get(id=session_id)
        except ChatSession.DoesNotExist:
            return Response({"error": "Session not found"}, status=404)
        
        messages = ChatMessage.objects.filter(session=session).order_by('created_at')
        
        history = []
        for msg in messages:
            history.append({
                "role": msg.role,
                "content": msg.content,
                "sources": msg.sources or []
            })
            
        return Response(history)



class ConceptChunkView(APIView):
    """
    GET /api/concept-chunks/<int:paper_id>/?concept=<label>
    
    Given a concept label from the knowledge graph, retrieves the top 3 most
    relevant text chunks from the paper using cosine-similarity search.
    This connects map nodes back to the original RAG evidence.
    """
    def get(self, request, paper_id):
        concept = request.query_params.get('concept', '').strip()
        if not concept:
            return Response({"error": "Missing 'concept' query parameter"}, status=400)

        try:
            paper = ResearchPaper.objects.get(id=paper_id)
        except ResearchPaper.DoesNotExist:
            return Response({"error": "Paper not found"}, status=404)

        chunks = PaperChunk.objects.filter(paper_id=paper_id)
        if not chunks.exists():
            return Response({"error": "No text chunks found for this paper"}, status=404)

        # Embed the concept label
        q_res = genai.embed_content(
            model="models/gemini-embedding-001",
            content=concept,
            task_type="retrieval_query"
        )
        q_vector = np.array(q_res['embedding'])

        # Cosine similarity against all chunks
        scored_chunks = []
        for chunk in chunks:
            c_vector = np.array(json.loads(chunk.embedding_vector))
            dot_product = np.dot(q_vector, c_vector)
            norm_q = np.linalg.norm(q_vector)
            norm_c = np.linalg.norm(c_vector)
            similarity = dot_product / (norm_q * norm_c)
            scored_chunks.append((similarity, chunk))

        scored_chunks.sort(key=lambda x: x[0], reverse=True)
        top_matches = scored_chunks[:3]

        results = [
            {"page": c.page_number, "content": c.content}
            for score, c in top_matches
        ]

        return Response(results)