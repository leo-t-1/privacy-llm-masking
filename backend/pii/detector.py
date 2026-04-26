from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Optional

from presidio_analyzer import AnalyzerEngine, RecognizerResult
from presidio_analyzer.nlp_engine import NlpEngineProvider

try:
    from gliner import GLiNER
    _gliner_import_ok = True
except Exception:
    GLiNER = None  # type: ignore
    _gliner_import_ok = False


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
_gliner: Optional["GLiNER"] = None

# GLiNER handles fuzzy / context-dependent categories; it's much better at
# telling "Apple" the company from "Apple" the surname than spaCy NER is.
_GLINER_ENTITIES = {"PERSON", "LOCATION"}
_GLINER_LABELS = ["person", "location"]
_GLINER_LABEL_TO_TYPE = {"person": "PERSON", "location": "LOCATION"}

# GLiNER scores pronouns and possessives quite high under the "person" label.
# We only want named entities, so we apply a stoplist + require at least one
# uppercase letter, and floor the threshold a little above the Presidio default.
_GLINER_MIN_THRESHOLD = 0.5
_PRONOUN_STOPLIST = {
    "i", "me", "my", "myself", "mine",
    "you", "your", "yours", "yourself",
    "he", "him", "his", "himself",
    "she", "her", "hers", "herself",
    "it", "its", "itself",
    "we", "us", "our", "ours", "ourselves",
    "they", "them", "their", "theirs", "themselves",
    "this", "that", "these", "those",
    "who", "whom", "whose", "which", "what",
    "someone", "anyone", "everyone", "noone", "nobody", "everybody",
    "mr", "mrs", "ms", "miss", "dr", "sir", "madam",
    "mom", "dad", "mum", "father", "mother", "husband", "wife",
    "son", "daughter", "brother", "sister", "uncle", "aunt", "cousin",
}


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


def _get_gliner():
    """Lazy-load GLiNER. Returns None if the package failed to import."""
    global _gliner
    if not _gliner_import_ok:
        return None
    if _gliner is None:
        _gliner = GLiNER.from_pretrained("urchade/gliner_multi_pii-v1")
    return _gliner


def warmup() -> None:
    """Eagerly load both models so the first request doesn't pay the cost."""
    _get_analyzer()
    _get_gliner()


def _gliner_detect(text: str, threshold: float) -> list[RecognizerResult]:
    """Run GLiNER and return Presidio-shaped RecognizerResult objects."""
    model = _get_gliner()
    if model is None:
        return []
    effective = max(threshold, _GLINER_MIN_THRESHOLD)
    raw = model.predict_entities(text, _GLINER_LABELS, threshold=effective)
    out: list[RecognizerResult] = []
    for r in raw:
        entity_type = _GLINER_LABEL_TO_TYPE.get(r["label"].lower())
        if entity_type is None:
            continue
        matched = r["text"].strip()
        tokens = [t for t in matched.lower().replace("'", " ").split() if t]
        # Drop matches that are entirely pronouns / titles / kinship words.
        if tokens and all(t in _PRONOUN_STOPLIST for t in tokens):
            continue
        # Drop description-shaped phrases whose head noun is a generic
        # kinship/relation word ("British husband", "her sister", "the dad").
        if tokens and tokens[-1] in _PRONOUN_STOPLIST:
            continue
        # Require at least one capitalised character — anything entirely
        # lowercase is almost certainly a description, not a proper noun.
        if not any(c.isupper() for c in matched):
            continue
        out.append(RecognizerResult(
            entity_type=entity_type,
            start=r["start"],
            end=r["end"],
            score=float(r["score"]),
        ))
    return out


# Trimmed list — only personal-information categories the user explicitly
# wants masked. DATE_TIME, NRP, IP_ADDRESS, MEDICAL_LICENSE were dropped
# because they generate too many false positives ("Tuesday", "American",
# every IPv4-shaped number) for casual chat.
DEFAULT_ENTITIES = [
    "PERSON",
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
    "CREDIT_CARD",
    "US_SSN",
    "US_PASSPORT",
    "US_BANK_NUMBER",
    "US_DRIVER_LICENSE",
    "IBAN_CODE",
    "CRYPTO",
    "LOCATION",
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
    auto_detect: bool = True,
) -> AnonymizationResult:
    """
    Detect PII in text and replace with sequential placeholders.

    custom_masks: exact strings the user wants redacted regardless of auto-detection.
    existing_mapping: placeholder→original from previous turns, used to assign
    consistent placeholder names for values already seen.
    auto_detect: when False, skip Presidio analysis — only custom_masks and
    values already in existing_mapping get masked.
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

    # ── Step 2: hybrid auto-detection on the already-partially-masked text ───
    # GLiNER handles PERSON / LOCATION (much fewer false positives than spaCy
    # NER on capitalized-but-not-personal words like "Apple" or "Tuesday").
    # Presidio handles everything else — its regex + checksum recognizers are
    # the right tool for emails, phone numbers, credit cards, IBAN, SSN, etc.
    # In manual-only mode we still re-apply the existing session mapping below,
    # but we skip the heavy detection sweep.
    if auto_detect:
        results: list[RecognizerResult] = []

        gliner_targets = [e for e in entities if e in _GLINER_ENTITIES]
        if gliner_targets and _get_gliner() is not None:
            results.extend(_gliner_detect(anonymized, score_threshold))
            presidio_targets = [e for e in entities if e not in _GLINER_ENTITIES]
        else:
            # GLiNER unavailable — fall back to Presidio (spaCy) for PERSON/LOCATION
            presidio_targets = list(entities)

        if presidio_targets:
            analyzer = _get_analyzer()
            results.extend(analyzer.analyze(
                text=anonymized,
                language="en",
                entities=presidio_targets,
                score_threshold=score_threshold,
            ))

        results = _filter_overlapping(results)
        results_sorted = sorted(results, key=lambda r: r.start, reverse=True)
    else:
        results_sorted = []

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
