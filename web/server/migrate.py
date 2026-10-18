from pathlib import Path

from dotenv import load_dotenv

from .db import connect, migrate

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

if __name__ == "__main__":
    with connect() as connection:
        migrate(connection)
    print("Database schema ready.")
