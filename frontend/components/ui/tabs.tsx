"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * Tabs — accessible tabs (WAI-ARIA: role=tablist/tab/tabpanel + keyboard arrows)
 * ไม่ต้องพึ่ง Radix — เล็กและครบ a11y
 *
 * ตัวอย่าง:
 *   <Tabs defaultValue="info">
 *     <TabsList>
 *       <TabsTrigger value="info">ข้อมูล</TabsTrigger>
 *       <TabsTrigger value="parts">อะไหล่</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="info">...</TabsContent>
 *     <TabsContent value="parts">...</TabsContent>
 *   </Tabs>
 */
interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs components ต้องใช้ภายใต้ <Tabs>");
  return ctx;
}

function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const baseId = useId();
  const [internal, setInternal] = useState(defaultValue ?? "");
  const current = value ?? internal;

  const setValue = useCallback(
    (v: string) => {
      if (value === undefined) setInternal(v);
      onValueChange?.(v);
    },
    [value, onValueChange]
  );

  return (
    <TabsContext.Provider value={{ value: current, setValue, baseId }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  const { baseId } = useTabsContext();
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []
    );
    const idx = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    if (idx < 0) return;
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={baseId}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] p-1",
        className
      )}
    >
      {children}
    </div>
  );
}

function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { value: current, setValue, baseId } = useTabsContext();
  const selected = current === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => setValue(value)}
      className={cn(
        "inline-flex h-9 items-center justify-center whitespace-nowrap rounded-[var(--cmms-radius-sm)] px-4 text-sm font-semibold transition-[background-color,color] duration-[var(--cmms-transition-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cmms-border-focus)]",
        selected
          ? "bg-[var(--cmms-bg-card)] text-[var(--cmms-primary-hover)] shadow-[var(--cmms-shadow-sm)]"
          : "text-[var(--cmms-text-secondary)] hover:text-[var(--cmms-text-primary)]",
        className
      )}
    >
      {children}
    </button>
  );
}

function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const { value: current, baseId } = useTabsContext();
  if (current !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      className={cn("mt-4 focus-visible:outline-none", className)}
    >
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };