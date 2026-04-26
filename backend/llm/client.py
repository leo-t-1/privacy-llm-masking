from __future__ import annotations

from typing import AsyncIterator, Optional
from openai import AsyncOpenAI


PROVIDERS: dict[str, dict] = {
    "demo": {
        "label": "Demo (no API key needed)",
        "base_url": "https://text.pollinations.ai/openai",
        "models": ["openai", "mistral", "llama"],
        "default_model": "openai",
        "no_key_required": True,
    },
    "deepseek": {
        "label": "DeepSeek",
        "base_url": "https://api.deepseek.com",
        "models": ["deepseek-chat", "deepseek-reasoner"],
        "default_model": "deepseek-chat",
    },
    "openai": {
        "label": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
        "default_model": "gpt-4o-mini",
    },
    "groq": {
        "label": "Groq (Free)",
        "base_url": "https://api.groq.com/openai/v1",
        "models": [
            "llama-3.3-70b-versatile",
            "llama-3.1-8b-instant",
            "mixtral-8x7b-32768",
            "gemma2-9b-it",
        ],
        "default_model": "llama-3.3-70b-versatile",
    },
    "together": {
        "label": "Together AI (Free tier)",
        "base_url": "https://api.together.xyz/v1",
        "models": [
            "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            "mistralai/Mixtral-8x7B-Instruct-v0.1",
            "Qwen/Qwen2.5-72B-Instruct-Turbo",
        ],
        "default_model": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    },
    "openrouter": {
        "label": "OpenRouter (multi-model)",
        "base_url": "https://openrouter.ai/api/v1",
        "models": [
            "meta-llama/llama-3.3-70b-instruct:free",
            "mistralai/mistral-7b-instruct:free",
            "google/gemma-3-12b-it:free",
            "deepseek/deepseek-r1:free",
        ],
        "default_model": "meta-llama/llama-3.3-70b-instruct:free",
    },
    "mistral": {
        "label": "Mistral AI",
        "base_url": "https://api.mistral.ai/v1",
        "models": ["mistral-large-latest", "mistral-small-latest", "open-mistral-7b"],
        "default_model": "mistral-small-latest",
    },
}


async def chat_completion(
    provider: str,
    api_key: str,
    model: str,
    messages: list[dict],
    system_prompt: Optional[str] = None,
    temperature: float = 0.7,
    max_tokens: int = 2048,
) -> str:
    """Send messages to LLM and return the response text."""
    provider_config = PROVIDERS.get(provider)
    if not provider_config:
        raise ValueError(f"Unknown provider: {provider}")

    # Demo provider uses Pollinations.ai which needs no real key
    effective_key = api_key if api_key else "demo"

    client = AsyncOpenAI(
        api_key=effective_key,
        base_url=provider_config["base_url"],
    )

    full_messages = []
    if system_prompt:
        full_messages.append({"role": "system", "content": system_prompt})
    full_messages.extend(messages)

    response = await client.chat.completions.create(
        model=model,
        messages=full_messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )

    return response.choices[0].message.content or ""
