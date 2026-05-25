"use client";

import * as React from "react";
import type { OsWindow } from "@/stores/windows";
import { WindowFrame } from "./WindowFrame";
import { ChatWindow } from "@/components/windows/ChatWindow";
import { AgentsWindow } from "@/components/windows/AgentsWindow";
import { SettingsWindow } from "@/components/windows/SettingsWindow";

export function WindowSwitch({ win }: { win: OsWindow }) {
  let body: React.ReactNode;
  switch (win.kind) {
    case "chat":
      body = <ChatWindow win={win} />;
      break;
    case "agents":
      body = <AgentsWindow win={win} />;
      break;
    case "settings":
      body = <SettingsWindow win={win} />;
      break;
    default:
      body = null;
  }
  return <WindowFrame win={win}>{body}</WindowFrame>;
}
