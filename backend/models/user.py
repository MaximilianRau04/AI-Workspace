from __future__ import annotations

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    profile: Mapped[str] = mapped_column(Text, default="", server_default="")
    memory: Mapped[str] = mapped_column(Text, default="", server_default="")

    sessions: Mapped[list[ChatSession]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )
    documents: Mapped[list[Document]] = relationship(  # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )
