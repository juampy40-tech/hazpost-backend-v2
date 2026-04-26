import os
import json
from datetime import datetime

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
FILE_PATH = os.path.join(DATA_PATH, "pending_industries.json")


def _ensure_file():
    os.makedirs(DATA_PATH, exist_ok=True)
    if not os.path.exists(FILE_PATH):
        with open(FILE_PATH, "w", encoding="utf-8") as f:
            json.dump([], f)


def save_industry_suggestion(name: str):
    _ensure_file()

    with open(FILE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    name_clean = name.strip().lower()

    # evitar duplicados
    for item in data:
        if item["name"].lower() == name_clean:
            return {"status": "exists"}

    suggestion = {
        "name": name.strip(),
        "createdAt": datetime.utcnow().isoformat()
    }

    data.append(suggestion)

    with open(FILE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return {"status": "saved"}
