from app import app
from typer.testing import CliRunner

runner = CliRunner()


def test_app():
    result = runner.invoke(app, ["hello", "Lucho"])
    assert result.exit_code == 0
    assert "Hello, Lucho" in result.output
