import { useState, useEffect } from "react";

import { useAuthStore } from "@/store/useAuthStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Users, MonitorSmartphone, Monitor, Smartphone, XCircle } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { canManagePosConnections } from "@/lib/constants";

interface Connection {
  channel_name: string;
  user_id: string;
  name: string;
  platform: string;
  connected_at: string;
}

interface ConnectedUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  terminalId: string;
}

export function ConnectedUsersModal({ isOpen, onClose, terminalId }: ConnectedUsersModalProps) {

  const user = useAuthStore((s) => s.user);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null);

  // Use a generic translation or hardcoded fallback for missing translation keys
  const title = "Bağlı Cihazlar";
  const noConnections = "Bağlı cihaz bulunmuyor.";
  const disconnectBtn = "Bağlantıyı Kes";
  const refreshBtn = "Yenile";

  const fetchConnections = async () => {
    if (!terminalId || !isOpen) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/pos-display/terminals/${terminalId}/connections/`);
      const allConnections = res.data.results || [];
      const filtered = allConnections.filter((c: Connection) => c.user_id !== user?.id);
      setConnections(filtered);
    } catch (err) {
      console.error("Bağlantılar alınamadı:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, terminalId]);

  const handleDisconnect = async (channelName: string) => {
    if (isDisconnecting) return;
    setIsDisconnecting(channelName);
    try {
      await api.post(`/pos-display/terminals/${terminalId}/disconnect_connection/`, {
        channel_name: channelName,
      });
      toast.success("Bağlantı başarıyla kesildi.");
      setConnections(connections.filter((c) => c.channel_name !== channelName));
    } catch (err) {
      console.error("Bağlantı kesilemedi:", err);
      toast.error("Bağlantı kesilirken bir hata oluştu.");
    } finally {
      setIsDisconnecting(null);
    }
  };

  const canManage = canManagePosConnections(user?.permissions, user?.is_superuser);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md sm:max-w-lg p-0 overflow-hidden bg-white/95 bg-card/95 border border-slate-200/50 border-border/50 shadow-lg">
        <DialogHeader className="p-4 sm:p-6 pb-4 border-b border-slate-100 border-border">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-bold">
            <Users className="text-blue-600 dark:text-blue-400" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 sm:p-6 max-h-[60vh] overflow-y-auto">
          {isLoading && connections.length === 0 ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : connections.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <MonitorSmartphone className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-sm font-medium">{noConnections}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.channel_name}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-100 border-border /50 bg-muted/50 hover:dark:hover: transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400">
                      {conn.platform === "mobile" ? <Smartphone size={20} /> : <Monitor size={20} />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {conn.name || "İsimsiz Kullanıcı"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {conn.platform === "mobile" ? "Mobil Uygulama" : "Web Uygulaması"}
                      </p>
                    </div>
                  </div>
                  
                  {canManage && (
                    <button
                      onClick={() => handleDisconnect(conn.channel_name)}
                      disabled={isDisconnecting === conn.channel_name}
                      className="flex items-center justify-center h-8 w-8 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:text-rose-400 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-50"
                      title={disconnectBtn}
                    >
                      {isDisconnecting === conn.channel_name ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <XCircle size={18} />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6 pt-4 border-t border-slate-100 border-border bg-muted/50 flex justify-end gap-3">
          <button
            onClick={fetchConnections}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-muted-foreground bg-card border border-slate-200 border-border rounded-lg hover: dark:hover: transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            {refreshBtn}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            Kapat
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
