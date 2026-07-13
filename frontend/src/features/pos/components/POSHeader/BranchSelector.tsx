"use client";

import React from "react";
import { Building2, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

interface Branch {
  id: string;
  name: string;
}

interface BranchSelectorProps {
  branches: Branch[];
  userBranches: Branch[];
  selectedBranchId: string;
  userBranchName?: string;
  isSuperuser: boolean;
  variant: "pos" | "waiter";
  terminalBlock: React.ReactNode;
  onSelect: (branchId: string | null) => void;
  label?: string;
}

const BranchSelector = React.memo(function BranchSelector({
  branches,
  userBranches,
  selectedBranchId,
  userBranchName,
  isSuperuser,
  variant,
  terminalBlock,
  onSelect,
  label,
}: BranchSelectorProps) {
  const showDropdown =
    userBranches.length > 1 || isSuperuser;

  const selName =
    userBranches.find((b) => b.id === selectedBranchId)?.name || label || "Şube Seçin";

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3",
        variant === "pos" && "w-full"
      )}
    >
      {showDropdown ? (
        <Select value={selectedBranchId} onValueChange={onSelect}>
          <SelectTrigger
            className={cn(
              "min-w-0 flex-1 rounded-full border border-border bg-muted px-3 py-1.5 transition-colors hover:border-primary/50",
              variant === "waiter" &&
                "w-full flex-1 max-lg:rounded-xl max-lg:py-2",
              variant === "pos" && "min-w-0 w-full max-w-full"
            )}
          >
            <Building2 size={16} className="shrink-0 text-primary" />
            <span className="flex-1 text-left truncate text-sm">
              {selName}
            </span>
          </SelectTrigger>
          <SelectContent>
            {userBranches.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span
          className={cn(
            "flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground",
            variant === "pos" &&
              "max-w-[11rem] sm:max-w-[14rem] md:max-w-[18rem] lg:max-w-[20rem]"
          )}
        >
          <LayoutGrid size={16} className="shrink-0 text-muted-foreground" />
          <span className="truncate">
            {userBranchName ||
              (branches.length > 0 ? branches[0].name : "Şube")}
          </span>
        </span>
      )}
      {terminalBlock}
    </div>
  );
});

export default BranchSelector;
