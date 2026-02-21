import type { Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/earthquake',
    categories: ['forecast'],
    example: '/bmkg/earthquake',
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
            source: ['data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json'],
            target: '/bmkg/earthquake',
        },
    ],
    name: 'Recent Earthquakes',
    maintainers: ['Shinanory'],
    handler,
    url: 'bmkg.go.id/gempabumi',
};

async function handler() {
    const apiUrl = 'https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json';
    const pageUrl = 'https://www.bmkg.go.id/gempabumi';
    const response = await got(apiUrl);
    const earthquakes = response.data?.Infogempa?.gempa ?? [];

    const items = earthquakes.map((item) => ({
        title: `M${item.Magnitude} - ${item.Wilayah}`,
        link: pageUrl,
        pubDate: item.DateTime ? parseDate(item.DateTime) : undefined,
        description: [
            `<p><strong>Tanggal:</strong> ${item.Tanggal}</p>`,
            `<p><strong>Waktu:</strong> ${item.Jam}</p>`,
            `<p><strong>Lokasi:</strong> ${item.Coordinates} (${item.Lintang}, ${item.Bujur})</p>`,
            `<p><strong>Kedalaman:</strong> ${item.Kedalaman}</p>`,
            `<p><strong>Magnitudo:</strong> ${item.Magnitude}</p>`,
            `<p><strong>Wilayah:</strong> ${item.Wilayah}</p>`,
            `<p><strong>Potensi:</strong> ${item.Potensi}</p>`,
            item.Shakemap ? `<p><img src="https://data.bmkg.go.id/DataMKG/TEWS/${item.Shakemap}" /></p>` : '',
        ].join(''),
    }));

    return {
        title: 'Recent Earthquakes - BMKG',
        link: pageUrl,
        description: 'Recent earthquake data from BMKG',
        item: items,
        language: 'in',
    };
}
