// 붉은사막 공략글 자동 수집 스크립트
// GitHub Actions에서 실행됨. 환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 필요 (repo secret).
// Node 20 이상 필요 (전역 fetch 사용).
// NAVER API HUB(신규, 2026.06 이관)의 웹문서/블로그/카페 검색을 통합해서
// 제목+요약(스니펫)+링크만 저장합니다. 원문 전체는 저장하지 않습니다 —
// 저작권 보호를 위해 항상 원문 링크로 연결하는 인덱스 방식입니다.

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const QUERY = process.env.GUIDE_QUERY || '붉은사막 공략';
const DISPLAY = parseInt(process.env.GUIDE_DISPLAY || '30', 10);

const HUB_BASE = 'https://naverapihub.apigw.ntruss.com/search/v1';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 없습니다.');
  process.exit(1);
}

function stripHtml(str) {
  return (str || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'");
}

async function searchNaver(type, query, display) {
  const url = HUB_BASE + '/' + type +
    '?query=' + encodeURIComponent(query) +
    '&display=' + display +
    '&sort=date';

  const res = await fetch(url, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': CLIENT_ID,
      'X-NCP-APIGW-API-KEY': CLIENT_SECRET,
    },
  });
  const data = await res.json();

  // HUB 오류 응답은 {error:{errorCode,message}} 또는 평면형 errorMessage 둘 다 가능
  if (data.error) {
    throw new Error(type + ' 검색 실패: ' + (data.error.message || JSON.stringify(data.error)));
  }
  if (data.errorMessage) {
    throw new Error(type + ' 검색 실패: ' + data.errorMessage);
  }
  return data.items || [];
}

function normalize(items, sourceLabel) {
  return items.map(function (item) {
    return {
      title: stripHtml(item.title),
      summary: stripHtml(item.description),
      link: item.link,
      source: sourceLabel,
      author: item.bloggername || item.cafename || null,
      date: item.postdate || null,
    };
  });
}

async function main() {
  const [webkr, blog, cafe] = await Promise.all([
    searchNaver('webkr', QUERY, DISPLAY),
    searchNaver('blog', QUERY, DISPLAY),
    searchNaver('cafearticle', QUERY, DISPLAY),
  ]);

  let combined = [
    ...normalize(webkr, '웹문서'),
    ...normalize(blog, '블로그'),
    ...normalize(cafe, '카페'),
  ];

  // 링크 기준 중복 제거
  const seen = new Set();
  combined = combined.filter(function (g) {
    if (!g.link || seen.has(g.link)) return false;
    seen.add(g.link);
    return true;
  });

  // 날짜 있는 것부터 최신순 정렬 (없는 항목은 뒤로)
  combined.sort(function (a, b) {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  const output = {
    query: QUERY,
    updatedAt: new Date().toISOString(),
    count: combined.length,
    guides: combined,
  };

  const fs = await import('node:fs/promises');
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile('data/guides.json', JSON.stringify(output, null, 2), 'utf-8');

  console.log(`수집 완료: ${combined.length}개 공략글 저장됨 (data/guides.json)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
