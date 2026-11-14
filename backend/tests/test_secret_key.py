"""SECRET_KEY handling in app.py: placeholder or weak keys must never sign sessions."""

import pytest

import app as app_module


@pytest.mark.parametrize(
    "value", ["", "change-me-in-production", "your_random_secret_key_here", "short"]
)
def test_insecure_secret_key_is_replaced(monkeypatch, value):
    monkeypatch.setenv("SECRET_KEY", value)
    key = app_module._resolve_secret_key()
    assert key != value
    assert len(key) == 64


def test_missing_secret_key_is_replaced(monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    assert len(app_module._resolve_secret_key()) == 64


def test_strong_secret_key_is_kept(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "a" * 32)
    assert app_module._resolve_secret_key() == "a" * 32
