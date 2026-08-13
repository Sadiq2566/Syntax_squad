from sqlalchemy import Column, Integer, String, Float, DateTime, Text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

from backend.config import settings

Base = declarative_base()

# Create database engine
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Database dependency for FastAPI"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class Movement(Base):
    """Movement model for tracking exercise movements and biomechanics"""
    __tablename__ = "movements"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    category = Column(String(100), nullable=False, index=True)
    difficulty_level = Column(String(50), nullable=False)
    duration_seconds = Column(Integer, nullable=True)
    calories_burned = Column(Float, nullable=True)
    target_muscles = Column(Text, nullable=True)
    equipment_needed = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    video_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<Movement(id={self.id}, name='{self.name}', category='{self.category}')>"


class UserSession(Base):
    """User session model for tracking workout sessions"""
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(255), nullable=False, index=True)
    movement_id = Column(Integer, nullable=False, index=True)
    duration_seconds = Column(Integer, nullable=False)
    repetitions = Column(Integer, nullable=True)
    form_score = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    session_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<UserSession(id={self.id}, user_id='{self.user_id}', movement_id={self.movement_id})>"
