import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/news',
    categories: ['forecast'],
    example: '/bmkg/news',
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
            source: ['bmkg.go.id/', 'bmkg.go.id/berita/utama'],
            target: '/bmkg/news',
        },
    ],
    name: 'News',
    maintainers: ['Shinanory'],
    handler,
    url: 'bmkg.go.id/berita/utama',
};

async function handler() {
    const baseUrl = 'https://www.bmkg.go.id';
    const currentUrl = `${baseUrl}/`;
    const response = await got(currentUrl);
    const $ = load(response.data);

    const list = $('a[href*="/berita/utama/"]')
        .toArray()
        .map((element) => {
            const href = $(element).attr('href');
            if (!href) {
                return;
            }

            const cardText = $(element).parent().text().replaceAll(/\s+/g, ' ').trim();
            const title = cardText.match(/\d{1,2}\s+[A-Za-z]+\s+\d{4}\s*(.+?)Baca selengkapnya/i)?.[1]?.trim();
            const summary = /Baca selengkapnya/i.test(cardText) ? cardText.replace(/^.*?\d{4}\s*/, '').replace(/Baca selengkapnya.*$/i, '').trim() : cardText;
            const dateText = cardText.match(/\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b/)?.[0];

            if (!title) {
                return;
            }

            return {
                title,
                link: new URL(href, baseUrl).href,
                pubDate: dateText ? parseDate(dateText, 'D MMMM YYYY') : undefined,
                summary,
            };
        })
        .filter(Boolean)
        .filter((item, index, array) => array.findIndex((entry) => entry.link === item.link) === index);

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailResponse = await got(item.link);
                const detail = load(detailResponse.data);
                const description =
                    detail('meta[property="og:description"]').attr('content') ||
                    detail('meta[name="description"]').attr('content') ||
                    item.summary;

                return {
                    title: item.title,
                    link: item.link,
                    pubDate: item.pubDate,
                    description: `<p>${description}</p>`,
                };
            })
        )
    );

    return {
        title: 'News - BMKG',
        link: `${baseUrl}/berita/utama`,
        description: 'Latest BMKG news',
        item: items,
        language: 'in',
    };
}
