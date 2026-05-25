from pydantic import BaseModel
from typing import Literal


class Attachment(BaseModel):
    """上传后用于聊天消息的附件文件。

    ``url`` 是服务器相对路径，位于 ``/uploads/...`` 下；后端从磁盘读取文件
    以构建多模态 LLM 请求载荷。``text_preview`` 仅对内容以内联围栏代码块
    拼接到用户提示词中的文件设置（text/*、json、常见代码扩展名）——
    它是截断后的文本内容（不超过 200 KB）。对于图片和 PDF，``text_preview``
    为 None，文件在发送时读取。
    """

    url: str
    content_type: str
    name: str
    size: int
    text_preview: str | None = None
    # ``kind`` 是前端用于渲染的粗粒度分类，由上传路由根据 MIME 类型和扩展名推断。
    kind: Literal["image", "pdf", "text"] = "text"


class MessageCreate(BaseModel):
    content: str
    attachments: list[Attachment] | None = None


class MessageUpdate(BaseModel):
    content: str


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    attachments: list[Attachment] | None = None
    token_count: int | None = None
    is_deleted: bool = False
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    content: str
    model_id: str | None = None  # 覆盖会话的当前模型
    attachments: list[Attachment] | None = None
