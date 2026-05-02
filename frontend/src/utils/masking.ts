export interface MaskingPattern {
  id: string;
  label: string;
  pattern: string;
  enabled: boolean;
}

const MASK = '••••••••';

/**
 * Replace all occurrences of each enabled pattern inside `value` with the mask
 * string. Patterns that are empty or contain invalid regex are silently skipped.
 */
export function applyMasking(value: string, patterns: MaskingPattern[]): string {
  if (!patterns.length) return value;
  let result = value;
  for (const mp of patterns) {
    if (!mp.enabled || !mp.pattern.trim()) continue;
    try {
      result = result.replace(new RegExp(mp.pattern, 'g'), MASK);
    } catch {
      // invalid regex – skip
    }
  }
  return result;
}

/**
 * Returns true if any enabled pattern matches anywhere in `value`.
 */
export function hasMaskedContent(value: string, patterns: MaskingPattern[]): boolean {
  for (const mp of patterns) {
    if (!mp.enabled || !mp.pattern.trim()) continue;
    try {
      if (new RegExp(mp.pattern).test(value)) return true;
    } catch {
      // invalid regex – skip
    }
  }
  return false;
}
