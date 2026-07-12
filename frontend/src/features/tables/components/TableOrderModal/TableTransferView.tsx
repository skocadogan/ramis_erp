import { Loader2, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Table } from '@/features/tables/types/table.types';

interface TableTransferViewProps {
    tableName: string;
    searchTable: string;
    setSearchTable: (val: string) => void;
    allTables: Table[];
    tableId?: string;
    isTransferLoading: boolean;
    handleTransferTable: (targetTableId: string) => void;
}

export const TableTransferView: React.FC<TableTransferViewProps> = ({
    tableName,
    searchTable,
    setSearchTable,
    allTables,
    tableId,
    isTransferLoading,
    handleTransferTable,
}) => {
    const t = useTranslations('tables.orderModal');
    const tGrid = useTranslations('tables.grid');
    const tStatus = useTranslations('tables.status');
    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-slate-50 dark:border-slate-800 space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed font-ui-medium">
                    {t.rich('transferInstructions', {
                        name: tableName,
                        b: (chunk) => <span className="text-blue-600 font-ui-bold uppercase">{chunk}</span>
                    })}
                </p>
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <input 
                        type="text" 
                        placeholder={tGrid('search')}
                        className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-border bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        value={searchTable}
                        onChange={e => setSearchTable(e.target.value)}
                        autoFocus
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-3 gap-2">
                    {allTables
                        .filter(tbl => tbl.id !== tableId && tbl.name.toLowerCase().includes(searchTable.toLowerCase()))
                        .map(tbl => (
                            <button
                                key={tbl.id}
                                onClick={() => handleTransferTable(tbl.id)}
                                disabled={isTransferLoading}
                                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all h-20
                                    ${tbl.status === 'OCCUPIED' 
                                        ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-800 shadow-sm' 
                                        : 'bg-white border-border hover:border-blue-400 hover:bg-blue-50 dark:bg-slate-800 dark:border-slate-700 shadow-sm'
                                    }`}
                            >
                                <span className={`text-2xs font-ui-bold uppercase tracking-tighter mb-1 ${tbl.status === 'OCCUPIED' ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                    {tbl.status === 'OCCUPIED' ? t('occupiedMerge') : tStatus('free')}
                                </span>
                                <span className="text-sm font-ui-bold text-slate-800 dark:text-slate-100">{tbl.name}</span>
                            </button>
                        ))}
                </div>
                {isTransferLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 backdrop-blur-[1px] motion-reduce:backdrop-blur-none motion-reduce:bg-white/75 dark:bg-slate-900/60 dark:motion-reduce:bg-slate-900/75">
                        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-lg border border-border flex items-center gap-3">
                            <Loader2 size={18} className="animate-spin text-blue-600" />
                            <span className="text-xs font-ui-bold text-foreground">{t('transferring')}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
