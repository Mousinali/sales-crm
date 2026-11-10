"use client";

import { useState } from "react";

export type SocialLinks = {
  youtubeUrl: string;
  facebookUrl: string;
  instagramUrl: string;
  linkedinUrl: string;
};

export const EMPTY_SOCIAL_LINKS: SocialLinks = {
  youtubeUrl: "",
  facebookUrl: "",
  instagramUrl: "",
  linkedinUrl: "",
};

const PLATFORMS: { key: keyof SocialLinks; label: string; icon: string }[] = [
  { key: "youtubeUrl", label: "YouTube", icon: "/social-icons/youtube.svg" },
  { key: "facebookUrl", label: "Facebook", icon: "/social-icons/facebook.svg" },
  { key: "instagramUrl", label: "Instagram", icon: "/social-icons/instagram.svg" },
  { key: "linkedinUrl", label: "LinkedIn", icon: "/social-icons/linkedin.svg" },
];

export default function SocialLinksField({
  value,
  onChange,
}: {
  value: SocialLinks;
  onChange: (key: keyof SocialLinks, url: string) => void;
}) {
  const [open, setOpen] = useState<Set<keyof SocialLinks>>(
    () => new Set(PLATFORMS.filter((p) => value[p.key]).map((p) => p.key)),
  );

  function toggle(key: keyof SocialLinks) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="col-span-3 flex flex-col gap-2">
      <span className="text-sm font-medium text-zinc-700">Social links</span>
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => {
          const active = open.has(p.key);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => toggle(p.key)}
              aria-pressed={active}
              title={active ? `Remove ${p.label} link` : `Add ${p.label} link`}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-200 ${
                active
                  ? "border-brand-300 bg-brand-50 text-brand-700"
                  : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a fixed local icon, not a user-uploaded or remote image next/image would optimize. */}
              <img
                src={p.icon}
                alt=""
                className={`h-5 w-5 shrink-0 object-contain ${active ? "" : "opacity-50 grayscale"}`}
              />
              {p.label}
              <i className={`${active ? "ri-close-line" : "ri-add-line"} text-xs`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      {PLATFORMS.filter((p) => open.has(p.key)).map((p) => (
        <input
          key={p.key}
          type="url"
          aria-label={`${p.label} profile URL`}
          value={value[p.key]}
          onChange={(event) => onChange(p.key, event.target.value)}
          placeholder={`${p.label} profile URL`}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
      ))}
    </div>
  );
}
