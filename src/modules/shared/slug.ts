const DIACRITICS_REGEX = new RegExp("[\\u0300-\\u036f]", "g");

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(DIACRITICS_REGEX, "") // remove acentos (á -> a, ç -> c, ...)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function randomSlugSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}
