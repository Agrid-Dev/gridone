import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from apps import AppUnreachableError, InvalidAppSchemaError
from models.errors import (
    BlockedUserError,
    ConfirmationError,
    ConflictError,
    InvalidError,
    NotFoundError,
    SchemaValidationError,
    UnauthorizedError,
    validation_details,
)

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(InvalidError)
    async def invalid_handler(request: Request, exc: InvalidError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(SchemaValidationError)
    async def schema_validation_handler(
        request: Request, exc: SchemaValidationError
    ) -> JSONResponse:
        # Same envelope as FastAPI's pydantic request validation, so form
        # clients map one single `detail: [{loc, msg, type}]` format.
        return JSONResponse(
            status_code=422,
            content={"detail": validation_details(exc.errors)},
        )

    @app.exception_handler(ConflictError)
    async def conflict_handler(request: Request, exc: ConflictError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

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

    @app.exception_handler(UnauthorizedError)
    async def unauthorized_handler(
        request: Request, exc: UnauthorizedError
    ) -> JSONResponse:
        # Generic message on purpose: never leak which credential check failed.
        logger.warning("Unauthorized request on %s", request.url.path)
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

    @app.exception_handler(AppUnreachableError)
    async def app_unreachable_handler(
        request: Request, exc: AppUnreachableError
    ) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": "App is unreachable"})

    @app.exception_handler(InvalidAppSchemaError)
    async def invalid_app_schema_handler(
        request: Request, exc: InvalidAppSchemaError
    ) -> JSONResponse:
        # The app is at fault, not the caller — never a 422 blaming the payload.
        logger.warning("Invalid config schema served by app on %s", request.url.path)
        return JSONResponse(
            status_code=503,
            content={"detail": "App returned an invalid config schema"},
        )
