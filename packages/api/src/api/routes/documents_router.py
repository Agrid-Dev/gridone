from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, Form, Query, Request, Response, UploadFile
from pydantic import BaseModel

from api.auth import require_permission
from api.dependencies import (
    get_assets_service,
    get_device_manager,
    get_documents_service,
    get_pagination_params,
)
from api.schemas.pagination import PaginatedResponse, to_paginated_response
from assets import AssetsService
from devices_manager import DevicesServiceInterface
from documents import (
    MAX_DOCUMENT_BYTES,
    Document,
    DocumentCreate,
    DocumentFilters,
    DocumentsService,
    DocumentTooLargeError,
    DocumentUpdate,
    Folder,
    FolderCreate,
    FolderUpdate,
)
from documents.models import Name, Reference, References
from documents.validation import MEDIA_TYPES
from models.errors import InvalidError, NotFoundError
from models.pagination import PaginationParams
from users.permissions import Permission

router = APIRouter()
_read = [Depends(require_permission(Permission.DOCUMENTS_READ))]
_write = [Depends(require_permission(Permission.DOCUMENTS_WRITE))]
_Service = Annotated[DocumentsService, Depends(get_documents_service)]


class DocumentUploadPolicy(BaseModel):
    max_file_bytes: int
    extensions: list[str]


async def validate_references(
    values: DocumentCreate | DocumentUpdate,
    assets: AssetsService,
    devices: DevicesServiceInterface,
) -> None:
    """Resolve only submitted links; old unavailable links need not block a rename."""
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
    )


# Declared before /{document_id}, which would otherwise capture "folders".
@router.get("/folders", dependencies=_read)
async def list_folders(svc: _Service) -> list[Folder]:
    return await svc.list_folders()


@router.post("/folders", status_code=201)
async def create_folder(
    folder: FolderCreate,
    svc: _Service,
    user_id: Annotated[str, Depends(require_permission(Permission.DOCUMENTS_WRITE))],
) -> Folder:
    return await svc.create_folder(folder, created_by=user_id)


@router.patch("/folders/{folder_id}", dependencies=_write)
async def update_folder(folder_id: str, patch: FolderUpdate, svc: _Service) -> Folder:
    return await svc.update_folder(folder_id, patch)


@router.delete("/folders/{folder_id}", dependencies=_write, status_code=204)
async def delete_folder(folder_id: str, svc: _Service) -> None:
    await svc.delete_folder(folder_id)


@router.get("", dependencies=_read)
async def list_documents(
    request: Request,
    svc: _Service,
    filters: Annotated[DocumentFilters, Query()],
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
) -> PaginatedResponse[Document]:
    return to_paginated_response(
        await svc.list(filters=filters, pagination=pagination), str(request.url)
    )


@router.post("", dependencies=_write, status_code=201)
async def create_document(
    file: UploadFile,
    name: Annotated[Name, Form()],
    asset_ids: Annotated[References, Form(default_factory=list)],
    device_ids: Annotated[References, Form(default_factory=list)],
    svc: _Service,
    user_id: Annotated[str, Depends(require_permission(Permission.DOCUMENTS_WRITE))],
    assets: Annotated[AssetsService, Depends(get_assets_service)],
    devices: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
    folder_id: Annotated[Reference | None, Form()] = None,
) -> Document:
    data = await file.read(MAX_DOCUMENT_BYTES + 1)
    if len(data) > MAX_DOCUMENT_BYTES:
        msg = "Document exceeds the upload size limit."
        raise DocumentTooLargeError(msg)
    metadata = DocumentCreate(
        name=name, folder_id=folder_id, asset_ids=asset_ids, device_ids=device_ids
    )
    await validate_references(metadata, assets, devices)
    return await svc.create(
        metadata,
        filename=file.filename or "",
        data=data,
        created_by=user_id,
    )


@router.get("/{document_id}", dependencies=_read)
async def get_document(document_id: str, svc: _Service) -> Document:
    return await svc.get(document_id)


@router.get("/{document_id}/content", dependencies=_read, response_class=Response)
async def get_content(document_id: str, svc: _Service) -> Response:
    content = await svc.get_content(document_id)
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
    assets: Annotated[AssetsService, Depends(get_assets_service)],
    devices: Annotated[DevicesServiceInterface, Depends(get_device_manager)],
) -> Document:
    await validate_references(patch, assets, devices)
    return await svc.update(document_id, patch)


@router.delete("/{document_id}", dependencies=_write, status_code=204)
async def delete_document(document_id: str, svc: _Service) -> None:
    await svc.delete(document_id)
