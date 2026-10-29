import Brand from "./Brand";
import NavLinks, { type NavItem } from "./NavLinks";

export default function Sidebar({ navItems }: { navItems: NavItem[] }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-sidebar px-3 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto">
      <div className="mb-4 border-b border-sidebar-border px-1 pb-4">
        <Brand />
      </div>
      <nav aria-label="Primary" className="flex flex-col gap-1">
        <NavLinks navItems={navItems} />
      </nav>
    </aside>
  );
}
