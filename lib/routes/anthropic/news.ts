import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/news',
    categories: ['programming'],
    example: '/anthropic/news',
    parameters: {},
    radar: [
        {
            source: ['www.anthropic.com/news', 'www.anthropic.com'],
        },
    ],
    name: 'News',
    maintainers: ['etShaw-zh', 'goestav'],
    handler,
    url: 'www.anthropic.com/news',
};

async function handler(ctx) {
    const link = 'https://www.anthropic.com/news';
    const response = await got(link);
    const $ = load(response.data);
    const limit = Number.parseInt(ctx.req.query('limit') ?? '20', 10);

    const list = $('a[href^="/news/"], a[href*="://www.anthropic.com/news/"]')
        .toArray()
        .map((element) => {
            const href = $(element).attr('href');
            const title = $(element).find('h3').text().trim() || $(element).text().trim();

            if (!href || !title) {
                return;
            }

            return {
                title,
                link: href.startsWith('http') ? href : `https://www.anthropic.com${href}`,
            };
        })
        .filter(Boolean)
        .filter((item, index, array) => array.findIndex((entry) => entry.link === item.link) === index)
        .slice(0, limit);

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailResponse = await got(item.link);
                const detail = load(detailResponse.data);
                const content = detail('main article').first();
                const text = detail('#main-content').text().replaceAll(/\s+/g, ' ');
                const dateText = text.match(/\b[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\b/)?.[0];

                return {
                    title: item.title,
                    link: item.link,
                    pubDate: dateText ? parseDate(dateText, 'MMMM D, YYYY') : undefined,
                    description: content.html() || detail('#main-content').html() || `<p>${item.title}</p>`,
                };
            })
        )
    );

    return {
        title: 'Anthropic News',
        link,
        description: 'Latest news from Anthropic',
        item: items,
    };
}
