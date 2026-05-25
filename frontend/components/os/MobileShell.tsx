"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/components/theme/GlassThemeProvider";
import { Wallpaper } from "./Wallpaper";
import {
  apiGet,
  apiPost,
  apiDelete,
  apiPut,
  apiUploadFiles,
  streamChat,
  streamRegenerate,
  type Attachment,
} from "@/lib/api";
import type {
  Conversation,
  ConversationDetail,
  Message,
  ModelOption,
  Agent,
} from "@/lib/types";
import { irisPalette, toneForKey } from "@/components/theme/tokens";
import {
  ChatContent,
  parseThinkContent,
  ThinkingSection,
} from "../windows/chat/ChatContent";
import { Composer } from "../windows/chat/Composer";
import {
  MessageSquare,
  Compass,
  Settings as SettingsIcon,
  Trash2,
  ArrowLeft,
  LogOut,
  SlidersHorizontal,
  Check,
  RefreshCw,
  X,
  ChevronDown,
  Sparkles,
  Lock,
  Camera,
  AlertCircle,
  Sun,
  Moon,
  MonitorSmartphone,
  Upload,
  Image as ImageIcon,
  Github,
} from "lucide-react";
import { ImageCropperModal } from "../ui/ImageCropperModal";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

type MobileTab = "chats" | "agents" | "settings";

const TAB_INDEX = {
  chats: 0,
  agents: 1,
  settings: 2,
};

const slideVariants = {
  enter: (dir: number) => ({
    left: `${dir * 100}%`,
  }),
  center: {
    left: "0%",
  },
  exit: (dir: number) => ({
    left: `${dir * -100}%`,
  }),
};

export function MobileShell() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = React.useState<MobileTab>("chats");
  const [prevTab, setPrevTab] = React.useState<MobileTab>("chats");
  const [activeChatId, setActiveChatId] = React.useState<string | null>(null);

  if (!user) return null;

  const direction = TAB_INDEX[activeTab] >= TAB_INDEX[prevTab] ? 1 : -1;

  const handleTabClick = (tab: MobileTab) => {
    setPrevTab(activeTab);
    setActiveTab(tab);
    setActiveChatId(null);
  };

  return (
    <div className="fixed inset-0 overflow-hidden flex flex-col font-sans">
      <Wallpaper isMobile />

      {/* Main Content Area */}
      <div className="flex-1 relative z-10 overflow-hidden flex flex-col min-h-0 pb-16">
        <AnimatePresence custom={direction}>
          {activeTab === "chats" && (
            <motion.div
              key="chats"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.38 }}
              className="absolute inset-0 pb-16 flex flex-col min-h-0 w-full"
            >
              <MobileHeader title="会话列表" />
              <MobileChatsTab onOpenChat={setActiveChatId} />
            </motion.div>
          )}

          {activeTab === "agents" && (
            <motion.div
              key="agents"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.38 }}
              className="absolute inset-0 pb-16 flex flex-col min-h-0 w-full"
            >
              <MobileHeader title="智能体市场" />
              <MobileAgentsTab onStartChat={setActiveChatId} />
            </motion.div>
          )}

          {activeTab === "settings" && (
            <motion.div
              key="settings"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.38 }}
              className="absolute inset-0 pb-16 flex flex-col min-h-0 w-full"
            >
              <MobileHeader title="系统设置" />
              <MobileSettingsTab />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Chat Overlay */}
      <AnimatePresence>
        {activeChatId && (
          <motion.div
            initial={{ x: "calc(100% + 40px)" }}
            animate={{ x: 0 }}
            exit={{ x: "calc(100% + 40px)" }}
            transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.38 }}
            className="fixed inset-0 z-50 flex flex-col"
            style={{
              background: "var(--glass-bg-strong)",
              backdropFilter: "blur(30px) saturate(190%)",
              WebkitBackdropFilter: "blur(30px) saturate(190%)",
              boxShadow: "-8px 0 35px rgba(0, 0, 0, 0.12)",
            }}
          >
            <div className="flex-1 relative z-10 flex flex-col min-h-0">
              <MobileChatView
                conversationId={activeChatId}
                onClose={() => setActiveChatId(null)}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Tab Bar */}
      <div
        className="fixed bottom-0 left-0 right-0 h-[68px] pb-[env(safe-area-inset-bottom)] z-20 flex items-center justify-around border-t"
        style={{
          background: "var(--glass-bg-strong)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          borderColor: "var(--divider)",
          boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.05)",
        }}
      >
        <TabButton
          active={activeTab === "chats"}
          icon={<MessageSquare size={20} />}
          label="对话"
          onClick={() => handleTabClick("chats")}
        />
        <TabButton
          active={activeTab === "agents"}
          icon={<Compass size={20} />}
          label="智能体"
          onClick={() => handleTabClick("agents")}
        />
        <TabButton
          active={activeTab === "settings"}
          icon={<SettingsIcon size={20} />}
          label="设置"
          onClick={() => handleTabClick("settings")}
        />
      </div>
    </div>
  );
}

// ── Tab Bar Button ───────────────────────────────────────────

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 w-16 h-full transition-all relative active:scale-95"
      style={{
        color: active ? "var(--sky-500)" : "var(--ink-secondary)",
      }}
    >
      <span
        className={`transition-all duration-300 ${active ? "scale-110" : "opacity-70"}`}
      >
        {icon}
      </span>
      <span className="text-[10px] font-medium leading-none tracking-wide">
        {label}
      </span>
    </button>
  );
}

// ── Mobile Header ────────────────────────────────────────────

function MobileHeader({ title }: { title: string }) {
  return (
    <header
      className="h-[60px] flex-shrink-0 flex items-center px-5 border-b relative z-10 pt-[env(safe-area-inset-top)]"
      style={{
        background: "var(--glass-bg)",
        borderColor: "var(--divider)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.03)",
      }}
    >
      <div
        className="font-serif-italic text-[20px] font-semibold"
        style={{ color: "var(--ink-primary)" }}
      >
        {title}
      </div>
    </header>
  );
}

// ── Tab 1: Chats Tab ──────────────────────────────────────────

function MobileChatsTab({ onOpenChat }: { onOpenChat: (id: string) => void }) {
  const [conversations, setConversations] = React.useState<
    Conversation[] | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const data = await apiGet<Conversation[]>("/api/conversations");
        if (active) {
          setConversations(data);
        }
      } catch (err: unknown) {
        if (active) {
          setError(err instanceof Error ? err.message : "加载会话失败");
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, []);

  const deleteConv = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiDelete(`/api/conversations/${id}`);
      setConversations((prev) =>
        prev ? prev.filter((c) => c.id !== id) : null,
      );
    } catch {
      // ignore
    }
  };

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-[var(--color-danger)]">
        {error}
      </div>
    );
  }

  if (conversations === null) {
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-16 rounded-[14px] glass-tile animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <MessageSquare
          size={36}
          className="opacity-30 mb-3"
          style={{ color: "var(--ink-tertiary)" }}
        />
        <div
          className="font-serif-italic text-[18px] mb-1"
          style={{ color: "var(--ink-primary)" }}
        >
          暂无会话
        </div>
        <div
          className="text-[12px] opacity-70 mb-4"
          style={{ color: "var(--ink-secondary)" }}
        >
          前往“智能体”标签选择一个开始对话吧
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {conversations.map((c) => {
        const tone = toneForKey(c.agent_name || "对话");
        const [c1, c2] = irisPalette[tone];
        return (
          <div
            key={c.id}
            onClick={() => onOpenChat(c.id)}
            className="flex items-center gap-3.5 p-3.5 rounded-[20px] glass-tile active:scale-[0.97] transition-all cursor-pointer shadow-sm hover:shadow-md"
          >
            <div
              className="w-12 h-12 rounded-[14px] flex items-center justify-center text-white font-bold text-[17px] flex-shrink-0 shadow-sm"
              style={{
                background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
                boxShadow: "0 4px 12px rgba(30,60,120,0.15)",
              }}
            >
              {c.agent_avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.agent_avatar}
                  alt={c.agent_name || ""}
                  className="w-full h-full object-cover rounded-[14px]"
                />
              ) : (
                (c.agent_name || "?").charAt(0)
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span
                  className="font-semibold text-[15px] truncate tracking-tight"
                  style={{ color: "var(--ink-primary)" }}
                >
                  {c.agent_name || "智能体"}
                </span>
                <span
                  className="text-[11px] font-medium flex-shrink-0"
                  style={{ color: "var(--ink-tertiary)" }}
                >
                  {new Date(c.updated_at).toLocaleDateString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div
                className="text-[11.5px] truncate"
                style={{ color: "var(--ink-secondary)" }}
              >
                {c.title || "新对话"}
              </div>
            </div>
            <button
              onClick={(e) => deleteConv(c.id, e)}
              className="p-2 rounded-lg hover:bg-[rgba(239,68,68,0.1)] text-red-500 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab 2: Agents Tab ─────────────────────────────────────────

function MobileAgentsTab({
  onStartChat,
}: {
  onStartChat: (id: string) => void;
}) {
  const [agents, setAgents] = React.useState<Agent[] | null>(null);
  const [creating, setCreating] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      try {
        const a = await apiGet<Agent[]>("/api/agents");
        setAgents(a);
      } catch {
        setAgents([]);
      }
    })();
  }, []);

  const start = async (agent: Agent) => {
    setCreating(agent.id);
    try {
      const conv = await apiPost<{ id: string }>("/api/conversations", {
        agent_id: agent.id,
      });
      onStartChat(conv.id);
    } catch {
      // ignore
    } finally {
      setCreating(null);
    }
  };

  if (agents === null) {
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 rounded-[16px] glass-tile animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div
        className="flex-1 flex items-center justify-center p-8 text-center text-sm"
        style={{ color: "var(--ink-secondary)" }}
      >
        尚未配置任何智能体
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
      {agents.map((agent) => {
        const tone = toneForKey(agent.id);
        const [c1, c2] = irisPalette[tone];
        const busy = creating === agent.id;
        return (
          <div
            key={agent.id}
            onClick={() => !busy && start(agent)}
            className="p-4 rounded-[22px] glass-tile flex flex-col gap-3 cursor-pointer active:scale-[0.97] transition-all relative overflow-hidden shadow-sm hover:shadow-md"
          >
            <div className="flex items-center gap-3.5">
              <div
                className="w-12 h-12 rounded-[14px] flex items-center justify-center text-white font-bold text-[18px] flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
                  boxShadow: "0 4px 12px rgba(30,60,120,0.15)",
                }}
              >
                {agent.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={agent.avatar_url}
                    alt={agent.name}
                    className="w-full h-full object-cover rounded-[14px]"
                  />
                ) : (
                  (agent.nickname || agent.name || "?").charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="font-semibold text-[15px] truncate tracking-tight"
                  style={{ color: "var(--ink-primary)" }}
                >
                  {agent.nickname || agent.name}
                </div>
                {agent.nickname && agent.name !== agent.nickname && (
                  <div
                    className="text-[10px] truncate"
                    style={{ color: "var(--ink-tertiary)" }}
                  >
                    {agent.name}
                  </div>
                )}
              </div>
            </div>
            <div
              className="text-[12px] leading-relaxed line-clamp-2"
              style={{ color: "var(--ink-secondary)" }}
            >
              {agent.description || "一位等待和你对话的伙伴。"}
            </div>
            <div
              className="flex items-center gap-1 text-[11px] font-medium"
              style={{ color: "var(--sky-700)" }}
            >
              {busy ? (
                <>
                  <Sparkles size={11} className="animate-spin" /> 创建对话中…
                </>
              ) : (
                <>
                  <Sparkles size={11} /> 发送消息开始对话
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tab 3: Settings Tab ───────────────────────────────────────

function MobileSettingsTab() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [subTab, setSubTab] = React.useState<
    "account" | "appearance" | "about"
  >("account");

  if (!user) return null;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col min-h-0 pb-6">
      {/* Sub Tabs Toggle */}
      <div
        className="flex p-0.5 rounded-full mb-4 flex-shrink-0"
        style={{
          background: "rgba(15,30,60,0.06)",
          border: "1px solid var(--divider)",
        }}
      >
        <button
          onClick={() => setSubTab("account")}
          className="flex-1 py-1 rounded-full text-[12px] font-medium transition-all duration-200 cursor-pointer"
          style={{
            background:
              subTab === "account" ? "var(--glass-bg-strong)" : "transparent",
            boxShadow:
              subTab === "account"
                ? "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.06)"
                : "none",
            color:
              subTab === "account"
                ? "var(--ink-primary)"
                : "var(--ink-secondary)",
          }}
        >
          账号
        </button>
        <button
          onClick={() => setSubTab("appearance")}
          className="flex-1 py-1 rounded-full text-[12px] font-medium transition-all duration-200 cursor-pointer"
          style={{
            background:
              subTab === "appearance"
                ? "var(--glass-bg-strong)"
                : "transparent",
            boxShadow:
              subTab === "appearance"
                ? "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.06)"
                : "none",
            color:
              subTab === "appearance"
                ? "var(--ink-primary)"
                : "var(--ink-secondary)",
          }}
        >
          外观
        </button>
        <button
          onClick={() => setSubTab("about")}
          className="flex-1 py-1 rounded-full text-[12px] font-medium transition-all duration-200 cursor-pointer"
          style={{
            background:
              subTab === "about" ? "var(--glass-bg-strong)" : "transparent",
            boxShadow:
              subTab === "about"
                ? "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.06)"
                : "none",
            color:
              subTab === "about"
                ? "var(--ink-primary)"
                : "var(--ink-secondary)",
          }}
        >
          关于
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div style={{ display: subTab === "account" ? "block" : "none" }}>
          <MobileAccountPane />
        </div>
        <div style={{ display: subTab === "appearance" ? "block" : "none" }}>
          <MobileAppearancePane />
        </div>
        <div style={{ display: subTab === "about" ? "block" : "none" }}>
          <MobileAboutPane />
        </div>
      </div>

      {/* Global Actions */}
      <div className="mt-5 space-y-2 flex-shrink-0">
        {user.role === "admin" && (
          <Button
            variant="glass"
            onClick={() => router.push("/admin")}
            className="w-full justify-center text-sky-600 dark:text-sky-400 border border-sky-500/15"
          >
            <SlidersHorizontal size={14} />
            进入管理员后台
          </Button>
        )}
        <Button
          variant="glass"
          onClick={() => logout()}
          className="w-full justify-center text-red-600 dark:text-red-400 border border-red-500/15"
        >
          <LogOut size={14} />
          退出登录
        </Button>
      </div>
    </div>
  );
}

function MobileAccountPane() {
  const { user } = useAuth();
  if (!user) return null;
  return <MobileAccountForm key={user.id} />;
}

function MobileAccountForm() {
  const { user, refreshUser } = useAuth();
  const [username, setUsername] = React.useState(user?.username ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);

  // Password change
  const [pwOld, setPwOld] = React.useState("");
  const [pwNew, setPwNew] = React.useState("");
  const [pwBusy, setPwBusy] = React.useState(false);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwOk, setPwOk] = React.useState<string | null>(null);

  const saveProfile = async () => {
    if (!username.trim() || !user) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await apiPut("/api/auth/me", { username });
      await refreshUser();
      setOk("已保存");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async () => {
    if (!pwOld || !pwNew) return;
    if (pwNew.length < 8) {
      setPwError("新密码至少 8 位");
      return;
    }
    setPwBusy(true);
    setPwError(null);
    setPwOk(null);
    try {
      await apiPut("/api/auth/me", {
        current_password: pwOld,
        new_password: pwNew,
      });
      setPwOk("密码已更新");
      setPwOld("");
      setPwNew("");
    } catch (e: unknown) {
      setPwError(e instanceof Error ? e.message : "修改失败");
    } finally {
      setPwBusy(false);
    }
  };

  const [cropperOpen, setCropperOpen] = React.useState(false);
  const [cropperSrc, setCropperSrc] = React.useState("");

  const onAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !user) return;
    const f = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      setCropperSrc(reader.result as string);
      setCropperOpen(true);
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  const onAvatarCropConfirm = async (croppedFile: File) => {
    setCropperOpen(false);
    setBusy(true);
    setError(null);
    try {
      const [att] = await apiUploadFiles([croppedFile]);
      const url = att.url;
      await apiPut("/api/auth/me", { avatar_url: url });
      await refreshUser();
      setOk("头像已更新");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setBusy(false);
    }
  };

  const onAvatarRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiPut("/api/auth/me", { avatar_url: "" });
      await refreshUser();
      setOk("头像已删除");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  const tone = toneForKey(user.id);
  const [c1, c2] = irisPalette[tone];

  return (
    <div className="space-y-4">
      {/* Profile Form */}
      <div className="rounded-[14px] glass-tile p-4 flex flex-col gap-3">
        <div
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--ink-tertiary)" }}
        >
          个人资料
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
            <label
              className="relative w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-[20px] cursor-pointer group"
              style={{
                background: user.avatar_url
                  ? `url(${user.avatar_url}) center/cover`
                  : `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 8px rgba(30,60,120,0.15)",
              }}
            >
              {!user.avatar_url && user.username.charAt(0).toUpperCase()}
              <span className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <Camera size={14} className="text-white" />
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarPick}
              />
            </label>
            <div className="flex items-center gap-1.5 text-[10.5px] font-medium select-none">
              <label className="cursor-pointer text-[var(--sky-600)] hover:underline">
                更换
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onAvatarPick}
                />
              </label>
              {user.avatar_url && (
                <>
                  <span className="text-[var(--ink-tertiary)]">•</span>
                  <button
                    type="button"
                    onClick={onAvatarRemove}
                    className="text-rose-500 hover:underline"
                  >
                    删除
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <span
              className="text-[10px] font-medium"
              style={{ color: "var(--ink-tertiary)" }}
            >
              用户名
            </span>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-0.5"
            />
          </div>
        </div>
        <div className="flex items-center justify-between text-[11.5px] mt-1 pt-1 border-t border-[var(--divider)]">
          <div className="text-[11px]" style={{ color: "var(--ink-tertiary)" }}>
            {user.email}
          </div>
          <Button
            size="sm"
            onClick={saveProfile}
            disabled={busy || username === user.username || !username.trim()}
          >
            {busy ? "保存中…" : "保存"}
          </Button>
        </div>
        {error && <SettingsBanner kind="error">{error}</SettingsBanner>}
        {ok && <SettingsBanner kind="ok">{ok}</SettingsBanner>}
      </div>

      {/* Password Change Form */}
      <div className="rounded-[14px] glass-tile p-4 flex flex-col gap-3">
        <div
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--ink-tertiary)" }}
        >
          修改密码
        </div>
        <Input
          type="password"
          placeholder="当前密码"
          value={pwOld}
          onChange={(e) => setPwOld(e.target.value)}
          iconLeft={<Lock size={14} />}
        />
        <Input
          type="password"
          placeholder="新密码（至少 8 位）"
          value={pwNew}
          onChange={(e) => setPwNew(e.target.value)}
          iconLeft={<Lock size={14} />}
        />
        <div className="flex justify-end mt-1 pt-1 border-t border-[var(--divider)]">
          <Button
            size="sm"
            onClick={changePassword}
            disabled={pwBusy || !pwOld || !pwNew}
          >
            {pwBusy ? "更新中…" : "更新密码"}
          </Button>
        </div>
        {pwError && <SettingsBanner kind="error">{pwError}</SettingsBanner>}
        {pwOk && <SettingsBanner kind="ok">{pwOk}</SettingsBanner>}
      </div>

      <ImageCropperModal
        isOpen={cropperOpen}
        imageSrc={cropperSrc}
        circular
        onCrop={onAvatarCropConfirm}
        onCancel={() => setCropperOpen(false)}
        title="裁剪头像"
      />
    </div>
  );
}

function MobileAppearancePane() {
  const { spec, effectiveMode, patchSpec } = useTheme();
  const [wallpaperUploading, setWallpaperUploading] = React.useState(false);
  const [wallpaperDarkUploading, setWallpaperDarkUploading] =
    React.useState(false);

  const onWallpaperPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const f = e.target.files[0];
    setWallpaperUploading(true);
    try {
      const [att] = await apiUploadFiles([f]);
      const url = att.url;
      await patchSpec({
        background: {
          kind: "image",
          imageUrl: url,
          imageUrlDark: spec.background?.imageUrlDark ?? "",
          blur: spec.background?.blur ?? 0,
          dim: spec.background?.dim ?? 0,
          extractPalette: spec.background?.extractPalette ?? false,
          parallaxEnabled: spec.background?.parallaxEnabled ?? true,
        },
      });
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setWallpaperUploading(false);
      e.target.value = "";
    }
  };

  const onWallpaperDarkPick = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!e.target.files?.length) return;
    const f = e.target.files[0];
    setWallpaperDarkUploading(true);
    try {
      const [att] = await apiUploadFiles([f]);
      const url = att.url;
      await patchSpec({
        background: {
          kind: "image",
          imageUrl: spec.background?.imageUrl ?? "",
          imageUrlDark: url,
          blur: spec.background?.blur ?? 0,
          dim: spec.background?.dim ?? 0,
          extractPalette: spec.background?.extractPalette ?? false,
          parallaxEnabled: spec.background?.parallaxEnabled ?? true,
        },
      });
    } catch (err: unknown) {
      console.error(err);
    } finally {
      setWallpaperDarkUploading(false);
      e.target.value = "";
    }
  };

  const onWallpaperRemove = async () => {
    const hasDark = !!spec.background?.imageUrlDark;
    await patchSpec({
      background: {
        kind: hasDark ? "image" : "none",
        imageUrl: "",
        imageUrlDark: spec.background?.imageUrlDark ?? "",
        blur: spec.background?.blur ?? 0,
        dim: spec.background?.dim ?? 0,
        extractPalette: false,
        parallaxEnabled: spec.background?.parallaxEnabled ?? true,
      },
    });
  };

  const onWallpaperDarkRemove = async () => {
    const hasLight = !!spec.background?.imageUrl;
    await patchSpec({
      background: {
        kind: hasLight ? "image" : "none",
        imageUrl: spec.background?.imageUrl ?? "",
        imageUrlDark: "",
        blur: spec.background?.blur ?? 0,
        dim: spec.background?.dim ?? 0,
        extractPalette: false,
        parallaxEnabled: spec.background?.parallaxEnabled ?? true,
      },
    });
  };

  return (
    <div className="rounded-[14px] glass-tile p-4 space-y-4">
      <div>
        <div
          className="text-[11px] font-semibold uppercase tracking-wider mb-1"
          style={{ color: "var(--ink-tertiary)" }}
        >
          系统主题
        </div>
        <div
          className="text-[11.5px]"
          style={{ color: "var(--ink-secondary)" }}
        >
          当前模式：
          <strong style={{ color: "var(--ink-primary)" }}>
            {effectiveMode === "dark" ? "深色" : "浅色"}
          </strong>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { id: "light", label: "浅色", icon: Sun },
          { id: "dark", label: "深色", icon: Moon },
          { id: "system", label: "跟随", icon: MonitorSmartphone },
        ].map((opt) => {
          const active = spec.mode === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              onClick={() =>
                patchSpec({ mode: opt.id as "light" | "dark" | "system" })
              }
              className="rounded-xl glass-tile p-3 flex flex-col items-center gap-1.5 text-center cursor-pointer transition-all active:scale-[0.96] border relative"
              style={{
                borderColor: active ? "var(--sky-500)" : "transparent",
                background: active ? "rgba(14,165,233,0.06)" : undefined,
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
                style={{
                  background:
                    opt.id === "dark"
                      ? "linear-gradient(135deg, #1E293B 0%, #0F172A 100%)"
                      : opt.id === "light"
                        ? "linear-gradient(135deg, #BAE6FD 0%, #38BDF8 100%)"
                        : "linear-gradient(135deg, #94A3B8 0%, #475569 100%)",
                }}
              >
                <Icon size={14} />
              </div>
              <div
                className="text-[12px] font-medium"
                style={{ color: "var(--ink-primary)" }}
              >
                {opt.label}
              </div>
              {active && (
                <div
                  className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                  style={{ background: "var(--sky-500)" }}
                >
                  <Check size={9} strokeWidth={3} className="text-white" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* 自定义壁纸双通道 */}
      <div className="pt-3 border-t border-[var(--divider)] space-y-4">
        <div
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--ink-tertiary)" }}
        >
          自定义背景壁纸
        </div>

        {/* 浅色壁纸 */}
        <div className="space-y-1.5">
          <div
            className="text-[11px] font-medium"
            style={{ color: "var(--ink-secondary)" }}
          >
            浅色模式壁纸
          </div>
          <div className="flex items-center gap-3">
            {spec.background?.kind === "image" && spec.background?.imageUrl ? (
              <div className="relative w-20 h-12 rounded-lg overflow-hidden border border-[var(--divider)] flex-shrink-0 bg-slate-500/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={spec.background.imageUrl}
                  alt="Light Custom wallpaper"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-20 h-12 rounded-lg border border-dashed border-[var(--divider)] flex items-center justify-center flex-shrink-0 bg-slate-500/5">
                <ImageIcon size={14} className="text-[var(--ink-tertiary)]" />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <div className="flex gap-1.5">
                <label className="cursor-pointer inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-1 rounded-lg transition-colors bg-[var(--hover-bg)] hover:bg-[var(--hover-bg-strong)] text-[var(--ink-secondary)]">
                  <Upload size={10} /> {wallpaperUploading ? "上传中" : "上传"}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={onWallpaperPick}
                    disabled={wallpaperUploading}
                  />
                </label>
                {spec.background?.kind === "image" &&
                  spec.background?.imageUrl && (
                    <button
                      type="button"
                      onClick={onWallpaperRemove}
                      className="inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-1 rounded-lg transition-colors bg-[var(--hover-bg)] hover:bg-rose-500/10 hover:text-rose-500 text-[var(--ink-secondary)]"
                    >
                      <X size={10} /> 清除
                    </button>
                  )}
              </div>
            </div>
          </div>
        </div>

        {/* 深色壁纸 */}
        <div className="space-y-1.5">
          <div
            className="text-[11px] font-medium"
            style={{ color: "var(--ink-secondary)" }}
          >
            深色模式壁纸
          </div>
          <div className="flex items-center gap-3">
            {spec.background?.kind === "image" &&
            spec.background?.imageUrlDark ? (
              <div className="relative w-20 h-12 rounded-lg overflow-hidden border border-[var(--divider)] flex-shrink-0 bg-slate-500/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={spec.background.imageUrlDark}
                  alt="Dark Custom wallpaper"
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-20 h-12 rounded-lg border border-dashed border-[var(--divider)] flex items-center justify-center flex-shrink-0 bg-slate-500/5">
                <ImageIcon size={14} className="text-[var(--ink-tertiary)]" />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <div className="flex gap-1.5">
                <label className="cursor-pointer inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-1 rounded-lg transition-colors bg-[var(--hover-bg)] hover:bg-[var(--hover-bg-strong)] text-[var(--ink-secondary)]">
                  <Upload size={10} />{" "}
                  {wallpaperDarkUploading ? "上传中" : "上传"}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={onWallpaperDarkPick}
                    disabled={wallpaperDarkUploading}
                  />
                </label>
                {spec.background?.kind === "image" &&
                  spec.background?.imageUrlDark && (
                    <button
                      type="button"
                      onClick={onWallpaperDarkRemove}
                      className="inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-1 rounded-lg transition-colors bg-[var(--hover-bg)] hover:bg-rose-500/10 hover:text-rose-500 text-[var(--ink-secondary)]"
                    >
                      <X size={10} /> 清除
                    </button>
                  )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 壁纸模糊度 Radix Slider */}
      <div className="pt-3 border-t border-[var(--divider)] space-y-2 select-none">
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-semibold"
            style={{ color: "var(--ink-secondary)" }}
          >
            背景模糊度
          </span>
          <span className="text-[11px] font-medium text-sky-500">
            {spec.background?.blur ?? 0}px
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px]"
            style={{ color: "var(--ink-tertiary)" }}
          >
            0px
          </span>
          <Slider
            value={[spec.background?.blur ?? 0]}
            min={0}
            max={32}
            step={1}
            onValueChange={async ([val]) => {
              await patchSpec({
                background: {
                  ...(spec.background || {
                    kind: "none",
                    imageUrl: "",
                    imageUrlDark: "",
                    blur: 0,
                    dim: 0,
                    extractPalette: false,
                    parallaxEnabled: true,
                  }),
                  blur: val,
                },
              });
            }}
            className="flex-1"
          />
          <span
            className="text-[10px]"
            style={{ color: "var(--ink-tertiary)" }}
          >
            32px
          </span>
        </div>
      </div>

      {/* 亮度遮罩 Radix Slider */}
      <div className="pt-3 border-t border-[var(--divider)] space-y-2 select-none">
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-semibold"
            style={{ color: "var(--ink-secondary)" }}
          >
            亮度遮罩 (暗度)
          </span>
          <span className="text-[11px] font-medium text-sky-500">
            {Math.round((spec.background?.dim ?? 0) * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px]"
            style={{ color: "var(--ink-tertiary)" }}
          >
            0%
          </span>
          <Slider
            value={[spec.background?.dim ?? 0]}
            min={0.0}
            max={0.9}
            step={0.05}
            onValueChange={async ([val]) => {
              await patchSpec({
                background: {
                  ...(spec.background || {
                    kind: "none",
                    imageUrl: "",
                    imageUrlDark: "",
                    blur: 0,
                    dim: 0,
                    extractPalette: false,
                    parallaxEnabled: true,
                  }),
                  dim: val,
                },
              });
            }}
            className="flex-1"
          />
          <span
            className="text-[10px]"
            style={{ color: "var(--ink-tertiary)" }}
          >
            90%
          </span>
        </div>
      </div>

      {/* Layout customizers */}
      <div className="pt-3 border-t border-[var(--divider)] space-y-3">
        <div className="space-y-1.5">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--ink-tertiary)" }}
          >
            窗口圆角
          </div>
          <SegmentedControl
            value={spec.radius ?? "normal"}
            onChange={(val) => patchSpec({ radius: val })}
            options={[
              { id: "compact", label: "紧凑" },
              { id: "normal", label: "标准" },
              { id: "soft", label: "圆润" },
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--ink-tertiary)" }}
          >
            系统字体大小
          </div>
          <SegmentedControl
            value={spec.fontScale ?? "md"}
            onChange={(val) => patchSpec({ fontScale: val })}
            options={[
              { id: "sm", label: "小号" },
              { id: "md", label: "中号" },
              { id: "lg", label: "大号" },
            ]}
          />
        </div>

        <div className="space-y-1.5">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--ink-tertiary)" }}
          >
            系统动画动效
          </div>
          <SegmentedControl
            value={spec.motion ?? "full"}
            onChange={(val) => patchSpec({ motion: val })}
            options={[
              { id: "none", label: "无动效" },
              { id: "reduced", label: "减弱" },
              { id: "full", label: "完整" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex p-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--divider)]">
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className="flex-1 py-1 text-[11.5px] font-medium rounded-full transition-all duration-200 cursor-pointer"
            style={{
              background: active ? "var(--glass-bg-strong)" : "transparent",
              boxShadow: active
                ? "inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.06)"
                : "none",
              color: active ? "var(--ink-primary)" : "var(--ink-secondary)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function MobileAboutPane() {
  const { branding } = useTheme();
  return (
    <div className="rounded-[14px] glass-tile p-5 flex flex-col items-center text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={branding.logoUrl || "/logo.png"}
        alt="Logo"
        className="w-16 h-16 rounded-2xl object-contain p-1.5 mb-3"
        style={{
          background: "var(--logo-mask-bg)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 12px rgba(14,165,233,0.18)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: "1px solid var(--logo-mask-border)",
        }}
        onError={(e) => {
          e.currentTarget.src = "/logo.png";
        }}
      />
      <div
        className="font-serif-italic text-[22px] leading-none mb-1"
        style={{ color: "var(--ink-primary)" }}
      >
        {branding.appName || "Aurora Chat"}
      </div>
      <div className="text-[11.5px]" style={{ color: "var(--ink-secondary)" }}>
        {branding.appTagline || "Intelligent conversations, in glass."}
      </div>
      <div
        className="text-[10px] mt-3 uppercase tracking-widest font-semibold"
        style={{ color: "var(--ink-tertiary)" }}
      >
        v0.3 · Aether OS Mobile
      </div>
      <div
        className="text-[11px] leading-relaxed mt-4 max-w-[280px]"
        style={{ color: "var(--ink-secondary)" }}
      >
        基于 Next.js + FastAPI + LiteLLM 构建的 AI 对话平台。
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/about-mascot.png"
        alt="About Mascot"
        className="w-24 h-24 object-contain mt-4 select-none pointer-events-none filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.05)]"
      />
      <a
        href="https://github.com/muyni233/Aurora-Chat"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-medium transition-all duration-200"
        style={{
          background: "var(--hover-bg)",
          border: "1px solid var(--divider)",
          color: "var(--ink-primary)",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--hover-bg-strong)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--hover-bg)";
          e.currentTarget.style.transform = "translateY(0)";
        }}
      >
        <Github size={13} className="opacity-80" />
        <span>muyni233/Aurora-Chat</span>
      </a>
      <div
        className="mt-4 text-[10.5px]"
        style={{ color: "var(--ink-tertiary)" }}
      >
        该网站的源代码已使用 MIT 许可证开放
      </div>
    </div>
  );
}

function SettingsBanner({
  kind,
  children,
}: {
  kind: "error" | "ok";
  children: React.ReactNode;
}) {
  const isError = kind === "error";
  return (
    <div
      className="mt-2 text-[12px] px-2.5 py-1.5 rounded-lg flex items-center gap-2"
      style={{
        background: isError ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
        color: isError ? "var(--color-danger)" : "var(--color-success)",
      }}
    >
      <AlertCircle size={12} />
      {children}
    </div>
  );
}

// ── Mobile Chat View Overlay ──────────────────────────────────

function MobileChatView({
  conversationId,
  onClose,
}: {
  conversationId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = React.useState<ConversationDetail | null>(null);
  const [models, setModels] = React.useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [streamBuffer, setStreamBuffer] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingDraft, setEditingDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
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

  // Load conversation + models
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const d = await apiGet<ConversationDetail>(
          `/api/conversations/${conversationId}`,
        );
        if (cancelled) return;
        setDetail(d);
        setSelectedModel(d.conversation.model_id);

        if (d.conversation.agent_id) {
          try {
            const ms = await apiGet<ModelOption[]>(
              `/api/agents/${d.conversation.agent_id}/models`,
            );
            if (!cancelled) setModels(ms);
          } catch {
            /* ignore */
          }
        }
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "会话加载失败");
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
      typewriterActiveRef.current = false;
    };
  }, [conversationId]);

  // Auto-scroll on new messages / streaming
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
      // Wait for typewriter to finish typing all buffered text
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
      // Wait for typewriter to finish typing all buffered text
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

  if (error && !detail) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-[var(--color-danger)]">
        <div>{error}</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-sm opacity-50"
        style={{ color: "var(--ink-secondary)" }}
      >
        正在加载会话…
      </div>
    );
  }

  const agentName = detail.conversation.agent_name ?? "智能体";
  const tone = toneForKey(detail.conversation.agent_id ?? agentName);
  const [c1, c2] = irisPalette[tone];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-transparent">
      {/* Header */}
      <header
        className="h-14 flex-shrink-0 flex items-center px-3 border-b relative z-10 gap-2"
        style={{
          background: "rgba(255,255,255,0.22)",
          borderColor: "var(--divider)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg active:scale-95 transition-all text-[var(--ink-secondary)] hover:bg-[var(--hover-bg)]"
        >
          <ArrowLeft size={20} />
        </button>

        <div
          className="w-8 h-8 rounded-[8px] flex items-center justify-center text-white font-bold text-[13px] flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
            boxShadow: "0 2px 4px rgba(30,60,120,0.15)",
          }}
        >
          {detail.conversation.agent_avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={detail.conversation.agent_avatar}
              alt={agentName}
              className="w-full h-full object-cover rounded-[8px]"
            />
          ) : (
            agentName.charAt(0)
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="text-[13.5px] font-semibold leading-tight truncate"
            style={{ color: "var(--ink-primary)" }}
          >
            {agentName}
          </div>
          <div
            className="text-[10px] truncate leading-none mt-0.5"
            style={{ color: "var(--ink-tertiary)" }}
          >
            {detail.conversation.title || "新会话"}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {models.length > 0 && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10.5px] font-medium text-[var(--ink-secondary)] hover:bg-[var(--hover-bg)]">
                  模型
                  <ChevronDown size={11} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  sideOffset={6}
                  align="end"
                  className="glass relative min-w-[160px] py-1 z-[400] max-h-[220px] overflow-y-auto"
                  style={{ borderRadius: 12 }}
                >
                  {models.map((m) => (
                    <DropdownMenu.Item
                      key={m.id}
                      onSelect={() => setSelectedModel(m.id)}
                      className={`px-3 py-1.5 mx-1 rounded-md text-[11.5px] cursor-default outline-none data-[highlighted]:bg-[var(--hover-bg)] ${m.id === selectedModel ? "font-semibold" : ""}`}
                      style={{ color: "var(--ink-primary)" }}
                    >
                      {m.display_name}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 min-h-0"
      >
        {detail.greeting_message && detail.messages.length === 0 && (
          <MobileBubble
            role="agent"
            tone={tone}
            agentName={agentName}
            avatarUrl={detail.conversation.agent_avatar}
          >
            <ChatContent text={detail.greeting_message} />
          </MobileBubble>
        )}

        {detail.messages.map((m, index) => {
          const isEdit = editingId === m.id;
          const { thinking, isThinkingComplete, remainingText } =
            parseThinkContent(m.content);
          const hasContent =
            remainingText.trim() !== "" ||
            (m.attachments && m.attachments.length > 0);

          return (
            <MobileBubble
              key={`msg-${index}`}
              role={m.role}
              tone={tone}
              agentName={agentName}
              avatarUrl={detail.conversation.agent_avatar}
              thinking={thinking}
              isThinkingComplete={isThinkingComplete}
              onCopy={
                m.id === "streaming-assistant"
                  ? undefined
                  : () => navigator.clipboard.writeText(m.content)
              }
              onEdit={
                m.id !== "streaming-assistant" && m.role === "user"
                  ? () => {
                      setEditingId(m.id);
                      setEditingDraft(m.content);
                    }
                  : undefined
              }
              onDelete={
                m.id === "streaming-assistant"
                  ? undefined
                  : () => deleteMessage(m.id)
              }
            >
              {isEdit ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={editingDraft}
                    onChange={(e) => setEditingDraft(e.target.value)}
                    autoFocus
                    className="w-full bg-transparent border-0 outline-none text-[13px] resize-y min-h-[50px] leading-normal"
                    style={{ color: "inherit", fontFamily: "inherit" }}
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={saveEdit}
                      className="px-2 py-0.5 rounded text-[11px] font-medium text-white inline-flex items-center gap-1 bg-sky-500"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2 py-0.5 rounded text-[11px] inline-flex items-center gap-1 bg-black/10 dark:bg-white/10"
                      style={{ color: "var(--ink-secondary)" }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : m.id === "streaming-assistant" && !m.content ? (
                <span className="inline-flex gap-1 items-center py-0.5">
                  <span
                    className="w-1 h-1 rounded-full bg-[var(--ink-secondary)] animate-bounce"
                    style={{ animationDelay: "0s" }}
                  />
                  <span
                    className="w-1 h-1 rounded-full bg-[var(--ink-secondary)] animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <span
                    className="w-1 h-1 rounded-full bg-[var(--ink-secondary)] animate-bounce"
                    style={{ animationDelay: "0.4s" }}
                  />
                </span>
              ) : hasContent ? (
                <>
                  {remainingText.trim() && (
                    <ChatContent
                      text={remainingText}
                      isStreaming={m.id === "streaming-assistant"}
                    />
                  )}
                  {m.attachments && m.attachments.length > 0 && (
                    <MobileAttachmentsList attachments={m.attachments} />
                  )}
                </>
              ) : null}
            </MobileBubble>
          );
        })}
      </div>

      {/* Error banner */}
      {error && detail && (
        <div className="px-4 py-1.5 text-[11.5px] flex items-center justify-between bg-red-500/10 text-red-500">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-70">
            <X size={11} />
          </button>
        </div>
      )}

      {/* Regenerate Floating Action */}
      {!streaming && detail && detail.messages.length > 0 && (
        <div className="flex justify-center mb-1.5 relative z-10">
          <button
            onClick={regenerate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all duration-200 glass-tile hover:bg-[var(--hover-bg-strong)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] shadow-sm"
            style={{
              border: "1px solid var(--divider)",
            }}
          >
            <RefreshCw size={11} className="opacity-80" />
            <span>重新生成</span>
          </button>
        </div>
      )}

      {/* Composer */}
      <div
        className="border-t pb-2 pt-1"
        style={{
          borderColor: "var(--divider)",
          background: "rgba(255,255,255,0.1)",
        }}
      >
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={sendMessage}
          onStop={stopStream}
          uploading={false}
          streaming={streaming}
          placeholder={`发消息给 ${agentName}…`}
        />
      </div>
    </div>
  );
}

function MobileBubble({
  role,
  tone,
  agentName,
  avatarUrl,
  children,
  onCopy,
  onEdit,
  onDelete,
  thinking = null,
  isThinkingComplete = false,
}: {
  role: string;
  tone: keyof typeof irisPalette;
  agentName: string;
  avatarUrl: string | null;
  children: React.ReactNode;
  onCopy?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  thinking?: string | null;
  isThinkingComplete?: boolean;
}) {
  const { user } = useAuth();
  const isUser = role === "user";
  const userAvatar = isUser ? user?.avatar_url : null;
  const [c1, c2] = irisPalette[tone];
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <div
      onClick={() => setMenuOpen(!menuOpen)}
      className={`group/bubble flex flex-col gap-1.5 max-w-[85%] ${isUser ? "self-end" : "self-start"} animate-message-in relative`}
    >
      {/* Row 1: Thinking process (above avatar & bubble, indented) */}
      {thinking !== null && !isUser && (
        <div className="pl-[32px]">
          <ThinkingSection
            thinking={thinking}
            isComplete={isThinkingComplete}
          />
        </div>
      )}

      {/* Row 2: Avatar and Bubble box */}
      <div
        className={`flex gap-2 items-start ${isUser ? "flex-row-reverse" : ""}`}
      >
        {/* Avatar */}
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0 mt-0.5"
          style={
            isUser
              ? {
                  background: userAvatar
                    ? "transparent"
                    : "linear-gradient(135deg, #94A3B8 0%, #475569 100%)",
                }
              : { background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)` }
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

        {/* Bubble box + Actions */}
        <div className="min-w-0 flex flex-col gap-1 flex-1">
          {children && (
            <div
              className="px-3 py-2 text-[13px] leading-relaxed break-words"
              style={{
                background: isUser
                  ? "linear-gradient(135deg, rgba(125, 211, 252, 0.45) 0%, rgba(56, 189, 248, 0.25) 100%)"
                  : "rgba(255, 255, 255, 0.50)",
                border: isUser
                  ? "1px solid rgba(125, 211, 252, 0.45)"
                  : "1px solid rgba(255, 255, 255, 0.55)",
                borderRadius: isUser
                  ? "14px 4px 14px 14px"
                  : "4px 14px 14px 14px",
                color: "var(--ink-primary)",
                backdropFilter: "blur(10px) saturate(180%)",
                WebkitBackdropFilter: "blur(10px) saturate(180%)",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
              }}
            >
              {children}
            </div>
          )}

          {/* Small Touch Menu for bubble options */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center gap-2 mt-1 px-2 py-1 rounded-lg bg-black/10 dark:bg-white/10 w-fit"
              >
                {onCopy && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopy();
                      setMenuOpen(false);
                    }}
                    className="text-[10px] font-medium"
                    style={{ color: "var(--ink-secondary)" }}
                  >
                    复制
                  </button>
                )}
                {onEdit && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit();
                      setMenuOpen(false);
                    }}
                    className="text-[10px] font-medium"
                    style={{ color: "var(--ink-secondary)" }}
                  >
                    编辑
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                      setMenuOpen(false);
                    }}
                    className="text-[10px] font-medium text-red-500"
                  >
                    删除
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function MobileAttachmentsList({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="flex flex-wrap gap-2 mt-1.5">
      {attachments.map((a, i) => {
        const url = a.url;
        if (a.kind === "image") {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt={a.name}
              className="max-w-[160px] max-h-[120px] rounded-lg object-cover border"
              style={{ borderColor: "var(--glass-border)" }}
            />
          );
        }
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] inline-flex items-center gap-1 px-2 py-0.5 rounded"
            style={{ background: "var(--hover-bg)", color: "var(--sky-700)" }}
          >
            {a.name}
          </a>
        );
      })}
    </div>
  );
}
