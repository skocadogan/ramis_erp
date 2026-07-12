import os

# Dil → para birimi sembolü haritası (frontend CURRENCY_SYMBOLS ile uyumlu)
CURRENCY_SYMBOLS: dict[str, str] = {
    'tr': '₺',
    'en': '₺',
    'ar': '₺',
    'de': '₺',
    'ru': '₺',
    'bg': '€',
    'sq': 'L',
}

def get_currency_symbol(language_code: str = 'tr') -> str:
    """Dil koduna göre para birimi sembolü döndürür."""
    return CURRENCY_SYMBOLS.get(language_code, '₺')

def turkish_to_escpos(text: str) -> str:
    replacements = {
        'ğ': 'g',
        'Ğ': 'G',
        'ş': 's',
        'Ş': 'S',
        'ı': 'i',
        'İ': 'I',
        'ö': 'o',
        'Ö': 'O',
        'ç': 'c',
        'Ç': 'C',
        'ü': 'u',
        'Ü': 'U',
    }
    return text.translate(str.maketrans(replacements))

