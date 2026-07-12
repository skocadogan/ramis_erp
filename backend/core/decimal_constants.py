"""
Ondalık sıfır — tek `Decimal('0')` kaynağı.

Stok (adet) ve para tutarları aynı değerdir; okunabilirlik için anlamsal alias'lar.
"""
from decimal import Decimal

ZERO_DECIMAL = Decimal('0')
ZERO_MONEY = ZERO_DECIMAL
ZERO_QTY = ZERO_DECIMAL
