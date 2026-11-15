"""One user must never read or modify another user's chats, folders, prompts or documents."""

import uuid

import pytest
from fastapi.testclient import TestClient


def _login_new_user(app) -> TestClient:
    c = TestClient(app)
    name = f"iso_{uuid.uuid4().hex[:8]}"
    resp = c.post("/register", json={"username": name, "password": "testpass123"})
    assert resp.status_code == 200, resp.text
    return c


@pytest.fixture
def two_users(client):
    from app import app

    # `client` already ran the app lifespan (DB init); these share the same app.
    alice, bob = _login_new_user(app), _login_new_user(app)
    yield alice, bob
    alice.close()
    bob.close()


def _create_saved_chat(client: TestClient) -> str:
    from services import chat as chat_service

    # POST /chats only creates the session in memory; it is persisted on the first message.
    user_id = client.get("/me").json()["user_id"]
    sess = chat_service.create_session(user_id)
    chat_service.save_session(sess, user_id)
    return sess.id


def test_chats_are_isolated(two_users):
    alice, bob = two_users
    chat_id = _create_saved_chat(alice)

    assert chat_id not in [c["id"] for c in bob.get("/chats").json()["chats"]]
    assert bob.get(f"/chats/{chat_id}").status_code == 404
    assert bob.patch(f"/chats/{chat_id}/pin", json={"pinned": True}).status_code == 404
    assert bob.patch(f"/chats/{chat_id}/folder", json={"folder_id": None}).status_code == 404

    bob.patch(f"/chats/{chat_id}", json={"title": "hijacked"})
    bob.delete(f"/chats/{chat_id}")
    resp = alice.get(f"/chats/{chat_id}")
    assert resp.status_code == 200
    assert resp.json()["title"] != "hijacked"


def test_chat_cannot_be_moved_into_foreign_folder(two_users):
    alice, bob = two_users
    alice_folder = alice.post("/folders", json={"name": "A"}).json()["id"]
    bob_chat = _create_saved_chat(bob)

    resp = bob.patch(f"/chats/{bob_chat}/folder", json={"folder_id": alice_folder})
    assert resp.status_code == 404


def test_folders_are_isolated(two_users):
    alice, bob = two_users
    folder_id = alice.post("/folders", json={"name": "Private"}).json()["id"]

    assert folder_id not in [f["id"] for f in bob.get("/folders").json()["folders"]]
    assert bob.patch(f"/folders/{folder_id}", json={"name": "x"}).status_code == 404
    assert bob.get(f"/folders/{folder_id}/docs").status_code == 404
    assert bob.post(f"/folders/{folder_id}/docs/delete", json={"file": "a.txt"}).status_code == 404
    assert bob.delete(f"/folders/{folder_id}").status_code == 404
    assert folder_id in [f["id"] for f in alice.get("/folders").json()["folders"]]


def test_prompts_are_isolated(two_users):
    alice, bob = two_users
    prompt_id = alice.post("/prompts", json={"name": "P", "content": "secret"}).json()["id"]

    assert prompt_id not in [p["id"] for p in bob.get("/prompts").json()["prompts"]]
    assert bob.patch(f"/prompts/{prompt_id}", json={"name": "x"}).status_code == 404
    assert bob.delete(f"/prompts/{prompt_id}").status_code == 404


def test_documents_are_isolated(two_users):
    from db import get_session
    from models.document import Document

    alice, bob = two_users
    alice_id = alice.get("/me").json()["user_id"]
    with get_session() as db:
        db.add(Document(user_id=alice_id, filename="alice.txt", content="x", created_at="now"))

    assert "alice.txt" in alice.get("/docs").json()["files"]
    assert "alice.txt" not in bob.get("/docs").json()["files"]
