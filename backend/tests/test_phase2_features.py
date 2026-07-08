"""
Backend tests for Phase 2-7 features: admin AI key config (admin_ai.py),
per-user records/summaries/cases (records.py), community publish/rate (community.py).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "adityasonofashok@gmail.com"


def unique_email(prefix="TEST_user"):
    return f"{prefix}_{uuid.uuid4().hex[:10]}@example.com"


def new_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_session():
    s = new_session()
    resp = s.post(f"{BASE_URL}/api/auth/register", json={
        "email": ADMIN_EMAIL, "password": "TestAdminPass123", "name": "Admin Test"
    })
    if resp.status_code == 400:
        resp = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "TestAdminPass123"})
        if resp.status_code != 200:
            pytest.skip("Cannot get admin session - password mismatch on existing account")
    assert resp.json()["role"] == "admin"
    return s


@pytest.fixture(scope="module")
def regular_session():
    s = new_session()
    email = unique_email()
    resp = s.post(f"{BASE_URL}/api/auth/register", json={
        "email": email, "password": "SecurePass123", "name": "Regular Test User"
    })
    assert resp.status_code == 200
    return s


class TestAdminAIConfig:
    def test_regular_user_cannot_access_admin_config(self, regular_session):
        resp = regular_session.get(f"{BASE_URL}/api/admin/ai-config")
        assert resp.status_code == 403

    def test_admin_get_config_initial_state(self, admin_session):
        resp = admin_session.get(f"{BASE_URL}/api/admin/ai-config")
        assert resp.status_code == 200
        data = resp.json()
        assert "configured" in data

    def test_admin_set_key_masks_result(self, admin_session):
        key = "sk-ant-testkey1234567890abcd"
        resp = admin_session.put(f"{BASE_URL}/api/admin/ai-config", json={
            "provider": "claude", "api_key": key
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["configured"] is True
        assert data["provider"] == "claude"
        assert key not in data["masked_key"]
        assert data["masked_key"].startswith("sk-ant")
        assert "abcd" in data["masked_key"]

    def test_regular_user_cannot_set_key(self, regular_session):
        resp = regular_session.put(f"{BASE_URL}/api/admin/ai-config", json={
            "provider": "claude", "api_key": "sk-ant-blah"
        })
        assert resp.status_code == 403

    def test_ai_status_no_key_exposed_to_regular_user(self, regular_session):
        resp = regular_session.get(f"{BASE_URL}/api/ai/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["configured"] is True
        assert data["provider"] == "claude"
        assert "api_key" not in data
        assert "masked_key" not in data

    def test_invalid_provider_rejected(self, admin_session):
        resp = admin_session.put(f"{BASE_URL}/api/admin/ai-config", json={
            "provider": "unknownprovider", "api_key": "sk-blah"
        })
        assert resp.status_code == 400

    def test_empty_key_rejected(self, admin_session):
        resp = admin_session.put(f"{BASE_URL}/api/admin/ai-config", json={
            "provider": "claude", "api_key": "   "
        })
        assert resp.status_code == 400


class TestRecords:
    def test_save_and_get_summary(self, regular_session):
        payload = {
            "diagnosis": "TEST_Diagnosis",
            "template_name": "TEST Template",
            "source": "fill",
            "text": "Full discharge summary text here."
        }
        resp = regular_session.post(f"{BASE_URL}/api/records/summaries", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["diagnosis"] == "TEST_Diagnosis"
        assert "id" in data

        get_resp = regular_session.get(f"{BASE_URL}/api/records/summaries/mine")
        assert get_resp.status_code == 200
        items = get_resp.json()
        assert any(i["id"] == data["id"] for i in items)

    def test_save_and_get_case(self, regular_session):
        payload = {
            "complaint": "TEST_Fever",
            "age": "30",
            "sex": "M",
            "history": [{"q": "onset", "a": "2 days"}],
            "differentials": [],
            "red_flags": [],
            "note_text": "Clinical note text"
        }
        resp = regular_session.post(f"{BASE_URL}/api/records/cases", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["complaint"] == "TEST_Fever"

        get_resp = regular_session.get(f"{BASE_URL}/api/records/cases/mine")
        assert get_resp.status_code == 200
        items = get_resp.json()
        assert any(i["id"] == data["id"] for i in items)

    def test_delete_summary(self, regular_session):
        resp = regular_session.post(f"{BASE_URL}/api/records/summaries", json={
            "diagnosis": "TEST_ToDelete", "text": "delete me"
        })
        rec_id = resp.json()["id"]
        del_resp = regular_session.delete(f"{BASE_URL}/api/records/summaries/{rec_id}")
        assert del_resp.status_code == 200
        get_resp = regular_session.get(f"{BASE_URL}/api/records/summaries/mine")
        assert not any(i["id"] == rec_id for i in get_resp.json())

    def test_submit_rating(self, regular_session):
        resp = regular_session.post(f"{BASE_URL}/api/records/summaries", json={
            "diagnosis": "TEST_RatingTarget", "text": "text"
        })
        rec_id = resp.json()["id"]
        rate_resp = regular_session.post(f"{BASE_URL}/api/records/ratings", json={
            "record_type": "summary", "record_id": rec_id, "stars": 3, "comment": "good"
        })
        assert rate_resp.status_code == 200
        assert rate_resp.json()["stars"] == 3

    def test_invalid_rating_stars_rejected(self, regular_session):
        resp = regular_session.post(f"{BASE_URL}/api/records/ratings", json={
            "record_type": "summary", "record_id": "sum_fake", "stars": 9
        })
        assert resp.status_code == 400

    def test_regular_user_cannot_access_admin_records(self, regular_session):
        resp = regular_session.get(f"{BASE_URL}/api/records/admin/summaries")
        assert resp.status_code == 403

    def test_admin_can_see_all_summaries_and_users(self, admin_session, regular_session):
        resp = admin_session.get(f"{BASE_URL}/api/records/admin/summaries")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

        users_resp = admin_session.get(f"{BASE_URL}/api/records/admin/users")
        assert users_resp.status_code == 200
        users = users_resp.json()
        assert all("password_hash" not in u for u in users)
        assert len(users) >= 2  # at least admin + regular user


class TestCommunity:
    def test_publish_and_list_template(self, regular_session):
        name = f"TEST_Template_{uuid.uuid4().hex[:6]}"
        resp = regular_session.post(f"{BASE_URL}/api/community/templates/publish", json={
            "name": name, "diagnosis": "TEST_Diag", "category": "General",
            "slots": [], "sampleBody": "Sample body text"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == name
        assert data["avg_rating"] == 0

        list_resp = regular_session.get(f"{BASE_URL}/api/community/templates")
        assert list_resp.status_code == 200
        assert any(t["id"] == data["id"] for t in list_resp.json())
        return data["id"]

    def test_rate_template_updates_avg(self, regular_session):
        name = f"TEST_RateTemplate_{uuid.uuid4().hex[:6]}"
        pub = regular_session.post(f"{BASE_URL}/api/community/templates/publish", json={
            "name": name, "diagnosis": "TEST_Diag", "sampleBody": "x"
        }).json()
        rate_resp = regular_session.post(f"{BASE_URL}/api/community/templates/{pub['id']}/rate", json={"stars": 4})
        assert rate_resp.status_code == 200
        assert rate_resp.json()["avg_rating"] == 4.0
        # re-rate should update, not duplicate
        rate_resp2 = regular_session.post(f"{BASE_URL}/api/community/templates/{pub['id']}/rate", json={"stars": 2})
        assert rate_resp2.json()["avg_rating"] == 2.0
        assert rate_resp2.json()["rating_count"] == 1

    def test_unpublish_template_not_owner_fails(self, regular_session, admin_session):
        pub = regular_session.post(f"{BASE_URL}/api/community/templates/publish", json={
            "name": f"TEST_OwnerCheck_{uuid.uuid4().hex[:6]}", "diagnosis": "d", "sampleBody": "x"
        }).json()
        resp = admin_session.delete(f"{BASE_URL}/api/community/templates/{pub['id']}")
        assert resp.status_code == 404

    def test_unpublish_template_owner_succeeds(self, regular_session):
        pub = regular_session.post(f"{BASE_URL}/api/community/templates/publish", json={
            "name": f"TEST_DeleteMe_{uuid.uuid4().hex[:6]}", "diagnosis": "d", "sampleBody": "x"
        }).json()
        resp = regular_session.delete(f"{BASE_URL}/api/community/templates/{pub['id']}")
        assert resp.status_code == 200

    def test_publish_and_rate_workflow(self, regular_session):
        name = f"TEST_Workflow_{uuid.uuid4().hex[:6]}"
        resp = regular_session.post(f"{BASE_URL}/api/community/workflows/publish", json={
            "name": name, "category": "General", "tags": [], "workflow": {"steps": []}
        })
        assert resp.status_code == 200
        data = resp.json()
        list_resp = regular_session.get(f"{BASE_URL}/api/community/workflows")
        assert any(w["id"] == data["id"] for w in list_resp.json())
        rate_resp = regular_session.post(f"{BASE_URL}/api/community/workflows/{data['id']}/rate", json={"stars": 5})
        assert rate_resp.status_code == 200
        assert rate_resp.json()["avg_rating"] == 5.0

    def test_invalid_rating_stars_rejected_community(self, regular_session):
        pub = regular_session.post(f"{BASE_URL}/api/community/templates/publish", json={
            "name": f"TEST_BadRate_{uuid.uuid4().hex[:6]}", "diagnosis": "d", "sampleBody": "x"
        }).json()
        resp = regular_session.post(f"{BASE_URL}/api/community/templates/{pub['id']}/rate", json={"stars": 0})
        assert resp.status_code == 400
