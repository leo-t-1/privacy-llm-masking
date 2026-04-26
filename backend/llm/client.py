from __future__ import annotations

from typing import AsyncIterator, Optional
from openai import AsyncOpenAI


PROVIDERS: dict[str, dict] = {
    "demo": {
        "label": "Demo (free, no key needed)",
        "base_url": "https://text.pollinations.ai/openai",
        "models": ["openai", "mistral"],
        "default_model": "openai",
        "no_key_required": True,
    },
    "openai": {
        "label": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4o-mini", "gpt-4o"],
        "default_model": "gpt-4o-mini",
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
