import type { DataItem, Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';
import parser from '@/utils/rss-parser';

const siteUrl = 'https://www.jiqizhixin.com';
const sourceUrl = `${siteUrl}/rss`;

type ParsedItem = Awaited<ReturnType<typeof parser.parseURL>>['items'][number];
type RouteItem = DataItem;

const normalizeItem = (item: ParsedItem): RouteItem | null => {
    const link = item.link ?? item.guid;
    if (!link || !item.title) {
        return null;
    }

    const content = item['content:encoded'] ?? item.content ?? item.contentSnippet ?? item.summary ?? '';
    const pubDate = item.pubDate ? parseDate(item.pubDate) : undefined;

    return {
        title: item.title,
        link,
        description: content,
        category: item.categories,
        author: item.creator ?? item.author,
        ...(pubDate ? { pubDate } : {}),
    };
};

export const route: Route = {
    path: '/rss',
    categories: ['new-media'],
    example: '/jiqizhixin/rss',
    radar: [
        {
            source: ['www.jiqizhixin.com/rss'],
            target: '/rss',
        },
    ],
    name: 'RSS',
    maintainers: ['DIYgod'],
    handler,
    description: '机器之心官方 RSS 兼容版，使用 RSSHub 重新输出规范化 XML，减少 FreshRSS 等阅读器的解析异常。',
};

async function handler() {
    const xml = await ofetch(sourceUrl, {
        headers: { 'x-prefer-proxy': '1' },
        responseType: 'text',
    });
    const feed = await parser.parseString(xml);
    const item = feed.items.map((entry) => normalizeItem(entry)).filter((entry): entry is RouteItem => Boolean(entry));

    return {
        title: feed.title ?? '机器之心',
        link: siteUrl,
        description: feed.description ?? '机器之心 RSS',
        item,
    };
}
