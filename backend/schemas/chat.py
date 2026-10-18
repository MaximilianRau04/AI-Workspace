from pydantic import BaseModel, ConfigDict


class MessageSchema(BaseModel):
    role: str
    parts: list[str]
    images: list[str] = []
    # [{"name", "args", "result"}] for the tools the model called while writing this reply
    tool_calls: list[dict] = []


class SessionListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    updated_at: str
    pinned: bool = False
    folder_id: str | None = None


class ChatSessionSchema(BaseModel):
    id: str
    user_id: str
    title: str = ""
    summary: str = ""
    messages: list[MessageSchema] = []
    prompt_id: str | None = None
    created_at: str
    updated_at: str
