from io import BytesIO
from pathlib import Path
from typing import Annotated, Never
from zipfile import ZIP_DEFLATED, ZipFile

import typer
from rich.console import Console

from cli.service import run_async, service
from devices_manager.core.presentation.diagnostics import UnavailablePresentation
from devices_manager.core.presentation.package import (
    DEFAULT_PACKAGE_LIMITS,
    MANIFEST_NAME,
    PackageError,
    PackageErrorCode,
    normalize_path,
    read_payload,
)
from devices_manager.core.presentation.package_install import InvalidPresentationError
from devices_manager.core.presentation.validation import (
    check_compatibility,
    validate_presentation,
)
from devices_manager.dto.driver_dto import PackagePlan, assemble_package, dto_to_core
from devices_manager.dto.driver_dto.package_errors import import_error
from models.errors import InvalidError
from models.yaml_loader import BoundedYamlError

app = typer.Typer(pretty_exceptions_show_locals=False)

console = Console()


@app.command("list")
@run_async
async def list_all() -> None:
    """List all drivers."""
    async with service() as svc:
        for driver in svc.list_drivers():
            console.print(driver.id)


def _validate_payload(payload: bytes, content_type: str) -> PackagePlan:
    """Use the server's parser and semantic driver validation without starting I/O."""
    try:
        plan = assemble_package(read_payload(payload, content_type))
        driver = dto_to_core(plan.spec)
        if driver.presentation is not None and not check_compatibility(
            driver.presentation
        ):
            resolved = validate_presentation(driver.presentation, driver.attributes)
            if isinstance(resolved, UnavailablePresentation):
                raise InvalidPresentationError(resolved.diagnostics)
    except (InvalidError, BoundedYamlError) as error:
        _report_error(error)
    else:
        return plan


def _report_error(error: Exception) -> Never:
    for diagnostic in import_error(error).diagnostics:
        location = diagnostic.path or MANIFEST_NAME
        if diagnostic.line is not None:
            location += f":{diagnostic.line}:{diagnostic.column}"
        console.print(
            f"{diagnostic.code} {location}: {diagnostic.message}", markup=False
        )
    raise typer.Exit(1) from error


@app.command("validate")
def validate_package(
    source: Annotated[Path, typer.Argument(exists=True, dir_okay=False)],
) -> None:
    """Validate a driver YAML or ZIP and print stable, located diagnostic codes."""
    with source.open("rb") as stream:
        payload = stream.read(DEFAULT_PACKAGE_LIMITS.max_archive_bytes + 1)
    media_type = (
        "application/zip" if source.suffix.lower() == ".zip" else "application/yaml"
    )
    plan = _validate_payload(payload, media_type)
    console.print(
        f"Valid driver {plan.spec.id}; {len(plan.resources)} resources", markup=False
    )
    for diagnostic in plan.diagnostics:
        console.print(
            f"{diagnostic.code} {diagnostic.path or '/'}: {diagnostic.message}",
            markup=False,
        )


@app.command("pack")
def pack_package(
    source: Annotated[Path, typer.Argument(exists=True, file_okay=False)],
    output: Annotated[Path, typer.Option("--output", "-o")],
) -> None:
    """Build a validated ZIP containing driver.yaml and its local resources."""
    try:
        payload = _pack_payload(source, output)
    except InvalidError as error:
        _report_error(error)
    _validate_payload(payload, "application/zip")
    output.write_bytes(payload)
    console.print(f"Created {output}", markup=False)


def _package_sources(source: Path, output: Path) -> list[Path]:
    """Collect at most one package's inputs, excluding a previous output ZIP."""
    files: list[Path] = []
    for path in source.rglob("*"):
        relative = path.relative_to(source).as_posix()
        if path.is_symlink():
            raise PackageError(
                PackageErrorCode.SYMLINK_ENTRY,
                "package sources must not contain symlinks",
                relative,
            )
        if path.is_dir():
            continue
        if path.resolve() == output.resolve() and path.suffix.lower() == ".zip":
            continue
        normalize_path(relative)
        if not path.is_file():
            raise PackageError(
                PackageErrorCode.SPECIAL_ENTRY,
                "package sources must be regular files",
                relative,
            )
        files.append(path)
        if len(files) > DEFAULT_PACKAGE_LIMITS.max_entries:
            raise PackageError(
                PackageErrorCode.TOO_MANY_ENTRIES,
                f"package exceeds {DEFAULT_PACKAGE_LIMITS.max_entries} entries",
            )
    if any(path.resolve() == output.resolve() for path in files):
        raise PackageError(
            PackageErrorCode.INVALID_NAME,
            "package output must not overwrite a source file",
            output.name,
        )
    return sorted(files)


def _pack_payload(source: Path, output: Path) -> bytes:
    """Apply file, total and archive budgets before compressing each input."""
    files = _package_sources(source, output)
    buffer = BytesIO()
    total = 0
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        for path in files:
            relative = path.relative_to(source).as_posix()
            cap = (
                DEFAULT_PACKAGE_LIMITS.max_manifest_bytes
                if relative == MANIFEST_NAME
                else DEFAULT_PACKAGE_LIMITS.max_image_bytes
            )
            with path.open("rb") as stream:
                data = stream.read(cap + 1)
            if len(data) > cap:
                raise PackageError(
                    PackageErrorCode.ENTRY_TOO_LARGE,
                    f"file exceeds {cap} bytes",
                    relative,
                )
            total += len(data)
            if total > DEFAULT_PACKAGE_LIMITS.max_total_bytes:
                raise PackageError(
                    PackageErrorCode.DECLARED_TOTAL_TOO_LARGE,
                    f"package exceeds {DEFAULT_PACKAGE_LIMITS.max_total_bytes} bytes",
                )
            archive.writestr(relative, data)
            if buffer.tell() > DEFAULT_PACKAGE_LIMITS.max_archive_bytes:
                raise PackageError(
                    PackageErrorCode.ARCHIVE_TOO_LARGE,
                    f"archive exceeds {DEFAULT_PACKAGE_LIMITS.max_archive_bytes} bytes",
                )
    return buffer.getvalue()
