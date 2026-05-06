from datetime import datetime
from zoneinfo import ZoneInfo

def format_to_nz_time(time: datetime) -> str:
    nz_time = time.astimezone(ZoneInfo("Pacific/Auckland"))
    formatted_time = nz_time.strftime("%d %b %Y %H %M")
    return formatted_time