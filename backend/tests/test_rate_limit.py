"""Brute-force protection on /login and /register (backend/routes/auth.py)."""

import uuid

from rate_limit import RateLimiter


def test_limiter_blocks_after_max_attempts():
    limiter = RateLimiter(max_attempts=2, window_seconds=60)
    assert limiter.retry_after("k") == 0
    limiter.hit("k")
    limiter.hit("k")
    assert limiter.retry_after("k") > 0
    assert limiter.retry_after("other") == 0
    limiter.reset("k")
    assert limiter.retry_after("k") == 0


def test_limiter_window_expires(monkeypatch):
    import rate_limit

    now = [1000.0]
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: now[0])
    limiter = RateLimiter(max_attempts=1, window_seconds=10)
    limiter.hit("k")
    assert limiter.retry_after("k") > 0
    now[0] += 10
    assert limiter.retry_after("k") == 0


def test_login_locks_username_after_failed_attempts(client):
    username = f"victim_{uuid.uuid4().hex[:8]}"
    assert (
        client.post("/register", json={"username": username, "password": "right-pass"}).status_code
        == 200
    )
    client.post("/logout")

    for _ in range(5):
        resp = client.post("/login", json={"username": username, "password": "wrong"})
        assert resp.status_code == 401
    resp = client.post("/login", json={"username": username, "password": "right-pass"})
    assert resp.status_code == 429
    assert int(resp.headers["Retry-After"]) > 0


def test_successful_login_resets_username_counter(client):
    username = f"user_{uuid.uuid4().hex[:8]}"
    client.post("/register", json={"username": username, "password": "right-pass"})
    client.post("/logout")

    for _ in range(4):
        client.post("/login", json={"username": username, "password": "wrong"})
    assert (
        client.post("/login", json={"username": username, "password": "right-pass"}).status_code
        == 200
    )
    client.post("/logout")
    assert (
        client.post("/login", json={"username": username, "password": "wrong"}).status_code == 401
    )


def test_register_is_limited_per_ip(client):
    for _ in range(5):
        name = f"bulk_{uuid.uuid4().hex[:8]}"
        assert (
            client.post("/register", json={"username": name, "password": "testpass123"}).status_code
            == 200
        )
    name = f"bulk_{uuid.uuid4().hex[:8]}"
    assert (
        client.post("/register", json={"username": name, "password": "testpass123"}).status_code
        == 429
    )
