"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet, apiPost, apiPatch, apiDelete, API_BASE } from "@/lib/api";
import {
  Database,
  Search,
  Trash2,
  Edit3,
  Play,
  Download,
  RefreshCw,
  AlertTriangle,
  Check,
  FileSpreadsheet,
  FileJson,
  Columns,
  TableProperties,
  Terminal,
  HelpCircle,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface TableSummary {
  name: string;
  row_count: number;
  pk_column: string | null;
  has_sensitive: boolean;
}

interface ColumnMeta {
  name: string;
  type: string;
  nullable: boolean;
  default_value: string | null;
  sensitive: boolean;
}

interface TableSchema {
  name: string;
  columns: ColumnMeta[];
  pk_column: string | null;
  row_count: number;
}

interface RowsPage {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  size: number;
}

interface SqlResult {
  columns: string[];
  rows: unknown[][];
  rowcount: number;
  elapsed_ms: number;
  truncated: boolean;
  statement_kind: "select" | "write" | "ddl" | "other";
}

type MainTab = "table-detail" | "sql-console";
type TableTab = "data" | "schema" | "export";

export default function AdminDatabasePage() {
  const [tables, setTables] = React.useState<TableSummary[] | null>(null);
  const [selectedTable, setSelectedTable] = React.useState<string | null>(null);
  const [tableSchema, setTableSchema] = React.useState<TableSchema | null>(
    null,
  );
  const [rowsPage, setRowsPage] = React.useState<RowsPage | null>(null);

  // 导航与标签页
  const [mainTab, setMainTab] = React.useState<MainTab>("table-detail");
  const [tableTab, setTableTab] = React.useState<TableTab>("data");

  // 行浏览查询状态
  const [searchQuery, setSearchQuery] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const [orderBy, setOrderBy] = React.useState<string | null>(null);
  const [orderDir, setOrderDir] = React.useState<"asc" | "desc">("desc");

  // SQL 控制台
  const [sqlText, setSqlText] = React.useState("SELECT * FROM users LIMIT 10;");
  const [sqlMode, setSqlMode] = React.useState<"read" | "write">("read");
  const [sqlResult, setSqlResult] = React.useState<SqlResult | null>(null);
  const [sqlError, setSqlError] = React.useState<string | null>(null);
  const [sqlLoading, setSqlLoading] = React.useState(false);
  const [showSqlConfirm, setShowSqlConfirm] = React.useState(false);

  // 行编辑 / 删除对话框
  const [editingRow, setEditingRow] = React.useState<Record<
    string,
    unknown
  > | null>(null);
  const [editPayload, setEditPayload] = React.useState<Record<string, unknown>>(
    {},
  );
  const [editError, setEditError] = React.useState<string | null>(null);
  const [deletingRowPk, setDeletingRowPk] = React.useState<string | null>(null);
  const [actionLoading, setActionLoading] = React.useState(false);

  // 通用加载与错误
  const [loadingTables, setLoadingTables] = React.useState(true);
  const [loadingRows, setLoadingRows] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 1. 获取表摘要
  const fetchTables = React.useCallback(async (selectFirst = false) => {
    setLoadingTables(true);
    try {
      const data = await apiGet<TableSummary[]>("/api/admin/database/tables");
      setTables(data);
      if (selectFirst && data.length > 0) {
        setSelectedTable(data[0].name);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载表信息失败");
    } finally {
      setLoadingTables(false);
    }
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => {
      void fetchTables(true);
    }, 0);
    return () => clearTimeout(t);
  }, [fetchTables]);

  // 搜索查询防抖
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // 搜索或表切换时重置页码
  React.useEffect(() => {
    const t = setTimeout(() => {
      setCurrentPage(1);
    }, 0);
    return () => clearTimeout(t);
  }, [debouncedSearch, selectedTable]);

  // 2. 选中表时获取结构
  React.useEffect(() => {
    if (!selectedTable) return;
    let active = true;
    void (async () => {
      try {
        const schema = await apiGet<TableSchema>(
          `/api/admin/database/tables/${selectedTable}`,
        );
        if (active) {
          setTableSchema(schema);
          setOrderBy(schema.pk_column);
        }
      } catch (err: unknown) {
        if (active)
          setError(err instanceof Error ? err.message : "加载表结构失败");
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedTable]);

  // 3. 当参数变化时获取行数据
  const fetchRows = React.useCallback(async () => {
    if (!selectedTable) return;
    setLoadingRows(true);
    try {
      const url = new URL(
        `${API_BASE}/api/admin/database/tables/${selectedTable}/rows`,
        typeof window !== "undefined"
          ? window.location.origin
          : "http://localhost",
      );
      url.searchParams.set("page", String(currentPage));
      url.searchParams.set("size", "20");
      if (debouncedSearch) url.searchParams.set("search", debouncedSearch);
      if (orderBy) {
        url.searchParams.set("order_by", orderBy);
        url.searchParams.set("order_dir", orderDir);
      }

      // 读取授权令牌
      const token = localStorage.getItem("aurora_token");
      const headers: Record<string, string> = {
        Accept: "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(url.toString(), { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || "加载数据行失败");
      }
      const data = (await res.json()) as RowsPage;
      setRowsPage(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载数据行失败");
    } finally {
      setLoadingRows(false);
    }
  }, [selectedTable, currentPage, debouncedSearch, orderBy, orderDir]);

  React.useEffect(() => {
    const t = setTimeout(() => {
      void fetchRows();
    }, 0);
    return () => clearTimeout(t);
  }, [fetchRows]);

  // 执行原始 SQL 查询
  const runSqlQuery = async (bypassConfirm = false) => {
    if (!sqlText.trim()) return;
    if (sqlMode === "write" && !bypassConfirm) {
      setShowSqlConfirm(true);
      return;
    }
    setShowSqlConfirm(false);
    setSqlLoading(true);
    setSqlResult(null);
    setSqlError(null);
    try {
      const res = await apiPost<SqlResult>("/api/admin/database/query", {
        sql: sqlText,
        mode: sqlMode,
      });
      setSqlResult(res);
      // 写入或 DDL 操作后刷新表列表，以防数据库结构已变更
      if (
        sqlMode === "write" ||
        res.statement_kind === "ddl" ||
        res.statement_kind === "write"
      ) {
        void fetchTables();
      }
    } catch (err: unknown) {
      setSqlError(err instanceof Error ? err.message : "执行 SQL 失败");
    } finally {
      setSqlLoading(false);
    }
  };

  // 导出数据库快照
  const downloadDbSnapshot = () => {
    const token = localStorage.getItem("aurora_token");
    const url = `${API_BASE}/api/admin/database/export${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    // 通过直接链接下载（浏览器处理 attachment 头）
    window.open(url, "_blank");
  };

  // 导出表为 CSV / JSON
  const downloadTableExport = (format: "csv" | "json") => {
    if (!selectedTable) return;
    const token = localStorage.getItem("aurora_token");
    const url = `${API_BASE}/api/admin/database/tables/${selectedTable}/export?format=${format}${token ? `&token=${encodeURIComponent(token)}` : ""}`;
    window.open(url, "_blank");
  };

  // 删除行
  const deleteRowAction = async () => {
    if (!selectedTable || !deletingRowPk) return;
    setActionLoading(true);
    try {
      await apiDelete(
        `/api/admin/database/tables/${selectedTable}/rows/${encodeURIComponent(deletingRowPk)}`,
      );
      setDeletingRowPk(null);
      void fetchRows();
      void fetchTables(); // 行数已变更
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "删除行失败");
    } finally {
      setActionLoading(false);
    }
  };

  // 保存行编辑
  const saveRowEdit = async () => {
    if (!selectedTable || !editingRow || !tableSchema?.pk_column) return;
    const pk = String(editingRow[tableSchema.pk_column]);
    setActionLoading(true);
    setEditError(null);
    try {
      await apiPatch(
        `/api/admin/database/tables/${selectedTable}/rows/${encodeURIComponent(pk)}`,
        {
          changes: editPayload,
        },
      );
      setEditingRow(null);
      void fetchRows();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "保存行修改失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditClick = (row: Record<string, unknown>) => {
    setEditingRow(row);
    // 过滤掉主键列，因为主键不可更改
    const pk = tableSchema?.pk_column;
    const payload: Record<string, unknown> = {};
    Object.entries(row).forEach(([k, v]) => {
      if (k !== pk) payload[k] = v;
    });
    setEditPayload(payload);
    setEditError(null);
  };

  const handleSort = (column: string) => {
    if (orderBy === column) {
      setOrderDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setOrderBy(column);
      setOrderDir("desc");
    }
  };

  return (
    <div className="p-8 max-w-[1200px] min-h-0 flex flex-col h-full gap-4">
      {/* 标题头部 */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1
            className="font-serif-italic text-[36px] mb-1"
            style={{ color: "var(--ink-primary)" }}
          >
            数据库管理
          </h1>
          <p
            className="text-[13px] opacity-75"
            style={{ color: "var(--ink-secondary)" }}
          >
            直接检索及更新系统关系数据库实体，支持高级 SQL
            控制台与数据快照导出。
          </p>
        </div>
        <Button
          onClick={downloadDbSnapshot}
          className="flex items-center gap-2 border border-sky-200"
          style={{
            background: "rgba(14,165,233,0.12)",
            color: "var(--sky-700)",
          }}
        >
          <Download size={15} />
          导出数据库备份 (.db)
        </Button>
      </div>

      {/* 错误提示横幅 */}
      {error && (
        <div className="px-4 py-2 text-[13px] flex items-center justify-between rounded-xl bg-red-500/10 text-red-500 flex-shrink-0 border border-red-500/20">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="opacity-70 hover:opacity-100"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* 主布局 */}
      <div className="flex-1 grid grid-cols-[280px_1fr] gap-4 min-h-0 overflow-hidden">
        {/* 左侧：表列表 */}
        <aside className="rounded-[16px] glass-tile p-4 flex flex-col min-h-0 overflow-hidden gap-3">
          <div className="flex items-center justify-between flex-shrink-0">
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--ink-tertiary)" }}
            >
              数据库表单 ({tables?.length ?? 0})
            </span>
            <button
              onClick={() => void fetchTables()}
              className="p-1 rounded-md text-[var(--ink-tertiary)] hover:bg-[var(--hover-bg)]"
              title="刷新列表"
            >
              <RefreshCw size={13} />
            </button>
          </div>

          <div
            className="flex gap-1 p-0.5 rounded-lg flex-shrink-0"
            style={{ background: "rgba(15,30,60,0.06)" }}
          >
            <button
              onClick={() => setMainTab("table-detail")}
              className="flex-1 py-1 rounded-md text-[11px] font-semibold transition-all inline-flex items-center justify-center gap-1.5"
              style={{
                background:
                  mainTab === "table-detail"
                    ? "var(--glass-bg-strong)"
                    : "transparent",
                boxShadow:
                  mainTab === "table-detail"
                    ? "0 1px 3px rgba(0,0,0,0.05)"
                    : "none",
                color:
                  mainTab === "table-detail"
                    ? "var(--ink-primary)"
                    : "var(--ink-secondary)",
              }}
            >
              <TableProperties size={12} />
              数据表
            </button>
            <button
              onClick={() => setMainTab("sql-console")}
              className="flex-1 py-1 rounded-md text-[11px] font-semibold transition-all inline-flex items-center justify-center gap-1.5"
              style={{
                background:
                  mainTab === "sql-console"
                    ? "var(--glass-bg-strong)"
                    : "transparent",
                boxShadow:
                  mainTab === "sql-console"
                    ? "0 1px 3px rgba(0,0,0,0.05)"
                    : "none",
                color:
                  mainTab === "sql-console"
                    ? "var(--ink-primary)"
                    : "var(--ink-secondary)",
              }}
            >
              <Terminal size={12} />
              SQL 终端
            </button>
          </div>

          {/* 表滚动区域 */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {loadingTables ? (
              [0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-10 rounded-lg glass-tile animate-pulse"
                />
              ))
            ) : !tables || tables.length === 0 ? (
              <div
                className="text-[12px] text-center opacity-50 py-10"
                style={{ color: "var(--ink-tertiary)" }}
              >
                未发现数据表
              </div>
            ) : (
              tables.map((t) => {
                const active =
                  selectedTable === t.name && mainTab === "table-detail";
                return (
                  <button
                    key={t.name}
                    onClick={() => {
                      setSelectedTable(t.name);
                      setMainTab("table-detail");
                    }}
                    className="w-full text-left p-2.5 rounded-lg flex items-center justify-between text-[12.5px] transition-all cursor-pointer"
                    style={{
                      background: active
                        ? "rgba(14,165,233,0.12)"
                        : "transparent",
                      boxShadow: active
                        ? "inset 0 1px 0 rgba(255,255,255,0.4), inset 0 0 0 1px rgba(14,165,233,0.18)"
                        : undefined,
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Database
                        size={13}
                        style={{
                          color: active
                            ? "var(--sky-600)"
                            : "var(--ink-secondary)",
                        }}
                      />
                      <span
                        className="font-medium truncate"
                        style={{
                          color: active
                            ? "var(--sky-700)"
                            : "var(--ink-primary)",
                        }}
                      >
                        {t.name}
                      </span>
                    </div>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-mono font-medium"
                      style={{
                        background: "rgba(15,30,60,0.06)",
                        color: "var(--ink-secondary)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {t.row_count}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* 右侧：主详情面板 */}
        <main className="rounded-[16px] glass-tile flex flex-col min-h-0 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {/* 选项卡 1：表详情浏览器 */}
            {mainTab === "table-detail" && selectedTable && (
              <motion.div
                key="table-detail"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.12 }}
                className="flex-1 flex flex-col min-h-0 overflow-hidden"
              >
                {/* 表标题栏 */}
                <div
                  className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0"
                  style={{ borderColor: "var(--divider)" }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="font-bold text-[18px]"
                      style={{ color: "var(--ink-primary)" }}
                    >
                      {selectedTable}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/10 text-[var(--sky-700)] font-semibold">
                      表详情
                    </span>
                  </div>

                  {/* 表标签页 */}
                  <div
                    className="flex rounded-lg p-0.5"
                    style={{ background: "rgba(15,30,60,0.06)" }}
                  >
                    <button
                      onClick={() => setTableTab("data")}
                      className={`px-3 py-1 rounded-md text-[11.5px] font-semibold transition-all`}
                      style={{
                        background:
                          tableTab === "data"
                            ? "var(--glass-bg-strong)"
                            : "transparent",
                        color:
                          tableTab === "data"
                            ? "var(--ink-primary)"
                            : "var(--ink-secondary)",
                      }}
                    >
                      数据浏览
                    </button>
                    <button
                      onClick={() => setTableTab("schema")}
                      className={`px-3 py-1 rounded-md text-[11.5px] font-semibold transition-all`}
                      style={{
                        background:
                          tableTab === "schema"
                            ? "var(--glass-bg-strong)"
                            : "transparent",
                        color:
                          tableTab === "schema"
                            ? "var(--ink-primary)"
                            : "var(--ink-secondary)",
                      }}
                    >
                      结构
                    </button>
                    <button
                      onClick={() => setTableTab("export")}
                      className={`px-3 py-1 rounded-md text-[11.5px] font-semibold transition-all`}
                      style={{
                        background:
                          tableTab === "export"
                            ? "var(--glass-bg-strong)"
                            : "transparent",
                        color:
                          tableTab === "export"
                            ? "var(--ink-primary)"
                            : "var(--ink-secondary)",
                      }}
                    >
                      导出
                    </button>
                  </div>
                </div>

                {/* 子选项卡面板 */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                  {/* 表子面板 1：数据浏览 */}
                  {tableTab === "data" && (
                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                      {/* 搜索与过滤 */}
                      <div
                        className="px-5 py-3 border-b flex items-center justify-between gap-4 flex-shrink-0"
                        style={{
                          borderColor: "var(--divider)",
                          background: "rgba(255,255,255,0.06)",
                        }}
                      >
                        <div className="relative max-w-[320px] flex-1">
                          <Search
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 opacity-40"
                            size={13}
                          />
                          <Input
                            placeholder={`搜索行内容…`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 text-[12px] h-8 rounded-lg"
                          />
                        </div>
                        <div
                          className="flex items-center gap-1.5 text-[11.5px]"
                          style={{ color: "var(--ink-tertiary)" }}
                        >
                          <span>主键：</span>
                          <span className="font-mono bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded font-semibold text-[var(--ink-primary)]">
                            {tableSchema?.pk_column || "无"}
                          </span>
                        </div>
                      </div>

                      {/* 主分页数据表格 */}
                      <div className="flex-1 overflow-auto min-h-0 relative">
                        {loadingRows ? (
                          <div className="absolute inset-0 bg-white/10 dark:bg-black/10 backdrop-blur-[2px] flex items-center justify-center z-[15]">
                            <RefreshCw
                              size={24}
                              className="animate-spin text-[var(--sky-600)]"
                            />
                          </div>
                        ) : null}

                        {!rowsPage || rowsPage.rows.length === 0 ? (
                          <div
                            className="h-full flex flex-col items-center justify-center p-8 text-center text-[12.5px]"
                            style={{ color: "var(--ink-secondary)" }}
                          >
                            <TableProperties
                              size={28}
                              className="opacity-30 mb-2"
                            />
                            暂无行记录。
                          </div>
                        ) : (
                          <table className="w-full text-left text-[12.5px] border-collapse min-w-max">
                            <thead
                              className="sticky top-0 z-[10]"
                              style={{
                                background: "var(--glass-bg-strong)",
                                backdropFilter: "blur(10px)",
                              }}
                            >
                              <tr
                                className="border-b"
                                style={{ borderColor: "var(--divider)" }}
                              >
                                <th
                                  className="px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold"
                                  style={{ color: "var(--ink-tertiary)" }}
                                >
                                  操作
                                </th>
                                {rowsPage.columns.map((col) => {
                                  const sorting = orderBy === col;
                                  return (
                                    <th
                                      key={col}
                                      onClick={() => handleSort(col)}
                                      className="px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold cursor-pointer hover:bg-[var(--hover-bg)] transition-colors select-none"
                                      style={{ color: "var(--ink-primary)" }}
                                    >
                                      <div className="flex items-center gap-1">
                                        {col}
                                        {sorting && (
                                          <span className="text-[9px] text-[var(--sky-600)]">
                                            {orderDir === "asc" ? "▲" : "▼"}
                                          </span>
                                        )}
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {rowsPage.rows.map((row, idx) => {
                                const pk = tableSchema?.pk_column
                                  ? String(row[tableSchema.pk_column])
                                  : null;
                                return (
                                  <tr
                                    key={pk || idx}
                                    className="border-b hover:bg-[var(--hover-bg)] transition-colors"
                                    style={{ borderColor: "var(--divider)" }}
                                  >
                                    <td className="px-4 py-2 text-[12px] flex items-center gap-1.5">
                                      <button
                                        onClick={() => handleEditClick(row)}
                                        disabled={!tableSchema?.pk_column}
                                        className="p-1 rounded hover:bg-sky-500/10 text-sky-500 disabled:opacity-30 transition-colors"
                                        title="修改本行"
                                      >
                                        <Edit3 size={12} />
                                      </button>
                                      <button
                                        onClick={() => setDeletingRowPk(pk)}
                                        disabled={!tableSchema?.pk_column}
                                        className="p-1 rounded hover:bg-red-500/10 text-red-500 disabled:opacity-30 transition-colors"
                                        title="删除本行"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </td>
                                    {rowsPage.columns.map((col) => {
                                      const isPk =
                                        tableSchema?.pk_column === col;
                                      const val = row[col];
                                      return (
                                        <td
                                          key={col}
                                          className={`px-4 py-2 font-mono text-[11.5px] truncate max-w-[240px]`}
                                          style={{
                                            color: isPk
                                              ? "var(--sky-700)"
                                              : "var(--ink-primary)",
                                            fontWeight: isPk ? 600 : 400,
                                          }}
                                          title={
                                            val !== null ? String(val) : "NULL"
                                          }
                                        >
                                          {val === null ? (
                                            <span className="opacity-30 text-[10px] italic">
                                              NULL
                                            </span>
                                          ) : typeof val === "object" ? (
                                            JSON.stringify(val)
                                          ) : (
                                            String(val)
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {/* 分页控件 */}
                      {rowsPage && rowsPage.total > 20 && (
                        <div
                          className="px-5 py-3 border-t flex items-center justify-between flex-shrink-0"
                          style={{ borderColor: "var(--divider)" }}
                        >
                          <span
                            className="text-[11.5px]"
                            style={{ color: "var(--ink-secondary)" }}
                          >
                            共{" "}
                            <strong style={{ color: "var(--ink-primary)" }}>
                              {rowsPage.total}
                            </strong>{" "}
                            条记录，当前展示第{" "}
                            <strong style={{ color: "var(--ink-primary)" }}>
                              {(currentPage - 1) * 20 + 1}-
                              {Math.min(currentPage * 20, rowsPage.total)}
                            </strong>{" "}
                            条
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setCurrentPage((p) => Math.max(1, p - 1))
                              }
                              disabled={currentPage === 1}
                              className="h-7 w-7 p-0 flex items-center justify-center rounded-md"
                            >
                              <ChevronLeft size={13} />
                            </Button>
                            <span className="text-[12px] px-2 font-medium">
                              {currentPage} / {Math.ceil(rowsPage.total / 20)}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setCurrentPage((p) =>
                                  Math.min(
                                    Math.ceil(rowsPage.total / 20),
                                    p + 1,
                                  ),
                                )
                              }
                              disabled={currentPage * 20 >= rowsPage.total}
                              className="h-7 w-7 p-0 flex items-center justify-center rounded-md"
                            >
                              <ChevronRight size={13} />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 表子面板 2：表结构列信息 */}
                  {tableTab === "schema" && tableSchema && (
                    <div className="flex-1 overflow-y-auto p-5">
                      <div
                        className="text-[11px] font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5"
                        style={{ color: "var(--ink-tertiary)" }}
                      >
                        <Columns size={12} />
                        表数据结构列信息
                      </div>
                      <div
                        className="border rounded-[12px] overflow-hidden"
                        style={{
                          borderColor: "var(--divider)",
                          background: "rgba(255,255,255,0.02)",
                        }}
                      >
                        <table className="w-full text-left text-[12.5px] border-collapse">
                          <thead>
                            <tr
                              className="border-b"
                              style={{
                                borderColor: "var(--divider)",
                                background: "rgba(15,30,60,0.03)",
                              }}
                            >
                              <th
                                className="px-4 py-2 font-semibold"
                                style={{ color: "var(--ink-primary)" }}
                              >
                                列名
                              </th>
                              <th
                                className="px-4 py-2 font-semibold"
                                style={{ color: "var(--ink-primary)" }}
                              >
                                类型
                              </th>
                              <th
                                className="px-4 py-2 font-semibold"
                                style={{ color: "var(--ink-primary)" }}
                              >
                                可为空
                              </th>
                              <th
                                className="px-4 py-2 font-semibold"
                                style={{ color: "var(--ink-primary)" }}
                              >
                                默认值
                              </th>
                              <th
                                className="px-4 py-2 font-semibold"
                                style={{ color: "var(--ink-primary)" }}
                              >
                                敏感脱敏
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {tableSchema.columns.map((c) => {
                              const isPk = tableSchema.pk_column === c.name;
                              return (
                                <tr
                                  key={c.name}
                                  className="border-b last:border-b-0 hover:bg-[var(--hover-bg)]"
                                  style={{ borderColor: "var(--divider)" }}
                                >
                                  <td className="px-4 py-2 font-semibold">
                                    <div className="flex items-center gap-1.5 font-mono">
                                      {c.name}
                                      {isPk && (
                                        <span className="text-[9px] px-1 py-0.2 rounded font-bold bg-amber-500/10 text-amber-600">
                                          PK 主键
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 font-mono text-[12px]">
                                    {c.type}
                                  </td>
                                  <td className="px-4 py-2 font-mono text-[12px]">
                                    {c.nullable ? "YES" : "NO"}
                                  </td>
                                  <td className="px-4 py-2 font-mono text-[12px] text-gray-500">
                                    {c.default_value === null ? (
                                      <span className="opacity-30 italic">
                                        none
                                      </span>
                                    ) : (
                                      c.default_value
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-[12px]">
                                    {c.sensitive ? (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-500">
                                        已屏蔽
                                      </span>
                                    ) : (
                                      <span className="opacity-40 text-gray-400">
                                        公开
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 表子面板 3：表导出 */}
                  {tableTab === "export" && (
                    <div className="flex-1 overflow-y-auto p-6 max-w-[500px] space-y-5">
                      <div>
                        <h3 className="font-semibold text-[14px] mb-1">
                          导出该表单
                        </h3>
                        <p
                          className="text-[12px]"
                          style={{ color: "var(--ink-secondary)" }}
                        >
                          您可以选择将该表的内容导出为 CSV 文件或 JSON
                          数组格式。所有敏感的列值（例如密码哈希）都已在后台自动进行脱敏处理。
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => downloadTableExport("csv")}
                          className="flex flex-col items-center justify-center p-5 rounded-2xl glass-tile cursor-pointer hover:-translate-y-0.5 transition-transform"
                          style={{ border: "1px solid var(--divider)" }}
                        >
                          <FileSpreadsheet
                            size={32}
                            className="text-green-600 mb-2"
                          />
                          <span className="font-bold text-[13px]">
                            导出 CSV 格式
                          </span>
                          <span className="text-[10px] opacity-60 mt-1">
                            方便 Excel 浏览
                          </span>
                        </button>

                        <button
                          onClick={() => downloadTableExport("json")}
                          className="flex flex-col items-center justify-center p-5 rounded-2xl glass-tile cursor-pointer hover:-translate-y-0.5 transition-transform"
                          style={{ border: "1px solid var(--divider)" }}
                        >
                          <FileJson size={32} className="text-amber-500 mb-2" />
                          <span className="font-bold text-[13px]">
                            导出 JSON 格式
                          </span>
                          <span className="text-[10px] opacity-60 mt-1">
                            方便开发调用
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* 选项卡 2：原始 SQL 控制台 */}
            {mainTab === "sql-console" && (
              <motion.div
                key="sql-console"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.12 }}
                className="flex-1 flex flex-col min-h-0 overflow-hidden p-5 gap-4"
              >
                <div>
                  <h2
                    className="text-[18px] font-bold mb-0.5"
                    style={{ color: "var(--ink-primary)" }}
                  >
                    SQL 控制台
                  </h2>
                  <p
                    className="text-[12px] opacity-75"
                    style={{ color: "var(--ink-secondary)" }}
                  >
                    输入并执行原生 SQL 查询。所有查询默认均在事务中运行。
                  </p>
                </div>

                {/* SQL 编辑器外壳 */}
                <div
                  className="flex-shrink-0 flex flex-col gap-2 rounded-xl border p-3"
                  style={{
                    borderColor: "var(--divider)",
                    background: "rgba(0,0,0,0.04)",
                  }}
                >
                  <div className="flex items-center justify-between text-[12px]">
                    <div
                      className="flex items-center gap-1 font-mono font-bold"
                      style={{ color: "var(--ink-tertiary)" }}
                    >
                      <Terminal size={12} />
                      SQL INPUT
                    </div>
                    {/* 模式切换 */}
                    <div className="flex items-center gap-2">
                      <span className="opacity-60 text-[11px]">执行模式:</span>
                      <div className="flex rounded-md p-0.5 bg-black/5 dark:bg-white/5 border border-[var(--divider)]">
                        <button
                          onClick={() => setSqlMode("read")}
                          className="px-2 py-0.5 rounded text-[11px] font-medium"
                          style={{
                            background:
                              sqlMode === "read"
                                ? "var(--glass-bg-strong)"
                                : "transparent",
                            color:
                              sqlMode === "read"
                                ? "var(--ink-primary)"
                                : "var(--ink-secondary)",
                          }}
                        >
                          只读 (SELECT)
                        </button>
                        <button
                          onClick={() => setSqlMode("write")}
                          className="px-2 py-0.5 rounded text-[11px] font-medium"
                          style={{
                            background:
                              sqlMode === "write"
                                ? "var(--glass-bg-strong)"
                                : "transparent",
                            color:
                              sqlMode === "write"
                                ? "var(--ink-primary)"
                                : "var(--ink-secondary)",
                          }}
                        >
                          写修改 / DDL
                        </button>
                      </div>
                    </div>
                  </div>

                  <textarea
                    value={sqlText}
                    onChange={(e) => setSqlText(e.target.value)}
                    className="w-full bg-transparent border-0 outline-none text-[13px] font-mono p-1 h-[100px] resize-none"
                    style={{ color: "var(--ink-primary)" }}
                    placeholder="请输入 SQL 命令并运行…"
                  />

                  <div className="flex justify-between items-center pt-2 border-t border-[var(--divider)]">
                    <div className="flex items-center gap-1 text-[11px] opacity-50">
                      <HelpCircle size={11} />
                      提示: 支持 SQLite 语法。
                    </div>
                    <Button
                      size="sm"
                      onClick={() => runSqlQuery(false)}
                      disabled={sqlLoading || !sqlText.trim()}
                      className="gap-1.5"
                    >
                      {sqlLoading ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        <Play size={12} fill="currentColor" strokeWidth={0} />
                      )}
                      {sqlLoading ? "执行中…" : "运行 SQL"}
                    </Button>
                  </div>
                </div>

                {/* SQL 控制台错误横幅 */}
                {sqlError && (
                  <div className="p-3 text-[12.5px] rounded-lg border border-red-500/20 bg-red-500/5 text-red-500 font-mono flex-shrink-0">
                    {sqlError}
                  </div>
                )}

                {/* 查询结果面板 */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div
                    className="text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center justify-between flex-shrink-0"
                    style={{ color: "var(--ink-tertiary)" }}
                  >
                    <span>结果输出</span>
                    {sqlResult && (
                      <span
                        className="font-mono text-[10px]"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        受影响行数: {sqlResult.rowcount} · 耗时:{" "}
                        {sqlResult.elapsed_ms}ms
                        {sqlResult.truncated && " (已截断至前 5000 条结果)"}
                      </span>
                    )}
                  </div>

                  <div
                    className="flex-1 overflow-auto rounded-xl border min-h-0 bg-black/5 dark:bg-white/5"
                    style={{ borderColor: "var(--divider)" }}
                  >
                    {!sqlResult ? (
                      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[12px] opacity-40">
                        等待执行查询以获取输出
                      </div>
                    ) : sqlResult.columns.length === 0 ? (
                      <div className="p-4 flex items-center gap-2 text-[12.5px] text-green-600">
                        <Check size={16} />
                        SQL 执行成功。受影响行数: {sqlResult.rowcount}
                      </div>
                    ) : (
                      <table className="w-full text-left text-[12px] border-collapse min-w-max">
                        <thead className="sticky top-0 bg-[var(--glass-bg-strong)] backdrop-blur-md">
                          <tr
                            className="border-b"
                            style={{ borderColor: "var(--divider)" }}
                          >
                            {sqlResult.columns.map((col) => (
                              <th
                                key={col}
                                className="px-3 py-2 font-mono font-semibold"
                                style={{ color: "var(--ink-primary)" }}
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sqlResult.rows.map((row, idx) => (
                            <tr
                              key={idx}
                              className="border-b last:border-b-0 hover:bg-[var(--hover-bg)]"
                              style={{ borderColor: "var(--divider)" }}
                            >
                              {row.map((val, colIdx) => (
                                <td
                                  key={colIdx}
                                  className="px-3 py-1.5 font-mono text-[11px]"
                                  style={{ color: "var(--ink-primary)" }}
                                >
                                  {val === null ? (
                                    <span className="opacity-30 italic">
                                      NULL
                                    </span>
                                  ) : typeof val === "object" ? (
                                    JSON.stringify(val)
                                  ) : (
                                    String(val)
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 编辑对话框模态框 */}
          <AnimatePresence>
            {editingRow && tableSchema && (
              <div className="absolute inset-0 z-30 bg-black/20 dark:bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
                <div
                  className="glass-window max-w-[480px] w-full rounded-2xl p-6 flex flex-col gap-4 shadow-2xl relative"
                  style={{ maxHeight: "90%" }}
                >
                  <button
                    onClick={() => setEditingRow(null)}
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-[var(--ink-tertiary)] hover:bg-[var(--hover-bg)]"
                  >
                    <X size={15} />
                  </button>

                  <div>
                    <h3 className="font-bold text-[16px] mb-0.5">修改数据行</h3>
                    <p
                      className="text-[11.5px] opacity-75"
                      style={{ color: "var(--ink-secondary)" }}
                    >
                      主键 ({tableSchema.pk_column}) 值:{" "}
                      <span
                        className="font-mono font-bold"
                        style={{ color: "var(--sky-700)" }}
                      >
                        {String(editingRow[tableSchema.pk_column!])}
                      </span>
                    </p>
                  </div>

                  {editError && (
                    <div className="p-2 text-[12px] bg-red-500/10 text-red-500 rounded-lg">
                      {editError}
                    </div>
                  )}

                  {/* 可滚动的表单字段 */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 py-1">
                    {tableSchema.columns
                      .filter((c) => c.name !== tableSchema.pk_column)
                      .map((c) => (
                        <div key={c.name} className="flex flex-col gap-1">
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wider"
                            style={{ color: "var(--ink-tertiary)" }}
                          >
                            {c.name}{" "}
                            <span className="font-mono lowercase opacity-50">
                              ({c.type})
                            </span>
                          </span>
                          <Input
                            value={
                              editPayload[c.name] === null
                                ? ""
                                : String(editPayload[c.name])
                            }
                            onChange={(e) =>
                              setEditPayload({
                                ...editPayload,
                                [c.name]: e.target.value,
                              })
                            }
                            className="text-[12.5px] font-mono h-8.5 rounded-lg"
                            placeholder={c.nullable ? "NULL" : "无"}
                          />
                        </div>
                      ))}
                  </div>

                  <div
                    className="flex items-center justify-end gap-2 pt-2 border-t"
                    style={{ borderColor: "var(--divider)" }}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingRow(null)}
                      disabled={actionLoading}
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      onClick={saveRowEdit}
                      disabled={actionLoading}
                    >
                      {actionLoading ? "保存中…" : "保存修改"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>

          {/* 删除行确认对话框 */}
          <AnimatePresence>
            {deletingRowPk && (
              <div className="absolute inset-0 z-30 bg-black/20 dark:bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
                <div className="glass-window max-w-[380px] w-full rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-red-500/10 text-red-500">
                      <Trash2 size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-[15px] mb-0.5">
                        确认删除该行？
                      </h3>
                      <p
                        className="text-[12px] leading-relaxed"
                        style={{ color: "var(--ink-secondary)" }}
                      >
                        您即将删除表{" "}
                        <strong style={{ color: "var(--ink-primary)" }}>
                          {selectedTable}
                        </strong>{" "}
                        中主键值为{" "}
                        <strong
                          className="font-mono"
                          style={{ color: "var(--ink-primary)" }}
                        >
                          {deletingRowPk}
                        </strong>{" "}
                        的数据行。此操作不可撤销，请谨慎操作。
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeletingRowPk(null)}
                      disabled={actionLoading}
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      className="bg-red-500 hover:bg-red-600 text-white"
                      onClick={deleteRowAction}
                      disabled={actionLoading}
                    >
                      {actionLoading ? "删除中…" : "确认删除"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>

          {/* SQL 写入确认对话框 */}
          <AnimatePresence>
            {showSqlConfirm && (
              <div className="absolute inset-0 z-30 bg-black/20 dark:bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4">
                <div className="glass-window max-w-[380px] w-full rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-red-500/10 text-red-500">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-[15px] mb-0.5">
                        危险操作确认
                      </h3>
                      <p
                        className="text-[12px] leading-relaxed"
                        style={{ color: "var(--ink-secondary)" }}
                      >
                        当前检测到您处于 "写修改 / DDL" 模式，输入的 SQL
                        将直接更改数据库的数据或结构。错误的指令可能导致数据损毁。请确认这完全符合预期。
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowSqlConfirm(false)}
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      className="bg-red-500 hover:bg-red-600 text-white"
                      onClick={() => runSqlQuery(true)}
                    >
                      确认执行 SQL
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
