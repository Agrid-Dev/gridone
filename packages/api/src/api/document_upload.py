"""Bound multipart reception before parsing, including bodies without Content-Length."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import HTTPException, Request
from pydantic import ValidationError
from starlette.datastructures import UploadFile
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.formparsers import MultiPartException
from starlette.types import Message

from documents import MAX_DOCUMENT_BYTES, DocumentCreate
from models.errors import SchemaValidationError, validation_error_items

_METADATA_BYTES = 64 * 1024
_BODY_BYTES = MAX_DOCUMENT_BYTES + 2 * _METADATA_BYTES


@asynccontextmanager
async def read_document_upload(
    request: Request,
) -> AsyncIterator[tuple[UploadFile, DocumentCreate]]:
    """Cap the wire body, then parse exactly one file and one JSON metadata field.

    Raise MultiPartException from receive so Starlette closes spooled files on
    overflow/disconnect. Parsing happens inside the endpoint, after auth, and
    the form context closes temporary files on every success and failure path.
    """
    received = 0
    oversized = False

    async def receive() -> Message:
        nonlocal received, oversized
        message = await request.receive()
        if message["type"] == "http.disconnect":
            msg = "Document upload interrupted."
            raise MultiPartException(msg)
        received += len(message.get("body", b""))
        if received > _BODY_BYTES:
            oversized = True
            msg = "Document exceeds the upload size limit."
            raise MultiPartException(msg)
        return message

    bounded = Request(request.scope, receive=receive)
    try:
        async with bounded.form(
            max_files=1, max_fields=1, max_part_size=_METADATA_BYTES
        ) as form:
            file = form.get("file")
            metadata = form.get("metadata")
            if (
                set(form) != {"file", "metadata"}
                or not isinstance(file, UploadFile)
                or not isinstance(metadata, str)
            ):
                raise HTTPException(422, "Expected one file and a metadata JSON field.")
            if (file.size or 0) > MAX_DOCUMENT_BYTES:
                raise HTTPException(413, "Document exceeds the upload size limit.")
            try:
                values = DocumentCreate.model_validate_json(metadata)
            except ValidationError as exc:
                raise SchemaValidationError(validation_error_items(exc)) from exc
            yield file, values
    except StarletteHTTPException as exc:
        if oversized:
            raise HTTPException(413, "Document exceeds the upload size limit.") from exc
        raise
