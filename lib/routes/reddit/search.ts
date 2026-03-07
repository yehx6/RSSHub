import type { Route } from '@/types';
import { config } from '@/config';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import { cleanRedditContent } from './utils';

export const route: Route = {
    path: '/search/:keyword/:sort?',
    categories: ['social-media'],
    example: '/reddit/search/AI%20coding',
    parameters: {
        keyword: 'Search keyword',
        sort: 'Sort method: `new` (default), `relevance`, `hot`, `top`, `comments`',
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Search',
    maintainers: [],
    handler,
};

async function handler(ctx) {
    const keyword = ctx.req.param('keyword');
    const sort = ctx.req.param('sort') || 'new';

    const rssUrl = `https://www.reddit.com/search.rss?q=${encodeURIComponent(keyword)}&sort=${sort}`;

    const data = await cache.tryGet(
        `reddit:search:${keyword}:${sort}`,
        async () => {
            const text = await ofetch(rssUrl, {
                headers: {
                    'x-prefer-proxy': '1',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                },
                responseType: 'text',
            });

            const $ = load(text, { xmlMode: true });

            const title = $('feed > title').text();
            const link = $('feed > link[rel="alternate"]').attr('href') || `https://www.reddit.com/search/?q=${encodeURIComponent(keyword)}`;

            const items = $('entry')
                .toArray()
                .map((el) => {
                    const entry = $(el);
                    const contentHtml = entry.find('content').text() || '';
                    const cleaned = cleanRedditContent(contentHtml);
                    return {
                        title: entry.find('title').text(),
                        link: entry.find('link').attr('href'),
                        description: cleaned.description,
                        image: cleaned.image,
                        pubDate: parseDate(entry.find('updated').text()),
                        author: entry.find('author > name').text(),
                        category: entry.find('category').attr('label') ? [entry.find('category').attr('label')] : undefined,
                    };
                });

            return { title, link, items };
        },
        config.cache.routeExpire,
        false
    );

    return {
        title: data.title || `Reddit Search: ${keyword}`,
        link: data.link,
        description: `Reddit search results for "${keyword}"`,
        item: data.items,
    };
}
