"""Safe, located import diagnostics shared by the HTTP controller and CLI."""

from pydantic import BaseModel

from devices_manager.core.presentation.package import PackageError
from devices_manager.core.presentation.package_install import InvalidPresentationError
from devices_manager.core.presentation.resource import ImageError
from models.errors import InvalidError, SchemaValidationError
from models.yaml_loader import BoundedYamlError


class PackageDiagnostic(BaseModel):
    code: str
    path: str | None = None
    line: int | None = None
    column: int | None = None
    message: str


class PackageImportError(InvalidError):
    def __init__(self, diagnostics: list[PackageDiagnostic]) -> None:
        self.diagnostics = diagnostics
        super().__init__(
            "; ".join(
                f"[{item.code}] {item.path or '/'}: {item.message}"
                for item in diagnostics
            )
        )


def import_error(error: Exception) -> PackageImportError:
    """Map controlled parser errors; never return a raw internal exception."""
    if isinstance(error, PackageImportError):
        return error
    if isinstance(error, InvalidPresentationError):
        return PackageImportError(
            [PackageDiagnostic(**item.model_dump()) for item in error.diagnostics]
        )
    if isinstance(error, BoundedYamlError):
        return PackageImportError(
            [
                PackageDiagnostic(
                    code=error.code,
                    line=error.line,
                    column=error.column,
                    message="YAML validation failed",
                )
            ]
        )
    if isinstance(error, PackageError | ImageError):
        return PackageImportError(
            [PackageDiagnostic(code=error.code, path=error.path, message=error.message)]
        )
    if isinstance(error, SchemaValidationError):
        return PackageImportError(
            [
                PackageDiagnostic(
                    code=item.type,
                    path="/"
                    + "/".join(
                        str(part).replace("~", "~0").replace("/", "~1")
                        for part in item.loc
                    ),
                    message=item.msg,
                )
                for item in error.errors
            ]
        )
    return PackageImportError(
        [
            PackageDiagnostic(
                code="invalid_driver", message="Driver package validation failed"
            )
        ]
    )
