import { config } from '@/config';
import type { Route } from '@/types';
import ofetch from '@/utils/ofetch';

interface ToutiaoHotItem {
    HotValue?: number;
    Image?: {
        url_list?: string[];
    };
    Label?: string;
    Title: string;
    Url: string;
}

export const route: Route = {
    path: '/hot',
    categories: ['new-media'],
    example: '/toutiao/hot',
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['www.toutiao.com/hot-event/hot-board/'],
        },
    ],
    name: '热榜',
    maintainers: ['TonyRL'],
    handler,
};

async function handler() {
    const response = await ofetch<{ data?: ToutiaoHotItem[] }>('https://www.toutiao.com/hot-event/hot-board/', {
        headers: {
            Referer: 'https://www.toutiao.com/',
            'User-Agent': config.trueUA,
        },
        query: {
            origin: 'toutiao_pc',
        },
    });

    const list = response.data ?? [];

    return {
        title: '今日头条热榜',
        link: 'https://www.toutiao.com/hot-event/hot-board/',
        item: list.map((item) => {
            const cover = item.Image?.url_list?.[0];
            const descriptionParts = [];
            if (item.HotValue) {
                descriptionParts.push(`热度：${item.HotValue}`);
            }
            if (item.Label) {
                descriptionParts.push(`标签：${item.Label}`);
            }
            if (cover) {
                descriptionParts.push(`<img src="${cover}">`);
            }

            return {
                title: item.Title,
                link: item.Url,
                description: descriptionParts.join('<br>'),
            };
        }),
    };
}
