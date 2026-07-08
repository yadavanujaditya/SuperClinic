"""
Backend tests for the newly added authentication system (/api/auth/*).
Covers: register, login (valid/invalid), duplicate email, /me, logout, admin auto-assignment.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

ADMIN_EMAIL = "adityasonofashok@gmail.com"


def unique_email():
    return f"TEST_user_{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestRegisterLogin:
    def test_register_new_user_success(self, session):
        email = unique_email()
        resp = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "SecurePass123", "name": "Test User"
        })
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["email"] == email.lower()
        assert data["name"] == "Test User"
        assert data["role"] == "user"
        assert data["profession"] is None
        assert data["mobile_number"] is None
        assert "session_token" in session.cookies

    def test_register_duplicate_email_returns_error(self, session):
        email = unique_email()
        r1 = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "SecurePass123", "name": "First"
        })
        assert r1.status_code == 200
        s2 = requests.Session()
        s2.headers.update({"Content-Type": "application/json"})
        r2 = s2.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "OtherPass123", "name": "Second"
        })
        assert r2.status_code == 400
        assert "detail" in r2.json()

    def test_login_correct_password(self, session):
        email = unique_email()
        session.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "SecurePass123", "name": "Login User"
        })
        s2 = requests.Session()
        s2.headers.update({"Content-Type": "application/json"})
        resp = s2.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "SecurePass123"})
        assert resp.status_code == 200
        assert resp.json()["email"] == email.lower()

    def test_login_wrong_password_fails(self, session):
        email = unique_email()
        session.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "SecurePass123", "name": "WrongPw User"
        })
        s2 = requests.Session()
        s2.headers.update({"Content-Type": "application/json"})
        resp = s2.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "WrongPassword999"})
        assert resp.status_code == 401
        assert "detail" in resp.json()

    def test_login_nonexistent_user_fails(self, session):
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": f"nouser_{uuid.uuid4().hex[:8]}@example.com", "password": "whatever123"
        })
        assert resp.status_code == 401


class TestMeAndLogout:
    def test_me_after_register_returns_user(self, session):
        email = unique_email()
        session.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "SecurePass123", "name": "Me User"
        })
        resp = session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        assert resp.json()["email"] == email.lower()

    def test_me_without_session_401(self):
        s = requests.Session()
        resp = s.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 401

    def test_logout_clears_session(self, session):
        email = unique_email()
        session.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "SecurePass123", "name": "Logout User"
        })
        resp = session.post(f"{BASE_URL}/api/auth/logout")
        assert resp.status_code == 200
        me_resp = session.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.status_code == 401


class TestProfileUpdate:
    def test_update_profile_profession_and_mobile(self, session):
        email = unique_email()
        session.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "SecurePass123", "name": "Onboard User"
        })
        resp = session.put(f"{BASE_URL}/api/auth/profile", json={
            "profession": "resident", "mobile_number": "9876543210"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["profession"] == "resident"
        assert data["mobile_number"] == "9876543210"

        me_resp = session.get(f"{BASE_URL}/api/auth/me")
        assert me_resp.json()["profession"] == "resident"

    def test_update_profile_invalid_profession_400(self, session):
        email = unique_email()
        session.post(f"{BASE_URL}/api/auth/register", json={
            "email": email, "password": "SecurePass123", "name": "Bad Prof User"
        })
        resp = session.put(f"{BASE_URL}/api/auth/profile", json={"profession": "wizard"})
        assert resp.status_code == 400


class TestAdminAssignment:
    def test_admin_email_gets_admin_role_on_register(self, session):
        """NOTE: This creates/uses the real ADMIN_EMAIL account in DB - main agent asked to clean up after."""
        resp = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": ADMIN_EMAIL, "password": "TestAdminPass123", "name": "Admin Test"
        })
        if resp.status_code == 400:
            # Already registered (from a previous run) - login instead to verify role
            s2 = requests.Session()
            s2.headers.update({"Content-Type": "application/json"})
            login_resp = s2.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "TestAdminPass123"})
            if login_resp.status_code != 200:
                pytest.skip("Admin account already exists with a different password - cannot verify in this run")
            data = login_resp.json()
        else:
            assert resp.status_code == 200, resp.text
            data = resp.json()
        assert data["role"] == "admin"
        assert data["email"] == ADMIN_EMAIL
