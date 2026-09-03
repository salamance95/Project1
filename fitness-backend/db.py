"""SQLAlchemy 엔진/세션. SQLite 파일 하나로 동작한다."""

import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_URL = f"sqlite:///{os.path.join(BASE_DIR, 'fitness.db')}"
DATABASE_URL = os.environ.get("FITNESS_DATABASE_URL", DEFAULT_URL)

engine = create_engine(
    DATABASE_URL,
    future=True,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    pass


if DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _enable_sqlite_fk(dbapi_connection, _record):
        """SQLite는 외래키 제약이 기본 비활성이라 연결마다 켜준다."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_db():
    """FastAPI 의존성. 요청 하나당 세션 하나."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
