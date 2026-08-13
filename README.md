# Aligno - Movement Coaching Platform

Aligno is a biomechanical intelligence platform that provides expert movement coaching through accessible technology. The platform enables home fitness enthusiasts, physical therapy patients, athletes, elderly users, and corporate wellness participants to improve their movement quality and unlock their human potential.

## Product Vision

Aligno envisions a world where everyone has access to expert movement coaching, cultivating embodied self-awareness and unlocking human potential through accessible biomechanical intelligence.

## Target Audience

- **Home Fitness Enthusiasts**: Individuals seeking guided movement coaching at home
- **Physical Therapy Patients**: Users requiring structured rehabilitation exercises
- **Athletes**: Sports professionals seeking technique refinement
- **Elderly Users**: Seniors requiring fall prevention and mobility support
- **Corporate Wellness Participants**: Employees engaged in workplace wellness programs

## Core Features

- **Movement Library**: Comprehensive database of exercises and movements
- **CRUD Operations**: Create, read, update, and delete movements
- **Session Tracking**: Track user workout sessions and progress
- **Movement Categorization**: Organize movements by category and difficulty
- **Biomechanical Data**: Store movement metrics and form scores

## Technology Stack

- **Backend Framework**: FastAPI 0.104.1
- **Database**: SQLite (SQLAlchemy ORM)
- **Data Validation**: Pydantic 2.5.0
- **Server**: Uvicorn
- **Architecture**: Modular Monolith

## Prerequisites

- Python 3.9 or higher
- pip (Python package manager)

## Installation

1. **Clone the repository** (or navigate to the project directory)

2. **Create a virtual environment**:
```bash
python -m venv venv
```

3. **Activate the virtual environment**:
   - On Linux/Mac:
     ```bash
     source venv/bin/activate
     ```
   - On Windows:
     ```bash
     venv\Scripts\activate
     ```

4. **Install dependencies**:
```bash
pip install -r backend/requirements.txt
```

5. **Set up environment variables**:
```bash
cp .env.example .env
```
Edit `.env` file and update the configuration values as needed.

## Running the Application

### Development Mode

Run the application with auto-reload enabled:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at: `http://localhost:8000`

### Production Mode

Run the application in production:

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 4
```

## API Documentation

Once the application is running, access the interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## API Endpoints

### Health Check
- `GET /` - Root endpoint with API information
- `GET /health` - Health check endpoint

### Movements
- `POST /api/v1/movements/` - Create a new movement
- `GET /api/v1/movements/` - Get all movements (with optional filtering)
- `GET /api/v1/movements/{movement_id}` - Get a specific movement
- `PUT /api/v1/movements/{movement_id}` - Update a movement
- `DELETE /api/v1/movements/{movement_id}` - Delete a movement

### User Sessions
- `POST /api/v1/movements/sessions` - Create a new user session
- `GET /api/v1/movements/sessions/{user_id}` - Get all sessions for a user

## Database

The application uses SQLite by default. The database file (`aligno.db`) will be created automatically in the project root directory when you first run the application.

### Database Models

**Movement**:
- id, name, description, category, difficulty_level
- duration_seconds, calories_burned, target_muscles
- equipment_needed, instructions, video_url
- created_at, updated_at

**UserSession**:
- id, user_id, movement_id, duration_seconds
- repetitions, form_score, notes
- session_date, created_at

## Environment Variables

Key environment variables (see `.env.example` for full list):

- `DATABASE_URL`: Database connection string
- `SECRET_KEY`: Secret key for security (change in production)
- `CORS_ORIGINS`: Allowed CORS origins
- `LOG_LEVEL`: Logging level (INFO, DEBUG, ERROR)

## Project Structure

```
aligno/
├── backend/
│   ├── main.py              # FastAPI application entry point
│   ├── config.py            # Configuration management
│   ├── models.py            # Database models
│   └── routers/
│       └── movements.py     # Movement API routes
├── .env.example             # Example environment variables
├── README.md                # This file
└── requirements.txt         # Python dependencies
```

## Architecture

The application follows a **Modular Monolith** architecture with clear separation of concerns:

- **main.py**: Application initialization and middleware configuration
- **config.py**: Centralized configuration management
- **models.py**: Database models and ORM setup
- **routers/**: API route handlers organized by domain

## Security

- Input validation using Pydantic models
- SQL injection prevention through SQLAlchemy ORM
- CORS configuration for cross-origin requests
- Environment-based configuration (no hardcoded secrets)

## Development

### Adding New Features

1. Define database models in `backend/models.py`
2. Create Pydantic schemas in the router file
3. Implement API endpoints in `backend/routers/`
4. Register routers in `backend/main.py`

### Code Quality

- Follow PEP 8 style guidelines
- Add type hints to function signatures
- Include docstrings for functions and classes
- Implement proper error handling

## Troubleshooting

**Database Issues**:
- Delete `aligno.db` and restart the application to recreate tables

**Port Already in Use**:
- Change the port number: `uvicorn backend.main:app --port 8001`

**Import Errors**:
- Ensure virtual environment is activated
- Verify all dependencies are installed: `pip install -r backend/requirements.txt`

## License

Copyright © 2026 Aligno. All rights reserved.

## Support

For issues and questions, please refer to the project documentation or contact the development team.
