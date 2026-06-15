#!/usr/bin/env python3
"""
ResearchMind VN — CLI Prototype

Test the entire pipeline: import PDF → chunk → embed → search → chat.

Usage:
    python prototype_cli.py import <pdf_path>
    python prototype_cli.py import-folder <folder_path>
    python prototype_cli.py search <query>
    python prototype_cli.py chat <query> [paper_id ...]
    python prototype_cli.py list
    python prototype_cli.py stats
    python prototype_cli.py delete <paper_id>
"""

import sys
import json
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from backend.config.settings import settings
from backend.db.database import get_engine, get_session
from backend.db.models import Base, Paper, Chunk
from backend.ingestion.parser import extract_pdf
from backend.ingestion.chunker import chunk_text
from backend.ingestion.embedder import get_embedder
from backend.search.bm25 import BM25Search
from backend.search.vector import VectorSearch
from backend.search.hybrid import HybridSearch
from backend.chat.retriever import Retriever
from backend.chat.generator import Generator


def init():
    """Initialize database and search engines."""
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.papers_dir.mkdir(parents=True, exist_ok=True)
    settings.chroma_dir.mkdir(parents=True, exist_ok=True)

    engine = get_engine(settings.db_path)
    Base.metadata.create_all(engine)

    embedder = get_embedder(settings.embedding_model)

    session = get_session(engine)
    bm25 = BM25Search(session)
    bm25.ensure_fts_table()
    vector = VectorSearch(settings.chroma_dir)
    hybrid = HybridSearch(bm25, vector, embedder)

    retriever = Retriever(hybrid)
    generator = Generator(
        ollama_url=settings.ollama_url,
        ollama_model=settings.ollama_model,
    )

    return engine, session, bm25, vector, hybrid, retriever, generator, embedder


def cmd_import(args):
    """Import a single PDF file."""
    if len(args) < 1:
        print("Usage: python prototype_cli.py import <pdf_path>")
        return

    pdf_path = args[0]
    engine, session, bm25, vector, hybrid, retriever, generator, embedder = init()

    import uuid
    file_id = str(uuid.uuid4())

    print(f"📄 Importing: {pdf_path}")

    doc = extract_pdf(pdf_path)
    if doc is None:
        print("❌ Cannot parse PDF")
        return

    print(f"   Title: {doc.title}")
    print(f"   Pages: {doc.page_count}")
    print(f"   Language: {doc.language}")

    # Save paper
    paper = Paper(
        id=file_id,
        filename=doc.filename,
        title=doc.title,
        authors=doc.authors,
        year=doc.year,
        doi=doc.doi,
        page_count=doc.page_count,
        file_size=doc.file_size,
        file_path=str(Path(pdf_path).absolute()),
        language=doc.language,
        status="indexing",
    )
    session.add(paper)
    session.commit()
    print(f"   Paper ID: {file_id}")

    # Chunk
    print("   Chunking...")
    chunks = chunk_text(doc.text_by_page, chunk_size=512, chunk_overlap=50)
    print(f"   → {len(chunks)} chunks generated")

    # Save chunks
    for chunk in chunks:
        chunk.paper_id = file_id
        db_chunk = Chunk(
            paper_id=file_id,
            chunk_index=chunk.index,
            content=chunk.text,
            page_number=chunk.page_number,
            section_header=chunk.section_header,
            token_count=chunk.token_count,
        )
        session.add(db_chunk)
    session.commit()

    # FTS rebuild
    print("   Building FTS index...")
    bm25._rebuild_fts()

    # Embed + store in ChromaDB
    print("   Generating embeddings (bge-m3)...")
    chunk_texts = [c.text for c in chunks]
    chunk_ids = [f"{file_id}_{c.index}" for c in chunks]
    metadatas = [
        {
            "paper_id": file_id,
            "paper_title": doc.title or doc.filename,
            "chunk_index": c.index,
            "page_number": c.page_number or 0,
            "section_header": c.section_header or "",
        }
        for c in chunks
    ]
    embeddings = embedder.embed(chunk_texts)
    vector.add_chunks(chunk_ids, embeddings, metadatas, chunk_texts)

    # Update status
    paper.status = "indexed"
    session.commit()

    print(f"\n✅ Imported: {doc.filename}")
    print(f"   Paper ID: {file_id}")
    print(f"   Chunks: {len(chunks)}")
    print(f"   ChromaDB entries: {vector.count()}")

    session.close()


def cmd_import_folder(args):
    """Import all PDFs from a folder."""
    if len(args) < 1:
        print("Usage: python prototype_cli.py import-folder <folder_path>")
        return

    folder = Path(args[0])
    if not folder.exists():
        print(f"❌ Folder not found: {folder}")
        return

    pdfs = list(folder.glob("*.pdf")) + list(folder.glob("*.PDF"))
    print(f"📂 Found {len(pdfs)} PDFs in {folder}")

    for pdf in pdfs:
        cmd_import([str(pdf)])
        print()


def cmd_search(args):
    """Search across all indexed papers."""
    if len(args) < 1:
        print("Usage: python prototype_cli.py search <query>")
        return

    query = " ".join(args)
    engine, session, bm25, vector, hybrid, retriever, generator, embedder = init()

    print(f"🔍 Searching: '{query}'")
    print()

    results = hybrid.search(query, top_k=10)

    if not results:
        print("   No results found.")
        return

    print(f"   Found {len(results)} results:\n")
    for i, r in enumerate(results, 1):
        print(f"  {i}. [{r.paper_title}] (score: {r.score:.3f})")
        if r.page_number:
            print(f"     Page: {r.page_number}")
        # Print first 200 chars of content
        preview = r.content[:200].replace("\n", " ")
        print(f"     {preview}...")
        print()

    session.close()


def cmd_chat(args):
    """Chat with AI about your papers."""
    if len(args) < 1:
        print("Usage: python prototype_cli.py chat <query> [paper_id ...]")
        return

    query = args[0]
    paper_ids = args[1:] if len(args) > 1 else None

    engine, session, bm25, vector, hybrid, retriever, generator, embedder = init()

    print(f"💬 Question: {query}")
    if paper_ids:
        print(f"   Filtering to {len(paper_ids)} paper(s)")
    print()

    # Retrieve
    retrieval = retriever.retrieve(query, paper_ids=paper_ids, top_k=5)

    print(f"   Retrieved {retrieval.total_chunks} chunks from {len(retrieval.papers_used)} papers")
    print()

    # Generate
    print("   Generating answer...")
    result = generator.generate(query, retrieval.context_text)

    print()
    print("─── Answer ───────────────────────────────────────")
    print(result.content)
    print("──────────────────────────────────────────────────")
    print(f"\n   📚 Sources: {len(result.citations)} citations")
    print(f"   🤖 Model: {result.model_used}")
    for c in result.citations:
        print(f"      📄 [{c['source']}]" + (f" (trang {c['page']})" if c['page'] else ""))

    session.close()


def cmd_list(args):
    """List all imported papers."""
    engine, session, bm25, vector, hybrid, retriever, generator, embedder = init()

    papers = session.query(Paper).all()

    if not papers:
        print("📚 No papers imported yet.")
        return

    print(f"📚 Library ({len(papers)} papers):\n")
    for p in papers:
        status_icon = "✅" if p.status == "indexed" else "⏳" if p.status == "indexing" else "❌"
        star = "⭐" if p.starred else ""
        print(f"  {status_icon} {p.title or p.filename} {star}")
        print(f"     ID: {p.id}")
        print(f"     Pages: {p.page_count} · Lang: {p.language.upper()} · {p.file_size // 1024}KB")
        if p.tags and p.tags != "[]":
            import json as j
            tags = j.loads(p.tags)
            print(f"     Tags: {', '.join(tags)}")
        print()

    session.close()


def cmd_stats(args):
    """Show system statistics."""
    engine, session, bm25, vector, hybrid, retriever, generator, embedder = init()

    total_papers = session.query(Paper).count()
    indexed = session.query(Paper).filter(Paper.status == "indexed").count()
    total_chunks = session.query(Chunk).count()
    chroma_count = vector.count()

    print("📊 ResearchMind VN — Statistics")
    print("─" * 35)
    print(f"  Papers:        {total_papers} ({indexed} indexed)")
    print(f"  Chunks (SQL):  {total_chunks}")
    print(f"  Chunks (Vec):  {chroma_count}")
    print(f"  Embedding:     {settings.embedding_model}")
    print(f"  Ollama:        {settings.ollama_url} ({settings.ollama_model})")
    print(f"  DB:            {settings.db_path}")
    print(f"  Chroma:        {settings.chroma_dir}")

    session.close()


def cmd_delete(args):
    """Delete a paper by ID."""
    if len(args) < 1:
        print("Usage: python prototype_cli.py delete <paper_id>")
        return

    paper_id = args[0]
    engine, session, bm25, vector, hybrid, retriever, generator, embedder = init()

    paper = session.query(Paper).filter(Paper.id == paper_id).first()
    if not paper:
        print(f"❌ Paper not found: {paper_id}")
        return

    print(f"🗑️ Deleting: {paper.title or paper.filename}")

    try:
        vector.delete_paper_chunks(paper_id)
    except Exception:
        pass

    session.delete(paper)
    session.commit()

    bm25._rebuild_fts()

    print(f"✅ Deleted: {paper_id}")
    session.close()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return

    command = sys.argv[1]
    args = sys.argv[2:]

    commands = {
        "import": cmd_import,
        "import-folder": cmd_import_folder,
        "search": cmd_search,
        "chat": cmd_chat,
        "list": cmd_list,
        "stats": cmd_stats,
        "delete": cmd_delete,
    }

    if command in commands:
        commands[command](args)
    else:
        print(f"Unknown command: {command}")
        print(__doc__)


if __name__ == "__main__":
    main()
