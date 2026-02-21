import { load } from 'cheerio';

import type { Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

const baseUrl = 'https://www.paradigm.xyz';

export const route: Route = {
    path: '/writing',
    categories: ['finance'],
    example: '/paradigm/writing',
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
            source: ['paradigm.xyz/writing'],
        },
    ],
    name: 'Writing',
    maintainers: ['Fatpandac'],
    handler,
    url: 'paradigm.xyz/writing',
};

async function handler() {
    const url = `${baseUrl}/writing`;

    const response = await got(url);
    const $ = load(response.data);

    const nextDataText = $('#__NEXT_DATA__').text();
    if (!nextDataText) {
        throw new Error('Unable to parse __NEXT_DATA__ from Paradigm Writing page');
    }

    const nextData = JSON.parse(nextDataText);
    const posts = nextData.props?.pageProps?.components?.[0]?.allPosts ?? [];

    const slugToLink = new Map<string, string>();
    $('a[href^="/20"]').each((_, element) => {
        const href = $(element).attr('href');
        if (!href) {
            return;
        }
        const slug = href.split('/').findLast(Boolean);
        if (slug) {
            slugToLink.set(slug, `${baseUrl}${href}`);
        }
    });

    const list = posts
        .map((item) => {
            const slug = item?.slug?.current ?? item?.slug;
            if (!slug) {
                return;
            }

            const publishDate = item.publishDatetime ?? item.publishDate;
            const parsedDate = publishDate ? parseDate(publishDate) : undefined;
            const generatedLink = publishDate
                ? `${baseUrl}/${new Date(publishDate).getUTCFullYear()}/${String(new Date(publishDate).getUTCMonth() + 1).padStart(2, '0')}/${slug}`
                : undefined;

            return {
                title: item.title,
                link: slugToLink.get(slug) ?? generatedLink ?? `${baseUrl}/${slug}`,
                author: item.authors?.map((author) => author.name).filter(Boolean).join(', '),
                pubDate: parsedDate,
                category: item.tags?.map((tag) => tag.title).filter(Boolean),
                summary: item.summary,
            };
        })
        .filter(Boolean);

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailResponse = await got(item.link);
                const $ = load(detailResponse.data);

                const content = $('div.rich-text.rich-text-post');
                item.description = content.html() || `<p>${item.summary ?? ''}</p>`;

                return item;
            })
        )
    );

    return {
        title: 'Paradigm - Writing',
        link: url,
        item: items,
    };
}
