import { config } from '@/config';
import type { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

interface DouyinHotItem {
    event_time?: number;
    hot_value?: number;
    sentence_id?: string;
    sentence_tag?: number;
    word: string;
    word_cover?: {
        url_list?: string[];
    };
}

interface DouyinHotResponse {
    data?: {
        word_list?: DouyinHotItem[];
    };
}

export const route: Route = {
    path: '/hot',
    categories: ['social-media'],
    example: '/douyin/hot',
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
            source: ['www.douyin.com/hot'],
        },
    ],
    name: '热榜',
    maintainers: ['TonyRL'],
    handler,
};

async function handler() {
    const response = await ofetch<DouyinHotResponse>('https://www.douyin.com/aweme/v1/web/hot/search/list/', {
        headers: {
            Referer: 'https://www.douyin.com/hot',
            'User-Agent': config.trueUA,
        },
        query: {
            aid: 6383,
            board_type: 0,
            channel: 'channel_pc_web',
            detail_list: 1,
            source: 6,
        },
    });

    const list = response.data?.word_list ?? [];

    return {
        title: '抖音热榜',
        link: 'https://www.douyin.com/hot',
        item: list.map((item) => {
            const cover = item.word_cover?.url_list?.[0];
            const descriptionParts = [];
            if (item.hot_value) {
                descriptionParts.push(`热度：${item.hot_value}`);
            }
            if (item.sentence_tag !== undefined) {
                descriptionParts.push(`标签：${item.sentence_tag}`);
            }
            if (cover) {
                descriptionParts.push(`<img src="${cover}">`);
            }

            return {
                title: item.word,
                link: item.sentence_id ? `https://www.douyin.com/hot/${item.sentence_id}` : `https://www.douyin.com/search/${encodeURIComponent(item.word)}`,
                description: descriptionParts.join('<br>'),
                pubDate: item.event_time ? parseDate(item.event_time, 'X') : undefined,
            };
        }),
    };
}
