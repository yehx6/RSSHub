import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/research',
    categories: ['programming'],
    example: '/anthropic/research',
    parameters: {},
    radar: [
        {
            source: ['www.anthropic.com/research', 'www.anthropic.com'],
        },
    ],
    name: 'Research',
    maintainers: ['ttttmr'],
    handler,
    url: 'www.anthropic.com/research',
};

async function handler(ctx) {
    const link = 'https://www.anthropic.com/research';
    const response = await got(link);
    const $ = load(response.data);
    const limit = Number.parseInt(ctx.req.query('limit') ?? '20', 10);

    const list = $('a[href^="/research/"], a[href*="://www.anthropic.com/research/"]')
        .toArray()
        .map((element) => {
            const href = $(element).attr('href');
            const title = $(element).find('h3').text().trim() || $(element).text().trim();

            if (!href || !title) {
                return;
            }

            const fullLink = href.startsWith('http') ? href : `https://www.anthropic.com${href}`;
            if (fullLink.includes('/research/team/')) {
                return;
            }

            return {
                title,
                link: fullLink,
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
        title: 'Anthropic Research',
        link,
        description: 'Latest research from Anthropic',
        item: items,
    };
}
