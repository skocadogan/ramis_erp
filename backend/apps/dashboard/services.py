"""
Dashboard business logic services.
"""

from datetime import datetime


def parse_date_range(start_str, end_str):
    """start_date ve end_date query param'larini parse eder. ValueError'da None doner."""
    s = e = None
    try:
        if start_str:
            s = datetime.strptime(start_str, "%Y-%m-%d").date()
        if end_str:
            e = datetime.strptime(end_str, "%Y-%m-%d").date()
    except ValueError:
        return None, None, True
    return s, e, False
