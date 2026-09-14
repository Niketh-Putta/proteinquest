/** Browser tab + OG title for proteinquest.app. Always a vertical bar, never an em dash. */
export const MARKETING_PAGE_TITLE =
  'ProteinQuest | Hit your protein. Actually stick with it.';

const EM_OR_EN_DASH = /[—–]/;

export function lockMarketingPageTitles(html) {
  const withTitle = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${MARKETING_PAGE_TITLE}</title>`);
  const locked = withTitle.replace(
    /property="og:title"\s+content="[^"]*"/,
    `property="og:title" content="${MARKETING_PAGE_TITLE}"`,
  );

  const titleMatch = locked.match(/<title>([\s\S]*?)<\/title>/);
  const ogMatch = locked.match(/property="og:title"\s+content="([^"]*)"/);
  if (!titleMatch || titleMatch[1] !== MARKETING_PAGE_TITLE) {
    throw new Error('Marketing <title> must be a vertical bar title, not an em dash.');
  }
  if (!ogMatch || ogMatch[1] !== MARKETING_PAGE_TITLE) {
    throw new Error('Marketing og:title must be a vertical bar title, not an em dash.');
  }
  if (EM_OR_EN_DASH.test(titleMatch[1]) || EM_OR_EN_DASH.test(ogMatch[1])) {
    throw new Error('Marketing page titles must not contain em or en dashes.');
  }
  return locked;
}
