---
name: rsshub-route-rebuild
description: Fix and validate broken RSSHub routes that fail at runtime, including selector updates, WeChat MP fallbacks, cache-safe item fetching, and Docker rebuild/restart/verification steps. Use when a route returns 503 with TypeError, content selector mismatch, or WeChat MP WAF errors and you need to rebuild and retest the containerized feed.
---

# Rsshub Route Rebuild

## Overview

Restore a failing RSSHub route by correcting selectors and item parsing, adding safe fallbacks for WeChat MP, then rebuilding and verifying the Dockerized service.

## Workflow

### 1. Reproduce and capture the error

- Hit the route directly and record the error message and route path.
- On Windows PowerShell, use `curl.exe` to avoid the `curl` alias.

```powershell
curl.exe -i http://127.0.0.1:1200/<namespace>/<route>/<param>
```

### 2. Locate the route implementation

- Search the route folder and open the main handler and helper utilities.

```powershell
rg -n "<namespace>" lib\routes -g"*.ts"
```

### 3. Inspect source HTML from inside the container

- If local TLS or network policy blocks fetch, run a small Node fetch inside the container to inspect selectors.

```powershell
docker compose exec -T rsshub --% node -e "fetch('https://example.com/page').then(r=>r.text()).then(t=>console.log(t.slice(0,400)))"
```

- Use cheerio in the container to verify list selectors and link extraction.

```powershell
docker compose exec -T rsshub --% node -e "import('cheerio').then(({load})=>fetch('https://example.com/page').then(r=>r.text()).then(html=>{const $=load(html); const list=$('.list').find('li').toArray(); console.log('list', list.length); if(list.length){ const a=$(list[0]).find('a'); console.log(a.attr('href'), a.text().trim()); }}))"
```

### 4. Fix parsing logic and route file

- Update the route file and helpers to match the latest site DOM structure (e.g., include `.v_news_content` if `#vsb_content` is empty).
- Ensure `cache.tryGet()` wraps detail fetches.
- Guard date parsing: only set `pubDate` when a match exists; do not use `new Date()` fallback.
- For WeChat MP links, call `finishArticleItem()` but catch errors to avoid WAF failures taking down the whole route.
- Keep `link` unique and human-readable.
- Do not set `referrerpolicy` attributes; remove them if present in scraped HTML.

### 5. Remove old container, rebuild, and restart (no cache)

```powershell
docker compose rm -sf rsshub
docker compose build --no-cache rsshub
docker compose up -d --no-deps --force-recreate rsshub
docker compose exec -T redis redis-cli FLUSHALL
```

### 6. Verify

```powershell
curl.exe -i http://127.0.0.1:1200/<namespace>/<route>/<param>
```

- Expect `HTTP/1.1 200 OK` and valid RSS XML.

## Notes

- If Docker build fails due to auth errors, retry or run `docker login` and rebuild.
- If the route still fails, check logs:

```powershell
docker compose ps
docker compose logs --no-color --tail 200 rsshub
```

## Validation (conda)

Use the `minimind` environment by path (see `conda env list`):

```powershell
conda run -p D:\\conda_python_env\\minimind python C:\\Users\\yehongxin\\.codex\\skills\\.system\\skill-creator\\scripts\\quick_validate.py D:\\github\\RSSHub\\skills\\rsshub-route-rebuild
```

Or use the helper script:

```powershell
scripts\\validate-skill.ps1
scripts\\validate-skill.ps1 -SkillPath D:\\github\\RSSHub\\skills\\rsshub-route-rebuild
```
