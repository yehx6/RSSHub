import type { Route } from '@/types';
import { ViewType } from '@/types';

import { getItemsFromOfficialRss } from './utils';

const rankingKeywordMap: Record<string, string> = {
    '11': '好价',
    '12': '食品生鲜',
};

export const route: Route = {
    path: '/ranking/:rank_type/:rank_id/:hour?',
    categories: ['shopping'],
    view: ViewType.Notifications,
    example: '/smzdm/ranking/pinlei/11/3',
    parameters: {
        rank_type: 'Ranking type',
        rank_id: 'Ranking id',
        hour: 'Time range in hours, defaults to 3',
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Ranking',
    maintainers: ['DIYgod'],
    handler,
};

async function handler(ctx) {
    const rankType = ctx.req.param('rank_type');
    const rankId = ctx.req.param('rank_id');
    const hour = ctx.req.param('hour') || '3';

    const mappedKeyword = rankingKeywordMap[rankId];
    let items = await getItemsFromOfficialRss(mappedKeyword);
    if (items.length === 0 && mappedKeyword) {
        items = await getItemsFromOfficialRss();
    }
    if (items.length === 0) {
        throw new Error('SMZDM official RSS returned no items.');
    }

    return {
        title: `SMZDM Ranking ${rankType}/${rankId} (${hour}h)`,
        link: 'https://www.smzdm.com/top/',
        item: items,
    };
}

