import type { Language } from "@/types";

export interface WaiterCallApiResponse {
  status: string;
  table_id: string;
  table_name?: string;
  reason?: string;
  call_id?: string;
  notified_count?: number;
}

type WaiterCallFeedbackVariant = "success" | "info";

export interface WaiterCallFeedback {
  variant: WaiterCallFeedbackVariant;
  title: string;
  message: string;
  shouldTrackCall: boolean;
}

export function getWaiterCallFeedback(
  response: WaiterCallApiResponse,
  language: Language,
): WaiterCallFeedback {
  const isTr = language === "tr";

  if (response.status === "accepted") {
    return {
      variant: "success",
      title: isTr ? "Çağrı Gönderildi!" : "Call Sent!",
      message: isTr
        ? "Personelimiz en kısa sürede yanınızda olacak."
        : "Our staff will be with you shortly.",
      shouldTrackCall: true,
    };
  }

  if (response.status === "ignored" && response.reason === "rate_limited") {
    return {
      variant: "info",
      title: isTr ? "Bilgilendirme" : "Notice",
      message: isTr
        ? "Çok fazla çağrı yaptınız. Önceki çağrılarınız iletilmiştir. Personelimiz ilgilenecektir. Sabrınız için teşekkür ederiz."
        : "You have made too many calls in a short time. Your previous calls have been received. Our staff will attend to you. Thank you for your patience.",
      shouldTrackCall: false,
    };
  }

  if (response.status === "ignored") {
    return {
      variant: "info",
      title: isTr ? "Bilgilendirme" : "Notice",
      message: isTr
        ? "Çağrınız şu anda iletilemedi. Lütfen kısa süre sonra tekrar deneyin."
        : "Your call could not be sent right now. Please try again shortly.",
      shouldTrackCall: false,
    };
  }

  return {
    variant: "success",
    title: isTr ? "Çağrı Gönderildi!" : "Call Sent!",
    message: isTr
      ? "Personelimiz en kısa sürede yanınızda olacak."
      : "Our staff will be with you shortly.",
    shouldTrackCall: true,
  };
}
