"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noreferrer" className="text-indigo-600 underline underline-offset-2 dark:text-indigo-400" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
