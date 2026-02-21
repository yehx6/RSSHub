import RSSParser from 'rss-parser';

import { config } from '@/config';
import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';

export const route: Route = {
    path: '/blog',
    categories: ['blog'],
    example: '/deltaio/blog',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['delta.io/blog'],
        },
    ],
    name: 'Blogs',
    maintainers: ['RengarLee'],
    handler,
    url: 'delta.io/blog',
};

async function handler() {
    const baseUrl = 'https://delta.io';
    const rssUrl = `${baseUrl}/rss.xml`;
    const parser = new RSSParser();

    const feed = await cache.tryGet(
        rssUrl,
        async () => {
            const response = await got(rssUrl);
            return parser.parseString(response.data);
        },
        config.cache.routeExpire,
        false
    );

    const items = feed.items.map((item) => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        description: item.content || item.contentSnippet,
        author: item.creator || item.author,
        category: item.categories,
    }));

    return {
        title: feed.title || 'delta.io blog',
        link: `${baseUrl}/blog`,
        item: items,
    };
}
