import { config } from '@/config';
import ConfigNotFoundError from '@/errors/types/config-not-found';
import type { Route } from '@/types';
import cache from '@/utils/cache';
import { parseDate } from '@/utils/parse-date';

import utils, { getVideoUrl } from './utils';
import { exec } from './api/google';

export const route: Route = {
    path: '/search/:keyword/:order?',
    categories: ['social-media'],
    example: '/youtube/search/AI%20coding',
    parameters: {
        keyword: 'Search keyword',
        order: 'Sort order, `date` (default), `relevance`, or `viewCount`',
    },
    features: {
        requireConfig: [
            {
                name: 'YOUTUBE_KEY',
                description:
                    'YouTube API Key (enable YouTube Data API v3), support multiple keys, split them with `,`, [API Key application](https://console.developers.google.com/)',
            },
        ],
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: 'Search',
    maintainers: [],
    handler,
    description: `Search YouTube videos by keyword. Uses YouTube Data API v3 (requires API key).

::: warning API Quota
\`search.list\` costs **100 units** per call. Free quota is 10,000 units/day. With default 30-min cache, each keyword costs ~4,800 units/day.
:::`,
};

async function handler(ctx) {
    if (!config.youtube || !config.youtube.key) {
        throw new ConfigNotFoundError('YouTube RSS is disabled due to the lack of <a href="https://docs.rsshub.app/deploy/config#route-specific-configurations">relevant config</a>');
    }

    const keyword = ctx.req.param('keyword');
    const order = ctx.req.param('order') || 'date';

    const searchResult = await cache.tryGet(
        `youtube:search:${keyword}:${order}`,
        async () => {
            const res = await exec((youtube) =>
                youtube.search.list({
                    part: 'snippet',
                    q: keyword,
                    type: 'video',
                    order,
                    maxResults: 15,
                })
            );
            return res;
        },
        config.cache.routeExpire,
        false
    );

    const items = searchResult?.data?.items || [];

    return {
        title: `YouTube Search: ${keyword}`,
        link: `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`,
        description: `YouTube search results for "${keyword}" sorted by ${order}`,
        item: items.map((item) => {
            const snippet = item.snippet;
            const videoId = item.id.videoId;
            const img = utils.getThumbnail(snippet.thumbnails);

            return {
                title: snippet.title,
                description: utils.renderDescription(true, videoId, img, utils.formatDescription(snippet.description)),
                pubDate: parseDate(snippet.publishedAt),
                link: `https://www.youtube.com/watch?v=${videoId}`,
                author: snippet.channelTitle,
                image: img?.url,
                attachments: [
                    {
                        url: getVideoUrl(videoId),
                        mime_type: 'text/html',
                    },
                ],
            };
        }),
    };
}
