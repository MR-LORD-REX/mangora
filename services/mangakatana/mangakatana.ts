import { HTMLElement, parse } from 'node-html-parser';
import {
  BASE_URL,
  DEFAULT_HEADERS,
  MangaEntry,
  MangaList,
  MangaDetails,
  ChapterEntry,
  PageEntry,
  ServerPreference,
  SearchOptions,
  MangaFullInfo,
  SearchResult,
  MONTH_ABBRS,
} from './mangakatana.types';

export class MangaKatana {
  private async fetchHtml(url: string, init?: RequestInit): Promise<HTMLElement> {
    const res = await fetch(url, { headers: DEFAULT_HEADERS, ...init });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status} URL: ${url}`);
    const html = await res.text();
    return parse(html);
  }

  private async fetchHtmlText(url: string, init?: RequestInit): Promise<string> {
    const res = await fetch(url, { headers: DEFAULT_HEADERS, ...init });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status} URL: ${url}`);
    return res.text();
  }

  private absUrl(href: string | undefined | null): string {
    if (!href) return '';
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return 'https:' + href;
    if (href.startsWith('/')) return BASE_URL + href;
    return `${BASE_URL}/${href}`;
  }

  private relUrl(absoluteUrl: string): string {
    if (!absoluteUrl) return '';
    if (absoluteUrl.startsWith(BASE_URL)) {
      return absoluteUrl.substring(BASE_URL.length);
    }
    return absoluteUrl;
  }

  private ownText(el: HTMLElement | null): string {
    if (!el) return '';
    return el.childNodes
      .filter((node) => node.nodeType === 3)
      .map((node) => node.rawText)
      .join('')
      .trim();
  }

  private parseDate(text: string): number | null {
    const m = /^(\w{3})-(\d{2})-(\d{4})$/.exec(text.trim());
    if (!m) return null;
    const monthIndex = MONTH_ABBRS.indexOf(m[1] as (typeof MONTH_ABBRS)[number]);
    if (monthIndex === -1) return null;
    return Date.UTC(Number(m[3]), monthIndex, Number(m[2]));
  }

  private parseMangaList(root: HTMLElement): MangaList {
    const mangas: MangaEntry[] = [];
    const bookList = root.querySelector('div#book_list');

    for (const node of bookList?.childNodes ?? []) {
      if (!(node instanceof HTMLElement) || !node.classList.contains('item')) continue;
      const el = node;

      const titleA = el.querySelector('div.text > h3.title > a');
      const href = this.absUrl(titleA?.getAttribute('href'));
      const title = this.ownText(titleA);

      const thumbnailUrl =
        el.querySelector('picture source[type="image/webp"]')?.getAttribute('srcset') ??
        el.querySelector('img')?.getAttribute('src');

      mangas.push({
        url: this.relUrl(href),
        title,
        thumbnailUrl: this.absUrl(thumbnailUrl),
      });
    }

    const hasNextPage = root.querySelector('a.next.page-numbers') !== null;
    return { mangas, hasNextPage };
  }

  private parseMangaDetailsDoc(root: HTMLElement, url: string): MangaDetails {
    const author = root
      .querySelectorAll('.author')
      .map((el) => el.text.trim())
      .join(', ');

    const description = root.querySelector('.summary > p')?.text.trim() ?? '';
    const altNames = root.querySelector('.alt_name')?.text.trim() ?? '';

    const statusText = (root.querySelector('.value.status')?.text ?? '').toLowerCase();
    let status: MangaDetails['status'] = 'unknown';
    if (statusText.includes('ongoing')) status = 'ongoing';
    else if (statusText.includes('completed')) status = 'completed';
    else if (statusText.includes('cancelled')) status = 'cancelled';

    const genres = root.querySelectorAll('.genres > a').map((el) => el.text.trim());

    const coverWrap = root.querySelector('div.d-cell-medium.media div.cover');
    const coverUrl =
      coverWrap?.querySelector('picture source[type="image/avif"]')?.getAttribute('srcset') ??
      coverWrap?.querySelector('picture source[type="image/webp"]')?.getAttribute('srcset') ??
      coverWrap?.querySelector('img')?.getAttribute('src');

    const title = root.querySelector('h1.heading')?.text.trim() ?? '';

    return {
      url,
      title,
      author,
      altNames,
      description,
      status,
      genres,
      coverUrl: this.absUrl(coverUrl),
    };
  }

  private parseChapterListDoc(root: HTMLElement): ChapterEntry[] {
    const chapters: ChapterEntry[] = [];

    for (const el of root.querySelectorAll('tr')) {
      if (!el.querySelector('.chapter')) continue;

      const a = el.querySelector('.chapter a');
      const href = this.absUrl(a?.getAttribute('href'));
      const name = a?.text.trim() ?? '';
      const dateText = el.querySelector('.update_time')?.text.trim() ?? '';

      chapters.push({
        url: this.relUrl(href),
        name,
        dateUpload: this.parseDate(dateText),
      });
    }

    return chapters;
  }

  private extractImageScript(html: string): string {
    const root = parse(html);
    for (const script of root.querySelectorAll('script')) {
      const content = script.innerHTML ?? script.text ?? '';
      if (content.includes('data-src')) return content;
    }
    return '';
  }

  /**
   * Retrieves the full alphabetical manga directory.
   */
  public async getPopularManga(page = 1): Promise<MangaList> {
    const root = await this.fetchHtml(`${BASE_URL}/manga/page/${page}`);
    return this.parseMangaList(root);
  }

  /**
   * Retrieves the homepage "Latest Updates" feed.
   */
  public async getLatestUpdates(page = 1): Promise<MangaList> {
    const root = await this.fetchHtml(`${BASE_URL}/page/${page}`);
    return this.parseMangaList(root);
  }

  /**
   * Searches for manga using a text query or specific filters.
   */
  public async searchManga(
    query: string,
    page = 1,
    opts: SearchOptions = {},
  ): Promise<SearchResult> {
    let urlStr = '';

    if (query.trim().length > 0) {
      const searchParams = new URLSearchParams();
      searchParams.set('search', query.trim());
      searchParams.set('search_by', opts.searchBy ?? 'm_name');
      urlStr = `${BASE_URL}/page/${page}?${searchParams.toString()}`;
    } else {
      const searchParams = new URLSearchParams();
      searchParams.set('filter', '1');
      if (opts.includeGenres?.length) searchParams.set('include', opts.includeGenres.join('_'));
      if (opts.excludeGenres?.length) searchParams.set('exclude', opts.excludeGenres.join('_'));
      searchParams.set('include_mode', opts.genreMode ?? 'and');
      searchParams.set('order', opts.order ?? 'latest');
      if (opts.status) searchParams.set('status', opts.status);

      const chapters = (opts.minChapters ?? '').trim();
      if (chapters === '-1') searchParams.set('chapters', 'e1');
      else if (chapters === '') searchParams.set('chapters', '1');
      else searchParams.set('chapters', chapters);

      urlStr = `${BASE_URL}/manga/page/${page}?${searchParams.toString()}`;
    }

    const res = await fetch(urlStr, { headers: DEFAULT_HEADERS, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status} URL: ${urlStr}`);

    const finalUrl = res.url;
    const html = await res.text();
    const root = parse(html);

    const pathPart = finalUrl.replace(BASE_URL, '').split('?')[0];
    const segments = pathPart.split('/').filter(Boolean);
    const redirectedToMangaPage = segments[0] === 'manga' && segments[1] !== 'page';

    if (redirectedToMangaPage) {
      return {
        kind: 'details',
        data: this.parseMangaDetailsDoc(root, this.relUrl(finalUrl)),
      };
    }

    return {
      kind: 'list',
      data: this.parseMangaList(root),
    };
  }

  /**
   * Retrieves full details for a specific manga.
   */
  public async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
    const root = await this.fetchHtml(this.absUrl(mangaUrl));
    return this.parseMangaDetailsDoc(root, mangaUrl);
  }

  /**
   * Retrieves the list of chapters for a specific manga.
   */
  public async getChapterList(mangaUrl: string): Promise<ChapterEntry[]> {
    const root = await this.fetchHtml(this.absUrl(mangaUrl));
    return this.parseChapterListDoc(root);
  }

  /**
   * Retrieves both manga details and its chapter list in a single network request.
   */
  public async getMangaDetailsAndChapters(mangaUrl: string): Promise<MangaFullInfo> {
    const root = await this.fetchHtml(this.absUrl(mangaUrl));
    return {
      details: this.parseMangaDetailsDoc(root, mangaUrl),
      chapters: this.parseChapterListDoc(root),
    };
  }

  /**
   * Retrieves adjacent chapters (prev and next) given a manga and current chapter url.
   */
  public async getAdjacentChapters(
    mangaUrl: string,
    currentChapterUrl: string
  ): Promise<{ prev: string | null; next: string | null }> {
    const chapters = await this.getChapterList(mangaUrl);
    const relUrl = this.relUrl(currentChapterUrl);
    const currentIndex = chapters.findIndex((c) => c.url === relUrl);

    if (currentIndex === -1) return { prev: null, next: null };

    // Katana sorts newest first (index 0 is newest chapter)
    return {
      prev: currentIndex < chapters.length - 1 ? chapters[currentIndex + 1].url : null,
      next: currentIndex > 0 ? chapters[currentIndex - 1].url : null,
    };
  }

  /**
   * Retrieves the list of image pages for a specific chapter.
   */
  public async getPageList(
    chapterUrl: string,
    serverPreference: ServerPreference = '',
  ): Promise<PageEntry[]> {
    const suffix = serverPreference ? `?sv=${serverPreference}` : '';
    const html = await this.fetchHtmlText(this.absUrl(chapterUrl) + suffix);
    const imageScript = this.extractImageScript(html);

    if (!imageScript) return [];

    const nameMatch = /data-src['"],\s*(\w+)/.exec(imageScript);
    if (!nameMatch) return [];
    const arrayName = nameMatch[1];

    const arrayRegex = new RegExp(`var ${arrayName}=\\[([^\\[]*)\\]`, 'g');
    let match;
    let longestArrayStr = '';

    while ((match = arrayRegex.exec(imageScript)) !== null) {
      if (match[1].length > longestArrayStr.length) {
        longestArrayStr = match[1];
      }
    }

    if (!longestArrayStr) return [];

    const urls = [...longestArrayStr.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    return urls.map((imageUrl, index) => ({ index, imageUrl }));
  }
}
