import pytest

from models.errors import InvalidError
from notifications.body_sanitizer import validate_body


class TestValidateBody:
    def test_plain_text_passes(self) -> None:
        validate_body("A plain text notification.")

    def test_bold_passes(self) -> None:
        validate_body("A **bold** word.")

    def test_italic_passes(self) -> None:
        validate_body("An *italic* word.")

    def test_http_link_passes(self) -> None:
        validate_body("[docs](https://example.com)")

    def test_resource_link_passes(self) -> None:
        validate_body("[device](resource://device/abc123)")

    def test_combined_markdown_passes(self) -> None:
        validate_body(
            "A **new** [device](resource://device/abc) found "
            "via *[driver](https://example.com)*."
        )

    def test_script_tag_raises(self) -> None:
        with pytest.raises(InvalidError):
            validate_body("<script>alert(1)</script>")

    def test_image_raises(self) -> None:
        with pytest.raises(InvalidError):
            validate_body("![alt](https://example.com/img.png)")

    def test_disallowed_link_scheme_raises(self) -> None:
        with pytest.raises(InvalidError):
            validate_body("[click](ftp://example.com)")

    def test_heading_raises(self) -> None:
        with pytest.raises(InvalidError):
            validate_body("# Header")

    @pytest.mark.parametrize(
        "body",
        [
            "<img onerror='alert(1)'>",
            "<b>bold</b>",
            "[x](mailto:attacker@evil.com)",
        ],
    )
    def test_harmful_content_raises(self, body: str) -> None:
        with pytest.raises(InvalidError):
            validate_body(body)
