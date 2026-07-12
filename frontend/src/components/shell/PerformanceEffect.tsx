"use client";

import { useEffect } from "react";
import { usePosStore } from "@/store/usePosStore";

/**
 * F-9: Performance Mode Side-Effect
 * 
 * usePosStore içindeki performanceMode durumunu dinler ve 
 * document elementine (html) data-performance attribute'unu ekler.
 * Bu sayede CSS (globals.css) üzerinden ağır görsel efektler devre dışı bırakılır.
 */
export function PerformanceEffect() {
  const performanceMode = usePosStore((s) => s.performanceMode);

  useEffect(() => {
    if (typeof document === "undefined") return;
    
    if (performanceMode) {
      document.documentElement.setAttribute("data-performance", "true");
    } else {
      document.documentElement.removeAttribute("data-performance");
    }
  }, [performanceMode]);

  return null;
}
