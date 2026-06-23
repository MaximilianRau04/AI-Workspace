import os
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from models.base import Base

_db_path = os.path.join(os.path.dirname(__file__), "..", "chatbot.db")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{_db_path}")

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)

if DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_pragmas(conn, _):
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def init_db() -> None:
    import models  # noqa: F401 — ensures all models are registered before create_all
    Base.metadata.create_all(engine)
    _migrate_columns()


def _migrate_columns() -> None:
    from sqlalchemy import text
    migrations = [
        ("users",    "profile", "TEXT DEFAULT ''"),
        ("users",    "memory",  "TEXT DEFAULT ''"),
        ("sessions", "pinned",  "INTEGER DEFAULT 0"),
    ]
    with engine.connect() as conn:
        for table, col, col_def in migrations:
            existing = [r[1] for r in conn.execute(text(f"PRAGMA table_info({table})"))]
            if col not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_def}"))
                conn.commit()


@contextmanager
def get_session() -> Session:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
