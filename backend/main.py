from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from backend.config import settings
from backend.routers import movements
from backend.models import Base, engine

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("Starting Aligno application...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created successfully")
    yield
    # Shutdown
    logger.info("Shutting down Aligno application...")


app = FastAPI(
    title="Aligno API",
    description="Biomechanical intelligence platform for movement coaching",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(movements.router, prefix="/api/v1/movements", tags=["movements"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to Aligno API",
        "version": "1.0.0",
        "status": "operational"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "aligno-api"
    }
