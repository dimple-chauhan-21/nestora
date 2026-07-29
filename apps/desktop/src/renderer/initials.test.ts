import { describe, expect, it } from 'vitest';
import { initials } from './initials';

describe('initials', () => {
  it('takes first+last letter of a clean two-word name', () => {
    expect(initials('Ramesh Kumar')).toBe('RK');
  });

  it('strips a parenthetical platform suffix instead of using it as a letter', () => {
    expect(initials('Suresh (Zomato)')).toBe('SZ');
  });

  it('falls back to a single letter for a one-word name', () => {
    expect(initials('Priya')).toBe('P');
  });

  it('falls back to "?" for null', () => {
    expect(initials(null)).toBe('?');
  });

  it('falls back to "?" for a name that is only punctuation', () => {
    expect(initials('()')).toBe('?');
  });
});
