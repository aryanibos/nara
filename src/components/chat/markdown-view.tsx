"use client";

import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { stabilizeMarkdown } from "@/lib/chat/markdown";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function languageOf(node: ReactNode): string | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const language = languageOf(child);
      if (language) return language;
    }
    return undefined;
  }
  if (!isValidElement<{ className?: string; children?: ReactNode }>(node)) return undefined;
  const match = /language-([\w+-]+)/.exec(node.props.className ?? "");
  return match?.[1] ?? languageOf(node.props.children);
}

function CodeFrame({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="my-3 overflow-hidden rounded-xl border bg-foreground/[0.04]">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{language || "teks"}</span>
        <button
          type="button"
          className="rounded-md px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
          onClick={() => {
            navigator.clipboard
              .writeText(code)
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1400);
              })
              .catch(() => setCopied(false));
          }}
        >
          {copied ? "Tersalin" : "Salin"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownView({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return <CodeFrame code={textOf(children).replace(/\n$/, "")} language={languageOf(children)} />;
          },
          code({ className, children }) {
            return <code className={className ? className : "inline-code"}>{children}</code>;
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {stabilizeMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
}
