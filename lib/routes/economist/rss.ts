import type { Route } from '@/types';
import { config } from '@/config';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/rss/:section',
    categories: ['traditional-media'],
    example: '/economist/rss/finance-and-economics',
    parameters: {
        section: 'Section name from the official RSS page, e.g. `finance-and-economics`, `science-and-technology`, `business`, `china`.',
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'RSS Proxy',
    maintainers: [],
    handler,
};

async function handler(ctx) {
    const section = ctx.req.param('section');
    const rssUrl = `https://www.economist.com/${section}/rss.xml`;

    const data = await cache.tryGet(
        `economist:rss:${section}`,
        async () => {
            const text = await ofetch(rssUrl, {
                headers: { 'x-prefer-proxy': '1' },
                responseType: 'text',
            });

            const $ = load(text, { xmlMode: true });

            const title = $('channel > title').text();
            const link = $('channel > link').text();
            const description = $('channel > description').text();

            const items = $('item')
                .toArray()
                .map((el) => {
                    const item = $(el);
                    return {
                        title: item.find('title').text(),
                        link: item.find('link').text(),
                        description: item.find('description').text(),
                        pubDate: parseDate(item.find('pubDate').text()),
                    };
                });

            return { title, link, description, items };
        },
        config.cache.routeExpire,
        false
    );

    return {
        title: data.title || `The Economist - ${section}`,
        link: data.link,
        description: data.description,
        item: data.items,
    };
}
