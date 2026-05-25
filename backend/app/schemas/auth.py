from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

# 密码策略：至少 8 个字符，且必须同时包含大写字母和小写字母。
# 集中定义在此处，以便注册、个人资料更新以及未来的流程保持一致。
# 错误消息是面向用户的——请保持简洁并使用中文（FastAPI 的 422 处理程序会原样显示）。
PASSWORD_POLICY_MESSAGE = "密码至少 8 位，且需同时包含大写字母和小写字母。"


def _validate_password_complexity(value: str) -> str:
    """Pydantic 验证器函数：执行已记录的密码策略。

    Pydantic 已通过 ``Field`` 强制执行 ``min_length``，但仅靠长度还不够——
    我们还要求至少包含一个大写字母和一个小写字母。此处重新检查长度，
    以确保无论哪个约束先被违反，错误消息都是一致的。
    """
    if (
        len(value) < 8
        or not any(c.isupper() for c in value)
        or not any(c.islower() for c in value)
    ):
        raise ValueError(PASSWORD_POLICY_MESSAGE)
    return value


# ── 暴露给前端的公开注册配置 ─────────────────────────────────────


RegistrationMode = Literal["open", "admin_review", "email_verification"]


class RegisterConfig(BaseModel):
    """告诉前端注册界面应该如何表现。"""

    # 管理员选择的当前注册模式（默认为 ``open``）。
    mode: RegistrationMode

    # 当服务器端已配置 SMTP 时为 True。管理员需要此信息，以便设置界面在 SMTP
    # 未配置时禁用邮箱验证选项。
    email_verification_available: bool

    # 当非空时，仅接受这些域名下的邮箱进行注册。
    allowed_email_domains: list[str] = []


# ── 验证码请求 / 注册 / 登录 ───────────────────────────────────────────


class RequestCodeRequest(BaseModel):
    email: EmailStr


class RequestCodeResponse(BaseModel):
    sent: bool
    # 回传给前端，以便 UI 可以显示"重新发送（XX秒）"倒计时。
    resend_after_seconds: int = 60


class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=100)
    # 当模式为 ``email_verification`` 时必填；其他模式下忽略。
    code: str | None = Field(default=None, min_length=4, max_length=10)

    _validate_password = field_validator("password")(_validate_password_complexity)


class RegisterResponse(BaseModel):
    """根据新账户的情况返回不同的形状。

    - ``status = "active"``  → 账户已就绪，``access_token`` 有值。
    - ``status = "pending"`` → 账户已创建但等待管理员审批；无 token。
    """

    status: str  # "active" | "pending"
    access_token: str | None = None
    token_type: str = "bearer"
    message: str | None = None


class UserLogin(BaseModel):
    # 登录通过邮箱进行——用户名仅用于显示，可能不唯一，因此我们通过
    # 唯一的邮箱列进行认证查找。
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    avatar_url: str | None = None
    is_active: bool
    created_at: str

    class Config:
        from_attributes = True


# ── 个人资料自助更新（PUT /api/auth/me） ──────────────────────────────


class ProfileUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=50)
    email: EmailStr | None = None
    avatar_url: str | None = None
    new_password: str | None = Field(default=None, min_length=8, max_length=100)
    current_password: str | None = None

    @field_validator("new_password")
    @classmethod
    def _validate_new_password(cls, v: str | None) -> str | None:
        # 允许 ``None``（= 不修改密码），但只要提供了值就必须强制执行密码策略。
        if v is None:
            return v
        return _validate_password_complexity(v)


# ── 管理员用户管理 ─────────────────────────────────────────────────


class AdminUserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    avatar_url: str | None = None
    is_active: bool
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    role: str | None = None  # "user" | "admin"


# ── 管理员应用设置 ────────────────────────────────────────────────────


class AdminSettingsResponse(BaseModel):
    registration_mode: RegistrationMode
    email_verification_available: bool
    allowed_email_domains: list[str] = []


class AdminSettingsUpdate(BaseModel):
    registration_mode: RegistrationMode
