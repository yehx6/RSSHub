import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/cookbook',
    categories: ['programming'],
    description: 'OpenAI Cookbook examples and guides.',
    maintainers: ['liyaozhong'],
    radar: [
        {
            source: ['cookbook.openai.com/'],
            target: '/openai/cookbook',
        },
    ],
    url: 'cookbook.openai.com/',
    handler,
    example: '/openai/cookbook',
    name: 'Cookbook',
};

async function handler() {
    const rootUrl = 'https://cookbook.openai.com';
    const currentUrl = `${rootUrl}/`;
    const response = await got(currentUrl);
    const $ = load(response.data);

    const list = $('a[href^="/cookbook/examples/"], a[href^="/examples/"]')
        .toArray()
        .map((element) => {
            const href = $(element).attr('href');
            const title = $(element).text().trim();
            if (!href || !title) {
                return;
            }

            const normalizedPath = href.startsWith('/cookbook/examples/') ? href.replace('/cookbook', '') : href;
            return {
                title,
                link: new URL(normalizedPath, rootUrl).href,
            };
        })
        .filter(Boolean)
        .filter((item, index, array) => array.findIndex((entry) => entry.link === item.link) === index);

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailResponse = await got(item.link);
                const detail = load(detailResponse.data);
                const content = detail('main').first();
                const dateText = content.text().match(/\b[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\b/)?.[0];
                const categories = detail('a[href*="/topic/"]')
                    .toArray()
                    .map((element) => detail(element).text().trim())
                    .filter(Boolean);

                return {
                    title: item.title,
                    link: item.link,
                    pubDate: dateText ? parseDate(dateText, 'MMM D, YYYY') : undefined,
                    category: categories,
                    description: content.html() || `<p>${item.title}</p>`,
                };
            })
        )
    );

    return {
        title: 'OpenAI Cookbook',
        link: currentUrl,
        item: items,
    };
}
