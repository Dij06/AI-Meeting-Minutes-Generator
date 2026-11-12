import os
import logging
import ctranslate2
from faster_whisper import WhisperModel

logger = logging.getLogger(__name__)

# Keep the loaded Whisper model in memory so it does not reload on every upload
_MODEL_CACHE = {}

LANGUAGE_CODE_MAP = {
    "auto": None,
    "auto-detect": None,
    "all": None,
    "all languages": None,
    "english": "en",
    "hindi": "hi",
    "hinglish": None,
    "marathi": "mr",
    "tamil": "ta",
    "telugu": "te",
    "bengali": "bn",
    "gujarati": "gu",
    "punjabi": "pa",
    "kannada": "kn",
    "malayalam": "ml",
    "urdu": "ur",
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "portuguese": "pt",
    "italian": "it",
    "japanese": "ja",
    "korean": "ko",
    "chinese": "zh",
    "arabic": "ar",
    "russian": "ru",
}


def _format_duration(seconds: float) -> str:
    total_secs = max(0, int(round(seconds or 0)))
    hours = total_secs // 3600
    minutes = (total_secs % 3600) // 60
    secs = total_secs % 60
    if hours > 0:
        return f"{hours}h {minutes}m {secs}s"
    return f"{minutes}m {secs}s"


def get_whisper_model(model_size: str | None = None) -> WhisperModel:
    size = model_size or os.environ.get("WHISPER_MODEL_SIZE", "base")
    has_cuda = ctranslate2.get_cuda_device_count() > 0
    device = "cuda" if has_cuda else "cpu"
    compute_type = "float16" if has_cuda else "int8"

    cache_key = (size, device, compute_type)
    if cache_key not in _MODEL_CACHE:
        logger.info("Loading Whisper model: %s (%s, %s)", size, device, compute_type)
        _MODEL_CACHE[cache_key] = WhisperModel(size, device=device, compute_type=compute_type)
    return _MODEL_CACHE[cache_key]


def _resolve_language_code(language: str | None) -> str | None:
    if not language:
        return None
    normalized = language.strip().lower()
    if normalized in LANGUAGE_CODE_MAP:
        return LANGUAGE_CODE_MAP[normalized]
    if len(normalized) == 2:
        return normalized
    return None


# Run faster-whisper on an audio/video file and return text + timestamped segments
def transcribe_audio(audio_path: str, language: str | None = None, model_size: str | None = None) -> dict:
    if not audio_path or not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    model = get_whisper_model(model_size=model_size)
    lang_code = _resolve_language_code(language)

    transcribe_kwargs = {
        "beam_size": 5,
        "vad_filter": True,
        "vad_parameters": {"min_silence_duration_ms": 500},
    }
    if lang_code:
        transcribe_kwargs["language"] = lang_code
    elif language and language.strip().lower() == "hinglish":
        transcribe_kwargs["initial_prompt"] = (
            "This is a Hinglish meeting conversation mixing Hindi and English words naturally."
        )

    segments_iter, info = model.transcribe(audio_path, **transcribe_kwargs)

    segments = []
    text_parts = []
    for seg in segments_iter:
        clean_text = (seg.text or "").strip()
        if not clean_text:
            continue
        segments.append({
            "start": round(float(seg.start), 2),
            "end": round(float(seg.end), 2),
            "text": clean_text,
        })
        text_parts.append(clean_text)

    full_text = " ".join(text_parts).strip()
    duration_seconds = float(getattr(info, "duration", 0.0) or 0.0)

    return {
        "text": full_text,
        "segments": segments,
        "duration": _format_duration(duration_seconds),
        "duration_seconds": round(duration_seconds, 2),
        "language": getattr(info, "language", lang_code or "en"),
    }
