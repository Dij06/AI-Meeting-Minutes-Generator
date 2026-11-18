import math
import re
from collections import Counter

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by",
    "can", "could", "did", "do", "does", "doing", "for", "from", "had", "has",
    "have", "having", "he", "her", "here", "hers", "him", "his", "how", "i",
    "if", "in", "into", "is", "it", "its", "just", "me", "more", "most", "my",
    "no", "not", "now", "of", "on", "or", "our", "out", "over", "said", "she",
    "should", "so", "some", "such", "than", "that", "the", "their", "them",
    "then", "there", "these", "they", "this", "those", "to", "too", "up", "us",
    "very", "was", "we", "were", "what", "when", "where", "which", "who", "why",
    "will", "with", "would", "you", "your", "hai", "hain", "tha", "the", "ki",
    "ka", "ke", "ko", "mein", "se", "aur", "par", "bhi", "toh", "kya", "ye", "wo",
}

DECISION_KEYWORDS = [
    "decided", "decide", "agreed", "agree", "approved", "approve", "finalized",
    "finalize", "confirmed", "confirm", "concluded", "selected", "chosen",
    "we will use", "going with", "settled on", "final hua", "decide hua", "फैसला", "तय",
]

ACTION_KEYWORDS = [
    "need to", "needs to", "have to", "has to", "should", "must", "will",
    "let's", "lets", "action item", "todo", "to-do", "assign", "assigned",
    "complete", "finish", "prepare", "send", "schedule", "follow up", "update",
    "create", "fix", "check", "review", "submit", "upload", "share", "karna hai", "karenge",
]

DEADLINE_PATTERN = re.compile(
    r"\b(?:by|before|on|until|till)?\s*(?:today|tomorrow|tonight|next\s+week|this\s+week|next\s+month|"
    r"monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
    r"\d{1,2}(?::\d{2})?\s*(?:am|pm)|eod|end\s+of\s+day)\b",
    re.IGNORECASE,
)

ASSIGNEE_PATTERN = re.compile(
    r"\b([A-Z][a-z]{2,15})\s+(?:will|needs?\s+to|should|must|is\s+going\s+to)\b"
)


# Split raw transcript into clean sentences, stripping timestamps if present
def _split_sentences(text: str) -> list[str]:
    cleaned = re.sub(r"\b\d{1,2}:\d{2}\b", " ", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return []

    parts = re.split(r"(?<=[.!?।])\s+", cleaned)
    sentences = [p.strip() for p in parts if len(p.strip()) > 3]
    if not sentences and cleaned:
        return [cleaned]
    return sentences


def _tokenize(sentence: str) -> list[str]:
    words = re.findall(r"[A-Za-z0-9\u0900-\u097F']+", sentence.lower())
    return [w for w in words if w not in STOPWORDS and len(w) > 1]


# Score each sentence by word importance and position in the meeting
def _rank_sentences(sentences: list[str]) -> list[tuple[int, float, str]]:
    if not sentences:
        return []

    all_tokens = []
    sent_tokens = []
    for s in sentences:
        tokens = _tokenize(s)
        sent_tokens.append(tokens)
        all_tokens.extend(tokens)

    freq = Counter(all_tokens)
    max_freq = max(freq.values(), default=1)

    ranked = []
    total = len(sentences)
    for idx, (sentence, tokens) in enumerate(zip(sentences, sent_tokens)):
        if not tokens:
            ranked.append((idx, 0.0, sentence))
            continue

        tf_score = sum(freq[t] / max_freq for t in tokens) / math.sqrt(len(tokens))
        # Slightly boost opening and closing sentences where goals and wrap-ups appear
        position_bonus = 0.15 if (idx == 0 or idx == total - 1) else 0.0
        ranked.append((idx, tf_score + position_bonus, sentence))

    return ranked


def _extract_decisions(sentences: list[str]) -> list[str]:
    decisions = []
    seen = set()
    for s in sentences:
        lower = s.lower()
        if any(kw in lower for kw in DECISION_KEYWORDS):
            norm = lower.strip()
            if norm not in seen:
                seen.add(norm)
                decisions.append(s)
    if not decisions:
        return ["No explicit formal decisions were detected in this recording."]
    return decisions[:5]


def _extract_action_items(sentences: list[str]) -> list[dict]:
    items = []
    seen = set()
    for s in sentences:
        lower = s.lower()
        if not any(kw in lower for kw in ACTION_KEYWORDS):
            continue

        norm = lower.strip()
        if norm in seen:
            continue
        seen.add(norm)

        deadline_match = DEADLINE_PATTERN.search(s)
        deadline = deadline_match.group(0).strip().title() if deadline_match else "TBD"

        assignee_match = ASSIGNEE_PATTERN.search(s)
        assignee = assignee_match.group(1) if assignee_match else "Team"
        if assignee.lower() in {"we", "they", "you", "this", "that", "there", "someone", "everyone"}:
            assignee = "Team"

        items.append({
            "task": s,
            "assignee": assignee,
            "deadline": deadline,
            "status": "Pending",
        })

    return items[:6]


# Generate structured summary, discussion points, decisions, and action items
def generate_meeting_minutes(transcript_text: str) -> dict:
    sentences = _split_sentences(transcript_text)
    if not sentences:
        return {
            "summary": "No speech content was detected in the recording.",
            "discussion_points": [],
            "decisions": ["No explicit formal decisions were detected in this recording."],
            "action_items": [],
        }

    if len(sentences) <= 2:
        summary = " ".join(sentences)
        discussion_points = list(sentences)
    else:
        ranked = _rank_sentences(sentences)
        summary_count = min(4, max(2, len(sentences) // 3))
        top_for_summary = sorted(ranked, key=lambda x: x[1], reverse=True)[:summary_count]
        top_for_summary.sort(key=lambda x: x[0])
        summary = " ".join(item[2] for item in top_for_summary)

        points_count = min(5, len(sentences))
        top_for_points = sorted(ranked, key=lambda x: x[1], reverse=True)[:points_count]
        top_for_points.sort(key=lambda x: x[0])
        discussion_points = [item[2] for item in top_for_points]

    return {
        "summary": summary,
        "discussion_points": discussion_points,
        "decisions": _extract_decisions(sentences),
        "action_items": _extract_action_items(sentences),
    }
