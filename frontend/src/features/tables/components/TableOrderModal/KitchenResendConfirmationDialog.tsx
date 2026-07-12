import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslations } from "next-intl";

import type { ConfirmKitchenResendState } from "./types";

interface KitchenResendConfirmationDialogProps {
    confirmKitchenResend: ConfirmKitchenResendState | null;
    setConfirmKitchenResend: (v: ConfirmKitchenResendState | null) => void;
    onConfirm: (itemId: string, newQty: number) => void;
    isUpdatingItem: string | null;
}

export function KitchenResendConfirmationDialog({
    confirmKitchenResend,
    setConfirmKitchenResend,
    onConfirm,
    isUpdatingItem,
}: KitchenResendConfirmationDialogProps) {
    const t = useTranslations("tables.orderModal.kitchenResendDialog");

    const handleConfirm = () => {
        if (!confirmKitchenResend) return;
        onConfirm(confirmKitchenResend.itemId, confirmKitchenResend.newQty);
    };

    return (
        <AlertDialog
            open={!!confirmKitchenResend}
            onOpenChange={(open) => {
                if (!open) setConfirmKitchenResend(null);
            }}
        >
            <AlertDialogContent size="sm">
                <AlertDialogHeader>
                    <AlertDialogTitle>{t("title")}</AlertDialogTitle>
                    <AlertDialogDescription>
                        {t("description", { name: confirmKitchenResend?.productName ?? "" })}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={!!isUpdatingItem}>{t("cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            handleConfirm();
                        }}
                        disabled={!!isUpdatingItem}
                    >
                        {t("confirm")}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
