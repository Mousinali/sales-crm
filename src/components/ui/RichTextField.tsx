"use client";

import { useRef, type ReactNode } from "react";

// A deliberately small formatter — **bold**, *italic*, `code` only, no
// nesting — so the toolbar below has something real to produce without
// pulling in a rich-text editor library for three tags.
export function FormattedText({ text, className = "" }: { text: string; className?: string }) {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) nodes.push(<strong key={key++}>{match[1]}</strong>);
    else if (match[2] !== undefined) nodes.push(<em key={key++}>{match[2]}</em>);
    else if (match[3] !== undefined) (
      nodes.push(
        <code key={key++} className="rounded bg-black/10 px-1 py-0.5 text-[0.85em]">
          {match[3]}
        </code>,
      )
    );
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return <p className={`whitespace-pre-wrap ${className}`}>{nodes}</p>;
}

// A textarea with a Bold/Italic/Code toolbar that wraps the current
// selection in markdown markers — pair with <FormattedText> wherever the
// saved value is displayed, so the formatting actually renders.
export default function RichTextField({
  id,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function wrapSelection(marker: string) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value: current } = el;
    const selected = current.slice(selectionStart, selectionEnd);
    const next = current.slice(0, selectionStart) + marker + selected + marker + current.slice(selectionEnd);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selectionStart + marker.length, selectionStart + marker.length + selected.length);
    });
  }

  return (
    <div className="rounded-md border border-zinc-300 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200">
      <textarea
        id={id}
        ref={textareaRef}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full resize-none px-3 py-2 text-sm text-zinc-900 focus:outline-none"
      />
      <div className="flex items-center gap-1 border-t border-zinc-100 px-2 py-1.5">
        <button
          type="button"
          onClick={() => wrapSelection("**")}
          title="Bold"
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <i className="ri-bold" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => wrapSelection("*")}
          title="Italic"
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <i className="ri-italic" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => wrapSelection("`")}
          title="Code"
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <i className="ri-code-line" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
