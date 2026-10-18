import hashlib
import hmac
import re
import secrets
import uuid

SESSION_COOKIE = "avocado_session"
GUEST_COOKIE = "avocado_guest"
SESSION_SECONDS = 30 * 24 * 60 * 60
TOKEN_PATTERN = re.compile(r"[a-f0-9]{64}\Z")
PASSWORD_PATTERN = re.compile(r"sha512\$[a-f0-9]{32}\$[a-f0-9]{128}\Z")
DUMMY_PASSWORD = f"sha512${'0' * 32}${'0' * 128}"


def hash_password(password):
    salt = uuid.uuid4().hex
    digest = hashlib.sha512((salt + password).encode("utf-8")).hexdigest()
    return f"sha512${salt}${digest}"


def verify_password(password, account):
    encoded = account.get("password") if account else DUMMY_PASSWORD
    if not isinstance(encoded, str) or not PASSWORD_PATTERN.fullmatch(encoded):
        return False
    _, salt, expected = encoded.split("$")
    actual = hashlib.sha512((salt + password).encode("utf-8")).hexdigest()
    return hmac.compare_digest(actual, expected) and bool(account)


def new_token():
    return secrets.token_hex(32)


def token_digest(token):
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def cookie_token(request, name):
    token = request.cookies.get(name, "")
    return token if TOKEN_PATTERN.fullmatch(token) else None


def request_token(request):
    if request.headers.get("Authorization"):
        match = re.fullmatch(r"Bearer ([a-f0-9]{64})", request.headers["Authorization"], re.IGNORECASE)
        return match[1].lower() if match else None
    return cookie_token(request, SESSION_COOKIE) or cookie_token(request, GUEST_COOKIE)


def public_account(account):
    return {key: str(account[key]) if key == "id" else account[key] for key in ("id", "name", "email")}


def account_response(account):
    return {"user": None, "guest": True} if account["is_guest"] else {"user": public_account(account)}
