"""The bounded ZIP reader against the security spike's hostile corpus, the
entry-name policy, the size boundaries and the payload dispatch."""

import io
import struct
import timeit

import pytest

from devices_manager.core.presentation.package import (
    MANIFEST_NAME,
    MIB,
    PackageError,
    PackageErrorCode,
    PackageFiles,
    PackageLimits,
    collision_key,
    normalize_path,
    read_bounded,
    read_package,
    read_payload,
)
from models.errors import InvalidError

from ..fixtures.hostile_packages import (
    MANIFEST_WITH_ASSETS,
    MANIFEST_YAML_ONLY,
    SAMPLE_NAMES,
    SAMPLES_BY_NAME,
    THERMOSTAT_ASSET_PATHS,
    build_zip,
    case_png,
    logo_webp,
    pil_png,
    std_entries,
)

BOMBS = [
    "too_many_entries_5000",
    "bomb_single_entry_40mib",
    "bomb_total_60mib",
    "archive_too_large",
    "bomb_lying_size_small_crc_original",
]


def best_of_three(action) -> float:
    return min(timeit.repeat(action, number=1, repeat=3))


class TestCorpus:
    @pytest.mark.parametrize("name", SAMPLE_NAMES)
    def test_reader_decision(self, name, hostile_corpus):
        sample = SAMPLES_BY_NAME[name]
        if sample.reader_code is None:
            files = read_package(hostile_corpus[name])
            assert files.manifest.startswith("id: ")
        else:
            with pytest.raises(PackageError) as info:
                read_package(hostile_corpus[name])
            assert info.value.code == sample.reader_code, sample.tests

    def test_accepted_archive_is_read_verbatim(self, hostile_corpus):
        files = read_package(hostile_corpus["ok_dir_entries"])
        assert files.manifest == MANIFEST_WITH_ASSETS
        # The directory entry is skipped, the manifest is not among the files.
        assert files.files == {
            "assets/case.png": case_png(),
            "assets/logo.webp": logo_webp(),
        }

    def test_thermostat_package(self, hostile_corpus):
        files = read_package(hostile_corpus["ok_thermostat"])
        assert set(files.files) == set(THERMOSTAT_ASSET_PATHS)
        assert "presentation:" in files.manifest

    @pytest.mark.parametrize("name", BOMBS)
    def test_bombs_are_refused_fast(self, name, hostile_corpus):
        data = hostile_corpus[name]

        def attempt() -> None:
            with pytest.raises(PackageError):
                read_package(data)

        assert best_of_three(attempt) < 0.05

    def test_errors_carry_code_and_path(self, hostile_corpus):
        with pytest.raises(PackageError) as info:
            read_package(hostile_corpus["slip_dotdot"])
        assert isinstance(info.value, InvalidError)
        assert info.value.code == PackageErrorCode.INVALID_NAME
        assert info.value.path == "../../etc/x.png"
        assert str(info.value).startswith("invalid_name: ")
        assert str(info.value).endswith(" [../../etc/x.png]")

    def test_container_errors_have_no_path(self, hostile_corpus):
        with pytest.raises(PackageError) as info:
            read_package(hostile_corpus["trailing_junk"])
        assert info.value.path is None
        assert str(info.value) == "trailing_data: 100 bytes after the archive"


ACCEPTED_NAMES = [
    "driver.yaml",
    "assets/case.png",
    "assets/",
    "Assets/Case.png",
    "a/b/c/d.png",
    "ui/atlas/digits.webp",
    "x.png",
    "assets/icon.v2.png",
    "a" * 124 + ".png",
    "x.png/",  # a directory that looks like a file: harmless, skipped when empty
]

REFUSED_NAMES = [
    "",
    "../x.png",
    "/x.png",
    "C:\\x.png",
    "assets\\x.png",
    "./x.png",
    "assets/./x.png",
    "assets/\x00.png",
    ".hidden.png",
    "__MACOSX/x.png",
    "assets/été.png",
    "a/b/c/d/e.png",
    "a" * 125 + ".png",
    "x.PNG",
    "x.jpg",
    "x.zip",
    "Driver.yaml",
    "driver.yml",
    "sub/driver.yaml",
    "assets//x.png",
    "/",
    "assets/.hidden/",
    "assets/x.png\x00.exe",
]


class TestNamePolicy:
    @pytest.mark.parametrize("name", ACCEPTED_NAMES)
    def test_accepted(self, name):
        entry = normalize_path(name)
        assert entry.path == name
        assert entry.is_directory == name.endswith("/")

    @pytest.mark.parametrize("name", REFUSED_NAMES)
    def test_refused(self, name):
        with pytest.raises(PackageError) as info:
            normalize_path(name)
        assert info.value.code == PackageErrorCode.INVALID_NAME
        assert info.value.path == name

    def test_limits_apply(self):
        limits = PackageLimits(max_segments=2, max_path_length=12)
        assert normalize_path("a/bcdefg.png", limits).path == "a/bcdefg.png"
        with pytest.raises(PackageError, match="segments"):
            normalize_path("a/b/c.png", limits)
        with pytest.raises(PackageError, match="characters"):
            normalize_path("a/bcdefgh.png", limits)


class TestCollisionKey:
    def test_case_and_normalization_form_collide(self):
        assert collision_key("Assets/Case.PNG") == collision_key("assets/case.png")
        assert collision_key("assets/\u00e9.png") == collision_key("assets/e\u0301.png")

    def test_distinct_names_differ(self):
        assert collision_key("assets/case.png") != collision_key("assets/case2.png")


class TestBoundaries:
    @pytest.mark.parametrize("missing_bytes", range(1, 19))
    def test_truncated_end_record_is_a_package_error(self, missing_bytes):
        archive = build_zip([("driver.yaml", MANIFEST_YAML_ONLY)])
        with pytest.raises(PackageError) as info:
            read_package(archive[:-missing_bytes])
        assert info.value.code == PackageErrorCode.NOT_A_ZIP

    @pytest.mark.parametrize("declared_count", [1, 2])
    def test_forged_entry_count_cannot_bypass_the_limit(self, declared_count):
        archive = bytearray(build_zip(std_entries()))
        # Both entry counts are forged; the central directory still has 3 entries.
        struct.pack_into(
            "<HH", archive, len(archive) - 22 + 8, declared_count, declared_count
        )
        with pytest.raises(PackageError) as info:
            read_package(bytes(archive), PackageLimits(max_entries=2))
        assert info.value.code == PackageErrorCode.TOO_MANY_ENTRIES

    def test_inconsistent_entry_count_is_refused(self):
        archive = bytearray(build_zip(std_entries()))
        struct.pack_into("<HH", archive, len(archive) - 22 + 8, 1, 1)
        with pytest.raises(PackageError) as info:
            read_package(bytes(archive))
        assert info.value.code == PackageErrorCode.NOT_A_ZIP

    def test_entry_count(self, hostile_corpus):
        assert len(read_package(hostile_corpus["ok_max_entries_128"]).files) == 127
        with pytest.raises(PackageError) as info:
            read_package(hostile_corpus["too_many_entries"])
        assert info.value.code == PackageErrorCode.TOO_MANY_ENTRIES

    def test_archive_size(self, hostile_corpus):
        assert len(hostile_corpus["ok_archive_20mib"]) == 20 * MIB
        assert len(read_package(hostile_corpus["ok_archive_20mib"]).files) == 2
        assert len(hostile_corpus["archive_too_large"]) == 20 * MIB + 1
        with pytest.raises(PackageError) as info:
            read_package(hostile_corpus["archive_too_large"])
        assert info.value.code == PackageErrorCode.ARCHIVE_TOO_LARGE

    def test_manifest_size(self, hostile_corpus):
        files = read_package(hostile_corpus["ok_manifest_1mib"])
        assert len(files.manifest.encode()) == MIB
        with pytest.raises(PackageError) as info:
            read_package(hostile_corpus["manifest_too_large"])
        assert info.value.code == PackageErrorCode.ENTRY_TOO_LARGE
        assert info.value.path == MANIFEST_NAME

    def test_custom_entry_limit(self):
        limits = PackageLimits(max_entries=2)
        two = build_zip([("driver.yaml", MANIFEST_YAML_ONLY), ("a.png", pil_png(2, 2))])
        assert len(read_package(two, limits).files) == 1
        three = build_zip(std_entries())
        with pytest.raises(PackageError) as info:
            read_package(three, limits)
        assert info.value.code == PackageErrorCode.TOO_MANY_ENTRIES

    def test_custom_image_cap(self):
        limits = PackageLimits(max_image_bytes=len(case_png()))
        assert read_package(build_zip(std_entries()), limits).files
        smaller = PackageLimits(max_image_bytes=len(case_png()) - 1)
        with pytest.raises(PackageError) as info:
            read_package(build_zip(std_entries()), smaller)
        assert info.value.code == PackageErrorCode.ENTRY_TOO_LARGE
        assert info.value.path == "assets/case.png"


class TestReadBounded:
    """The caps hold on the bytes received, whatever a stream announces:
    CPython's ``ZipExtFile`` stops at ``file_size`` on its own, so these
    guards are exercised on a plain stream."""

    def test_entry_cap(self):
        stream = io.BytesIO(b"x" * 11)
        with pytest.raises(PackageError) as info:
            read_bounded(stream, cap=10, budget=100, path="a.png")
        assert info.value.code == PackageErrorCode.ENTRY_TOO_LARGE
        assert info.value.path == "a.png"

    def test_package_budget(self):
        stream = io.BytesIO(b"x" * 11)
        with pytest.raises(PackageError) as info:
            read_bounded(stream, cap=100, budget=10, path="a.png")
        assert info.value.code == PackageErrorCode.DECOMPRESSED_TOTAL_EXCEEDED

    def test_exact_cap_and_chunking(self):
        data = bytes(range(256)) * 1024  # 256 KiB: several 64 KiB chunks
        stream = io.BytesIO(data)
        assert read_bounded(stream, cap=len(data), budget=len(data), path="a") == data


class TestReadPayload:
    @pytest.mark.parametrize(
        "content_type",
        [
            "application/yaml",
            "text/yaml",
            "application/x-yaml",
            "Application/YAML; charset=utf-8",
        ],
    )
    def test_bare_yaml(self, content_type):
        files = read_payload(MANIFEST_YAML_ONLY.encode(), content_type)
        assert files == PackageFiles(manifest=MANIFEST_YAML_ONLY, files={})

    @pytest.mark.parametrize(
        "content_type", ["application/zip", "application/x-zip-compressed"]
    )
    def test_zip(self, content_type):
        files = read_payload(build_zip(std_entries()), content_type)
        assert files.manifest == MANIFEST_WITH_ASSETS
        assert set(files.files) == {"assets/case.png", "assets/logo.webp"}

    @pytest.mark.parametrize(
        "content_type", ["text/plain", "application/octet-stream", ""]
    )
    def test_unsupported_media_type(self, content_type):
        with pytest.raises(PackageError) as info:
            read_payload(MANIFEST_YAML_ONLY.encode(), content_type)
        assert info.value.code == PackageErrorCode.UNSUPPORTED_MEDIA_TYPE

    def test_bare_yaml_size_cap(self):
        with pytest.raises(PackageError) as info:
            read_payload(b"#" * (MIB + 1), "application/yaml")
        assert info.value.code == PackageErrorCode.ENTRY_TOO_LARGE
        assert info.value.path == MANIFEST_NAME
        assert read_payload(b"#" * MIB, "application/yaml").manifest == "#" * MIB

    def test_bare_yaml_must_be_utf8(self):
        with pytest.raises(PackageError) as info:
            read_payload(b"id: \xff\xfe", "application/yaml")
        assert info.value.code == PackageErrorCode.MANIFEST_NOT_UTF8

    def test_zip_manifest_must_be_utf8(self):
        archive = build_zip([("driver.yaml", b"id: \xff\xfe")])
        with pytest.raises(PackageError) as info:
            read_payload(archive, "application/zip")
        assert info.value.code == PackageErrorCode.MANIFEST_NOT_UTF8
        assert info.value.path == MANIFEST_NAME
