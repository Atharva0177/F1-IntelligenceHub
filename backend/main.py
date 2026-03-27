from collections import defaultdict, deque
from threading import Lock
from time import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from database.config import get_db, init_db
import os

# Initialize FastAPI app
enable_docs = os.getenv("ENABLE_API_DOCS", "true").lower() == "true"

app = FastAPI(
    title="F1 Intelligence Hub API",
    description="Comprehensive F1 analytics platform API",
    version="1.0.0",
    redirect_slashes=False,
    docs_url="/docs" if enable_docs else None,
    redoc_url="/redoc" if enable_docs else None,
    openapi_url="/openapi.json" if enable_docs else None,
)

# CORS middleware
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
allowed_hosts = [h.strip() for h in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,backend").split(",") if h.strip()]

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=allowed_hosts,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Admin-Key"],
)

# Lightweight in-memory rate limiting to reduce abuse on public and admin APIs.
_rate_limit_store = defaultdict(deque)
_rate_limit_lock = Lock()
_rate_limit_window_sec = int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60"))
_rate_limit_api_max = int(os.getenv("RATE_LIMIT_API_MAX_REQUESTS", "240"))
_rate_limit_admin_max = int(os.getenv("RATE_LIMIT_ADMIN_MAX_REQUESTS", "60"))


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    path = request.url.path
    ip = _client_ip(request)

    if path.startswith("/api"):
        scope = "admin" if path.startswith("/api/admin") else "api"
        limit = _rate_limit_admin_max if scope == "admin" else _rate_limit_api_max
        now = time()
        key = f"{scope}:{ip}"

        with _rate_limit_lock:
            q = _rate_limit_store[key]
            while q and now - q[0] > _rate_limit_window_sec:
                q.popleft()

            if len(q) >= limit:
                retry_after = max(1, int(_rate_limit_window_sec - (now - q[0])))
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded"},
                    headers={"Retry-After": str(retry_after)},
                )

            q.append(now)

    response = await call_next(request)

    # Security headers for all responses.
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"

    if path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

    return response

# Import route modules
from api.routes import (
    races, drivers, telemetry, analytics, weather, race_control,
    session_status, sessions, circuits, standings, constructors, h2h, predictions, admin
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
app.include_router(predictions.router, prefix="/api/predictions", tags=["predictions"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])


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
