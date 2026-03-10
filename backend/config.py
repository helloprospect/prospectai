from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://prospectai:devpassword@localhost:5432/prospectai"
    ANTHROPIC_API_KEY: str = ""
    SEARCHLEADS_API_KEY: str = ""
    INSTANTLY_API_KEY: str = ""
    APIFY_API_KEY: str = ""
    REDDIT_CLIENT_ID: str = ""
    REDDIT_CLIENT_SECRET: str = ""
    REDDIT_USER_AGENT: str = "ProspectAI/1.0"
    SECRET_KEY: str = "dev-secret-key-change-in-prod"
    ALLOWED_ORIGINS: str = "http://localhost:3000,https://app.prospectai.dev"

    # Pipeline defaults
    DEFAULT_LEAD_BATCH_SIZE: int = 50
    DEFAULT_RESEARCH_CONCURRENCY: int = 5
    CLAUDE_MODEL: str = "claude-sonnet-4-6"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
