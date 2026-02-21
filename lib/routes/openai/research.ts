import RSSParser from 'rss-parser';

import type { Route } from '@/types';
import got from '@/utils/got';

export const route: Route = {
    path: '/research',
    categories: ['programming'],
    example: '/openai/research',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Research',
    maintainers: ['yuguorui'],
    handler,
    url: 'openai.com/research',
};

async function handler() {
    const parser = new RSSParser();
    const response = await got('https://openai.com/news/rss.xml');
    const feed = await parser.parseString(response.data);
    const researchItems = feed.items.filter((item) => item.categories?.some((category) => category.toLowerCase() === 'research'));

    const items = researchItems.map((item) => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        description: item.content || item.contentSnippet,
        author: item.creator || item.author,
        category: item.categories,
    }));

    return {
        title: 'OpenAI Research',
        link: 'https://openai.com/research',
        item: items,
    };
}
