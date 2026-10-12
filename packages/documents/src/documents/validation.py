"""Conservative format checks; files are downloaded, never rendered or extracted."""

import zlib
from io import BytesIO
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile

from models.errors import InvalidError

_MAX_FILENAME_LENGTH = 255
_MAX_ZIP_ENTRIES = 10000
_MAX_CONTENT_TYPES_BYTES = 65536
_MIN_PNG_BYTES = 45

MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def safe_filename(filename: str) -> str:
    """Strip directory paths and control characters before storing a download name."""
    name = PurePosixPath(filename.replace("\\", "/")).name
    name = "".join(char for char in name if char.isprintable()).strip()
    if not name or len(name) > _MAX_FILENAME_LENGTH:
        msg = "Invalid document filename."
        raise InvalidError(msg)
    return name


def _is_text(data: bytes) -> bool:
    encoding = "utf-16" if data.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
    try:
        text = data.decode(encoding)
    except UnicodeError:
        return False
    return all(char.isprintable() or char in "\r\n\t\f" for char in text)


def _is_office(data: bytes, extension: str) -> bool:
    """Check bounded OOXML metadata and the main part without extracting the archive.

    ZIP alone is not a DOCX/XLSX signature. Require the corresponding main part
    and content type; reject encrypted/macro containers and duplicate entries.
    """
    main, kind = (
        ("word/document.xml", b"wordprocessingml.document.main+xml")
        if extension == ".docx"
        else ("xl/workbook.xml", b"spreadsheetml.sheet.main+xml")
    )
    try:
        with ZipFile(BytesIO(data)) as archive:
            entries = archive.infolist()
            names = archive.namelist()
            if (
                len(entries) > _MAX_ZIP_ENTRIES
                or len(names) != len(set(names))
                or main not in names
                or "[Content_Types].xml" not in names
                or any(entry.flag_bits & 1 for entry in entries)
                or any(name.lower().endswith("vbaproject.bin") for name in names)
            ):
                return False
            info = archive.getinfo("[Content_Types].xml")
            if info.file_size > _MAX_CONTENT_TYPES_BYTES:
                return False
            with archive.open(info) as content:
                types = content.read(_MAX_CONTENT_TYPES_BYTES + 1)
            return (
                len(types) <= _MAX_CONTENT_TYPES_BYTES
                and kind in types
                and b"macroEnabled" not in types
            )
    except (
        BadZipFile,
        KeyError,
        RuntimeError,
        NotImplementedError,
        ValueError,
        zlib.error,
        EOFError,
    ):
        return False


def validate_file(filename: str, data: bytes) -> str:
    """Return a trusted media type after checking extension and container signature."""
    extension = PurePosixPath(filename).suffix.lower()
    valid = False
    if extension == ".pdf":
        valid = data.startswith(b"%PDF-") and b"%%EOF" in data[-1024:]
    elif extension == ".png":
        valid = (
            len(data) >= _MIN_PNG_BYTES
            and data.startswith(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR")
            and data.endswith(b"IEND\xaeB`\x82")
        )
    elif extension in {".jpg", ".jpeg"}:
        valid = data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9")
    elif extension in {".txt", ".csv"}:
        valid = _is_text(data)
    elif extension in {".docx", ".xlsx"}:
        valid = _is_office(data, extension)
    if not valid:
        msg = (
            "Unsupported document format or file content does not match its extension."
        )
        raise InvalidError(msg)
    return MEDIA_TYPES[extension]
