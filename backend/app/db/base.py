from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models. Import this, not
    sqlalchemy.orm.DeclarativeBase directly, so every model shares one
    metadata object (needed for Alembic autogenerate to see everything)."""
    pass
