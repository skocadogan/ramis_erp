"use client";

import { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ModuleKey } from "@/lib/constants";
import { useRequireModulePermission } from "@/hooks/useRequireModulePermission";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: ReactNode;
  /**
   * Kontrol edilecek modül anahtarı. 
   * Eğer sadece oturum (login) kontrolü isteniyorsa "overview" kullanılabilir 
   * (veya auth_only mantığı eklenebilir).
   */
  module: ModuleKey | "auth_only";
  /**
   * Opsiyonel: Kontrol edilecek özel izin kodu (örn. 'inventory.manage_stock_item').
   */
  requiredPermission?: string;
  /**
   * 'view': Modüle herhangi bir erişim yetkisi yeterli (default).
   * 'manage': Modüldeki yönetim (OPERATIONAL_PAGE_MANAGE_PERMISSIONS) yetkilerinden biri gerekli.
   */
  mode?: "view" | "manage";
}

export function AuthGuard({ children, module, requiredPermission, mode = "view" }: AuthGuardProps) {
  const t = useTranslations("common.authGuard");
  const effectiveModule = module === "auth_only" ? "overview" : module;
  const hasPermission = useRequireModulePermission(effectiveModule, { 
    requiredPermission, 
    mode 
  });

  // null ise henüz kontrol ediliyor demektir, loader gösterilir
  if (hasPermission === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="text-sm font-ui-medium text-muted-foreground">{t("checkingPermission")}</span>
        </div>
      </div>
    );
  }

  // false ise zaten hook router.push yapıyor, ekranda null basıp yönlendirmeyi bekleriz
  if (hasPermission === false) {
    return null;
  }

  return <>{children}</>;
}
