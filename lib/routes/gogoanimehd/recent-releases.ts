import { load } from 'cheerio';

import type { Route } from '@/types';
import got from '@/utils/got';

export const route: Route = {
    path: '/recent-releases',
    categories: ['anime'],
    example: '/gogoanimehd/recent-releases',
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
            source: ['anitaku.to/'],
            target: '/gogoanimehd/recent-releases',
        },
    ],
    name: 'Recent Releases',
    maintainers: ['user4302'],
    handler,
    url: 'anitaku.to',
};

async function handler() {
    const rootUrl = 'https://anitaku.to/';

    const response = await got({
        method: 'get',
        url: rootUrl,
    });

    const $ = load(response.data);
    const listItems = $('.last_episodes.loaddub .items > li').toArray();

    const arrayOfItems = listItems.flatMap((item) => {
        const title = $(item).find('.name a').attr('title') || $(item).find('.name a').text().trim();
        const episode = $(item).find('.episode').text().trim();
        const relativeLink = $(item).find('.name a').attr('href');
        const imageUrl = $(item).find('.img a img').attr('src');

        if (!title || !relativeLink) {
            return [];
        }

        const link = new URL(relativeLink, rootUrl).href;
        const description = imageUrl ? `<h2>${episode}</h2><br/><img src='${imageUrl}' alt='${title}'>` : `<h2>${episode}</h2>`;

        return [
            {
                title,
                description,
                link,
            },
        ];
    });

    return {
        title: $('title').text(),
        link: rootUrl,
        item: arrayOfItems,
    };
}
