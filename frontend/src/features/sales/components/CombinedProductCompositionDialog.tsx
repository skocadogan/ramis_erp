"use client";

import { useTranslations } from "next-intl";
import {
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { formatNumber } from "@/lib/formatters";
import type { MenuEngineeringCombinedComponent, MenuEngineeringRow } from "../types";

interface CombinedProductCompositionDialogProps {
    row: MenuEngineeringRow | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function formatUnitLabel(
    component: MenuEngineeringCombinedComponent,
    standardUnitLabel: string,
): string {
    if (component.product_unit_name) {
        return component.product_unit_name;
    }
    return standardUnitLabel;
}

export function CombinedProductCompositionDialog({
    row,
    open,
    onOpenChange,
}: CombinedProductCompositionDialogProps) {
    const t = useTranslations("sales.menuEngineering.combinedDialog");
    const components = row?.combined_components ?? [];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent layout="scroll" size="lg">
                <DialogHeader>
                    <DialogTitle>{t("title")}</DialogTitle>
                    <DialogDescription>
                        {row
                            ? t("description", { productName: row.product_name })
                            : t("descriptionFallback")}
                    </DialogDescription>
                </DialogHeader>
                <DialogBody>
                    {components.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t("empty")}</p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="min-w-full text-sm">
                                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-bold">{t("cols.product")}</th>
                                        <th className="px-4 py-3 text-right font-bold">{t("cols.quantity")}</th>
                                        <th className="px-4 py-3 text-left font-bold">{t("cols.salesUnit")}</th>
                                        <th className="px-4 py-3 text-right font-bold">{t("cols.multiplier")}</th>
                                        <th className="px-4 py-3 text-right font-bold">{t("cols.effectiveQty")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {components.map((component, index) => (
                                        <tr key={`${component.product_id}-${component.product_unit_id ?? "std"}-${index}`}>
                                            <td className="px-4 py-3 font-medium text-foreground">
                                                {component.product_name}
                                            </td>
                                            <td className="px-4 py-3 text-right text-foreground">
                                                {formatNumber(component.quantity, {
                                                    minimumFractionDigits: 0,
                                                    maximumFractionDigits: 4,
                                                })}
                                            </td>
                                            <td className="px-4 py-3 text-foreground">
                                                {formatUnitLabel(component, t("standardUnit"))}
                                            </td>
                                            <td className="px-4 py-3 text-right text-foreground">
                                                {formatNumber(component.product_unit_multiplier, {
                                                    minimumFractionDigits: 0,
                                                    maximumFractionDigits: 4,
                                                })}
                                            </td>
                                            <td className="px-4 py-3 text-right text-foreground">
                                                {formatNumber(component.effective_quantity, {
                                                    minimumFractionDigits: 0,
                                                    maximumFractionDigits: 4,
                                                })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </DialogBody>
            </DialogContent>
        </Dialog>
    );
}
