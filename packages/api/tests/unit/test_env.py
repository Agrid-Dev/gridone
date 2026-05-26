from api.env import load_environ


class TestLoadEnviron:
    def test_reads_dotenv_from_cwd(self, tmp_path, monkeypatch):
        # Regression: a non-interactive launch (uvicorn) must resolve .env
        # relative to the working directory, not to env.py's source location.
        (tmp_path / ".env").write_text("STORAGE_URL=sqlite:///from-file\n")
        monkeypatch.chdir(tmp_path)

        assert load_environ()["STORAGE_URL"] == "sqlite:///from-file"

    def test_process_env_overrides_dotenv(self, tmp_path, monkeypatch):
        (tmp_path / ".env").write_text("STORAGE_URL=from-file\n")
        monkeypatch.chdir(tmp_path)
        monkeypatch.setenv("STORAGE_URL", "from-process")

        assert load_environ()["STORAGE_URL"] == "from-process"

    def test_no_dotenv_returns_process_env(self, tmp_path, monkeypatch):
        monkeypatch.chdir(tmp_path)
        monkeypatch.setenv("GRIDONE_PROBE_KEY", "probe-value")

        assert load_environ()["GRIDONE_PROBE_KEY"] == "probe-value"
