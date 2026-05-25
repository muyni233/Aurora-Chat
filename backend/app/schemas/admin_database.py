"""管理员数据库管理端点的 Pydantic 模型定义。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ColumnMeta(BaseModel):
    name: str
    type: str
    nullable: bool
    default: str | None = None
    primary_key: bool
    sensitive: bool


class TableSummary(BaseModel):
    name: str
    row_count: int
    pk_column: str | None  # None 表示复合主键或无主键；行编辑/删除不可用
    has_sensitive: bool


class TableSchema(BaseModel):
    name: str
    columns: list[ColumnMeta]
    pk_column: str | None
    row_count: int


class RowsPage(BaseModel):
    columns: list[str]
    rows: list[dict[str, Any]]
    total: int
    page: int
    size: int


class RowUpdate(BaseModel):
    """``changes`` 是一个部分更新——只有此处提供的键才会被写入。值必须
    已经是 JSON 可序列化形式（字符串 / 整数 / 布尔 / null）。"""

    changes: dict[str, Any] = Field(default_factory=dict)


class SqlRequest(BaseModel):
    sql: str
    mode: Literal["read", "write"] = "read"


class SqlResult(BaseModel):
    """统一的返回格式，无论执行的是哪种语句类型。

    - 对于 ``SELECT``：``columns`` 和 ``rows`` 有值，``rowcount`` 等同于 ``len(rows)``。
    - 对于写入/DDL：``columns`` 和 ``rows`` 为空，``rowcount`` 表示受影响的行数
      （DDL 在 DB-API 中通常返回 -1，但我们统一转换为 0 以便展示）。
    """

    columns: list[str]
    rows: list[list[Any]]
    rowcount: int
    elapsed_ms: int
    truncated: bool = False
    statement_kind: Literal["select", "write", "ddl", "other"]
