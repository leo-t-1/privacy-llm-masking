# PrivacyLLM — Chat Without Leaking

A privacy-preserving chat app that masks PII in your messages **before** they leave your device, then optionally restores it in the response.

## How it works

```
Your message  ──▶  PII Detector (local)  ──▶  Masked message  ──▶  LLM API
                        │                                              │
                   mapping table                                  response
                   (stored locally)                 ◀─────────────────┘
                        │
                  Optionally restore PII  ──▶  Final response shown to you
```

**What gets masked** (using [Microsoft Presidio](https://microsoft.github.io/presidio/) + spaCy):

| Type | Example input | Placeholder |
|------|--------------|-------------|
| Person | `John Smith` | `[PERSON_1]` |
| Email | `john@example.com` | `[EMAIL_ADDRESS_1]` |
| Phone | `+44 7700 900123` | `[PHONE_NUMBER_1]` |
| Credit card | `4111 1111 1111 1111` | `[CREDIT_CARD_1]` |
| SSN | `123-45-6789` | `[US_SSN_1]` |
| Location | `New York` | `[LOCATION_1]` |
| IP address | `192.168.1.1` | `[IP_ADDRESS_1]` |
| + more | IBAN, passport, dates, NRP, crypto… | … |

## Quick start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python -m spacy download en_core_web_lg
uvicorn main:app --reload
# Runs on http://localhost:8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:5173
```

Open **http://localhost:5173**, click ⚙ Settings, enter your API key, and start chatting.

### Free API keys (no credit card needed)

| Provider | Free tier | Get key |
|----------|-----------|---------|
| **Groq** | 1,000 req/day, fastest | [console.groq.com](https://console.groq.com) |
| **OpenRouter** | Many free models | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Together AI** | Free credits | [api.together.xyz](https://api.together.xyz) |
| **Mistral AI** | Free tier | [console.mistral.ai](https://console.mistral.ai) |
| **OpenAI** | Pay-as-you-go | [platform.openai.com](https://platform.openai.com) |

## API reference

```
POST /api/chat          Send a message (masking applied automatically)
POST /api/analyze       Analyze text for PII without sending to LLM
POST /api/upload        Extract text from .txt / .pdf / .docx
GET  /api/providers     List available LLM providers and models
GET  /api/entities      List detectable PII entity types
GET  /health            Health check
```

## Architecture

- **Backend**: Python 3.11 + FastAPI + [Presidio Analyzer](https://github.com/microsoft/presidio) + spaCy `en_core_web_lg`
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **PII detection**: Hybrid — spaCy NER for unstructured text (names, locations, orgs) + built-in regex recognizers for structured patterns (email, phone, SSN, credit card, IBAN, crypto, IP, URL)
- **De-anonymization**: In-memory mapping table per session; placeholders in LLM response can optionally be swapped back to originals

## Roadmap / future ideas

- [ ] Mobile app via Capacitor wrapping the web frontend
- [ ] GLiNER backend for higher accuracy name detection  
- [ ] Per-entity-type toggle (mask only what you want)
- [ ] Conversation export with/without PII restored
- [ ] Self-hosted LLM support via Ollama
