"use client";

import { useState, useEffect, createContext, useContext, type ReactNode } from "react";

/**
 * KDS ortak saat provider'ı.
 * 
 * Birden fazla bileşen (OrderGrid, KdsOrderTotalsPanel, KDSHeader, LiveDateClock)
 * bağımsız setInterval ile Date.now() takip ediyordu. Bu provider tek bir
 * setInterval ile tüm bileşenleri besler — CPU wake-up sayısını azaltır.
 * 
 * Kullanım:
 * - KdsClockProvider'ı KDS sayfasının root'unda kullan
 * - Bileşenlerde useKdsClock() ile nowMs'i al
 */

const KdsClockContext = createContext<number>(Date.now());

export function KdsClockProvider({ children }: { children: ReactNode }) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  return (
    <KdsClockContext.Provider value={nowMs}>
      {children}
    </KdsClockContext.Provider>
  );
}

/** KDS ortak saatinden mevcut zamanı al (ms timestamp). */
export function useKdsClock(): number {
  return useContext(KdsClockContext);
}
