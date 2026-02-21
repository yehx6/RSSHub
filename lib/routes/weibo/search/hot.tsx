import type { Route } from '@/types';
import { ViewType } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';

const weiboHotSearchApiUrl = 'https://weibo.com/ajax/side/hotSearch';

interface WeiboHotItem {
    label_name?: string;
    note?: string;
    num?: number;
    word?: string;
    word_scheme?: string;
}

const fetchRealtimeHotItems = async () => {
    const response = await got(weiboHotSearchApiUrl, {
        headers: {
            Accept: 'application/json, text/plain, */*',
            Referer: 'https://weibo.com/hot/search',
            'User-Agent':
                'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1',
            'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 15000,
    });

    const realtime = response.data?.data?.realtime;
    if (!Array.isArray(realtime) || realtime.length === 0) {
        throw new Error('Weibo hot search API returned empty data.');
    }

    return realtime as WeiboHotItem[];
};

export const route: Route = {
    path: '/search/hot/:fulltext?',
    categories: ['social-media'],
    view: ViewType.SocialMedia,
    example: '/weibo/search/hot',
    parameters: {
        fulltext: 'Deprecated. Kept only for backward compatibility.',
    },
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
            source: ['s.weibo.com/top/summary'],
        },
    ],
    name: 'Hot Search',
    maintainers: ['xyqfer', 'shinemoon'],
    handler,
    url: 's.weibo.com/top/summary',
};

async function handler() {
    const realtime = await cache.tryGet('weibo:search:hot:realtime', fetchRealtimeHotItems, 60);

    return {
        title: 'Weibo Hot Search',
        link: 'https://s.weibo.com/top/summary?cate=realtimehot',
        description: 'Realtime hot topics on Weibo.',
        item: realtime.map((item, index) => {
            const title = item.note || item.word || `Topic ${index + 1}`;
            const keyword = item.word_scheme || item.note || item.word || title;
            const details = [item.label_name, item.num ? `Heat ${item.num}` : undefined].filter(Boolean).join(' | ');

            return {
                title,
                description: details ? `${title}<br>${details}` : title,
                link: `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}&rank=${index + 1}`,
            };
        }),
    };
}
