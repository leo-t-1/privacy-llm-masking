from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Optional

from presidio_analyzer import AnalyzerEngine, RecognizerResult
from presidio_analyzer.nlp_engine import NlpEngineProvider


@dataclass
class PIIEntity:
    placeholder: str
    original_value: str
    entity_type: str
    score: float
    start: int
    end: int


@dataclass
class AnonymizationResult:
    original_text: str
    anonymized_text: str
    entities: list[PIIEntity]
    mapping: dict[str, str]  # placeholder -> original_value
    session_id: str


_analyzer: Optional[AnalyzerEngine] = None


def _get_analyzer() -> AnalyzerEngine:
    global _analyzer
    if _analyzer is None:
        configuration = {
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": "en_core_web_lg"}],
        }
        provider = NlpEngineProvider(nlp_configuration=configuration)
        nlp_engine = provider.create_engine()
        _analyzer = AnalyzerEngine(nlp_engine=nlp_engine, supported_languages=["en"])
    return _analyzer


# URL removed — too many false positives inside email addresses and prose text
DEFAULT_ENTITIES = [
    "PERSON",
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
    "CREDIT_CARD",
    "US_SSN",
    "US_PASSPORT",
    "US_BANK_NUMBER",
    "US_DRIVER_LICENSE",
    "IP_ADDRESS",
    "LOCATION",
    "DATE_TIME",
    "NRP",
    "MEDICAL_LICENSE",
    "IBAN_CODE",
    "CRYPTO",
]


def _filter_overlapping(results: list[RecognizerResult]) -> list[RecognizerResult]:
    """Keep only non-overlapping spans; prefer higher score then longer span."""
    by_score = sorted(results, key=lambda r: (-r.score, -(r.end - r.start)))
    kept: list[RecognizerResult] = []
    for result in by_score:
        if not any(result.start < k.end and result.end > k.start for k in kept):
            kept.append(result)
    return kept


def detect_and_anonymize(
    text: str,
    session_id: Optional[str] = None,
    entities: Optional[list[str]] = None,
    score_threshold: float = 0.4,
    custom_masks: Optional[list[str]] = None,
    existing_mapping: Optional[dict[str, str]] = None,
) -> AnonymizationResult:
    """
    Detect PII in text and replace with sequential placeholders.

    custom_masks: exact strings the user wants redacted regardless of auto-detection.
    existing_mapping: placeholder→original from previous turns, used to assign
    consistent placeholder names for values already seen.
    """
    if session_id is None:
        session_id = str(uuid.uuid4())
    if entities is None:
        entities = DEFAULT_ENTITIES

    # Build reverse lookup (original → placeholder) from existing mapping so we
    # reuse the same placeholder if the same value appears again.
    value_to_placeholder: dict[str, str] = {}
    if existing_mapping:
        for ph, val in existing_mapping.items():
            value_to_placeholder[val] = ph

    mapping: dict[str, str] = {}
    counters: dict[str, int] = {}
    pii_entities: list[PIIEntity] = []
    anonymized = text

    # ── Step 1: apply custom (user-specified) masks first ────────────────────
    custom_masks = [m.strip() for m in (custom_masks or []) if m.strip()]
    for phrase in sorted(custom_masks, key=len, reverse=True):
        if phrase not in anonymized:
            continue
        if phrase in value_to_placeholder:
            placeholder = value_to_placeholder[phrase]
        else:
            counters["CUSTOM"] = counters.get("CUSTOM", 0) + 1
            placeholder = f"[CUSTOM_{counters['CUSTOM']}]"
            mapping[placeholder] = phrase
            value_to_placeholder[phrase] = placeholder
        # Replace all occurrences
        start = 0
        while True:
            idx = anonymized.find(phrase, start)
            if idx == -1:
                break
            # record entity at position in *original* text (approximate for display)
            pii_entities.append(PIIEntity(
                placeholder=placeholder,
                original_value=phrase,
                entity_type="CUSTOM",
                score=1.0,
                start=idx,
                end=idx + len(phrase),
            ))
            anonymized = anonymized[:idx] + placeholder + anonymized[idx + len(phrase):]
            start = idx + len(placeholder)

    # ── Step 2: Presidio auto-detection on the already-partially-masked text ──
    analyzer = _get_analyzer()
    results: list[RecognizerResult] = analyzer.analyze(
        text=anonymized,
        language="en",
        entities=entities,
        score_threshold=score_threshold,
    )
    results = _filter_overlapping(results)
    results_sorted = sorted(results, key=lambda r: r.start, reverse=True)

    for result in results_sorted:
        original_value = anonymized[result.start: result.end]
        # Skip if already a placeholder (e.g. [CUSTOM_1])
        if original_value.startswith("[") and original_value.endswith("]"):
            continue
        entity_type = result.entity_type

        if original_value in value_to_placeholder:
            placeholder = value_to_placeholder[original_value]
        else:
            counters[entity_type] = counters.get(entity_type, 0) + 1
            placeholder = f"[{entity_type}_{counters[entity_type]}]"
            mapping[placeholder] = original_value
            value_to_placeholder[original_value] = placeholder

        pii_entities.append(PIIEntity(
            placeholder=placeholder,
            original_value=original_value,
            entity_type=entity_type,
            score=result.score,
            start=result.start,
            end=result.end,
        ))
        anonymized = anonymized[: result.start] + placeholder + anonymized[result.end:]

    return AnonymizationResult(
        original_text=text,
        anonymized_text=anonymized,
        entities=pii_entities,
        mapping=mapping,
        session_id=session_id,
    )


def deanonymize(text: str, mapping: dict[str, str]) -> str:
    """Replace placeholders back with original values."""
    result = text
    for placeholder in sorted(mapping.keys(), key=len, reverse=True):
        result = result.replace(placeholder, mapping[placeholder])
    return result


def reapply_masking(text: str, session_mapping: dict[str, str]) -> str:
    """
    Given a session mapping (placeholder → original), replace any original
    values found in `text` with their placeholders. Used to retroactively
    protect historical messages that contain values we've already identified.
    """
    result = text
    # Sort by original value length descending to prevent partial replacements
    for placeholder, original in sorted(session_mapping.items(), key=lambda x: -len(x[1])):
        result = result.replace(original, placeholder)
    return result
