from devices_manager.errors import (
    ConfirmationError,
    ForbiddenError,
    InvalidError,
    NotFoundError,
)
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from starlette.requests import Request


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ForbiddenError)
    async def forbidden_handler(request: Request, exc: ForbiddenError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(InvalidError)
    async def invalid_handler(request: Request, exc: InvalidError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(ConfirmationError)
    async def confirmation_handler(
        request: Request, exc: ConfirmationError
    ) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})
