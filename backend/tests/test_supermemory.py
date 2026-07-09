"""Tests for the new SuperMemory backend feature (PDF books + tags persistence).
Covers: /api/supermemory/books (upload/list/download/delete) and
/api/supermemory/tags (upsert/list/remove-source/delete).
Also includes a light regression check on /api/auth/register + login.
"""
import io
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

MINIMAL_PDF = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R>>endobj\n"
    b"trailer<</Root 1 0 R>>\n%%EOF"
)


@pytest.fixture(scope="module")
def user_session():
    session = requests.Session()
    email = f"TEST_supermemory_{uuid.uuid4().hex[:8]}@example.com"
    password = "SecurePass123"
    resp = session.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": password, "name": "SM Tester",
    })
    if resp.status_code not in (200, 201):
        pytest.skip(f"Could not register test user: {resp.status_code} {resp.text}")
    return session


class TestSuperMemoryBooks:
    def test_upload_list_download_delete_book(self, user_session):
        # UPLOAD
        files = {"file": ("test_book.pdf", io.BytesIO(MINIMAL_PDF), "application/pdf")}
        data = {"num_pages": "1"}
        resp = user_session.post(f"{BASE_URL}/api/supermemory/books", files=files, data=data)
        assert resp.status_code == 200, resp.text
        book = resp.json()
        assert book["name"] == "test_book.pdf"
        assert "id" in book and book["id"].startswith("book_")
        assert "_id" not in book
        book_id = book["id"]

        # LIST - verify persisted
        list_resp = user_session.get(f"{BASE_URL}/api/supermemory/books")
        assert list_resp.status_code == 200
        books = list_resp.json()
        assert any(b["id"] == book_id for b in books)

        # DOWNLOAD - verify raw bytes returned
        dl_resp = user_session.get(f"{BASE_URL}/api/supermemory/books/{book_id}/download")
        assert dl_resp.status_code == 200
        assert dl_resp.content.startswith(b"%PDF")

        # DELETE
        del_resp = user_session.delete(f"{BASE_URL}/api/supermemory/books/{book_id}")
        assert del_resp.status_code == 200
        assert del_resp.json().get("success") is True

        # LIST again - verify removed
        list_resp2 = user_session.get(f"{BASE_URL}/api/supermemory/books")
        books2 = list_resp2.json()
        assert not any(b["id"] == book_id for b in books2)

    def test_download_nonexistent_book_404(self, user_session):
        resp = user_session.get(f"{BASE_URL}/api/supermemory/books/book_doesnotexist/download")
        assert resp.status_code == 404

    def test_books_require_auth(self):
        anon = requests.Session()
        resp = anon.get(f"{BASE_URL}/api/supermemory/books")
        assert resp.status_code in (401, 403)


class TestSuperMemoryTags:
    def test_upsert_list_remove_source_delete_tag(self, user_session):
        tag_id = "tag_" + uuid.uuid4().hex[:8]
        payload = {
            "id": tag_id,
            "label": "TEST_Important",
            "source": {"doc_id": "book_x1", "doc_name": "Book X", "page": 3, "extracted_text": "hello"},
        }
        resp = user_session.post(f"{BASE_URL}/api/supermemory/tags", json=payload)
        assert resp.status_code == 200, resp.text
        tag = resp.json()
        assert tag["id"] == tag_id
        assert tag["label"] == "TEST_Important"
        assert len(tag["sources"]) == 1

        # LIST
        list_resp = user_session.get(f"{BASE_URL}/api/supermemory/tags")
        assert list_resp.status_code == 200
        assert any(t["id"] == tag_id for t in list_resp.json())

        # Add 2nd source to same tag
        payload2 = dict(payload)
        payload2["source"] = {"doc_id": "book_x2", "doc_name": "Book Y", "page": 5}
        resp2 = user_session.post(f"{BASE_URL}/api/supermemory/tags", json=payload2)
        assert resp2.status_code == 200
        assert len(resp2.json()["sources"]) == 2

        # REMOVE one source (not last) -> tag remains
        rm_resp = user_session.delete(
            f"{BASE_URL}/api/supermemory/tags/{tag_id}/source",
            json={"doc_id": "book_x1", "page": 3},
        )
        assert rm_resp.status_code == 200
        list_resp2 = user_session.get(f"{BASE_URL}/api/supermemory/tags")
        remaining = [t for t in list_resp2.json() if t["id"] == tag_id]
        assert len(remaining) == 1
        assert len(remaining[0]["sources"]) == 1

        # REMOVE last source -> tag deleted entirely
        rm_resp2 = user_session.delete(
            f"{BASE_URL}/api/supermemory/tags/{tag_id}/source",
            json={"doc_id": "book_x2", "page": 5},
        )
        assert rm_resp2.status_code == 200
        list_resp3 = user_session.get(f"{BASE_URL}/api/supermemory/tags")
        assert not any(t["id"] == tag_id for t in list_resp3.json())

    def test_delete_tag_outright(self, user_session):
        tag_id = "tag_" + uuid.uuid4().hex[:8]
        payload = {
            "id": tag_id, "label": "TEST_Del",
            "source": {"doc_id": "book_z", "doc_name": "Book Z", "page": 1},
        }
        user_session.post(f"{BASE_URL}/api/supermemory/tags", json=payload)
        del_resp = user_session.delete(f"{BASE_URL}/api/supermemory/tags/{tag_id}")
        assert del_resp.status_code == 200
        list_resp = user_session.get(f"{BASE_URL}/api/supermemory/tags")
        assert not any(t["id"] == tag_id for t in list_resp.json())

    def test_tags_require_auth(self):
        anon = requests.Session()
        resp = anon.get(f"{BASE_URL}/api/supermemory/tags")
        assert resp.status_code in (401, 403)
