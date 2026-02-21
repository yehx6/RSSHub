import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/blog',
    categories: ['blog'],
    example: '/backlinko/blog',
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
            source: ['backlinko.com/blog', 'backlinko.com/'],
        },
    ],
    name: 'Blog',
    maintainers: ['TonyRL'],
    handler,
    url: 'backlinko.com/blog',
};

async function handler() {
    const baseUrl = 'https://backlinko.com';
    const { data: response, url: link } = await got(`${baseUrl}/blog`);

    const $ = load(response);
    const nextDataText = $('#__NEXT_DATA__').text();
    if (!nextDataText) {
        throw new Error('Unable to parse __NEXT_DATA__ from Backlinko blog page');
    }

    const nextData = JSON.parse(nextDataText);
    const {
        buildId,
        props,
    } = nextData;
    const pageProps = props?.pageProps?.props;

    const postNodes = pageProps?.posts?.nodes ?? [];
    const lockedPostNodes = pageProps?.lockedPosts?.nodes ?? pageProps?.backlinkoLockedPosts?.nodes ?? [];
    const list = [...postNodes, ...lockedPostNodes]
        .map((post) => {
            const slug = String(post?.slug ?? '').replace(/^\//, '');
            if (!slug) {
                return;
            }

            return {
                title: post.title,
                link: `${baseUrl}/${slug}`,
                pubDate: post.modified ? parseDate(post.modified) : undefined,
                author: post.author?.node?.name ?? post.author?.name,
                description: post.customFeedContent,
                apiUrl: `${baseUrl}/_next/data/${buildId}/${slug}.json`,
            };
        })
        .filter(Boolean);

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const { data } = await got(item.apiUrl);
                const post = data.pageProps?.post || data.pageProps?.lockedPost || data.pageProps?.props?.post;

                item.description = post?.customFeedContent || post?.content || item.description;
                item.pubDate = item.pubDate ?? (post?.modified ? parseDate(post.modified) : undefined);
                item.author = item.author ?? (post?.author?.node?.name || post?.author?.name);

                return item;
            })
        )
    );

    return {
        title: pageProps?.seo?.title || $('title').text(),
        description: pageProps?.seo?.metaDesc,
        link,
        language: 'en',
        item: items,
    };
}
