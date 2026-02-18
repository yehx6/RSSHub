import { load } from 'cheerio';

import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';
import { finishArticleItem } from '@/utils/wechat-mp';

const ProcessFeed = (list, cache, current) =>
    Promise.all(
        list
            .filter((item) => {
                // 濡傛灉涓嶅寘鍚摼鎺ヨ鏄庝笉鏄柊闂籭tem锛屽琛ㄥご鐨則r
                const $ = load(item, null, false);
                return $('a').length;
            })
            .map((item) => {
                const $item = load(item, null, false);
                const link = new URL($item('a').attr('href'), current.url).href;
                const listTitle = $item('a').text().trim();
                return cache.tryGet(link, async () => {
                    const hostname = new URL(link).hostname;
                    if (hostname === 'mp.weixin.qq.com') {
                        try {
                            return await finishArticleItem({ title: listTitle, link });
                        } catch {
                            return { title: listTitle, link };
                        }
                    }

                    // 鍔犺浇鏂伴椈鍐呭椤甸潰
                    const response = await got(link);

                    const data = response.data;
                    const $ = load(data); // 浣跨敤 cheerio 鍔犺浇杩斿洖鐨?HTML

                    // 杩樺師鍥剧墖鍦板潃
                    $(`${current.selector.content} img`).each((index, elem) => {
                        const $elem = $(elem);
                        const src = $elem.attr('src');
                        if (src) {
                            $elem.attr('src', new URL(src, link).href);
                        }
                    });

                    // 杩樺師閾炬帴鍦板潃
                    $(`${current.selector.content} a, ul[style]`).each((index, elem) => {
                        const $elem = $(elem);
                        const src = $elem.attr('href');
                        if (src) {
                            $elem.attr('href', new URL(src, link).href);
                        }
                    });

                    // 鍘婚櫎鏍峰紡
                    $('img, div, span, p, table, td, tr, a').removeAttr('style');
                    $('img, video').removeAttr('referrerpolicy');
                    $('style, script').remove();

                    const title = $('h2').text().trim() || listTitle;
                    const content = $(current.selector.content).first().html();
                    const extraList = $('ul[style]').first().html();
                    const description = [content, extraList].filter(Boolean).join('');
                    const dateMatch = $('div.ny_fbt').text().match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);

                    const single = {
                        title,
                        description,
                        link,
                        pubDate: dateMatch ? timezone(parseDate(dateMatch[1], 'YYYY-MM-DD HH:mm'), 8) : undefined,
                        author: '娣卞湷澶у鐮旂┒鐢熸嫑鐢熺綉',
                    };
                    // 杩斿洖鍒楄〃涓婃彁鍙栧埌鐨勪俊鎭?
                    return single;
                });
            })
    );

export default { ProcessFeed };
