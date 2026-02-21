import { load } from 'cheerio';
import { renderToString } from 'hono/jsx/dom/server';

import type { Route } from '@/types';
import got from '@/utils/got';

const renderDescription = (item) =>
    renderToString(
        <>
            {item.img ? (
                <>
                    <img src={item.img} />
                    <br />
                </>
            ) : null}
            {item.show
                ? item.show.map((text) => (
                      <>
                          {text}
                          <br />
                      </>
                  ))
                : null}
            {item.desc}
        </>
    );

export const route: Route = {
    path: '/hot',
    categories: ['other'],
    example: '/baidu/hot',
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '热搜榜单',
    maintainers: ['xyqfer'],
    handler,
};

async function handler() {
    const board = 'realtime';
    const link = `https://top.baidu.com/board?tab=${board}`;
    const { data: response } = await got(link);

    const $ = load(response);

    const { data } = JSON.parse(
        $('#sanRoot')
            .contents()
            .filter((e) => e.nodeType === 8)
            .prevObject[0].data.match(/s-data:(.*)/)[1]
    );

    const items = data.cards[0].content.map((item) => ({
        title: item.word,
        description: renderDescription(item),
        link: item.rawUrl,
    }));

    return {
        title: `${data.curBoardName} - 百度热搜`,
        description: $('meta[name="description"]').attr('content'),
        link,
        item: items,
    };
}
