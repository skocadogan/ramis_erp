"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CustomerDisplayView } from "@/features/pos/components/CustomerDisplayView";
import { CustomerDisplayOptionsModal } from "@/features/pos/components/CustomerDisplayOptionsModal";
import { CustomerDisplayAllergenModal } from "@/features/pos/components/CustomerDisplayAllergenModal";
import { CustomerDisplayRecommendedModal } from "@/features/pos/components/CustomerDisplayRecommendedModal";
import { CustomerDisplaySurveyModal } from "@/features/pos/components/CustomerDisplaySurveyModal";
import { Loader2, MonitorOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { getPosDisplayWsUrl, runManagedWebSocket } from "@/lib/ws";
import api from "@/lib/api";
import { CartItem, DisplayOptionsModalSync, DisplayAllergenModalSync, DisplayRecommendedModalSync, DisplaySurveyPrompt } from "@/types/pos";

export default function CustomerDisplayPage() {
  const t = useTranslations("pos.displayConnection");
  const { id } = useParams();
  const [clientReady, setClientReady] = useState(false);
  const [displayToken, setDisplayToken] = useState("");
  const [branchId, setBranchId] = useState<string | undefined>(undefined);
  const terminalKey =
    typeof id === "string" ? id : Array.isArray(id) ? (id[0] ?? "") : "";

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setDisplayToken(p.get("t")?.trim() ?? "");
    setBranchId((p.get("branch_id") ?? p.get("branch") ?? "").trim() || undefined);
    setClientReady(true);
  }, []);

  const [data, setData] = useState<{
    cart: CartItem[];
    total: number;
    subtotal?: number;
    discount?: number;
    table: { name: string; number: number } | null;
    metadata?: {
      isPaymentMode: boolean;
      paymentMethod: string | null;
      isProcessing: boolean;
    };
    optionsModal?: DisplayOptionsModalSync | null;
    allergenModal?: DisplayAllergenModalSync | null;
    recommendedModal?: DisplayRecommendedModalSync | null;
    surveyPrompt?: DisplaySurveyPrompt | null;
    timestamp: string;
  } | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [successSignal, setSuccessSignal] = useState<"ORDER" | "PAYMENT" | null>(null);
  const [surveyPrompt, setSurveyPrompt] = useState<DisplaySurveyPrompt | null>(null);
  const surveyPromptRef = useRef<DisplaySurveyPrompt | null>(null);

  useEffect(() => {
    surveyPromptRef.current = surveyPrompt;
  }, [surveyPrompt]);

  useEffect(() => {
    if (!clientReady || !terminalKey || !displayToken) return;
    const loadCurrentSurvey = async () => {
      try {
        const response = await api.get<{ prompt?: DisplaySurveyPrompt | null }>(
          `/guest-feedback/display/current/${terminalKey}/`,
          { params: { display_token: displayToken } }
        )
        setSurveyPrompt(response.data.prompt ?? null)
      } catch {
        setSurveyPrompt(null)
      }
    }
    void loadCurrentSurvey()
  }, [clientReady, displayToken, terminalKey]);

  useEffect(() => {
    if (!clientReady || !terminalKey || !displayToken) {
      if (clientReady && (!terminalKey || !displayToken)) {
        setStatus("disconnected");
      }
      return;
    }

    setStatus("connecting");

    return runManagedWebSocket({
      tag: "pos-display-client",
      enabled: true,
      getUrl: () =>
        getPosDisplayWsUrl(terminalKey, { mode: "subscriber", displayToken }),
      onOpen: () => {
        console.debug(`[Display] Connected to terminal: ${terminalKey}`);
        setStatus("connected");
      },
      onClose: () => {
        console.debug("[Display] Disconnected.");
        setStatus("disconnected");
      },
      onMessage: (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "pos_display_update") {
            setData(payload.data);
            if (payload.data?.surveyPrompt) {
              setSurveyPrompt(payload.data.surveyPrompt as DisplaySurveyPrompt);
            }
          } else if (payload.type === "pos_display_success") {
            const t = payload.data?.type;
            if (t === "ORDER" || t === "PAYMENT") {
              setSuccessSignal(t);
            }
          } else if (payload.type === "pos_display_survey") {
            const action = payload.data?.action;
            if (action === "open" && payload.data?.prompt) {
              const nextPrompt = payload.data.prompt as DisplaySurveyPrompt;
              setSurveyPrompt(nextPrompt);
            } else if (action === "close") {
              const completionSignal = payload.data?.completion_signal;
              if (completionSignal === "ORDER" || completionSignal === "PAYMENT") {
                return;
              } else {
                setSurveyPrompt(null);
              }
            }
          } else if (payload.type === "pos_display_refresh") {
            window.location.reload();
          }
        } catch (err) {
          console.error("Display message parse error:", err);
        }
      },
    });
  }, [clientReady, terminalKey, displayToken]);

  if (!clientReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <Loader2 className="h-16 w-16 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!displayToken) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white p-6 text-center">
        <div className="max-w-lg space-y-4">
          <h2 className="text-2xl font-ui-bold">{t("unsafeTitle")}</h2>
          <p className="text-muted-foreground">
            {t("unsafeDescription")}
          </p>
        </div>
      </div>
    );
  }

  if (status === "connecting" && !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-6">
          <Loader2 className="h-16 w-16 animate-spin text-blue-500" />
          <h2 className="text-2xl font-ui-bold tracking-tight">{t("connectingTitle")}</h2>
          <p className="text-muted-foreground font-ui-medium">
            {t("terminalIdLabel")} <span className="text-blue-400">{terminalKey}</span>
          </p>
        </div>
      </div>
    );
  }

  if (status === "disconnected" && !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="bg-red-500/10 p-6 rounded-full inline-block mb-4 border border-red-500/20">
            <MonitorOff className="h-16 w-16 text-red-500" />
          </div>
          <h2 className="text-4xl font-ui-bold tracking-tight">{t("disconnectedTitle")}</h2>
          <p className="text-muted-foreground text-xl">
            {t("disconnectedDescription")}
          </p>
          <div className="pt-8">
            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-red-500/70 w-full"></div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground font-ui-bold uppercase tracking-widest">
              {t("reconnecting")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <CustomerDisplayView
        branchId={branchId}
        terminalCode={terminalKey || undefined}
        cart={data?.cart || []}
        total={data?.total || 0}
        subtotal={data?.subtotal}
        discount={data?.discount}
        table={data?.table || null}
        metadata={data?.metadata}
        successSignal={successSignal}
        onSuccessSignalComplete={() => setSuccessSignal(null)}
        keepOrderShell={!!(data?.optionsModal || data?.allergenModal || data?.recommendedModal || surveyPrompt)}
      />
      {data?.optionsModal && <CustomerDisplayOptionsModal modal={data.optionsModal} />}
      {data?.allergenModal && <CustomerDisplayAllergenModal modal={data.allergenModal} />}
      {data?.recommendedModal && <CustomerDisplayRecommendedModal modal={data.recommendedModal} />}
      {surveyPrompt && (
        <CustomerDisplaySurveyModal
          key={surveyPrompt.session_id}
          prompt={surveyPrompt}
          terminalCode={terminalKey}
          displayToken={displayToken}
          onCompleted={() => {
            setSurveyPrompt(null)
          }}
          onClosed={() => {
            setSurveyPrompt(null)
          }}
        />
      )}
    </>
  );
}
