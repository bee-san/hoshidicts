#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/ko/sources/own.json: the Korean deinflection rules written
// for hoshidicts (docs/languages.md, section 14 step 2), before Yomitan's
// Korean rules were read.
//
//   node languages/ko/sources/own-rules.mjs
//
// The pack's preprocessor splits Hangul into jamo (hangul.disassemble) and its
// postprocessor joins them again, so every rule is a suffix rule on jamo:
// 먹었어요 is ㅁㅓㄱㅇㅓㅆㅇㅓㅇㅛ, and -어요 → -다 gives ㅁㅓㄱㅇㅓㅆㄷㅏ (먹었다).
// Affixes are written below in Hangul and converted with `jamo()`.
//
// A predicate is stem + pre-final endings (-시- honorific, -었- past,
// -겠- future/conjecture) + one final ending. A final-ending rule turns the
// word into "stem + pre-finals + 다" and sets the conditions saying which
// pre-finals may still be removed; the pre-final rules then remove -겠-,
// -었- and -시- in that order (the reverse of the order they are added in).
// The stem's spelling changes with the ending; the alternations are the
// tables `A_FORMS` (endings in -아/-어), `U_FORMS` (endings in -(으)) and
// the ㄹ-dropping of `dropsLieul`.
//
// Transform ids follow Yomitan's Korean ids where the ending is the same
// (aligned after the "ko: own rules" commit, rules unchanged), so
// tools/merge-transforms.mjs pairs them; the names and descriptions are ours.
//
// Nouns are not deinflected: particles are written together with the noun
// (학교에서), and the pack's character resolution looks up 학교 as a prefix.
// Only the contractions of pronouns with particles, which shortening does
// not reach (난 → 나, 이건 → 이것), have rules.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

// --- Hangul to jamo, as hangul.disassemble does it ---------------------------
const CHO = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const SPLIT = {ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ', ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ'};

/** Hangul syllables and compatibility jamo as the jamo the rules see. */
export function jamo(text) {
    let out = '';
    for (const c of text) {
        const cp = c.codePointAt(0);
        if (cp >= 0xAC00 && cp <= 0xD7A3) {
            const i = cp - 0xAC00;
            out += CHO[Math.floor(i / 588)] + JUNG[Math.floor((i % 588) / 28)] + JONG[i % 28];
        } else {
            out += SPLIT[c] ?? c;
        }
    }
    return out;
}

const VOWEL = '{vowel}';
const CONSONANT = '{consonant}';
const VOWEL_OR_LIEUL = '[\\u314F-\\u3163ㄹ]';
// A consonant other than ㄹ: ㄹ stems take no 으 (살면, not 살으면), so 들은 is
// 듣다, never 들다.
const CONSONANT_NOT_LIEUL = '[\\u3131-\\u3138\\u313A-\\u314E]';
const LIEUL_DROP_INITIALS = new Set(['ㄴ', 'ㅂ', 'ㅅ']);

// --- Conditions -----------------------------------------------------------------
const CONDITIONS = {
    v: {name: 'Verb', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    pron: {name: 'Pronoun', isDictionaryForm: true},
    // kty-ko-en tags the copula 이다 `particle` (its other 이다 is the verb
    // "to carry on the head", tagged `v`).
    particle: {name: 'Particle (the copula 이다)', isDictionaryForm: true},
    // Yomitan's condition for the copula 이다 (added after the own-rules
    // commit, so that a dictionary tagging 이다 `ida` matches; kty-ko-en
    // does not use the tag).
    ida: {name: 'Postpositional particle ida', isDictionaryForm: true},
    // Yomitan's conditions for a bare stem that one of its endings leaves
    // behind (먹었으나 -> 먹었 marked p): the own pre-final rules below take
    // these stems too, under their own stem constraints, so Yomitan's endings
    // combine with -았/었-, -겠- and -(으)시- (added after the own-rules commit).
    p: {name: 'Intermediate past tense ending', isDictionaryForm: false},
    f: {name: 'Intermediate future tense ending', isDictionaryForm: false},
    eusi: {name: 'Intermediate formal ending', isDictionaryForm: false},
    '-시': {name: 'Stem with the honorific -(으)시-', isDictionaryForm: false},
    '-었': {name: 'Stem with the past -었-', isDictionaryForm: false},
    '-겠': {name: 'Stem with -겠-', isDictionaryForm: false},
    '-다': {name: 'Plain declarative before a quotative ending', isDictionaryForm: false},
};

// Which pre-final endings may stand before a final ending.
// The copula 이다 takes the endings adjectives take, so those lists name ida.
const ALL = ['v', 'adj', 'ida', '-겠', '-었', '-시'];
const PAST = ['v', 'adj', 'ida', '-었', '-시'];
const HON = ['v', 'adj', 'ida', '-시'];
const VERB_HON = ['v', '-시'];
const PRED = ['v', 'adj', 'ida'];
const QUOTE = ['v', 'adj', 'ida', '-겠', '-었', '-시', '-다'];

// The conditions of an ending's ㅎ-irregular forms, which only adjectives have,
// or null when the ending takes no adjectives.
function adjectiveOutput(out) {
    return out.includes('adj') ? out.filter((c) => c !== 'v') : null;
}

function suffix(inflected, deinflected, conditionsIn, conditionsOut, extra = {}) {
    const rule = {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut};
    for (const [key, value] of Object.entries(extra)) {
        if (value !== undefined && !(key === 'stemMinLength' && value === 0)) { rule[key] = value; }
    }
    return rule;
}

// --- Endings attached to the stem as it is (-고, -지, -는, -네, ...) ------------
// An ending that starts with ㄴ, ㅂ or ㅅ drops a stem-final ㄹ: 살다 → 사는, 사네.
function dropsLieul(ending) {
    const first = ending[0];
    if (LIEUL_DROP_INITIALS.has(first)) { return true; }
    // ㄹ alone or ㄹ + consonant (-(으)ㄹ, -(으)ㄹ까): 살 + ㄹ까 → 살까.
    return first === 'ㄹ' && (ending.length === 1 || !/[\u314F-\u3163]/u.test(ending[1]));
}

function direct(ending, out, {conditionsIn = [], deinflected = '다'} = {}) {
    const e = jamo(ending);
    const d = jamo(deinflected);
    const rules = [suffix(e, d, conditionsIn, out, {stemMinLength: 2})];
    if (dropsLieul(e)) { rules.push(suffix(e, 'ㄹ' + d, conditionsIn, out, {stemMinLength: 1, stemEndsWith: VOWEL})); }
    return rules;
}

// Endings in 는/느 (-는, -는데, -는지, -는걸, -느냐) attach to verbs and to
// 있다 and 없다 (재미있는, 맛없는데), which kty-ko-en tags as adjectives, but
// not to other adjectives or the copula (예쁜, 인).
function neun(ending, out) {
    const e = jamo(ending);
    const verbal = out.filter((c) => c !== 'adj' && c !== 'ida');
    const exist = out.filter((c) => c !== 'ida');
    return [
        ...direct(ending, verbal),
        suffix('ㅇㅣㅆ' + e, 'ㅇㅣㅆㄷㅏ', [], exist),
        suffix('ㅇㅓㅂㅅ' + e, 'ㅇㅓㅂㅅㄷㅏ', [], exist),
    ];
}

// --- Endings in -(으) (-(으)면, -(으)ㄴ, -(으)시-, ...) ---------------------------
// [inflected stem end, deinflected stem end, constraints, adjectives only]
function eu(ending, out, {conditionsIn = [], deinflected = '다', vowelStem = true, lieulKeeps = true} = {}) {
    const e = jamo(ending);
    const d = jamo(deinflected);
    const drop = dropsLieul(e);
    const adjOnly = adjectiveOutput(out);
    const rules = [];
    // 가 + 면, and 살 + 면 (the ㄹ stays before 면, 며, 러, 려).
    if (vowelStem) { rules.push(suffix(e, d, conditionsIn, out, {stemMinLength: 2, stemEndsWith: drop || !lieulKeeps ? VOWEL : VOWEL_OR_LIEUL})); }
    // 먹 + 으면.
    rules.push(suffix('ㅇㅡ' + e, d, conditionsIn, out, {stemMinLength: 2, stemEndsWith: CONSONANT_NOT_LIEUL}));
    // 살 + ㄴ → 산, 살 + 니까 → 사니까 (with vowelStem false, the plain
    // ending's own rule already has it).
    if (drop && vowelStem) { rules.push(suffix(e, 'ㄹ' + d, conditionsIn, out, {stemMinLength: 1, stemEndsWith: VOWEL})); }
    // ㅂ: 춥 + 으면 → 추우면.
    rules.push(suffix('ㅇㅜ' + e, 'ㅂ' + d, conditionsIn, out, {stemMinLength: 1}));
    // ㄷ: 듣 + 으면 → 들으면.
    rules.push(suffix('ㄹㅇㅡ' + e, 'ㄷ' + d, conditionsIn, out, {stemMinLength: 1, stemEndsWith: VOWEL}));
    // ㅅ: 낫 + 으면 → 나으면.
    rules.push(suffix('ㅇㅡ' + e, 'ㅅ' + d, conditionsIn, out, {stemMinLength: 1, stemEndsWith: VOWEL}));
    // ㅎ (adjectives): 그렇 + 으면 → 그러면, 빨갛 + 은 → 빨간.
    if (adjOnly !== null) { rules.push(suffix(e, 'ㅎ' + d, conditionsIn, adjOnly, {stemMinLength: 2, stemEndsWith: '[ㅏㅓㅑㅕ]'})); }
    return rules;
}

// --- Endings in -아/-어 (-어요, -어서, -었-, ...) ---------------------------------
// Each row: inflected stem end + 아/어, deinflected stem end, constraints.
// `adj` marks the ㅎ-irregular adjectives.
const A_FORMS = [
    // 먹 + 어, 잡 + 아, 보 + 아, 주 + 어, 마시 + 어, 되 + 어, 내 + 어 (uncontracted).
    ['ㅇㅓ', '', {stemMinLength: 2, stemNotEndsWith: '[ㅏㅓㅕㅡ]'}],
    ['ㅇㅏ', '', {stemMinLength: 2, stemNotEndsWith: '[ㅏㅓㅕㅡ]'}],
    // 가 + 아 → 가, 서 + 어 → 서, 켜 + 어 → 켜, 보내 + 어 → 보내, 세 + 어 → 세.
    ['', '', {stemMinLength: 2, stemEndsWith: '[ㅏㅓㅕㅐㅔ]'}],
    // 보 + 아 → 봐, 오 + 아 → 와.
    ['ㅏ', '', {stemMinLength: 2, stemEndsWith: '[ㅗ]'}],
    // 주 + 어 → 줘, 배우 + 어 → 배워.
    ['ㅓ', '', {stemMinLength: 2, stemEndsWith: '[ㅜ]'}],
    // 마시 + 어 → 마셔, 지 + 어 → 져, 가시 + 어 → 가셔.
    ['ㅕ', 'ㅣ', {stemMinLength: 1}],
    // 되 + 어 → 돼.
    ['ㅐ', 'ㅣ', {stemMinLength: 2, stemEndsWith: '[ㅗ]'}],
    // ㅡ drops: 쓰 + 어 → 써, 바쁘 + 아 → 바빠.
    // Not after ㄹ: 르 stems are 르- or 러-irregular (자르다 -> 잘라, 이르다 ->
    // 이르러), so 사러 is never 사르다; the few that drop ㅡ follow.
    ['ㅓ', 'ㅡ', {stemMinLength: 1, stemEndsWith: CONSONANT_NOT_LIEUL}],
    ['ㅏ', 'ㅡ', {stemMinLength: 1, stemEndsWith: CONSONANT_NOT_LIEUL}],
    // 르 stems that drop ㅡ: 따르다 (뒤따르다, 잇따르다) -> 따라, 치르다 -> 치러,
    // 들르다 -> 들러, 우러르다 -> 우러러, 다다르다 -> 다다라.
    ['ㄸㅏㄹㅏ', 'ㄸㅏㄹㅡ', {}],
    ['ㅊㅣㄹㅓ', 'ㅊㅣㄹㅡ', {}],
    ['ㄷㅡㄹㄹㅓ', 'ㄷㅡㄹㄹㅡ', {}],
    ['ㅇㅜㄹㅓㄹㅓ', 'ㅇㅜㄹㅓㄹㅡ', {}],
    ['ㄷㅏㄷㅏㄹㅏ', 'ㄷㅏㄷㅏㄹㅡ', {}],
    // 르: 모르 + 아 → 몰라, 부르 + 어 → 불러.
    ['ㄹㄹㅏ', 'ㄹㅡ', {stemMinLength: 2, stemEndsWith: VOWEL}],
    ['ㄹㄹㅓ', 'ㄹㅡ', {stemMinLength: 2, stemEndsWith: VOWEL}],
    // 러: 이르 + 어 → 이르러, 푸르 + 어 → 푸르러.
    ['ㄹㅡㄹㅓ', 'ㄹㅡ', {stemMinLength: 2, stemEndsWith: VOWEL}],
    // ㅂ: 춥 + 어 → 추워, 돕 + 아 → 도와.
    ['ㅇㅜㅓ', 'ㅂ', {stemMinLength: 1}],
    ['ㅇㅗㅏ', 'ㅂ', {stemMinLength: 1}],
    // ㄷ: 듣 + 어 → 들어, 깨닫 + 아 → 깨달아.
    ['ㄹㅇㅓ', 'ㄷ', {stemMinLength: 1, stemEndsWith: VOWEL}],
    ['ㄹㅇㅏ', 'ㄷ', {stemMinLength: 1, stemEndsWith: VOWEL}],
    // ㅅ: 짓 + 어 → 지어, 낫 + 아 → 나아.
    ['ㅇㅓ', 'ㅅ', {stemMinLength: 1, stemEndsWith: VOWEL}],
    ['ㅇㅏ', 'ㅅ', {stemMinLength: 1, stemEndsWith: VOWEL}],
    // ㅎ (adjectives): 그렇 + 어 → 그래, 빨갛 + 아 → 빨개, 하얗 + 아 → 하얘, 허옇 + 어 → 허예.
    ['ㅐ', 'ㅓㅎ', {stemMinLength: 1, stemEndsWith: CONSONANT}, 'adj'],
    ['ㅐ', 'ㅏㅎ', {stemMinLength: 1, stemEndsWith: CONSONANT}, 'adj'],
    ['ㅒ', 'ㅑㅎ', {stemMinLength: 1, stemEndsWith: CONSONANT}, 'adj'],
    ['ㅖ', 'ㅕㅎ', {stemMinLength: 1, stemEndsWith: CONSONANT}, 'adj'],
    // ㅓ ㅎ-irregular colour adjectives: 누렇 + 어 → 누레, 시꺼멓 + 어 → 시꺼메.
    ['ㅔ', 'ㅓㅎ', {stemMinLength: 1, stemEndsWith: CONSONANT}, 'adj'],
    // The verbs 그러다, 이러다, 저러다 and 어쩌다: 그러 + 어 → 그래.
    ['ㄱㅡㄹㅐ', 'ㄱㅡㄹㅓ', {}],
    ['ㅇㅣㄹㅐ', 'ㅇㅣㄹㅓ', {}],
    ['ㅈㅓㄹㅐ', 'ㅈㅓㄹㅓ', {}],
    ['ㅇㅓㅉㅐ', 'ㅇㅓㅉㅓ', {}],
    // 하 + 여 → 해 or 하여.
    ['ㅎㅐ', 'ㅎㅏ', {}],
    ['ㅎㅏㅇㅕ', 'ㅎㅏ', {}],
    // 놓 + 아 → 놔; 푸 + 어 → 퍼 (the only 우 irregular).
    ['ㄴㅗㅏ', 'ㄴㅗㅎ', {}],
    ['ㅍㅓ', 'ㅍㅜ', {}],
];

function ah(ending, out, {conditionsIn = [], deinflected = '다'} = {}) {
    const e = jamo(ending);
    const d = jamo(deinflected);
    const adjOnly = adjectiveOutput(out);
    const rules = [];
    for (const [stemEnd, base, constraints, only] of A_FORMS) {
        if (only === 'adj' && adjOnly === null) { continue; }
        rules.push(suffix(stemEnd + e, base + d, conditionsIn, only === 'adj' ? adjOnly : out, constraints));
    }
    return rules;
}

// --- The transforms --------------------------------------------------------------
const transforms = [];
function transform(id, name, description, rules, extra = {}) {
    transforms.push({id, name, description, source: 'own', ...extra, rules: rules.flat()});
}

// Informal polite (해요체) and informal plain (해체).
// 말다 (don't) contracts 말아 to 마 after -지: 하지 마, 하지 마요, 하지 마라.
const MALDA = (inflected) => ({type: 'wholeWord', inflected: jamo(inflected), deinflected: jamo('말다'), conditionsIn: [], conditionsOut: ['v']});
transform('-아/어요', '-아/어요', 'Informal polite ending (해요체): statement, question, request or suggestion.', [ah('요', ALL), MALDA('마요')]);
transform('-아/어', '-아/어', 'Informal plain ending (해체): statement, question, command or suggestion.', [ah('', ALL), MALDA('마')]);
// Formal polite (하십시오체).
transform('-(스)ㅂ니다', '-(스)ㅂ니다', 'Formal polite statement (하십시오체).', [
    suffix(jamo('습니다'), jamo('다'), [], ALL, {stemMinLength: 2, stemEndsWith: CONSONANT}),
    suffix(jamo('ㅂ니다'), jamo('다'), [], ALL, {stemMinLength: 2, stemEndsWith: VOWEL}),
    suffix(jamo('ㅂ니다'), jamo('ㄹ다'), [], ALL, {stemMinLength: 1, stemEndsWith: VOWEL}),
]);
transform('-(스)ㅂ니까', '-(스)ㅂ니까', 'Formal polite question (하십시오체).', [
    suffix(jamo('습니까'), jamo('다'), [], ALL, {stemMinLength: 2, stemEndsWith: CONSONANT}),
    suffix(jamo('ㅂ니까'), jamo('다'), [], ALL, {stemMinLength: 2, stemEndsWith: VOWEL}),
    suffix(jamo('ㅂ니까'), jamo('ㄹ다'), [], ALL, {stemMinLength: 1, stemEndsWith: VOWEL}),
]);
// -(으)세요 is the honorific -(으)시- + -어요; the honorific verbs 계시다,
// 주무시다, 드시다 and 잡수시다 have -시- in their dictionary form.
transform('-(으)세요', '-(으)세요', 'Honorific polite ending (-(으)시- + -어요): statement, question or polite request.', [
    suffix(jamo('세요'), jamo('시다'), [], ['-시'], {stemMinLength: 1}),
    suffix(jamo('계세요'), jamo('계시다'), [], PRED),
    suffix(jamo('무세요'), jamo('무시다'), [], PRED, {stemMinLength: 2}),
    suffix(jamo('드세요'), jamo('드시다'), [], PRED),
    suffix(jamo('잡수세요'), jamo('잡수시다'), [], PRED),
]);
// The honorific verbs 계시다, 주무시다, 드시다 and 잡수시다 have -시- in their
// dictionary form (as in -(으)세요).
transform('-(으)십시오', '-(으)십시오', 'Formal honorific command (하십시오체).', [
    suffix(jamo('십시오'), jamo('시다'), [], ['-시'], {stemMinLength: 1}),
    suffix(jamo('계십시오'), jamo('계시다'), [], PRED),
    suffix(jamo('무십시오'), jamo('무시다'), [], PRED, {stemMinLength: 2}),
    suffix(jamo('드십시오'), jamo('드시다'), [], PRED),
    suffix(jamo('잡수십시오'), jamo('잡수시다'), [], PRED),
]);
transform('-(으)ㅂ시오', '-(으)ㅂ시오', 'Formal command without -(으)시- (하십시오체, old-fashioned).', [
    suffix(jamo('ㅂ시오'), jamo('다'), [], VERB_HON, {stemMinLength: 2, stemEndsWith: VOWEL, stemNotEndsWith: '[ㅣ]'}),
    suffix(jamo('ㅣㅂ시오'), jamo('ㅣ다'), [], VERB_HON, {stemMinLength: 1, stemNotEndsWith: '[ㅅ]'}),
    suffix(jamo('읍시오'), jamo('다'), [], VERB_HON, {stemMinLength: 2, stemEndsWith: CONSONANT_NOT_LIEUL}),
    suffix(jamo('ㅂ시오'), jamo('ㄹ다'), [], VERB_HON, {stemMinLength: 1, stemEndsWith: VOWEL}),
    // ㅂ, ㄷ and ㅅ irregular stems: 도웁시오, 들읍시오, 지읍시오.
    suffix('ㅇㅜ' + jamo('ㅂ시오'), 'ㅂ' + jamo('다'), [], VERB_HON, {stemMinLength: 1}),
    suffix('ㄹ' + jamo('읍시오'), 'ㄷ' + jamo('다'), [], VERB_HON, {stemMinLength: 1, stemEndsWith: VOWEL}),
    suffix(jamo('읍시오'), 'ㅅ' + jamo('다'), [], VERB_HON, {stemMinLength: 1, stemEndsWith: VOWEL}),
]);
transform('-(으)ㅂ시다', '-(으)ㅂ시다', 'Formal polite suggestion: let us (하십시오체).', [eu('ㅂ시다', VERB_HON)]);

// Pre-final endings, removed after the final ending.
transform('-겠', '-겠-', 'Pre-final ending -겠-: future, intention, conjecture or politeness.', [
    direct('겠다', ['v', 'adj', '-었', '-시'], {conditionsIn: ['-겠']}),
    direct('겠', ['v', 'adj', '-었', '-시'], {conditionsIn: ['f'], deinflected: '다'}),
]);
transform('-아/어야겠', '-아/어야겠-', '-아/어야 하겠-: must, will have to.', [
    ah('야겠다', HON, {conditionsIn: ['-겠']}),
]);
transform('-았/었', 'past', 'Past tense -았/었/였-.', [
    ah('ㅆ다', HON, {conditionsIn: ['-었']}),
    ah('ㅆ', HON, {conditionsIn: ['p'], deinflected: '다'}),
]);
transform('-았/었었', 'past perfect', 'Past perfect -았었/었었-: had done, used to.', [
    ah('ㅆ었다', HON, {conditionsIn: ['-었']}),
    ah('ㅆ었', HON, {conditionsIn: ['p'], deinflected: '다'}),
]);
transform('-(으)시', 'honorific', 'Honorific -(으)시-: respect for the subject.', [
    eu('시다', PRED, {conditionsIn: ['-시']}),
    eu('시', PRED, {conditionsIn: ['eusi'], deinflected: '다'}),
]);

// Plain (해라체) statements, questions, commands and suggestions.
transform('-(느)ㄴ다', '-ㄴ/는다', 'Plain present statement of a verb (해라체).', [
    suffix(jamo('ㄴ다'), jamo('다'), ['-다'], VERB_HON, {stemMinLength: 2, stemEndsWith: VOWEL}),
    suffix(jamo('ㄴ다'), jamo('ㄹ다'), ['-다'], VERB_HON, {stemMinLength: 1, stemEndsWith: VOWEL}),
    suffix(jamo('는다'), jamo('다'), ['-다'], VERB_HON, {stemMinLength: 2, stemEndsWith: CONSONANT}),
]);
transform('-느냐', '-느냐', 'Plain question (해라체).', [neun('느냐', ALL)]);
transform('-(으)냐', '-(으)냐', 'Plain question, colloquial (해체/해라체).', [direct('냐', ALL), eu('냐', HON, {vowelStem: false})]);
transform('-(으)니', '-(으)니', 'Plain question -니 (해체/해라체); connective -(으)니: because, when.', [direct('니', ALL), eu('니', ALL, {vowelStem: false})]);
transform('-아/어라', '-아/어라', 'Plain command (해라체), or an exclamation.', [ah('라', PRED), MALDA('마라')]);
// Not for ㄹ stems (살라), which would read 몰라 (모르다) as 몰다.
transform('-(으)라', '-(으)라', 'Written-style command (해라체), as in instructions and headlines.', [eu('라', VERB_HON, {lieulKeeps: false})]);
transform('-거라', '-거라/-너라', 'Plain command of 가다 and 오다 (old-fashioned).', [
    suffix(jamo('거라'), jamo('다'), [], ['v'], {stemMinLength: 2}),
    suffix(jamo('너라'), jamo('다'), [], ['v'], {stemMinLength: 2}),
]);
transform('-자', '-자', 'Plain suggestion: let us (해라체); also "as soon as".', [direct('자', VERB_HON)]);
transform('-는구나', '-는구나', 'Exclamation of a verb in the present (해라체).', [direct('는구나', VERB_HON)]);
transform('-구나', '-구나', 'Exclamation: realising something (해라체).', [direct('구나', ALL)]);
transform('-는군', '-는군(요)', 'Exclamation of a verb in the present.', [direct('는군', VERB_HON), direct('는군요', VERB_HON)]);
transform('-군', '-군(요)', 'Exclamation: realising something.', [direct('군', ALL), direct('군요', ALL)]);
transform('-네', '-네(요)', 'Exclamation or mild statement.', [
    direct('네', ALL), direct('네요', ALL),
    // 그렇다 → 그러네(요) beside 그렇네(요).
    suffix(jamo('네'), jamo('ㅎ다'), [], ['adj'], {stemMinLength: 2, stemEndsWith: '[ㅏㅓㅑㅕ]'}),
    suffix(jamo('네요'), jamo('ㅎ다'), [], ['adj'], {stemMinLength: 2, stemEndsWith: '[ㅏㅓㅑㅕ]'}),
]);
transform('-지', '-지(요)', 'Ending -지: of course, isn\u2019t it; also before 않다 and 못하다.', [direct('지', ALL), direct('지요', ALL)]);
transform('-죠', '-죠', 'Contraction of -지요.', [direct('죠', ALL)]);
transform('-나요', '-나(요)', 'Soft question.', [direct('나', ALL), direct('나요', ALL)]);
transform('-거든', '-거든(요)', 'Ending -거든(요): giving a reason; or connective "if".', [direct('거든', ALL), direct('거든요', ALL)]);
transform('-잖아', '-잖아(요)', 'Ending -잖아(요): you know, as you know.', [direct('잖아', ALL), direct('잖아요', ALL)]);
transform('-더라', '-더라', 'Retrospective: I saw that... (해라체).', [direct('더라', ALL), direct('더라고', ALL), direct('더라고요', ALL), direct('더군요', ALL)]);
transform('-던데', '-던데(요)', 'Retrospective background: I noticed that...', [direct('던데', ALL), direct('던데요', ALL)]);
transform('-(으)ㄹ까', '-(으)ㄹ까(요)', 'Question: shall I, I wonder.', [eu('ㄹ까', PAST), eu('ㄹ까요', PAST)]);
transform('-(으)ㄹ게', '-(으)ㄹ게(요)', 'Promise: I will.', [eu('ㄹ게', HON), eu('ㄹ게요', HON)]);
transform('-(으)ㄹ래', '-(으)ㄹ래(요)', 'Intention or offer: I want to, do you want to.', [eu('ㄹ래', HON), eu('ㄹ래요', HON)]);
transform('-(으)ㄹ걸', '-(으)ㄹ걸(요)', 'Guess or regret: probably; I should have.', [eu('ㄹ걸', PAST), eu('ㄹ걸요', PAST)]);
transform('-(으/느)ㄴ걸', '-는걸(요)', 'Mild assertion or surprise about a fact.', [neun('는걸', ALL), neun('는걸요', ALL), eu('ㄴ걸', HON), eu('ㄴ걸요', HON)]);
transform('-(으/느)ㄴ데', '-는데/-(으)ㄴ데(요)', 'Background or contrast: and, but; softened statement (-는데 after verbs, 있다 and 없다; -(으)ㄴ데 after adjectives and 이다).', [neun('는데', ALL), neun('는데요', ALL), eu('ㄴ데', HON), eu('ㄴ데요', HON)]);
transform('-고요', '-고요', 'Polite ending -고요: and also.', [direct('고요', ALL)]);
transform('-니까요', '-(으)니까요', 'Polite ending -(으)니까요: because.', [eu('니까요', ALL)]);
transform('-어서요', '-아/어서요', 'Polite ending -아/어서요: because.', [ah('서요', HON)]);

// Connective endings.
transform('-고', '-고', 'Connective -고: and; also before 있다, 싶다.', [direct('고', ALL)]);
transform('-지만', '-지만', 'Connective -지만: but.', [direct('지만', ALL)]);
transform('-아/어서', '-아/어서', 'Connective -아/어서: and then, because.', [ah('서', HON)]);
transform('-아/어도', '-아/어도', 'Connective -아/어도: even if.', [ah('도', PAST)]);
transform('-아/어야', '-아/어야', 'Connective -아/어야: only if; before 하다 and 되다: must.', [ah('야', PAST), ah('야지', PAST), ah('야지요', PAST), ah('야죠', PAST)]);
// Two of Yomitan's endings the first own rules lacked, written here with the
// own stem alternations (added after the own-rules commit).
transform('-아/어야만', '-아/어야만', 'Connective -아/어야만: only if.', [ah('야만', PAST)]);
transform('-아/어다가', '-아/어다가', 'Connective -아/어다가: do and then (take it somewhere): 가져다가.', [ah('다가', PAST)]);
transform('-(으)면', '-(으)면', 'Connective -(으)면: if, when.', [eu('면', PAST)]);
transform('-(으)니까', '-(으)니까', 'Connective -(으)니까: because, when.', [eu('니까', ALL)]);
transform('-(으)면서', '-(으)면서', 'Connective -(으)면서: while.', [eu('면서', HON)]);
transform('-(으)며', '-(으)며', 'Connective -(으)며: and, while (written style).', [eu('며', PAST)]);
transform('-(으)러', '-(으)러', 'Connective -(으)러: in order to (with a verb of motion).', [eu('러', VERB_HON)]);
transform('-(으)려고', '-(으)려고', 'Connective -(으)려고: intending to.', [eu('려고', VERB_HON), eu('려면', VERB_HON)]);
transform('-(으/느)ㄴ지', '-는지/-(으)ㄴ지', 'Connective -는지, -(으)ㄴ지: whether, what; -(으)ㄴ지 after a verb: since (time).', [neun('는지', ALL), eu('ㄴ지', HON)]);
transform('-(으)ㄹ지', '-(으)ㄹ지', 'Connective -(으)ㄹ지: whether ... will.', [eu('ㄹ지', PAST)]);
transform('-게', '-게', 'Ending -게: adverb (so that, -ly); before 되다 and 하다.', [direct('게', HON)]);
transform('-도록', '-도록', 'Connective -도록: so that, until.', [direct('도록', HON)]);
transform('-거나', '-거나', 'Connective -거나: or.', [direct('거나', PAST)]);
transform('-든지', '-든지', 'Connective -든지: whether ... or, any.', [direct('든지', PAST), direct('든가', PAST), direct('든', PAST)]);
transform('-다가', '-다가', 'Connective -다가: while doing, and then.', [direct('다가', PAST)]);
transform('-더니', '-더니', 'Connective -더니: and then (observed).', [direct('더니', PAST)]);
transform('-자마자', '-자마자', 'Connective -자마자: as soon as.', [direct('자마자', VERB_HON)]);
transform('-느라고', '-느라(고)', 'Connective -느라(고): because of doing.', [direct('느라고', VERB_HON), direct('느라', VERB_HON)]);
transform('-고서', '-고서', 'Connective -고서: after doing.', [direct('고서', VERB_HON)]);
transform('-(으)므로', '-(으)므로', 'Connective -(으)므로: because (written style).', [eu('므로', PAST)]);
transform('-기에', '-기에', 'Connective -기에, -길래: because.', [direct('기에', PAST), direct('길래', PAST)]);
transform('-(으)ㄹ수록', '-(으)ㄹ수록', 'Connective -(으)ㄹ수록: the more ... the more.', [eu('ㄹ수록', HON)]);

// Adnominal (관형사형) and nominal (명사형) endings.
transform('-는', '-는', 'Adnominal -는: present (verbs, 있다, 없다).', [neun('는', HON)]);
transform('-(으)ㄴ', '-(으)ㄴ', 'Adnominal -(으)ㄴ: past of a verb, present of an adjective.', [eu('ㄴ', HON)]);
transform('-(으)ㄹ', '-(으)ㄹ', 'Adnominal -(으)ㄹ: future or prospective.', [eu('ㄹ', PAST)]);
transform('-던', '-던', 'Adnominal -던: retrospective, used to.', [direct('던', PAST)]);
transform('-기', '-기', 'Nominal -기: the act of.', [direct('기', PAST)]);
transform('-(으)ㅁ', '-(으)ㅁ', 'Nominal -(으)ㅁ: the fact of.', [eu('ㅁ', PAST)]);

// Quoted speech (indirect quotation) and its contractions.
transform('-((느)ㄴ)다고', '-다고', 'Quoted statement: that ... (-다고, -다는, -대, -다면).', [
    direct('다고', QUOTE), direct('다고요', QUOTE), direct('다는', QUOTE), direct('다면', QUOTE), direct('대', QUOTE), direct('대요', QUOTE),
    direct('단다', QUOTE), direct('다며', QUOTE), direct('다면서', QUOTE), direct('다면서요', QUOTE), direct('다니', QUOTE),
]);
transform('-(으)냐고', '-(느)냐고', 'Quoted question: asked whether ...', [
    direct('냐고', ALL), direct('냐고요', ALL), neun('느냐고', ALL), direct('냬', ALL), direct('냬요', ALL), eu('냐고', HON, {vowelStem: false}),
]);
transform('-(으)라고', '-(으)라고', 'Quoted command: told to ... (-(으)라고, -(으)래).', [
    eu('라고', HON), eu('라고요', HON), eu('래', HON), eu('래요', HON), eu('라는', HON),
]);
transform('-자고', '-자고', 'Quoted suggestion: suggested that we ... (-자고, -재).', [
    direct('자고', VERB_HON), direct('자고요', VERB_HON), direct('재', VERB_HON), direct('재요', VERB_HON),
]);

// Auxiliary constructions written together with the verb.
// Adjective stems only (예뻐지다, 좋아지다: become): verbs with -아/어지다
// (만들어지다, 떨어지다, 사라지다) are dictionary headwords of their own, and
// reading them as passives mostly gives unrelated verbs (사라지다 → 사르다).
transform('-아/어지다', '-아/어지다', 'Become (-아/어지다 after an adjective).', [ah('지다', ['adj'], {conditionsIn: PRED})]);
transform('-어하다', '-아/어하다', 'Show a feeling (-아/어하다): 좋다 → 좋아하다.', [ah('하다', ['adj'], {conditionsIn: PRED})]);

// The copula 이다 and 아니다: 아니다 is an adjective, 이다 a particle.
const COPULA = ['adj', 'particle', 'ida'];
transform('-이에요', '-이에요/예요', 'Polite form of 이다 and 아니다 (해요체).', [
    suffix(jamo('에요'), jamo('다'), [], COPULA, {stemMinLength: 2, stemEndsWith: '[ㅣ]'}),
    suffix(jamo('예요'), jamo('이다'), [], COPULA),
]);
transform('-야', '-(이)야', 'Plain form of 이다 and 아니다 (해체).', [
    suffix(jamo('야'), jamo('다'), [], COPULA, {stemMinLength: 2, stemEndsWith: '[ㅣ]'}),
    suffix(jamo('야'), jamo('이다'), [], COPULA),
]);
transform('-라서', '-(이)라서', 'Connective of 이다 and 아니다: because it is.', [
    suffix(jamo('라서'), jamo('다'), [], COPULA, {stemMinLength: 2, stemEndsWith: '[ㅣ]'}),
]);
transform('-이라', '-(이)라', 'Connective of 이다 and 아니다: is (not) ... but; -(이)라면: if it is.', [
    suffix(jamo('라'), jamo('다'), [], COPULA, {stemMinLength: 2, stemEndsWith: '[ㅣ]'}),
    suffix(jamo('라면'), jamo('다'), [], COPULA, {stemMinLength: 2, stemEndsWith: '[ㅣ]'}),
    suffix(jamo('란'), jamo('다'), [], COPULA, {stemMinLength: 2, stemEndsWith: '[ㅣ]'}),
]);

// Pronouns contracted with a particle, which character resolution cannot
// reach by shortening: 난 is 나 + 는, 이건 is 이것 + 은.
const NOUN = ['n', 'pron'];
const whole = (pairs) => pairs.map(([inflected, lemma]) => ({type: 'wholeWord', inflected: jamo(inflected), deinflected: jamo(lemma), conditionsIn: [], conditionsOut: NOUN}));
transform('topic', 'topic -ㄴ', 'Topic particle 는 contracted with a pronoun: 난 = 나는.', [whole([
    ['난', '나'], ['넌', '너'], ['전', '저'], ['우린', '우리'], ['저흰', '저희'], ['너흰', '너희'], ['이건', '이것'], ['그건', '그것'], ['저건', '저것'],
    ['여긴', '여기'], ['거긴', '거기'], ['저긴', '저기'], ['얜', '얘'], ['걘', '걔'], ['쟨', '쟤'], ['건', '것'],
])]);
transform('object', 'object -ㄹ', 'Object particle 를 contracted with a pronoun: 날 = 나를.', [whole([
    ['날', '나'], ['널', '너'], ['절', '저'], ['우릴', '우리'], ['이걸', '이것'], ['그걸', '그것'], ['저걸', '저것'], ['뭘', '무엇'], ['뭘', '뭐'],
    ['여길', '여기'], ['거길', '거기'], ['저길', '저기'], ['얠', '얘'], ['걜', '걔'], ['쟬', '쟤'], ['걸', '것'],
])]);
transform('subject', 'subject 가', 'Subject particle 가 with a pronoun: 내가 = 나 + 가, 이게 = 이것이.', [whole([
    ['내가', '나'], ['네가', '너'], ['니가', '너'], ['제가', '저'], ['누가', '누구'], ['이게', '이것'], ['그게', '그것'], ['저게', '저것'], ['뭐가', '무엇'],
    ['게', '것'],
])]);
transform('possessive', 'possessive', 'Possessive of a pronoun: 내 = 나의, 제 = 저의.', [whole([
    ['내', '나'], ['네', '너'], ['제', '저'],
])]);
// The commonest personal pronouns with a particle written onto them (the
// most frequent such words in Tatoeba's Korean sentences). Shortening the scan
// reaches the pronoun too, but only for its own length, after the readings
// that cover the whole word (그는 -> 글다); these give the pronoun the whole
// word. Other nouns keep no particle rules (section 14.1).
const PRONOUNS = ['나', '너', '저', '우리', '저희', '너희', '그', '그녀', '당신', '이것', '그것', '저것', '무엇', '누구'];
const PARTICLES = [['는', '은'], ['가', '이'], ['를', '을'], ['의', '의'], ['도', '도'], ['에게', '에게'], ['한테', '한테'], ['랑', '이랑'], ['와', '과'], ['만', '만']];
function hasFinal(word) {
    return (word.codePointAt(word.length - 1) - 0xAC00) % 28 !== 0;
}
const CONTRACTED = new Set(['나가', '너가', '저가', '무엇가', '누구가']);
transform('particle', 'particle', 'A personal pronoun with a particle written onto it: 나는 = 나 + 는, 그의 = 그 + 의.', [whole(
    PRONOUNS.flatMap((pronoun) => PARTICLES.map(([afterVowel, afterConsonant]) => [pronoun + (hasFinal(pronoun) ? afterConsonant : afterVowel), pronoun]))
        .filter(([word]) => !CONTRACTED.has(word)),
)]);

const out = {schema: 1, conditions: CONDITIONS, transforms};
const file = join(dirname(fileURLToPath(import.meta.url)), 'own.json');
writeFileSync(file, formatTransforms(out));
const rules = transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`${file}: ${transforms.length} transforms, ${rules} rules`);
