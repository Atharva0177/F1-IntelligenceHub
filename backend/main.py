from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from database.config import get_db, init_db
import os

# Initialize FastAPI app
app = FastAPI(
    title="F1 Intelligence Hub API",
    description="Comprehensive F1 analytics platform API",
    version="1.0.0",
    redirect_slashes=False,
)

# CORS middleware
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import route modules
from api.routes import (
    races, drivers, telemetry, analytics, weather, race_control,
    session_status, sessions, circuits, standings, constructors, h2h
)

# Register routers
app.include_router(races.router, prefix="/api/races", tags=["races"])
app.include_router(drivers.router, prefix="/api/drivers", tags=["drivers"])
app.include_router(telemetry.router, prefix="/api/telemetry", tags=["telemetry"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(circuits.router, prefix="/api/circuits", tags=["circuits"])
app.include_router(standings.router, prefix="/api/standings", tags=["standings"])
app.include_router(constructors.router, prefix="/api/constructors", tags=["constructors"])
app.include_router(h2h.router, prefix="/api/h2h", tags=["head-to-head"])
app.include_router(weather.router)  # Already has prefix in router definition
app.include_router(race_control.router)  # Already has prefix in router definition
app.include_router(session_status.router)  # Already has prefix in router definition
app.include_router(sessions.router, prefix="/api")  # sessions.py has /sessions prefix


@app.on_event("startup")
async def startup_event():
    """
    Initialize database on startup
    """
    init_db()


@app.get("/")
async def root():
    """
    Root endpoint
    """
    return {
        "message": "F1 Intelligence Hub API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", 8000))
    
    uvicorn.run(app, host=host, port=port, reload=True)
