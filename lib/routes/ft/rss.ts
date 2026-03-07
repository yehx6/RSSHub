import type { Route } from '@/types';
import { config } from '@/config';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/rss/:section?',
    categories: ['traditional-media'],
    example: '/ft/rss/technology',
    parameters: {
        section: 'Section name (e.g. `technology`, `world`, `companies`, `markets`, `opinion`). Defaults to `home`.',
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'RSS Feed',
    maintainers: [],
    handler,
};

async function handler(ctx) {
    const section = ctx.req.param('section') || 'home';
    const rssUrl = section === 'home' ? 'https://www.ft.com/rss/home' : `https://www.ft.com/${section}?format=rss`;

    const data = await cache.tryGet(
        `ft:rss:${section}`,
        async () => {
            const text = await ofetch(rssUrl, {
                headers: { 'x-prefer-proxy': '1' },
                responseType: 'text',
                redirect: 'follow',
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
                        author: item.find('dc\\:creator').text(),
                    };
                });

            return { title, link, description, items };
        },
        config.cache.routeExpire,
        false
    );

    return {
        title: data.title || `Financial Times - ${section}`,
        link: data.link,
        description: data.description,
        item: data.items,
    };
}
