from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pytest

from documents.validation import safe_filename, validate_file
from models.errors import InvalidError


def office(extension, *, macro=False, oversized=False):
    stream = BytesIO()
    with ZipFile(stream, "w", compression=ZIP_DEFLATED) as archive:
        word = extension == "docx"
        archive.writestr("word/document.xml" if word else "xl/workbook.xml", "<xml/>")
        archive.writestr(
            "[Content_Types].xml",
            "x" * 65537
            if oversized
            else (
                "wordprocessingml.document.main+xml"
                if word
                else "spreadsheetml.sheet.main+xml"
            ),
        )
        if macro:
            archive.writestr("word/vbaProject.bin", b"macro")
    return stream.getvalue()


@pytest.mark.parametrize(
    ("name", "content", "media"),
    [
        ("notice.PDF", b"%PDF-1.7\n%%EOF", "application/pdf"),
        ("photo.jpg", b"\xff\xd8\xff\xe0image\xff\xd9", "image/jpeg"),
        ("photo.jpeg", b"\xff\xd8\xff\xe0image\xff\xd9", "image/jpeg"),
        (
            "photo.png",
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR" + bytes(30) + b"IEND\xaeB`\x82",
            "image/png",
        ),
        ("points.csv", "id;valeur\nété;20".encode(), "text/csv"),
        ("text.txt", "notice".encode("utf-16"), "text/plain"),
        ("text.txt", b"\xef\xbb\xbfnote", "text/plain"),
        (
            "notice.docx",
            office("docx"),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
        (
            "points.xlsx",
            office("xlsx"),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
    ],
)
def test_accepted_formats(name, content, media):
    assert validate_file(name, content) == media


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("x.html", b"<html>"),
        ("x.svg", b"<svg/>"),
        ("x.zip", b"PK"),
        ("x.pdf", b"not PDF"),
        ("x.png", b"\x89PNG"),
        ("x.jpg", b"no"),
        ("x.txt", b"\x00binary"),
        ("x.csv", b"\xffbinary"),
        ("x.docx", b"PK invalid ZIP"),
        ("x.docx", office("xlsx")),
        ("x.docx", office("docx", macro=True)),
        ("x.xlsx", office("xlsx", oversized=True)),
    ],
)
def test_bad_content_is_rejected(name, content):
    with pytest.raises(InvalidError):
        validate_file(name, content)


@pytest.mark.parametrize("name", ["", "/", "a" * 256])
def test_bad_filename(name):
    with pytest.raises(InvalidError):
        safe_filename(name)


def test_download_name_strips_paths_and_controls():
    assert safe_filename("C:\\files\\été\r\n.txt") == "été.txt"
