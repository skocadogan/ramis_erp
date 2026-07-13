"use client";

import { type ReactNode } from "react";
import { Star } from "lucide-react";

interface Category {
  id: string;
  name: string;
  color?: string;
}

function CategorySidebarBtn({
  isActive,
  onClick,
  accent,
  featured,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  accent: string;
  featured?: boolean;
  children: ReactNode;
}) {
  if (featured) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`mb-1 flex w-full items-center gap-2 rounded-lg border px-4 py-3.5 text-left text-sm font-bold transition-colors ${
 isActive
 ? "border-amber-500 bg-amber-500 text-white shadow-md"
 : "border-transparent bg-card hover:bg-muted/50 text-muted-foreground dark:hover:bg-muted"
 }`}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3.5 text-left text-sm font-bold transition-colors ${
 isActive
 ? "shadow-md"
 : "border-transparent bg-card hover:bg-muted/50 bg-muted/40 text-muted-foreground dark:hover:"
 }`}
      style={
        isActive
          ? {
              backgroundColor: accent,
              borderColor: accent,
              color: "#fff",
            }
          : undefined
      }
    >
      {children}
    </button>
  );
}

function CategoryMobilePill({
  isActive,
  onClick,
  accent,
  featured,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  accent: string;
  featured?: boolean;
  children: ReactNode;
}) {
  if (featured) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-5 py-2.5 text-sm font-bold transition-colors ${
 isActive
 ? "border-amber-500 bg-amber-500 text-white shadow-sm"
 : "border-border bg-card text-muted-foreground"
 }`}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-lg border px-5 py-2.5 text-sm font-bold transition-colors ${
 isActive
 ? "text-white shadow-sm"
 : "border-border bg-card border-border bg-muted text-muted-foreground"
 }`}
      style={isActive ? { backgroundColor: accent, borderColor: accent } : undefined}
    >
      {children}
    </button>
  );
}

interface CategorySidebarProps {
  activeCategories: Category[];
  selectedCategory: string | null;
  setSelectedCategory: (id: string) => void;
  hasFeatured: boolean;
  tMenu: (key: string, values?: Record<string, string | number>) => string;
}

export function CategorySidebar({
  activeCategories,
  selectedCategory,
  setSelectedCategory,
  hasFeatured,
  tMenu,
}: CategorySidebarProps) {
  return (
    <>
      <div className="no-scrollbar hidden w-48 shrink-0 flex-col gap-1 overflow-y-auto border-r border-slate-100 /30 p-3 md:flex border-border bg-muted/20">
        <h3 className="mb-1 px-3 py-2 text-2xs font-bold uppercase tracking-widest text-muted-foreground dark:text-muted-foreground">
          {tMenu("categories")}
        </h3>

        {hasFeatured && (
          <CategorySidebarBtn
            featured
            isActive={selectedCategory === "FEATURED"}
            onClick={() => setSelectedCategory("FEATURED")}
            accent="#f59e0b"
          >
            <Star size={16} className={selectedCategory === "FEATURED" ? "fill-white" : "fill-amber-500 text-amber-500"} />
            {tMenu("featured")}
          </CategorySidebarBtn>
        )}

        {activeCategories.map((c) => {
          const isActive = selectedCategory === c.id;
          const catColor = c.color || "#3b82f6";
          return (
            <CategorySidebarBtn
              key={c.id}
              isActive={isActive}
              onClick={() => setSelectedCategory(c.id)}
              accent={catColor}
            >
              {c.name}
            </CategorySidebarBtn>
          );
        })}
      </div>

      <div className="no-scrollbar flex w-full shrink-0 gap-2 overflow-x-auto border-b border-slate-100 px-3 py-2.5 md:hidden border-border">
        {hasFeatured && (
          <CategoryMobilePill
            featured
            isActive={selectedCategory === "FEATURED"}
            onClick={() => setSelectedCategory("FEATURED")}
            accent="#f59e0b"
          >
            <Star size={14} className={selectedCategory === "FEATURED" ? "fill-white" : "fill-amber-500 text-amber-500"} />
            {tMenu("featured")}
          </CategoryMobilePill>
        )}
        {activeCategories.map((c) => {
          const isActive = selectedCategory === c.id;
          const catColor = c.color || "#3b82f6";
          return (
            <CategoryMobilePill
              key={c.id}
              isActive={isActive}
              onClick={() => setSelectedCategory(c.id)}
              accent={catColor}
            >
              {c.name}
            </CategoryMobilePill>
          );
        })}
      </div>
    </>
  );
}
