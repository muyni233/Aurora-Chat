"use client";

/**
 * ChatContent —— 用于聊天气泡的 Markdown 渲染器。
 * 封装 react-markdown，搭配 rehype-highlight + remark-gfm，
 * 通过 class 包裹应用项目的 .markdown-body 样式。
 * 同时解析并渲染类似 deepseek 的 <think>...</think> 块。
 *
 * 行为：
 * - 思考流进行中时：默认折叠至 48px，实时显示最后几行思考内容，
 *   底部对齐，顶部带有淡出渐变遮罩。
 * - 思考完成后：折叠时完全隐藏预览片段，仅显示紧凑的标题头。
 * - 过渡动画：展开/折叠切换通过 Framer Motion 平滑过渡。
 */

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Brain, ChevronRight, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { CodeBlock } from "@/components/ui/code-block";

interface Props {
  text: string;
  isStreaming?: boolean;
}

export const ChatContent = React.memo(function ChatContent({
  text,
  isStreaming = false,
}: Props) {
  const { thinking, isThinkingComplete, remainingText } =
    parseThinkContent(text);

  // 在流式传输进行中时跳过 rehypeHighlight 语法高亮，以优化渲染延迟
  const rehypePlugins = isStreaming ? [] : [rehypeHighlight];

  if (thinking !== null) {
    return (
      <div className="markdown-body flex flex-col gap-3">
        <ThinkingSection thinking={thinking} isComplete={isThinkingComplete} />
        {remainingText.trim() ? (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={rehypePlugins}
            components={{
              pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
            }}
          >
            {remainingText}
          </ReactMarkdown>
        ) : (
          !isThinkingComplete && (
            <span className="text-[13px] italic opacity-60">
              思考中，准备回答...
            </span>
          )
        )}
      </div>
    );
  }

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

export function parseThinkContent(text: string): {
  thinking: string | null;
  isThinkingComplete: boolean;
  remainingText: string;
} {
  const thinkStart = text.indexOf("<think>");
  if (thinkStart === -1) {
    return { thinking: null, isThinkingComplete: false, remainingText: text };
  }

  const thinkEnd = text.indexOf("</think>");
  if (thinkEnd === -1) {
    const thinking = text.slice(thinkStart + 7);
    return { thinking, isThinkingComplete: false, remainingText: "" };
  } else {
    const thinking = text.slice(thinkStart + 7, thinkEnd);
    const remainingText = text.slice(thinkEnd + 8);
    return { thinking, isThinkingComplete: true, remainingText };
  }
}

interface ThinkingSectionProps {
  thinking: string;
  isComplete: boolean;
}

export function ThinkingSection({
  thinking,
  isComplete,
}: ThinkingSectionProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const renderedMarkdown = React.useMemo(() => {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={!isComplete ? [] : [rehypeHighlight]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {thinking}
      </ReactMarkdown>
    );
  }, [thinking, isComplete]);

  const innerContent = (
    <div
      className="px-4 pb-3 pt-2.5 text-[12.5px] leading-relaxed select-text"
      style={{
        color: "var(--ink-secondary)",
        borderLeft: "3px solid rgba(14, 165, 233, 0.4)",
        background: "rgba(14, 165, 233, 0.015)",
        width: "100%",
      }}
    >
      {renderedMarkdown}
    </div>
  );

  // 计算动画目标属性
  const targetHeight = isOpen ? "auto" : isComplete ? 0 : 48;
  const targetOpacity = isComplete && !isOpen ? 0 : 1;

  return (
    <div className="flex flex-col items-start gap-2 w-full select-none">
      {/* 胶囊按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-sky-400/20 bg-sky-500/5 dark:bg-sky-400/5 text-sky-500 hover:bg-sky-500/10 transition-colors text-xs font-medium select-none"
      >
        {isComplete ? (
          <Brain size={14} className="text-sky-500" />
        ) : (
          <Loader2 size={14} className="text-sky-500 animate-spin" />
        )}
        <span style={{ color: "var(--ink-secondary)" }}>
          {isComplete ? "思考过程" : "正在思考中..."}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-center"
        >
          <ChevronRight size={13} className="opacity-60" />
        </motion.div>
      </button>

      {/* 可展开的思考区域 */}
      <motion.div
        initial={false}
        animate={{
          height: targetHeight,
          opacity: targetOpacity,
        }}
        transition={{
          height: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
          opacity: { duration: 0.15 },
        }}
        style={{
          overflow: "hidden",
          width: "100%",
          // 流式传输期间折叠时应用顶部淡出遮罩
          WebkitMaskImage:
            isOpen || isComplete
              ? "none"
              : "linear-gradient(to bottom, transparent 0%, black 60%)",
          maskImage:
            isOpen || isComplete
              ? "none"
              : "linear-gradient(to bottom, transparent 0%, black 60%)",
          // 流式传输期间将内容底部对齐，以便最新（最后几行）内容可见。
          display: "flex",
          flexDirection: "column",
          justifyContent: isOpen || isComplete ? "flex-start" : "flex-end",
        }}
        className={`rounded-xl border bg-sky-500/2 dark:bg-sky-400/2 transition-colors duration-200 ${
          isComplete && !isOpen ? "border-sky-400/0" : "border-sky-400/10"
        }`}
      >
        {innerContent}
      </motion.div>
    </div>
  );
}
