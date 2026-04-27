from unittest.mock import MagicMock, patch

from notifications.storage.postgres import run_migrations


class TestRunMigrations:
    def test_applies_pending_migrations(self):
        mock_backend = MagicMock()
        mock_migration = MagicMock()
        mock_backend.to_apply.return_value = [mock_migration]

        with (
            patch(
                "notifications.storage.postgres.get_backend",
                return_value=mock_backend,
            ),
            patch(
                "notifications.storage.postgres.read_migrations",
                return_value=[mock_migration],
            ),
        ):
            run_migrations("postgresql://localhost/db")

        mock_backend.apply_migrations.assert_called_once()

    def test_skips_apply_when_no_pending_migrations(self):
        mock_backend = MagicMock()
        mock_backend.to_apply.return_value = []

        with (
            patch(
                "notifications.storage.postgres.get_backend",
                return_value=mock_backend,
            ),
            patch(
                "notifications.storage.postgres.read_migrations",
                return_value=[],
            ),
        ):
            run_migrations("postgresql://localhost/db")

        mock_backend.apply_migrations.assert_not_called()
