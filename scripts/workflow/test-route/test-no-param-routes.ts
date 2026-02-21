/* eslint-disable no-await-in-loop, no-console, unicorn/consistent-function-scoping, unicorn/no-array-reduce, unicorn/no-array-sort, unicorn/prefer-single-call, default-case */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import Parser from 'rss-parser';

type ErrorType =
    | 'timeout'
    | 'network_error'
    | 'http_401_403_auth'
    | 'http_404_upstream'
    | 'http_429_rate_limit'
    | 'http_5xx_upstream'
    | 'http_error'
    | 'invalid_content_type'
    | 'missing_rss_tag'
    | 'rss_parse_error'
    | 'empty_items_or_invalid_feed'
    | 'unknown_error';

interface RequireConfigItem {
    name: string;
    optional?: boolean;
}

interface RouteMeta {
    name?: string;
    categories?: string[];
    maintainers?: string[];
    location?: string;
    features?: {
        requireConfig?: RequireConfigItem[] | false;
        requirePuppeteer?: boolean;
    };
}

interface NamespaceMeta {
    categories?: string[];
    routes?: Record<string, RouteMeta>;
}

type RoutesSnapshot = Record<string, NamespaceMeta>;

interface SelectedRoute {
    namespace: string;
    routePath: string;
    fullPath: string;
    url: string;
    name: string;
    category: string;
    maintainers: string[];
    location: string;
    sourceFile: string;
    requirePuppeteer: boolean;
}

interface RunOptions {
    baseUrl: string;
    concurrency: number;
    timeoutMs: number;
    retry: number;
    outputDir: string;
    routesFile: string;
    includePuppeteer: boolean;
    saveFailureBody: boolean;
    failureBodyMaxBytes: number;
}

interface SelectionStats {
    totalRoutes: number;
    noParamRoutes: number;
    selectedRoutes: number;
    skippedParameterized: number;
    skippedWildcard: number;
    skippedRequireConfig: number;
    skippedPuppeteer: number;
}

interface RouteResult {
    namespace: string;
    routePath: string;
    fullPath: string;
    url: string;
    name: string;
    category: string;
    maintainers: string[];
    location: string;
    sourceFile: string;
    requirePuppeteer: boolean;
    testedAt: string;
    testedAtLocal: string;
    attempts: number;
    elapsedMs: number;
    ok: boolean;
    status?: number;
    statusText?: string;
    contentType?: string;
    contentLength: number;
    rssTagDetected: boolean;
    parseOk: boolean;
    feedTitle?: string;
    itemCount?: number;
    errorType?: ErrorType;
    errorMessage?: string;
    errorDetail?: string;
    htmlMessageExtract?: string[];
    stackSnippet?: string;
    bodyFile?: string;
    reproCurl: string;
    suggestedFixHint?: string;
}

interface Report {
    meta: {
        runId: string;
        testedAt: string;
        testedAtLocal: string;
        baseUrl: string;
        concurrency: number;
        timeoutMs: number;
        retry: number;
        includePuppeteer: boolean;
        saveFailureBody: boolean;
        failureBodyMaxBytes: number;
        routesFile: string;
        nodeVersion: string;
    };
    selection: SelectionStats;
    summary: {
        total: number;
        success: number;
        failed: number;
        successRate: number;
        totalElapsedMs: number;
        avgElapsedMs: number;
        p95ElapsedMs: number;
        errorTypeCount: Record<string, number>;
    };
    results: RouteResult[];
}

interface AttemptOutcome {
    result: RouteResult;
    retryable: boolean;
}

const DEFAULT_OPTIONS: RunOptions = {
    baseUrl: 'http://127.0.0.1:1200',
    concurrency: 8,
    timeoutMs: 20000,
    retry: 1,
    outputDir: 'logs/route-test',
    routesFile: 'assets/build/routes.json',
    includePuppeteer: true,
    saveFailureBody: true,
    failureBodyMaxBytes: 524288,
};

const REPORT_FILE_AGENT_JSON = 'agent-report.json';
const REPORT_FILE_AGENT_MD = 'agent-report.md';
const REPORT_FILE_HUMAN_XLSX = 'human-report.xlsx';

const parser = new Parser();

function parseBoolean(value: string): boolean {
    return ['1', 'true', 'yes', 'y', 'on'].includes(value.toLowerCase());
}

function parseInteger(value: string, field: string): number {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`Invalid ${field}: ${value}`);
    }
    return parsed;
}

function parseArgs(argv: string[]): RunOptions {
    const options: RunOptions = { ...DEFAULT_OPTIONS };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--') {
            continue;
        }
        if (!arg.startsWith('--')) {
            continue;
        }

        const [rawKey, rawInlineValue] = arg.slice(2).split('=', 2);
        const key = rawKey.trim();
        const inlineValue = rawInlineValue?.trim();
        const nextValue = argv[i + 1];
        const value = inlineValue ?? (nextValue?.startsWith('--') ? undefined : nextValue);

        const consumeNext = inlineValue === undefined && value !== undefined;
        if (consumeNext) {
            i++;
        }

        switch (key) {
            case 'base-url':
                if (!value) {
                    throw new Error('--base-url requires a value');
                }
                options.baseUrl = value;
                break;
            case 'concurrency':
                if (!value) {
                    throw new Error('--concurrency requires a value');
                }
                options.concurrency = parseInteger(value, 'concurrency');
                break;
            case 'timeout-ms':
                if (!value) {
                    throw new Error('--timeout-ms requires a value');
                }
                options.timeoutMs = parseInteger(value, 'timeout-ms');
                break;
            case 'retry':
                if (!value) {
                    throw new Error('--retry requires a value');
                }
                options.retry = parseInteger(value, 'retry');
                break;
            case 'output-dir':
                if (!value) {
                    throw new Error('--output-dir requires a value');
                }
                options.outputDir = value;
                break;
            case 'routes-file':
                if (!value) {
                    throw new Error('--routes-file requires a value');
                }
                options.routesFile = value;
                break;
            case 'include-puppeteer':
                if (!value) {
                    throw new Error('--include-puppeteer requires a value');
                }
                options.includePuppeteer = parseBoolean(value);
                break;
            case 'save-failure-body':
                if (!value) {
                    throw new Error('--save-failure-body requires a value');
                }
                options.saveFailureBody = parseBoolean(value);
                break;
            case 'failure-body-max-bytes':
                if (!value) {
                    throw new Error('--failure-body-max-bytes requires a value');
                }
                options.failureBodyMaxBytes = parseInteger(value, 'failure-body-max-bytes');
                break;
            default:
                throw new Error(`Unknown argument: --${key}`);
        }
    }

    options.baseUrl = options.baseUrl.replace(/\/+$/, '');
    options.concurrency = Math.max(1, options.concurrency);
    options.retry = Math.max(0, options.retry);
    options.timeoutMs = Math.max(1000, options.timeoutMs);
    options.failureBodyMaxBytes = Math.max(1024, options.failureBodyMaxBytes);

    return options;
}

function formatRunId(date: Date): string {
    const pad = (input: number) => String(input).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function formatLocalDateTime(date: Date): string {
    const pad = (input: number) => String(input).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function includesRequiredConfig(route: RouteMeta): boolean {
    const requireConfig = route.features?.requireConfig;
    if (!Array.isArray(requireConfig)) {
        return false;
    }
    return requireConfig.some((config) => !config.optional && config.name !== 'ALLOW_USER_SUPPLY_UNSAFE_DOMAIN');
}

function pickCategory(namespaceData: NamespaceMeta, route: RouteMeta): string {
    if (route.categories?.length) {
        return route.categories[0];
    }
    if (namespaceData.categories?.length) {
        return namespaceData.categories[0];
    }
    return 'other';
}

function makeSelectedRoutes(snapshot: RoutesSnapshot, options: RunOptions): { routes: SelectedRoute[]; stats: SelectionStats } {
    const selected: SelectedRoute[] = [];
    const stats: SelectionStats = {
        totalRoutes: 0,
        noParamRoutes: 0,
        selectedRoutes: 0,
        skippedParameterized: 0,
        skippedWildcard: 0,
        skippedRequireConfig: 0,
        skippedPuppeteer: 0,
    };

    for (const [namespace, namespaceData] of Object.entries(snapshot)) {
        for (const [routePath, route] of Object.entries(namespaceData.routes ?? {})) {
            stats.totalRoutes++;

            if (routePath.includes(':')) {
                stats.skippedParameterized++;
                continue;
            }
            if (routePath.includes('*')) {
                stats.skippedWildcard++;
                continue;
            }

            stats.noParamRoutes++;

            if (includesRequiredConfig(route)) {
                stats.skippedRequireConfig++;
                continue;
            }

            const requirePuppeteer = route.features?.requirePuppeteer === true;
            if (!options.includePuppeteer && requirePuppeteer) {
                stats.skippedPuppeteer++;
                continue;
            }

            const fullPath = `/${namespace}${routePath}`;
            const sourceFile = route.location ? `lib/routes/${namespace}/${route.location}` : `lib/routes/${namespace}/unknown`;
            selected.push({
                namespace,
                routePath,
                fullPath,
                url: `${options.baseUrl}${fullPath}`,
                name: route.name || fullPath,
                category: pickCategory(namespaceData, route),
                maintainers: route.maintainers ?? [],
                location: route.location ?? 'unknown',
                sourceFile,
                requirePuppeteer,
            });
        }
    }

    selected.sort((left, right) => left.fullPath.localeCompare(right.fullPath));
    stats.selectedRoutes = selected.length;
    return { routes: selected, stats };
}

function isLikelyXmlContentType(contentType: string | undefined): boolean {
    if (!contentType) {
        return false;
    }
    const normalized = contentType.toLowerCase();
    return normalized.includes('xml') || normalized.includes('rss') || normalized.includes('atom');
}

function detectRssTag(content: string): boolean {
    return /<(rss|feed|rdf:rdf)\b/i.test(content);
}

function stripHtmlTags(input: string): string {
    return input
        .replaceAll(/<[^>]+>/g, ' ')
        .replaceAll(/\s+/g, ' ')
        .trim();
}

function extractHtmlMessage(body: string): string[] {
    const matches = body.matchAll(/<p\s+class=["']message["'][^>]*>([\s\S]*?)<\/p>/gi);
    const values: string[] = [];
    for (const match of matches) {
        const cleaned = stripHtmlTags(match[1] ?? '');
        if (cleaned) {
            values.push(cleaned);
        }
        if (values.length >= 5) {
            break;
        }
    }
    return values;
}

function extractStackSnippet(body: string): string | undefined {
    const pre = body.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (pre?.[1]) {
        return stripHtmlTags(pre[1]).slice(0, 1500);
    }

    const lines = body
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.includes('Error') || line.includes('at '))
        .slice(0, 20);
    if (lines.length) {
        return lines.join('\n').slice(0, 1500);
    }
    return undefined;
}

function classifyHttpError(status: number): ErrorType {
    if (status === 401 || status === 403) {
        return 'http_401_403_auth';
    }
    if (status === 404) {
        return 'http_404_upstream';
    }
    if (status === 429) {
        return 'http_429_rate_limit';
    }
    if (status >= 500) {
        return 'http_5xx_upstream';
    }
    return 'http_error';
}

function errorTypeToHint(errorType: ErrorType): string {
    switch (errorType) {
        case 'timeout':
            return 'Check upstream responsiveness and route timeout-sensitive parsing.';
        case 'network_error':
            return 'Validate upstream host accessibility and DNS/proxy behavior.';
        case 'http_401_403_auth':
            return 'Check whether upstream now requires credentials or updated headers.';
        case 'http_404_upstream':
            return 'Verify endpoint URL or route source selector/API path changes.';
        case 'http_429_rate_limit':
            return 'Reduce request frequency, add cache, or adjust anti-crawler handling.';
        case 'http_5xx_upstream':
            return 'Inspect upstream service availability and add defensive fallback parsing.';
        case 'http_error':
            return 'Inspect upstream response and update handler logic for new status behavior.';
        case 'invalid_content_type':
            return 'Route returned non-XML content. Check request URL/anti-bot and parser target.';
        case 'missing_rss_tag':
            return 'XML/RSS tag missing. Likely fetched error page or unexpected payload format.';
        case 'rss_parse_error':
            return 'RSS parser failed. Check route output validity and upstream content changes.';
        case 'empty_items_or_invalid_feed':
            return 'Feed structure is technically parseable but likely invalid/empty.';
        case 'unknown_error':
            return 'Inspect failure body and stack snippet for unclassified regression.';
    }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'RSSHubRouteTester/1.0',
            },
        });
    } finally {
        clearTimeout(timer);
    }
}

function toSafeFileId(fullPath: string): string {
    const digest = createHash('sha1').update(fullPath).digest('hex').slice(0, 8);
    const normalized = fullPath
        .replaceAll('/', '_')
        .replaceAll(/[^a-zA-Z0-9._-]/g, '_')
        .replaceAll(/_+/g, '_')
        .replace(/^_/, '');
    const prefix = normalized || 'root';
    return `${prefix}_${digest}`;
}

function truncateByBytes(text: string, maxBytes: number): { content: string; truncated: boolean } {
    const buffer = Buffer.from(text, 'utf8');
    if (buffer.byteLength <= maxBytes) {
        return { content: text, truncated: false };
    }
    const sliced = buffer.subarray(0, maxBytes).toString('utf8');
    return { content: sliced, truncated: true };
}

async function writeFailureBody(
    route: SelectedRoute,
    body: string,
    failuresDir: string,
    maxBytes: number
): Promise<{ filePath: string; truncated: boolean }> {
    const safeId = toSafeFileId(route.fullPath);
    const relativePath = `failures/${safeId}.txt`;
    const absolutePath = path.join(failuresDir, `${safeId}.txt`);
    const { content, truncated } = truncateByBytes(body, maxBytes);
    await writeFile(absolutePath, content, 'utf8');
    return { filePath: relativePath, truncated };
}

function makeReproCurl(url: string): string {
    return `curl.exe -sS -D - "${url}"`;
}

function isRetryableError(result: RouteResult): boolean {
    if (!result.errorType) {
        return false;
    }
    return ['timeout', 'network_error', 'http_5xx_upstream', 'http_429_rate_limit'].includes(result.errorType);
}

async function executeSingleAttempt(
    route: SelectedRoute,
    options: RunOptions,
    testedAt: string,
    testedAtLocal: string,
    failuresDir: string
): Promise<AttemptOutcome> {
    const start = performance.now();
    const reproCurl = makeReproCurl(route.url);

    try {
        const response = await fetchWithTimeout(route.url, options.timeoutMs);
        const body = await response.text();
        const elapsedMs = Math.round(performance.now() - start);
        const contentType = response.headers.get('content-type') ?? undefined;
        const contentLength = Buffer.byteLength(body, 'utf8');
        const htmlMessageExtract = extractHtmlMessage(body);
        const stackSnippet = extractStackSnippet(body);

        if (!response.ok) {
            const errorType = classifyHttpError(response.status);
            let bodyFile: string | undefined;
            let errorDetail = `HTTP ${response.status} ${response.statusText}`;
            if (htmlMessageExtract.length) {
                errorDetail += ` | message: ${htmlMessageExtract.join(' | ')}`;
            }
            if (options.saveFailureBody) {
                const saved = await writeFailureBody(route, body, failuresDir, options.failureBodyMaxBytes);
                bodyFile = saved.filePath;
                if (saved.truncated) {
                    errorDetail += ' | response body truncated';
                }
            }
            return {
                result: {
                    ...route,
                    testedAt,
                    testedAtLocal,
                    attempts: 1,
                    elapsedMs,
                    ok: false,
                    status: response.status,
                    statusText: response.statusText,
                    contentType,
                    contentLength,
                    rssTagDetected: detectRssTag(body),
                    parseOk: false,
                    errorType,
                    errorMessage: `HTTP error ${response.status} (${response.statusText})`,
                    errorDetail,
                    htmlMessageExtract: htmlMessageExtract.length ? htmlMessageExtract : undefined,
                    stackSnippet,
                    bodyFile,
                    reproCurl,
                    suggestedFixHint: errorTypeToHint(errorType),
                },
                retryable: response.status >= 500 || response.status === 429,
            };
        }

        const rssTagDetected = detectRssTag(body);
        const xmlContentType = isLikelyXmlContentType(contentType);

        if (!rssTagDetected && !xmlContentType) {
            let bodyFile: string | undefined;
            if (options.saveFailureBody) {
                const saved = await writeFailureBody(route, body, failuresDir, options.failureBodyMaxBytes);
                bodyFile = saved.filePath;
            }
            const errorType: ErrorType = 'invalid_content_type';
            return {
                result: {
                    ...route,
                    testedAt,
                    testedAtLocal,
                    attempts: 1,
                    elapsedMs,
                    ok: false,
                    status: response.status,
                    statusText: response.statusText,
                    contentType,
                    contentLength,
                    rssTagDetected,
                    parseOk: false,
                    errorType,
                    errorMessage: 'Response does not look like RSS/Atom XML',
                    errorDetail: `content-type=${contentType ?? 'unknown'} and RSS tags not detected`,
                    htmlMessageExtract: htmlMessageExtract.length ? htmlMessageExtract : undefined,
                    stackSnippet,
                    bodyFile,
                    reproCurl,
                    suggestedFixHint: errorTypeToHint(errorType),
                },
                retryable: false,
            };
        }

        try {
            const parsedFeed = (await parser.parseString(body)) as { title?: string; items?: unknown[] };
            const feedTitle = parsedFeed.title?.trim();
            const itemCount = Array.isArray(parsedFeed.items) ? parsedFeed.items.length : 0;

            if (!feedTitle && itemCount === 0) {
                let bodyFile: string | undefined;
                if (options.saveFailureBody) {
                    const saved = await writeFailureBody(route, body, failuresDir, options.failureBodyMaxBytes);
                    bodyFile = saved.filePath;
                }
                const errorType: ErrorType = 'empty_items_or_invalid_feed';
                return {
                    result: {
                        ...route,
                        testedAt,
                        testedAtLocal,
                        attempts: 1,
                        elapsedMs,
                        ok: false,
                        status: response.status,
                        statusText: response.statusText,
                        contentType,
                        contentLength,
                        rssTagDetected,
                        parseOk: true,
                        feedTitle,
                        itemCount,
                        errorType,
                        errorMessage: 'Feed parsed but appears empty or invalid',
                        errorDetail: 'Parsed feed has no title and zero items',
                        htmlMessageExtract: htmlMessageExtract.length ? htmlMessageExtract : undefined,
                        stackSnippet,
                        bodyFile,
                        reproCurl,
                        suggestedFixHint: errorTypeToHint(errorType),
                    },
                    retryable: false,
                };
            }

            return {
                result: {
                    ...route,
                    testedAt,
                    testedAtLocal,
                    attempts: 1,
                    elapsedMs,
                    ok: true,
                    status: response.status,
                    statusText: response.statusText,
                    contentType,
                    contentLength,
                    rssTagDetected,
                    parseOk: true,
                    feedTitle,
                    itemCount,
                    reproCurl,
                },
                retryable: false,
            };
        } catch (error) {
            let bodyFile: string | undefined;
            if (options.saveFailureBody) {
                const saved = await writeFailureBody(route, body, failuresDir, options.failureBodyMaxBytes);
                bodyFile = saved.filePath;
            }
            const errorType: ErrorType = rssTagDetected ? 'rss_parse_error' : 'missing_rss_tag';
            const parseError = error instanceof Error ? error.message : String(error);
            return {
                result: {
                    ...route,
                    testedAt,
                    testedAtLocal,
                    attempts: 1,
                    elapsedMs,
                    ok: false,
                    status: response.status,
                    statusText: response.statusText,
                    contentType,
                    contentLength,
                    rssTagDetected,
                    parseOk: false,
                    errorType,
                    errorMessage: `RSS parse failed: ${parseError}`,
                    errorDetail: `content-type=${contentType ?? 'unknown'}`,
                    htmlMessageExtract: htmlMessageExtract.length ? htmlMessageExtract : undefined,
                    stackSnippet,
                    bodyFile,
                    reproCurl,
                    suggestedFixHint: errorTypeToHint(errorType),
                },
                retryable: false,
            };
        }
    } catch (error) {
        const elapsedMs = Math.round(performance.now() - start);
        const isTimeout = error instanceof Error && error.name === 'AbortError';
        const errorType: ErrorType = isTimeout ? 'timeout' : 'network_error';
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            result: {
                ...route,
                testedAt,
                testedAtLocal,
                attempts: 1,
                elapsedMs,
                ok: false,
                contentLength: 0,
                rssTagDetected: false,
                parseOk: false,
                errorType,
                errorMessage,
                errorDetail: `${errorType}: ${errorMessage}`,
                reproCurl,
                suggestedFixHint: errorTypeToHint(errorType),
            },
            retryable: true,
        };
    }
}

async function testRoute(
    route: SelectedRoute,
    options: RunOptions,
    testedAt: string,
    testedAtLocal: string,
    failuresDir: string
): Promise<RouteResult> {
    const maxAttempts = options.retry + 1;
    let lastResult: RouteResult | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const { result, retryable } = await executeSingleAttempt(route, options, testedAt, testedAtLocal, failuresDir);
        result.attempts = attempt;
        lastResult = result;

        if (result.ok || !retryable || attempt === maxAttempts || !isRetryableError(result)) {
            return result;
        }

        const backoffMs = 300 * attempt;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    return (
        lastResult ?? {
            ...route,
            testedAt,
            testedAtLocal,
            attempts: maxAttempts,
            elapsedMs: 0,
            ok: false,
            contentLength: 0,
            rssTagDetected: false,
            parseOk: false,
            errorType: 'unknown_error',
            errorMessage: 'Unknown failure',
            errorDetail: 'No execution result available',
            reproCurl: makeReproCurl(route.url),
            suggestedFixHint: errorTypeToHint('unknown_error'),
        }
    );
}

async function runWithConcurrency<Input, Output>(
    items: Input[],
    concurrency: number,
    worker: (item: Input, index: number) => Promise<Output>
): Promise<Output[]> {
    const results = Array.from({length: items.length});
    let cursor = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (true) {
            const index = cursor;
            cursor++;
            if (index >= items.length) {
                return;
            }
            results[index] = await worker(items[index], index);
        }
    });

    await Promise.all(workers);
    return results;
}

function percentile(values: number[], p: number): number {
    if (!values.length) {
        return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[index];
}

function buildSummary(results: RouteResult[], totalElapsedMs: number): Report['summary'] {
    const total = results.length;
    const success = results.filter((result) => result.ok).length;
    const failed = total - success;
    const elapsedValues = results.map((result) => result.elapsedMs);
    const average = elapsedValues.length ? Math.round(elapsedValues.reduce((sum, value) => sum + value, 0) / elapsedValues.length) : 0;
    const errorTypeCount = results
        .filter((result) => !result.ok && result.errorType)
        .reduce<Record<string, number>>((accumulator, result) => {
            const key = result.errorType as string;
            accumulator[key] = (accumulator[key] ?? 0) + 1;
            return accumulator;
        }, {});

    return {
        total,
        success,
        failed,
        successRate: total ? Number(((success / total) * 100).toFixed(2)) : 0,
        totalElapsedMs,
        avgElapsedMs: average,
        p95ElapsedMs: percentile(elapsedValues, 95),
        errorTypeCount,
    };
}

function toFixPriority(errorType: ErrorType | undefined): 'P0' | 'P1' | 'P2' {
    if (!errorType) {
        return 'P2';
    }
    if (errorType === 'http_5xx_upstream') {
        return 'P0';
    }
    if (['rss_parse_error', 'missing_rss_tag', 'invalid_content_type', 'empty_items_or_invalid_feed'].includes(errorType)) {
        return 'P1';
    }
    return 'P2';
}

function buildAgentMarkdown(report: Report): string {
    const lines: string[] = [];
    const failedResults = report.results.filter((result) => !result.ok);
    const slowestResults = [...report.results].sort((left, right) => right.elapsedMs - left.elapsedMs).slice(0, 20);

    lines.push('# RSSHub No-Param Routes Test Report', '', '## Execution', `- runId: \`${report.meta.runId}\``, `- testedAt: \`${report.meta.testedAt}\``, `- baseUrl: \`${report.meta.baseUrl}\``, `- concurrency: \`${report.meta.concurrency}\``, `- timeoutMs: \`${report.meta.timeoutMs}\``, `- retry: \`${report.meta.retry}\``, '', '## Selection', `- totalRoutes: \`${report.selection.totalRoutes}\``, `- noParamRoutes: \`${report.selection.noParamRoutes}\``, `- selectedRoutes: \`${report.selection.selectedRoutes}\``, `- skippedParameterized: \`${report.selection.skippedParameterized}\``, `- skippedWildcard: \`${report.selection.skippedWildcard}\``, `- skippedRequireConfig: \`${report.selection.skippedRequireConfig}\``, `- skippedPuppeteer: \`${report.selection.skippedPuppeteer}\``, '', '## Summary', `- total: \`${report.summary.total}\``, `- success: \`${report.summary.success}\``, `- failed: \`${report.summary.failed}\``, `- successRate: \`${report.summary.successRate}%\``, `- totalElapsedMs: \`${report.summary.totalElapsedMs}\``, `- avgElapsedMs: \`${report.summary.avgElapsedMs}\``, `- p95ElapsedMs: \`${report.summary.p95ElapsedMs}\``, '', '## Error Distribution', '', '| errorType | count |', '| --- | ---: |');
    for (const [errorType, count] of Object.entries(report.summary.errorTypeCount).sort((left, right) => right[1] - left[1])) {
        lines.push(`| \`${errorType}\` | ${count} |`);
    }
    if (!Object.keys(report.summary.errorTypeCount).length) {
        lines.push('| `none` | 0 |');
    }
    lines.push('', '## Failed Routes', '');
    if (failedResults.length) {
        for (const result of failedResults.sort((left, right) => left.fullPath.localeCompare(right.fullPath))) {
            lines.push(`### ${result.fullPath}`);
            lines.push(`- priority: \`${toFixPriority(result.errorType)}\``, `- sourceFile: \`${result.sourceFile}\``, `- errorType: \`${result.errorType ?? 'unknown'}\``, `- errorMessage: ${result.errorMessage ?? 'N/A'}`, `- errorDetail: ${result.errorDetail ?? 'N/A'}`, `- status: \`${result.status ?? 'N/A'}\``, `- contentType: \`${result.contentType ?? 'N/A'}\``, `- elapsedMs: \`${result.elapsedMs}\``, `- attempts: \`${result.attempts}\``, `- reproCurl: \`${result.reproCurl}\``, `- bodyFile: \`${result.bodyFile ?? 'N/A'}\``);
            if (result.htmlMessageExtract?.length) {
                lines.push(`- htmlMessageExtract: ${result.htmlMessageExtract.join(' | ')}`);
            }
            if (result.stackSnippet) {
                lines.push('- stackSnippet:', '```text', result.stackSnippet, '```');
            }
            lines.push('');
        }
    } else {
        lines.push('- none');
    }
    lines.push('## Slowest Routes (Top 20)', '', '| route | elapsedMs | status |', '| --- | ---: | ---: |');
    for (const result of slowestResults) {
        lines.push(`| \`${result.fullPath}\` | ${result.elapsedMs} | ${result.status ?? 'N/A'} |`);
    }
    lines.push('');
    return lines.join('\n');
}

function generateExcelReport(reportPath: string, outputPath: string): void {
    const preferredPython = String.raw`D:\conda_python_env\task_with_rss\python.exe`;
    const pythonExecutable = existsSync(preferredPython) ? preferredPython : 'python';

    const pyCode = String.raw`
import json
import sys
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

report_path = sys.argv[1]
output_path = sys.argv[2]

with open(report_path, 'r', encoding='utf-8') as f:
    report = json.load(f)

rows = report.get('results', [])
ws_name = '\u8ba2\u9605\u6e90'
headers = [
    '\u6807\u9898',
    '\u8ba2\u9605 URL',
    '\u672c\u5730\u539f\u59cb\u5730\u5740',
    '\u8def\u7531\u540d\u79f0',
    '\u5206\u7c7b',
    '\u6765\u6e90',
    '\u6700\u540e\u66f4\u65b0',
    '\u6700\u540e\u62c9\u53d6',
    '\u672a\u8bfb\u6570',
    '\u72b6\u6001',
    '\u9519\u8bef\u5206\u7c7b',
    '\u9519\u8bef\u4fe1\u606f',
    '\u5907\u6ce8',
]

error_type_map = {
    'timeout': '\u8d85\u65f6',
    'network_error': '\u7f51\u7edc\u9519\u8bef',
    'http_401_403_auth': '401/403 \u8ba4\u8bc1\u9519\u8bef',
    'http_404_upstream': '404 \u4e0a\u6e38\u4e0d\u5b58\u5728',
    'http_429_rate_limit': '429 \u9650\u6d41',
    'http_5xx_upstream': '5xx \u4e0a\u6e38\u9519\u8bef',
    'http_error': 'HTTP \u9519\u8bef',
    'invalid_content_type': '\u5185\u5bb9\u7c7b\u578b\u5f02\u5e38',
    'missing_rss_tag': '\u7f3a\u5c11 RSS \u6807\u7b7e',
    'rss_parse_error': 'RSS \u89e3\u6790\u5931\u8d25',
    'empty_items_or_invalid_feed': 'Feed \u7ed3\u6784\u5f02\u5e38',
    'unknown_error': '\u672a\u77e5\u9519\u8bef',
}

wb = Workbook()
ws = wb.active
ws.title = ws_name
ws.append(headers)

header_fill = PatternFill(fill_type='solid', fgColor='D9D9D9')
fail_fill = PatternFill(fill_type='solid', fgColor='FCE4D6')
header_font = Font(bold=True)

for column in range(1, len(headers) + 1):
    cell = ws.cell(row=1, column=column)
    cell.fill = header_fill
    cell.font = header_font
    cell.alignment = Alignment(horizontal='center', vertical='center')

for r in rows:
    full_path = r.get('fullPath', '')
    title = r.get('feedTitle') or r.get('name') or full_path
    subscribe_url = 'http://localproxy/1200' + full_path
    local_raw_url = 'http://localhost:1200' + full_path
    route_name = r.get('name') or full_path
    category = r.get('category') or 'other'
    source = '\u672c\u5730 RSSHub'
    last_update = r.get('testedAtLocal')
    last_fetch = r.get('testedAtLocal') if r.get('ok') else None
    unread = 0
    status = '\u6b63\u5e38' if r.get('ok') else '\u6709\u9519\u8bef'
    error_type = error_type_map.get(r.get('errorType'))
    error_message_parts = []
    if r.get('errorMessage'):
        error_message_parts.append(str(r.get('errorMessage')))
    if r.get('errorDetail'):
        error_message_parts.append(str(r.get('errorDetail')))
    error_message = ' | '.join(error_message_parts)[:3000] if error_message_parts else None
    notes = ' | '.join([v for v in [r.get('sourceFile'), r.get('reproCurl'), r.get('bodyFile')] if v])[:3000] or None

    ws.append([
        title,
        subscribe_url,
        local_raw_url,
        route_name,
        category,
        source,
        last_update,
        last_fetch,
        unread,
        status,
        error_type,
        error_message,
        notes,
    ])

for row_idx in range(2, ws.max_row + 1):
    status_value = ws.cell(row=row_idx, column=10).value
    if status_value == '\u6709\u9519\u8bef':
        for col_idx in range(1, 14):
            ws.cell(row=row_idx, column=col_idx).fill = fail_fill

for col_idx in range(1, len(headers) + 1):
    max_len = 0
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, min_col=col_idx, max_col=col_idx):
        value = row[0].value
        if value is None:
            continue
        text = str(value)
        if len(text) > max_len:
            max_len = len(text)
    ws.column_dimensions[get_column_letter(col_idx)].width = min(max(max_len + 2, 12), 80)

ws.freeze_panes = 'A2'
ws.auto_filter.ref = f'A1:M{ws.max_row}'

wb.save(output_path)
`;

    const result = spawnSync(pythonExecutable, ['-c', pyCode, reportPath, outputPath], {
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        throw new Error(
            `Failed to generate Excel report with ${pythonExecutable}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
        );
    }
}

async function checkHealth(baseUrl: string, timeoutMs: number): Promise<void> {
    const healthUrl = `${baseUrl}/healthz`;
    const response = await fetchWithTimeout(healthUrl, timeoutMs);
    if (!response.ok) {
        throw new Error(`Health check failed: ${healthUrl} => HTTP ${response.status} ${response.statusText}`);
    }
}

async function copyLatestArtifacts(outputDir: string, runDir: string): Promise<void> {
    const latestDir = path.join(outputDir, 'latest');
    await mkdir(latestDir, { recursive: true });
    await copyFile(path.join(runDir, REPORT_FILE_AGENT_JSON), path.join(latestDir, REPORT_FILE_AGENT_JSON));
    await copyFile(path.join(runDir, REPORT_FILE_AGENT_MD), path.join(latestDir, REPORT_FILE_AGENT_MD));
    await copyFile(path.join(runDir, REPORT_FILE_HUMAN_XLSX), path.join(latestDir, REPORT_FILE_HUMAN_XLSX));
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const startedAt = new Date();
    const runId = formatRunId(startedAt);
    const testedAt = startedAt.toISOString();
    const testedAtLocal = formatLocalDateTime(startedAt);
    const runDir = path.join(options.outputDir, runId);
    const failuresDir = path.join(runDir, 'failures');

    await mkdir(failuresDir, { recursive: true });

    console.log(`[route-test] runId=${runId}`);
    console.log('[route-test] health check...');
    await checkHealth(options.baseUrl, options.timeoutMs);
    console.log('[route-test] health check passed');

    const routesRaw = await readFile(options.routesFile, 'utf8');
    const snapshot = JSON.parse(routesRaw) as RoutesSnapshot;
    const { routes, stats } = makeSelectedRoutes(snapshot, options);
    console.log(`[route-test] selected routes: ${routes.length}`);

    const batchStart = performance.now();
    let completed = 0;
    const results = await runWithConcurrency(routes, options.concurrency, async (route) => {
        const result = await testRoute(route, options, testedAt, testedAtLocal, failuresDir);
        completed++;
        if (completed % 25 === 0 || completed === routes.length) {
            console.log(`[route-test] progress ${completed}/${routes.length}`);
        }
        return result;
    });
    const totalElapsedMs = Math.round(performance.now() - batchStart);

    const report: Report = {
        meta: {
            runId,
            testedAt,
            testedAtLocal,
            baseUrl: options.baseUrl,
            concurrency: options.concurrency,
            timeoutMs: options.timeoutMs,
            retry: options.retry,
            includePuppeteer: options.includePuppeteer,
            saveFailureBody: options.saveFailureBody,
            failureBodyMaxBytes: options.failureBodyMaxBytes,
            routesFile: options.routesFile,
            nodeVersion: process.version,
        },
        selection: stats,
        summary: buildSummary(results, totalElapsedMs),
        results,
    };

    const jsonPath = path.join(runDir, REPORT_FILE_AGENT_JSON);
    const markdownPath = path.join(runDir, REPORT_FILE_AGENT_MD);
    const excelPath = path.join(runDir, REPORT_FILE_HUMAN_XLSX);

    await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    await writeFile(markdownPath, buildAgentMarkdown(report), 'utf8');
    generateExcelReport(jsonPath, excelPath);
    await copyLatestArtifacts(options.outputDir, runDir);

    console.log(`[route-test] done: ${runDir}`);
    console.log(`[route-test] success=${report.summary.success} failed=${report.summary.failed} successRate=${report.summary.successRate}%`);
}

main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[route-test] fatal: ${message}`);
    process.exitCode = 1;
});
