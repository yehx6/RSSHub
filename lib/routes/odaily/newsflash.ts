import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

import { rootUrl } from './utils';

export const route: Route = {
    path: '/newsflash',
    categories: ['new-media'],
    example: '/odaily/newsflash',
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
            source: ['odaily.news/newsflash', 'odaily.news/'],
        },
    ],
    name: '快讯',
    maintainers: ['nczitzk'],
    handler,
    url: 'odaily.news/newsflash',
};

async function handler(ctx) {
    const currentUrl = `${rootUrl}/zh-CN/newsflash`;
    const response = await got(currentUrl);
    const $ = load(response.data);
    const limit = Number.parseInt(ctx.req.query('limit') ?? '100', 10);

    const list = $('a[href*="/zh-CN/newsflash/"]')
        .toArray()
        .map((element) => {
            const href = $(element).attr('href');
            const title = $(element).text().trim();

            if (!href || !title) {
                return;
            }

            return {
                title,
                link: new URL(href, rootUrl).href,
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
                const content = detail('div[class*="DetailContent_detail__"]');
                const dateText =
                    detail('meta[property="article:published_time"]').attr('content') ??
                    detail('main').text().match(/\b\d{4}-\d{2}-\d{2}T[^ \n<"]+/)?.[0];

                return {
                    title: item.title,
                    link: item.link,
                    pubDate: dateText ? parseDate(dateText) : undefined,
                    description: content.html() || `<p>${item.title}</p>`,
                };
            })
        )
    );

    return {
        title: '快讯 - Odaily星球日报',
        link: currentUrl,
        item: items,
    };
}
