"""运行时数据库内省，用于管理后台的数据库管理界面。

此模块保持无副作用：每个辅助函数接收全局异步引擎或前次调用的结果。
路由器层负责组合它们。
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException
from sqlalchemy import inspect
from sqlalchemy.engine import Inspector
from sqlalchemy.ext.asyncio import AsyncEngine

# 在浏览/导出端点中需要遮盖的 (表, 列) 对。
# 原始 SQL 执行有意绕过此规则 — 管理员运行 SELECT password_hash 时应知道自己在做什么。
SENSITIVE_COLUMNS: set[tuple[str, str]] = {
    ("users", "password_hash"),
    ("providers", "api_key"),
}

REDACTED_PLACEHOLDER = "***"


# ── 同步辅助函数（在 conn.run_sync 中运行）────────────────────────────


def _sync_list_tables(insp: Inspector) -> list[str]:
    """列出表名，跳过 SQLite 内部表。"""
    return sorted(t for t in insp.get_table_names() if not t.startswith("sqlite_"))


def _sync_get_columns(insp: Inspector, table: str) -> list[dict[str, Any]]:
    cols = insp.get_columns(table)
    pks_info = insp.get_pk_constraint(table)
    pk_cols = set(pks_info.get("constrained_columns") or [])
    return [
        {
            "name": c["name"],
            "type": str(c["type"]),
            "nullable": bool(c.get("nullable", True)),
            "default": (str(c["default"]) if c.get("default") is not None else None),
            "primary_key": c["name"] in pk_cols,
            "sensitive": (table, c["name"]) in SENSITIVE_COLUMNS,
        }
        for c in cols
    ]


# ── 异步封装 ──────────────────────────────────────────────────────────────


async def list_tables(engine: AsyncEngine) -> list[str]:
    async with engine.connect() as conn:
        return await conn.run_sync(lambda c: _sync_list_tables(inspect(c)))


async def get_columns(engine: AsyncEngine, table: str) -> list[dict[str, Any]]:
    async with engine.connect() as conn:
        return await conn.run_sync(lambda c: _sync_get_columns(inspect(c), table))


async def assert_table(engine: AsyncEngine, table: str) -> None:
    """拒绝未知表名。根据引擎实际的表清单验证，防止 SQL 注入。"""
    if table not in await list_tables(engine):
        raise HTTPException(status_code=404, detail=f"表 '{table}' 不存在")


# ── 列 / 行辅助函数 ──────────────────────────────────────────────────────


def get_pk_column(columns_meta: list[dict[str, Any]]) -> str | None:
    """返回单一主键列名，复合主键或不存在时返回 None。"""
    pks = [c["name"] for c in columns_meta if c["primary_key"]]
    return pks[0] if len(pks) == 1 else None


def assert_column(columns_meta: list[dict[str, Any]], column: str) -> None:
    if not any(c["name"] == column for c in columns_meta):
        raise HTTPException(status_code=400, detail=f"列 '{column}' 不存在")


def is_sensitive(table: str, column: str) -> bool:
    return (table, column) in SENSITIVE_COLUMNS


def redact_row(table: str, row: dict[str, Any]) -> dict[str, Any]:
    """用 REDACTED_PLACEHOLDER 替换敏感列的值。None 保持 None 以便区分"未设置"和"已隐藏"。"""
    return {
        k: (REDACTED_PLACEHOLDER if is_sensitive(table, k) and v is not None else v)
        for k, v in row.items()
    }


def searchable_columns(columns_meta: list[dict[str, Any]]) -> list[str]:
    """返回适合 ILIKE 搜索的文本类型列名。"""
    out: list[str] = []
    for c in columns_meta:
        t = c["type"].upper()
        if any(s in t for s in ("VARCHAR", "TEXT", "STRING", "CHAR", "CLOB", "JSON")):
            out.append(c["name"])
    return out


# ── SQL 关键字分类（用于 SQL 控制台的只读模式）───────────────────────


_READ_ONLY_PREFIXES = {"SELECT", "WITH", "EXPLAIN", "PRAGMA", "VALUES"}


def first_sql_token(sql: str) -> str:
    """返回 SQL 语句的第一个标识符（大写）。

    自动跳过前导空白、行注释和块注释。空语句返回空字符串。
    """
    s = sql.lstrip()
    while True:
        if s.startswith("--"):
            nl = s.find("\n")
            if nl < 0:
                return ""
            s = s[nl + 1 :].lstrip()
        elif s.startswith("/*"):
            close = s.find("*/")
            if close < 0:
                return ""
            s = s[close + 2 :].lstrip()
        else:
            break
    m = re.match(r"[A-Za-z_][A-Za-z0-9_]*", s)
    return m.group(0).upper() if m else ""


def is_read_only_sql(sql: str) -> bool:
    return first_sql_token(sql) in _READ_ONLY_PREFIXES
