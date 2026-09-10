"""Static images of a driver package: header sniffing and normalization.

Two pure functions over bytes, the only I/O being Pillow over ``BytesIO``:

- ``sniff_image`` reads the container header alone — PNG signature and
  ``IHDR`` plus a capped walk of chunk headers looking for ``acTL``; WebP
  ``RIFF``/``WEBP`` plus the ``VP8 ``, ``VP8L`` or ``VP8X`` header — and
  yields format and dimensions, or refuses an animated or mislabelled
  file. The ZIP reader calls it before accepting an entry, and the pixel
  budgets are decided from it before a single pixel is allocated;
- ``normalize_image`` decodes fully with the PNG and WebP plugins only,
  drops every piece of metadata and re-encodes an RGBA PNG whose only
  chunks are ``IHDR``, ``IDAT`` and ``IEND`` — the one format and the one
  content the frontend will ever be served (ADR §11).

``normalize_images`` applies the per-package budget (count, total pixels)
from the headers, then normalizes sequentially: 16 MP costs about 100 ms
and 150 MB transiently, so images are never decoded side by side.
"""

from __future__ import annotations

import hashlib
import io
import struct
import zlib
from contextlib import contextmanager
from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING, Final

from PIL import Image

from models.errors import InvalidError

if TYPE_CHECKING:
    from collections.abc import Iterator, Mapping

MIB: Final = 1024 * 1024
PNG_MEDIA_TYPE: Final = "image/png"


class ImageFormat(StrEnum):
    PNG = "png"
    WEBP = "webp"


class ImageErrorCode(StrEnum):
    MAGIC_MISMATCH = "magic_mismatch"
    HEADER_INVALID = "image_header_invalid"
    ANIMATED = "animated_image"
    TOO_LARGE = "image_too_large"
    """More pixels than the per-image budget, decided from the header."""
    FILE_TOO_LARGE = "image_file_too_large"
    DECODE_ERROR = "image_decode_error"
    TOO_MANY_IMAGES = "too_many_images"
    PACKAGE_PIXELS_EXCEEDED = "package_pixels_exceeded"
    NOT_STRIPPED = "image_not_stripped"
    """The re-encoded PNG carries a chunk other than IHDR/IDAT/IEND: an
    invariant of this module, never expected on any input."""


class ImageError(InvalidError):
    """An image refused by this module; ``path`` names the file when known."""

    def __init__(
        self, code: ImageErrorCode, message: str, path: str | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.path = path

    def __str__(self) -> str:
        where = "" if self.path is None else f" [{self.path}]"
        return f"{self.code}: {self.message}{where}"


@dataclass(frozen=True)
class ImageLimits:
    max_pixels: int = 16_000_000
    max_bytes: int = 10 * MIB
    max_images: int = 64
    """Per package."""
    max_package_pixels: int = 64_000_000
    """Per package, summed over the headers before anything is decoded."""


DEFAULT_IMAGE_LIMITS: Final = ImageLimits()


@dataclass(frozen=True)
class ImageHeader:
    format: ImageFormat
    width: int
    height: int

    @property
    def pixels(self) -> int:
        return self.width * self.height


@dataclass(frozen=True)
class NormalizedImage:
    data: bytes
    """A PNG, RGBA, 8 bits per channel, chunks IHDR + IDAT + IEND only."""
    width: int
    height: int
    sha256: str
    media_type: str = PNG_MEDIA_TYPE


def image_format_of(path: str) -> ImageFormat | None:
    """The format an entry name announces, or ``None`` for non-image names."""
    for image_format in ImageFormat:
        if path.endswith(f".{image_format}"):
            return image_format
    return None


# --- Header sniffing --------------------------------------------------------

_PNG_SIGNATURE: Final = b"\x89PNG\r\n\x1a\n"
_PNG_IHDR_START: Final = b"\x00\x00\x00\x0dIHDR"
_PNG_IHDR_END: Final = 33
"""Signature (8) + IHDR chunk: length (4) + type (4) + data (13) + CRC (4)."""
_PNG_CHUNK_HEADER: Final = 8
_PNG_CHUNK_CRC: Final = 4
_PNG_CHUNK_WALK: Final = 64

_WEBP_MIN_HEADER: Final = 30
_VP8_START_CODE: Final = b"\x9d\x01\x2a"
_VP8L_SIGNATURE: Final = 0x2F
_VP8X_ANIMATION_FLAG: Final = 0x02
_FOURTEEN_BITS: Final = 0x3FFF


def sniff_image(data: bytes, *, expected: ImageFormat | None = None) -> ImageHeader:
    """Format and dimensions from the container header, in O(header).

    Refuses anything but a static PNG or WebP (``magic_mismatch``, or the
    format ``expected`` from the file name does not match), a header that
    cannot be read or declares a zero dimension (``image_header_invalid``),
    and animation flags (``animated_image``).
    """
    if data.startswith(_PNG_SIGNATURE):
        header = _sniff_png(data)
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        header = _sniff_webp(data)
    else:
        raise ImageError(
            ImageErrorCode.MAGIC_MISMATCH,
            f"not a PNG or WebP file (starts with {data[:8]!r})",
        )
    if expected is not None and header.format is not expected:
        raise ImageError(
            ImageErrorCode.MAGIC_MISMATCH,
            f"{expected} expected, {header.format} found",
        )
    if header.width < 1 or header.height < 1:
        raise ImageError(ImageErrorCode.HEADER_INVALID, "zero dimension")
    return header


def _sniff_png(data: bytes) -> ImageHeader:
    if len(data) < _PNG_IHDR_END or data[8:16] != _PNG_IHDR_START:
        raise ImageError(ImageErrorCode.HEADER_INVALID, "IHDR must be the first chunk")
    width, height = struct.unpack(">II", data[16:24])
    if _png_declares_animation(data):
        raise ImageError(ImageErrorCode.ANIMATED, "APNG (acTL chunk)")
    return ImageHeader(ImageFormat.PNG, width, height)


def _png_declares_animation(data: bytes) -> bool:
    """Whether an ``acTL`` chunk precedes ``IDAT``, as APNG requires.

    Reads 8 bytes per chunk and jumps over the declared length, capped at
    64 chunks so the cost never depends on chunk sizes; an APNG hiding its
    ``acTL`` further away is caught after decoding (``is_animated``).
    """
    pos = _PNG_IHDR_END
    for _ in range(_PNG_CHUNK_WALK):
        if pos + _PNG_CHUNK_HEADER > len(data):
            return False
        length, chunk_type = struct.unpack(">I4s", data[pos : pos + _PNG_CHUNK_HEADER])
        if chunk_type == b"acTL":
            return True
        if chunk_type == b"IDAT":
            return False
        pos += _PNG_CHUNK_HEADER + length + _PNG_CHUNK_CRC
    return False


def _sniff_webp(data: bytes) -> ImageHeader:
    """``VP8X``: 24-bit canvas dimensions minus one and an animation flag;
    ``VP8 ``: 14-bit dimensions after the key-frame start code; ``VP8L``:
    14 + 14 bits minus one after the signature byte."""
    if len(data) < _WEBP_MIN_HEADER:
        raise ImageError(ImageErrorCode.HEADER_INVALID, "WebP header truncated")
    chunk = data[12:16]
    if chunk == b"VP8X":
        if data[20] & _VP8X_ANIMATION_FLAG:
            raise ImageError(ImageErrorCode.ANIMATED, "animated WebP (VP8X flag)")
        width = int.from_bytes(data[24:27], "little") + 1
        height = int.from_bytes(data[27:30], "little") + 1
    elif chunk == b"VP8 ":
        if data[23:26] != _VP8_START_CODE:
            raise ImageError(ImageErrorCode.HEADER_INVALID, "VP8 start code missing")
        width = int.from_bytes(data[26:28], "little") & _FOURTEEN_BITS
        height = int.from_bytes(data[28:30], "little") & _FOURTEEN_BITS
    elif chunk == b"VP8L":
        if data[20] != _VP8L_SIGNATURE:
            raise ImageError(ImageErrorCode.HEADER_INVALID, "VP8L signature missing")
        bits = int.from_bytes(data[21:25], "little")
        width = (bits & _FOURTEEN_BITS) + 1
        height = ((bits >> 14) & _FOURTEEN_BITS) + 1
    else:
        raise ImageError(ImageErrorCode.HEADER_INVALID, f"unknown WebP chunk {chunk!r}")
    return ImageHeader(ImageFormat.WEBP, width, height)


# --- Normalization ----------------------------------------------------------

_DECODE_ERRORS: Final = (
    OSError,
    SyntaxError,
    ValueError,
    EOFError,
    struct.error,
    zlib.error,
    Image.DecompressionBombError,
)
"""What Pillow raises on a corrupt, truncated or oversized stream."""

_STRIPPED_CHUNKS: Final = frozenset({"IHDR", "IDAT", "IEND"})


def normalize_image(
    data: bytes,
    limits: ImageLimits = DEFAULT_IMAGE_LIMITS,
    *,
    expected: ImageFormat | None = None,
) -> NormalizedImage:
    """A metadata-free RGBA PNG of ``data``, or an ``ImageError``.

    The byte cap, the header sniff and the pixel budget come first, so a
    decompression bomb is refused from its header without decoding it.
    """
    if len(data) > limits.max_bytes:
        raise ImageError(
            ImageErrorCode.FILE_TOO_LARGE, f"{len(data)} bytes > {limits.max_bytes}"
        )
    header = sniff_image(data, expected=expected)
    _check_pixels(header, limits)
    try:
        image = _decode(data, header)
    except ImageError:
        raise
    except _DECODE_ERRORS as exc:
        raise ImageError(
            ImageErrorCode.DECODE_ERROR, f"{type(exc).__name__}: {str(exc)[:120]}"
        ) from exc
    with image:
        png = _encode_stripped(image)
    return NormalizedImage(
        png, header.width, header.height, hashlib.sha256(png).hexdigest()
    )


def _check_pixels(header: ImageHeader, limits: ImageLimits) -> None:
    if header.pixels > limits.max_pixels:
        raise ImageError(
            ImageErrorCode.TOO_LARGE,
            f"{header.width}x{header.height} = {header.pixels} px > "
            f"{limits.max_pixels}",
        )


def _decode(data: bytes, header: ImageHeader) -> Image.Image:
    """Validate the source before converting to RGBA, which loses frame metadata."""
    with Image.open(io.BytesIO(data), formats=("PNG", "WEBP")) as image:
        _check_decoded(image, header)
        image.load()
        return image.convert("RGBA")


def _check_decoded(image: Image.Image, header: ImageHeader) -> None:
    """What Pillow found must be what the header announced."""
    if getattr(image, "is_animated", False) or getattr(image, "n_frames", 1) > 1:
        raise ImageError(ImageErrorCode.ANIMATED, "multi-frame image")
    if image.size != (header.width, header.height):
        raise ImageError(
            ImageErrorCode.HEADER_INVALID,
            f"decoded size {image.size} differs from the header "
            f"{(header.width, header.height)}",
        )


def _encode_stripped(image: Image.Image) -> bytes:
    """PNG with nothing but pixels: the encoder only propagates what
    ``image.info`` holds (ICC profile, EXIF, text, DPI, gamma...), so an
    emptied ``info`` yields IHDR + IDAT + IEND — asserted on the output."""
    image.info.clear()
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=False, compress_level=6)
    png = out.getvalue()
    chunks = png_chunk_types(png)
    if set(chunks) != _STRIPPED_CHUNKS:
        raise ImageError(
            ImageErrorCode.NOT_STRIPPED, f"re-encoded PNG carries chunks {chunks}"
        )
    return png


def png_chunk_types(data: bytes) -> list[str]:
    """The chunk types of a PNG, in order (the proof that metadata is gone)."""
    types: list[str] = []
    pos = len(_PNG_SIGNATURE)
    while pos + _PNG_CHUNK_HEADER <= len(data):
        length, chunk_type = struct.unpack(">I4s", data[pos : pos + _PNG_CHUNK_HEADER])
        types.append(chunk_type.decode("latin-1"))
        pos += _PNG_CHUNK_HEADER + length + _PNG_CHUNK_CRC
    return types


# --- Per-package budget ------------------------------------------------------


def normalize_images(
    images: Mapping[str, bytes], limits: ImageLimits = DEFAULT_IMAGE_LIMITS
) -> dict[str, NormalizedImage]:
    """Normalize every image of a package, keyed as given (by path).

    The count, then every header, then the total pixels are checked before
    the first decode, so a package is refused for its budget without
    paying for the images that precede the offending one. Errors carry the
    path of the file at fault.
    """
    if len(images) > limits.max_images:
        raise ImageError(
            ImageErrorCode.TOO_MANY_IMAGES,
            f"{len(images)} images, more than {limits.max_images}",
        )
    headers: dict[str, ImageHeader] = {}
    for path, data in images.items():
        with _named(path):
            headers[path] = sniff_image(data, expected=image_format_of(path))
            _check_pixels(headers[path], limits)
    total = sum(header.pixels for header in headers.values())
    if total > limits.max_package_pixels:
        raise ImageError(
            ImageErrorCode.PACKAGE_PIXELS_EXCEEDED,
            f"{total} px over all images, more than {limits.max_package_pixels}",
        )
    normalized: dict[str, NormalizedImage] = {}
    for path, data in images.items():
        with _named(path):
            normalized[path] = normalize_image(
                data, limits, expected=headers[path].format
            )
    return normalized


@contextmanager
def _named(path: str) -> Iterator[None]:
    """Attach ``path`` to an image error raised inside."""
    try:
        yield
    except ImageError as exc:
        exc.path = path
        raise
