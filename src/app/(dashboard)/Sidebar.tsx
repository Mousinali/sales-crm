import Brand from "./Brand";
import NavLinks, { type NavSection } from "./NavLinks";

export default function Sidebar({ navSections, version }: { navSections: NavSection[]; version: string }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen">
      <div className="mb-4 border-b border-sidebar-border px-1 pb-4">
        <Brand />
      </div>
      <nav aria-label="Primary" className="no-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto">
        {navSections.map((section, index) => (
          <div key={section.label ?? `section-${index}`} className="flex flex-col gap-0">
            {section.label && (
              <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-sidebar-muted uppercase">{section.label}</p>
            )}
            <NavLinks navItems={section.items} />
          </div>
        ))}
      </nav>
      <div className="mt-4 border-t border-sidebar-border pt-3 text-xs text-sidebar-muted">Sales CRM v{version}</div>
    </aside>
  );
}
