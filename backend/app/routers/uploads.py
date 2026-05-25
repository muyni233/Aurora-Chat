"""聊天附件上传。

接收 multipart 文件上传，验证文件类型和大小，存储到
``uploads/chat/{user_id}/{uuid}.{ext}`` 目录下，并返回轻量级 ``Attachment``
描述信息，前端随后将其包含在聊天消息中。

对于文本类文件（txt / md / csv / json 及常见代码扩展名），我们还会
以内联方式读取内容（上限 200 KB），以便聊天发送路径将它们作为围栏代码块
拼接到用户提示词中——实现通用的 LLM 兼容性，无需针对特定服务商进行处理。

图片通过 base64 image_url 内容块传递给 LLM（在 ``chat_service`` 中的发送时构建）。
PDF 同样会被读取并作为文件内容块发送给支持此功能的服务商（Anthropic / Gemini）；
对于不支持的服务商，则退化为仅提及文件名。
"""

import os
import uuid
import mimetypes
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from app.config import settings
from app.deps import get_current_user
from app.models.user import User
from app.schemas.message import Attachment

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


# ── 限制 ────────────────────────────────────────────────────────────────────────
MAX_FILE_BYTES = 25 * 1024 * 1024  # 单个文件 25 MB
MAX_REQUEST_BYTES = 30 * 1024 * 1024  # 单次请求总计 30 MB
MAX_FILES_PER_REQUEST = 8
MAX_TEXT_PREVIEW_BYTES = 200 * 1024  # 内联到提示词中的 200 KB

# ── 文件类型白名单 ───────────────────────────────────────────────────────────────
# 文件满足以下任一条件即通过：其 content_type 在 IMAGE_MIMES / PDF_MIMES /
# TEXT_MIMES 中，或其扩展名在 TEXT_EXTENSIONS 中。扩展名回退机制用于处理浏览器
# 将纯文本代码文件标记为 ``application/octet-stream`` 的情况（如 .ts, .py, .yml 等）。
IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
PDF_MIMES = {"application/pdf"}
TEXT_MIMES = {
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/x-python",
    "text/x-script.python",
    "application/json",
}
# 视为文本的小写扩展名（不含点号）。浏览器对这些文件报告的 MIME 类型各不相同——
# 扩展名是最可靠的判断依据。
TEXT_EXTENSIONS = {
    "txt",
    "md",
    "markdown",
    "csv",
    "tsv",
    "json",
    "log",
    "py",
    "js",
    "jsx",
    "ts",
    "tsx",
    "mjs",
    "cjs",
    "html",
    "htm",
    "css",
    "scss",
    "yml",
    "yaml",
    "toml",
    "ini",
    "conf",
    "cfg",
    "env",
    "sh",
    "bash",
    "zsh",
    "ps1",
    "xml",
    "svg",
    "rs",
    "go",
    "java",
    "kt",
    "swift",
    "c",
    "cpp",
    "h",
    "hpp",
    "rb",
    "php",
    "sql",
}


def _classify(
    filename: str, content_type: str
) -> Literal["image", "pdf", "text"] | None:
    """返回文件的类型标签，若文件类型不被支持则返回 None。

    优先级规则：当 MIME 类型是我们认可的格式之一时，MIME 优先于扩展名。
    否则退回到扩展名检测，这样即使浏览器将 ``script.py`` 报告为
    ``application/octet-stream``，它仍然能被正确分类为文本。
    """
    ct = (content_type or "").lower()
    if ct in IMAGE_MIMES:
        return "image"
    if ct in PDF_MIMES:
        return "pdf"
    if ct in TEXT_MIMES or ct.startswith("text/"):
        return "text"

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in TEXT_EXTENSIONS:
        return "text"
    return None


def _safe_extension(filename: str | None, content_type: str | None) -> str:
    """为保存的文件选择一个安全的小写扩展名。如果文件名和内容类型
    都无法提供有用信息，则回退到 ``bin``。"""
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        # 拒绝路径分隔符 / 空字节；限制为仅字母数字。
        if ext.isalnum() and len(ext) <= 8:
            return ext
    if content_type:
        guessed = mimetypes.guess_extension(content_type) or ""
        if guessed.startswith("."):
            guessed = guessed[1:]
        if guessed.isalnum() and len(guessed) <= 8:
            return guessed
    return "bin"


@router.post("", response_model=list[Attachment])
async def upload_files(
    request: Request,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
):
    """接收当前用户的 1..N 个文件；保存并返回描述信息。"""
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"一次最多上传 {MAX_FILES_PER_REQUEST} 个文件",
        )

    # 按用户分目录可以保持文件整洁，也便于未来的清理任务针对单个用户进行操作，
    # 而无需遍历其他用户。
    user_dir = os.path.join(settings.UPLOAD_DIR, "chat", str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)

    out: list[Attachment] = []
    total_size = 0

    for upload in files:
        kind = _classify(upload.filename or "", upload.content_type or "")
        if kind is None:
            raise HTTPException(
                status_code=415,
                detail=f"不支持的格式：{upload.filename}（{upload.content_type or '未知类型'}）",
            )

        # 读取文件内容。Starlette 的 ``UploadFile.read()`` 会将内容缓冲在内存中；
        # 我们在读取后立即检查长度——对于 25 MB 的限制来说这是可行的，
        # 但如果上限更大，则需要改用带计数的流式读取。
        content = await upload.read()
        size = len(content)
        if size == 0:
            raise HTTPException(
                status_code=400,
                detail=f"空文件：{upload.filename}",
            )
        if size > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"{upload.filename} 超过单文件上限 {MAX_FILE_BYTES // 1024 // 1024} MB",
            )
        total_size += size
        if total_size > MAX_REQUEST_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"本次上传总量超过 {MAX_REQUEST_BYTES // 1024 // 1024} MB",
            )

        ext = _safe_extension(upload.filename, upload.content_type)
        stored_name = f"{uuid.uuid4()}.{ext}"
        filepath = os.path.join(user_dir, stored_name)
        with open(filepath, "wb") as f:
            f.write(content)

        # 对于文本类文件，我们提前解码并存储预览内容，这样聊天发送路径
        # 就不需要重新打开文件。截断到 200 KB——超出部分仅作为文件存在的提示；
        # 完整文件内容仍然保留在磁盘上，供将来的代码需要时使用。
        text_preview: str | None = None
        if kind == "text":
            try:
                snippet = content[:MAX_TEXT_PREVIEW_BYTES].decode(
                    "utf-8", errors="replace"
                )
                text_preview = snippet
                if len(content) > MAX_TEXT_PREVIEW_BYTES:
                    text_preview += "\n\n[…文件过大，已截断]"
            except Exception:
                # 伪装成文本的二进制内容——保留文件但跳过预览；
                # 前端用户界面仍然显示该文件的标签。
                text_preview = None

        out.append(
            Attachment(
                url=f"/uploads/chat/{current_user.id}/{stored_name}",
                content_type=upload.content_type
                or mimetypes.guess_type(upload.filename or "")[0]
                or "application/octet-stream",
                name=upload.filename or stored_name,
                size=size,
                text_preview=text_preview,
                kind=kind,
            )
        )

    return out
