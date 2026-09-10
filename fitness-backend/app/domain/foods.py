"""먹은 음식 텍스트 → 열량/영양소 추정.

"현미밥 1공기, 닭가슴살 200g, 사과 1개" 같은 자유 입력을 파싱한다.
모든 값은 100g 기준으로 저장하고, 개·공기 같은 단위는 unit_g로 환산한다.

한계를 분명히 해둔다. 조리법과 기름 사용량을 알 수 없으므로 추정치이고,
못 알아본 항목은 숨기지 않고 그대로 돌려준다.
"""

import re

# name: 대표 이름 / aliases: 함께 인식할 표기
# kcal, p, c, f: 100g(또는 100ml) 기준 / unit_g: 1개·1공기 등 1단위의 무게(g)
FOODS = [
    # --- 밥 / 곡류 ---
    {"name": "현미밥", "aliases": ["현미"], "kcal": 150, "p": 3.4, "c": 32, "f": 1.0, "unit_g": 210},
    {"name": "잡곡밥", "aliases": ["잡곡"], "kcal": 152, "p": 3.6, "c": 32, "f": 1.1, "unit_g": 210},
    {"name": "흰쌀밥", "aliases": ["쌀밥", "공기밥", "밥"], "kcal": 145, "p": 2.6, "c": 32, "f": 0.3, "unit_g": 210},
    {"name": "오트밀", "aliases": ["귀리"], "kcal": 380, "p": 13, "c": 66, "f": 7, "unit_g": 40},
    {"name": "고구마", "aliases": [], "kcal": 130, "p": 1.5, "c": 31, "f": 0.2, "unit_g": 150},
    {"name": "감자", "aliases": [], "kcal": 77, "p": 2.0, "c": 17, "f": 0.1, "unit_g": 150},
    {"name": "식빵", "aliases": ["통밀빵", "빵"], "kcal": 265, "p": 9, "c": 49, "f": 3.2, "unit_g": 35},
    {"name": "떡", "aliases": ["가래떡", "떡국떡"], "kcal": 220, "p": 4, "c": 50, "f": 0.5, "unit_g": 100},
    {"name": "라면", "aliases": [], "kcal": 450, "p": 9, "c": 65, "f": 17, "unit_g": 120},
    {"name": "파스타", "aliases": ["스파게티"], "kcal": 160, "p": 6, "c": 31, "f": 1.0, "unit_g": 250},
    {"name": "국수", "aliases": ["소면", "칼국수"], "kcal": 140, "p": 5, "c": 28, "f": 0.5, "unit_g": 250},
    {"name": "시리얼", "aliases": [], "kcal": 380, "p": 8, "c": 80, "f": 3, "unit_g": 40},

    # --- 육류 / 단백질 ---
    {"name": "닭가슴살", "aliases": ["닭가슴"], "kcal": 110, "p": 23, "c": 0, "f": 1.5, "unit_g": 100},
    {"name": "닭안심", "aliases": [], "kcal": 105, "p": 24, "c": 0, "f": 1.0, "unit_g": 100},
    {"name": "닭다리", "aliases": ["닭허벅지"], "kcal": 190, "p": 18, "c": 0, "f": 13, "unit_g": 90},
    {"name": "삼겹살", "aliases": [], "kcal": 330, "p": 17, "c": 0, "f": 29, "unit_g": 150},
    {"name": "목살", "aliases": ["돼지목살"], "kcal": 220, "p": 20, "c": 0, "f": 15, "unit_g": 150},
    {"name": "돼지고기", "aliases": ["돼지"], "kcal": 240, "p": 20, "c": 0, "f": 17, "unit_g": 150},
    {"name": "소고기", "aliases": ["소고기 살코기", "한우", "스테이크"], "kcal": 210, "p": 21, "c": 0, "f": 14, "unit_g": 150},
    {"name": "차돌박이", "aliases": [], "kcal": 350, "p": 17, "c": 0, "f": 31, "unit_g": 150},
    {"name": "계란", "aliases": ["달걀", "삶은계란", "삶은달걀"], "kcal": 143, "p": 12.6, "c": 1.1, "f": 9.5, "unit_g": 55},
    {"name": "계란흰자", "aliases": ["달걀흰자", "흰자"], "kcal": 52, "p": 11, "c": 0.7, "f": 0.2, "unit_g": 33},
    {"name": "두부", "aliases": [], "kcal": 84, "p": 9, "c": 2, "f": 4.8, "unit_g": 150},
    {"name": "연어", "aliases": [], "kcal": 208, "p": 20, "c": 0, "f": 13, "unit_g": 100},
    {"name": "고등어", "aliases": [], "kcal": 190, "p": 20, "c": 0, "f": 12, "unit_g": 100},
    {"name": "참치", "aliases": ["참치캔"], "kcal": 130, "p": 24, "c": 0, "f": 4, "unit_g": 100},
    {"name": "새우", "aliases": [], "kcal": 99, "p": 21, "c": 0.2, "f": 1.0, "unit_g": 15},
    {"name": "오징어", "aliases": [], "kcal": 92, "p": 18, "c": 3, "f": 1.0, "unit_g": 200},
    {"name": "프로틴", "aliases": ["단백질보충제", "웨이프로틴", "유청단백", "프로틴쉐이크"],
     "kcal": 400, "p": 80, "c": 8, "f": 5, "unit_g": 30},

    # --- 유제품 ---
    {"name": "우유", "aliases": [], "kcal": 62, "p": 3.2, "c": 4.8, "f": 3.3, "unit_g": 200},
    {"name": "저지방우유", "aliases": [], "kcal": 42, "p": 3.4, "c": 5, "f": 1.0, "unit_g": 200},
    {"name": "그릭요거트", "aliases": ["그릭"], "kcal": 97, "p": 9, "c": 4, "f": 5, "unit_g": 100},
    {"name": "요거트", "aliases": ["요구르트"], "kcal": 70, "p": 3.5, "c": 10, "f": 1.8, "unit_g": 100},
    {"name": "치즈", "aliases": ["슬라이스치즈"], "kcal": 350, "p": 22, "c": 2, "f": 28, "unit_g": 20},
    {"name": "코티지치즈", "aliases": [], "kcal": 98, "p": 11, "c": 3.4, "f": 4.3, "unit_g": 100},

    # --- 과일 / 채소 ---
    {"name": "바나나", "aliases": [], "kcal": 89, "p": 1.1, "c": 23, "f": 0.3, "unit_g": 120},
    {"name": "사과", "aliases": [], "kcal": 52, "p": 0.3, "c": 14, "f": 0.2, "unit_g": 200},
    {"name": "블루베리", "aliases": [], "kcal": 57, "p": 0.7, "c": 14, "f": 0.3, "unit_g": 100},
    {"name": "딸기", "aliases": [], "kcal": 32, "p": 0.7, "c": 8, "f": 0.3, "unit_g": 15},
    {"name": "토마토", "aliases": ["방울토마토"], "kcal": 18, "p": 0.9, "c": 3.9, "f": 0.2, "unit_g": 100},
    {"name": "샐러드", "aliases": ["채소", "야채", "쌈채소", "나물"], "kcal": 25, "p": 1.5, "c": 4, "f": 0.3, "unit_g": 150},
    {"name": "브로콜리", "aliases": [], "kcal": 34, "p": 2.8, "c": 7, "f": 0.4, "unit_g": 100},
    {"name": "김치", "aliases": [], "kcal": 30, "p": 1.7, "c": 4, "f": 0.5, "unit_g": 50},
    {"name": "아보카도", "aliases": [], "kcal": 160, "p": 2, "c": 9, "f": 15, "unit_g": 150},

    # --- 견과 / 지방 ---
    {"name": "아몬드", "aliases": [], "kcal": 579, "p": 21, "c": 22, "f": 50, "unit_g": 1.2},
    {"name": "견과류", "aliases": ["믹스넛", "호두"], "kcal": 600, "p": 15, "c": 20, "f": 54, "unit_g": 20},
    {"name": "땅콩버터", "aliases": [], "kcal": 590, "p": 25, "c": 20, "f": 50, "unit_g": 16},
    {"name": "올리브유", "aliases": ["올리브오일", "식용유"], "kcal": 884, "p": 0, "c": 0, "f": 100, "unit_g": 14},

    # --- 국 / 찌개 / 한식 ---
    {"name": "된장찌개", "aliases": ["된장국"], "kcal": 60, "p": 4, "c": 5, "f": 2.5, "unit_g": 300},
    {"name": "김치찌개", "aliases": [], "kcal": 80, "p": 5, "c": 5, "f": 4.5, "unit_g": 300},
    {"name": "미역국", "aliases": [], "kcal": 40, "p": 3, "c": 2, "f": 2, "unit_g": 300},
    {"name": "비빔밥", "aliases": [], "kcal": 130, "p": 5, "c": 21, "f": 3, "unit_g": 450},
    {"name": "김밥", "aliases": [], "kcal": 160, "p": 5, "c": 27, "f": 3.5, "unit_g": 230},
    {"name": "제육볶음", "aliases": ["제육"], "kcal": 220, "p": 15, "c": 8, "f": 14, "unit_g": 200},
    {"name": "불고기", "aliases": [], "kcal": 180, "p": 15, "c": 7, "f": 10, "unit_g": 200},
    {"name": "닭갈비", "aliases": [], "kcal": 200, "p": 16, "c": 9, "f": 11, "unit_g": 250},
    {"name": "삼계탕", "aliases": [], "kcal": 120, "p": 12, "c": 5, "f": 6, "unit_g": 600},

    # --- 외식 / 간식 ---
    {"name": "치킨", "aliases": ["후라이드치킨", "양념치킨"], "kcal": 250, "p": 18, "c": 12, "f": 15, "unit_g": 60},
    {"name": "피자", "aliases": [], "kcal": 270, "p": 11, "c": 30, "f": 11, "unit_g": 110},
    {"name": "햄버거", "aliases": ["버거"], "kcal": 250, "p": 12, "c": 25, "f": 12, "unit_g": 220},
    {"name": "돈카츠", "aliases": ["돈까스"], "kcal": 280, "p": 15, "c": 20, "f": 16, "unit_g": 200},
    {"name": "초밥", "aliases": ["스시"], "kcal": 145, "p": 7, "c": 25, "f": 1.5, "unit_g": 25},
    {"name": "짜장면", "aliases": [], "kcal": 160, "p": 6, "c": 25, "f": 4, "unit_g": 400},
    {"name": "짬뽕", "aliases": [], "kcal": 120, "p": 6, "c": 17, "f": 3, "unit_g": 500},
    {"name": "탕수육", "aliases": [], "kcal": 260, "p": 10, "c": 25, "f": 13, "unit_g": 200},
    {"name": "떡볶이", "aliases": [], "kcal": 190, "p": 4, "c": 38, "f": 3, "unit_g": 250},
    {"name": "과자", "aliases": ["쿠키", "비스킷"], "kcal": 480, "p": 6, "c": 65, "f": 22, "unit_g": 30},
    {"name": "초콜릿", "aliases": ["초코"], "kcal": 550, "p": 6, "c": 55, "f": 33, "unit_g": 30},
    {"name": "아이스크림", "aliases": [], "kcal": 200, "p": 3.5, "c": 24, "f": 10, "unit_g": 100},

    # --- 음료 / 주류 ---
    {"name": "아메리카노", "aliases": ["커피"], "kcal": 3, "p": 0.2, "c": 0.5, "f": 0, "unit_g": 300},
    {"name": "라떼", "aliases": ["카페라떼"], "kcal": 50, "p": 2.6, "c": 4.5, "f": 2.4, "unit_g": 300},
    {"name": "콜라", "aliases": ["사이다", "탄산음료"], "kcal": 42, "p": 0, "c": 10.6, "f": 0, "unit_g": 250},
    {"name": "오렌지주스", "aliases": ["주스"], "kcal": 45, "p": 0.7, "c": 10.4, "f": 0.2, "unit_g": 200},
    {"name": "맥주", "aliases": [], "kcal": 43, "p": 0.5, "c": 3.6, "f": 0, "unit_g": 500},
    {"name": "소주", "aliases": [], "kcal": 141, "p": 0, "c": 0, "f": 0, "unit_g": 50},
    {"name": "와인", "aliases": [], "kcal": 83, "p": 0.1, "c": 2.6, "f": 0, "unit_g": 150},
    {"name": "막걸리", "aliases": [], "kcal": 46, "p": 1.6, "c": 1.6, "f": 0, "unit_g": 300},
]

# 단위 → 그램 환산. unit_g가 있는 음식은 '개/공기' 같은 단위에 그 값을 쓴다.
WEIGHT_UNITS = {"g": 1.0, "그램": 1.0, "kg": 1000.0, "ml": 1.0, "cc": 1.0, "l": 1000.0}
COUNT_UNITS = {
    "개", "알", "공기", "인분", "장", "조각", "컵", "잔", "스쿱", "봉지", "캔", "병", "줄", "쪽", "큰술",
}

# 큰술처럼 unit_g와 다른 기준이 필요한 단위
SPOON_G = 15.0

QUANTITY_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(kg|g|그램|ml|cc|l|개|알|공기|인분|장|조각|컵|잔|스쿱|봉지|캔|병|줄|쪽|큰술)?",
)

STRIP_CHARS = " ,/+·;\n\t"

SPLIT_RE = re.compile(r"[,\n/+·;]|\s와\s|\s및\s")

_INDEX = None


def _index():
    """이름과 별칭을 길이 내림차순으로 정렬해 둔 색인. 긴 이름을 먼저 맞춘다."""
    global _INDEX
    if _INDEX is None:
        pairs = []
        for food in FOODS:
            for token in [food["name"], *food["aliases"]]:
                pairs.append((token, food))
        pairs.sort(key=lambda pair: -len(pair[0]))
        _INDEX = pairs
    return _INDEX


def _match_food(chunk):
    for token, food in _index():
        if token in chunk:
            return token, food
    return None, None


def _grams(amount, unit, food):
    """수량 + 단위 → 그램."""
    if unit in WEIGHT_UNITS:
        return amount * WEIGHT_UNITS[unit]
    if unit == "큰술":
        return amount * SPOON_G
    if unit in COUNT_UNITS or unit is None:
        return amount * food["unit_g"]
    return amount * food["unit_g"]


def _macros(food, grams):
    ratio = grams / 100.0
    return {
        "calories": round(food["kcal"] * ratio),
        "protein": round(food["p"] * ratio, 1),
        "carbs": round(food["c"] * ratio, 1),
        "fat": round(food["f"] * ratio, 1),
    }


def estimate(text):
    """자유 입력 → 항목별 추정치와 합계.

    구분자에 기대지 않고 음식 이름의 '위치'를 먼저 찾은 뒤, 각 이름 바로 뒤(없으면 앞)에
    붙은 수량을 가져온다. "계란 3개와 오트밀 60g"처럼 붙여 쓴 문장도 정확히 갈린다.
    """
    text = text or ""

    # 1) 겹치지 않게 음식 이름 위치를 찾는다. 긴 이름을 먼저 잡는다.
    taken = [False] * len(text)
    found = []

    for token, food in _index():
        cursor = 0
        while True:
            at = text.find(token, cursor)
            if at < 0:
                break
            span = range(at, at + len(token))
            if not any(taken[i] for i in span):
                for i in span:
                    taken[i] = True
                found.append({"at": at, "end": at + len(token), "token": token, "food": food})
            cursor = at + len(token)

    found.sort(key=lambda item: item["at"])

    # 2) 이름마다 수량을 찾는다. 뒤쪽 구간을 먼저 보고, 없으면 앞쪽 구간을 본다.
    items = []
    for index, entry in enumerate(found):
        after_end = found[index + 1]["at"] if index + 1 < len(found) else len(text)
        before_start = found[index - 1]["end"] if index > 0 else 0

        match = QUANTITY_RE.search(text[entry["end"]:after_end])
        if not match:
            match = QUANTITY_RE.search(text[before_start:entry["at"]])

        food = entry["food"]
        if match:
            amount = float(match.group(1).replace(",", "."))
            unit = match.group(2)
        else:
            amount, unit = 1.0, None

        grams = _grams(amount, unit, food)
        macros = _macros(food, grams)

        items.append({
            "raw": text[entry["at"]:after_end].strip(STRIP_CHARS),
            "name": food["name"],
            "amount": amount,
            "unit": unit or "개",
            "grams": round(grams),
            **macros,
        })

    # 3) 어떤 음식도 걸치지 않은 덩어리는 못 알아본 것으로 돌려준다.
    unmatched = []
    cursor = 0
    for raw in SPLIT_RE.split(text):
        chunk_start = text.find(raw, cursor)
        if chunk_start < 0:
            chunk_start = cursor
        chunk_end = chunk_start + len(raw)
        cursor = chunk_end

        chunk = raw.strip()
        if not chunk:
            continue
        if not any(taken[chunk_start:chunk_end]):
            unmatched.append(chunk)

    total = {"calories": 0, "protein": 0.0, "carbs": 0.0, "fat": 0.0}
    for item in items:
        for key in total:
            total[key] += item[key]

    total = {
        "calories": round(total["calories"]),
        "protein": round(total["protein"]),
        "carbs": round(total["carbs"]),
        "fat": round(total["fat"]),
    }

    return {
        "items": items,
        "unmatched": unmatched,
        "total": total,
        "matched": len(items),
        "note": (
            "조리법과 기름 사용량은 알 수 없어 추정치입니다. 값을 직접 고칠 수 있습니다."
            if items
            else "인식한 음식이 없습니다. '현미밥 1공기, 닭가슴살 200g'처럼 음식과 양을 적어주세요."
        ),
    }


def known_foods():
    return sorted(food["name"] for food in FOODS)


def estimate_from_photo(model_foods):
    """사진 분석 결과를 영양 추정으로 바꾼다.

    음식 DB가 아는 음식이면 DB 값을 쓴다. 텍스트로 직접 적었을 때와 같은 숫자가
    나와야 하기 때문이다. DB에 없는 음식만 모델이 준 값을 그대로 받는다.
    (예전에는 모르는 음식이 0kcal로 빠져서 합계가 실제보다 낮게 나왔다.)
    """
    items = []
    used_model = 0

    for food in model_foods or []:
        name = (food.get("name") or "").strip()
        if not name:
            continue

        phrase = f"{name} {food['amount']}{food['unit']}"
        local = estimate(phrase)

        if local["matched"] > 0:
            items.extend({**item, "source": "db"} for item in local["items"])
            continue

        used_model += 1
        items.append(
            {
                "raw": phrase,
                "name": name,
                "amount": food["amount"],
                "unit": food["unit"],
                "grams": round(food["grams"]),
                "calories": round(food["calories"]),
                "protein": round(food["protein"], 1),
                "carbs": round(food["carbs"], 1),
                "fat": round(food["fat"], 1),
                "source": "ai",
            }
        )

    sums = {key: 0 for key in ("calories", "protein", "carbs", "fat")}
    for item in items:
        for key in sums:
            sums[key] += item[key]

    if not items:
        note = "사진에서 음식을 찾지 못했습니다. 음식과 양을 직접 적어주세요."
    elif used_model:
        note = (
            f"{used_model}개 항목은 음식 DB에 없어 AI가 어림한 값입니다. "
            "조리법과 기름 사용량에 따라 달라지니 값을 직접 고칠 수 있습니다."
        )
    else:
        note = "조리법과 기름 사용량은 알 수 없어 추정치입니다. 값을 직접 고칠 수 있습니다."

    return {
        "items": items,
        "unmatched": [],
        "total": {key: round(value) for key, value in sums.items()},
        "matched": len(items),
        "aiEstimated": used_model,
        "note": note,
    }
