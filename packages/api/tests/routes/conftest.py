"""Shared fixtures for all router tests.

Provides a default admin token payload so that permission checks pass
without needing a real AuthService / JWT in unit tests.

The admin_token_payload fixture is defined in packages/api/tests/conftest.py
and is available here automatically via pytest's conftest hierarchy.
"""
