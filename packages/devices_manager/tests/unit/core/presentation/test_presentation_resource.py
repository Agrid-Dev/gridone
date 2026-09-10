"""Image sniffing and normalization: metadata gone, every static PNG/WebP
variant accepted, animation and bombs refused from the header, and the
per-package budget decided before anything is decoded."""

import hashlib
import io
import timeit
import zlib

import pytest
from PIL import Image

from devices_manager.core.presentation.package import read_package
from devices_manager.core.presentation.resource import (
    ImageError,
    ImageErrorCode,
    ImageFormat,
    ImageHeader,
    ImageLimits,
    image_format_of,
    normalize_image,
    normalize_images,
    png_chunk_types,
    sniff_image,
)
from models.errors import InvalidError

from ..fixtures.hostile_packages import (
    SAMPLE_NAMES,
    SAMPLES_BY_NAME,
    animated_webp,
    apng,
    bomb_png,
    deflate_zeros,
    huge_canvas_webp,
    ihdr_chunk,
    interlaced_png,
    logo_webp,
    pil_png,
    pil_webp,
    png_16bit,
    png_chunk,
    png_palette_trns,
    png_with_metadata,
    raw_png,
    simple_png,
    webp_with_metadata,
    zero_rows,
)

STRIPPED = ["IHDR", "IDAT", "IEND"]

WITH_IMAGES = [
    name
    for name in SAMPLE_NAMES
    if SAMPLES_BY_NAME[name].reader_code is None
    and name not in {"ok_yaml_only", "ok_manifest_1mib"}
]


def best_of_three(action) -> float:
    return min(timeit.repeat(action, number=1, repeat=3))


def normalize_all(files: dict[str, bytes]) -> list:
    return [
        normalize_image(data, expected=image_format_of(path))
        for path, data in files.items()
    ]


def reopen(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


def assert_stripped(png: bytes) -> None:
    chunks = png_chunk_types(png)
    assert set(chunks) == set(STRIPPED)
    assert chunks[0] == "IHDR"
    assert chunks[-1] == "IEND"


class TestCorpusImages:
    @pytest.mark.parametrize("name", WITH_IMAGES)
    def test_image_layer_decision(self, name, hostile_corpus):
        sample = SAMPLES_BY_NAME[name]
        files = read_package(hostile_corpus[name]).files
        assert files
        if sample.image_code is None:
            for result in normalize_all(files):
                assert_stripped(result.data)
        else:
            with pytest.raises(ImageError) as info:
                normalize_all(files)
            assert info.value.code == sample.image_code, sample.tests


class TestNormalize:
    def test_png_metadata_is_stripped(self):
        source = png_with_metadata()
        assert {"iCCP", "tEXt", "iTXt", "pHYs", "eXIf"} <= set(png_chunk_types(source))
        result = normalize_image(source)
        assert png_chunk_types(result.data) == STRIPPED
        image = reopen(result.data)
        assert (image.mode, image.size, image.info) == ("RGBA", (32, 32), {})

    def test_webp_metadata_is_stripped(self):
        source = webp_with_metadata()
        assert reopen(source).info.keys() >= {"icc_profile", "exif", "xmp"}
        result = normalize_image(source)
        assert png_chunk_types(result.data) == STRIPPED
        assert reopen(result.data).info == {}

    @pytest.mark.parametrize(
        ("source", "size"),
        [
            (png_16bit(), (16, 16)),
            (png_palette_trns(), (16, 16)),
            (interlaced_png(37, 23), (37, 23)),
            (pil_webp(20, 10), (20, 10)),
            (pil_webp(20, 10, lossless=True), (20, 10)),
            (pil_png(5, 7), (5, 7)),
        ],
        ids=[
            "16bit",
            "palette_trns",
            "interlaced",
            "webp_lossy",
            "webp_lossless",
            "rgba",
        ],
    )
    def test_variants_become_rgba_png(self, source, size):
        result = normalize_image(source)
        assert (result.width, result.height) == size
        image = reopen(result.data)
        assert (image.format, image.mode, image.size) == ("PNG", "RGBA", size)
        assert result.media_type == "image/png"

    def test_palette_transparency_survives(self):
        result = normalize_image(png_palette_trns())
        assert reopen(result.data).getpixel((0, 0)) == (0, 0, 0, 0)

    def test_interlaced_pixels_survive(self):
        result = normalize_image(interlaced_png(37, 23))
        image = reopen(result.data)
        assert image.getpixel((0, 0)) == image.getpixel((36, 22)) == (200, 30, 30, 255)

    def test_output_is_deterministic_and_hashed(self):
        first = normalize_image(pil_png(8, 8))
        second = normalize_image(pil_png(8, 8))
        assert first == second
        assert first.sha256 == hashlib.sha256(first.data).hexdigest()

    def test_pixels_change_the_hash(self):
        blue = normalize_image(pil_png(8, 8, color=(0, 0, 255, 255)))
        red = normalize_image(pil_png(8, 8, color=(255, 0, 0, 255)))
        assert blue.sha256 != red.sha256

    def test_is_an_invalid_error(self):
        with pytest.raises(InvalidError, match="magic_mismatch"):
            normalize_image(b"<html>")


BOMBS = [
    pytest.param(bomb_png(30_000), id="png_900mp_real_stream"),
    pytest.param(huge_canvas_webp(), id="webp_268mp_canvas"),
    pytest.param(simple_png(4100, 4100, b"junk"), id="png_16.81mp"),
]


class TestRefusals:
    @pytest.mark.parametrize("source", [animated_webp(), apng()], ids=["webp", "apng"])
    def test_animated(self, source):
        with pytest.raises(ImageError) as info:
            sniff_image(source)
        assert info.value.code == ImageErrorCode.ANIMATED
        with pytest.raises(ImageError):
            normalize_image(source)

    @pytest.mark.parametrize("mode", ["RGBA", "RGB", "P"])
    def test_apng_hidden_beyond_the_chunk_walk(self, mode):
        """70 text chunks push ``acTL`` past the sniff's 64-chunk walk: the
        header passes, the decoded frame count still refuses it."""
        frames = [
            Image.new("RGB", (16, 16), color).convert(mode) for color in ("red", "blue")
        ]
        output = io.BytesIO()
        frames[0].save(output, format="PNG", save_all=True, append_images=frames[1:])
        source = output.getvalue()
        padding = b"".join(png_chunk(b"tEXt", b"k\x00v") for _ in range(70))
        hidden = source[:33] + padding + source[33:]
        assert sniff_image(hidden) == ImageHeader(ImageFormat.PNG, 16, 16)
        with pytest.raises(ImageError) as info:
            normalize_image(hidden)
        assert info.value.code == ImageErrorCode.ANIMATED

    @pytest.mark.parametrize("source", BOMBS)
    def test_bombs_are_refused_from_the_header(self, source):
        def attempt() -> None:
            with pytest.raises(ImageError) as info:
                normalize_image(source)
            assert info.value.code == ImageErrorCode.TOO_LARGE

        assert best_of_three(attempt) < 0.005

    def test_pixel_budget_boundary(self):
        limits = ImageLimits(max_pixels=64)
        assert normalize_image(pil_png(8, 8), limits).width == 8
        with pytest.raises(ImageError) as info:
            normalize_image(pil_png(8, 9), limits)
        assert info.value.code == ImageErrorCode.TOO_LARGE

    def test_16_megapixels_accepted(self):
        result = normalize_image(pil_png(4000, 4000))
        assert (result.width, result.height) == (4000, 4000)
        assert_stripped(result.data)

    def test_file_size_cap(self):
        source = pil_png(8, 8)
        assert normalize_image(source, ImageLimits(max_bytes=len(source))).width == 8
        with pytest.raises(ImageError) as info:
            normalize_image(source, ImageLimits(max_bytes=len(source) - 1))
        assert info.value.code == ImageErrorCode.FILE_TOO_LARGE

    @pytest.mark.parametrize(
        "source",
        [
            raw_png(
                ihdr_chunk(4, 4),
                [
                    png_chunk(
                        b"zTXt", b"Comment\x00\x00" + deflate_zeros(200 * 1024 * 1024)
                    ),
                    png_chunk(b"IDAT", zlib.compress(zero_rows(4, 4))),
                ],
            ),
            simple_png(64, 64, zlib.compress(zero_rows(64, 64))[:20]),
            simple_png(4, 4, b"not zlib"),
        ],
        ids=["ztxt_bomb", "idat_truncated", "idat_garbage"],
    )
    def test_decode_errors(self, source):
        with pytest.raises(ImageError) as info:
            normalize_image(source)
        assert info.value.code == ImageErrorCode.DECODE_ERROR

    def test_bad_trailing_crc_is_tolerated(self):
        result = normalize_image(pil_png(8, 8)[:-4] + b"\x00" * 4)
        assert_stripped(result.data)

    def test_expected_format_must_match(self):
        with pytest.raises(ImageError) as info:
            normalize_image(logo_webp(), expected=ImageFormat.PNG)
        assert info.value.code == ImageErrorCode.MAGIC_MISMATCH


class TestSniff:
    @pytest.mark.parametrize(
        ("source", "header"),
        [
            (pil_png(64, 64), ImageHeader(ImageFormat.PNG, 64, 64)),
            (interlaced_png(37, 23), ImageHeader(ImageFormat.PNG, 37, 23)),
            (pil_webp(32, 31), ImageHeader(ImageFormat.WEBP, 32, 31)),
            (pil_webp(20, 10, lossless=True), ImageHeader(ImageFormat.WEBP, 20, 10)),
            (webp_with_metadata(), ImageHeader(ImageFormat.WEBP, 32, 32)),
            (huge_canvas_webp(), ImageHeader(ImageFormat.WEBP, 16383, 16383)),
        ],
        ids=["png", "png_interlaced", "vp8", "vp8l", "vp8x", "vp8x_no_bitstream"],
    )
    def test_header(self, source, header):
        assert sniff_image(source) == header
        assert sniff_image(source).pixels == header.width * header.height

    @pytest.mark.parametrize(
        ("source", "code"),
        [
            (b"", ImageErrorCode.MAGIC_MISMATCH),
            (b"GIF89a" + b"\x00" * 40, ImageErrorCode.MAGIC_MISMATCH),
            (b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIH", ImageErrorCode.HEADER_INVALID),
            (b"\x89PNG\r\n\x1a\n" + b"\x00" * 30, ImageErrorCode.HEADER_INVALID),
            (simple_png(0, 4, b""), ImageErrorCode.HEADER_INVALID),
            (
                b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 6,
                ImageErrorCode.HEADER_INVALID,
            ),
            (
                b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 20,
                ImageErrorCode.HEADER_INVALID,
            ),
            (
                b"RIFF\x00\x00\x00\x00WEBPVP8L" + b"\x00" * 20,
                ImageErrorCode.HEADER_INVALID,
            ),
            (
                b"RIFF\x00\x00\x00\x00WEBPXXXX" + b"\x00" * 20,
                ImageErrorCode.HEADER_INVALID,
            ),
            (animated_webp(), ImageErrorCode.ANIMATED),
            (apng(), ImageErrorCode.ANIMATED),
        ],
        ids=[
            "empty",
            "gif",
            "png_truncated_ihdr",
            "png_no_ihdr",
            "png_zero_width",
            "webp_short",
            "vp8_no_start_code",
            "vp8l_no_signature",
            "webp_unknown_chunk",
            "webp_animated",
            "apng",
        ],
    )
    def test_refused(self, source, code):
        with pytest.raises(ImageError) as info:
            sniff_image(source)
        assert info.value.code == code

    def test_expected_format(self):
        assert (
            sniff_image(pil_png(2, 2), expected=ImageFormat.PNG).format
            is ImageFormat.PNG
        )
        with pytest.raises(ImageError) as info:
            sniff_image(pil_png(2, 2), expected=ImageFormat.WEBP)
        assert info.value.code == ImageErrorCode.MAGIC_MISMATCH

    @pytest.mark.parametrize(
        ("path", "expected"),
        [
            ("assets/a.png", ImageFormat.PNG),
            ("assets/a.webp", ImageFormat.WEBP),
            ("assets/a.PNG", None),
            ("driver.yaml", None),
        ],
    )
    def test_image_format_of(self, path, expected):
        assert image_format_of(path) is expected


class TestPackageBudget:
    def test_count(self):
        images = {f"assets/i{i}.png": pil_png(2, 2) for i in range(65)}
        with pytest.raises(ImageError) as info:
            normalize_images(images)
        assert info.value.code == ImageErrorCode.TOO_MANY_IMAGES
        del images["assets/i64.png"]
        assert len(normalize_images(images)) == 64

    def test_total_pixels_decided_before_decoding(self):
        """Five 16 MP headers over junk: decoding any of them would be an
        ``image_decode_error``, the budget refuses the set first, and fast."""
        images = {f"assets/f{i}.png": simple_png(4000, 4000, b"junk") for i in range(5)}

        def attempt() -> None:
            with pytest.raises(ImageError) as info:
                normalize_images(images)
            assert info.value.code == ImageErrorCode.PACKAGE_PIXELS_EXCEEDED

        assert best_of_three(attempt) < 0.005

    def test_total_pixels_boundary(self):
        limits = ImageLimits(max_package_pixels=128)
        two = {"a.png": pil_png(8, 8), "b.png": pil_png(8, 8)}
        assert set(normalize_images(two, limits)) == {"a.png", "b.png"}
        three = {**two, "c.png": pil_png(1, 1)}
        with pytest.raises(ImageError) as info:
            normalize_images(three, limits)
        assert info.value.code == ImageErrorCode.PACKAGE_PIXELS_EXCEEDED

    def test_per_image_pixels_checked_from_every_header_first(self):
        images = {"a.png": pil_png(2, 2), "b.png": simple_png(4100, 4100, b"junk")}
        with pytest.raises(ImageError) as info:
            normalize_images(images)
        assert info.value.code == ImageErrorCode.TOO_LARGE
        assert info.value.path == "b.png"

    def test_errors_name_the_file(self):
        with pytest.raises(ImageError) as info:
            normalize_images({"assets/x.png": b"<html>"})
        assert info.value.path == "assets/x.png"
        assert str(info.value).endswith(" [assets/x.png]")

    def test_format_follows_the_extension(self):
        with pytest.raises(ImageError) as info:
            normalize_images({"assets/x.webp": pil_png(2, 2)})
        assert info.value.code == ImageErrorCode.MAGIC_MISMATCH

    def test_keys_are_kept(self):
        images = {"assets/a.png": pil_png(2, 3), "assets/b.webp": pil_webp(4, 5)}
        normalized = normalize_images(images)
        assert list(normalized) == list(images)
        assert normalized["assets/b.webp"].height == 5
