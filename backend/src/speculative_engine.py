"""Speculative Turn-taking Engine.

Core innovation: While AI speaks, predict what users will say next.
When users start speaking, compare predictions against actual speech
using semantic embeddings to distinguish backchannels from real interruptions.
"""
import asyncio
from typing import Optional

from google import genai
from google.genai import types

from .config import settings
from .divergence_detector import DivergenceDetector, DivergenceResult, DivergenceAction


PREDICTION_PROMPT = """You are analyzing a live meeting conversation.
Given the current context and what the AI consultant just said,
predict what the human participant(s) might say next.

Focus on:
1. Likely agreement/acknowledgment responses (e.g., "なるほど", "そうですね", "うんうん", "確かに", "I see", "right")
2. Likely disagreement/interruption responses (e.g., "いや、", "でも", "それは違う", "ちょっと待って", "No, actually", "But wait")
3. Likely follow-up questions or topic changes
4. Likely corrections or clarifications

Return exactly 5 predictions, one per line. Each prediction should be a short phrase (3-15 words).
Do NOT number them. Just one prediction per line.

Current conversation context:
{context}

AI is currently saying:
{ai_utterance}

Predicted user responses:"""


class SpeculativeEngine:
    """
    Manages speculative prediction and divergence detection.

    Lifecycle:
    1. AI starts speaking → start_predictions() fires async prediction generation
    2. Predictions arrive → DivergenceDetector caches their embeddings
    3. User starts speaking → evaluate() compares in real-time (~10ms)
    4. AI stops speaking → stop() clears state
    """

    def __init__(self):
        self._detector = DivergenceDetector(
            threshold_ignore=settings.divergence_threshold_ignore,
            threshold_interrupt=settings.divergence_threshold_interrupt,
        )
        self._client = genai.Client(api_key=settings.google_api_key)
        self._prediction_task: Optional[asyncio.Task] = None
        self._active = False
        self._context: str = ""
        self._latest_predictions: list[str] = []

    def update_context(self, transcript_line: str) -> None:
        """Append to conversation context for prediction generation."""
        self._context += transcript_line + "\n"
        # Keep last 2000 chars to avoid token overflow
        if len(self._context) > 2000:
            self._context = self._context[-2000:]

    async def start_predictions(self, ai_utterance: str) -> None:
        """Fire-and-forget: generate predictions when AI starts speaking.

        Runs asynchronously so it doesn't block audio streaming.
        Predictions are typically ready within ~500ms.
        """
        if not settings.enable_speculative_engine:
            return

        self._active = True

        # Cancel any existing prediction task
        if self._prediction_task and not self._prediction_task.done():
            self._prediction_task.cancel()

        self._prediction_task = asyncio.create_task(
            self._generate_predictions(ai_utterance)
        )

    async def _generate_predictions(self, ai_utterance: str) -> None:
        """Call Gemini Flash text API to predict user responses."""
        try:
            prompt = PREDICTION_PROMPT.format(
                context=self._context,
                ai_utterance=ai_utterance,
            )

            response = await self._client.aio.models.generate_content(
                model=settings.gemini_flash_model,
                contents=prompt,
            )

            if response.text:
                predictions = [
                    line.strip()
                    for line in response.text.strip().split("\n")
                    if line.strip()
                ][:5]

                self._latest_predictions = predictions
                self._detector.set_predictions(predictions)
                print(f"[SpeculativeEngine] Predictions ready: {predictions}")

        except Exception as e:
            print(f"[SpeculativeEngine] Prediction generation failed: {e}")

    def evaluate(self, partial_transcript: str) -> DivergenceResult:
        """Evaluate divergence of actual speech vs predictions.

        This is the hot path (~10ms). Called as each ASR token arrives.
        """
        if not self._active or not settings.enable_speculative_engine:
            return DivergenceResult(
                score=0.0,
                action=DivergenceAction.MONITOR,
            )

        return self._detector.evaluate(partial_transcript)

    def stop(self) -> None:
        """Stop speculation cycle (AI finished speaking)."""
        self._active = False
        self._detector.clear_predictions()
        if self._prediction_task and not self._prediction_task.done():
            self._prediction_task.cancel()

    @property
    def predictions(self) -> list[str]:
        """Current predictions for UI display."""
        return self._latest_predictions

    @property
    def active(self) -> bool:
        return self._active
