import { config } from '@/config';
import type { Data } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import { getPuppeteerPage } from '@/utils/puppeteer';
import parser from '@/utils/rss-parser';
import timezone from '@/utils/timezone';

export const getHeaders = (cookie = config.smzdm.cookie) => ({
    accept: 'application/json, text/javascript, */*; q=0.01',
    cookie,
    'x-requested-with': 'XMLHttpRequest',
});

const parseCookieHeader = (setCookie: string[] | undefined) =>
    (setCookie ?? [])
        .map((cookieLine) => cookieLine.split(';').shift())
        .filter(Boolean)
        .join('; ');

const getCookieByHttp = async () => {
    const response = await got('https://www.smzdm.com/top/', {
        throwHttpErrors: false,
    });
    const cookie = parseCookieHeader(response.headers['set-cookie']);
    if (!cookie) {
        throw new Error('SMZDM did not return cookie in response headers.');
    }
    return cookie;
};

export const getItemsFromOfficialRss = async (keyword?: string): Promise<Data[]> => {
    const feed = await parser.parseURL('http://feed.smzdm.com');
    const normalizedKeyword = keyword?.trim().toLowerCase();

    return (feed.items ?? [])
        .filter((item) => {
            if (!normalizedKeyword) {
                return true;
            }
            const text = [item.title, item.content, item.contentSnippet].filter(Boolean).join(' ').toLowerCase();
            return text.includes(normalizedKeyword);
        })
        .map((item) => ({
            title: item.title,
            description: item.content ?? item.contentSnippet ?? item.title,
            pubDate: item.pubDate ? timezone(parseDate(item.pubDate), +8) : undefined,
            link: item.link,
        }))
        .filter((item) => Boolean(item.link));
};

export const getCookie = () => {
    if (config.smzdm.cookie) {
        return config.smzdm.cookie;
    }

    return cache.tryGet(
        'smzdm:cookie',
        async () => {
            try {
                return await getCookieByHttp();
            } catch {
                try {
                    const { page, destory } = await getPuppeteerPage('https://www.smzdm.com/top/', {
                        gotoConfig: {
                            waitUntil: 'networkidle2',
                        },
                    });
                    const cookies = await page.cookies();
                    await destory();
                    const cookie = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
                    if (cookie) {
                        return cookie;
                    }
                } catch {
                    // Ignore and fallback to empty cookie.
                }
                return '';
            }
        },
        config.cache.routeExpire,
        false
    );
};
