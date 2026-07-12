export interface OrderItem {
    id: string;
    /** Menü ürünü UUID (serializer: OrderItem.product) */
    product?: string;
    variant?: string | null;
    product_name: string;
    product_tax_rate?: number | null;
    variant_name?: string | null;
    quantity: number;
    unit_price: number;
    total_price: number;
    unit_name?: string | null;
    status: string;
    notes?: string | null;
    parent_item?: string | null;
    station_id?: string | null;
    station_name?: string | null;
    modifiers?: { id: string; modifier_name: string; price?: number }[];
}

export interface OrderDetail {
    id: string;
    /** API: OrderSerializer.branch */
    branch?: string;
    table_name: string;
    status: string;
    total_amount: number;
    created_at: string;
    order_number?: string | null;
    notes?: string | null;
    items: OrderItem[];
    discount_amount?: number;
    discount_type?: string | null;
    discount_by_name?: string | null;
    customer?: string | null;
    customer_name?: string | null;
    customer_display_survey_answered?: boolean;
}

interface SalePayment {
    id: string;
    payment_method: string;
    payment_method_display: string;
    amount: string;
    notes: string;
    created_at: string;
}

export interface SaleDetail {
    id: string;
    payment_method: string;
    payment_method_display: string;
    is_split_payment?: boolean;
    payments?: SalePayment[];
    original_payment_method: string;
    original_payment_method_display: string | null;
    total_amount: number;
    notes: string;
    paid_at: string;
    created_by_name: string | null;
    /** API: "{name} ({code})" veya kayıt yoksa null */
    pos_terminal_display?: string | null;
    discount_amount?: number;
    discount_type?: string | null;
    discount_type_display?: string | null;
    discount_applied_by_name?: string | null;
}

export type PaymentMethod = 'CASH' | 'CARD' | 'OTHER' | 'CREDIT';

/** İptal onay diyaloğu için durum tipi */
export type ConfirmCancelState =
    | { type: 'ORDER'; id: string; name?: string }
    | { type: 'ITEM'; id: string; name?: string }
    | { type: 'TABLE_ALL'; id: string; name?: string };

/** Teslim edilmiş kalem adedi artırımı — mutfağa yeniden gönderim onayı */
export type ConfirmKitchenResendState = {
    itemId: string;
    newQty: number;
    productName: string;
};
export type SplitPaymentMethod = Exclude<PaymentMethod, 'CREDIT'>;

export interface TableOrderModalProps {
    tableId?: string;
    orderId?: string;
    tableName: string;
    onClose: () => void;
    onPaymentComplete?: () => void;
    onActiveOrdersChanged?: () => void;
    initialTransferMode?: boolean;
    onNewOrder?: () => void;
    /** Garson ekranı: teslim edilmiş kalemlerde adet +/- gizlenir */
    hideDeliveredQuantityControls?: boolean;
}
