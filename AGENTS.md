## Review guidelines

### Route Configuration

1. **Example Format**: The `example` field must start with `/` and be a working RSSHub route path (e.g., `/example/route`), not a full URL or source website URL.

2. **Route Name**: Do NOT repeat the namespace name in the route name. The namespace is already defined in `namespace.ts`.

3. **Radar Source Format**: Use relative paths without `https://` prefix in `radar[]. source`. Example: `source: ['www.example.com/path']` instead of `source: ['https://www.example.com/path']`.

4. **Radar Target**: The `radar[].target` must match the route path. If the source URL does not contain a path parameter, do not include it in the target.

5. **Namespace URL**: In `namespace.ts`, the `url` field should NOT include the `https://` protocol prefix.

6. **Single Category**: Provide only ONE category in the `categories` array, not multiple.

7. **Unnecessary Files**: Do NOT create separate `README.md` or `radar.ts` files. Put descriptions in `Route['description']` and radar rules in `Route['radar']`.

8. **Legacy Router**: Do NOT add routes to `lib/router.js` - this file is deprecated.

9. **Features Accuracy**: Set `requirePuppeteer: true` only if your route actually uses Puppeteer. Do not mismatch feature flags.

10. **Maintainer GitHub ID**: The `maintainers` field must contain valid GitHub usernames. Verify that the username exists before adding it.

### Code Style

11. **Naming Convention**: Use `camelCase` for variable names in JavaScript/TypeScript. Avoid `snake_case` (e.g., use `videoUrl` instead of `video_url`).

12. **Type Imports**: Use `import type { ... }` for type-only imports instead of `import { ... }`.

13. **Import Sorting**: Keep imports sorted. Run autofix if linter reports import order issues.

14. **Unnecessary Template Literals**: Do not use template literals when simple strings suffice (e.g., use `'plain string'` instead of `` `plain string` ``).

15. **Avoid Loading HTML Twice**: Do not call `load()` from cheerio multiple times on the same content. Reuse the initial `$` object.

16. **Async/Await in Close**: When closing Puppeteer pages/browsers, use `await page.close()` and `await browser.close()` instead of non-awaited calls.

17. **No Explicit Null**: No need to explicitly set a property to `null` if it does not exist - just omit it.

18. **Valid Item Properties**: Only use properties defined in [lib/types. ts](https://github.com/DIYgod/RSSHub/blob/master/lib/types.ts). Custom properties like `avatar`, `bio` will be ignored by RSSHub.

19. **String Methods**: Use `startsWith()` instead of `includes()` when checking if a string begins with a specific prefix.

20. **Simplify Code**: Combine multiple conditional assignments into single expressions using `||` or `??` operators when appropriate.

### Data Handling

21. **Use Cache**: Always [cache](https://docs.rsshub.app/joinus/advanced/use-cache) the returned results when fetching article details in a loop using `cache.tryGet()`.

22. **Description Content**: The `description` field should contain ONLY the main article content. Do NOT include `title`, `author`, `pubDate`, or tags in `description` - they have their own dedicated fields.

23. **Category Field**: Extract tags/categories from articles and place them in the `category` field, not in `description`.

24. **pubDate Field**: Always include `pubDate` when the source provides date/time information. Use the `parseDate` utility function.

25. **No Fake Dates**: Do NOT use `new Date()` as a fallback for `pubDate`. If no date is available, leave it undefined. See [No Date documentation](https://docs.rsshub.app/joinus/advanced/pub-date#no-date).

26. **No Title Trimming**: Do not manually trim or truncate titles. RSSHub core handles title processing automatically.

27. **Unique Links**: Ensure each item's `link` is unique as it will be used as `guid`. Avoid fallback URLs that could cause duplicate `guid` values.

28. **Human-Readable Links**: The feed `link` field should point to a human-readable webpage URL, NOT an API endpoint URL.

### API and Data Fetching

29. **Prefer APIs Over Scraping**: When the target website has an API (often found by scrolling pages or checking network requests), use the API endpoint instead of HTML scraping.

30. **JSON Parsing**: When using `ofetch`, `JSON.parse` is automatically applied. Do not manually decode JSON escape sequences like `\u003C`.

31. **No Page Turning**: RSS feeds should only request the first page of content. Do not implement pagination parameters for users.

32. **Use Common Parameters**: Use RSSHub's built-in common parameters like [`limit`](https://docs.rsshub.app/guide/parameters#limit-entries) instead of implementing custom query parameters for limiting entries.

33. **No Custom Query Parameters**: Avoid using querystring parameters for route configuration. Use path parameters (`:param`) instead.

34. **No Custom Filtering**: Do not implement custom tag/category filtering in routes. Users can apply filtering using [common parameters](https://docs.rsshub.app/guide/parameters).

35. **Avoid Dynamic Hashes**: If an API requires a hash that changes across builds, extract it dynamically from the webpage rather than hardcoding it.

36. **User-Agent**: Use RSSHub's built-in [User-Agent](https://github.com/DIYgod/RSSHub/blob/master/lib/config.ts#L494) (`config.trueUA`) when making requests that need realistic browser headers.

### Media and Enclosures

37. **Valid MIME Types**: The `enclosure_type` must be a valid MIME type as defined in RFC specifications. For example, `video/youtube` is NOT valid - use actual video file URLs with proper types like `video/mp4`.

38. **Direct Media URLs**: `enclosure_url` must point directly to downloadable media files (e.g., `.mp4`, `.mp3`), not to web pages containing media.

39. **Video Poster**: Use the HTML5 `<video>` element's `poster` attribute for video thumbnails instead of adding separate `<img>` elements.

40. **No Referrer Policy in Routes**: Do not add `referrerpolicy` attributes to images/videos - RSSHub middleware handles this automatically.

### Puppeteer Usage

41. **Limit Request Types**: Do not allow every type of request through Puppeteer. Explicitly provide a list of allowed request types (e.g., `document`) to avoid wasting resources on images, scripts, etc.

42. **Use Selectors, Not Delays**: Do not use fixed `setTimeout` delays. Use `page.waitForSelector()` instead to wait for specific elements.

43. **Avoid Multiple Sessions**: Do not call Puppeteer inside `Promise.all()` loops - this creates multiple browser sessions and dramatically increases resource usage.

44. **Do Not Bypass Empty Checks**: Do not return empty arrays with custom messages to bypass RSSHub's [internal checks](https://github.com/DIYgod/RSSHub/blob/master/lib/middleware/parameter. ts#L72) for empty items. This makes it hard for users and maintainers to know if a feed is broken.

### Default Values and Examples

45. **Preserve Default Values**: Do not change documented default values for existing route parameters unless the current default is broken.

46. **Preserve Working Examples**: Do not modify existing route examples unless they no longer work.

47. **Route Parameters**: The `parameters` object keys must match the actual path parameters defined in the route path. Do not add non-existent parameters.

### Error Handling

48. **Error Messages**: Use clear, actionable error messages that help users understand what went wrong.

49. **Resolve All Review Comments**: Before requesting re-review, ensure ALL previous review comments are addressed, not just some of them.

### Code Organization

50. **Move Functions Up**: Move function definitions to the highest possible scope. Avoid defining functions inside loops or callbacks when they can be defined at module level.

51. **No Await in Loops**: Avoid using `await` inside loops when possible. Use `Promise.all()` with proper concurrency control instead.

52. **Check URL Validity**: Before using URLs from config files or namespaces, verify they don't return 404 errors.

53. **Comments Language**: Write code comments in English for consistency and accessibility.

54. **Parentheses in Arrow Functions**: Always use parentheses around arrow function parameters, even for single parameters.

## Skills

- `skills/rsshub-route-rebuild`: Unified workflow for adding or fixing RSSHub routes. Covers namespace/route metadata checks, RSS normalization, common parsing pitfalls, Docker rebuild, single-instance deployment on port `1200`, and final feed URL verification for FreshRSS usage.
- `scripts/validate-skill.ps1`: Validate the RSSHub skill using the `minimind` conda environment path.

## Route Testing Modes

- `Docker black-box` (deployment verification): test through local endpoint.
  - `curl.exe -sS -D - http://127.0.0.1:1200/<namespace>/<route>`
  - Expect `200`, `application/xml`, and `<rss` in body.
- `Local in-process white-box` (non-Docker verification): test by importing `lib/app.ts` and calling `app.request()` directly.
  - `node --import tsx --input-type=module -e "const { default: app } = await import('./lib/app.ts'); const res = await app.request('/<namespace>/<route>'); const text = await res.text(); console.log('status=' + res.status); console.log('content-type=' + (res.headers.get('content-type') ?? '')); console.log('has-rss=' + String(text.includes('<rss')));"`
  - Use this mode when you need route-level validation without container networking.
- On this Windows environment, prefer `pnpm.cmd` over `pnpm` if PowerShell execution policy blocks `pnpm.ps1`.
- Python runtime note (important): use conda environment `task_with_rss` for all Python commands on this machine.
  - Preferred (most stable on this host): `D:\conda_python_env\task_with_rss\python.exe <script_or_args>`
  - Alternative: `conda run -p D:\conda_python_env\task_with_rss python <script_or_args>`
  - Avoid plain `python ...` in PowerShell, which may point to an inaccessible interpreter.

## Docker Local Build Notes

- Keep `rsshub` as local-source build (`build.context: .`) and keep dependency services (`redis`, `browserless`, `real-browser`) on their upstream images.
- When local code changes, do not rely on plain `docker compose up -d` for `rsshub` refresh.
- Recommended refresh commands for local optimized code:
  - `docker compose build rsshub`
  - `docker compose up -d --no-deps --force-recreate rsshub`
- If dependencies are not running, start them explicitly:
  - `docker compose up -d redis browserless real-browser`
- Deployment verification:
  - `curl.exe -sS -D - http://127.0.0.1:1200/healthz`
  - `curl.exe -sS -D - http://127.0.0.1:1200/<namespace>/<route>`
- To avoid oversized local images, keep large runtime artifacts (e.g., `logs`) excluded via `.dockerignore`.
