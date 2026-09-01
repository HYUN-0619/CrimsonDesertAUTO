// 붉은사막 쇼츠 자동 수집 스크립트
// GitHub Actions에서 실행됨. 환경변수 YT_API_KEY 필요 (repo secret).
// Node 20 이상 필요 (전역 fetch 사용).

const API_KEY = process.env.YT_API_KEY;
const QUERY = process.env.SEARCH_QUERY || '#붉은사막 shorts';
const DURATION_LIMIT_SEC = parseInt(process.env.DURATION_LIMIT_SEC || '180', 10);
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '3', 10);

if (!API_KEY) {
  console.error('YT_API_KEY 환경변수가 없습니다.');
  process.exit(1);
}

function parseISODuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || 0, 10);
  const min = parseInt(m[2] || 0, 10);
  const s = parseInt(m[3] || 0, 10);
  return h * 3600 + min * 60 + s;
}

async function fetchSearchPage(pageToken) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', QUERY);
  url.searchParams.set('type', 'video');
  url.searchParams.set('order', 'date');
  url.searchParams.set('maxResults', '50');
  url.searchParams.set('key', API_KEY);
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error('search.list 실패: ' + data.error.message);
  return data;
}

async function fetchVideoDetails(ids) {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'contentDetails,statistics,snippet');
  url.searchParams.set('id', ids.join(','));
  url.searchParams.set('key', API_KEY);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error('videos.list 실패: ' + data.error.message);
  return data.items || [];
}

async function main() {
  const allIds = [];
  let pageToken = undefined;
  let pageCount = 0;

  do {
    const data = await fetchSearchPage(pageToken);
    const ids = (data.items || [])
      .map((item) => item.id && item.id.videoId)
      .filter(Boolean);
    allIds.push(...ids);
    pageToken = data.nextPageToken;
    pageCount++;
  } while (pageToken && pageCount < MAX_PAGES);

  const uniqueIds = [...new Set(allIds)];
  const videos = [];

  for (let i = 0; i < uniqueIds.length; i += 50) {
    const batch = uniqueIds.slice(i, i + 50);
    const items = await fetchVideoDetails(batch);
    for (const item of items) {
      const durationSec = parseISODuration(item.contentDetails.duration);
      if (durationSec > 0 && durationSec <= DURATION_LIMIT_SEC) {
        videos.push({
          id: item.id,
          title: item.snippet.title,
          channel: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          thumb: (item.snippet.thumbnails.high || item.snippet.thumbnails.medium || item.snippet.thumbnails.default).url,
          views: item.statistics ? parseInt(item.statistics.viewCount || '0', 10) : 0,
          durationSec,
        });
      }
    }
  }

  videos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  const output = {
    query: QUERY,
    durationLimitSec: DURATION_LIMIT_SEC,
    updatedAt: new Date().toISOString(),
    count: videos.length,
    videos,
  };

  const fs = await import('node:fs/promises');
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('data/shorts.json', JSON.stringify(output, null, 2), 'utf-8');

  console.log(`수집 완료: ${videos.length}개 쇼츠 저장됨 (data/shorts.json)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
