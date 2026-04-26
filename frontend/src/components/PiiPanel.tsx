import React, { useState } from "react";
import { ShieldCheck, Eye, EyeOff } from "lucide-react";
import type { PIIEntity } from "../types";

const COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  PERSON:        { bg: "bg-blue-50",   text: "text-blue-700",   dot: "bg-blue-400" },
  EMAIL_ADDRESS: { bg: "bg-emerald-50",text: "text-emerald-700",dot: "bg-emerald-400" },
  PHONE_NUMBER:  { bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-400" },
  CREDIT_CARD:   { bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-400" },
  US_SSN:        { bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-400" },
  LOCATION:      { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-400" },
  DATE_TIME:     { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-400" },
  IP_ADDRESS:    { bg: "bg-slate-50",  text: "text-slate-700",  dot: "bg-slate-400" },
  IBAN_CODE:     { bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-400" },
  CRYPTO:        { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-400" },
  CUSTOM:        { bg: "bg-pink-50",   text: "text-pink-700",   dot: "bg-pink-400" },
};

function getColor(type: string) {
  return COLORS[type] ?? { bg: "bg-gray-50", text: "text-gray-700", dot: "bg-gray-400" };
}

interface Props {
  entities: PIIEntity[];
}

export default function PiiPanel({ entities }: Props) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  if (!entities.length) return null;

  const seen = new Set<string>();
  const unique = entities.filter(e => {
    if (seen.has(e.placeholder)) return false;
    seen.add(e.placeholder);
    return true;
  });

  function toggle(ph: string) {
    setRevealed(prev => {
      const next = new Set(prev);
      next.has(ph) ? next.delete(ph) : next.add(ph);
      return next;
    });
  }

  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <ShieldCheck size={12} className="text-amber-600" />
        <span className="text-xs font-semibold text-amber-700">
          {unique.length} item{unique.length !== 1 ? "s" : ""} protected
        </span>
        <span className="text-xs text-amber-500">— click to reveal</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {unique.map(e => {
          const c = getColor(e.entity_type);
          const isRevealed = revealed.has(e.placeholder);
          return (
            <button
              key={e.placeholder}
              onClick={() => toggle(e.placeholder)}
              title={`${e.entity_type} · confidence ${Math.round(e.score * 100)}%`}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border border-transparent ${c.bg} ${c.text} hover:opacity-80 transition-all`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
              <span className="font-mono">
                {isRevealed ? e.original_value : e.placeholder}
              </span>
              {isRevealed
                ? <EyeOff size={10} className="opacity-50" />
                : <Eye size={10} className="opacity-40" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
