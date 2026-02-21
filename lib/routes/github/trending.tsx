import { load } from 'cheerio';

import type { Route } from '@/types';
import { ViewType } from '@/types';
import got from '@/utils/got';

export const route: Route = {
    path: '/trending/:since/:language?/:spoken_language?',
    categories: ['programming'],
    example: '/github/trending/daily/javascript/en',
    view: ViewType.Notifications,
    parameters: {
        since: {
            description: 'time range',
            options: [
                {
                    value: 'daily',
                    label: 'Today',
                },
                {
                    value: 'weekly',
                    label: 'This week',
                },
                {
                    value: 'monthly',
                    label: 'This month',
                },
            ],
        },
        language: {
            description: "the feed language, available in [Trending page](https://github.com/trending/javascript?since=monthly) 's URL, don't filter option is `any`",
            default: 'any',
        },
        spoken_language: {
            description: "natural language, available in [Trending page](https://github.com/trending/javascript?since=monthly) 's URL",
        },
    },
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
            source: ['github.com/trending'],
            target: '/trending/:since',
        },
    ],
    name: 'Trending',
    maintainers: ['DIYgod', 'jameschensmith'],
    handler,
    url: 'github.com/trending',
};

function normalizeText(text?: string) {
    return (text ?? '').replaceAll(/\s+/g, ' ').trim();
}

interface GitHubTrendingItem {
    author?: string;
    description: string;
    link: string;
    title: string;
}

interface GitHubSearchRepo {
    description?: string;
    forks_count?: number;
    full_name: string;
    html_url: string;
    language?: string;
    owner?: {
        login?: string;
    };
    stargazers_count?: number;
}

async function fetchFallbackItems(language: string) {
    const query = ['stars:>1', language ? `language:${language}` : undefined].filter(Boolean).join(' ');
    const { data } = await got('https://api.github.com/search/repositories', {
        headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'RSSHub',
        },
        searchParams: {
            order: 'desc',
            per_page: 25,
            q: query,
            sort: 'stars',
        },
        timeout: 15000,
    });

    const repositories: GitHubSearchRepo[] = Array.isArray(data?.items) ? data.items : [];
    const items = repositories.map((repo) => {
            const descriptionParts = [normalizeText(repo.description)];
            if (repo.language) {
                descriptionParts.push(`Language: ${repo.language}`);
            }
            if (repo.stargazers_count !== undefined) {
                descriptionParts.push(`Stars: ${repo.stargazers_count}`);
            }
            if (repo.forks_count !== undefined) {
                descriptionParts.push(`Forks: ${repo.forks_count}`);
            }

            const item: GitHubTrendingItem = {
                title: repo.full_name,
                author: repo.owner?.login,
                description: descriptionParts.filter(Boolean).join('<br>'),
                link: repo.html_url,
            };
            return item;
        });

    if (items.length === 0) {
        throw new Error('GitHub fallback API returned no repositories.');
    }

    return items;
}

async function handler(ctx) {
    const since = ctx.req.param('since');
    const languageParam = ctx.req.param('language') ?? 'any';
    const spokenLanguage = ctx.req.param('spoken_language') ?? '';
    const language = languageParam === 'any' ? '' : languageParam;

    const languageSegment = language ? `/${encodeURIComponent(language)}` : '';
    const spokenLanguageQuery = spokenLanguage ? `&spoken_language_code=${encodeURIComponent(spokenLanguage)}` : '';
    const trendingUrl = `https://github.com/trending${languageSegment}?since=${encodeURIComponent(since)}${spokenLanguageQuery}`;
    let title = 'GitHub Trending';
    let items: GitHubTrendingItem[];

    try {
        const { data: trendingPage } = await got({
            method: 'get',
            url: trendingUrl,
            headers: {
                Referer: trendingUrl,
            },
            timeout: 15000,
        });
        const $ = load(trendingPage);

        const cards = $('article.Box-row').toArray();
        items = cards
            .map((card) => {
                const href = $(card).find('h2 a').attr('href');
                if (!href) {
                    return null;
                }

                const nameWithOwner = href.replace(/^\/+/, '');
                const [owner] = nameWithOwner.split('/');
                const description = normalizeText($(card).find('p').first().text());
                const languageName = normalizeText($(card).find('[itemprop="programmingLanguage"]').first().text());
                const stars = normalizeText($(card).find('a[href$="/stargazers"]').first().text());
                const forks = normalizeText($(card).find('a[href$="/forks"]').first().text());

                const descriptionParts = [description];
                if (languageName) {
                    descriptionParts.push(`Language: ${languageName}`);
                }
                if (stars) {
                    descriptionParts.push(`Stars: ${stars}`);
                }
                if (forks) {
                    descriptionParts.push(`Forks: ${forks}`);
                }

                return {
                    title: nameWithOwner,
                    author: owner,
                    description: descriptionParts.filter(Boolean).join('<br>'),
                    link: `https://github.com/${nameWithOwner}`,
                };
            })
            .filter(Boolean);
        title = normalizeText($('title').text()) || title;
    } catch {
        items = await fetchFallbackItems(language);
        title = language ? `GitHub Trending (${language})` : 'GitHub Trending';
    }

    return {
        title,
        link: trendingUrl,
        item: items,
    };
}
