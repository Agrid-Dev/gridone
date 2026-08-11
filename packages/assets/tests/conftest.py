"""Shared fixtures for the assets package tests.

The heavy lifting lives in ``ifc_fixtures`` (a uniquely-named module):
``import conftest`` from test files resolves unpredictably when several
packages' test trees are collected in one pytest run.
"""

import pytest
from ifc_fixtures import build_ifc


@pytest.fixture(scope="session")
def sample_ifc_bytes() -> bytes:
    """Two storeys (elevations 0 and 3), one wall, one space per storey."""
    return build_ifc()
