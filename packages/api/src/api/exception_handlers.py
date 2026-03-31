from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from models.errors import (
    AppUnreachableError,
    BlockedUserError,
    ConfirmationError,
    ForbiddenError,
    InvalidError,
    NotFoundError,
)


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

    @app.exception_handler(BlockedUserError)
    async def blocked_user_handler(
        request: Request, exc: BlockedUserError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=403,
            content={
                "detail": "Your account has been blocked. Contact an administrator."
            },
        )

    @app.exception_handler(AppUnreachableError)
    async def app_unreachable_handler(
        request: Request, exc: AppUnreachableError
    ) -> JSONResponse:
        return JSONResponse(status_code=502, content={"detail": str(exc)})
