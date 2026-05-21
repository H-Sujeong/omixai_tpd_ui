import { createContext, useContext, useState, type ReactNode } from "react";
import { Sidebar, type SidebarTab } from "@/components/Sidebar";

/**
 * AppShell: deep-navy app frame with a 240px sidebar (design_02) on the left
 * and a workspace column on the right. The dashboard route registers its
 * active tab + drug context via SidebarContext so the sidebar can render
 * sub-tabs.
 */

interface SidebarCtx {
  activeTab: SidebarTab;
  setActiveTab: (t: SidebarTab) => void;
  drugContext: { drugName: string; plateId: string } | null;
  setDrugContext: (ctx: { drugName: string; plateId: string } | null) => void;
}
const Ctx = createContext<SidebarCtx | null>(null);
export function useSidebar() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSidebar must be used within AppShell");
  return v;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("overview");
  const [drugContext, setDrugContext] = useState<SidebarCtx["drugContext"]>(null);

  return (
    <Ctx.Provider value={{ activeTab, setActiveTab, drugContext, setDrugContext }}>
      <div className="min-h-screen flex bg-surface-base text-ink-primary">
        <Sidebar
          activeTab={drugContext ? activeTab : undefined}
          onTabChange={setActiveTab}
          drugContext={drugContext ?? undefined}
        />
        <main className="flex-1 min-w-0 flex flex-col">{children}</main>
      </div>
    </Ctx.Provider>
  );
}
