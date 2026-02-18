---
name: rsshub-route-rebuild
description: Build, fix, and validate RSSHub routes on Windows with Docker. Use when adding a new route (including namespace/route metadata and RSS normalization), or when repairing a broken route that returns 503, selector mismatch, or WeChat MP WAF errors, and you need end-to-end local rebuild and feed verification.
---

# Rsshub Route Rebuild

## Overview

Unified workflow for adding or fixing RSSHub routes: metadata checks, RSS normalization, parsing pitfall avoidance, Docker rebuild, single-instance deployment on port `1200`, and final FreshRSS feed URL verification.

## Workflow

### 1. Discover route layout and existing implementation

- Search existing namespaces and route files under `lib/routes`.
- Confirm registration model from `lib/registry.ts` before creating files.
- Do not assume `router.ts` exists; many namespaces rely on auto-scanning `route` exports.

```powershell
rg -n "<namespace>|<site>" lib\routes
Get-ChildItem lib\routes\<namespace> -Name
```

### 2. Create or update namespace and route files

- Add `lib/routes/<namespace>/namespace.ts` if missing.
- Add/update `lib/routes/<namespace>/<route>.ts` exporting `route: Route`.
- Keep route metadata valid:
- `example` starts with `/`.
- `categories` contains exactly one category.
- `namespace.url` has no `https://`.
- `radar[].source` uses relative host/path (no protocol).
- `radar[].target` matches actual route path.
- `maintainers` must be valid GitHub IDs.
- `requirePuppeteer: true` only when Puppeteer is actually used.

```powershell
New-Item -ItemType Directory -Force lib\routes\<namespace>
```

### 3. Implement parsing and normalization rules

- Prefer source API or source RSS over page scraping when available.
- For RSS-to-RSS wrappers, parse upstream feed and normalize each item:
- Ensure `title` and unique `link` exist.
- Set `description` to main content only.
- Extract tags into `category`.
- Set `pubDate` only when source date exists, using `parseDate`.
- Keep feed `link` human-readable, not API URL.
- Use `cache.tryGet()` when fetching detail pages in loops.
- Do not call `load()` from cheerio multiple times on the same HTML.

### 4. Avoid route loader pitfalls

- Do not place `*.test.ts` under `lib/routes/**`.
- `lib/registry.ts` imports `.ts/.tsx` files under routes; test files there can break build/runtime.
- Put tests outside `lib/routes` (for example under `lib/` test suites).

### 5. Rebuild image and run one RSSHub container

```powershell
docker build -t rsshub-local-custom .
docker compose down
docker rm -f rsshub
docker run -d --name rsshub -p 127.0.0.1:1200:1200 -e CACHE_TYPE=memory rsshub-local-custom
```

- If port `1200` is occupied, free it first (`docker compose down` or stop conflicting container).
- Keep only one RSSHub service bound to `127.0.0.1:1200` when the user asks for single-instance deployment.

### 6. Verify route and XML output

```powershell
curl.exe -sS -D - http://127.0.0.1:1200/<namespace>/<route>
```

- Expect:
- `HTTP/1.1 200 OK`
- `Content-Type: application/xml; charset=utf-8`
- XML body starts with `<?xml` and contains `<rss`.

### 7. Report final subscription URLs

- Host shell / local reader:
- `http://127.0.0.1:1200/<namespace>/<route>`
- Containerized FreshRSS:
- `http://host.docker.internal:1200/<namespace>/<route>`

## Quick Troubleshooting

- If Docker build fails, inspect logs and rerun with cache disabled only when needed.
- If response is not 200, inspect running containers and RSSHub logs.

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
