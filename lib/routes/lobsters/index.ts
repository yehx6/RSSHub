import type { Route } from '@/types';
import { config } from '@/config';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/:tag?',
    categories: ['programming'],
    example: '/lobsters/ai',
    parameters: {
        tag: 'Tag name (e.g. `ai`, `ml`, `programming`). Leave empty for homepage.',
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Tag',
    maintainers: [],
    handler,
};

async function handler(ctx) {
    const tag = ctx.req.param('tag');
    const rssUrl = tag ? `https://lobste.rs/t/${tag}.rss` : `https://lobste.rs/rss`;

    const data = await cache.tryGet(
        `lobsters:${tag || 'index'}`,
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
                        author: item.find('dc\\:creator').text(),
                        category: item.find('category').toArray().map((c) => $(c).text()),
                    };
                });

            return { title, link, description, items };
        },
        config.cache.routeExpire,
        false
    );

    return {
        title: data.title || `Lobsters${tag ? ` - ${tag}` : ''}`,
        link: data.link,
        description: data.description,
        item: data.items,
    };
}
