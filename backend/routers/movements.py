from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel, Field
from datetime import datetime

from backend.models import Movement, UserSession, get_db

router = APIRouter()


# Pydantic schemas
class MovementBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    category: str = Field(..., min_length=1, max_length=100)
    difficulty_level: str = Field(..., min_length=1, max_length=50)
    duration_seconds: int | None = None
    calories_burned: float | None = None
    target_muscles: str | None = None
    equipment_needed: str | None = None
    instructions: str | None = None
    video_url: str | None = Field(None, max_length=500)


class MovementCreate(MovementBase):
    pass


class MovementUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    category: str | None = Field(None, min_length=1, max_length=100)
    difficulty_level: str | None = Field(None, min_length=1, max_length=50)
    duration_seconds: int | None = None
    calories_burned: float | None = None
    target_muscles: str | None = None
    equipment_needed: str | None = None
    instructions: str | None = None
    video_url: str | None = Field(None, max_length=500)


class MovementResponse(MovementBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserSessionBase(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=255)
    movement_id: int
    duration_seconds: int
    repetitions: int | None = None
    form_score: float | None = Field(None, ge=0, le=100)
    notes: str | None = None


class UserSessionCreate(UserSessionBase):
    pass


class UserSessionResponse(UserSessionBase):
    id: int
    session_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True


# Movement CRUD endpoints
@router.post("/", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
async def create_movement(movement: MovementCreate, db: Session = Depends(get_db)):
    """Create a new movement"""
    db_movement = Movement(**movement.model_dump())
    db.add(db_movement)
    db.commit()
    db.refresh(db_movement)
    return db_movement


@router.get("/", response_model=List[MovementResponse])
async def get_movements(
    skip: int = 0,
    limit: int = 100,
    category: str | None = None,
    difficulty_level: str | None = None,
    db: Session = Depends(get_db)
):
    """Get all movements with optional filtering"""
    query = db.query(Movement)
    
    if category:
        query = query.filter(Movement.category == category)
    if difficulty_level:
        query = query.filter(Movement.difficulty_level == difficulty_level)
    
    movements = query.offset(skip).limit(limit).all()
    return movements


@router.get("/{movement_id}", response_model=MovementResponse)
async def get_movement(movement_id: int, db: Session = Depends(get_db)):
    """Get a specific movement by ID"""
    movement = db.query(Movement).filter(Movement.id == movement_id).first()
    if not movement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Movement with id {movement_id} not found"
        )
    return movement


@router.put("/{movement_id}", response_model=MovementResponse)
async def update_movement(
    movement_id: int,
    movement_update: MovementUpdate,
    db: Session = Depends(get_db)
):
    """Update a movement"""
    db_movement = db.query(Movement).filter(Movement.id == movement_id).first()
    if not db_movement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Movement with id {movement_id} not found"
        )
    
    update_data = movement_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_movement, field, value)
    
    db_movement.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_movement)
    return db_movement


@router.delete("/{movement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_movement(movement_id: int, db: Session = Depends(get_db)):
    """Delete a movement"""
    db_movement = db.query(Movement).filter(Movement.id == movement_id).first()
    if not db_movement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Movement with id {movement_id} not found"
        )
    
    db.delete(db_movement)
    db.commit()
    return None


# User session endpoints
@router.post("/sessions", response_model=UserSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(session: UserSessionCreate, db: Session = Depends(get_db)):
    """Create a new user session"""
    # Verify movement exists
    movement = db.query(Movement).filter(Movement.id == session.movement_id).first()
    if not movement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Movement with id {session.movement_id} not found"
        )
    
    db_session = UserSession(**session.model_dump())
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


@router.get("/sessions/{user_id}", response_model=List[UserSessionResponse])
async def get_user_sessions(
    user_id: str,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all sessions for a specific user"""
    sessions = db.query(UserSession).filter(
        UserSession.user_id == user_id
    ).offset(skip).limit(limit).all()
    return sessions
