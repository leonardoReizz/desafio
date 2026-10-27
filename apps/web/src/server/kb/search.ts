import { KB_ARTICLES, type KbArticle } from "./articles";

export interface KbHit {
  article: KbArticle;
  score: number;
}

const STOPWORDS = new Set([
  "a",
  "o",
  "e",
  "de",
  "do",
  "da",
  "no",
  "na",
  "em",
  "um",
  "uma",
  "que",
  "meu",
  "minha",
  "com",
  "para",
  "por",
  "nao",
  "esta",
  "como",
  "os",
  "as",
]);

export function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/**
 * Busca lexical simples com pesos (keywords > título > corpo). Com 5–10 artigos é mais barata,
 * determinística e explicável que embeddings; o score entra no trace.
 */
export function searchKb(query: string, limit = 3): KbHit[] {
  const terms = new Set(normalize(query));
  if (terms.size === 0) return [];
  const hits: KbHit[] = [];
  for (const article of KB_ARTICLES) {
    const kw = new Set(article.keywords.flatMap(normalize));
    const title = new Set(normalize(article.title));
    const body = new Set(normalize(`${article.body} ${article.limits ?? ""}`));
    let score = 0;
    for (const t of terms) {
      if (kw.has(t)) score += 3;
      if (title.has(t)) score += 2;
      if (body.has(t)) score += 1;
    }
    if (score > 0) hits.push({ article, score: score / (terms.size * 3) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
