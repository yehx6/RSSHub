#!/usr/bin/env python3
"""
TT-RSS 订阅源导出工具
从本地 TT-RSS 实例拉取全部订阅源，生成与 feeds.xlsx 格式一致的报告。

列说明（与 feeds.xlsx 对应）：
  标题 | 订阅 URL | 本地原始地址 | 路由名称 | 分类 | 来源 |
  最后更新 | 最后拉取 | 未读数 | 状态 | 错误分类 | 错误信息 | 备注
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

import requests
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

# ────────────────── 配置 ──────────────────
TTRSS_URL  = "http://127.0.0.1:8280/tt-rss"
TTRSS_USER = "admin"
TTRSS_PASS = "your_strong_password"

# routes.json 路径（用于查找 RSSHub 路由名称）
ROUTES_JSON = Path(__file__).parent.parent / "assets" / "build" / "routes.json"

# 输出文件
OUTPUT_FILE = Path(__file__).parent / "feeds_report.xlsx"
# ──────────────────────────────────────────


# ── TT-RSS API ──────────────────────────────────────────────────────────────

def api_post(payload: dict) -> dict:
    r = requests.post(f"{TTRSS_URL}/api/", json=payload, timeout=30)
    r.raise_for_status()
    data = r.json()
    if data["status"] != 0:
        raise RuntimeError(f"TT-RSS API 错误: {data['content'].get('error')}")
    return data["content"]


def login() -> str:
    content = api_post({"op": "login", "user": TTRSS_USER, "password": TTRSS_PASS})
    return content["session_id"]


def get_categories(sid: str) -> dict[int, str]:
    cats = api_post({
        "op": "getCategories",
        "sid": sid,
        "unread_only": False,
        "enable_nested": False,
        "include_empty": True,
    })
    return {c["id"]: c["title"] for c in cats}


def get_all_feeds(sid: str) -> list[dict]:
    feeds = api_post({
        "op": "getFeeds",
        "sid": sid,
        "cat_id": -4,        # -4 = 全部
        "unread_only": False,
        "include_nested": True,
    })
    # 过滤掉虚拟条目（id < 0）和没有 feed_url 的条目
    return [f for f in feeds if f.get("id", 0) > 0 and f.get("feed_url")]


# ── RSSHub 路由名称查找 ────────────────────────────────────────────────────────

def load_route_index(routes_json: Path) -> dict[str, str]:
    """
    返回 {path_pattern: route_name} 映射，例如：
      "/huxiu/moment" -> "虎嗅 - 24小时"
    同时建立 namespace 级索引供模糊匹配。
    """
    if not routes_json.exists():
        return {}
    with open(routes_json, encoding="utf-8") as f:
        data = json.load(f)

    index: dict[str, str] = {}
    for ns_key, ns_val in data.items():
        for path_pat, route in ns_val.get("routes", {}).items():
            # 规范化：确保以 / 开头，去掉末尾 /
            full = f"/{ns_key}{path_pat}".rstrip("/")
            index[full] = route.get("name", "")
    return index


def match_route_name(feed_path: str, route_index: dict[str, str]) -> str:
    """
    用 feed_path（如 /huxiu/moment）在 route_index 中找路由名称。
    先精确匹配，再用正则把路径参数占位符替换后匹配。
    """
    if not route_index:
        return ""

    # 精确匹配
    if feed_path in route_index:
        return route_index[feed_path]

    # 模糊匹配：把路由模式中的参数占位符变成正则
    for pat, name in route_index.items():
        # 把 :param、:param{.+}? 等替换为 [^/]+ 或 .+
        regex = re.sub(r":\w+\{[^}]+\}\?", ".+", pat)
        regex = re.sub(r":\w+\?", "[^/]*", regex)
        regex = re.sub(r":\w+", "[^/]+", regex)
        regex = f"^{regex}$"
        if re.match(regex, feed_path):
            return name

    return ""


# ── 辅助函数 ──────────────────────────────────────────────────────────────────

_LOCALPROXY_RE = re.compile(r"https?://localproxy/(\d+)(.*)")

def to_local_url(feed_url: str) -> str:
    """把 localproxy/1200/... 转换为 localhost:1200/..."""
    m = _LOCALPROXY_RE.match(feed_url)
    if m:
        return f"http://localhost:{m.group(1)}{m.group(2)}"
    return feed_url


def extract_path(feed_url: str) -> str:
    """从 feed_url 中提取路径部分，供路由名称查找用。"""
    # http://localproxy/1200/huxiu/moment -> /huxiu/moment
    m = _LOCALPROXY_RE.match(feed_url)
    if m:
        return m.group(2).split("?")[0].rstrip("/") or "/"
    # http://localhost:1200/huxiu/moment
    m2 = re.match(r"https?://[^/]*/(\d+)(.*)", feed_url)
    if m2:
        return m2.group(2).split("?")[0].rstrip("/") or "/"
    # 普通 URL：取路径
    try:
        from urllib.parse import urlparse
        return urlparse(feed_url).path.rstrip("/") or "/"
    except Exception:
        return ""


def classify_source(feed_url: str) -> str:
    low = feed_url.lower()
    if "localproxy/1200" in low or "localhost:1200" in low or "127.0.0.1:1200" in low:
        return "本地 RSSHub"
    if "werss" in low or "rss.mifaw" in low:
        return "本地 WeRss"
    return "直接订阅"


def classify_error(error_msg: str) -> str | None:
    if not error_msg:
        return None
    low = error_msg.lower()
    for code, label in [
        ("502", "502 网关错误"),
        ("503", "503 服务不可用"),
        ("404", "404 地址不存在"),
        ("403", "403 禁止访问"),
        ("500", "500 服务器错误"),
        ("401", "401 未授权"),
    ]:
        if code in error_msg:
            return label
    if "timed out" in low or "operation timed out" in low or "curl error 28" in low:
        return "连接超时"
    if "ssl" in low or "certificate" in low:
        return "SSL 错误"
    if "could not resolve" in low or "name resolution" in low:
        return "DNS 解析失败"
    if "connection refused" in low:
        return "连接被拒绝"
    if "parse" in low or "invalid xml" in low:
        return "解析错误"
    return "其他错误"


# ── Excel 输出 ─────────────────────────────────────────────────────────────────

HEADERS = [
    "标题", "订阅 URL", "本地原始地址", "路由名称", "分类", "来源",
    "最后更新", "最后拉取", "未读数", "状态", "错误分类", "错误信息", "备注",
]

HEADER_FILL  = PatternFill("solid", fgColor="4472C4")
HEADER_FONT  = Font(color="FFFFFF", bold=True)
ERROR_FILL   = PatternFill("solid", fgColor="FFD7D7")
OK_FILL      = PatternFill("solid", fgColor="E2EFDA")

COL_WIDTHS = [30, 55, 50, 30, 18, 15, 20, 20, 8, 10, 16, 80, 20]


def build_excel(rows: list[list]) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "订阅源"

    # 写表头
    ws.append(HEADERS)
    for i, cell in enumerate(ws[1], start=1):
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")
        ws.column_dimensions[cell.column_letter].width = COL_WIDTHS[i - 1]
    ws.row_dimensions[1].height = 20
    ws.freeze_panes = "A2"

    # 写数据
    for row in rows:
        ws.append(row)
        last_row = ws[ws.max_row]
        has_error = row[9] == "有错误"
        fill = ERROR_FILL if has_error else OK_FILL
        for cell in last_row:
            cell.fill = fill
            if isinstance(cell.value, str) and len(cell.value) > 100:
                cell.alignment = Alignment(wrap_text=True, vertical="top")

    # 自动筛选
    ws.auto_filter.ref = f"A1:{ws.cell(1, len(HEADERS)).coordinate}"

    wb.save(OUTPUT_FILE)


# ── 主流程 ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print(f"[1/4] 登录 TT-RSS {TTRSS_URL} ...")
    sid = login()
    print(f"      Session: {sid[:16]}...")

    print("[2/4] 获取分类与订阅源 ...")
    cat_map   = get_categories(sid)
    all_feeds = get_all_feeds(sid)
    print(f"      分类 {len(cat_map)} 个，订阅源 {len(all_feeds)} 条")

    print("[3/4] 加载 RSSHub 路由索引 ...")
    route_index = load_route_index(ROUTES_JSON)
    print(f"      已加载 {len(route_index)} 条路由")

    print("[4/4] 生成报告 ...")
    rows: list[list] = []
    error_count = 0

    for feed in all_feeds:
        feed_url   = feed.get("feed_url", "")
        local_url  = to_local_url(feed_url)
        feed_path  = extract_path(feed_url)
        route_name = match_route_name(feed_path, route_index) or feed.get("title", "")
        source     = classify_source(feed_url)
        cat_name   = cat_map.get(feed.get("cat_id", 0), "未分类")

        last_updated_ts = feed.get("last_updated")
        last_updated = (
            datetime.fromtimestamp(int(last_updated_ts))
            if last_updated_ts and int(last_updated_ts) > 0
            else None
        )

        last_error = (feed.get("last_error") or "").strip()
        has_error  = bool(last_error)
        status     = "有错误" if has_error else "正常"
        error_cat  = classify_error(last_error)

        if has_error:
            error_count += 1

        rows.append([
            feed.get("title", ""),   # 标题
            feed_url,                # 订阅 URL
            local_url,               # 本地原始地址
            route_name,              # 路由名称
            cat_name,                # 分类
            source,                  # 来源
            last_updated,            # 最后更新
            last_updated,            # 最后拉取（TT-RSS API 不区分，使用同一字段）
            feed.get("unread", 0),   # 未读数
            status,                  # 状态
            error_cat,               # 错误分类
            last_error or None,      # 错误信息
            None,                    # 备注
        ])

    # 先按「有错误」排序，再按分类
    rows.sort(key=lambda r: (0 if r[9] == "有错误" else 1, r[4], r[0]))

    build_excel(rows)

    total = len(rows)
    ok    = total - error_count
    print(f"\n完成！")
    print(f"  总计  : {total} 条")
    print(f"  正常  : {ok} 条")
    print(f"  有错误: {error_count} 条")
    print(f"  输出  : {OUTPUT_FILE.resolve()}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
