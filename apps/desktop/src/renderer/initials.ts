/**
 * Avatar-initials heuristic — splits on runs of non-letter characters (not
 * just whitespace) so a suffix like "Suresh (Zomato)" doesn't hand back the
 * literal "(" as a letter. Takes the first letter of the first and last
 * word found.
 */
export function initials(name: string | null): string {
  if (!name) return '?';
  const words = name.split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
