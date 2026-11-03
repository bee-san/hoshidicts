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

// What can follow the tone-bearing vowel letter in a syllable: nothing, a
// glide or second vowel letter (ai, ao, ia, ưa, and the old-style òa, ỏe,
// ủy), or a final consonant. Stops (p, t, c, ch) take only sắc and nặng.
const RESTS = {
  a: ['', 'i', 'o', 'u', 'y', 'm', 'n', 'ng', 'nh', 'p', 't', 'c', 'ch'],
  ă: ['m', 'n', 'ng', 'p', 't', 'c'],
  â: ['u', 'y', 'm', 'n', 'ng', 'p', 't', 'c'],
  e: ['', 'o', 'm', 'n', 'ng', 'p', 't', 'c'],
  ê: ['', 'u', 'm', 'n', 'ng', 'nh', 'p', 't', 'c', 'ch'],
  i: ['', 'a', 'u', 'm', 'n', 'nh', 'p', 't', 'ch'],
  o: ['', 'a', 'e', 'i', 'm', 'n', 'ng', 'p', 't', 'c'],
  ô: ['', 'i', 'm', 'n', 'ng', 'p', 't', 'c'],
  ơ: ['', 'i', 'u', 'm', 'n', 'ng', 'p', 't', 'c'],
  u: ['', 'a', 'i', 'y', 'm', 'n', 'ng', 'p', 't', 'c'],
  ư: ['', 'a', 'i', 'u', 'm', 'n', 'ng', 't', 'c'],
  y: ['', 'u', 'nh', 'p', 't', 'ch'],
};
// A reduplicated syllable with a level tone cannot end in a stop: the stop
// becomes the nasal made at the same place (mát → man mát, sạch → sành sạch).
const NASAL = {p: 'm', t: 'n', c: 'ng', ch: 'nh'};

// The last letter of a syllable: a vowel letter with any tone (ă and â never
// end one) or a final consonant (c, ch, m, n, ng, nh, p, t).
const LAST_LETTERS = [
  ...Object.entries(TONED).filter(([v]) => v !== 'ă' && v !== 'â').flatMap(([, forms]) => forms),
  'c', 'h', 'm', 'n', 'g', 'p', 't',
];

// Leading words a reduplicated pair may follow (đỏ chon chót → đỏ chót).
const LEAD = '((?:[^ ]+ )*)';

function fullReduplication() {
  return LAST_LETTERS.map((last) => ({
    type: 'pattern', pattern: '(^| )([^ ]+) \\2$', replacement: '$1$2', anchorSuffix: last,
    conditionsIn: [], conditionsOut: [],
  }));
}

function aabbReduplication() {
  return LAST_LETTERS.map((last) => ({
    type: 'pattern', pattern: `^${LEAD}([^ ]+) \\2 ([^ ]+) \\3$`, replacement: '$1$2 $3', anchorSuffix: last,
    conditionsIn: [], conditionsOut: [],
  }));
}

// lôi thôi → lôi tha lôi thôi: the first syllable, the second's onset with a
// (ngang or huyền), then both syllables.
const ONSET_LETTERS = '[bcdđghklmnpqrstvx]';
function thaReduplication() {
  return LAST_LETTERS.map((last) => ({
    type: 'pattern', pattern: `^${LEAD}([^ ]+) (${ONSET_LETTERS}*)[aà] \\2 (\\3[^ ]+)$`, replacement: '$1$2 $4',
    anchorSuffix: last, conditionsIn: [], conditionsOut: [],
  }));
}

// The reduplicant (first syllable) is the base (second) with its tone made
// level: sắc and hỏi become ngang, nặng becomes huyền, and ngã either (khe
// khẽ, dề dễ); a final stop becomes a nasal. The onset, glide and every
// letter before the toned vowel are repeated as they are (khoe khoẻ).
function partialReduplication() {
  const rules = [];
  for (const [vowel, forms] of Object.entries(TONED)) {
    for (const rest of RESTS[vowel]) {
      const stop = Object.hasOwn(NASAL, rest);
      for (const tone of stop ? [SAC, NANG] : [SAC, HOI, NGA, NANG]) {
        const base = forms[tone] + rest;
        const levelled = tone === NANG ? [forms[HUYEN]] : tone === NGA ? [forms[NGANG], forms[HUYEN]] : [forms[NGANG]];
        const restOut = stop ? NASAL[rest] : rest;
        const reduplicant = levelled.length === 1 ? `${levelled[0]}${restOut}` : `(?:${levelled.map((v) => v + restOut).join('|')})`;
        rules.push({
          type: 'pattern', pattern: `^${LEAD}([^ ]*)${reduplicant} \\2${base}$`, replacement: `$1$2${base}`,
          anchorSuffix: base, conditionsIn: [], conditionsOut: [],
        });
      }
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
        description: 'Full reduplication: the word said twice (xanh xanh → xanh, người người → người). It softens an adjective (bluish), repeats a verb or makes a noun mean "every". Also the last word of a phrase (trắng phau phau → trắng phau).',
        source: 'own', rules: fullReduplication(),
      },
      {
        id: 'partialReduplication', name: 'partial reduplication',
        description: 'The word said twice, the first time with a level tone (sắc and hỏi lose their mark, nặng becomes huyền, ngã either) and a final p, t, c or ch made m, n, ng or nh: đo đỏ → đỏ, nhè nhẹ → nhẹ, man mát → mát, sành sạch → sạch. It usually softens an adjective (reddish, a little light); some forms intensify it (vun vút → vút). Also after a word (đỏ chon chót → đỏ chót).',
        source: 'own', rules: partialReduplication(),
      },
      {
        id: 'aabbReduplication', name: 'AABB reduplication',
        description: 'Each word of a two-word expression said twice: đi đi lại lại → đi lại (going back and forth again and again), vội vội vàng vàng → vội vàng.',
        source: 'own', rules: aabbReduplication(),
      },
      {
        id: 'thaReduplication', name: 'four-syllable reduplication',
        description: 'A two-word expression with its first word repeated after a syllable in -a: lôi tha lôi thôi → lôi thôi, lẩm bà lẩm bẩm → lẩm bẩm. It stresses how long or how often something goes on.',
        source: 'own', rules: thaReduplication(),
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

// A tone mark typed on the first letter of iê, yê, uô or ươ belongs on the
// second; such spellings (ngừơi, múôn, tíêng) are never right.
function misplacedTonePairs() {
  const pairs = [];  // [wrong, right]
  for (const [first, second] of [['i', 'ê'], ['y', 'ê'], ['u', 'ô'], ['ư', 'ơ']]) {
    for (let tone = HUYEN; tone <= NANG; ++tone) {
      pairs.push([TONED[first][tone] + second, first + TONED[second][tone]]);
    }
  }
  return pairs;
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
  const pairs = toneMarkPairs();
  const keep = pairs.filter(([, n]) => n.startsWith('u')).flatMap(([o, n]) => ['q' + o, 'q' + n]);
  const typos = Object.fromEntries(misplacedTonePairs());
  return {
    id: 'toneMarks', name: 'Move tone marks (old and new style)',
    variants: [
      [{map: typos}, ...syllableEndSteps(pairs, keep)],
      [{map: typos}, ...syllableEndSteps(pairs.map(([o, n]) => [n, o]), keep)],
    ],
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
    const all = {};
    const start = {};
    const end = {};
    for (const cluster of H_CLUSTERS) {
      for (const f of TONED[from]) end[cluster + f] = cluster + f;
    }
    for (const onset of IY_ONSETS) {
      for (let tone = NGANG; tone <= NANG; ++tone) {
        const a = onset + TONED[from][tone];
        const b = onset + TONED[to][tone];
        all[' ' + a + ' '] = ' ' + b + ' ';
        start[a + ' '] = b + ' ';
        end[a] = b;
      }
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
  const titleMap = {};
  for (const letter of wordInitials()) titleMap[' ' + letter] = ' ' + letter.toUpperCase();
  return [
    {id: 'normalizeUnicode', name: 'Compose letters and tone marks (NFC)', variants: [[{normalize: 'NFC'}]]},
    {id: 'replaceEth', name: 'Replace Ð with Đ', variants: [[{map: {'\u00D0': '\u0110', '\u00F0': '\u0111'}}]]},
    {id: 'hyphensToSpaces', name: 'Hyphens to spaces (Hồng-bàng → Hồng bàng)', variants: [[{map: {'-': ' '}}]]},
    {id: 'decapitalize', name: 'Decapitalize text', variants: [[{case: 'lower'}]]},
    toneMarkProcessor(),
    iyProcessor(),
    {id: 'capitalizeFirstLetter', name: 'Capitalize first letter', variants: [[{case: 'upperFirst'}]]},
    {id: 'capitalizeWords', name: 'Capitalize every word (Hà Nội)', variants: [[{case: 'lower'}, {case: 'upperFirst'}, {map: titleMap}]]},
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(here, 'own.json'), formatTransforms(ownRules()));
  writeFileSync(join(here, 'own-processors.json'), formatJson(ownProcessors()));
  const counts = ownRules().transforms.map((t) => `${t.id} ${t.rules.length}`).join(', ');
  console.log(`own.json: ${counts}`);
}
