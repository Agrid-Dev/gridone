import tempfile

import pytest
from starlette.exceptions import HTTPException
from starlette.requests import Request

from api.document_upload import read_document_upload

pytestmark = pytest.mark.asyncio


@pytest.mark.parametrize("failure", ["disconnect", "overflow"])
async def test_interrupted_chunked_upload_closes_spooled_file(monkeypatch, failure):
    files = []
    original = tempfile.SpooledTemporaryFile

    def tracked(max_size: int) -> tempfile.SpooledTemporaryFile[bytes]:
        file = original(max_size=max_size)
        files.append(file)
        return file

    monkeypatch.setattr("starlette.formparsers.SpooledTemporaryFile", tracked)
    prefix = (
        b'--boundary\r\nContent-Disposition: form-data; name="file";'
        b' filename="a.txt"\r\n\r\nhello'
    )
    messages = [{"type": "http.request", "body": prefix, "more_body": True}]
    if failure == "disconnect":
        messages.append({"type": "http.disconnect"})
    else:
        monkeypatch.setattr("api.document_upload._BODY_BYTES", len(prefix) + 1)
        messages.append({"type": "http.request", "body": b"too big", "more_body": True})

    async def receive() -> dict:
        return messages.pop(0)

    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/documents",
            "headers": [(b"content-type", b"multipart/form-data; boundary=boundary")],
            "app": object(),
        },
        receive,
    )
    with pytest.raises(HTTPException) as error:
        async with read_document_upload(request):
            pytest.fail("Interrupted uploads must not reach storage")
    assert error.value.status_code == (413 if failure == "overflow" else 400)
    assert files
    assert all(file.closed for file in files)
