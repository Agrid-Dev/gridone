from pydantic import BaseModel

from devices_manager.dto.driver_dto.package_errors import PackageDiagnostic


class PackageImportErrorResponse(BaseModel):
    detail: list[PackageDiagnostic]
