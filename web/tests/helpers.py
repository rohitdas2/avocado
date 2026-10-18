from datetime import datetime, timezone


class MemoryStore:
    """Repository test double; production always uses PostgreSQL."""

    def __init__(self):
        self.accounts = {}
        self.sessions = {}
        self.foods = []
        self.lifts = []
        self.custom_foods = []
        self.weights = {}
        self.attempts = {}

    def health(self):
        pass

    def allow_credentials(self, key, window, limit):
        count, previous = self.attempts.get(key, (0, window))
        count = count + 1 if previous == window else 1
        self.attempts[key] = (count, window)
        return count <= limit

    def create_account(self, account):
        if account.get("email") and any(row["email"] == account["email"] for row in self.accounts.values()):
            return None
        row = {"is_guest": False, **account}
        self.accounts[row["id"]] = row
        return row.copy()

    def upgrade_guest(self, account_id, details):
        account = self.accounts.get(account_id)
        if not account or not account["is_guest"] or any(row["email"] == details["email"] for row in self.accounts.values()):
            return None
        account.update(details, is_guest=False)
        self.sessions = {digest: session for digest, session in self.sessions.items() if session["account_id"] != account_id}
        return account.copy()

    def account_by_email(self, email):
        account = next((row for row in self.accounts.values() if row.get("email") == email), None)
        return account.copy() if account else None

    def account_by_id(self, account_id):
        account = self.accounts.get(account_id)
        return account.copy() if account else None

    def update_account(self, account_id, name):
        account = self.accounts.get(account_id)
        if account:
            account["name"] = name
            return account.copy()

    def create_session(self, digest, account_id, expires_at, guest_id=None):
        if guest_id and guest_id != account_id and self.accounts.get(guest_id, {}).get("is_guest"):
            # Mirror PostgresStore: logged events always transfer; only exact custom-food duplicates drop.
            signature = lambda row: (row["name"].strip().lower(), row["calories"], row.get("protein"), row.get("carbs"), row.get("fat"))
            existing = {signature(row) for row in self.custom_foods if row.get("account_id") == account_id}
            self.custom_foods[:] = [row for row in self.custom_foods if row.get("account_id") != guest_id or signature(row) not in existing]
            for rows in (self.foods, self.lifts, self.custom_foods):
                for row in rows:
                    if row.get("account_id") == guest_id:
                        row["account_id"] = account_id
            for (owner, day), entry in list(self.weights.items()):
                if owner == guest_id:
                    self.weights.setdefault((account_id, day), entry)
                    del self.weights[(owner, day)]
            self.sessions = {key: value for key, value in self.sessions.items() if value["account_id"] != guest_id}
            del self.accounts[guest_id]
        self.sessions[digest] = {"account_id": account_id, "expires_at": expires_at}

    def session_account(self, digest):
        session = self.sessions.get(digest)
        if not session or session["expires_at"] <= datetime.now(timezone.utc):
            return None
        return self.account_by_id(session["account_id"])

    def remove_session(self, digest):
        self.sessions.pop(digest, None)

    def change_password(self, account_id, previous, password, current_session):
        account = self.accounts.get(account_id)
        if not account or account["password"] != previous:
            return False
        account["password"] = password
        self.sessions = {digest: session for digest, session in self.sessions.items() if session["account_id"] != account_id or digest == current_session}
        return True

    def list(self, date, account_id):
        return [{key: value for key, value in row.items() if key != "account_id"} for row in self.foods if row.get("account_id") == account_id and row["date"] == date]

    def add(self, entry, account_id):
        self.foods.append({**entry, "account_id": account_id})
        return entry

    def remove(self, entry_id, account_id):
        row = next((row for row in self.foods if row["id"] == entry_id and row.get("account_id") == account_id), None)
        if row:
            self.foods.remove(row)
        return bool(row)

    def list_lifts(self, date, account_id):
        return [{key: value for key, value in row.items() if key != "account_id"} for row in self.lifts if row.get("account_id") == account_id and row["date"] == date]

    def add_lift(self, entry, account_id):
        self.lifts.append({**entry, "account_id": account_id})
        return entry

    def remove_lift(self, entry_id, account_id):
        row = next((row for row in self.lifts if row["id"] == entry_id and row.get("account_id") == account_id), None)
        if row:
            self.lifts.remove(row)
        return bool(row)

    def list_custom_foods(self, account_id):
        return [{key: value for key, value in row.items() if key != "account_id"} for row in self.custom_foods if row["account_id"] == account_id]

    def add_custom_food(self, food, account_id):
        self.custom_foods.append({**food, "account_id": account_id})
        return food

    def remove_custom_food(self, food_id, account_id):
        row = next((row for row in self.custom_foods if row["id"] == food_id and row["account_id"] == account_id), None)
        if row:
            self.custom_foods.remove(row)
        return bool(row)

    def list_weights(self, account_id):
        rows = [entry.copy() for (owner, _date), entry in self.weights.items() if owner == account_id]
        return sorted(rows, key=lambda row: row["date"])[-30:]

    def save_weight(self, entry, account_id):
        row = {**entry, "weightKg": entry["weight"] * 0.45359237 if entry["unit"] == "lb" else entry["weight"]}
        self.weights[(account_id, entry["date"])] = row
        return row.copy()

    def remove_weight(self, date, account_id):
        return self.weights.pop((account_id, date), None) is not None
