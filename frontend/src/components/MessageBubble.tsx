import React, { useState } from "react";
import { Bot, User, Copy, Check, Eye, EyeOff } from "lucide-react";
import type { ChatMessage } from "../types";
import PiiPanel from "./PiiPanel";

interface Props {
  message: ChatMessage;
}

export default function MessageBubble({ message }: Props) {
  const [copied, setCopied] = useState(false);
  const [showMasked, setShowMasked] = useState(false);

  const isUser = message.role === "user";
  const hasEntities = (message.entities?.length ?? 0) > 0;
  const hasRestored = !!message.restoredResponse && message.restoredResponse !== message.rawResponse;

  // What text to show in the bubble
  let displayText: string;
  if (isUser) {
    displayText = showMasked && message.maskedContent ? message.maskedContent : message.content;
  } else {
    // For assistant: default to restored (if available), toggle to raw
    displayText = showMasked
      ? (message.rawResponse ?? message.content)
      : (message.restoredResponse ?? message.rawResponse ?? message.content);
  }

  async function copy() {
    await navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (message.isLoading) {
    return (
      <div className="flex gap-3 py-4">
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <Bot size={15} className="text-indigo-600" />
        </div>
        <div className="flex items-center gap-1 h-8">
          {[0, 150, 300].map(delay => (
            <span
              key={delay}
              className="w-2 h-2 rounded-full bg-indigo-300 animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 py-3 group ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
        isUser ? "bg-indigo-600" : "bg-gray-100 border border-gray-200"
      }`}>
        {isUser
          ? <User size={14} className="text-white" />
          : <Bot size={14} className="text-gray-600" />}
      </div>

      {/* Content column */}
      <div className={`flex flex-col max-w-[78%] ${isUser ? "items-end" : "items-start"}`}>
        {/* Bubble */}
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isUser
            ? "bg-indigo-600 text-white rounded-tr-none shadow-sm"
            : "bg-white text-gray-800 rounded-tl-none border border-gray-100 shadow-sm"
        }`}>
          {displayText}
        </div>

        {/* PII panel (user messages only) */}
        {isUser && hasEntities && (
          <div className="w-full">
            <PiiPanel entities={message.entities!} />
          </div>
        )}

        {/* Hover actions */}
        <div className={`flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs text-gray-400 ${
          isUser ? "flex-row-reverse" : ""
        }`}>
          <button onClick={copy} className="hover:text-gray-600 p-0.5">
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
          {isUser && hasEntities && (
            <button
              onClick={() => setShowMasked(v => !v)}
              className="hover:text-gray-600 flex items-center gap-1"
            >
              {showMasked ? <Eye size={12} /> : <EyeOff size={12} />}
              {showMasked ? "Show original" : "Show what was sent"}
            </button>
          )}
          {!isUser && hasRestored && (
            <button
              onClick={() => setShowMasked(v => !v)}
              className="hover:text-gray-600 flex items-center gap-1"
            >
              {showMasked ? <Eye size={12} /> : <EyeOff size={12} />}
              {showMasked ? "Show restored" : "Show with placeholders"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
