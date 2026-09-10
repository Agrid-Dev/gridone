"""Reading a driver package: ``driver.yaml`` at the root of a ZIP archive
plus the PNG/WebP files it references (ADR §7), or the bare manifest.

Pure over bytes — the only I/O is ``zipfile`` over ``BytesIO``, nothing is
ever extracted to a directory. The checks run cheapest and least trusting
first (ADR §11, "Paquets et ressources"):

1. archive size and the local-file-header signature at offset 0, which
   refuses prepended junk and HTML/ZIP polyglots that ``zipfile`` opens;
2. the end-of-central-directory record, parsed here: trailing data,
   comment, multi-disk, zip64 markers and the *entry count* — a 5 000-entry
   archive is refused before ``zipfile`` builds 5 000 ``ZipInfo`` objects;
3. one pass over the central directory without decompressing anything:
   name policy, directory entries, encryption, compression method, mode
   bits (symlinks), declared sizes against the per-entry and total caps,
   collisions after case folding and NFC, manifest presence;
4. a streaming read of every entry in 64 KiB chunks with hard caps on the
   bytes actually received — ``file_size`` is compared, never trusted —
   and, for images, the header sniff of ``resource.sniff_image``.

The name policy is the dialect's own asset-path rule
(``models.check_asset_path``): one rule shared by the document and the
archive instead of a blacklist of what an archive may not contain.
"""

from __future__ import annotations

import io
import stat
import struct
import unicodedata
import zipfile
import zlib
from dataclasses import dataclass
from enum import StrEnum
from typing import IO, TYPE_CHECKING, Final, NamedTuple

from models.errors import InvalidError
from models.yaml_loader import DEFAULT_YAML_LIMITS

from .models import (
    MAX_ASSET_PATH_LENGTH,
    MAX_ASSET_PATH_SEGMENTS,
    check_asset_path,
    check_path_segments,
)
from .resource import (
    DEFAULT_IMAGE_LIMITS,
    ImageError,
    ImageErrorCode,
    ImageFormat,
    image_format_of,
    sniff_image,
)

if TYPE_CHECKING:
    from collections.abc import Iterable

MIB: Final = 1024 * 1024
MANIFEST_NAME: Final = "driver.yaml"
ZIP_MEDIA_TYPES: Final = frozenset({"application/zip", "application/x-zip-compressed"})
YAML_MEDIA_TYPES: Final = frozenset(
    {"application/yaml", "text/yaml", "application/x-yaml"}
)

_LOCAL_HEADER_SIGNATURE: Final = b"PK\x03\x04"
_EOCD_SIGNATURE: Final = b"PK\x05\x06"
_EOCD_SIZE: Final = 22
_CENTRAL_HEADER_SIGNATURE: Final = b"PK\x01\x02"
_CENTRAL_HEADER_SIZE: Final = 46
_MAX_COMMENT: Final = 0xFFFF
_ZIP64_ENTRY_COUNT: Final = 0xFFFF
_ZIP64_SIZE: Final = 0xFFFFFFFF
_ZIP64_EXTRA_ID: Final = 0x0001
_FLAG_ENCRYPTED: Final = 0x0001
_FLAG_PATCHED_DATA: Final = 0x0020
_FLAG_STRONG_ENCRYPTION: Final = 0x0040
_CHUNK: Final = 64 * 1024


class PackageErrorCode(StrEnum):
    ARCHIVE_TOO_LARGE = "archive_too_large"
    NOT_A_ZIP = "not_a_zip"
    TRAILING_DATA = "trailing_data"
    ARCHIVE_COMMENT = "archive_comment"
    ZIP64_UNSUPPORTED = "zip64_unsupported"
    TOO_MANY_ENTRIES = "too_many_entries"
    INVALID_NAME = "invalid_name"
    DUPLICATE_NAME = "duplicate_name"
    MANIFEST_MISSING = "manifest_missing"
    MANIFEST_NOT_UTF8 = "manifest_not_utf8"
    SYMLINK_ENTRY = "symlink_entry"
    SPECIAL_ENTRY = "special_entry"
    DIRECTORY_ENTRY_WITH_DATA = "directory_entry_with_data"
    ENCRYPTED_ENTRY = "encrypted_entry"
    UNSUPPORTED_COMPRESSION = "unsupported_compression"
    ENTRY_TOO_LARGE = "entry_too_large"
    DECLARED_TOTAL_TOO_LARGE = "declared_total_too_large"
    DECOMPRESSED_TOTAL_EXCEEDED = "decompressed_total_exceeded"
    SIZE_MISMATCH = "size_mismatch"
    BAD_ZIP_ENTRY = "bad_zip_entry"
    UNSUPPORTED_MEDIA_TYPE = "unsupported_media_type"


class PackageError(InvalidError):
    """A package refused by the reader; ``path`` names the entry when known.

    Image entries are refused with the image layer's own codes, so the two
    layers report one vocabulary.
    """

    def __init__(
        self,
        code: PackageErrorCode | ImageErrorCode,
        message: str,
        path: str | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.path = path

    def __str__(self) -> str:
        where = "" if self.path is None else f" [{self.path}]"
        return f"{self.code}: {self.message}{where}"


@dataclass(frozen=True)
class PackageLimits:
    max_archive_bytes: int = 20 * MIB
    """Compressed, checked on the payload before anything else."""
    max_total_bytes: int = 50 * MIB
    """Decompressed, checked on the declared sizes and again on the bytes read."""
    max_entries: int = 128
    """Every entry, directories included, from the end-of-central-directory."""
    max_manifest_bytes: int = DEFAULT_YAML_LIMITS.max_bytes
    max_image_bytes: int = DEFAULT_IMAGE_LIMITS.max_bytes
    max_path_length: int = MAX_ASSET_PATH_LENGTH
    max_segments: int = MAX_ASSET_PATH_SEGMENTS


DEFAULT_PACKAGE_LIMITS: Final = PackageLimits()


@dataclass(frozen=True)
class PackageFiles:
    """What a package holds once read: the manifest text and every other
    entry by normalized path, sniffed but not yet decoded."""

    manifest: str
    files: dict[str, bytes]


# --- Names --------------------------------------------------------------------


class EntryPath(NamedTuple):
    path: str
    is_directory: bool


def normalize_path(
    name: str, limits: PackageLimits = DEFAULT_PACKAGE_LIMITS
) -> EntryPath:
    """Validate an archive entry name.

    Accepted: ``driver.yaml`` at the root, a directory ``dir/`` whose
    segments follow the dialect's path rule, or a ``*.png`` / ``*.webp``
    file whose whole path is a valid asset path. Everything else —
    absolute paths, drive letters, backslashes, ``.`` or ``..`` segments,
    dot-files, ``__MACOSX``, NUL, non-ASCII, other extensions, a manifest
    elsewhere or spelled differently — is ``invalid_name``.
    """
    if not name:
        raise PackageError(PackageErrorCode.INVALID_NAME, "empty name", name)
    if "\\" in name or name.startswith("/") or ":" in name:
        raise PackageError(
            PackageErrorCode.INVALID_NAME,
            "absolute path, drive letter or backslash",
            name,
        )
    if name == MANIFEST_NAME:
        return EntryPath(name, is_directory=False)
    is_directory = name.endswith("/")
    path = name.removesuffix("/")
    try:
        if is_directory:
            check_path_segments(
                path,
                max_length=limits.max_path_length,
                max_segments=limits.max_segments,
            )
        else:
            check_asset_path(
                path,
                max_length=limits.max_path_length,
                max_segments=limits.max_segments,
            )
    except ValueError as exc:
        raise PackageError(PackageErrorCode.INVALID_NAME, str(exc), name) from exc
    return EntryPath(name, is_directory=is_directory)


def collision_key(path: str) -> str:
    """The key under which two names are the same file on a case-insensitive,
    normalizing file system (macOS, Windows): NFC then case folding."""
    return unicodedata.normalize("NFC", path).casefold()


# --- Container ----------------------------------------------------------------


def _check_container(data: bytes, limits: PackageLimits) -> None:
    if len(data) > limits.max_archive_bytes:
        raise PackageError(
            PackageErrorCode.ARCHIVE_TOO_LARGE,
            f"{len(data)} bytes > {limits.max_archive_bytes}",
        )
    if not data.startswith(_LOCAL_HEADER_SIGNATURE):
        raise PackageError(
            PackageErrorCode.NOT_A_ZIP, "first bytes are not a local file header"
        )
    _check_end_of_central_directory(data, limits)


def _check_end_of_central_directory(data: bytes, limits: PackageLimits) -> None:
    """Parse the 22-byte EOCD record ourselves, before ``zipfile`` does.

    The record must end the file (no trailing data, no comment), describe
    a single disk, carry no zip64 marker, and announce at most
    ``max_entries`` entries — the cheapest gate against archives built to
    make the central-directory parse itself expensive.
    """
    tail = max(0, len(data) - _EOCD_SIZE - _MAX_COMMENT)
    pos = data.rfind(_EOCD_SIGNATURE, tail)
    if pos < 0:
        raise PackageError(
            PackageErrorCode.NOT_A_ZIP, "no end-of-central-directory record"
        )
    if pos + _EOCD_SIZE > len(data):
        raise PackageError(
            PackageErrorCode.NOT_A_ZIP, "truncated end-of-central-directory record"
        )
    disk, cd_disk, on_disk, total, cd_size, cd_offset, comment_len = struct.unpack(
        "<HHHHIIH", data[pos + 4 : pos + _EOCD_SIZE]
    )
    if pos + _EOCD_SIZE + comment_len != len(data):
        trailing = len(data) - pos - _EOCD_SIZE - comment_len
        raise PackageError(
            PackageErrorCode.TRAILING_DATA, f"{trailing} bytes after the archive"
        )
    if comment_len:
        raise PackageError(
            PackageErrorCode.ARCHIVE_COMMENT, "archive comments are not allowed"
        )
    if disk or cd_disk or on_disk != total:
        raise PackageError(PackageErrorCode.NOT_A_ZIP, "multi-disk archive")
    if total == _ZIP64_ENTRY_COUNT or _ZIP64_SIZE in (cd_size, cd_offset):
        raise PackageError(
            PackageErrorCode.ZIP64_UNSUPPORTED,
            "zip64 end-of-central-directory markers",
        )
    if total > limits.max_entries:
        raise PackageError(
            PackageErrorCode.TOO_MANY_ENTRIES,
            f"{total} entries > {limits.max_entries}",
        )
    if cd_offset + cd_size != pos:
        raise PackageError(
            PackageErrorCode.NOT_A_ZIP,
            "central directory does not end at the EOCD record",
        )
    if total == 0:
        raise PackageError(PackageErrorCode.NOT_A_ZIP, "empty archive")
    _check_central_directory(data, cd_offset, pos, total, limits)


def _check_central_directory(
    data: bytes, start: int, end: int, declared_count: int, limits: PackageLimits
) -> None:
    """Count actual headers before ``zipfile`` allocates its entry objects.

    EOCD counts are untrusted: a forged small count must not allow an
    unbounded directory parse. Skip each header's variable-length name,
    extra fields and comment without allocating them.
    """
    count = 0
    pos = start
    while pos < end:
        if (
            pos + _CENTRAL_HEADER_SIZE > end
            or data[pos : pos + 4] != _CENTRAL_HEADER_SIGNATURE
        ):
            raise PackageError(PackageErrorCode.NOT_A_ZIP, "invalid central directory")
        count += 1
        if count > limits.max_entries:
            raise PackageError(
                PackageErrorCode.TOO_MANY_ENTRIES,
                f"more than {limits.max_entries} central-directory entries",
            )
        name_size, extra_size, comment_size = struct.unpack_from("<HHH", data, pos + 28)
        pos += _CENTRAL_HEADER_SIZE + name_size + extra_size + comment_size
    if pos != end or count != declared_count:
        raise PackageError(
            PackageErrorCode.NOT_A_ZIP, "central-directory size or count mismatch"
        )


def _has_zip64_extra(extra: bytes) -> bool:
    pos = 0
    while pos + 4 <= len(extra):
        header_id, size = struct.unpack("<HH", extra[pos : pos + 4])
        if header_id == _ZIP64_EXTRA_ID:
            return True
        pos += 4 + size
    return False


# --- Central directory pass -------------------------------------------------


@dataclass(frozen=True)
class _Entry:
    info: zipfile.ZipInfo
    path: str
    cap: int
    """Bytes this entry may decompress to: the manifest or the image cap."""
    image_format: ImageFormat | None


def _plan(archive: zipfile.ZipFile, limits: PackageLimits) -> list[_Entry]:
    """Validate every entry from the central directory, decompressing nothing."""
    entries: list[_Entry] = []
    seen: dict[str, str] = {}
    declared_total = 0
    for info in archive.infolist():
        entry = _plan_entry(info, limits)
        if entry is None:
            continue
        declared_total += info.file_size
        if declared_total > limits.max_total_bytes:
            raise PackageError(
                PackageErrorCode.DECLARED_TOTAL_TOO_LARGE,
                f"declared sizes exceed {limits.max_total_bytes} bytes",
                entry.path,
            )
        key = collision_key(entry.path)
        if key in seen:
            raise PackageError(
                PackageErrorCode.DUPLICATE_NAME,
                f"collides with {seen[key]!r}",
                entry.path,
            )
        seen[key] = entry.path
        entries.append(entry)
    if MANIFEST_NAME not in seen:
        raise PackageError(
            PackageErrorCode.MANIFEST_MISSING,
            f"{MANIFEST_NAME} must be at the archive root",
        )
    return entries


def _plan_entry(info: zipfile.ZipInfo, limits: PackageLimits) -> _Entry | None:
    """One entry's checks; ``None`` for an empty directory entry (skipped).

    ``orig_filename`` is the name as stored: ``zipfile`` cuts ``filename``
    at the first NUL, which would let ``x.png\\0.exe`` pass as ``x.png``.
    """
    name = info.orig_filename
    if _has_zip64_extra(info.extra):
        raise PackageError(
            PackageErrorCode.ZIP64_UNSUPPORTED, "zip64 extra field", name
        )
    path, is_directory = normalize_path(name, limits)
    if is_directory:
        # compress_size is 2 for an empty deflate stream: only file_size counts.
        if info.file_size:
            raise PackageError(
                PackageErrorCode.DIRECTORY_ENTRY_WITH_DATA,
                f"{info.file_size} bytes",
                name,
            )
        return None
    _check_entry_flags(info, name)
    cap = limits.max_manifest_bytes if path == MANIFEST_NAME else limits.max_image_bytes
    if info.file_size > cap:
        raise PackageError(
            PackageErrorCode.ENTRY_TOO_LARGE,
            f"declares {info.file_size} bytes > {cap}",
            name,
        )
    return _Entry(info, path, cap, image_format_of(path))


def _check_entry_flags(info: zipfile.ZipInfo, name: str) -> None:
    if info.flag_bits & (_FLAG_ENCRYPTED | _FLAG_STRONG_ENCRYPTION):
        raise PackageError(
            PackageErrorCode.ENCRYPTED_ENTRY, "encryption flag set", name
        )
    if info.flag_bits & _FLAG_PATCHED_DATA or info.compress_type not in (
        zipfile.ZIP_STORED,
        zipfile.ZIP_DEFLATED,
    ):
        raise PackageError(
            PackageErrorCode.UNSUPPORTED_COMPRESSION,
            f"method {info.compress_type}, flags {info.flag_bits:#06x}",
            name,
        )
    mode = info.external_attr >> 16
    if mode and stat.S_IFMT(mode) not in (0, stat.S_IFREG):
        code = (
            PackageErrorCode.SYMLINK_ENTRY
            if stat.S_ISLNK(mode)
            else PackageErrorCode.SPECIAL_ENTRY
        )
        raise PackageError(code, f"mode {oct(mode)}", name)


# --- Streaming read -----------------------------------------------------------


def _read_entries(
    archive: zipfile.ZipFile, entries: Iterable[_Entry], limits: PackageLimits
) -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    received_total = 0
    for entry in entries:
        data = _read_entry(archive, entry, received_total, limits)
        received_total += len(data)
        if entry.image_format is not None:
            _sniff_entry(entry, data)
        files[entry.path] = data
    return files


def _read_entry(
    archive: zipfile.ZipFile, entry: _Entry, received_total: int, limits: PackageLimits
) -> bytes:
    try:
        with archive.open(entry.info) as stream:
            data = read_bounded(
                stream,
                cap=entry.cap,
                budget=limits.max_total_bytes - received_total,
                path=entry.path,
            )
    except (
        zipfile.BadZipFile,
        EOFError,
        OSError,
        zlib.error,
        NotImplementedError,
    ) as exc:
        raise PackageError(
            PackageErrorCode.BAD_ZIP_ENTRY,
            f"{type(exc).__name__}: {str(exc)[:100]}",
            entry.path,
        ) from exc
    if len(data) != entry.info.file_size:
        raise PackageError(
            PackageErrorCode.SIZE_MISMATCH,
            f"declared {entry.info.file_size} bytes, got {len(data)}",
            entry.path,
        )
    return data


def read_bounded(stream: IO[bytes], *, cap: int, budget: int, path: str) -> bytes:
    """Read ``stream`` in 64 KiB chunks under hard caps on the bytes received.

    ``cap`` bounds this entry, ``budget`` what the whole package may still
    decompress; both hold whatever the stream announces about its size.
    ``ZipExtFile.read(n)`` inflates at most ``n`` bytes per call, so memory
    per step is bounded by the chunk size whatever the stream expands to.
    """
    chunks: list[bytes] = []
    received = 0
    while chunk := stream.read(_CHUNK):
        received += len(chunk)
        if received > cap:
            raise PackageError(
                PackageErrorCode.ENTRY_TOO_LARGE,
                f"more than {cap} bytes decompressed",
                path,
            )
        if received > budget:
            raise PackageError(
                PackageErrorCode.DECOMPRESSED_TOTAL_EXCEEDED,
                "the package's decompressed size budget is exhausted",
                path,
            )
        chunks.append(chunk)
    return b"".join(chunks)


def _sniff_entry(entry: _Entry, data: bytes) -> None:
    try:
        sniff_image(data, expected=entry.image_format)
    except ImageError as exc:
        raise PackageError(exc.code, exc.message, entry.path) from exc


def _decode_manifest(raw: bytes) -> str:
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise PackageError(
            PackageErrorCode.MANIFEST_NOT_UTF8, "not UTF-8 text", MANIFEST_NAME
        ) from exc


# --- Entry points -------------------------------------------------------------


def read_package(
    zip_bytes: bytes, limits: PackageLimits = DEFAULT_PACKAGE_LIMITS
) -> PackageFiles:
    """Read a ZIP package into memory, or raise ``PackageError``."""
    _check_container(zip_bytes, limits)
    try:
        archive = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except (zipfile.BadZipFile, struct.error, ValueError) as exc:
        raise PackageError(PackageErrorCode.NOT_A_ZIP, str(exc)[:100]) from exc
    with archive:
        entries = _plan(archive, limits)
        files = _read_entries(archive, entries, limits)
    manifest = _decode_manifest(files.pop(MANIFEST_NAME))
    return PackageFiles(manifest=manifest, files=files)


def read_payload(
    payload: bytes, content_type: str, limits: PackageLimits = DEFAULT_PACKAGE_LIMITS
) -> PackageFiles:
    """The upload's body as package files: a ZIP archive or a bare manifest.

    ``content_type`` is the request's media type, parameters allowed
    (``application/yaml; charset=utf-8``). A bare manifest is capped like
    the archive's ``driver.yaml``.
    """
    media_type = content_type.partition(";")[0].strip().lower()
    if media_type in ZIP_MEDIA_TYPES:
        return read_package(payload, limits)
    if media_type in YAML_MEDIA_TYPES:
        if len(payload) > limits.max_manifest_bytes:
            raise PackageError(
                PackageErrorCode.ENTRY_TOO_LARGE,
                f"manifest exceeds {limits.max_manifest_bytes} bytes",
                MANIFEST_NAME,
            )
        return PackageFiles(manifest=_decode_manifest(payload), files={})
    raise PackageError(
        PackageErrorCode.UNSUPPORTED_MEDIA_TYPE,
        f"{media_type!r} is neither YAML nor ZIP",
    )
