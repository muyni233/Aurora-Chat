"""管理员数据库检查与管理接口。

所有接口均需 require_admin 授权。

安全保证：
1. 所有接口均需管理员权限
2. 表名和列名始终通过 inspect() 验证后才拼入 SQL
3. users 表有额外保护：不可删除/降级自己或最后一位管理员
4. 只读模式拒绝非 SELECT/WITH/EXPLAIN/PRAGMA 的 SQL
5. 敏感列在浏览/导出接口中被遮盖
"""

from __future__ import annotations

import csv
import io
import json
import os
import tempfile
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import unquote

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask

from app.database import engine, get_db
from app.deps import require_admin
from app.models.user import User
from app.schemas.admin_database import (
    ColumnMeta,
    RowsPage,
    RowUpdate,
    SqlRequest,
    SqlResult,
    TableSchema,
    TableSummary,
)
from app.services import db_inspector

router = APIRouter(prefix="/api/admin/database", tags=["admin"])


MAX_PAGE_SIZE = 200
MAX_SQL_ROWS = 5000


# ── 工具函数 ───────────────────────────────────────────────────────────────


def _quote_ident(name: str) -> str:
    """SQLite 标识符引号处理。调用方必须确保 name 来自 inspect() 验证。"""
    return '"' + name.replace('"', '""') + '"'


def _classify_statement(token: str) -> str:
    t = token.upper()
    if t in {"SELECT", "WITH", "VALUES", "EXPLAIN", "PRAGMA"}:
        return "select"
    if t in {"INSERT", "UPDATE", "DELETE", "REPLACE"}:
        return "write"
    if t in {"CREATE", "DROP", "ALTER", "TRUNCATE", "VACUUM", "ANALYZE", "REINDEX"}:
        return "ddl"
    return "other"


def _coerce_pk_value(pk_str: str, col_type: str) -> Any:
    """将路径参数（字符串）按列类型转换，INT 类型列转为整数。"""
    if "INT" in col_type.upper():
        try:
            return int(pk_str)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"主键值需要是整数：{pk_str}")
    return pk_str


async def _row_count(db: AsyncSession, table: str) -> int:
    res = await db.execute(text(f"SELECT count(*) FROM {_quote_ident(table)}"))
    return int(res.scalar_one())


async def _admin_count(db: AsyncSession) -> int:
    """活跃管理员数量，用于控制 users 表上的破坏性操作。"""
    res = await db.execute(
        select(func.count())
        .select_from(User)
        .where(User.role == "admin", User.is_active.is_(True))
    )
    return int(res.scalar_one())


# ── 表 / 模式 ──────────────────────────────────────────────────────────────


@router.get("/tables", response_model=list[TableSummary])
async def list_tables(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    names = await db_inspector.list_tables(engine)
    out: list[TableSummary] = []
    for name in names:
        cols = await db_inspector.get_columns(engine, name)
        out.append(
            TableSummary(
                name=name,
                row_count=await _row_count(db, name),
                pk_column=db_inspector.get_pk_column(cols),
                has_sensitive=any(c["sensitive"] for c in cols),
            )
        )
    return out


@router.get("/tables/{table_name}", response_model=TableSchema)
async def get_table_schema(
    table_name: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    await db_inspector.assert_table(engine, table_name)
    cols = await db_inspector.get_columns(engine, table_name)
    return TableSchema(
        name=table_name,
        columns=[ColumnMeta(**c) for c in cols],
        pk_column=db_inspector.get_pk_column(cols),
        row_count=await _row_count(db, table_name),
    )


# ── 行浏览 ─────────────────────────────────────────────────────────────────


@router.get("/tables/{table_name}/rows", response_model=RowsPage)
async def list_rows(
    table_name: str,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    search: str | None = Query(None),
    order_by: str | None = Query(None),
    order_dir: str = Query("desc", pattern=r"^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    await db_inspector.assert_table(engine, table_name)
    cols = await db_inspector.get_columns(engine, table_name)
    col_names = [c["name"] for c in cols]
    pk_col = db_inspector.get_pk_column(cols)

    # 排序：默认为主键，无主键则使用第一列
    if order_by is None:
        order_by = pk_col or col_names[0]
    else:
        db_inspector.assert_column(cols, order_by)

    # 构建 WHERE 子句
    where_sql = ""
    params: dict[str, Any] = {}
    if search:
        searchable = db_inspector.searchable_columns(cols)
        if searchable:
            ors = " OR ".join(
                f"CAST({_quote_ident(c)} AS TEXT) LIKE :q" for c in searchable
            )
            where_sql = f"WHERE {ors}"
            params["q"] = f"%{search}%"

    qident = _quote_ident(table_name)
    order_ident = _quote_ident(order_by)
    direction = order_dir.upper()

    # 计数
    total_row = await db.execute(
        text(f"SELECT count(*) FROM {qident} {where_sql}"), params
    )
    total = int(total_row.scalar_one())

    # 分页
    offset = (page - 1) * size
    rows_res = await db.execute(
        text(
            f"SELECT * FROM {qident} {where_sql} "
            f"ORDER BY {order_ident} {direction} LIMIT :_lim OFFSET :_off"
        ),
        {**params, "_lim": size, "_off": offset},
    )
    raw = rows_res.mappings().all()
    rows = [db_inspector.redact_row(table_name, dict(r)) for r in raw]

    return RowsPage(columns=col_names, rows=rows, total=total, page=page, size=size)


# ── 行修改 ─────────────────────────────────────────────────────────────────


def _users_guard_update(
    target: dict[str, Any], actor: User, changes: dict[str, Any]
) -> None:
    """对 users 表的通用行更新执行安全守卫，防止自毁操作。"""
    is_self = target.get("id") == actor.id
    if "role" in changes and is_self and changes["role"] != "admin":
        raise HTTPException(status_code=400, detail="不能取消自己的管理员身份")
    if "is_active" in changes and is_self and changes["is_active"] is False:
        raise HTTPException(status_code=400, detail="不能停用自己的账号")


@router.patch("/tables/{table_name}/rows/{pk}", response_model=dict[str, Any])
async def update_row(
    table_name: str,
    pk: str,
    payload: RowUpdate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_admin),
):
    await db_inspector.assert_table(engine, table_name)
    cols = await db_inspector.get_columns(engine, table_name)
    pk_col = db_inspector.get_pk_column(cols)
    if pk_col is None:
        raise HTTPException(status_code=400, detail="此表没有单列主键，无法逐行编辑")

    pk_meta = next(c for c in cols if c["name"] == pk_col)
    pk_value = _coerce_pk_value(unquote(pk), pk_meta["type"])

    changes = payload.changes or {}
    if not changes:
        raise HTTPException(status_code=400, detail="未提供任何修改")
    if pk_col in changes:
        raise HTTPException(status_code=400, detail="不允许修改主键值")

    # 验证列名，拒绝脱敏占位符
    for col, val in changes.items():
        db_inspector.assert_column(cols, col)
        if (
            db_inspector.is_sensitive(table_name, col)
            and val == db_inspector.REDACTED_PLACEHOLDER
        ):
            raise HTTPException(
                status_code=400,
                detail=f"列 {col} 显示为脱敏占位符，请输入真实值或在 SQL 控制台执行",
            )

    qident = _quote_ident(table_name)
    pk_ident = _quote_ident(pk_col)

    # 查找原始行
    original_res = await db.execute(
        text(f"SELECT * FROM {qident} WHERE {pk_ident} = :pk"), {"pk": pk_value}
    )
    original = original_res.mappings().first()
    if original is None:
        raise HTTPException(status_code=404, detail="行不存在")

    if table_name == "users":
        _users_guard_update(dict(original), actor, changes)
        # 最后一位管理员的降级/禁用检查
        if (
            (changes.get("role") == "user" and original["role"] == "admin")
            or (changes.get("is_active") is False and original["role"] == "admin")
        ) and await _admin_count(db) <= 1:
            raise HTTPException(status_code=400, detail="必须保留至少一名活跃管理员")

    set_sql = ", ".join(
        f"{_quote_ident(c)} = :v_{i}" for i, c in enumerate(changes.keys())
    )
    bind = {f"v_{i}": v for i, v in enumerate(changes.values())}
    bind["pk"] = pk_value

    await db.execute(
        text(f"UPDATE {qident} SET {set_sql} WHERE {pk_ident} = :pk"), bind
    )

    refreshed = await db.execute(
        text(f"SELECT * FROM {qident} WHERE {pk_ident} = :pk"), {"pk": pk_value}
    )
    row = refreshed.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="更新后未能读回")
    return db_inspector.redact_row(table_name, dict(row))


@router.delete("/tables/{table_name}/rows/{pk}", status_code=204)
async def delete_row(
    table_name: str,
    pk: str,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(require_admin),
):
    await db_inspector.assert_table(engine, table_name)
    cols = await db_inspector.get_columns(engine, table_name)
    pk_col = db_inspector.get_pk_column(cols)
    if pk_col is None:
        raise HTTPException(status_code=400, detail="此表没有单列主键，无法逐行删除")

    pk_meta = next(c for c in cols if c["name"] == pk_col)
    pk_value = _coerce_pk_value(unquote(pk), pk_meta["type"])

    qident = _quote_ident(table_name)
    pk_ident = _quote_ident(pk_col)

    fetch = await db.execute(
        text(f"SELECT * FROM {qident} WHERE {pk_ident} = :pk"), {"pk": pk_value}
    )
    target = fetch.mappings().first()
    if target is None:
        raise HTTPException(status_code=404, detail="行不存在")

    if table_name == "users":
        if target["id"] == actor.id:
            raise HTTPException(status_code=400, detail="不能删除自己的账号")
        if target["role"] == "admin" and await _admin_count(db) <= 1:
            raise HTTPException(status_code=400, detail="必须保留至少一名活跃管理员")

    await db.execute(
        text(f"DELETE FROM {qident} WHERE {pk_ident} = :pk"), {"pk": pk_value}
    )


# ── 原始 SQL ───────────────────────────────────────────────────────────────


@router.post("/query", response_model=SqlResult)
async def run_sql(
    body: SqlRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    sql = body.sql.strip()
    if not sql:
        raise HTTPException(status_code=400, detail="SQL 不能为空")

    token = db_inspector.first_sql_token(sql)
    kind = _classify_statement(token)

    if body.mode == "read" and not db_inspector.is_read_only_sql(sql):
        raise HTTPException(
            status_code=400,
            detail="只读模式下只能执行 SELECT / WITH / EXPLAIN / PRAGMA / VALUES。",
        )

    started = time.perf_counter()
    try:
        result = await db.execute(text(sql))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    columns: list[str] = []
    rows: list[list[Any]] = []
    truncated = False
    rowcount = 0

    if result.returns_rows:
        fetched = result.fetchmany(MAX_SQL_ROWS + 1)
        if len(fetched) > MAX_SQL_ROWS:
            truncated = True
            fetched = fetched[:MAX_SQL_ROWS]
        columns = list(result.keys())
        rows = [[v for v in r] for r in fetched]
        rowcount = len(rows)
    else:
        rc = result.rowcount
        rowcount = max(0, rc) if rc is not None else 0

    return SqlResult(
        columns=columns,
        rows=rows,
        rowcount=rowcount,
        elapsed_ms=elapsed_ms,
        truncated=truncated,
        statement_kind=kind,  # type: ignore[arg-type]
    )


# ── 导出 ───────────────────────────────────────────────────────────────────


def _snapshot_filename() -> str:
    return f"aurora_chat-snapshot-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.db"


def _delete_path(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass


@router.get("/export")
async def export_database(
    _: User = Depends(require_admin),
):
    """下载数据库的一致 SQLite 快照。使用 VACUUM INTO 保证时间点一致性。"""
    fd, tmp_path = tempfile.mkstemp(prefix="aurora-snap-", suffix=".db")
    os.close(fd)
    os.unlink(tmp_path)

    safe_path = tmp_path.replace("'", "''")
    async with engine.connect() as conn:
        ac = await conn.execution_options(isolation_level="AUTOCOMMIT")
        await ac.execute(text(f"VACUUM INTO '{safe_path}'"))

    return FileResponse(
        path=tmp_path,
        media_type="application/octet-stream",
        filename=_snapshot_filename(),
        background=BackgroundTask(_delete_path, tmp_path),
    )


@router.get("/tables/{table_name}/export")
async def export_table(
    table_name: str,
    format: str = Query("csv", pattern=r"^(csv|json)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """将单表内容导出为 CSV 或 JSON，敏感列已脱敏。"""
    await db_inspector.assert_table(engine, table_name)
    cols = await db_inspector.get_columns(engine, table_name)
    col_names = [c["name"] for c in cols]
    qident = _quote_ident(table_name)

    res = await db.execute(text(f"SELECT * FROM {qident}"))
    raw_rows = res.mappings().all()
    redacted = [db_inspector.redact_row(table_name, dict(r)) for r in raw_rows]

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    if format == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(col_names)
        for row in redacted:
            writer.writerow([row.get(c) for c in col_names])
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{table_name}-{timestamp}.csv"',
            },
        )

    # JSON
    payload = json.dumps(redacted, ensure_ascii=False, default=str)
    return StreamingResponse(
        iter([payload]),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{table_name}-{timestamp}.json"',
        },
    )
