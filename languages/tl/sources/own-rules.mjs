#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/tl/sources/own.json: Tagalog deinflection rules written for
// this pack from Tagalog grammar (docs/languages.md, section 14 step 2),
// before Yomitan's Tagalog rules were read. Run from anywhere:
//
//   node languages/tl/sources/own-rules.mjs
//
// The rules follow the standard description of Tagalog verbal and adjectival
// morphology (Schachter and Otanes, Tagalog Reference Grammar, 1972; the
// Komisyon sa Wikang Filipino's Ortograpiyang Pambansa, 2014, for hyphens;
// Wiktionary's Tagalog conjugation tables). No text or table is copied.
//
// What a lookup needs to reach:
//
// - Aspect. A verb has an infinitive (also the imperative) and three aspects.
//   Realis marking (n- for the m- prefixes, -in- for the others, nothing for
//   -um-) makes the completive; CV- reduplication of the root's first
//   syllable makes the contemplative; both make the progressive:
//     mag-: magluto, nagluto, nagluluto, magluluto
//     -um-: kumain, kumain, kumakain, kakain
//     -in:  kainin, kinain, kinakain, kakainin
//     -an:  sulatan, sinulatan, sinusulatan, susulatan
//     i-:   isulat, isinulat, isinusulat, isusulat
//   The aspect rules give the infinitive, which is how Wiktionary and
//   wiktionary-to-yomitan list verbs (kumain "to eat", magluto "to cook").
// - The root. Affix rules take an infinitive (or an adjective, or a noun
//   made with a productive affix) to its root (kumain -> kain, maganda ->
//   ganda), so a form reaches its infinitive in one step and its root in two.
//   A completive or progressive of an -in verb drops its suffix (kinain from
//   kainin), so the rules take it to its root (kain), and also to the -in
//   infinitive (kinain -> kainin; kinakain -> kinain -> kainin): circumfix
//   rules whose suffix is the root's last letter, so a lookup tries them
//   only on texts that end in it.
// - The linker. -ng after a vowel and -g after n join a word to the word it
//   modifies (magandang umaga, kaibigang tapat, kong, mong); it is on a large
//   share of all words in running text.
// - Adjectives: plural ma-CV- (magaganda), superlative pinaka-, intensive
//   napaka-, equative kasing-/kasin-/kasim-.
// - Contractions written with an apostrophe ('y for ay, 't for at, 'ng for
//   ang) and the hyphen of prefixes before a vowel (mag-aral), which older
//   and informal text leaves out (magaaral, nagiisa).
//
// Conditions. A rule's output says what it is, so that only the rules that
// can follow it apply: an aspect rule gives an infinitive of one kind
// (v_m, v_um, v_i, v_sfx), which only the affix rules of that kind take to
// the root; a root (n, adj_root, v_root) and most nouns are not deinflected
// further. The linker, the contractions and the hyphen give the same word
// back with empty conditions, so every rule may follow them, as it may
// follow the text as written. wiktionary-to-yomitan's Tagalog dictionary
// leaves the `rules` column empty on every row; with the pack's
// `lookup.untaggedTerms: "pass"` such a term matches any form whose
// conditions name a dictionary form (v, n, adj and their subconditions).

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

//
// The first version of this file had a leaf `n` and an `adj` with the
// subconditions adj_ma and adj_root. Once Yomitan's rules were read (step
// 3), `n`, `adj` and `num` were given Yomitan's definitions, which
// tools/merge-transforms.mjs requires to be equal (Yomitan's `n` has the
// subcondition `num`, so the two are one bit), and the -in infinitive of a
// completive (`v_in`) was added.
const conditions = {
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['num']},
    adj: {name: 'Adjective', isDictionaryForm: true},
    num: {name: 'Numeral', isDictionaryForm: true},
    v: {name: 'Verb', isDictionaryForm: true, subConditions: ['v_m', 'v_um', 'v_i', 'v_sfx', 'v_in', 'v_root']},
    v_m: {name: 'Verb with an m- prefix (mag-, ma-, mang-, maka-, maki-, magpa-, ...)', isDictionaryForm: false},
    v_um: {name: 'Verb with -um-', isDictionaryForm: false},
    v_i: {name: 'Verb with i- (i-, ipag-, ipa-, ika-)', isDictionaryForm: false},
    v_sfx: {name: 'Verb with -in or -an', isDictionaryForm: false},
    v_in: {name: '-in infinitive rebuilt from a completive', isDictionaryForm: false},
    v_compl: {name: 'Completive form of a progressive -in verb', isDictionaryForm: false},
    v_root: {name: 'Verb root', isDictionaryForm: false},
    adj_ma: {name: 'Word with ma- (adjective or verb)', isDictionaryForm: false},
};
// What each kind of rule gives and takes.
const ROOT = ['n', 'adj', 'v_root'];
// A realis or reduplicated form with nothing before the root gives the -an
// infinitive (sinulatan -> sulatan), the -in infinitive (kakainin ->
// kainin) or the root of an -in verb (kinain -> kain).
const SFX_OR_ROOT = ['v_sfx', ...ROOT];

// --- Letters ---------------------------------------------------------------
const VOWELS = ['a', 'e', 'i', 'o', 'u'];
// Consonants a root can start with: the native ones, ng, and the letters of
// loanwords in the Filipino alphabet.
const CONSONANTS = ['b', 'k', 'd', 'g', 'h', 'l', 'm', 'n', 'ng', 'p', 'r', 's', 't', 'w', 'y', 'c', 'f', 'j', 'v', 'z'];
// The same as a regular-expression alternative (ng before n).
const C_GROUP = '(ng|[bkdghlmnprstwycfjvz])';
const VOWEL = '[aeiou]';
const CONSONANT = '[bcdfghjklmnpqrstvwxyzñ]';
// After a root's first consonant comes its first vowel, or the second
// consonant of a cluster in a loanword (plano, trabaho, kwento, syempre).
const AFTER_FIRST = '[aeioulrwy]';

// Rule builders. `io` is [conditionsIn, conditionsOut].
const ANY = [[], []];
const prefix = (inflected, deinflected, extra, [conditionsIn, conditionsOut]) => ({
    type: 'prefix', inflected, deinflected, conditionsIn, conditionsOut, ...extra,
});
const suffix = (inflected, deinflected, extra, [conditionsIn, conditionsOut]) => ({
    type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, ...extra,
});
const whole = (inflected, deinflected, [conditionsIn, conditionsOut]) => ({
    type: 'wholeWord', inflected, deinflected, conditionsIn, conditionsOut,
});
// A pattern anchored on a literal prefix. `(?=..)` keeps at least two
// characters of the root after the matched part.
const pattern = (anchorPrefix, source, replacement, [conditionsIn, conditionsOut]) => ({
    type: 'pattern', pattern: source, replacement, anchorPrefix, conditionsIn, conditionsOut,
});
// The same anchored on a literal suffix.
const pattern2 = (anchorSuffix, source, replacement, [conditionsIn, conditionsOut]) => ({
    type: 'pattern', pattern: source, replacement, anchorSuffix, conditionsIn, conditionsOut,
});
const circumfix = (prefixes, suffixes, extra, [conditionsIn, conditionsOut]) => ({
    type: 'circumfix', prefixes, suffixes, conditionsIn, conditionsOut, stemMinLength: 3, ...extra,
});

// --- Prefix contexts ---------------------------------------------------------
// The m- prefixes whose realis form starts with n- (mag-/nag-, ma-/na-,
// maka-/naka-, ...). `final` is true for the ones that end in a consonant,
// which take a hyphen before a vowel (mag-aral, makipag-usap). mang- verbs
// are read through ma-: mang- merges with the root's first consonant
// (mamili, manood, mangisda), so their reduplication follows ma- (namimili,
// nanonood, nangingisda).
const M_PREFIXES = [
    {m: 'mag', final: true},
    {m: 'ma', final: false},
    {m: 'maka', final: false},
    {m: 'makapag', final: true},
    {m: 'maki', final: false},
    {m: 'makipag', final: true},
    {m: 'magpa', final: false},
    {m: 'mapa', final: false},
    {m: 'magka', final: false},
    {m: 'mai', final: false},
    {m: 'maipa', final: false},
    {m: 'maipag', final: true},
    {m: 'magpaka', final: false},
    {m: 'mapag', final: true},
    // mang- that keeps the root's first consonant (manggalit, mandaya,
    // manloko, mambola, mangyari) reduplicates after the whole prefix
    // (manggagalit, nandadaya, nanloloko); one that merges with it is read
    // through ma- above.
    {m: 'mang', final: true},
    {m: 'man', final: false},
    {m: 'mam', final: false},
];
const realisOf = (m) => `n${m.slice(1)}`;

// Colloquial reduplication of the prefix's own last syllable instead of the
// root's: makakain (maka- + ka-), nakikipag-usap, nagpapaluto.
const PREFIX_REDUPLICATION = [
    ['makaka', 'maka'], ['makiki', 'maki'], ['magpapa', 'magpa'], ['mapapa', 'mapa'], ['magkaka', 'magka'],
    ['makakapag', 'makapag'], ['makikipag', 'makipag'], ['magpapaka', 'magpaka'],
    ['maiipa', 'maipa'],
];

// Root reduplication after a fixed prefix P that stays (contemplative) or
// after a realis prefix R that becomes P (progressive): R + CV + C(L)V... ->
// P + C(L)V... (nagbabasa -> magbasa, nagtatrabaho -> magtrabaho), the
// vowel roots (nag-aaral, naaalala), and d -> r between vowels
// (nagdarasal). The copied syllable is the root's first consonant and its
// first vowel, so the root must start with that consonant and, after a
// second consonant of a cluster, that vowel.
function reduplicationRules(from, to, final, io) {
    const rules = [
        pattern(from, `^${from}${C_GROUP}(${VOWEL})\\1([lrwy]?)\\2(?=.)`, `${to}$1$3$2`, io),
        // A cluster reduplicated whole in speech (magplaplantsa -> magplantsa).
        pattern(from, `^${from}${C_GROUP}([lrwy])(${VOWEL})\\1\\2\\3(?=.)`, `${to}$1$2$3`, io),
        // A loanword after a hyphen (nagte-text -> mag-text, mapo-promote -> ma-promote).
        pattern(from, `^${from}${C_GROUP}(${VOWEL})-\\1(?=..)`, `${to}-$1`, io),
    ];
    for (const v of VOWELS) {
        if (final) {
            rules.push(prefix(`${from}-${v}${v}`, `${to}-${v}`, {stemMinLength: 2}, io));
            rules.push(prefix(`${from}${v}${v}`, `${to}-${v}`, {stemMinLength: 2}, io));
        } else {
            rules.push(prefix(`${from}${v}${v}`, `${to}${v}`, {stemMinLength: 2}, io));
        }
        rules.push(prefix(`${from}d${v}r`, `${to}d`, {stemStartsWith: `[${v}]`, stemMinLength: 2}, io));
    }
    return rules;
}
// The root after a copied syllable C + V starts with V. Clusters of
// loanwords (tatrabaho, pinaplano) are read by the patterns.
const sameVowel = (v) => ({stemStartsWithText: v, stemMinLength: 2});

// The same for a root with nothing before it, as literal rules (a pattern
// needs a literal anchor): before + C + V + C... -> to(C) (kakainin ->
// kainin with to(C) = C; kakain -> kumain with to(C) = C + um).
function rootReduplicationRules(before, to, toVowel, io) {
    const rules = [];
    for (const c of CONSONANTS) {
        for (const v of VOWELS) {
            rules.push(prefix(`${before}${c}${v}${c}`, to(c), sameVowel(v), io));
        }
    }
    for (const v of VOWELS) {
        rules.push(prefix(`${before}${v}${v}`, toVowel(v), {stemMinLength: 2}, io));
        rules.push(prefix(`${before}d${v}r`, to('d'), {stemStartsWith: `[${v}]`, stemMinLength: 2}, io));
    }
    return rules;
}

// u for the o of the last syllable before a final consonant (inumin ->
// inom, sagutan -> sagot).
const U_TO_O = {from: ['u'], to: 'o', occurrence: 'last', between: '[bcdfghjklmnpqrstvwxyz]', betweenMinLength: 1};
// A capitalised word is a name or the start of a sentence; its decapitalised
// variant is deinflected too, so these rules leave it out: Talagang is not
// Talag + -an (a name), but talaga.
// The stem is one word, too (section 14: count the space): tungkol saan is
// not tungkol sa + -an.
const LOWER = {stemNotStartsWith: '[A-Z\\u00C0-\\u00D6\\u00D8-\\u00DE]', stemCharacters: '[^ ]'};
// Prefix rules whose reading of a phrase is mostly another phrase: magaling
// sa is not ma- + galing sa (from), ipaalam mo not ipa- + alam mo.
const ONE = {stemCharacters: '[^ ]'};

const transforms = [];
const add = (id, name, description, rules) => transforms.push({id, name, description, source: 'own', rules});

// --- Linker and contractions -------------------------------------------------
// The same word back, of any part of speech: empty conditions.
// A stem of two letters is a short word only when the list says so: kong,
// mong and pong are ko, mo and po with the linker, but lang, nang and sang
// are words of their own (lamang, nang, isang), not la, na and sa.
const SHORT_LINKED = [['kong', 'ko'], ['mong', 'mo'], ['pong', 'po'], ['kang', 'ka'], ['bang', 'ba'], ['pang', 'pa'],
    ['tong', 'to'], ['ring', 'rin'], ['ding', 'din'], ['yung', 'yun'], ['nung', 'nun'], ['yang', 'yan'], ['yong', 'yon']];
// Words that end in n and take -g, where the word without its n is also a
// headword that -ng would reach first: noong is noon (then), not noo
// (forehead); naming is namin, not nami.
const N_LINKED = ['noon', 'namin', 'saan', 'kanan', 'pangunahin', 'hapon', 'bayan', 'aralin', 'laban', 'usapan', 'kainan', 'tuwiran'];
// In a phrase, the last word's stem needs three letters too, or must be one
// of the short words: alam mong -> alam mo and may ilang -> may ilan, but
// ka nang is not ka nan, whose dictionary row names the affix ka- -an.
const SHORT_VOWEL = SHORT_LINKED.filter(([, word]) => !word.endsWith('n')).map(([, word]) => word);
const SHORT_N = SHORT_LINKED.filter(([, word]) => word.endsWith('n')).map(([, word]) => word.slice(0, -1));
add('linker', '-ng', 'Linker: -ng after a vowel, -g after n, joins a word to the word it modifies (magandang umaga, kaibigang tapat, gusto kong).', [
    suffix('ng', '', {stemEndsWith: VOWEL, stemCharacters: '[^ ]', stemMinLength: 3}, ANY),
    suffix('ng', 'n', {stemEndsWith: VOWEL, stemCharacters: '[^ ]', stemMinLength: 3}, ANY),
    ...SHORT_LINKED.map(([form, word]) => whole(form, word, ANY)),
    ...N_LINKED.map((word) => whole(`${word}g`, word, ANY)),
    pattern2('ng', `^(.* [^ ]*[^ ][^ ]${VOWEL})ng$`, '$1', ANY),
    pattern2('ng', `^(.* [^ ]*[^ ][^ ]${VOWEL})ng$`, '$1n', ANY),
    pattern2('ng', `^(.* (?:${SHORT_VOWEL.join('|')}))ng$`, '$1', ANY),
    pattern2('ng', `^(.* (?:${SHORT_N.join('|')}))ng$`, '$1n', ANY),
]);
add('contractionAy', "'y", "ay written as 'y after a vowel (ako'y, siya'y).", [
    suffix("'y", '', {stemEndsWith: VOWEL, stemMinLength: 2}, ANY),
]);
add('contractionAt', "'t", "at (and) written as 't after a vowel (isa't isa, iba't iba).", [
    suffix("'t", '', {stemEndsWith: VOWEL, stemMinLength: 2}, ANY),
]);
add('contractionAng', "'ng", "ang written as 'ng after a vowel (ano'ng, sino'ng).", [
    suffix("'ng", '', {stemEndsWith: VOWEL, stemMinLength: 2}, ANY),
]);
add('apostropheSpelling', "'t spelling", "Older spellings of conjunctions with an apostrophe before the final t (subali't, bagama't, datapuwa't, pagka't).", [
    suffix("'t", 't', {stemEndsWith: VOWEL, stemMinLength: 3}, ANY),
]);

// --- Spelling: the hyphen after a prefix -----------------------------------
// Ortograpiyang Pambansa writes a hyphen between a prefix that ends in a
// consonant and a root that starts with a vowel (mag-aral, pag-ibig,
// nag-iisa). Older and informal text leaves it out.
// Not tag-: tagalog is not tag-alog.
const HYPHEN_PREFIXES = ['mag', 'nag', 'pag', 'ipag', 'ipinag', 'pinag', 'makapag', 'nakapag', 'makipag', 'nakipag',
    'nakikipag', 'makikipag', 'pakikipag', 'mang', 'nang', 'pang', 'maipag', 'naipag'];
add('prefixHyphen', 'hyphen', 'The hyphen between a prefix ending in a consonant and a root starting with a vowel, left out (magaral → mag-aral, pagibig → pag-ibig).',
    HYPHEN_PREFIXES.flatMap((p) => VOWELS.map((v) => prefix(`${p}${v}`, `${p}-${v}`, {stemMinLength: 2}, ANY))));

// Before the aspect rules: nakakahiya is the root hiya (embarrassing) before
// the progressive of makahiya, which a lookup would otherwise show first.
add('nakaka', 'nakaka-', 'Causing a feeling or state, in speech (nakakatawa → tawa, nakakapagod → pagod, nakakahiya → hiya).', [
    prefix('nakakar', 'd', {stemStartsWith: VOWEL, stemMinLength: 2}, [[], ROOT]),
    prefix('nakaka', '', {stemMinLength: 3}, [[], ROOT]),
]);

// --- Aspect -> infinitive ----------------------------------------------------
const M = [[], ['v_m']];
const UM = [[], ['v_um']];
const I = [[], ['v_i']];
const SFX = [[], SFX_OR_ROOT];

// Completive: n- for the m- prefixes, -in- after the first consonant of the
// root (in- before a vowel, ni- before l, y, w, h, r), i- + -in-.
add('completive', 'completive', 'Completive aspect: n- instead of m- (nagluto → magluto, natulog → matulog), the infix -in- (kinain → kain, sinulatan → sulatan, ininom → inom, niluto → luto), and i- with -in- (isinulat → isulat, iniluto → iluto).', [
    prefix('na', 'ma', {stemMinLength: 3}, M),
    ...CONSONANTS.map((c) => prefix(`${c}in`, c, {stemStartsWith: AFTER_FIRST, stemMinLength: 3}, SFX)),
    prefix('in', '', {stemStartsWith: VOWEL, stemMinLength: 3}, SFX),
    ...['l', 'y', 'w', 'h', 'r'].map((c) => prefix(`ni${c}`, c, {stemStartsWith: AFTER_FIRST, stemMinLength: 2}, SFX)),
    ...CONSONANTS.map((c) => prefix(`i${c}in`, `i${c}`, {stemStartsWith: AFTER_FIRST, stemMinLength: 2}, I)),
    prefix('ini', 'i', {stemMinLength: 3}, I),
    // Causative pa- (pakainin, pakitaan) whose suffix the completive drops:
    // pinakain -> kain, pinakita -> kita.
    prefix('pina', '', {stemMinLength: 3}, [[], ROOT]),
]);

// Progressive: realis and reduplication together.
const progressive = [];
for (const {m, final} of M_PREFIXES) {
    progressive.push(...reduplicationRules(realisOf(m), m, final, M));
}
// The prefixes whose copied syllable also reads straight to the root
// (nakakatulong -> tulong, which wins over maka- + katulong); not magsi-,
// whose copy collides with roots in si- (nagsisipilyo is magsipilyo).
const TO_ROOT = new Set(['makaka', 'makiki', 'magpapa', 'magkaka', 'makakapag', 'makikipag']);
for (const [m, to] of PREFIX_REDUPLICATION) {
    progressive.push(prefix(realisOf(m), to, {stemMinLength: 2}, M));
    if (TO_ROOT.has(m)) { progressive.push(prefix(realisOf(m), '', {stemMinLength: 3}, [[], ROOT])); }
}
// -um-: C + um + V + C... -> C + um (kumakain -> kumain).
for (const c of CONSONANTS) {
    for (const v of VOWELS) {
        progressive.push(prefix(`${c}um${v}${c}`, `${c}um`, sameVowel(v), UM));
    }
}
for (const v of VOWELS) {
    progressive.push(prefix(`um${v}${v}`, `um${v}`, {stemMinLength: 2}, UM));
    progressive.push(prefix(`dum${v}r`, 'dum', {stemStartsWith: `[${v}]`, stemMinLength: 2}, UM));
}
// -in- and reduplication: C + in + V + C... -> C (kinakain -> kain,
// sinusulatan -> sulatan), in + V + V (iniinom), ni + L + V + L (niluluto),
// and pa- with -in- (pinakakain, pinapakain -> pakain).
for (const c of CONSONANTS) {
    for (const v of VOWELS) {
        progressive.push(prefix(`${c}in${v}${c}`, c, sameVowel(v), SFX));
    }
}
for (const v of VOWELS) {
    progressive.push(prefix(`in${v}${v}`, v, {stemMinLength: 2}, SFX));
    progressive.push(prefix(`din${v}r`, 'd', {stemStartsWith: `[${v}]`, stemMinLength: 2}, SFX));
    for (const l of ['l', 'y', 'w', 'h', 'r']) {
        progressive.push(prefix(`ni${l}${v}${l}`, l, {stemStartsWith: `[${v}]`, stemMinLength: 2}, SFX));
    }
}
// A loanword's cluster after -in- (pinaplano -> plano, tinatrabaho -> trabaho).
for (const c of ['b', 'k', 'd', 'g', 'p', 's', 't']) {
    progressive.push(pattern(`${c}in`, `^${c}in(${VOWEL})${c}([lrwy])\\1(?=.)`, `${c}$2$1`, SFX));
}
progressive.push(pattern('pina', `^pina${C_GROUP}(${VOWEL})\\1([lrwy]?)\\2(?=.)`, 'pa$1$3$2', SFX));
// The completive form, which only inVerb takes, so the -in infinitive is
// reached too (kinakain -> kinain -> kainin, iniinom -> ininom -> inumin).
const COMPL = [[], ['v_compl']];
for (const c of CONSONANTS) {
    progressive.push(pattern(`${c}in`, `^${c}in(${VOWEL})${c}\\1`, `${c}in$1`, COMPL));
}
for (const v of VOWELS) {
    progressive.push(prefix(`in${v}${v}`, `in${v}`, {stemMinLength: 2}, COMPL));
}
for (const l of ['l', 'y', 'w', 'h', 'r']) {
    progressive.push(pattern(`ni${l}`, `^ni${l}(${VOWEL})${l}\\1`, `ni${l}$1`, COMPL));
}
progressive.push(pattern('pina', `^pina${C_GROUP}(${VOWEL})\\1\\2`, 'pina$1$2', COMPL));
progressive.push(prefix('pinapa', 'pina', {stemMinLength: 2}, COMPL));
progressive.push(prefix('pinapa', 'pa', {stemMinLength: 2}, SFX));
progressive.push(pattern('pina', `^pina${C_GROUP}(${VOWEL})\\1([lrwy]?)\\2(?=.)`, '$1$3$2', [[], ROOT]));
progressive.push(prefix('pinapa', '', {stemMinLength: 3}, [[], ROOT]));
// i-, ipag-, ipa-, ika- and pag- -an with -in- and reduplication. The i-
// rules are literal, so that they are tried before the completive's
// shorter i- + -in- (isinusulat is isulat, not the completive of isusulat).
for (const c of CONSONANTS) {
    for (const v of VOWELS) {
        progressive.push(prefix(`i${c}in${v}${c}`, `i${c}`, sameVowel(v), I));
    }
}
for (const v of VOWELS) {
    progressive.push(prefix(`ini${v}${v}`, `i${v}`, {stemMinLength: 2}, I));
    for (const l of ['l', 'y', 'w', 'h', 'r']) {
        progressive.push(prefix(`ini${l}${v}${l}`, `i${l}`, {stemStartsWith: `[${v}]`, stemMinLength: 2}, I));
    }
}
progressive.push(...reduplicationRules('ipinag', 'ipag', true, I));
progressive.push(...reduplicationRules('ipina', 'ipa', false, I));
progressive.push(prefix('ipinapa', 'ipa', {stemMinLength: 2}, I));
progressive.push(...reduplicationRules('ikina', 'ika', false, I));
progressive.push(prefix('ikinaka', 'ika', {stemMinLength: 2}, I));
progressive.push(...reduplicationRules('pinag', 'pag', true, SFX));
add('progressive', 'progressive', 'Progressive aspect: realis and the reduplicated first syllable of the root (nagluluto → magluto, kumakain → kumain, kinakain → kain, sinusulatan → sulatan, isinusulat → isulat), or of the prefix in speech (nakakakain, nagpapaluto).', progressive);

// Contemplative: reduplication alone.
const contemplative = [];
for (const {m, final} of M_PREFIXES) {
    if (m === 'ma') { continue; }  // maReduplication below
    contemplative.push(...reduplicationRules(m, m, final, M));
}
for (const [m, to] of PREFIX_REDUPLICATION) {
    contemplative.push(prefix(m, to, {stemMinLength: 2}, M));
    if (TO_ROOT.has(m)) { contemplative.push(prefix(m, '', {stemMinLength: 3}, [[], ROOT])); }
}
// -um-: C + V + C... -> C + um (kakain -> kumain, darating -> dumating).
contemplative.push(...rootReduplicationRules('', (c) => `${c}um`, (v) => `um${v}`, UM));
// -in, -an and other forms with nothing before the root: C + V + C... -> C
// (kakainin -> kainin, susulatan -> sulatan).
contemplative.push(...rootReduplicationRules('', (c) => c, (v) => v, SFX));
contemplative.push(pattern('i', `^i${C_GROUP}(${VOWEL})\\1([lrwy]?)\\2(?=.)`, 'i$1$3$2', I));
for (const v of VOWELS) {
    contemplative.push(prefix(`i${v}${v}`, `i${v}`, {stemMinLength: 2}, I));
}
contemplative.push(...reduplicationRules('ipag', 'ipag', true, I));
contemplative.push(...reduplicationRules('ipa', 'ipa', false, I));
contemplative.push(prefix('ipapa', 'ipa', {stemMinLength: 2}, I));
contemplative.push(...reduplicationRules('ika', 'ika', false, I));
contemplative.push(...reduplicationRules('pag', 'pag', true, SFX));
contemplative.push(...reduplicationRules('pa', 'pa', false, SFX));
contemplative.push(prefix('papa', 'pa', {stemMinLength: 2}, SFX));
add('contemplative', 'contemplative', 'Contemplative aspect: the reduplicated first syllable of the root (magluluto → magluto, kakain → kumain, kakainin → kainin, susulatan → sulatan, isusulat → isulat), or of the prefix in speech (makakakain, magpapaluto).', contemplative);

// ma- adjectives and verbs: the plural of an adjective after a superlative
// or intensive is reduplicated too (pinakamagaganda), so adj_ma is taken.
add('maReduplication', 'contemplative or plural', 'The reduplicated first syllable after ma-: the contemplative of a ma- verb (matutulog → matulog) or the plural of a ma- adjective (magaganda → maganda, malalaki → malaki).',
    reduplicationRules('ma', 'ma', false, [['adj_ma'], ['adj', 'adj_ma', 'v_m']]));

add('recentlyCompleted', 'recently completed', 'Recently completed action: ka- and the reduplicated first syllable of the root (kakakain → kain, kararating → dating), or kaka- in speech (kakaalis → alis).', [
    ...rootReduplicationRules('ka', (c) => c, (v) => v, [[], ROOT]),
    // d -> r in both syllables between vowels (kararating -> dating).
    ...VOWELS.map((v) => prefix(`kar${v}r`, 'd', {stemStartsWith: `[${v}]`, stemMinLength: 2}, [[], ROOT])),
    prefix('kakar', 'd', {stemStartsWith: VOWEL, stemMinLength: 2}, [[], ROOT]),
    prefix('kaka', '', {stemMinLength: 3}, [[], ROOT]),
    prefix('kakapag', '', {stemStartsWith: CONSONANT, stemMinLength: 3}, [[], ROOT]),
    prefix('kakapag-', '', {stemMinLength: 2}, [[], ROOT]),
]);

// --- Abilitative and social forms of mag- and i- verbs -----------------------
add('abilitative', 'abilitative', 'Ability or chance: makapag- of a mag- verb (makapagluto → magluto), mai- of an i- verb (maibigay → ibigay), maipa- and maipag- (maipaliwanag → ipaliwanag).', [
    prefix('makapag', 'mag', {stemMinLength: 3}, [['v_m'], ['v_m']]),
    prefix('makapag-', 'mag-', {stemMinLength: 2}, [['v_m'], ['v_m']]),
    prefix('mai', 'i', {stemMinLength: 3}, [['v_m'], ['v_i']]),
    prefix('maipa', 'ipa', {stemMinLength: 3}, [['v_m'], ['v_i']]),
    prefix('maipag', 'ipag', {stemMinLength: 3}, [['v_m'], ['v_i']]),
    prefix('maipag-', 'ipag-', {stemMinLength: 2}, [['v_m'], ['v_i']]),
]);
add('social', 'social', 'Doing something with others: makipag- of a mag- verb (makipaglaro → maglaro, makipag-usap → mag-usap).', [
    prefix('makipag', 'mag', {stemMinLength: 3}, [['v_m'], ['v_m']]),
    prefix('makipag-', 'mag-', {stemMinLength: 2}, [['v_m'], ['v_m']]),
]);

// --- Affixes -> root ---------------------------------------------------------
const FROM_M = [['v_m'], ROOT];
add('um', '-um-', 'Actor focus -um-, after the first consonant of the root or before a vowel (kumain → kain, sumulat → sulat, uminom → inom).', [
    ...CONSONANTS.map((c) => prefix(`${c}um`, c, {...ONE, stemStartsWith: AFTER_FIRST, stemMinLength: 3}, [['v_um'], ROOT])),
    prefix('um', '', {...ONE, stemStartsWith: VOWEL, stemMinLength: 3}, [['v_um'], ROOT]),
]);
// The root of a mag- verb may be a ma- adjective (magmadali -> madali), and
// -an may follow as a second step: the reciprocal (magkamayan -> kamayan ->
// kamay) comes after the -an word itself (maghapunan -> hapunan).
const FROM_MAG = [['v_m'], [...ROOT, 'adj_ma', 'v_sfx']];
add('mag', 'mag-', 'Actor focus mag- (magluto → luto, mag-aral → aral, magmadali → madali).', [
    prefix('mag', '', {stemStartsWith: CONSONANT, stemMinLength: 3}, FROM_MAG),
    prefix('mag-', '', {stemMinLength: 2}, FROM_MAG),
]);
// magsi- (plural actor) is a pattern anchored on mag, so that it is tried
// after the mag- rules above: magsimula is mag- + simula before magsi- +
// mula, and magsikain is magsi- + kain because sikain is no word.
add('magsi', 'magsi-', 'Plural actor (magsikain → kain, nagsialis → alis, magsipagluto → magluto).', [
    pattern('mag', '^magsipag-(?=..)', 'mag-', [['v_m'], ['v_m']]),
    pattern('mag', '^magsipag(?=...)', 'mag', [['v_m'], ['v_m']]),
    pattern('mag', '^magsi(?=...)', '', FROM_M),
]);
add('ma', 'ma-', 'ma- adjectives and verbs (maganda → ganda, matulog → tulog), with d → r (marami → dami).', [
    prefix('ma', '', {...ONE, stemMinLength: 3}, [['v_m', 'adj_ma', 'v_sfx'], ROOT]),
    prefix('ma-', '', {...ONE, stemMinLength: 2}, [['v_m', 'adj_ma', 'v_sfx'], ROOT]),
    prefix('mar', 'd', {...ONE, stemStartsWith: VOWEL, stemMinLength: 2}, [['v_m', 'adj_ma', 'v_sfx'], ROOT]),
]);
add('mang', 'mang-', 'Actor focus mang-, which merges with the root\'s first consonant: mam- for b and p (mamili → bili, pili), man- for d, s and t (manahi → tahi), mang- for k and the vowels (mangisda → isda).', [
    prefix('mang', '', {stemMinLength: 3}, FROM_M),
    prefix('mang', 'k', {stemStartsWith: VOWEL, stemMinLength: 3}, FROM_M),
    prefix('mang-', '', {stemMinLength: 2}, FROM_M),
    prefix('mam', '', {stemStartsWith: '[bp]', stemMinLength: 3}, FROM_M),
    prefix('mam', 'b', {stemStartsWith: VOWEL, stemMinLength: 3}, FROM_M),
    prefix('mam', 'p', {stemStartsWith: VOWEL, stemMinLength: 3}, FROM_M),
    prefix('man', 'd', {stemStartsWith: VOWEL, stemMinLength: 3}, FROM_M),
    prefix('man', 's', {stemStartsWith: VOWEL, stemMinLength: 3}, FROM_M),
    prefix('man', 't', {stemStartsWith: VOWEL, stemMinLength: 3}, FROM_M),
    prefix('man', '', {stemStartsWith: '[dlrsty]', stemMinLength: 3}, FROM_M),
]);
// A prefix that ends in a vowel turns a root's first d into r (makarating,
// nakarating -> dating).
const simplePrefix = (id, name, description, p, io, extra = {}) => add(id, name, description, [
    ...(VOWELS.includes(p.at(-1)) ? [prefix(`${p}r`, 'd', {stemStartsWith: VOWEL, stemMinLength: 2}, io)] : []),
    prefix(p, '', {stemMinLength: 3, ...extra}, io),
    prefix(`${p}-`, '', {stemMinLength: 2}, io),
]);
simplePrefix('maka', 'maka-', 'Ability or chance, actor focus (makakain → kain, makauwi → uwi).', 'maka', FROM_M);
simplePrefix('maki', 'maki-', 'Joining others, actor focus (makikain → kain).', 'maki', FROM_M);
// A root of four letters when it starts with a consonant: nagpasya is mag-
// + pasya, not magpa- + sya; magpaamo and magpauna are magpa- + amo, una.
const fourAfterConsonant = (id, name, description, p) => add(id, name, description, [
    prefix(`${p}r`, 'd', {stemStartsWith: VOWEL, stemMinLength: 2}, FROM_M),
    prefix(p, '', {stemStartsWith: VOWEL, stemMinLength: 3}, FROM_M),
    prefix(p, '', {stemStartsWith: CONSONANT, stemMinLength: 4}, FROM_M),
    prefix(`${p}-`, '', {stemMinLength: 2}, FROM_M),
]);
fourAfterConsonant('magpa', 'magpa-', 'Causative, actor focus (magpaluto → luto, magpaamo → amo).', 'magpa');
fourAfterConsonant('mapa', 'mapa-', 'Involuntary action (mapaiyak → iyak).', 'mapa');
simplePrefix('magka', 'magka-', 'Coming to have (magkasakit → sakit).', 'magka', FROM_M);
simplePrefix('magpaka', 'magpaka-', 'Making an effort to be (magpakabait → bait).', 'magpaka', FROM_M);
const FROM_I = [['v_i'], ROOT];
simplePrefix('i', 'i-', 'Conveyance or benefactive focus (isulat → sulat, ibigay → bigay, iabot → abot).', 'i', FROM_I);
simplePrefix('ipag', 'ipag-', 'Benefactive focus of a mag- verb (ipagluto → luto).', 'ipag', FROM_I, {stemStartsWith: CONSONANT});
simplePrefix('ipa', 'ipa-', 'Causative, object focus (ipaluto → luto).', 'ipa', FROM_I, ONE);
simplePrefix('ika', 'ika-', 'Reason focus, and ordinal numbers (ikagalit → galit, ikalima → lima).', 'ika', FROM_I);

const FINAL_CONSONANTS = ['b', 'k', 'd', 'g', 'l', 'm', 'n', 'ng', 'p', 'r', 's', 't', 'w', 'y'];
const FROM_SFX = [['v_sfx'], ROOT];
// Common verbs whose root loses a vowel before -in or -an.
// A whole word, so they may also follow a root that another rule left
// (masaktan -> saktan -> sakit).
const FROM_SYNCOPE = [['v_sfx', 'n'], ROOT];
const SYNCOPE_IN = [['bili', 'bilhin'], ['dala', 'dalhin'], ['kuha', 'kunin'], ['gawa', 'gawin'], ['sunod', 'sundin'],
    ['dinig', 'dinggin'], ['hingi', 'hingin'], ['dakip', 'dakpin'], ['tanim', 'tamnin'], ['dama', 'damhin']];
const SYNCOPE_AN = [['tingin', 'tingnan'], ['bigay', 'bigyan'], ['bukas', 'buksan'], ['sara', 'sarhan'], ['hingi', 'hingan'],
    ['sunod', 'sundan'], ['tanim', 'tamnan'], ['dala', 'dalhan'], ['bili', 'bilhan'], ['kuha', 'kunan'], ['gawa', 'gawan'],
    ['dating', 'datnan'], ['tira', 'tirhan'], ['puno', 'punan'], ['lagay', 'lagyan'], ['dinig', 'dinggan'], ['sakay', 'sakyan'],
    ['takip', 'takpan'], ['sakit', 'saktan'], ['laba', 'labhan'], ['masid', 'masdan'], ['kamit', 'kamtan'], ['higa', 'higan'],
    ['tanggap', 'tanggapan']];
const SUFFIXES_AN = [['an', ''], ['han', ''], ['nan', ''], ['ran', 'd']];
const SUFFIXES_IN = [['in', ''], ['hin', ''], ['rin', 'd']];

// The completive of an -in verb drops the suffix (kinain from kainin). The
// -in infinitive comes back with the realis -in- removed and -in added to
// the root's end: -in after a consonant, with u for an o before it (ginamot
// -> gamutin); -hin or -in after a vowel, u for a final o (niluto ->
// lutuin, tinukso -> tuksuhin); r for a final d (nilakad -> lakarin). The
// suffix of each rule is the root's last letter or two, so the rules are
// indexed by it; their output is a dictionary form no other rule takes.
const IN_ENDINGS = [
    ...FINAL_CONSONANTS.map((c) => [c, `${c}in`]),
    ...FINAL_CONSONANTS.map((c) => [`o${c}`, `u${c}in`]),
    ...['a', 'e', 'i', 'u'].flatMap((v) => [[v, `${v}hin`], [v, `${v}in`]]),
    ['o', 'uhin'], ['o', 'uin'], ['d', 'rin'],
];
const IN_VERB = [['v_compl'], ['v_in']];
add('inVerb', '-in verb', 'The -in infinitive of a completive, which drops the suffix (kinain → kainin, binasa → basahin, ininom → inumin, niluto → lutuin, nilakad → lakarin, binili → bilhin, pinakain → pakainin).', [
    circumfix([...CONSONANTS.map((c) => [`${c}in`, c]), ...['l', 'y', 'w', 'h', 'r'].map((c) => [`ni${c}`, c])], IN_ENDINGS,
        {stemStartsWith: AFTER_FIRST, stemMinLength: 1}, IN_VERB),
    circumfix([['in', '']], IN_ENDINGS, {stemStartsWith: VOWEL, stemMinLength: 1}, IN_VERB),
    circumfix([['pina', 'pa']], IN_ENDINGS, {stemMinLength: 1}, IN_VERB),
    // The common verbs whose root loses a vowel before -in (binili -> bilhin).
    ...SYNCOPE_IN.map(([root, form]) => {
        const c = root.startsWith('ng') ? 'ng' : root[0];
        return whole(`${c}in${root.slice(c.length)}`, form, IN_VERB);
    }),
]);
// The u -> o of a final syllable: the final o itself (lutuan -> luto), and
// an o before consonants by the stem change (kalungkutan -> lungkot).
const SUFFIXES_O = (ending) => [[`u${ending}`, 'o'], [`uh${ending}`, 'o'], [`un${ending}`, 'o']];
const circumfixes = (prefixes, suffixes, ending, io, minimum = 3) => [
    circumfix(prefixes, suffixes, {stemMinLength: minimum}, io),
    circumfix(prefixes, [[ending, '']], {stemMinLength: 2, stemChange: U_TO_O}, io),
    circumfix(prefixes, SUFFIXES_O(ending), {stemMinLength: 2}, io),
];
// ma- -an before -an: matandaan is ma- + tanda + -an, not matanda + -an.
add('maAn', 'ma- -an', 'ma- with -an: ability or chance, locative focus (maunawaan → unawa, matandaan → tanda), with d → r (maramdaman → damdam).', [
    ...circumfixes([['ma', '']], SUFFIXES_AN, 'an', FROM_M),
    circumfix([['mar', 'd']], [...SUFFIXES_AN, ...SUFFIXES_O('an')], {stemStartsWith: VOWEL, stemMinLength: 2}, FROM_M),
]);
add('makaAn', 'maka- -an', 'maka- with -an: ability or chance, locative focus (makalimutan → limot, makaabutan → abot).',
    circumfixes([['maka', '']], SUFFIXES_AN, 'an', FROM_M));

add('objectIn', '-in', 'Object focus -in, -hin after a vowel, with u for the o of the last syllable (kainin → kain, basahin → basa, inumin → inom, lutuin → luto), and the verbs whose root loses a vowel (bilhin → bili, kunin → kuha).', [
    suffix('in', '', {...LOWER, stemMinLength: 3}, FROM_SFX),
    suffix('hin', '', {...LOWER, stemEndsWith: VOWEL, stemMinLength: 3}, FROM_SFX),
    suffix('in', '', {...LOWER, stemMinLength: 3, stemChange: U_TO_O}, FROM_SFX),
    suffix('uin', 'o', {...LOWER, stemMinLength: 2}, FROM_SFX),
    suffix('uhin', 'o', {...LOWER, stemMinLength: 2}, FROM_SFX),
    suffix('nin', '', {...LOWER, stemEndsWith: VOWEL, stemMinLength: 3}, FROM_SFX),
    suffix('unin', 'o', {...LOWER, stemMinLength: 2}, FROM_SFX),
    suffix('rin', 'd', {...LOWER, stemEndsWith: VOWEL, stemMinLength: 2}, FROM_SFX),
    suffix('urin', 'od', {...LOWER, stemMinLength: 2}, FROM_SFX),
    ...SYNCOPE_IN.map(([root, form]) => whole(form, root, FROM_SYNCOPE)),
]);
add('locativeAn', '-an', 'Locative or directional focus -an, -han or -nan after a vowel, with u for the o of the last syllable (sulatan → sulat, puntahan → punta, tawanan → tawa, sagutan → sagot), d → r (bayaran → bayad), and the verbs whose root loses a vowel (bigyan → bigay, buksan → bukas).', [
    // Not after mag-: maghapunan is mag- + hapunan, not maghapon + -an.
    suffix('an', '', {...LOWER, stemMinLength: 3, stemNotStartsWithText: 'mag'}, FROM_SFX),
    suffix('han', '', {...LOWER, stemEndsWith: VOWEL, stemMinLength: 3}, FROM_SFX),
    suffix('nan', '', {...LOWER, stemEndsWith: VOWEL, stemMinLength: 3}, FROM_SFX),
    suffix('an', '', {...LOWER, stemMinLength: 3, stemChange: U_TO_O, stemNotStartsWithText: 'mag'}, FROM_SFX),
    suffix('uan', 'o', {...LOWER, stemMinLength: 2}, FROM_SFX),
    suffix('uhan', 'o', {...LOWER, stemMinLength: 2}, FROM_SFX),
    suffix('unan', 'o', {...LOWER, stemMinLength: 2}, FROM_SFX),
    suffix('ran', 'd', {...LOWER, stemEndsWith: VOWEL, stemMinLength: 2}, FROM_SFX),
    suffix('uran', 'od', {...LOWER, stemMinLength: 2}, FROM_SFX),
    ...SYNCOPE_AN.map(([root, form]) => whole(form, root, FROM_SYNCOPE)),
]);

// Added after Yomitan's rules were read: adjectives with ma- and -in
// (madamdamin, matiisin). A root of four letters: magasin (magazine) is not
// ma- + gas + -in.
add('maIn', 'ma- -in', 'Adjectives with ma- and -in: given to (madasalin → dasal, matiisin → tiis, madamdamin → damdam, maramdamin → damdam).', [
    circumfix([['ma', '']], SUFFIXES_IN, {stemMinLength: 4}, FROM_M),
    circumfix([['ma', '']], [['in', '']], {stemMinLength: 4, stemChange: U_TO_O}, FROM_M),
    circumfix([['mar', 'd']], SUFFIXES_IN, {stemStartsWith: VOWEL, stemMinLength: 3}, FROM_M),
]);
add('paAn', 'pa- -an', 'Causative pa- with -an (pagalitan → galit, paniwalaan → niwala), and pakinggan → kinig.', [
    ...circumfixes([['pa', '']], SUFFIXES_AN, 'an', FROM_SFX),
    whole('pakinggan', 'kinig', FROM_SFX),
]);
add('pagAn', 'pag- -an', 'pag- with -an: locative focus of a mag- verb (pag-usapan → usap, pagsabihan → sabi).',
    circumfixes([['pag', ''], ['pag-', '']], SUFFIXES_AN, 'an', FROM_SFX, 2));
add('pagIn', 'pag- -in', 'pag- with -in: object focus of a mag- verb (pagsabihin → sabi, pagbuhatin → buhat).',
    circumfixes([['pag', ''], ['pag-', '']], SUFFIXES_IN, 'in', FROM_SFX, 2));
add('paIn', 'pa- -in', 'Causative pa- with -in (pakainin → kain, patulugin → tulog).',
    circumfixes([['pa', '']], SUFFIXES_IN, 'in', FROM_SFX));
// A root of four letters: kamayan is kamay + -an, not ka- + may + -an.
add('kaAn', 'ka- -an', 'Abstract and collective nouns with ka- and -an, and ka- -an verbs (kagandahan → ganda, kalayaan → laya, kalungkutan → lungkot, kamuhian → muhi).',
    circumfixes([['ka', '']], SUFFIXES_AN, 'an', FROM_SFX, 4));


const RAW_ROOT = [[], ROOT];
add('gerund', 'pag-', 'Verbal nouns with pag- (pagbasa → basa, pag-ibig → ibig), with the reduplicated first syllable (pagbabasa → basa, pag-aaral → aral), pagka-, pagkaka-, pagpapa- and pakikipag- (pagkakamali → mali, pakikipag-usap → usap).', [
    prefix('pag', '', {stemStartsWith: CONSONANT, stemMinLength: 3}, [['v_sfx'], ROOT]),
    prefix('pag-', '', {stemMinLength: 2}, [['v_sfx'], ROOT]),
    pattern('pag', `^pag${C_GROUP}(${VOWEL})\\1([lrwy]?)\\2(?=.)`, '$1$3$2', RAW_ROOT),
    ...VOWELS.map((v) => prefix(`pag-${v}${v}`, v, {stemMinLength: 2}, RAW_ROOT)),
    // The gerunds of maging and magkaroon.
    whole('pagiging', 'maging', RAW_ROOT),
    whole('pagkakaroon', 'magkaroon', RAW_ROOT),
    prefix('pagkar', 'd', {stemStartsWith: VOWEL, stemMinLength: 2}, RAW_ROOT),
    prefix('pagka', '', {stemMinLength: 3}, RAW_ROOT),
    prefix('pagkakar', 'd', {stemStartsWith: VOWEL, stemMinLength: 2}, RAW_ROOT),
    prefix('pagkaka', '', {stemMinLength: 3}, RAW_ROOT),
    prefix('pagpapa', '', {stemMinLength: 3}, RAW_ROOT),
    prefix('pakiki', '', {stemMinLength: 3}, RAW_ROOT),
    prefix('pakikipag', '', {stemStartsWith: CONSONANT, stemMinLength: 3}, RAW_ROOT),
    prefix('pakikipag-', '', {stemMinLength: 2}, RAW_ROOT),
]);
simplePrefix('paki', 'paki-', 'A polite request (pakisara → sara, pakiabot → abot).', 'paki', RAW_ROOT);
simplePrefix('naka', 'naka-', 'A state or position (nakaupo → upo, nakabukas → bukas).', 'naka', RAW_ROOT);
// The superlative and intensive take an adjective (pinakamaganda) or a root
// (pinakagusto), so the output is a ma- adjective or a root.
const ADJ_OR_ROOT = [[], ['adj_ma', ...ROOT]];
add('pinaka', 'pinaka-', 'Superlative (pinakamaganda → maganda, pinakamalaki → malaki).', [
    prefix('pinaka', '', {stemMinLength: 3}, ADJ_OR_ROOT),
]);
add('napaka', 'napaka-', 'Very, with the root of a ma- adjective (napakaganda → maganda, ganda).', [
    prefix('napaka', 'ma', {stemMinLength: 3}, [[], ['adj', 'adj_ma']]),
    prefix('napaka', '', {stemMinLength: 3}, ADJ_OR_ROOT),
]);
// kasing- before vowels, k, g, h, m, n, w and y; kasin- before d, l, r, s
// and t; kasim- before b and p; the same without ka-.
const equative = [];
for (const [p, before] of [['kasing', '[aeioughkmnwy]'], ['kasin', '[dlrst]'], ['kasim', '[bp]'],
    ['sing', '[aeioughkmnwy]'], ['sin', '[dlrst]'], ['sim', '[bp]']]) {
    equative.push(prefix(p, 'ma', {stemStartsWith: before, stemMinLength: 3}, [[], ['adj', 'adj_ma']]));
    equative.push(prefix(p, '', {stemStartsWith: before, stemMinLength: 3}, RAW_ROOT));
}
add('equative', 'kasing-', 'As … as: kasing-, kasin- or kasim- with the root of an adjective (kasingganda → maganda, ganda; kasinlaki → malaki).', equative);
simplePrefix('taga', 'taga-', 'The one who does something, or someone from a place (tagaluto → luto, taga-Maynila → Maynila).', 'taga', RAW_ROOT);
add('pang', 'pang-', 'pang- for an instrument or purpose, which merges with the root\'s first consonant (pang-araw-araw, panulat → sulat, pambansa → bansa).', [
    prefix('pang', '', {stemStartsWith: '[aeioughkmnwy]', stemMinLength: 3}, RAW_ROOT),
    prefix('pang-', '', {stemMinLength: 2}, RAW_ROOT),
    prefix('pam', '', {stemStartsWith: '[bp]', stemMinLength: 3}, RAW_ROOT),
    // A root's first consonant merged into the prefix: the rest of the root
    // has four letters (panulat -> sulat, pamutol -> putol), so pamuli is pa-
    // + muli, not pang- + buli.
    prefix('pam', 'b', {stemStartsWith: VOWEL, stemMinLength: 4}, RAW_ROOT),
    prefix('pam', 'p', {stemStartsWith: VOWEL, stemMinLength: 4}, RAW_ROOT),
    prefix('pan', '', {stemStartsWith: '[dlrst]', stemMinLength: 3}, RAW_ROOT),
    prefix('pan', 'd', {stemStartsWith: VOWEL, stemMinLength: 4}, RAW_ROOT),
    prefix('pan', 's', {stemStartsWith: VOWEL, stemMinLength: 4}, RAW_ROOT),
    prefix('pan', 't', {stemStartsWith: VOWEL, stemMinLength: 4}, RAW_ROOT),
]);
add('mapag', 'mapag-', 'Inclined to (mapagmahal → mahal), and mapag- verbs (mapagtanto → tanto).', [
    prefix('mapag', '', {stemStartsWith: CONSONANT, stemMinLength: 3}, FROM_M),
    prefix('mapag-', '', {stemMinLength: 2}, FROM_M),
]);
simplePrefix('tig', 'tig-', 'Each, with numbers (tig-isa → isa, tigdalawa → dalawa).', 'tig', RAW_ROOT);

// Added after Yomitan's rules were read (step 5): its ka-, pa- and pala-
// read many Tatoeba words this file had no rule for (gaano katagal,
// kalaki, paligid, pataas, palatanong), and also short or multiword texts
// (kani -> ni, pay -> y, paano ba -> ano ba, palala -> la). These are the
// same prefixes with a minimum root and no space in it.
const ONE_WORD = '[^ ]';
const rootPrefix = (id, name, description, p, minimum) => add(id, name, description, [
    prefix(`${p}r`, 'd', {stemStartsWith: VOWEL, stemCharacters: ONE_WORD, stemMinLength: minimum - 1}, RAW_ROOT),
    prefix(p, '', {stemCharacters: ONE_WORD, stemMinLength: minimum}, RAW_ROOT),
]);
rootPrefix('ka', 'ka-', 'ka- with an adjective root, in gaano ka- and kay ka- (gaano katagal → tagal, kalaki → laki, karami → dami), and fellow (kapareho → pareho).', 'ka', 4);
rootPrefix('pa', 'pa-', 'pa- for a direction or manner, and nouns (paligid → ligid, pataas → taas, papuri → puri, parangal → dangal).', 'pa', 4);
rootPrefix('pala', 'pala-', 'Fond of, inclined to (palatanong → tanong, palabiro → biro).', 'pala', 4);
// Seasons: tag- with a hyphen before a vowel (tag-init, tag-ulan), and
// before a consonant (tagsibol, taglamig). Not before a vowel without the
// hyphen: tagalog is not tag- + alog.
add('tag', 'tag-', 'Seasons and times (tag-init → init, tag-ulan → ulan, tagsibol → sibol).', [
    prefix('tag-', '', {stemMinLength: 2}, RAW_ROOT),
    prefix('tag', '', {stemStartsWith: CONSONANT, stemMinLength: 4}, RAW_ROOT),
]);

const out = {schema: 1, conditions, wordLists: {}, transforms};
const file = join(here, 'own.json');
writeFileSync(file, formatTransforms(out));
const count = transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`${file}: ${transforms.length} transforms, ${count} rules`);
