"""`.env` 파일을 환경변수로 읽어 들인다.

JS 백엔드는 `node --env-file-if-exists=.env`로 같은 일을 한다.
두 백엔드가 같은 DB 파일을 보듯 같은 키 파일을 보게 해서,
한쪽에만 키가 있어 결과가 달라지는 일을 막는다.
이미 환경에 있는 값은 덮어쓰지 않는다.
"""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# 파이썬 쪽 .env가 우선, 없으면 JS 백엔드의 .env를 같이 쓴다.
CANDIDATES = [ROOT / ".env", ROOT.parent / "fitness-backend-js" / ".env"]


def load_env():
    for path in CANDIDATES:
        if not path.exists():
            continue

        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
        break
