import type { Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/shortcuts',
    categories: ['new-media'],
    example: '/sspai/shortcuts',
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
            source: ['sspai.com/tag/Shortcuts'],
            target: '/shortcuts',
        },
    ],
    name: 'Shortcuts Gallery',
    maintainers: ['Andiedie'],
    handler,
    url: 'sspai.com/tag/Shortcuts',
};

// shortcuts.sspai.com was shut down in 2024 and replaced by sspai.com/page/playbook.
// The new Playbook API requires JWT authentication, so we use the public article-tag
// API instead, which returns articles tagged with "Shortcuts".
// ofetch returns the parsed JSON body directly (no `.data` wrapper), so `.data` here
// is the array of articles from the response `{ data: [...], total: N }`.
async function handler() {
    const { data: list } = await ofetch('https://sspai.com/api/v1/article/tag/page/get?limit=20&offset=0&tag=Shortcuts&type=0');

    const items = (list ?? []).map((item) => ({
        title: item.title,
        description: item.summary,
        pubDate: parseDate(item.released_time * 1000),
        guid: String(item.id),
        link: `https://sspai.com/post/${item.id}`,
        author: item.author?.nickname ?? '',
        image: item.banner ?? undefined,
    }));

    return {
        title: 'Shortcuts - 少数派',
        link: 'https://sspai.com/tag/Shortcuts',
        description: 'Shortcuts 相关文章 - 少数派',
        item: items,
    };
}
