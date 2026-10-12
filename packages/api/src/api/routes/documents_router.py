from typing import Annotated, Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel

from api.auth import get_current_role, require_permission
from api.dependencies import (
    get_assets_service,
    get_device_manager,
    get_documents_service,
    get_pagination_params,
    get_users_service,
)
from api.document_upload import read_document_upload
from api.schemas.pagination import PaginatedResponse, to_paginated_response
from assets import AssetsService
from devices_manager import DevicesServiceInterface
from documents import (
    MAX_DOCUMENT_BYTES,
    Document,
    DocumentAccess,
    DocumentCreate,
    DocumentFilters,
    DocumentsService,
    DocumentUpdate,
)
from documents.validation import MEDIA_TYPES
from models.errors import InvalidError, NotFoundError
from models.pagination import PaginationParams
from users import UsersService
from users.permissions import Permission
from users.roles import Role

router = APIRouter()
_read = [Depends(require_permission(Permission.DOCUMENTS_READ))]
_write = [Depends(require_permission(Permission.DOCUMENTS_WRITE))]
_Service = Annotated[DocumentsService, Depends(get_documents_service)]


class DocumentUploadPolicy(BaseModel):
    max_file_bytes: int
    extensions: list[str]
    metadata_schema: dict[str, Any]


def document_access(
    role: Annotated[Role | None, Depends(get_current_role)],
) -> DocumentAccess:
    if role is None:
        raise HTTPException(403, "Permission denied.")
    return DocumentAccess(role_id=role.id, is_admin=role.id == "admin" and role.builtin)


_Access = Annotated[DocumentAccess, Depends(document_access)]


async def validate_references(
    values: DocumentCreate | DocumentUpdate,
    users: UsersService,
    assets: AssetsService,
    devices: DevicesServiceInterface,
) -> None:
    """Resolve only submitted links; old unavailable links need not block a rename."""
    for role_id in values.allowed_role_ids or []:
        role = await users.find_role(role_id)
        if role is None or Permission.DOCUMENTS_READ not in role.permissions:
            msg = "Unknown role or role cannot read documents."
            raise InvalidError(msg)
    try:
        for asset_id in values.asset_ids or []:
            await assets.get_by_id(asset_id)
        for device_id in values.device_ids or []:
            devices.get_device(device_id)
    except NotFoundError as exc:
        msg = "A linked asset or device does not exist."
        raise InvalidError(msg) from exc


@router.get("/upload-policy", dependencies=_read)
def upload_policy() -> DocumentUploadPolicy:
    return DocumentUploadPolicy(
        max_file_bytes=MAX_DOCUMENT_BYTES,
        extensions=list(MEDIA_TYPES),
        metadata_schema=DocumentCreate.model_json_schema(),
    )


@router.get("", dependencies=_read)
async def list_documents(
    request: Request,
    svc: _Service,
    access: _Access,
    filters: Annotated[DocumentFilters, Query()],
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
) -> PaginatedResponse[Document]:
    return to_paginated_response(
        await svc.list(access, filters=filters, pagination=pagination), str(request.url)
    )


@router.post(
    "",
    dependencies=_write,
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["file", "metadata"],
                        "properties": {
                            "file": {"type": "string", "format": "binary"},
                            "metadata": {
                                "type": "string",
                                "description": "JSON-encoded document metadata",
                                "contentMediaType": "application/json",
                                # Document responses register these shared types.
                                "contentSchema": DocumentCreate.model_json_schema(
                                    ref_template="#/components/schemas/{model}"
                                ),
                            },
                        },
                    }
                }
            },
        },
    },
)
async def create_document(
    request: Request,
    svc: _Service,
    user_id: Annotated[str, Depends(require_permission(Permission.DOCUMENTS_WRITE))],
    users: Annotated[UsersService, Depends(get_users_service)],
    assets: Annotated[AssetsService, Depends(get_assets_service)],
    devices: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> Document:
    async with read_document_upload(request) as (file, metadata):
        await validate_references(metadata, users, assets, devices)
        return await svc.create(
            metadata,
            filename=file.filename or "",
            data=await file.read(),
            created_by=user_id,
        )


@router.get("/{document_id}", dependencies=_read)
async def get_document(document_id: str, svc: _Service, access: _Access) -> Document:
    return await svc.get(document_id, access)


@router.get("/{document_id}/content", dependencies=_read, response_class=Response)
async def get_content(document_id: str, svc: _Service, access: _Access) -> Response:
    content = await svc.get_content(document_id, access)
    return Response(
        content.data,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": (
                "attachment; filename*=UTF-8''"
                + quote(content.document.filename, safe="")
            ),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
        },
    )


@router.patch("/{document_id}", dependencies=_write)
async def update_document(
    document_id: str,
    patch: DocumentUpdate,
    svc: _Service,
    users: Annotated[UsersService, Depends(get_users_service)],
    assets: Annotated[AssetsService, Depends(get_assets_service)],
    devices: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> Document:
    await validate_references(patch, users, assets, devices)
    return await svc.update(document_id, patch)


@router.delete("/{document_id}", dependencies=_write, status_code=204)
async def delete_document(document_id: str, svc: _Service) -> None:
    await svc.delete(document_id)
