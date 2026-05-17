"""Shared fixtures for mixed tests."""
import pytest

@pytest.fixture(scope="session")
def services():
    """Services are started externally — no-op fixture."""
    yield None
