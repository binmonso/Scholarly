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
import os
from dotenv import load_dotenv

# Load variables from .env
load_dotenv()

# Configure Gemini using the new .env key
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

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

DISCREDIT_KEYWORDS = ["fraud", "retracted", "manipulated", "bias", "conflict of interest", "flawed", "plagiarism"]

_nli_model = None
def get_nli_auditor():
    global _nli_model
    if _nli_model is None:
        try:
            from transformers import pipeline
            _nli_model = pipeline("text-classification", model="cross-encoder/nli-deberta-v3-small")
        except Exception as e:
            print(f"Failed to load NLI model: {e}")
            _nli_model = "failed"
    return _nli_model

def check_numerical_delta(label, current_chunks, other_chunks):
    pattern = re.compile(r'(\d+(?:\.\d+)?)\s*(mg|kg|%|g|ml|l|cm|mm|m|hz|v|w|nm|um)', re.IGNORECASE)
    curr_nums = set()
    other_nums = set()
    
    label_lower = label.lower()
    for c in current_chunks:
        if label_lower in c.content.lower():
            curr_nums.update(pattern.findall(c.content.lower()))
    for c in other_chunks:
        if label_lower in c.content.lower():
            other_nums.update(pattern.findall(c.content.lower()))
    
    if curr_nums and other_nums:
        if curr_nums.intersection(other_nums):
            return "gold"
        return "yellow"
    
    # Global Node State check across all chunks (if current paper has no nums but others do, or vice versa, it's still a variation if they differ, but if only one side has nums we can't be sure it's a conflict. Let's return yellow if they both have nums and differ.)
    return "none"

def audit_conflict(premise, hypothesis):
    # NLI Decision Gate
    auditor = get_nli_auditor()
    if auditor == "failed" or not auditor:
        # Fallback to simple matching if model fails to load
        return ("contradiction", 1.0) if premise != hypothesis else ("entailment", 1.0)
        
    try:
        # auditor returns e.g. [{'label': 'contradiction', 'score': 0.95}]
        # For cross-encoders, it's usually just a single dict or list of dicts
        res = auditor({"text": premise, "text_pair": hypothesis})
        if isinstance(res, list): res = res[0]
        
        label = res.get('label', '').lower()
        score = res.get('score', 1.0)
        
        if 'contradiction' in label: return ('contradiction', score)
        if 'neutral' in label: return ('neutral', score)
        return ('entailment', score)
    except:
        return ("contradiction", 1.0) if premise != hypothesis else ("entailment", 1.0)

def apply_ethical_heuristics(graph, paper_id):
    # Scan methodology chunks for the DISCREDIT_KEYWORDS pool to trigger Purple Nodes
    chunks = PaperChunk.objects.filter(paper_id=paper_id)
    bad_words_pattern = re.compile(r'\b(' + '|'.join(DISCREDIT_KEYWORDS) + r')\b', re.IGNORECASE)
    
    # We find chunks with discredit keywords
    suspicious_chunks = [c.content.lower() for c in chunks if bad_words_pattern.search(c.content.lower())]
    
    for n in graph.get('nodes', []):
        label = n.get('data', {}).get('label', '').lower()
        # If the node's concept is deeply associated with a suspicious chunk
        for text in suspicious_chunks:
            if label in text:
                n.setdefault('data', {})['node_type'] = 'purple'
                break
    return graph

def detect_conflicts(paper_id, current_graph, compare_to_id=None, max_year=None):
    """
    Stage 5 Semantic Auditor. Scans for conflicts using NLI and Vector logic.
    Executes if compare_to_id OR max_year is provided.
    """
    if not compare_to_id and not max_year:
        return current_graph

    if compare_to_id:
        all_papers = ResearchPaper.objects.filter(id=compare_to_id)
    else:
        all_papers = ResearchPaper.objects.exclude(id=paper_id)
        
    if max_year:
        try:
            all_papers = all_papers.filter(publication_year__lte=int(max_year))
        except ValueError:
            pass
            
    # Pre-fetch chunks for numerical delta check
    current_chunks = list(PaperChunk.objects.filter(paper_id=paper_id))
    other_chunks = list(PaperChunk.objects.filter(paper_id__in=[p.id for p in all_papers]))
    
    # Pre-compute global concepts dictionary
    global_concepts = {}
    for paper in all_papers:
        if not paper.concept_map_data:
            continue
            
        g = paper.concept_map_data
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

    # Mark conflicts via NLI Auditor
    for n in current_graph.get('nodes', []):
        if n.get('data', {}).get('node_type') == 'purple':
            continue # Purple overrides Red/Yellow
            
        node_id = n['id']
        norm_label = current_node_labels.get(node_id)
        if not norm_label: continue
        
        # Noun-Overlap Enforcement (Relevance Shield) with Methodological Critique Bypass
        words = set(re.findall(r'\b[a-z]{4,}\b', norm_label))
        other_text = " ".join([c.content.lower() for c in other_chunks])
        
        has_critique = any(keyword in other_text for keyword in DISCREDIT_KEYWORDS)
        
        if not has_critique and words and not any(w in other_text for w in words):
            n.setdefault('data', {})['node_type'] = 'baseline'
            n['data']['conflict'] = False
            continue
            
        polarities_here = current_node_received_polarities.get(node_id, set())
        polarities_elsewhere = global_concepts.get(norm_label, set())
        
        node_type = None
        
        # Internal contradiction
        if len(polarities_here) > 1:
            node_type = 'red'
            
        if not node_type:
            # External NLI Audit
            for p_here in polarities_here:
                for p_ext in polarities_elsewhere:
                    if p_here == p_ext: continue
                    # Simulate High Vector Similarity + NLI Audit
                    nli_decision, prob = audit_conflict(p_ext, p_here)
                    
                    if nli_decision == 'contradiction':
                        if prob > 0.92:
                            node_type = 'red'
                        elif prob >= 0.6:
                            node_type = 'yellow'
                        
                        # Numerical Delta Override Hardening
                        delta_res = check_numerical_delta(norm_label, current_chunks, other_chunks)
                        if delta_res == 'gold':
                            node_type = 'baseline'
                        elif delta_res == 'yellow':
                            node_type = 'yellow'
                            
                        if node_type == 'red':
                            break
                    elif nli_decision == 'neutral':
                        node_type = 'yellow'
                        delta_res = check_numerical_delta(norm_label, current_chunks, other_chunks)
                        if delta_res == 'gold': node_type = 'baseline'
                        elif delta_res == 'yellow': node_type = 'yellow'
                if node_type == 'red': break
        
        if not node_type or node_type == 'baseline':
            delta_res = check_numerical_delta(norm_label, current_chunks, other_chunks)
            if delta_res == 'yellow':
                node_type = 'yellow'
            elif delta_res == 'gold':
                node_type = 'baseline'
            
        if node_type:
            n.setdefault('data', {})['node_type'] = node_type
            n['data']['conflict'] = (node_type == 'red')

    # Apply Ethical Heuristics
    current_graph = apply_ethical_heuristics(current_graph, paper_id)
    return current_graph

class ConceptMapView(APIView):
    """
    GET /api/concept-map/<int:paper_id>/?refresh=true
    """
    def get(self, request, paper_id):
        force_refresh = request.query_params.get('refresh', 'false').lower() == 'true'
        compare_to_id = request.query_params.get('compare_to')
        max_year = request.query_params.get('max_year')
        
        try:
            paper = ResearchPaper.objects.get(id=paper_id)
        except ResearchPaper.DoesNotExist:
            return Response({"error": "Paper not found"}, status=404)
            
        if paper.concept_map_data and not force_refresh:
            import copy
            data = copy.deepcopy(paper.concept_map_data)
            # Strict State Reset: explicitly flush the conflict and discredited arrays
            for n in data.get('nodes', []):
                if 'data' in n:
                    n['data'].pop('node_type', None)
                    n['data'].pop('conflict', None)
            data = detect_conflicts(paper_id, data, compare_to_id, max_year)
            return Response(data)
            
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
                {{
                    "id": "node_id", 
                    "data": {{
                        "label": "Concept Name",
                        "page_reference": "page_number_integer_or_null"
                    }}, 
                    "position": {{"x": 0, "y": 0}}
                }}
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
            compare_to_id = request.query_params.get('compare_to')
            max_year = request.query_params.get('max_year')
            data = detect_conflicts(paper_id, data, compare_to_id, max_year)
            
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

        # 2.5 Extract Publication Year
        if full_text_data:
            # Check the first page/chunk for a 4-digit year (19xx or 20xx)
            first_text = full_text_data[0][1][:1500]
            year_matches = re.findall(r'\b(19[5-9]\d|20[0-3]\d)\b', first_text)
            if year_matches:
                paper.publication_year = int(year_matches[0])
                paper.save(update_fields=['publication_year'])

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

class TestMultiLogicView(APIView):
    """
    Batch Verification: Use the /api/test-multi-logic/ endpoint to verify that a comparison with an empty or unrelated document returns a 100% Gold map.
    GET /api/test-multi-logic/?paper_id=<id>&compare_to=<id>
    """
    def get(self, request):
        paper_id = request.query_params.get('paper_id')
        compare_to_id = request.query_params.get('compare_to')
        
        if not paper_id or not compare_to_id:
            return Response({"error": "Missing paper_id or compare_to"}, status=400)
            
        try:
            paper = ResearchPaper.objects.get(id=paper_id)
        except ResearchPaper.DoesNotExist:
            return Response({"error": "Paper not found"}, status=404)
            
        if not paper.concept_map_data:
            return Response({"error": "No map data to test"}, status=400)
            
        import copy
        data = copy.deepcopy(paper.concept_map_data)
        # Flush states
        for n in data.get('nodes', []):
            if 'data' in n:
                n['data'].pop('node_type', None)
                n['data'].pop('conflict', None)
                
        # Run detection
        data = detect_conflicts(paper_id, data, compare_to_id, None)
        
        # Check if 100% Gold (baseline or no conflict)
        non_gold = [n for n in data.get('nodes', []) if n.get('data', {}).get('node_type') in ['red', 'yellow', 'purple']]
        
        if not non_gold:
            return Response({"status": "success", "message": "100% Gold map confirmed via Relevance Shield", "nodes": data['nodes']})
        else:
            return Response({"status": "warning", "message": f"{len(non_gold)} non-gold nodes found", "nodes": non_gold})