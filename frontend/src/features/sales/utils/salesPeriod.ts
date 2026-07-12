/** @deprecated Performances modülüne taşındı — geriye dönük uyumluluk */
export type {
    PeriodPresetId as SalesPeriodPresetId,
    
} from '@/features/performances/utils/periodFilter';

export { getRangeForPeriodPreset as getRangeForSalesPeriodPreset } from '@/features/performances/utils/periodFilter';
