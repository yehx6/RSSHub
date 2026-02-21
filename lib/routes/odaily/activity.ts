import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

import { rootUrl } from './utils';

export const route: Route = {
    path: '/activity',
    categories: ['new-media'],
    example: '/odaily/activity',
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
            source: ['odaily.news/activity', 'odaily.news/'],
        },
    ],
    name: '活动',
    maintainers: ['nczitzk'],
    handler,
    url: 'odaily.news/activity',
};

async function handler(ctx) {
    const currentUrl = `${rootUrl}/zh-CN/activity`;
    const response = await got(currentUrl);
    const $ = load(response.data);
    const limit = Number.parseInt(ctx.req.query('limit') ?? '25', 10);

    const list = $('a[href*="/zh-CN/activity/"]')
        .toArray()
        .map((element) => {
            const href = $(element).attr('href');
            const title = $(element).text().trim();
            const surroundingText = $(element).parent().parent().text().replaceAll(/\s+/g, ' ');
            const dateText = surroundingText.match(/\b\d{4}\/\d{2}\/\d{2}\b/)?.[0];

            if (!href || !title) {
                return;
            }

            return {
                title,
                link: new URL(href, rootUrl).href,
                pubDate: dateText ? parseDate(dateText, 'YYYY/MM/DD') : undefined,
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
                const detailText = detail('main').text().replaceAll(/\s+/g, ' ');
                const detailDateText = detailText.match(/\b\d{4}\/\d{2}\/\d{2}\b/)?.[0];

                return {
                    title: item.title,
                    link: item.link,
                    pubDate: item.pubDate ?? (detailDateText ? parseDate(detailDateText, 'YYYY/MM/DD') : undefined),
                    description: content.html() || `<p>${item.title}</p>`,
                };
            })
        )
    );

    return {
        title: '活动 - Odaily星球日报',
        link: currentUrl,
        item: items,
    };
}
