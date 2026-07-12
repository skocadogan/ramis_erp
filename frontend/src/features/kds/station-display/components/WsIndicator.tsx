import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function WsIndicator({ connected }: { connected: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold",
        connected
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-red-500/30 bg-red-500/10 text-red-400"
      )}
    >
      {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
      {connected ? "Bağlı" : "Bağlantı Kesildi"}
    </div>
  );
}
