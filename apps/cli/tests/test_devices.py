from devices import app
from typer.testing import CliRunner

from .fixtures.mock_core_file_storage import mock_file_storage  # noqa: F401

runner = CliRunner()


def test_list_devices(mock_file_storage):
    result = runner.invoke(app, ["list"], obj=mock_file_storage)
    assert result.exit_code == 0
    print(result.output)
