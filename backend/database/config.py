import os
from typing import Optional
from pydantic_settings import BaseSettings
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker


class Settings(BaseSettings):
    """Application settings from environment variables"""
    
    # Database
    DATABASE_URL: str = "postgresql://postgres:0708@localhost:5432/f1_intelligence_hub"
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "f1_intelligence_hub"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "0708"
    
    # FastF1
    FASTF1_CACHE_DIR: str = "./fastf1_cache"
    
    # API
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:3000"
    
    # ML
    ML_MODELS_DIR: str = "./backend/ml/trained_models"
    
    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "app.log"
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


# Initialize settings
settings = Settings()

# Create SQLAlchemy engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=False,  # Set to True for SQL debugging
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()


def get_db():
    """
    Dependency function to get database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """
    Initialize database tables
    """
    Base.metadata.create_all(bind=engine)

    # Backward-compatible schema patch for existing databases that were
    # created before sprint and race results were split in the same table.
    with engine.begin() as conn:
        conn.execute(text("""
            ALTER TABLE IF EXISTS results
            ADD COLUMN IF NOT EXISTS is_sprint BOOLEAN NOT NULL DEFAULT FALSE
        """))
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_results_race_driver_sprint
            ON results(race_id, driver_id, is_sprint)
        """))

    print("Database tables created successfully")


if __name__ == "__main__":
    init_db()
