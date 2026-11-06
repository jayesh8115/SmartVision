from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import get_settings
from app.services.model_service import ModelService

import sys
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from ai_detector import detector_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    svc = ModelService(app.state.settings)
    svc.load()  # loaded once at startup, not per request
    app.state.model_service = svc
    detector_service.load()  # loaded once at startup, not per request (reloaded)
    yield


def create_app(with_lifespan: bool = True) -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan if with_lifespan else None)
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)
    from app.api.ai_detector_routes import router as ai_router
    app.include_router(ai_router)
    return app


app = create_app()
