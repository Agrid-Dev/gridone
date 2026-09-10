"""The hostile ZIP / image corpus of the security spike (0e), built in memory.

Every sample is built with ``zipfile`` and, where the standard library
refuses to write something hostile, patched at the byte level (``patch_*``).
Images come from Pillow when it can author them and are hand-written
(``raw_png``) when it cannot: interlaced PNG, decompression bombs, oversized
ancillary chunks, lying IHDR. A sample records what it tests, the code the
*reader* must raise (``None`` = accepted) and, for accepted archives that
carry an image, the code the *image layer* must raise (``None`` = normalized).

Nothing is built at import time: ``hostile_corpus`` builds the whole corpus
once per session (about two seconds and 60 MiB).
"""

from __future__ import annotations

import io
import os
import stat
import struct
import unicodedata
import warnings
import zipfile
import zlib
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from functools import cache

import pytest
import yaml
from PIL import Image, PngImagePlugin

from .presentations import load_thermostat_presentation

MIB = 1024 * 1024
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

# --- Manifests ---------------------------------------------------------------

MANIFEST_YAML_ONLY = """\
id: spike-thermostat
vendor: Spike
model: T-1
version: 1
transport: mqtt
device_config: []
attributes:
  - name: temperature
    data_type: float
    read: { topic: "t/{id}/temp" }
    codecs: []
"""

MANIFEST_WITH_ASSETS = (
    MANIFEST_YAML_ONLY
    + """\
presentation:
  schema_version: 1
  requires: [layout/1, controls/1, device-face/1]
  assets:
    case: { path: assets/case.png }
    logo: { path: assets/logo.webp }
  bindings:
    measured: { attribute: temperature }
  page:
    kind: columns
    items:
      - kind: device-face
        asset: case
"""
)

THERMOSTAT_DRIVER_YAML = """\
id: agrid_thermostat
transport: http
device_config: []
attributes:
  - name: temperature
    data_type: float
    read: GET /temperature
    codecs: []
"""


def manifest_for(assets: Sequence[str]) -> str:
    """A manifest whose presentation declares one asset per path (reader tests
    only: the presentation is not a valid document)."""
    lines = [MANIFEST_YAML_ONLY, "presentation:", "  schema_version: 1", "  assets:"]
    lines.extend(f"    a{i}: {{ path: {path} }}" for i, path in enumerate(assets))
    return "\n".join(lines) + "\n"


def thermostat_manifest(presentation: dict | None = None) -> str:
    """A minimal driver carrying the thermostat presentation of the UI fixture."""
    document = load_thermostat_presentation() if presentation is None else presentation
    return THERMOSTAT_DRIVER_YAML + yaml.safe_dump(
        {"presentation": document}, sort_keys=False, allow_unicode=False
    )


THERMOSTAT_ASSET_PATHS = (
    "assets/bezel.png",
    "assets/main-font-atlas.png",
    "assets/montserrat-16-atlas.png",
)
"""The paths ``thermostat_presentation.yaml`` declares, in document order."""


def thermostat_files() -> dict[str, bytes]:
    """One tiny PNG per declared asset, each a different colour."""
    return {
        path: pil_png(8, 8, color=(index * 60, 90, 120, 255))
        for index, path in enumerate(THERMOSTAT_ASSET_PATHS)
    }


# --- Image builders ------------------------------------------------------------


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", crc)


def ihdr_chunk(
    width: int,
    height: int,
    *,
    color_type: int = 6,
    bit_depth: int = 8,
    interlace: int = 0,
) -> bytes:
    return png_chunk(
        b"IHDR",
        struct.pack(">IIBBBBB", width, height, bit_depth, color_type, 0, 0, interlace),
    )


def raw_png(ihdr: bytes, chunks: Sequence[bytes]) -> bytes:
    """Hand-written PNG: signature, IHDR, the given chunks, IEND."""
    return PNG_SIGNATURE + ihdr + b"".join(chunks) + png_chunk(b"IEND", b"")


def simple_png(width: int, height: int, idat: bytes, **ihdr_options: int) -> bytes:
    """``raw_png`` with a single IDAT chunk."""
    return raw_png(
        ihdr_chunk(width, height, **ihdr_options), [png_chunk(b"IDAT", idat)]
    )


def zero_rows(width: int, height: int, *, channels: int = 4) -> bytes:
    """Uncompressed scanlines of zeros (filter byte 0) for ``width`` x ``height``."""
    return b"\x00" * ((1 + width * channels) * height)


def pil_png(
    width: int, height: int, *, color: tuple[int, int, int, int] = (30, 120, 200, 255)
) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGBA", (width, height), color).save(buffer, format="PNG")
    return buffer.getvalue()


def pil_webp(width: int, height: int, *, lossless: bool = False) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGBA", (width, height), (30, 120, 200, 255)).save(
        buffer, format="WEBP", lossless=lossless
    )
    return buffer.getvalue()


def interlaced_png(width: int, height: int) -> bytes:
    """Adam7-interlaced RGBA PNG of one colour (Pillow cannot write one).

    The seven passes sample the image at (x offset, y offset, x step, y
    step); each pass is a run of filtered scanlines of its own width.
    """
    pixel = bytes((200, 30, 30, 255))
    passes = (
        (0, 0, 8, 8),
        (4, 0, 8, 8),
        (0, 4, 4, 8),
        (2, 0, 4, 4),
        (0, 2, 2, 4),
        (1, 0, 2, 2),
        (0, 1, 1, 2),
    )
    raw = bytearray()
    for x_start, y_start, x_step, y_step in passes:
        pass_width = (width - x_start + x_step - 1) // x_step if width > x_start else 0
        pass_height = (
            (height - y_start + y_step - 1) // y_step if height > y_start else 0
        )
        if pass_width and pass_height:
            raw += (b"\x00" + pixel * pass_width) * pass_height
    return simple_png(width, height, zlib.compress(bytes(raw), 9), interlace=1)


def deflate_zeros(total: int, level: int = 1) -> bytes:
    """A zlib stream of ``total`` zero bytes, without materializing them."""
    compressor = zlib.compressobj(level)
    out = bytearray()
    chunk = bytes(8 * MIB)
    left = total
    while left > 0:
        size = min(left, len(chunk))
        out += compressor.compress(chunk if size == len(chunk) else chunk[:size])
        left -= size
    out += compressor.flush()
    return bytes(out)


def bomb_png(side: int = 30_000) -> bytes:
    """Grayscale PNG declaring ``side`` x ``side`` pixels whose IDAT really
    inflates to that many bytes (900 MB by default)."""
    return simple_png(side, side, deflate_zeros(side * (side + 1)), color_type=0)


def animated_webp() -> bytes:
    frames = [Image.new("RGBA", (16, 16), (i * 60, 0, 0, 255)) for i in range(3)]
    buffer = io.BytesIO()
    frames[0].save(
        buffer, format="WEBP", save_all=True, append_images=frames[1:], duration=100
    )
    return buffer.getvalue()


def apng() -> bytes:
    frames = [Image.new("RGBA", (16, 16), (0, i * 60, 0, 255)) for i in range(3)]
    buffer = io.BytesIO()
    frames[0].save(
        buffer, format="PNG", save_all=True, append_images=frames[1:], duration=100
    )
    return buffer.getvalue()


def png_with_metadata() -> bytes:
    """iCCP, tEXt, iTXt, pHYs and eXIf chunks around a 32 x 32 RGB image."""
    info = PngImagePlugin.PngInfo()
    info.add_text("Comment", "spike metadata " * 10)
    info.add_itxt("Title", "titre", lang="fr")
    exif = Image.Exif()
    exif[0x010F] = "ACME"
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), (9, 9, 9)).save(
        buffer,
        format="PNG",
        pnginfo=info,
        exif=exif,
        dpi=(300, 300),
        icc_profile=b"\x00" * 128,
    )
    return buffer.getvalue()


def webp_with_metadata() -> bytes:
    exif = Image.Exif()
    exif[0x010F] = "ACME"
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), (9, 9, 9)).save(
        buffer,
        format="WEBP",
        exif=exif.tobytes(),
        icc_profile=b"\x00" * 128,
        xmp="<x:xmpmeta/>",
    )
    return buffer.getvalue()


def png_16bit() -> bytes:
    buffer = io.BytesIO()
    Image.new("I;16", (16, 16), 1000).save(buffer, format="PNG")
    return buffer.getvalue()


def png_palette_trns() -> bytes:
    image = Image.new("P", (16, 16))
    image.putpalette([0, 0, 0, 255, 0, 0] * 128)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", transparency=0)
    return buffer.getvalue()


def huge_canvas_webp(side: int = 16_383) -> bytes:
    """A VP8X header announcing a ``side`` x ``side`` canvas with no bitstream."""
    canvas = (side - 1).to_bytes(3, "little")
    return (
        b"RIFF"
        + struct.pack("<I", 30)
        + b"WEBPVP8X"
        + struct.pack("<I", 10)
        + b"\x00\x00\x00\x00"
        + canvas
        + canvas
        + b"VP8 "
        + struct.pack("<I", 0)
    )


# --- ZIP builders and byte patchers ---------------------------------------------

Entries = Sequence[tuple[str, str | bytes]]
"""Archive entries: ``zipfile.writestr`` takes text or bytes."""


def build_zip(entries: Entries, compression: int = zipfile.ZIP_DEFLATED) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=compression) as archive:
        for name, data in entries:
            archive.writestr(name, data)
    return buffer.getvalue()


class _Unseekable(io.RawIOBase):
    """Write-only stream: makes ``zipfile`` emit data descriptors (flag bit 3)."""

    def __init__(self) -> None:
        super().__init__()
        self.buffer = io.BytesIO()

    def writable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return False

    def write(self, data: bytes) -> int:  # type: ignore[override]
        return self.buffer.write(data)


def build_zip_streamed(entries: Entries) -> bytes:
    stream = _Unseekable()
    with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in entries:
            archive.writestr(name, data)
    return stream.buffer.getvalue()


def patch_flag_bits(data: bytes, bit: int) -> bytes:
    """Set a general-purpose flag bit in every local header and central entry."""
    out = bytearray(data)
    for signature, offset in ((b"PK\x03\x04", 6), (b"PK\x01\x02", 8)):
        pos = 0
        while (pos := out.find(signature, pos)) >= 0:
            flags = struct.unpack_from("<H", out, pos + offset)[0] | bit
            struct.pack_into("<H", out, pos + offset, flags)
            pos += 4
    return bytes(out)


def _find_header(
    data: bytearray,
    signature: bytes,
    name: bytes,
    name_offset: int,
    name_len_offset: int,
) -> int:
    pos = 0
    while (pos := data.find(signature, pos)) >= 0:
        name_len = struct.unpack_from("<H", data, pos + name_len_offset)[0]
        if data[pos + name_offset : pos + name_offset + name_len] == name:
            return pos
        pos += 4
    raise KeyError(name)


def patch_entry_name(data: bytes, old: str, new: str, *, central: bool = True) -> bytes:
    """Rewrite the stored name of an entry, same length, in the local header
    and (unless ``central`` is false) the central directory. The way to store
    a name ``zipfile`` itself refuses to write, such as one holding NUL."""
    if len(old) != len(new):
        msg = "the replacement must keep the name length"
        raise ValueError(msg)
    out = bytearray(data)
    local = _find_header(out, b"PK\x03\x04", old.encode(), 30, 26)
    out[local + 30 : local + 30 + len(old)] = new.encode()
    if central:
        cd = _find_header(out, b"PK\x01\x02", old.encode(), 46, 28)
        out[cd + 46 : cd + 46 + len(old)] = new.encode()
    return bytes(out)


def patch_declared_sizes(data: bytes, name: str, file_size: int, crc: int) -> bytes:
    """Rewrite the uncompressed size and CRC of ``name`` in both headers."""
    out = bytearray(data)
    local = _find_header(out, b"PK\x03\x04", name.encode(), 30, 26)
    struct.pack_into("<I", out, local + 14, crc)
    struct.pack_into("<I", out, local + 22, file_size)
    central = _find_header(out, b"PK\x01\x02", name.encode(), 46, 28)
    struct.pack_into("<I", out, central + 16, crc)
    struct.pack_into("<I", out, central + 24, file_size)
    return bytes(out)


def patch_eocd(
    data: bytes,
    *,
    disk: int | None = None,
    entries: int | None = None,
    cd_offset: int | None = None,
) -> bytes:
    """Rewrite fields of the end-of-central-directory record: the disk
    number, both entry counts (``0xFFFF`` is the zip64 marker), the offset
    of the central directory."""
    out = bytearray(data)
    pos = out.rfind(b"PK\x05\x06")
    if disk is not None:
        struct.pack_into("<H", out, pos + 4, disk)
    if entries is not None:
        struct.pack_into("<HH", out, pos + 8, entries, entries)
    if cd_offset is not None:
        struct.pack_into("<I", out, pos + 16, cd_offset)
    return bytes(out)


ZIP64_EXTRA = struct.pack("<HHQQ", 0x0001, 16, 0, 0)
TIMESTAMP_EXTRA = struct.pack("<HHB", 0x5455, 5, 1) + b"\x00\x00\x00\x00"
"""An "extended timestamp" extra field, the one most archivers add."""


def entry_with_extra(extra: bytes) -> bytes:
    """A manifest plus one image entry carrying ``extra`` in both headers."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("driver.yaml", manifest_for(["assets/e.png"]))
        info = zipfile.ZipInfo("assets/e.png")
        info.extra = extra
        archive.writestr(info, case_png())
    return buffer.getvalue()


def entry_with_mode(mode: int) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("driver.yaml", manifest_for(["assets/m.png"]))
        info = zipfile.ZipInfo("assets/m.png")
        info.create_system = 3
        info.external_attr = mode << 16
        archive.writestr(info, case_png())
    return buffer.getvalue()


def corrupt_entry_data(data: bytes, name: str) -> bytes:
    """Flip bytes inside the compressed data of ``name`` (CRC and inflate break)."""
    out = bytearray(data)
    local = _find_header(out, b"PK\x03\x04", name.encode(), 30, 26)
    name_len, extra_len = struct.unpack_from("<HH", out, local + 26)
    start = local + 30 + name_len + extra_len + 2
    for pos in range(start, start + 8):
        out[pos] ^= 0xFF
    return bytes(out)


def symlink_zip(target: str, link_name: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("driver.yaml", manifest_for([link_name]))
        info = zipfile.ZipInfo(link_name)
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        archive.writestr(info, target.encode())
    return buffer.getvalue()


def dir_entry_with_data_zip() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("driver.yaml", MANIFEST_YAML_ONLY)
        info = zipfile.ZipInfo("assets/")
        info.compress_type = zipfile.ZIP_STORED
        # writestr refuses data on a directory name; the low-level API does not.
        with archive.open(info, "w") as entry:
            entry.write(b"x" * 100)
    return buffer.getvalue()


def zip64_entry_zip() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("driver.yaml", manifest_for(["assets/z.png"]))
        info = zipfile.ZipInfo("assets/z.png")
        info.compress_type = zipfile.ZIP_DEFLATED
        with archive.open(info, "w", force_zip64=True) as entry:
            entry.write(pil_png(4, 4))
    return buffer.getvalue()


def with_comment(data: bytes, comment: bytes) -> bytes:
    buffer = io.BytesIO(data)
    with zipfile.ZipFile(buffer, "a") as archive:
        archive.comment = comment
    return buffer.getvalue()


def archive_of_exact_size(target: int) -> bytes:
    """A stored archive of exactly ``target`` bytes: two incompressible image
    entries just under the per-image cap, the manifest padded with a comment."""
    header = PNG_SIGNATURE + ihdr_chunk(4, 4)  # the sniff wants a real IHDR
    payloads = [
        ("assets/a.png", header + os.urandom(10 * MIB - 4096)),
        ("assets/b.png", header + os.urandom(target - 10 * MIB - 4 * 4096)),
    ]
    manifest = manifest_for([name for name, _ in payloads])
    probe = build_zip([("driver.yaml", manifest), *payloads], zipfile.ZIP_STORED)
    padding = target - len(probe)
    if padding < 0:
        msg = f"probe archive already {-padding} bytes over the target"
        raise ValueError(msg)
    padded = manifest + "#" + "x" * (padding - 1) if padding else manifest
    return build_zip([("driver.yaml", padded), *payloads], zipfile.ZIP_STORED)


# --- Corpus ---------------------------------------------------------------------


@dataclass(frozen=True)
class Sample:
    name: str
    tests: str
    reader_code: str | None
    image_code: str | None
    build: Callable[[], bytes]


@cache
def case_png() -> bytes:
    return pil_png(64, 64)


@cache
def logo_webp() -> bytes:
    return pil_webp(32, 32)


def std_entries() -> list[tuple[str, str | bytes]]:
    return [
        ("driver.yaml", MANIFEST_WITH_ASSETS),
        ("assets/case.png", case_png()),
        ("assets/logo.webp", logo_webp()),
    ]


def yaml_and(name: str, data: bytes) -> bytes:
    """The plain manifest plus one entry."""
    return build_zip([("driver.yaml", MANIFEST_YAML_ONLY), (name, data)])


def image_zip(name: str, data: bytes) -> bytes:
    """A manifest declaring ``name`` as its only asset, plus that entry."""
    return build_zip([("driver.yaml", manifest_for([name])), (name, data)])


@cache
def lying_size_zip() -> bytes:
    """An entry whose deflate stream inflates to 30 MiB of zeros."""
    return image_zip("assets/x.png", PNG_SIGNATURE + b"\x00" * (30 * MIB - 8))


def _many_images(count: int) -> bytes:
    names = [f"assets/i{i}.png" for i in range(count)]
    return build_zip(
        [("driver.yaml", manifest_for(names))]
        + [(name, pil_png(2, 2)) for name in names]
    )


def _ztxt_bomb_png() -> bytes:
    ztxt = png_chunk(b"zTXt", b"Comment\x00\x00" + deflate_zeros(200 * MIB))
    return raw_png(
        ihdr_chunk(4, 4), [ztxt, png_chunk(b"IDAT", zlib.compress(zero_rows(4, 4)))]
    )


def _ancillary_truncated_png() -> bytes:
    # Declares 2 GiB, holds 1000 bytes, no CRC.
    huge = struct.pack(">I", 0x7FFFFFF0) + b"abCd" + b"\x00" * 1000
    return raw_png(
        ihdr_chunk(4, 4), [huge, png_chunk(b"IDAT", zlib.compress(zero_rows(4, 4)))]
    )


def _idat_truncated_png() -> bytes:
    rows = b"".join(b"\x00" + os.urandom(64 * 4) for _ in range(64))
    idat = zlib.compress(rows)
    return simple_png(64, 64, idat[: len(idat) // 2])


def _big_text_chunk_png() -> bytes:
    text = png_chunk(b"tEXt", b"Comment\x00" + b"x" * (6 * MIB))
    return raw_png(
        ihdr_chunk(4, 4), [text, png_chunk(b"IDAT", zlib.compress(zero_rows(4, 4)))]
    )


def _idat_overlong_png() -> bytes:
    return simple_png(8, 8, zlib.compress(zero_rows(8, 8) + b"\x00" * (2 * MIB), 9))


def _thermostat_zip() -> bytes:
    return build_zip(
        [("driver.yaml", thermostat_manifest()), *thermostat_files().items()]
    )


def _dup_exact_zip() -> bytes:
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)  # zipfile's "Duplicate name"
        return build_zip([("driver.yaml", MANIFEST_YAML_ONLY)] * 2)


def _nfc_nfd_zip() -> bytes:
    nfc = unicodedata.normalize("NFC", "assets/é.png")
    nfd = unicodedata.normalize("NFD", "assets/é.png")
    return build_zip(
        [("driver.yaml", MANIFEST_YAML_ONLY), (nfc, case_png()), (nfd, case_png())]
    )


def _bomb_total_zip() -> bytes:
    nine = PNG_SIGNATURE + b"\x00" * (9 * MIB - 8)
    names = [f"assets/b{i}.png" for i in range(7)]
    return build_zip(
        [("driver.yaml", manifest_for(names))] + [(n, nine) for n in names]
    )


def _small_declared_large_zip() -> bytes:
    small = PNG_SIGNATURE + b"\x00" * 92
    archive = image_zip("assets/x.png", small)
    return patch_declared_sizes(archive, "assets/x.png", 5 * MIB, zlib.crc32(small))


LONG_PATH = "assets/" + "a" * 60 + "/" + "b" * 60 + "/" + "c" * 60 + ".png"
HTML = b"<html><script>alert(1)</script></html>"
SVG = b"<?xml version='1.0'?><svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>"
JS = b"fetch('https://evil').then(()=>{})"

SAMPLES: tuple[Sample, ...] = (
    # --- legitimate archives ---
    Sample(
        "ok_yaml_only",
        "manifest alone",
        None,
        None,
        lambda: build_zip([("driver.yaml", MANIFEST_YAML_ONLY)]),
    ),
    Sample(
        "ok_with_assets",
        "manifest + png + webp",
        None,
        None,
        lambda: build_zip(std_entries()),
    ),
    Sample(
        "ok_dir_entries",
        "explicit directory entry (zip -r style)",
        None,
        None,
        lambda: build_zip([("assets/", b""), *std_entries()]),
    ),
    Sample(
        "ok_stored",
        "ZIP_STORED entries",
        None,
        None,
        lambda: build_zip(std_entries(), zipfile.ZIP_STORED),
    ),
    Sample(
        "ok_data_descriptor",
        "streamed archive: flag bit 3 + data descriptors",
        None,
        None,
        lambda: build_zip_streamed(std_entries()),
    ),
    Sample(
        "ok_mixed_case_names",
        "mixed-case ASCII names (allowed, no collision)",
        None,
        None,
        lambda: image_zip("Assets/Case.png", case_png()),
    ),
    Sample(
        "ok_dotted_stem",
        "a dot inside a file stem, as the dialect allows",
        None,
        None,
        lambda: image_zip("assets/icon.v2.png", case_png()),
    ),
    Sample(
        "ok_png_interlaced",
        "Adam7 interlaced PNG (legit format feature)",
        None,
        None,
        lambda: image_zip("assets/i.png", interlaced_png(37, 23)),
    ),
    Sample(
        "ok_png_metadata",
        "PNG with iCCP/tEXt/iTXt/pHYs/eXIf chunks (must be stripped)",
        None,
        None,
        lambda: image_zip("assets/m.png", png_with_metadata()),
    ),
    Sample(
        "ok_webp_metadata",
        "WebP with EXIF/XMP/ICCP chunks (must be stripped)",
        None,
        None,
        lambda: image_zip("assets/m.webp", webp_with_metadata()),
    ),
    Sample(
        "ok_webp_lossless",
        "VP8L lossless WebP",
        None,
        None,
        lambda: image_zip("assets/l.webp", pil_webp(20, 10, lossless=True)),
    ),
    Sample(
        "ok_png_16bit",
        "16-bit grayscale PNG (converted to RGBA 8-bit)",
        None,
        None,
        lambda: image_zip("assets/16.png", png_16bit()),
    ),
    Sample(
        "ok_png_palette_trns",
        "palette PNG with tRNS",
        None,
        None,
        lambda: image_zip("assets/p.png", png_palette_trns()),
    ),
    Sample(
        "ok_png_16mp",
        "exactly 16 megapixels (at the limit)",
        None,
        None,
        lambda: image_zip("assets/big.png", pil_png(4000, 4000)),
    ),
    Sample(
        "ok_png_big_text_chunk",
        "6 MiB tEXt chunk inside a 10 MiB-capped file (cost bounded by the file cap)",
        None,
        None,
        lambda: image_zip("assets/t.png", _big_text_chunk_png()),
    ),
    Sample(
        "ok_png_idat_overlong",
        "IHDR 8x8 but IDAT inflates to 2 MiB (decoder stops at the declared rows)",
        None,
        None,
        lambda: image_zip("assets/o.png", _idat_overlong_png()),
    ),
    Sample(
        "ok_max_entries_128",
        "exactly 128 file entries",
        None,
        None,
        lambda: _many_images(127),
    ),
    Sample(
        "ok_archive_20mib",
        "exactly 20 MiB of archive (random bytes behind a PNG header)",
        None,
        "image_decode_error",
        lambda: archive_of_exact_size(20 * MIB),
    ),
    Sample(
        "ok_manifest_1mib",
        "driver.yaml of exactly 1 MiB",
        None,
        None,
        lambda: build_zip(
            [
                (
                    "driver.yaml",
                    MANIFEST_YAML_ONLY
                    + "#"
                    + "x" * (MIB - len(MANIFEST_YAML_ONLY) - 1),
                )
            ]
        ),
    ),
    Sample(
        "ok_thermostat",
        "the thermostat presentation with one PNG per declared asset",
        None,
        None,
        _thermostat_zip,
    ),
    Sample(
        "lying_size_small_crc_fixed",
        "declares 1000 bytes of a 30 MiB stream (prefix CRC): the sniff gets 1000",
        "image_header_invalid",
        None,
        lambda: patch_declared_sizes(
            lying_size_zip(),
            "assets/x.png",
            1000,
            zlib.crc32(PNG_SIGNATURE + b"\x00" * 992),
        ),
    ),
    Sample(
        "zip64_entry",
        "zip64 extra in the local header only (force_zip64); the CD is authoritative",
        None,
        None,
        zip64_entry_zip,
    ),
    # --- path attacks ---
    Sample(
        "slip_dotdot",
        "zip-slip ../",
        "invalid_name",
        None,
        lambda: yaml_and("../../etc/x.png", case_png()),
    ),
    Sample(
        "slip_absolute",
        "absolute path",
        "invalid_name",
        None,
        lambda: yaml_and("/etc/passwd.png", case_png()),
    ),
    Sample(
        "slip_drive",
        "Windows drive letter",
        "invalid_name",
        None,
        lambda: yaml_and("C:\\x.png", case_png()),
    ),
    Sample(
        "slip_backslash",
        "backslash separator",
        "invalid_name",
        None,
        lambda: yaml_and("assets\\case.png", case_png()),
    ),
    Sample(
        "slip_dot_segment",
        "'.' path segment",
        "invalid_name",
        None,
        lambda: yaml_and("assets/./case.png", case_png()),
    ),
    Sample(
        "nul_in_name",
        "NUL byte inside the entry name (stored, not what zipfile shows)",
        "invalid_name",
        None,
        lambda: patch_entry_name(
            yaml_and("assets/caXse.png", case_png()),
            "assets/caXse.png",
            "assets/ca\x00se.png",
        ),
    ),
    Sample(
        "nul_after_extension",
        "NUL after a valid name: zipfile shows assets/x.png, the stored name is longer",
        "invalid_name",
        None,
        lambda: patch_entry_name(
            yaml_and("assets/x.pngX", case_png()), "assets/x.pngX", "assets/x.png\x00"
        ),
    ),
    Sample(
        "hidden_file",
        "dot-file",
        "invalid_name",
        None,
        lambda: yaml_and("assets/.hidden.png", case_png()),
    ),
    Sample(
        "macos_junk",
        "Finder junk (__MACOSX/, .DS_Store)",
        "invalid_name",
        None,
        lambda: build_zip(
            [
                ("driver.yaml", MANIFEST_YAML_ONLY),
                ("__MACOSX/._driver.yaml", b"\x00Mac OS X"),
                (".DS_Store", b"\x00"),
            ]
        ),
    ),
    Sample(
        "unicode_name",
        "non-ASCII name (NFC)",
        "invalid_name",
        None,
        lambda: yaml_and("assets/été.png", case_png()),
    ),
    Sample(
        "dup_nfc_nfd",
        "same name in NFC and NFD (refused as non-ASCII before the collision check)",
        "invalid_name",
        None,
        _nfc_nfd_zip,
    ),
    Sample(
        "dup_exact",
        "identical entry names",
        "duplicate_name",
        None,
        _dup_exact_zip,
    ),
    Sample(
        "dup_case",
        "names colliding under casefold()",
        "duplicate_name",
        None,
        lambda: build_zip(
            [
                ("driver.yaml", MANIFEST_YAML_ONLY),
                ("Assets/case.png", case_png()),
                ("assets/case.png", case_png()),
            ]
        ),
    ),
    Sample(
        "long_path",
        "path longer than 128 chars",
        "invalid_name",
        None,
        lambda: yaml_and(LONG_PATH, case_png()),
    ),
    Sample(
        "deep_path",
        "more than 4 path segments",
        "invalid_name",
        None,
        lambda: yaml_and("a/b/c/d/e.png", case_png()),
    ),
    Sample(
        "bad_extension",
        "file type not allowed",
        "invalid_name",
        None,
        lambda: yaml_and("assets/readme.txt", b"hi"),
    ),
    Sample(
        "uppercase_extension",
        "case.PNG is not case.png",
        "invalid_name",
        None,
        lambda: yaml_and("assets/case.PNG", case_png()),
    ),
    Sample(
        "nested_zip",
        "nested archive by extension",
        "invalid_name",
        None,
        lambda: yaml_and(
            "assets/inner.zip", build_zip([("driver.yaml", MANIFEST_YAML_ONLY)])
        ),
    ),
    Sample(
        "manifest_nested",
        "manifest not at the root",
        "invalid_name",
        None,
        lambda: build_zip([("sub/driver.yaml", MANIFEST_YAML_ONLY)]),
    ),
    Sample(
        "manifest_wrong_case",
        "Driver.yaml instead of driver.yaml",
        "invalid_name",
        None,
        lambda: build_zip([("Driver.yaml", MANIFEST_YAML_ONLY)]),
    ),
    Sample(
        "manifest_yml",
        ".yml extension",
        "invalid_name",
        None,
        lambda: build_zip([("driver.yml", MANIFEST_YAML_ONLY)]),
    ),
    Sample(
        "manifest_missing",
        "no driver.yaml",
        "manifest_missing",
        None,
        lambda: build_zip([("assets/case.png", case_png())]),
    ),
    # --- entry-type attacks ---
    Sample(
        "symlink",
        "symlink entry (S_IFLNK in external_attr)",
        "symlink_entry",
        None,
        lambda: symlink_zip("../../etc/passwd", "assets/link.png"),
    ),
    Sample(
        "special_entry",
        "character device mode bits in external_attr",
        "special_entry",
        None,
        lambda: entry_with_mode(stat.S_IFCHR | 0o644),
    ),
    Sample(
        "zip64_extra_in_central_directory",
        "zip64 extra field (0x0001) on a central directory entry",
        "zip64_unsupported",
        None,
        lambda: entry_with_extra(ZIP64_EXTRA),
    ),
    Sample(
        "ok_timestamp_extra",
        "a benign extra field (extended timestamp) is walked and ignored",
        None,
        None,
        lambda: entry_with_extra(TIMESTAMP_EXTRA),
    ),
    Sample(
        "dir_entry_with_data",
        "directory entry carrying 100 bytes of data",
        "directory_entry_with_data",
        None,
        dir_entry_with_data_zip,
    ),
    Sample(
        "encrypted",
        "flag bit 0 (traditional PKZIP encryption)",
        "encrypted_entry",
        None,
        lambda: patch_flag_bits(build_zip(std_entries()), 0x1),
    ),
    Sample(
        "strong_encryption",
        "flag bit 6 (strong encryption)",
        "encrypted_entry",
        None,
        lambda: patch_flag_bits(build_zip(std_entries()), 0x40),
    ),
    Sample(
        "lzma_entry",
        "LZMA compression",
        "unsupported_compression",
        None,
        lambda: build_zip(std_entries(), zipfile.ZIP_LZMA),
    ),
    Sample(
        "bzip2_entry",
        "BZIP2 compression",
        "unsupported_compression",
        None,
        lambda: build_zip(std_entries(), zipfile.ZIP_BZIP2),
    ),
    Sample(
        "zip64_eocd_markers",
        "EOCD entry count 0xFFFF (zip64 marker)",
        "zip64_unsupported",
        None,
        lambda: patch_eocd(
            build_zip([("driver.yaml", MANIFEST_YAML_ONLY)]), entries=0xFFFF
        ),
    ),
    Sample(
        "local_header_name_mismatch",
        "central directory and local header disagree on the name",
        "bad_zip_entry",
        None,
        lambda: patch_entry_name(
            build_zip([("driver.yaml", MANIFEST_YAML_ONLY)]),
            "driver.yaml",
            "driver.yamL",
            central=False,
        ),
    ),
    Sample(
        "corrupt_deflate",
        "compressed data flipped (inflate or CRC fails)",
        "bad_zip_entry",
        None,
        lambda: corrupt_entry_data(build_zip(std_entries()), "assets/case.png"),
    ),
    # --- size / bomb attacks ---
    Sample(
        "too_many_entries",
        "129 entries, refused from the EOCD count before the central directory is read",
        "too_many_entries",
        None,
        lambda: _many_images(128),
    ),
    Sample(
        "too_many_entries_5000",
        "5000 entries",
        "too_many_entries",
        None,
        lambda: build_zip([(f"assets/i{i}.png", b"") for i in range(5000)]),
    ),
    Sample(
        "bomb_single_entry_40mib",
        "one entry declaring 40 MiB (> 10 MiB image cap), ~40 KiB compressed",
        "entry_too_large",
        None,
        lambda: image_zip("assets/b.png", PNG_SIGNATURE + b"\x00" * (40 * MIB - 8)),
    ),
    Sample(
        "bomb_total_60mib",
        "7 x 9 MiB = 63 MiB declared (> 50 MiB total), ~63 KiB compressed",
        "declared_total_too_large",
        None,
        _bomb_total_zip,
    ),
    Sample(
        "bomb_lying_size_small_crc_original",
        "declared 1000 bytes / actual 30 MiB, CRC of the full stream",
        "bad_zip_entry",
        None,
        lambda: patch_declared_sizes(lying_size_zip(), "assets/x.png", 1000, 0),
    ),
    Sample(
        "bomb_lying_size_large",
        "declared 5 MiB / actual 100 bytes",
        "size_mismatch",
        None,
        _small_declared_large_zip,
    ),
    Sample(
        "archive_too_large",
        "archive of 20 MiB + 1 byte",
        "archive_too_large",
        None,
        lambda: archive_of_exact_size(20 * MIB + 1),
    ),
    Sample(
        "manifest_too_large",
        "driver.yaml > 1 MiB",
        "entry_too_large",
        None,
        lambda: build_zip([("driver.yaml", MANIFEST_YAML_ONLY + "# " + "x" * MIB)]),
    ),
    # --- container-format attacks ---
    Sample("not_a_zip", "random bytes", "not_a_zip", None, lambda: os.urandom(4096)),
    Sample(
        "empty_archive",
        "EOCD only, no entries",
        "not_a_zip",
        None,
        lambda: build_zip([]),
    ),
    Sample(
        "prepended_junk",
        "junk before the first local header (zipfile itself accepts this)",
        "not_a_zip",
        None,
        lambda: (
            b"<html>"
            + os.urandom(100)
            + build_zip([("driver.yaml", MANIFEST_YAML_ONLY)])
        ),
    ),
    Sample(
        "trailing_junk",
        "bytes after the EOCD (zipfile itself accepts this)",
        "trailing_data",
        None,
        lambda: build_zip([("driver.yaml", MANIFEST_YAML_ONLY)]) + os.urandom(100),
    ),
    Sample(
        "no_eocd",
        "a local header and no end-of-central-directory record",
        "not_a_zip",
        None,
        lambda: b"PK\x03\x04" + b"\x00" * 60,
    ),
    Sample(
        "multi_disk",
        "EOCD disk number 1",
        "not_a_zip",
        None,
        lambda: patch_eocd(build_zip([("driver.yaml", MANIFEST_YAML_ONLY)]), disk=1),
    ),
    Sample(
        "cd_offset_wrong",
        "EOCD central-directory offset off by one",
        "not_a_zip",
        None,
        lambda: patch_eocd(
            build_zip([("driver.yaml", MANIFEST_YAML_ONLY)]), cd_offset=1
        ),
    ),
    Sample(
        "zero_entries",
        "EOCD entry counts 0 over a real central directory",
        "not_a_zip",
        None,
        lambda: patch_eocd(build_zip([("driver.yaml", MANIFEST_YAML_ONLY)]), entries=0),
    ),
    Sample(
        "bad_cd_magic",
        "central directory signature corrupted (zipfile refuses it)",
        "not_a_zip",
        None,
        lambda: build_zip([("driver.yaml", MANIFEST_YAML_ONLY)]).replace(
            b"PK\x01\x02", b"PK\x01\x03"
        ),
    ),
    Sample(
        "archive_comment",
        "non-empty EOCD comment",
        "archive_comment",
        None,
        lambda: with_comment(
            build_zip([("driver.yaml", MANIFEST_YAML_ONLY)]), b"hello"
        ),
    ),
    # --- image-content attacks the reader's sniff refuses ---
    Sample(
        "png_is_html",
        "HTML behind a .png name",
        "magic_mismatch",
        None,
        lambda: image_zip("assets/x.png", HTML),
    ),
    Sample(
        "png_is_svg",
        "SVG behind a .png name",
        "magic_mismatch",
        None,
        lambda: image_zip("assets/x.png", SVG),
    ),
    Sample(
        "png_is_js",
        "JavaScript behind a .png name",
        "magic_mismatch",
        None,
        lambda: image_zip("assets/x.png", JS),
    ),
    Sample(
        "webp_is_gif",
        "GIF behind a .webp name",
        "magic_mismatch",
        None,
        lambda: image_zip("assets/x.webp", b"GIF89a" + b"\x00" * 40),
    ),
    Sample(
        "png_is_webp",
        "real WebP behind a .png name (extension/magic disagree)",
        "magic_mismatch",
        None,
        lambda: image_zip("assets/x.png", logo_webp()),
    ),
    Sample(
        "nested_zip_as_png",
        "zip behind a .png name",
        "magic_mismatch",
        None,
        lambda: image_zip(
            "assets/x.png", build_zip([("driver.yaml", MANIFEST_YAML_ONLY)])
        ),
    ),
    Sample(
        "png_truncated_header",
        "PNG signature then a truncated IHDR",
        "image_header_invalid",
        None,
        lambda: image_zip("assets/x.png", PNG_SIGNATURE + b"\x00\x00\x00\x0dIH"),
    ),
    Sample(
        "png_zero_dims",
        "IHDR 0x0",
        "image_header_invalid",
        None,
        lambda: image_zip("assets/x.png", simple_png(0, 0, zlib.compress(b""))),
    ),
    Sample(
        "webp_animated",
        "animated WebP (VP8X animation flag + ANIM)",
        "animated_image",
        None,
        lambda: image_zip("assets/a.webp", animated_webp()),
    ),
    Sample(
        "png_apng",
        "APNG (acTL chunk before IDAT)",
        "animated_image",
        None,
        lambda: image_zip("assets/a.png", apng()),
    ),
    # --- image-content attacks the reader accepts and the image layer refuses ---
    Sample(
        "png_huge_ihdr_30000",
        "IHDR 30000x30000 (900 MP) over a real 900 MB zlib stream",
        None,
        "image_too_large",
        lambda: image_zip("assets/bomb.png", bomb_png(30_000)),
    ),
    Sample(
        "png_ihdr_17mp",
        "16.81 MP, just above the 16 MP cap",
        None,
        "image_too_large",
        lambda: image_zip(
            "assets/x.png", simple_png(4100, 4100, deflate_zeros(4100 * (4100 * 4 + 1)))
        ),
    ),
    Sample(
        "png_ztxt_bomb",
        "zTXt chunk inflating to 200 MiB from ~200 KiB",
        None,
        "image_decode_error",
        lambda: image_zip("assets/z.png", _ztxt_bomb_png()),
    ),
    Sample(
        "png_ancillary_truncated",
        "unknown ancillary chunk declaring 2 GiB, file truncated",
        None,
        "image_decode_error",
        lambda: image_zip("assets/h.png", _ancillary_truncated_png()),
    ),
    Sample(
        "png_idat_truncated",
        "IDAT cut in half (incompressible rows)",
        None,
        "image_decode_error",
        lambda: image_zip("assets/t.png", _idat_truncated_png()),
    ),
    Sample(
        "png_bad_crc",
        "IEND CRC corrupted (Pillow tolerates it; the output is re-encoded anyway)",
        None,
        None,
        lambda: image_zip("assets/c.png", pil_png(8, 8)[:-4] + b"\x00\x00\x00\x00"),
    ),
    Sample(
        "webp_huge_canvas",
        "VP8X canvas 16383x16383 (268 MP) with no bitstream",
        None,
        "image_too_large",
        lambda: image_zip("assets/h.webp", huge_canvas_webp()),
    ),
)

SAMPLES_BY_NAME: dict[str, Sample] = {sample.name: sample for sample in SAMPLES}
SAMPLE_NAMES: list[str] = list(SAMPLES_BY_NAME)


@pytest.fixture(scope="session")
def hostile_corpus() -> dict[str, bytes]:
    """Every sample's bytes by name, built once per session."""
    return {sample.name: sample.build() for sample in SAMPLES}
