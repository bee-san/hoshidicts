// SPDX-License-Identifier: GPL-3.0-or-later
// Polytonic Greek orthography helpers for the Ancient Greek pack's rule
// generator (own-rules.mjs) and measurement scripts. No dependencies.

export const NFC = (s) => s.normalize('NFC');
export const NFD = (s) => s.normalize('NFD');

const ACCENT_MARKS = /[\u0300\u0301\u0342]/gu;
const ALL_MARKS = /[\u0300-\u036F]/gu;

/** Removes acute, grave and circumflex accents; keeps breathings, iota subscripts and diaeresis. */
export const stripAccents = (s) => NFC(NFD(s).replace(ACCENT_MARKS, ''));
/** Removes every diacritic: what wiktionary-to-yomitan writes in its form-of rows. */
export const stripAll = (s) => NFC(NFD(s).replace(ALL_MARKS, ''));
/** True when the text carries an acute, grave or circumflex accent. */
export const hasAccent = (s) => /[\u0300\u0301\u0342]/u.test(NFD(s));
/** Circumflex to acute (λῦε → λύε). */
export const circumflexToAcute = (s) => NFC(NFD(s).replace(/\u0342/gu, '\u0301'));
/** Acute to circumflex (σώμα → σῶμα). */
export const acuteToCircumflex = (s) => NFC(NFD(s).replace(/\u0301/gu, '\u0342'));

const BASE_VOWELS = new Set([...'αεηιουωΑΕΗΙΟΥΩ']);
const BASE_CONSONANTS = new Set([...'βγδζθκλμνξπρσςτφχψϝΒΓΔΖΘΚΛΜΝΞΠΡΣΤΦΧΨϜ']);
const NON_ACCENT_MARKS = new Set(['\u0313', '\u0314', '\u0308', '\u0345', '\u0304', '\u0306']);

function decompose(ch) {
  const d = NFD(ch);
  return {base: d[0], marks: [...d.slice(1)]};
}

/** Every precomposed or plain Greek code point, grouped. Computed once from Unicode. */
function computeLetters() {
  const plainVowels = [];
  const accentedVowels = [];
  const consonants = [];
  const ranges = [[0x0370, 0x03ff], [0x1f00, 0x1fff]];
  for (const [lo, hi] of ranges) {
    for (let cp = lo; cp <= hi; cp++) {
      const ch = String.fromCodePoint(cp);
      if (!/\p{L}/u.test(ch)) continue;
      if (NFC(ch) !== ch) continue; // oxia forms and other singletons: never in NFC text
      const {base, marks} = decompose(ch);
      if (BASE_VOWELS.has(base)) {
        if (marks.some((m) => m === '\u0300' || m === '\u0301' || m === '\u0342')) {
          accentedVowels.push(ch);
        } else if (marks.every((m) => NON_ACCENT_MARKS.has(m))) {
          plainVowels.push(ch);
        }
      } else if (BASE_CONSONANTS.has(base)) {
        consonants.push(ch);
      }
    }
  }
  return {plainVowels, accentedVowels, consonants};
}

export const LETTERS = computeLetters();

function escapeForClass(ch) {
  const cp = ch.codePointAt(0);
  if (cp < 0x80) return /[\\\]^-]/.test(ch) ? `\\${ch}` : ch;
  return `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

/** A bracket expression for a set of characters (pattern dialect: \uXXXX escapes). */
export function charClass(chars) {
  const cps = [...new Set(chars)].map((c) => c.codePointAt(0)).sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < cps.length; ) {
    let j = i;
    while (j + 1 < cps.length && cps[j + 1] === cps[j] + 1) j++;
    const a = escapeForClass(String.fromCodePoint(cps[i]));
    const b = escapeForClass(String.fromCodePoint(cps[j]));
    parts.push(i === j ? a : j === i + 1 ? a + b : `${a}-${b}`);
    i = j + 1;
  }
  return `[${parts.join('')}]`;
}

const baseOf = (ch) => NFD(ch)[0].toLowerCase();
const marksOf = (ch) => [...NFD(ch).slice(1)];

/** Vowels of accentless NFC text that can start a diphthong (no mark of their own). */
const DIPHTHONG_FIRST = new Set([...'αεηοΑΕΗΟ']);

/** Short by nature: ε and ο with any non-accent marks. */
export const isShortVowel = (ch) => 'εο'.includes(baseOf(ch));
/** Long by nature: η, ω and any vowel with iota subscript. */
export const isLongVowel = (ch) => 'ηω'.includes(baseOf(ch)) || marksOf(ch).includes('\u0345');

/**
 * Syllable nuclei of a word, left to right: {start, end (exclusive, in code
 * units of the NFC string), text, length: 'long' | 'short' | 'either'}.
 */
export function nuclei(word) {
  const s = NFC(word);
  const chars = [...s];
  const out = [];
  let offset = 0;
  const offsets = chars.map((c) => {
    const o = offset;
    offset += c.length;
    return o;
  });
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (!BASE_VOWELS.has(NFD(ch)[0])) continue;
    const next = chars[i + 1];
    const marks = marksOf(ch);
    const nextBase = next ? baseOf(next) : '';
    const nextMarks = next ? marksOf(next) : [];
    const firstPlain = DIPHTHONG_FIRST.has(NFD(ch)[0]) && !marks.some((m) => m !== '\u0301' && m !== '\u0342' && m !== '\u0300');
    const upsilonPlain = baseOf(ch) === 'υ' && marks.every((m) => m === '\u0301' || m === '\u0342' || m === '\u0300') && marks.length === 0;
    const nextIsSecond = next && ('ιυ'.includes(nextBase)) && !nextMarks.includes('\u0308');
    const diphthong = (firstPlain && marks.length === 0 && nextIsSecond) || (upsilonPlain && next && nextBase === 'ι' && !nextMarks.includes('\u0308'));
    if (diphthong) {
      out.push({start: offsets[i], end: offsets[i + 1] + next.length, text: ch + next, length: 'long'});
      i++;
    } else {
      out.push({start: offsets[i], end: offsets[i] + ch.length, text: ch, length: isShortVowel(ch) ? 'short' : isLongVowel(ch) ? 'long' : 'either'});
    }
  }
  return out;
}

/** Puts an accent ('acute' or 'circumflex') on nucleus `index` counted from the end (0 = ultima). */
export function placeAccent(word, indexFromEnd, kind = 'acute') {
  const s = stripAccents(word);
  const ns = nuclei(s);
  const n = ns[ns.length - 1 - indexFromEnd];
  if (!n) return null;
  const mark = kind === 'acute' ? '\u0301' : '\u0342';
  // The accent sits on the last vowel of the nucleus (the second of a diphthong).
  return NFC(s.slice(0, n.end) + mark + s.slice(n.end));
}

/** Index from the end of the accented nucleus, or -1. */
export function accentPosition(word) {
  const ns = nuclei(word);
  for (let k = 0; k < ns.length; k++) {
    const n = ns[ns.length - 1 - k];
    if (hasAccent(n.text)) return k;
  }
  return -1;
}

/**
 * Recessive accent of a whole verb form: antepenult when the ultima is short,
 * penult when it is long. `ultima` overrides the ultima's length ('short' for
 * final -αι and -οι outside the optative).
 */
export function recessive(word, ultima) {
  const s = stripAccents(word);
  const ns = nuclei(s);
  if (ns.length === 0) return s;
  let last = ultima ?? ns[ns.length - 1].length;
  if (last === 'either') last = 'short';
  if (ns.length === 1) return placeAccent(s, 0, ns[0].length === 'long' ? 'circumflex' : 'acute');
  if (last === 'long') return placeAccent(s, 1, 'acute');
  if (ns.length >= 3) return placeAccent(s, 2, 'acute');
  // Two syllables, short ultima: circumflex on a long penult.
  return placeAccent(s, 1, ns[0].length === 'long' ? 'circumflex' : 'acute');
}

export const PLAIN_VOWEL_CLASS = charClass(LETTERS.plainVowels);
export const ACCENTED_VOWEL_CLASS = charClass(LETTERS.accentedVowels);
export const CONSONANT_CLASS = charClass(LETTERS.consonants);
