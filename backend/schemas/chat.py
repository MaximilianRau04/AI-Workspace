from pydantic import BaseModel, ConfigDict


class MessageSchema(BaseModel):
    role: str
    parts: list[str]


class SessionListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    updated_at: str
    pinned: bool = False


class ChatSessionSchema(BaseModel):
    id: str
    user_id: str
    title: str = ""
    summary: str = ""
    messages: list[MessageSchema] = []
    created_at: str
    updated_at: str
