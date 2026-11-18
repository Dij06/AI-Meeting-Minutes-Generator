import os
from jiwer import wer
from rouge_score import rouge_scorer
from services.transcriber import transcribe_audio
from services.summarizer import generate_meeting_minutes


def evaluate_asr(audio_path: str, reference_text: str) -> float:
    result = transcribe_audio(audio_path, language="English")
    hypothesis = result.get("text", "").strip()
    error_rate = wer(reference_text.lower(), hypothesis.lower())
    print("\n--- Speech-to-Text Evaluation (WER) ---")
    print(f"Audio File : {audio_path}")
    print(f"Reference  : {reference_text}")
    print(f"Predicted  : {hypothesis}")
    print(f"WER Score  : {error_rate:.4f} ({error_rate * 100:.2f}%)")
    return error_rate


def evaluate_summarizer(transcript_text: str, reference_summary: str) -> dict:
    output = generate_meeting_minutes(transcript_text)
    generated_summary = output.get("summary", "")

    scorer = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)
    scores = scorer.score(reference_summary, generated_summary)

    print("\n--- Summarization Evaluation (ROUGE) ---")
    print(f"Reference Summary : {reference_summary}")
    print(f"Generated Summary : {generated_summary}")
    for metric, vals in scores.items():
        print(f"{metric.upper():8s} -> Precision: {vals.precision:.3f} | Recall: {vals.recall:.3f} | F1: {vals.fmeasure:.3f}")
    return scores


if __name__ == "__main__":
    sample_audio = os.path.join("uploads", "youtube-video.mp4")
    if os.path.exists(sample_audio):
        evaluate_asr(sample_audio, "I just had to let you know you")

    sample_transcript = (
        "Good morning everyone. Today we need to finalize the Meetly backend architecture. "
        "We agreed to use faster-whisper for speech recognition because it runs smoothly on CPU. "
        "Rahul will prepare the evaluation script using WER and ROUGE by Friday. "
        "Priya should update the presentation slides before Monday. "
        "We also decided to support Hindi and Hinglish audio uploads."
    )
    ref_summary = (
        "The team agreed to use faster-whisper for CPU speech recognition and decided to support "
        "Hindi and Hinglish uploads, with Rahul preparing the WER and ROUGE evaluation by Friday."
    )
    evaluate_summarizer(sample_transcript, ref_summary)
