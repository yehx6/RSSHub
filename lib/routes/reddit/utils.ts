import { load } from 'cheerio';

export function cleanRedditContent(rawHtml: string): { description: string; image?: string } {
    const $ = load(rawHtml, { decodeEntities: true });

    // Extract thumbnail image
    const image = $('td img').attr('src') || undefined;

    // Extract the main text from .md div
    const mdDiv = $('div.md');
    let text = '';
    if (mdDiv.length) {
        text = mdDiv.html()?.replace(/<!--\s*SC_(?:OFF|ON)\s*-->/g, '').trim() || '';
    }

    // Build clean description
    const parts: string[] = [];
    if (image) {
        parts.push(`<img src="${image}" referrerpolicy="no-referrer">`);
    }
    if (text) {
        parts.push(text);
    }

    // Fallback for link-only posts: no .md div, just extract [link] URL
    if (!parts.length) {
        const linkEl = $('span a[href]').first();
        const linkUrl = linkEl.attr('href');
        if (linkUrl && linkUrl !== '') {
            parts.push(`<p><a href="${linkUrl}">${linkUrl}</a></p>`);
        }
    }

    return { description: parts.join('<br>') || '', image };
}
