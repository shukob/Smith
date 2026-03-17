"""Configuration management for Smith backend."""
import os
from dataclasses import dataclass, field


@dataclass
class Settings:
    """Application settings loaded from environment variables."""

    # Gemini API
    google_api_key: str = field(default_factory=lambda: os.environ.get("GOOGLE_API_KEY", ""))
    gemini_live_model: str = "gemini-2.5-flash-native-audio-preview-12-2025"
    gemini_flash_model: str = "gemini-2.5-flash"

    # Firestore
    gcp_project_id: str = field(default_factory=lambda: os.environ.get("GCP_PROJECT_ID", ""))
    firestore_collection: str = "smith_sessions"

    # Background Agent
    background_agent_debounce_sec: float = 2.0

    # Speculative Engine
    speculation_interval_sec: float = 2.0
    divergence_threshold_ignore: float = 0.3
    divergence_threshold_interrupt: float = 0.6
    enable_speculative_engine: bool = False

    # Server
    port: int = field(default_factory=lambda: int(os.environ.get("PORT", "8080")))
    cors_origins: list = field(default_factory=lambda: os.environ.get("CORS_ORIGINS", "*").split(","))


settings = Settings()
