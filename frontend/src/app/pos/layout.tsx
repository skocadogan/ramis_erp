import { PerformanceEffect } from "@/components/shell/PerformanceEffect";

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PerformanceEffect />
      {children}
    </>
  );
}
