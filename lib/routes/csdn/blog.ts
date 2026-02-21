import { load } from 'cheerio';

import type { Data, Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import rssParser from '@/utils/rss-parser';

export const route: Route = {
    path: '/blog/:user?',
    categories: ['blog'],
    example: '/csdn/blog/csdngeeknews',
    parameters: { user: '`user` is the username of a CSDN blog which can be found in the url of the home page' },
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
            source: ['blog.csdn.net/:user'],
        },
    ],
    name: 'User Feed',
    maintainers: ['Jkker'],
    handler,
};

const fallbackCount = 20;

const buildDetailItem = async (link: string, fallbackTitle?: string): Promise<Data> =>
    cache.tryGet(link, async () => {
        const response = await got({
            method: 'get',
            url: link,
        });

        const $ = load(response.data);
        const content = $('#content_views').html() || $('.article_content').html() || '';
        const title = $('meta[property="og:title"]').attr('content') || $('h1').first().text().trim() || fallbackTitle || link;
        const published = $('meta[property="article:published_time"]').attr('content') || $('meta[itemprop="datePublished"]').attr('content');

        return {
            title,
            link,
            description: content,
            pubDate: published ? parseDate(published) : undefined,
        };
    });

const parseFeedFromHtml = async (user: string) => {
    const link = `https://blog.csdn.net/${user}`;
    const response = await got({
        method: 'get',
        url: link,
    });
    const $ = load(response.data);

    const articles = $('a[href*="/article/details/"]').toArray();
    const mapped = articles.map((element) => {
        const href = $(element).attr('href');
        if (!href) {
            return null;
        }
        const url = new URL(href, link).toString().split('?')[0];
        const title = $(element).text().trim();
        return { url, title };
    });

    const unique = new Map<string, string>();
    for (const item of mapped) {
        if (!item || !item.url.includes('/article/details/')) {
            continue;
        }
        if (!unique.has(item.url)) {
            unique.set(item.url, item.title);
        }
    }

    const links = [...unique.entries()].slice(0, fallbackCount);
    const items = await Promise.all(links.map(([articleLink, title]) => buildDetailItem(articleLink, title)));

    return {
        title: `${user} - CSDN`,
        link,
        item: items,
    };
};

async function handler(ctx) {
    const user = ctx.req.param('user') || 'csdnnews';

    try {
        const rssUrl = `https://rss.csdn.net/${user}/rss/map`;
        const feed = await rssParser.parseURL(rssUrl);
        const items = await Promise.all(feed.items.map((item) => buildDetailItem(item.link, item.title)));

        return {
            ...feed,
            title: `${feed.title} - CSDN`,
            item: items,
        };
    } catch {
        return parseFeedFromHtml(user);
    }
}
