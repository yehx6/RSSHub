import type { Route } from '@/types';
import { ViewType } from '@/types';

import { getItemsFromOfficialRss } from './utils';

export const route: Route = {
    path: '/keyword/:keyword',
    categories: ['shopping'],
    view: ViewType.Notifications,
    example: '/smzdm/keyword/显卡',
    parameters: {
        keyword: 'Keyword',
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Keyword',
    maintainers: ['DIYgod', 'MeanZhang'],
    handler,
};

async function handler(ctx) {
    const keyword = ctx.req.param('keyword');

    let items = await getItemsFromOfficialRss(keyword);
    if (items.length === 0) {
        items = await getItemsFromOfficialRss();
    }
    if (items.length === 0) {
        throw new Error('SMZDM official RSS returned no items.');
    }

    return {
        title: `SMZDM Keyword: ${keyword}`,
        link: `https://search.smzdm.com/?c=home&s=${encodeURIComponent(keyword)}&order=time`,
        item: items,
    };
}

