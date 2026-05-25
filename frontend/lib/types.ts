// 从页面级导入中抽取的共享类型，确保各处复用保持一致。

export type UserRole = "admin" | "user";

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: UserRole | string;
  avatar_url: string | null;
  is_active: boolean;
}

export interface Agent {
  id: string;
  name: string;
  nickname: string | null;
  avatar_url: string | null;
  description: string | null;
  greeting_message: string | null;
  model_ids: string[];
}

export interface Conversation {
  id: string;
  title: string;
  agent_id: string | null;
  agent_name: string | null;
  agent_avatar: string | null;
  updated_at: string;
}

export interface ConversationDetail {
  conversation: {
    id: string;
    title: string;
    agent_id: string | null;
    agent_name: string | null;
    agent_avatar: string | null;
    model_id: string | null;
  };
  messages: Message[];
  greeting_message: string | null;
}

import type { Attachment } from "./api";

export interface Message {
  id: string;
  role: string;
  content: string;
  attachments?: Attachment[] | null;
  created_at: string;
}

export interface ModelOption {
  id: string;
  display_name: string;
  model_id: string;
  provider_name?: string;
  provider_type?: string;
  supports_vision: boolean;
  supports_tools: boolean;
  stream_enabled?: boolean;
}
