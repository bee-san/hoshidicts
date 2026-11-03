// SPDX-License-Identifier: GPL-3.0-or-later
// Writes the Vietnamese pack's own rules (sources/own.json) and own text
// processors (sources/own-processors.json), written for this pack from the
// standard description of Vietnamese orthography and reduplication (no
// Yomitan file was read for them).
//
//   node languages/vi/sources/build-own.mjs
//
// Vietnamese words do not inflect. What a lookup has to undo is
//   - reduplication, which repeats a word, often with its tone levelled
//     (đo đỏ "reddish" from đỏ "red"), and
//   - spelling variation: where the tone mark sits (hoà / hòa), i or y in
//     Sino-Vietnamese syllables (kĩ / kỹ), hyphens in older compounds
//     (Hồng-bàng), decomposed Unicode, and capitals.
// The rules do the first, the processors the second.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatJson, formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// Each vowel letter with its six tones: ngang (no mark), huyền, sắc, hỏi,
// ngã, nặng.
export const TONED = {
  a: ['a', 'à', 'á', 'ả', 'ã', 'ạ'],
  ă: ['ă', 'ằ', 'ắ', 'ẳ', 'ẵ', 'ặ'],
  â: ['â', 'ầ', 'ấ', 'ẩ', 'ẫ', 'ậ'],
  e: ['e', 'è', 'é', 'ẻ', 'ẽ', 'ẹ'],
  ê: ['ê', 'ề', 'ế', 'ể', 'ễ', 'ệ'],
  i: ['i', 'ì', 'í', 'ỉ', 'ĩ', 'ị'],
  o: ['o', 'ò', 'ó', 'ỏ', 'õ', 'ọ'],
  ô: ['ô', 'ồ', 'ố', 'ổ', 'ỗ', 'ộ'],
  ơ: ['ơ', 'ờ', 'ớ', 'ở', 'ỡ', 'ợ'],
  u: ['u', 'ù', 'ú', 'ủ', 'ũ', 'ụ'],
  ư: ['ư', 'ừ', 'ứ', 'ử', 'ữ', 'ự'],
  y: ['y', 'ỳ', 'ý', 'ỷ', 'ỹ', 'ỵ'],
};
const NGANG = 0, HUYEN = 1, SAC = 2, HOI = 3, NGA = 4, NANG = 5;

// A reduplicated syllable with a level tone cannot end in a stop: the stop
// becomes the nasal made at the same place (mát → man mát, sạch → sành sạch).
const NASAL = {p: 'm', t: 'n', c: 'ng', ch: 'nh'};

// The last letter of a syllable: a vowel letter with any tone (ă and â never
// end one) or a final consonant (c, ch, m, n, ng, nh, p, t).
const LAST_LETTERS = [
  ...Object.entries(TONED).filter(([v]) => v !== 'ă' && v !== 'â').flatMap(([, forms]) => forms),
  'c', 'h', 'm', 'n', 'g', 'p', 't',
];

// One pattern per last letter reads the two shapes in which a two-word
// expression is said twice (the anchor only lets the engine try it on texts
// that end in that letter):
//   A A B B     → A B    đi đi lại lại → đi lại
//   A Ca A CB   → A CB   lôi tha lôi thôi → lôi thôi, lề mà lề mề → lề mề
//                        (C the whole onset of the second word, then a or à;
//                        not và, and: học và học viên is two words)
// The whole text must have that shape. A single word said twice (xanh xanh,
// đi đi) is not read: in Tatoeba and Việt Nam sử lược the text "X X" was a
// reduplication at 44 places and two words at 41 (máy bay bay, the plane
// flies; bằng chứng chứng minh), and either way it shows the word X, which a
// lookup of X alone shows too; dictionaries list the common ones (xanh xanh).
const ONSET_LETTERS = '[bcdđghklmnpqrstvx]';
function wholeReduplication() {
  const pattern = `^([^ ]+) (?:\\1( [^ ]+)\\2|(?!và )(${ONSET_LETTERS}*)[aà] \\1( \\3[^ ${ONSET_LETTERS.slice(1, -1)}][^ ]*))$`;
  return LAST_LETTERS.map((last) => ({
    type: 'pattern', pattern, replacement: '$1$2$4', anchorSuffix: last, conditionsIn: [], conditionsOut: [],
  }));
}

// Adjectives (and a few verbs and adverbs) whose diminutive or augmentative
// reduplication levels the tone: the first syllable is the word with sắc and
// hỏi made ngang, nặng made huyền and ngã either, and a final p, t, c, ch
// made m, n, ng, nh (đo đỏ, nhè nhẹ, man mát, sành sạch). The words are
// listed because the same shape is common between two words that are not a
// reduplication: cho chó (feed the dog), cùng cũng, tôi tối (I ... tonight).
// Not listed for that reason: tối (tôi tối), lạ (là lạ, which dictionaries
// list), đủ (đu đủ is papaya), sáng (sang sáng: chuyển sang sáng tác, to
// switch to songwriting). ráp is not listed because dictionaries give it only
// as the verb to fit (ram ráp, rough, is another sense). A pair [word, lemma]
// names the headword when the word is spelt like another one: se sẽ (gently)
// is a form of khẽ, and sẽ alone is the future particle.
export const PARTIAL_BASES = [
  // colours and light
  'đỏ', 'trắng', 'tím', 'xám', 'đục', 'nhạt', 'bạc', 'đậm', 'sẫm', 'lợt',
  // size and shape
  'nhỏ', 'bé', 'lớn', 'mỏng', 'thấp', 'ngắn', 'hẹp', 'méo', 'nhọn', 'dẹt', 'bẹt', 'béo', 'mập',
  // taste and smell
  'ngọt', 'mặn', 'đắng', 'chát', 'khét', 'thối', 'ngái', 'khắm',
  // temperature and touch
  'mát', 'lạnh', 'ấm', 'nóng', 'rét', 'cứng', 'ướt', 'ẩm', 'nhẹ', 'nặng', 'lỏng', 'dẻo', 'nhám',
  'nhớt', 'dính', 'nhẵn',
  // manner, speed and sound
  'chậm', 'khẽ', ['sẽ', 'khẽ'], 'lẹ', 'vút', 'vụt', 'cuộn', 'thẳm', 'biệt', 'hổi', 'rượi', 'vợi', 'thoải',
  // quality, likeness and feeling
  'đẹp', 'xấu', 'sạch', 'khá', 'tạm', 'khác', 'giống', 'dở', 'dại', 'ngộ', 'mệt', 'sợ', 'vắng', 'trẻ',
  'thích', 'nhớ', 'tức', 'ngượng',
];

// The levelled forms of a syllable, or [] when it has no tone to level.
export function levelled(syllable) {
  for (const forms of Object.values(TONED)) {
    for (const tone of [SAC, HOI, NGA, NANG]) {
      const at = syllable.indexOf(forms[tone]);
      if (at < 0) continue;
      const head = syllable.slice(0, at);
      const tail = syllable.slice(at + 1);
      const rest = Object.hasOwn(NASAL, tail) ? NASAL[tail] : tail;
      const vowels = tone === NANG ? [forms[HUYEN]] : tone === NGA ? [forms[NGANG], forms[HUYEN]] : [forms[NGANG]];
      return vowels.map((v) => head + v + rest);
    }
  }
  return [];
}

function partialReduplication() {
  const rules = [];
  for (const entry of PARTIAL_BASES) {
    const [base, lemma] = Array.isArray(entry) ? entry : [entry, entry];
    const forms = levelled(base);
    if (forms.length === 0) throw new Error(`${base} has no tone to level`);
    for (const form of forms) {
      rules.push({type: 'wholeWord', inflected: `${form} ${base}`, deinflected: lemma, conditionsIn: [], conditionsOut: []});
    }
  }
  return rules;
}

export function ownRules() {
  return {
    schema: 1,
    conditions: {},
    transforms: [
      {
        id: 'reduplication', name: 'reduplication',
        description: 'A two-word expression said twice, each word repeated (đi đi lại lại → đi lại, back and forth again and again) or the first word repeated after a syllable in -a (lôi tha lôi thôi → lôi thôi, lề mà lề mề → lề mề). It stresses how long or how often something goes on.',
        source: 'own', rules: wholeReduplication(),
      },
      {
        id: 'partialReduplication', name: 'partial reduplication',
        description: 'An adjective said twice, the first time with a level tone (sắc and hỏi lose their mark, nặng becomes huyền) and a final p, t, c or ch made m, n, ng or nh: đo đỏ → đỏ (reddish), nhè nhẹ → nhẹ (gently), man mát → mát (coolish), sành sạch → sạch. It usually softens the adjective; some forms intensify it (vun vút → vút).',
        source: 'own', rules: partialReduplication(),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Processors.

// Open syllables with a glide before the main vowel: old style puts the tone
// on the glide (hòa, khỏe, thủy), new style (the 1980s rules) on the main
// vowel (hoà, khoẻ, thuỷ). Closed syllables (hoàng, tuyết) are written alike.
// After q the u is part of the consonant, so quý and quà never move.
const GLIDES = [['o', 'a'], ['o', 'e'], ['u', 'y']];
function toneMarkPairs() {
  const pairs = [];  // [old, new]
  for (const [glide, main] of GLIDES) {
    for (let tone = HUYEN; tone <= NANG; ++tone) {
      pairs.push([TONED[glide][tone] + main, glide + TONED[main][tone]]);
    }
  }
  return pairs;
}

// A syllable and its capitalised form (Ủy ban, nước Mỹ, Hoa Kỳ).
const capitalised = (text) => text.charAt(0).toUpperCase() + text.slice(1);
function withCapitals(pairs) {
  return pairs.flatMap(([from, to]) => [[from, to], [capitalised(from), capitalised(to)]]);
}

// Map steps that change a syllable only where it ends: before a space and at
// the end of the text. `keep` lists longer endings that must stay (quý).
function syllableEndSteps(pairs, keep) {
  const all = {};
  const end = {};
  for (const k of keep) {
    all[k + ' '] = k + ' ';
    end[k] = k;
  }
  for (const [from, to] of pairs) {
    all[from + ' '] = to + ' ';
    end[from] = to;
  }
  return [{map: all}, {map: end, at: 'end'}];
}

function toneMarkProcessor() {
  const pairs = withCapitals(toneMarkPairs());
  const keep = toneMarkPairs().filter(([, n]) => n.startsWith('u')).flatMap(([o, n]) => ['q' + o, 'q' + n, 'Q' + o, 'Q' + n]);
  return {
    id: 'toneMarks', name: 'Move tone marks (old and new style)',
    variants: [syllableEndSteps(pairs, keep), syllableEndSteps(pairs.map(([o, n]) => [n, o]), keep)],
  };
}

// i and y after h, k, l, m, s, t and qu in a syllable of its own: the 1980s
// rules write i (kĩ thuật, lí do, Mĩ, công ti), older and much current text y
// (kỹ thuật, lý do, Mỹ, công ty). Elsewhere the two are different rhymes
// (tai / tay, tui / tuy) or never alternate (y tá, khi, thi).
const IY_ONSETS = ['h', 'k', 'l', 'm', 's', 't', 'qu'];
// Syllables ending in hi that are not hi: their onset ends in h.
const H_CLUSTERS = ['ch', 'gh', 'kh', 'nh', 'ph', 'th'];
function iyProcessor() {
  const variant = (from, to) => {
    const pairs = [];
    for (const onset of IY_ONSETS) {
      for (let tone = NGANG; tone <= NANG; ++tone) pairs.push([onset + TONED[from][tone], onset + TONED[to][tone]]);
    }
    // quýt and quỵt are also written quít and quịt.
    for (const tone of [SAC, NANG]) pairs.push(['qu' + TONED[from][tone] + 't', 'qu' + TONED[to][tone] + 't']);
    const all = {};
    const start = {};
    const end = {};
    for (const cluster of H_CLUSTERS) {
      for (const f of TONED[from]) {
        for (const keep of [cluster + f, capitalised(cluster + f)]) end[keep] = keep;
      }
    }
    for (const [a, b] of withCapitals(pairs)) {
      all[' ' + a + ' '] = ' ' + b + ' ';
      start[a + ' '] = b + ' ';
      end[a] = b;
    }
    return [{map: all}, {map: start, at: 'start'}, {map: end, at: 'end'}];
  };
  return {id: 'alternateIY', name: 'Alternate i and y (kĩ / kỹ)', variants: [variant('i', 'y'), variant('y', 'i')]};
}

// Lowercase Vietnamese letters a word can start with.
function wordInitials() {
  const consonants = ['b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'x'];
  const loans = ['f', 'j', 'w', 'z'];
  return [...consonants, ...loans, ...Object.values(TONED).flat()];
}

export function ownProcessors() {
  // Older texts join the words of a compound with hyphens and capitalise only
  // the first word of a name (Hồng-bàng, Hải-dương, Đại-Việt sử-ký): a
  // second variant capitalises each word after a hyphen.
  const afterHyphen = {};
  for (const letter of wordInitials()) afterHyphen['-' + letter] = ' ' + letter.toUpperCase();
  return [
    {id: 'normalizeUnicode', name: 'Compose letters and tone marks (NFC)', variants: [[{normalize: 'NFC'}]]},
    {id: 'replaceEth', name: 'Replace Ð with Đ', variants: [[{map: {'\u00D0': '\u0110', '\u00F0': '\u0111'}}]]},
    {id: 'decapitalize', name: 'Decapitalize text', variants: [[{case: 'lower'}]]},
    {id: 'decapitalizeFirstLetter', name: 'Decapitalize first letter (Tiếng Việt → tiếng Việt)', variants: [[{case: 'lowerFirst'}]]},
    {
      id: 'hyphensToSpaces', name: 'Hyphens to spaces (Hồng-bàng → Hồng bàng, Hồng Bàng)',
      variants: [[{map: {'-': ' '}}], [{map: afterHyphen}, {map: {'-': ' '}}]],
    },
    toneMarkProcessor(),
    iyProcessor(),
    {id: 'capitalizeFirstLetter', name: 'Capitalize first letter', variants: [[{case: 'upperFirst'}]]},
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(here, 'own.json'), formatTransforms(ownRules()));
  writeFileSync(join(here, 'own-processors.json'), formatJson(ownProcessors()));
  const counts = ownRules().transforms.map((t) => `${t.id} ${t.rules.length}`).join(', ');
  console.log(`own.json: ${counts}`);
}
