import type { Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';
import { load } from 'cheerio';

import { config } from '@/config';

export const route: Route = {
    path: '/news-search/:keyword/:locale?',
    categories: ['new-media'],
    example: '/google/news-search/AI',
    parameters: {
        keyword: 'Search keyword',
        locale: 'Locale string, default `hl=en-US&gl=US&ceid=US:en`. Use `hl=zh-CN&gl=CN&ceid=CN:zh-Hans` for Chinese.',
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'News Search',
    maintainers: [],
    handler,
};

async function handler(ctx) {
    const keyword = ctx.req.param('keyword');
    const locale = ctx.req.param('locale') || 'hl=en-US&gl=US&ceid=US:en';

    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(keyword)}&${locale}`;

    const items = await cache.tryGet(
        `google:news-search:${keyword}:${locale}`,
        async () => {
            const response = await ofetch(rssUrl, {
                headers: {
                    'Accept': 'application/rss+xml, application/xml, text/xml',
                    'x-prefer-proxy': '1',
                },
            });

            const $ = load(response, { xmlMode: true });

            return $('item')
                .toArray()
                .map((el) => {
                    const item = $(el);
                    return {
                        title: item.find('title').text(),
                        link: item.find('link').text(),
                        description: item.find('description').html() || item.find('title').text(),
                        pubDate: parseDate(item.find('pubDate').text()),
                        author: item.find('source').text(),
                    };
                });
        },
        config.cache.routeExpire,
        false
    );

    return {
        title: `"${keyword}" - Google News`,
        link: `https://news.google.com/search?q=${encodeURIComponent(keyword)}&${locale}`,
        description: `Google News search results for "${keyword}"`,
        item: items,
    };
}
