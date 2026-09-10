import { fetchAppleDownloads, fetchPlayDownloads } from './store-download-stats.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const expected = process.env.STATS_ACCESS_TOKEN?.trim();
  const provided = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  try {
    const [apple, android] = await Promise.all([
      fetchAppleDownloads().catch((e) => ({
        total: null,
        error: e instanceof Error ? e.message : 'Apple stats failed',
      })),
      fetchPlayDownloads().catch((e) => ({
        total: null,
        error: e instanceof Error ? e.message : 'Play stats failed',
      })),
    ]);
    const stats = { updatedAt: new Date().toISOString(), apple, android };
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.end(JSON.stringify(stats));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Failed to load stats' }),
    );
  }
}
