from __future__ import annotations

import io
from pathlib import Path
from typing import Literal, Optional

MaskingMode = Literal["off", "manual", "auto"]

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from pii.detector import (
    detect_and_anonymize, deanonymize, reapply_masking, DEFAULT_ENTITIES,
)
from llm.client import chat_completion, PROVIDERS

app = FastAPI(title="PrivacyLLM API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    text: str
    entities: Optional[list[str]] = None
    score_threshold: float = 0.4
    custom_masks: Optional[list[str]] = None
    auto_detect: bool = True


class AnalyzeResponse(BaseModel):
    original_text: str
    anonymized_text: str
    entities: list[dict]
    mapping: dict[str, str]


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    provider: str
    api_key: str
    model: str
    messages: list[ChatMessage]
    system_prompt: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 2048
    masking_mode: MaskingMode = "auto"
    restore_pii_in_response: bool = False
    entities: Optional[list[str]] = None
    score_threshold: float = 0.4
    session_mapping: Optional[dict[str, str]] = None
    custom_masks: Optional[list[str]] = None  # user-specified strings to always mask


class ChatResponse(BaseModel):
    raw_response: str
    restored_response: str
    masked_user_message: str
    new_entities: list[dict]
    new_mapping: dict[str, str]
    session_mapping: dict[str, str]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/providers")
def get_providers():
    return PROVIDERS


@app.get("/api/entities")
def get_entities():
    return DEFAULT_ENTITIES


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze_text(req: AnalyzeRequest):
    result = detect_and_anonymize(
        text=req.text,
        entities=req.entities,
        score_threshold=req.score_threshold,
        custom_masks=req.custom_masks,
        auto_detect=req.auto_detect,
    )
    return AnalyzeResponse(
        original_text=result.original_text,
        anonymized_text=result.anonymized_text,
        entities=[
            {
                "placeholder": e.placeholder,
                "original_value": e.original_value,
                "entity_type": e.entity_type,
                "score": round(e.score, 3),
                "start": e.start,
                "end": e.end,
            }
            for e in result.entities
        ],
        mapping=result.mapping,
    )


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    cumulative_mapping: dict[str, str] = dict(req.session_mapping or {})

    last_message = req.messages[-1]
    masked_user_message = last_message.content
    new_entities: list[dict] = []
    new_mapping: dict[str, str] = {}

    # ── Mask the current user turn ────────────────────────────────────────────
    masking_active = req.masking_mode != "off"
    if masking_active and last_message.role == "user":
        result = detect_and_anonymize(
            text=last_message.content,
            entities=req.entities,
            score_threshold=req.score_threshold,
            custom_masks=req.custom_masks,
            existing_mapping=cumulative_mapping,
            auto_detect=req.masking_mode == "auto",
        )
        masked_user_message = result.anonymized_text
        new_mapping = result.mapping
        cumulative_mapping.update(new_mapping)
        new_entities = [
            {
                "placeholder": e.placeholder,
                "original_value": e.original_value,
                "entity_type": e.entity_type,
                "score": round(e.score, 3),
            }
            for e in result.entities
        ]

    # ── Build LLM message list with ALL history properly masked ───────────────
    # For every message (not just the last), we retroactively apply the full
    # session mapping so that original values from previous turns are not
    # leaked to the LLM in any historical context window.
    llm_messages: list[dict] = []
    for i, msg in enumerate(req.messages):
        is_last = i == len(req.messages) - 1
        if is_last and masking_active:
            content = masked_user_message
        elif masking_active and cumulative_mapping:
            content = reapply_masking(msg.content, cumulative_mapping)
        else:
            content = msg.content
        llm_messages.append({"role": msg.role, "content": content})

    try:
        raw_response = await chat_completion(
            provider=req.provider,
            api_key=req.api_key,
            model=req.model,
            messages=llm_messages,
            system_prompt=req.system_prompt,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    restored_response = raw_response
    if req.restore_pii_in_response and cumulative_mapping:
        restored_response = deanonymize(raw_response, cumulative_mapping)

    return ChatResponse(
        raw_response=raw_response,
        restored_response=restored_response,
        masked_user_message=masked_user_message,
        new_entities=new_entities,
        new_mapping=new_mapping,
        session_mapping=cumulative_mapping,
    )


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    filename = file.filename or ""
    content_bytes = await file.read()

    if filename.endswith(".txt"):
        text = content_bytes.decode("utf-8", errors="replace")

    elif filename.endswith(".pdf"):
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(content_bytes)) as pdf:
                text = "\n".join(page.extract_text() or "" for page in pdf.pages)
        except ImportError:
            raise HTTPException(status_code=400, detail="pdfplumber not installed")

    elif filename.endswith(".docx"):
        try:
            from docx import Document
            doc = Document(io.BytesIO(content_bytes))
            text = "\n".join(p.text for p in doc.paragraphs)
        except ImportError:
            raise HTTPException(status_code=400, detail="python-docx not installed")

    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Supported: .txt .pdf .docx",
        )

    return {"text": text, "filename": filename, "size": len(content_bytes)}


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


# ── Serve built React frontend ─────────────────────────────────────────────────
_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        if full_path.startswith("api/") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(str(_DIST / "index.html"))
