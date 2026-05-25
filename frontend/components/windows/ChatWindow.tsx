"use client";

/**
 * ChatWindow —— Aether OS 的核心组件。
 *
 * WindowFrame 主体内的布局：
 *   left:  会话列表（同一智能体下的关联会话）
 *   main:  消息流 + 输入框
 *
 * 每个 ChatWindow 实例：
 *   - 拥有自己的 AbortController 用于流式传输
 *   - 拥有自己的消息列表、滚动位置、草稿文本
 *   - 从 win.props.conversationId 读取会话 ID
 *
 * 后端接口约定：
 *   GET    /api/conversations                 列出会话（客户端按智能体过滤）
 *   GET    /api/conversations/{id}            加载详情（消息 + 智能体元数据）
 *   POST   /api/conversations                 创建新会话（body: {agent_id}）
 *   DELETE /api/conversations/{id}
 *   PATCH  /api/messages/{id}                 编辑消息
 *   DELETE /api/messages/{id}
 *   POST   /api/chat/{convId} (SSE)           发送 + 流式接收
 *   POST   /api/chat/{convId}/regenerate (SSE)
 */

import * as React from "react";
import type { OsWindow } from "@/stores/windows";
import {
  apiGet,
  apiPost,
  apiDelete,
  apiPut,
  streamChat,
  streamRegenerate,
  API_BASE,
  type Attachment,
} from "@/lib/api";
import type {
  Conversation,
  ConversationDetail,
  Message,
  ModelOption,
} from "@/lib/types";
import { useWindowStore, openChatWindow } from "@/stores/windows";
import { useTheme } from "@/components/theme/GlassThemeProvider";
import { useAuth } from "@/contexts/AuthContext";
import { irisPalette, toneForKey } from "@/components/theme/tokens";
import {
  ChatContent,
  parseThinkContent,
  ThinkingSection,
} from "./chat/ChatContent";
import { Composer } from "./chat/Composer";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Copy,
  Pencil,
  RefreshCw,
  X,
  Check,
  MessagesSquare,
  ChevronDown,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface ChatWindowProps {
  win: OsWindow;
}

export function ChatWindow({ win }: ChatWindowProps) {
  const convId = win.props.conversationId;
  if (!convId) {
    return <EmptyConversation />;
  }
  return <ChatBody win={win} conversationId={convId} key={win.id} />;
}

function EmptyConversation() {
  const open = useWindowStore((s) => s.open);
  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-10 text-center">
      <MessagesSquare
        size={40}
        strokeWidth={1.4}
        style={{ color: "var(--ink-tertiary)" }}
      />
      <div
        className="font-serif-italic text-[22px] mt-4"
        style={{ color: "var(--ink-primary)" }}
      >
        还没有打开任何会话
      </div>
      <div
        className="text-[13px] mt-1.5"
        style={{ color: "var(--ink-secondary)" }}
      >
        从 Dock 或 智能体市场 选择一位伙伴开始
      </div>
      <button
        onClick={() => open("agents", { id: "agents" })}
        className="mt-5 px-4 py-2 rounded-lg text-[13px] font-medium text-white"
        style={{ background: "var(--sky-500)" }}
      >
        浏览智能体
      </button>
    </div>
  );
}

interface ChatBodyProps {
  win: OsWindow;
  conversationId: string;
}

function ChatBody({ win, conversationId }: ChatBodyProps) {
  const setTitle = useWindowStore((s) => s.setTitle);
  const close = useWindowStore((s) => s.close);
  const { effectiveMode: _mode } = useTheme();
  void _mode;

  const [detail, setDetail] = React.useState<ConversationDetail | null>(null);
  const [siblings, setSiblings] = React.useState<Conversation[]>([]);
  const [models, setModels] = React.useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [streamBuffer, setStreamBuffer] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingDraft, setEditingDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  const isMountedRef = React.useRef(true);
  const streamTargetRef = React.useRef("");
  const streamCurrentRef = React.useRef("");
  const typewriterActiveRef = React.useRef(false);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const runTypewriterRef = React.useRef<() => void>(() => {});

  const runTypewriter = React.useCallback(() => {
    if (!isMountedRef.current || !typewriterActiveRef.current) {
      typewriterActiveRef.current = false;
      return;
    }
    if (streamCurrentRef.current.length < streamTargetRef.current.length) {
      const remaining =
        streamTargetRef.current.length - streamCurrentRef.current.length;
      let charsToAppend = 1;
      if (remaining > 50) charsToAppend = 5;
      else if (remaining > 20) charsToAppend = 3;
      else if (remaining > 8) charsToAppend = 2;

      streamCurrentRef.current += streamTargetRef.current.slice(
        streamCurrentRef.current.length,
        streamCurrentRef.current.length + charsToAppend,
      );
      setStreamBuffer(streamCurrentRef.current);

      setDetail((prev) => {
        if (!prev) return prev;
        const msgs = [...prev.messages];
        const idx = msgs.findIndex((m) => m.id === "streaming-assistant");
        if (idx !== -1) {
          msgs[idx] = { ...msgs[idx], content: streamCurrentRef.current };
        }
        return { ...prev, messages: msgs };
      });

      const delay = remaining > 15 ? 12 : 28;
      setTimeout(() => {
        runTypewriterRef.current();
      }, delay);
    } else {
      typewriterActiveRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    runTypewriterRef.current = runTypewriter;
  }, [runTypewriter]);

  const appendStreamContent = React.useCallback(
    (content: string) => {
      streamTargetRef.current += content;
      if (!typewriterActiveRef.current) {
        typewriterActiveRef.current = true;
        runTypewriter();
      }
    },
    [runTypewriter],
  );

  const resetTypewriter = React.useCallback(() => {
    streamTargetRef.current = "";
    streamCurrentRef.current = "";
    typewriterActiveRef.current = false;
    setStreamBuffer("");
  }, []);

  // 加载会话 + 关联会话列表 + 模型列表
  React.useEffect(() => {
    let cancelled = false;

    if (detail) {
      setLoadingDetail(true);
    }

    const timer = setTimeout(() => {
      if (cancelled) return;
      if (!detail) {
        setDetail(null);
      }
      setDraft("");
      setStreaming(false);
      setEditingId(null);
      setEditingDraft("");
      setError(null);
      resetTypewriter();
    }, 0);

    void (async () => {
      try {
        const d = await apiGet<ConversationDetail>(
          `/api/conversations/${conversationId}`,
        );
        if (cancelled) return;
        setDetail(d);
        setSelectedModel(d.conversation.model_id);
        setLoadingDetail(false);

        // 使用智能体名称更新窗口标题
        if (d.conversation.agent_name) {
          setTitle(win.id, "Aether OS", d.conversation.agent_name);
        }

        // 加载同一智能体的关联会话
        const all = await apiGet<Conversation[]>("/api/conversations");
        if (cancelled) return;
        setSiblings(
          all.filter((c) => c.agent_name === d.conversation.agent_name),
        );

        // 加载模型选项
        if (d.conversation.agent_id) {
          try {
            const ms = await apiGet<ModelOption[]>(
              `/api/agents/${d.conversation.agent_id}/models`,
            );
            if (!cancelled) setModels(ms);
          } catch {
            /* 忽略错误 */
          }
        }
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "会话加载失败");
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      abortRef.current?.abort();
      typewriterActiveRef.current = false;
    };
  }, [conversationId, setTitle, win.id, resetTypewriter]);

  // 新消息 / 流式接收时自动滚动
  const lastMsgCountRef = React.useRef(0);
  React.useEffect(() => {
    const s = scrollerRef.current;
    if (!s) return;
    const msgCount = detail?.messages.length ?? 0;
    const isNewMessage = msgCount !== lastMsgCountRef.current;
    lastMsgCountRef.current = msgCount;

    if (isNewMessage) {
      s.scrollTop = s.scrollHeight;
    } else {
      const threshold = 100;
      const isNearBottom =
        s.scrollHeight - s.clientHeight - s.scrollTop < threshold;
      if (isNearBottom) {
        s.scrollTop = s.scrollHeight;
      }
    }
  }, [detail?.messages.length, streamBuffer]);

  const sendMessage = async (text: string, attachments: Attachment[]) => {
    if (!text.trim() && attachments.length === 0) return;
    if (!detail) return;
    const userMsg: Message = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: text,
      attachments: attachments.length ? attachments : null,
      created_at: new Date().toISOString(),
    };
    const assistantMsg: Message = {
      id: "streaming-assistant",
      role: "agent",
      content: "",
      created_at: new Date().toISOString(),
    };
    setDetail({
      ...detail,
      messages: [...detail.messages, userMsg, assistantMsg],
    });
    setDraft("");
    setStreaming(true);
    resetTypewriter();
    setError(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      for await (const chunk of streamChat(
        conversationId,
        text,
        selectedModel ?? undefined,
        {
          attachments,
          signal: ctrl.signal,
        },
      )) {
        if (chunk.error) {
          setError(chunk.error);
          break;
        }
        if (chunk.content) {
          appendStreamContent(chunk.content);
        }
        if (chunk.done) break;
      }
      // 等待打字机完成所有缓冲文本的输出
      while (typewriterActiveRef.current) {
        await new Promise((r) => setTimeout(r, 20));
      }
      // 从服务器重新加载获取权威 ID
      const d = await apiGet<ConversationDetail>(
        `/api/conversations/${conversationId}`,
      );
      setDetail(d);
      resetTypewriter();
      // 刷新关联会话列表（可能有新标题）
      try {
        const all = await apiGet<Conversation[]>("/api/conversations");
        setSiblings(
          all.filter((c) => c.agent_name === d.conversation.agent_name),
        );
      } catch {
        /* 忽略错误 */
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // 已成功中止
      } else {
        setError(e instanceof Error ? e.message : "消息发送失败");
      }
    } finally {
      setStreaming(false);
      typewriterActiveRef.current = false;
      abortRef.current = null;
    }
  };

  const stopStream = () => {
    abortRef.current?.abort();
    typewriterActiveRef.current = false;
  };

  const regenerate = async () => {
    if (!detail) return;
    setStreaming(true);
    resetTypewriter();
    const msgs = [...detail.messages];
    if (msgs.length > 0 && msgs[msgs.length - 1].role === "agent") {
      msgs[msgs.length - 1] = {
        id: "streaming-assistant",
        role: "agent",
        content: "",
        created_at: new Date().toISOString(),
      };
    } else {
      msgs.push({
        id: "streaming-assistant",
        role: "agent",
        content: "",
        created_at: new Date().toISOString(),
      });
    }
    setDetail({ ...detail, messages: msgs });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      for await (const chunk of streamRegenerate(conversationId, {
        signal: ctrl.signal,
      })) {
        if (chunk.error) {
          setError(chunk.error);
          break;
        }
        if (chunk.content) {
          appendStreamContent(chunk.content);
        }
        if (chunk.done) break;
      }
      // 等待打字机完成所有缓冲文本的输出
      while (typewriterActiveRef.current) {
        await new Promise((r) => setTimeout(r, 20));
      }
      const d = await apiGet<ConversationDetail>(
        `/api/conversations/${conversationId}`,
      );
      setDetail(d);
      resetTypewriter();
    } catch (e: unknown) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : "重新生成失败");
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const deleteMessage = async (id: string) => {
    if (!detail) return;
    try {
      await apiDelete(`/api/messages/${id}`);
      setDetail({
        ...detail,
        messages: detail.messages.filter((m) => m.id !== id),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const saveEdit = async () => {
    if (!editingId || !detail) return;
    try {
      await apiPut(`/api/messages/${editingId}`, { content: editingDraft });
      setDetail({
        ...detail,
        messages: detail.messages.map((m) =>
          m.id === editingId ? { ...m, content: editingDraft } : m,
        ),
      });
      setEditingId(null);
      setEditingDraft("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    }
  };

  const createNew = async () => {
    if (!detail?.conversation.agent_id) return;
    try {
      const c = await apiPost<{ id: string }>("/api/conversations", {
        agent_id: detail.conversation.agent_id,
      });
      openChatWindow(
        c.id,
        detail.conversation.agent_name ?? "对话",
        detail.conversation.agent_id,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "新建会话失败");
    }
  };

  const deleteConv = async (id: string) => {
    try {
      await apiDelete(`/api/conversations/${id}`);
      const updatedSiblings = siblings.filter((c) => c.id !== id);
      setSiblings(updatedSiblings);
      if (id === conversationId) {
        if (updatedSiblings.length > 0) {
          const deletedIndex = siblings.findIndex((c) => c.id === id);
          const nextIndex =
            deletedIndex >= updatedSiblings.length
              ? updatedSiblings.length - 1
              : deletedIndex;
          const nextConv = updatedSiblings[nextIndex];
          openChatWindow(
            nextConv.id,
            agentName,
            nextConv.agent_id ?? undefined,
          );
        } else {
          close(win.id);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "删除失败");
    }
  };

  const fallbackAgentName = win.subtitle || "智能体";
  const agentName = detail?.conversation.agent_name ?? fallbackAgentName;
  const agentId = detail?.conversation.agent_id ?? win.props.agentId;
  const tone = toneForKey(agentId ?? agentName);
  const [c1, c2] = irisPalette[tone];

  return (
    <div className="h-full w-full grid grid-cols-[240px_minmax(0,1fr)] min-h-0">
      {/* 侧边栏 */}
      <aside
        className="flex flex-col overflow-y-auto py-3 px-2.5 gap-0.5 min-h-0"
        style={{
          borderRight: "1px solid var(--divider)",
          background: "rgba(255,255,255,0.18)",
        }}
      >
        <button
          onClick={createNew}
          disabled={!detail}
          className="flex items-center justify-center gap-1.5 text-[12.5px] font-medium mx-1 mb-2 py-2 rounded-lg transition-colors text-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background:
              "linear-gradient(135deg, var(--sky-400) 0%, var(--sky-600) 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.32), 0 2px 6px rgba(14,165,233,0.18)",
          }}
        >
          <Plus size={14} strokeWidth={2.2} />
          新对话
        </button>
        <SectionHeader>与 {agentName} 的会话</SectionHeader>
        {siblings.length === 0 && !detail ? (
          <div
            className="text-[11.5px] px-3 py-3 animate-pulse"
            style={{ color: "var(--ink-tertiary)" }}
          >
            加载中…
          </div>
        ) : siblings.length === 0 ? (
          <div
            className="text-[11.5px] px-3 py-3"
            style={{ color: "var(--ink-tertiary)" }}
          >
            暂无
          </div>
        ) : (
          siblings.map((c) => (
            <SiblingItem
              key={c.id}
              conv={c}
              active={c.id === conversationId}
              tone={tone}
              onClick={() => {
                if (c.id !== conversationId)
                  openChatWindow(c.id, agentName, c.agent_id ?? undefined);
              }}
              onDelete={() => deleteConv(c.id)}
            />
          ))
        )}
      </aside>

      {/* 主区域 */}
      <section className="flex flex-col min-h-0 min-w-0">
        {!detail ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            {error ? (
              <div
                className="text-[14px] font-medium"
                style={{ color: "var(--color-danger)" }}
              >
                {error}
              </div>
            ) : (
              <div
                className="text-[13px] animate-pulse"
                style={{ color: "var(--ink-tertiary)" }}
              >
                正在加载会话…
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 标题栏 */}
            <div
              className="flex items-center gap-3 px-6 py-3.5"
              style={{ borderBottom: "1px solid var(--divider)" }}
            >
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center text-white font-bold text-[14px]"
                style={{
                  background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.32), 0 3px 8px rgba(30,60,120,0.18)",
                }}
              >
                {detail.conversation.agent_avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={detail.conversation.agent_avatar}
                    alt={agentName}
                    className="w-full h-full object-cover rounded-[10px]"
                  />
                ) : (
                  agentName.charAt(0)
                )}
              </div>
              <div className="min-w-0">
                <div
                  className="text-[14px] font-medium leading-tight truncate"
                  style={{ color: "var(--ink-primary)" }}
                >
                  {agentName}
                </div>
                <div
                  className="text-[11.5px] truncate"
                  style={{ color: "var(--ink-tertiary)" }}
                >
                  {detail.conversation.title || "新会话"}
                </div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {models.length > 0 && (
                  <ModelPicker
                    models={models}
                    value={selectedModel}
                    onChange={setSelectedModel}
                  />
                )}
              </div>
            </div>

            {/* 消息列表 */}
            <div
              ref={scrollerRef}
              className={`flex-1 min-h-0 overflow-y-auto px-6 py-5 flex flex-col gap-3.5 transition-opacity duration-300 ${loadingDetail ? "opacity-55 pointer-events-none" : "opacity-100"}`}
            >
              {detail.greeting_message && detail.messages.length === 0 && (
                <Bubble
                  role="agent"
                  tone={tone}
                  agentName={agentName}
                  avatarUrl={detail.conversation.agent_avatar}
                >
                  <ChatContent text={detail.greeting_message} />
                </Bubble>
              )}

              {detail.messages.map((m, index) => {
                const isEdit = editingId === m.id;
                const { thinking, isThinkingComplete, remainingText } =
                  parseThinkContent(m.content);
                const hasContent =
                  remainingText.trim() !== "" ||
                  (m.attachments && m.attachments.length > 0);

                return (
                  <Bubble
                    key={`msg-${index}`}
                    role={m.role}
                    tone={tone}
                    agentName={agentName}
                    avatarUrl={detail.conversation.agent_avatar}
                    thinking={thinking}
                    isThinkingComplete={isThinkingComplete}
                    actions={
                      m.id === "streaming-assistant" ? null : (
                        <MessageActions
                          onCopy={() =>
                            navigator.clipboard.writeText(m.content)
                          }
                          onEdit={
                            m.role === "user"
                              ? () => {
                                  setEditingId(m.id);
                                  setEditingDraft(m.content);
                                }
                              : undefined
                          }
                          onDelete={() => deleteMessage(m.id)}
                        />
                      )
                    }
                  >
                    {isEdit ? (
                      <div>
                        <textarea
                          value={editingDraft}
                          onChange={(e) => setEditingDraft(e.target.value)}
                          autoFocus
                          className="w-full bg-transparent border-0 outline-none text-[13.5px] resize-y min-h-[60px]"
                          style={{ color: "inherit", fontFamily: "inherit" }}
                        />
                        <div className="flex gap-1.5 mt-2">
                          <button
                            onClick={saveEdit}
                            className="px-2.5 py-1 rounded-md text-[11.5px] font-medium text-white inline-flex items-center gap-1"
                            style={{ background: "var(--sky-500)" }}
                          >
                            <Check size={11} /> 保存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 rounded-md text-[11.5px] inline-flex items-center gap-1"
                            style={{
                              background: "var(--hover-bg)",
                              color: "var(--ink-secondary)",
                            }}
                          >
                            <X size={11} /> 取消
                          </button>
                        </div>
                      </div>
                    ) : m.id === "streaming-assistant" && !m.content ? (
                      <TypingIndicator />
                    ) : hasContent ? (
                      <>
                        {remainingText.trim() && (
                          <ChatContent
                            text={remainingText}
                            isStreaming={m.id === "streaming-assistant"}
                          />
                        )}
                        {m.attachments && m.attachments.length > 0 && (
                          <AttachmentList attachments={m.attachments} />
                        )}
                      </>
                    ) : null}
                  </Bubble>
                );
              })}
            </div>

            {/* 错误横幅 */}
            <AnimatePresence>
              {error && detail && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-6 py-2 text-[12px] flex items-center justify-between"
                  style={{
                    background: "rgba(239,68,68,0.10)",
                    color: "var(--color-danger)",
                  }}
                >
                  <span>{error}</span>
                  <button
                    onClick={() => setError(null)}
                    className="opacity-70 hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 重新生成悬浮按钮 */}
            {!streaming && detail && detail.messages.length > 0 && (
              <div className="flex justify-center mb-1.5 relative z-10">
                <button
                  onClick={regenerate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all duration-200 glass-tile hover:bg-[var(--hover-bg-strong)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] shadow-sm hover:shadow-md hover:-translate-y-px"
                  style={{
                    border: "1px solid var(--divider)",
                  }}
                >
                  <RefreshCw size={11} className="opacity-80" />
                  <span>重新生成</span>
                </button>
              </div>
            )}

            {/* 输入框 */}
            <Composer
              value={draft}
              onChange={setDraft}
              onSend={sendMessage}
              onStop={stopStream}
              uploading={false}
              streaming={streaming}
              placeholder={`发消息给 ${agentName}…  ⌘↵ 发送`}
            />
          </>
        )}
      </section>
    </div>
  );
}

// ── 子组件 ────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[10.5px] font-semibold uppercase tracking-[0.1em] px-2.5 pt-2.5 pb-1.5"
      style={{ color: "var(--ink-tertiary)" }}
    >
      {children}
    </div>
  );
}

function SiblingItem({
  conv,
  active,
  tone,
  onClick,
  onDelete,
}: {
  conv: Conversation;
  active: boolean;
  tone: keyof typeof irisPalette;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [c1, c2] = irisPalette[tone];
  return (
    <div
      onClick={onClick}
      className="group/sibling flex items-center gap-2.5 px-2 py-2 rounded-[9px] cursor-pointer transition-colors relative"
      style={{
        background: active ? "rgba(14,165,233,0.12)" : "transparent",
        boxShadow: active
          ? "inset 0 1px 0 rgba(255,255,255,0.5), inset 0 0 0 1px rgba(14,165,233,0.18)"
          : undefined,
      }}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-[2px] top-1/2 -translate-y-1/2 w-[2px] h-4 rounded"
          style={{
            background:
              "linear-gradient(180deg, var(--sky-400) 0%, var(--sky-600) 100%)",
            boxShadow: "0 0 6px rgba(14,165,233,0.55)",
          }}
        />
      )}
      <div className="flex-1 min-w-0 ml-1">
        <div
          className="text-[12.5px] font-medium leading-tight truncate"
          style={{ color: "var(--ink-primary)" }}
        >
          {conv.title || "未命名会话"}
        </div>
        <div
          className="text-[10.5px] truncate"
          style={{ color: "var(--ink-tertiary)" }}
        >
          {new Date(conv.updated_at).toLocaleDateString("zh-CN", {
            month: "numeric",
            day: "numeric",
          })}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="opacity-0 group-hover/sibling:opacity-100 p-1 rounded transition-opacity"
        style={{ color: "var(--ink-tertiary)" }}
        title="删除"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function Bubble({
  role,
  tone,
  agentName,
  avatarUrl,
  children,
  actions,
  thinking = null,
  isThinkingComplete = false,
}: {
  role: string;
  tone: keyof typeof irisPalette;
  agentName: string;
  avatarUrl: string | null;
  children: React.ReactNode;
  actions?: React.ReactNode;
  thinking?: string | null;
  isThinkingComplete?: boolean;
}) {
  const { user } = useAuth();
  const { effectiveMode } = useTheme();
  const isUser = role === "user";
  const userAvatar = isUser ? user?.avatar_url : null;
  const [c1, c2] = irisPalette[tone];
  return (
    <div
      className={`group/bubble flex flex-col gap-1.5 max-w-[78%] ${isUser ? "self-end" : "self-start"} animate-message-in`}
    >
      {/* 行 1：思考过程（在头像和气泡上方，缩进显示） */}
      {thinking !== null && !isUser && (
        <div className="pl-[36px]">
          <ThinkingSection
            thinking={thinking}
            isComplete={isThinkingComplete}
          />
        </div>
      )}

      {/* 行 2：头像和气泡框 */}
      <div
        className={`flex gap-2.5 items-start ${isUser ? "flex-row-reverse" : ""}`}
      >
        <div
          className="w-[26px] h-[26px] rounded-lg flex items-center justify-center text-[11px] font-semibold text-white flex-shrink-0 mt-0.5"
          style={
            isUser
              ? {
                  background: userAvatar
                    ? "transparent"
                    : "linear-gradient(135deg, #94A3B8 0%, #475569 100%)",
                }
              : {
                  background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(30,60,120,0.15)",
                }
          }
        >
          {isUser ? (
            userAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userAvatar}
                alt="user"
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              "你"
            )
          ) : avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={agentName}
              className="w-full h-full object-cover rounded-lg"
            />
          ) : (
            agentName.charAt(0)
          )}
        </div>

        <div className="min-w-0 flex flex-col gap-1.5 flex-1">
          {children && (
            <div
              className="px-3.5 py-2.5 text-[13.5px] leading-[1.65] break-words"
              style={{
                background: isUser
                  ? effectiveMode === "dark"
                    ? "linear-gradient(135deg, rgba(3, 105, 161, 0.35) 0%, rgba(2, 132, 199, 0.2) 100%)"
                    : "linear-gradient(135deg, rgba(125, 211, 252, 0.55) 0%, rgba(56, 189, 248, 0.35) 100%)"
                  : effectiveMode === "dark"
                    ? "rgba(20, 30, 50, 0.6)"
                    : "rgba(255, 255, 255, 0.55)",
                border: isUser
                  ? effectiveMode === "dark"
                    ? "1px solid rgba(56, 189, 248, 0.3)"
                    : "1px solid rgba(125, 211, 252, 0.65)"
                  : effectiveMode === "dark"
                    ? "1px solid rgba(255, 255, 255, 0.08)"
                    : "1px solid rgba(255, 255, 255, 0.7)",
                borderRadius: isUser
                  ? "14px 5px 14px 14px"
                  : "5px 14px 14px 14px",
                color: "var(--ink-primary)",
                backdropFilter: "blur(12px) saturate(180%)",
                WebkitBackdropFilter: "blur(12px) saturate(180%)",
                boxShadow: isUser
                  ? effectiveMode === "dark"
                    ? "inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 4px 12px rgba(0, 0, 0, 0.2)"
                    : "inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 4px 12px rgba(14, 165, 233, 0.12)"
                  : effectiveMode === "dark"
                    ? "inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 4px 12px rgba(0, 0, 0, 0.3)"
                    : "inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 4px 12px rgba(30, 60, 120, 0.08)",
              }}
            >
              {children}
            </div>
          )}
          {actions && (
            <div className="opacity-0 group-hover/bubble:opacity-100 transition-opacity">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageActions({
  onCopy,
  onEdit,
  onDelete,
}: {
  onCopy: () => void;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <ActionBtn label="复制" onClick={onCopy}>
        <Copy size={12} />
      </ActionBtn>
      {onEdit && (
        <ActionBtn label="编辑" onClick={onEdit}>
          <Pencil size={12} />
        </ActionBtn>
      )}
      <ActionBtn label="删除" onClick={onDelete}>
        <Trash2 size={12} />
      </ActionBtn>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className="p-1 rounded-md transition-colors hover:bg-[var(--hover-bg)]"
      style={{ color: "var(--ink-tertiary)" }}
    >
      {children}
    </button>
  );
}

function ModelPicker({
  models,
  value,
  onChange,
}: {
  models: ModelOption[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const current = models.find((m) => m.id === value) ?? models[0];
  if (!current) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11.5px] transition-colors hover:bg-[var(--hover-bg)]"
          style={{ color: "var(--ink-secondary)" }}
        >
          {current.display_name}
          <ChevronDown size={12} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="end"
          className="glass relative min-w-[200px] py-1.5 z-[400] max-h-[300px] overflow-y-auto"
          style={{ borderRadius: 12 }}
        >
          {models.map((m) => (
            <DropdownMenu.Item
              key={m.id}
              onSelect={() => onChange(m.id)}
              className={`px-3 py-1.5 mx-1 rounded-md text-[12.5px] cursor-default outline-none data-[highlighted]:bg-[var(--hover-bg)] ${m.id === value ? "font-semibold" : ""}`}
              style={{ color: "var(--ink-primary)" }}
            >
              {m.display_name}
              {m.provider_name && (
                <span
                  className="ml-2 text-[10.5px]"
                  style={{ color: "var(--ink-tertiary)" }}
                >
                  {m.provider_name}
                </span>
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function TypingIndicator() {
  return (
    <span className="inline-flex gap-1 items-center py-0.5">
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: "var(--ink-secondary)",
          animation: "typingPulse 1.4s ease-in-out infinite",
        }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: "var(--ink-secondary)",
          animation: "typingPulse 1.4s ease-in-out 0.18s infinite",
        }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: "var(--ink-secondary)",
          animation: "typingPulse 1.4s ease-in-out 0.36s infinite",
        }}
      />
    </span>
  );
}

function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {attachments.map((a, i) => {
        const url = a.url.startsWith("http") ? a.url : `${API_BASE}${a.url}`;
        if (a.kind === "image") {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt={a.name}
              className="max-w-[200px] max-h-[160px] rounded-lg object-cover"
              style={{ border: "1px solid var(--glass-border)" }}
            />
          );
        }
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[11.5px] inline-flex items-center gap-1 px-2 py-1 rounded-md"
            style={{ background: "var(--hover-bg)", color: "var(--sky-700)" }}
          >
            {a.name}
          </a>
        );
      })}
    </div>
  );
}
