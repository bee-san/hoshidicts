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
//   kainin), so the rules take it to its root (kain); the dictionary's
//   form-of rows name the infinitive (kainin) where they list the form.
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

const conditions = {
    v: {name: 'Verb', isDictionaryForm: true, subConditions: ['v_m', 'v_um', 'v_i', 'v_sfx', 'v_root']},
    v_m: {name: 'Verb with an m- prefix (mag-, ma-, mang-, maka-, maki-, magpa-, ...)', isDictionaryForm: false},
    v_um: {name: 'Verb with -um-', isDictionaryForm: false},
    v_i: {name: 'Verb with i- (i-, ipag-, ipa-, ika-)', isDictionaryForm: false},
    v_sfx: {name: 'Verb with -in or -an', isDictionaryForm: false},
    v_root: {name: 'Verb root', isDictionaryForm: false},
    n: {name: 'Noun', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true, subConditions: ['adj_ma', 'adj_root']},
    adj_ma: {name: 'Adjective with ma-', isDictionaryForm: false},
    adj_root: {name: 'Adjective root', isDictionaryForm: false},
};
// What each kind of rule gives and takes.
const ROOT = ['n', 'adj_root', 'v_root'];
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
    {m: 'magsi', final: false},
    {m: 'mai', final: false},
    {m: 'maipa', final: false},
    {m: 'maipag', final: true},
    {m: 'magpaka', final: false},
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
    ['magsisi', 'magsi'], ['makakapag', 'makapag'], ['makikipag', 'makipag'], ['magpapaka', 'magpaka'],
    ['maiipa', 'maipa'],
];

// Root reduplication after a fixed prefix P that stays (contemplative) or
// after a realis prefix R that becomes P (progressive): R + CV + C... ->
// P + C... (nagbabasa -> magbasa, nagtatrabaho -> magtrabaho), the vowel
// roots (nag-aaral, naaalala), and d -> r between vowels (nagdarasal).
function reduplicationRules(from, to, final, io) {
    const rules = [
        pattern(from, `^${from}${C_GROUP}${VOWEL}\\1(?=..)`, `${to}$1`, io),
        // A cluster reduplicated whole in speech (magplaplantsa -> magplantsa).
        pattern(from, `^${from}${C_GROUP}([lrwy])${VOWEL}\\1\\2(?=..)`, `${to}$1$2`, io),
        // A loanword after a hyphen (nagte-text -> mag-text, mapo-promote -> ma-promote).
        pattern(from, `^${from}${C_GROUP}${VOWEL}-\\1(?=..)`, `${to}-$1`, io),
    ];
    for (const v of VOWELS) {
        if (final) {
            rules.push(prefix(`${from}-${v}${v}`, `${to}-${v}`, {stemMinLength: 2}, io));
            rules.push(prefix(`${from}${v}${v}`, `${to}-${v}`, {stemMinLength: 2}, io));
        } else {
            rules.push(prefix(`${from}${v}${v}`, `${to}${v}`, {stemMinLength: 2}, io));
        }
        rules.push(prefix(`${from}d${v}r`, `${to}d`, {stemMinLength: 2}, io));
    }
    return rules;
}

// The same for a root with nothing before it, as literal rules (a pattern
// needs a literal anchor): before + C + V + C... -> to(C) (kakainin ->
// kainin with to(C) = C; kakain -> kumain with to(C) = C + um).
function rootReduplicationRules(before, to, toVowel, io) {
    const rules = [];
    for (const c of CONSONANTS) {
        for (const v of VOWELS) {
            rules.push(prefix(`${before}${c}${v}${c}`, to(c), {stemMinLength: 2}, io));
        }
    }
    for (const v of VOWELS) {
        rules.push(prefix(`${before}${v}${v}`, toVowel(v), {stemMinLength: 2}, io));
        rules.push(prefix(`${before}d${v}r`, to('d'), {stemMinLength: 2}, io));
    }
    return rules;
}

const transforms = [];
const add = (id, name, description, rules) => transforms.push({id, name, description, source: 'own', rules});

// --- Linker and contractions -------------------------------------------------
// The same word back, of any part of speech: empty conditions.
add('linker', '-ng', 'Linker: -ng after a vowel, -g after n, joins a word to the word it modifies (magandang umaga, kaibigang tapat, gusto kong).', [
    suffix('ng', '', {stemEndsWith: VOWEL, stemMinLength: 2}, ANY),
    suffix('ng', 'n', {stemEndsWith: VOWEL, stemMinLength: 2}, ANY),
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
const HYPHEN_PREFIXES = ['mag', 'nag', 'pag', 'ipag', 'ipinag', 'pinag', 'makapag', 'nakapag', 'makipag', 'nakipag',
    'nakikipag', 'makikipag', 'pakikipag', 'mang', 'nang', 'pang', 'tag', 'maipag', 'naipag'];
add('prefixHyphen', 'hyphen', 'The hyphen between a prefix ending in a consonant and a root starting with a vowel, left out (magaral → mag-aral, pagibig → pag-ibig).',
    HYPHEN_PREFIXES.flatMap((p) => VOWELS.map((v) => prefix(`${p}${v}`, `${p}-${v}`, {stemMinLength: 2}, ANY))));

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
for (const [m, to] of PREFIX_REDUPLICATION) {
    progressive.push(prefix(realisOf(m), to, {stemMinLength: 2}, M));
}
// -um-: C + um + V + C... -> C + um (kumakain -> kumain).
for (const c of CONSONANTS) {
    for (const v of VOWELS) {
        progressive.push(prefix(`${c}um${v}${c}`, `${c}um`, {stemMinLength: 2}, UM));
    }
}
for (const v of VOWELS) {
    progressive.push(prefix(`um${v}${v}`, `um${v}`, {stemMinLength: 2}, UM));
    progressive.push(prefix(`dum${v}r`, 'dum', {stemMinLength: 2}, UM));
}
// -in- and reduplication: C + in + V + C... -> C (kinakain -> kain,
// sinusulatan -> sulatan), in + V + V (iniinom), ni + L + V + L (niluluto),
// and pa- with -in- (pinakakain, pinapakain -> pakain).
for (const c of CONSONANTS) {
    for (const v of VOWELS) {
        progressive.push(prefix(`${c}in${v}${c}`, c, {stemMinLength: 2}, SFX));
    }
}
for (const v of VOWELS) {
    progressive.push(prefix(`in${v}${v}`, v, {stemMinLength: 2}, SFX));
    progressive.push(prefix(`din${v}r`, 'd', {stemMinLength: 2}, SFX));
    for (const l of ['l', 'y', 'w', 'h', 'r']) {
        progressive.push(prefix(`ni${l}${v}${l}`, l, {stemMinLength: 2}, SFX));
    }
}
progressive.push(pattern('pina', `^pina${C_GROUP}${VOWEL}\\1(?=..)`, 'pa$1', SFX));
progressive.push(prefix('pinapa', 'pa', {stemMinLength: 2}, SFX));
progressive.push(pattern('pina', `^pina${C_GROUP}${VOWEL}\\1(?=..)`, '$1', [[], ROOT]));
progressive.push(prefix('pinapa', '', {stemMinLength: 3}, [[], ROOT]));
// i-, ipag-, ipa-, ika- and pag- -an with -in- and reduplication. The i-
// rules are literal, so that they are tried before the completive's
// shorter i- + -in- (isinusulat is isulat, not the completive of isusulat).
for (const c of CONSONANTS) {
    for (const v of VOWELS) {
        progressive.push(prefix(`i${c}in${v}${c}`, `i${c}`, {stemMinLength: 2}, I));
    }
}
for (const v of VOWELS) {
    progressive.push(prefix(`ini${v}${v}`, `i${v}`, {stemMinLength: 2}, I));
    for (const l of ['l', 'y', 'w', 'h', 'r']) {
        progressive.push(prefix(`ini${l}${v}${l}`, `i${l}`, {stemMinLength: 2}, I));
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
}
// -um-: C + V + C... -> C + um (kakain -> kumain, darating -> dumating).
contemplative.push(...rootReduplicationRules('', (c) => `${c}um`, (v) => `um${v}`, UM));
// -in, -an and other forms with nothing before the root: C + V + C... -> C
// (kakainin -> kainin, susulatan -> sulatan).
contemplative.push(...rootReduplicationRules('', (c) => c, (v) => v, SFX));
contemplative.push(pattern('i', `^i${C_GROUP}${VOWEL}\\1(?=..)`, 'i$1', I));
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
    reduplicationRules('ma', 'ma', false, [['adj_ma'], ['adj_ma', 'v_m']]));

add('recentlyCompleted', 'recently completed', 'Recently completed action: ka- and the reduplicated first syllable of the root (kakakain → kain, kararating → dating), or kaka- in speech (kakaalis → alis).', [
    ...rootReduplicationRules('ka', (c) => c, (v) => v, [[], ROOT]),
    // d -> r in both syllables between vowels (kararating -> dating).
    ...VOWELS.map((v) => prefix(`kar${v}r`, 'd', {stemMinLength: 2}, [[], ROOT])),
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
    ...CONSONANTS.map((c) => prefix(`${c}um`, c, {stemStartsWith: AFTER_FIRST, stemMinLength: 3}, [['v_um'], ROOT])),
    prefix('um', '', {stemStartsWith: VOWEL, stemMinLength: 3}, [['v_um'], ROOT]),
]);
// The root of a mag- verb may be a ma- adjective (magmadali -> madali).
add('mag', 'mag-', 'Actor focus mag- (magluto → luto, mag-aral → aral, magmadali → madali).', [
    prefix('mag', '', {stemStartsWith: CONSONANT, stemMinLength: 3}, [['v_m'], [...ROOT, 'adj_ma']]),
    prefix('mag-', '', {stemMinLength: 2}, [['v_m'], [...ROOT, 'adj_ma']]),
]);
add('ma', 'ma-', 'ma- adjectives and verbs (maganda → ganda, matulog → tulog), with d → r (marami → dami).', [
    prefix('ma', '', {stemMinLength: 3}, [['v_m', 'adj_ma', 'v_sfx'], ROOT]),
    prefix('ma-', '', {stemMinLength: 2}, [['v_m', 'adj_ma', 'v_sfx'], ROOT]),
    prefix('mar', 'd', {stemStartsWith: VOWEL, stemMinLength: 2}, [['v_m', 'adj_ma', 'v_sfx'], ROOT]),
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
const simplePrefix = (id, name, description, p, io, extra = {}) => add(id, name, description, [
    prefix(p, '', {stemMinLength: 3, ...extra}, io),
    prefix(`${p}-`, '', {stemMinLength: 2}, io),
]);
simplePrefix('maka', 'maka-', 'Ability or chance, actor focus (makakain → kain, makauwi → uwi).', 'maka', FROM_M);
simplePrefix('maki', 'maki-', 'Joining others, actor focus (makikain → kain).', 'maki', FROM_M);
simplePrefix('magpa', 'magpa-', 'Causative, actor focus (magpaluto → luto).', 'magpa', FROM_M);
simplePrefix('mapa', 'mapa-', 'Involuntary action (mapaiyak → iyak).', 'mapa', FROM_M);
simplePrefix('magka', 'magka-', 'Coming to have (magkasakit → sakit).', 'magka', FROM_M);
add('magsi', 'magsi-', 'Plural actor (magsialis → alis, magsipagluto → magluto).', [
    prefix('magsi', '', {stemMinLength: 3}, FROM_M),
    prefix('magsipag', 'mag', {stemMinLength: 3}, [['v_m'], ['v_m']]),
    prefix('magsipag-', 'mag-', {stemMinLength: 2}, [['v_m'], ['v_m']]),
]);
simplePrefix('magpaka', 'magpaka-', 'Making an effort to be (magpakabait → bait).', 'magpaka', FROM_M);
const FROM_I = [['v_i'], ROOT];
simplePrefix('i', 'i-', 'Conveyance or benefactive focus (isulat → sulat, ibigay → bigay, iabot → abot).', 'i', FROM_I);
simplePrefix('ipag', 'ipag-', 'Benefactive focus of a mag- verb (ipagluto → luto).', 'ipag', FROM_I, {stemStartsWith: CONSONANT});
simplePrefix('ipa', 'ipa-', 'Causative, object focus (ipaluto → luto).', 'ipa', FROM_I);
simplePrefix('ika', 'ika-', 'Reason focus, and ordinal numbers (ikagalit → galit, ikalima → lima).', 'ika', FROM_I);

const FINAL_CONSONANTS = ['b', 'k', 'd', 'g', 'l', 'm', 'n', 'ng', 'p', 'r', 's', 't', 'w', 'y'];
const FROM_SFX = [['v_sfx'], ROOT];
const oToU = (ending) => FINAL_CONSONANTS.map((c) => suffix(`u${c}${ending}`, `o${c}`, {stemMinLength: 2}, FROM_SFX));
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
add('objectIn', '-in', 'Object focus -in, -hin after a vowel, with u for the o of the last syllable (kainin → kain, basahin → basa, inumin → inom, lutuin → luto), and the verbs whose root loses a vowel (bilhin → bili, kunin → kuha).', [
    suffix('in', '', {stemMinLength: 3}, FROM_SFX),
    suffix('hin', '', {stemEndsWith: VOWEL, stemMinLength: 3}, FROM_SFX),
    ...oToU('in'),
    suffix('uin', 'o', {stemMinLength: 2}, FROM_SFX),
    suffix('uhin', 'o', {stemMinLength: 2}, FROM_SFX),
    suffix('nin', '', {stemEndsWith: VOWEL, stemMinLength: 3}, FROM_SFX),
    suffix('rin', 'd', {stemEndsWith: VOWEL, stemMinLength: 2}, FROM_SFX),
    suffix('urin', 'od', {stemMinLength: 2}, FROM_SFX),
    ...SYNCOPE_IN.map(([root, form]) => whole(form, root, FROM_SYNCOPE)),
]);
add('locativeAn', '-an', 'Locative or directional focus -an, -han or -nan after a vowel, with u for the o of the last syllable (sulatan → sulat, puntahan → punta, tawanan → tawa, sagutan → sagot), d → r (bayaran → bayad), and the verbs whose root loses a vowel (bigyan → bigay, buksan → bukas).', [
    suffix('an', '', {stemMinLength: 3}, FROM_SFX),
    suffix('han', '', {stemEndsWith: VOWEL, stemMinLength: 3}, FROM_SFX),
    suffix('nan', '', {stemEndsWith: VOWEL, stemMinLength: 3}, FROM_SFX),
    ...oToU('an'),
    suffix('uan', 'o', {stemMinLength: 2}, FROM_SFX),
    suffix('uhan', 'o', {stemMinLength: 2}, FROM_SFX),
    suffix('ran', 'd', {stemEndsWith: VOWEL, stemMinLength: 2}, FROM_SFX),
    suffix('uran', 'od', {stemMinLength: 2}, FROM_SFX),
    ...SYNCOPE_AN.map(([root, form]) => whole(form, root, FROM_SYNCOPE)),
]);

const SUFFIXES_AN = [['an', ''], ['han', ''], ['nan', '']];
const SUFFIXES_IN = [['in', ''], ['hin', ''], ['rin', 'd']];
const SUFFIXES_O = (ending) => [...FINAL_CONSONANTS.map((c) => [`u${c}${ending}`, `o${c}`]),
    [`u${ending}`, 'o'], [`uh${ending}`, 'o']];
add('maAn', 'ma- -an', 'ma- with -an: ability or chance, locative focus (maunawaan → unawa, matandaan → tanda), with d → r (maramdaman → damdam).', [
    circumfix([['ma', '']], SUFFIXES_AN, {}, FROM_M),
    circumfix([['ma', '']], SUFFIXES_O('an'), {stemMinLength: 2}, FROM_M),
    circumfix([['mar', 'd']], [...SUFFIXES_AN, ...SUFFIXES_O('an')], {stemStartsWith: VOWEL, stemMinLength: 2}, FROM_M),
]);
add('makaAn', 'maka- -an', 'maka- with -an: ability or chance, locative focus (makalimutan → limot, makaabutan → abot).', [
    circumfix([['maka', '']], SUFFIXES_AN, {}, FROM_M),
    circumfix([['maka', '']], SUFFIXES_O('an'), {stemMinLength: 2}, FROM_M),
]);
add('magAn', 'mag- -an', 'mag- with -an: reciprocal action (magkamayan → kamay, magsigawan → sigaw).', [
    circumfix([['mag', ''], ['mag-', '']], SUFFIXES_AN, {}, FROM_M),
    circumfix([['mag', ''], ['mag-', '']], SUFFIXES_O('an'), {stemMinLength: 2}, FROM_M),
]);
add('paAn', 'pa- -an', 'Causative pa- with -an (pagalitan → galit, paniwalaan → niwala), and pakinggan → kinig.', [
    circumfix([['pa', '']], SUFFIXES_AN, {}, FROM_SFX),
    circumfix([['pa', '']], SUFFIXES_O('an'), {stemMinLength: 2}, FROM_SFX),
    whole('pakinggan', 'kinig', FROM_SFX),
]);
add('pagAn', 'pag- -an', 'pag- with -an: locative focus of a mag- verb (pag-usapan → usap, pagsabihan → sabi).', [
    circumfix([['pag', ''], ['pag-', '']], SUFFIXES_AN, {stemMinLength: 2}, FROM_SFX),
    circumfix([['pag', ''], ['pag-', '']], SUFFIXES_O('an'), {stemMinLength: 2}, FROM_SFX),
]);
add('pagIn', 'pag- -in', 'pag- with -in: object focus of a mag- verb (pagsabihin → sabi, pagbuhatin → buhat).', [
    circumfix([['pag', ''], ['pag-', '']], SUFFIXES_IN, {stemMinLength: 2}, FROM_SFX),
    circumfix([['pag', ''], ['pag-', '']], SUFFIXES_O('in'), {stemMinLength: 2}, FROM_SFX),
]);
add('paIn', 'pa- -in', 'Causative pa- with -in (pakainin → kain, patulugin → tulog).', [
    circumfix([['pa', '']], SUFFIXES_IN, {}, FROM_SFX),
    circumfix([['pa', '']], SUFFIXES_O('in'), {stemMinLength: 2}, FROM_SFX),
]);
add('kaAn', 'ka- -an', 'Abstract and collective nouns with ka- and -an, and ka- -an verbs (kagandahan → ganda, kalayaan → laya, kalungkutan → lungkot, kamuhian → muhi).', [
    circumfix([['ka', '']], SUFFIXES_AN, {}, FROM_SFX),
    circumfix([['ka', '']], SUFFIXES_O('an'), {stemMinLength: 2}, FROM_SFX),
]);

const RAW_ROOT = [[], ROOT];
add('gerund', 'pag-', 'Verbal nouns with pag- (pagbasa → basa, pag-ibig → ibig), with the reduplicated first syllable (pagbabasa → basa, pag-aaral → aral), pagka-, pagkaka-, pagpapa- and pakikipag- (pagkakamali → mali, pakikipag-usap → usap).', [
    prefix('pag', '', {stemStartsWith: CONSONANT, stemMinLength: 3}, [['v_sfx'], ROOT]),
    prefix('pag-', '', {stemMinLength: 2}, [['v_sfx'], ROOT]),
    pattern('pag', `^pag${C_GROUP}${VOWEL}\\1(?=..)`, '$1', RAW_ROOT),
    ...VOWELS.map((v) => prefix(`pag-${v}${v}`, v, {stemMinLength: 2}, RAW_ROOT)),
    prefix('pagka', '', {stemMinLength: 3}, RAW_ROOT),
    prefix('pagkaka', '', {stemMinLength: 3}, RAW_ROOT),
    prefix('pagpapa', '', {stemMinLength: 3}, RAW_ROOT),
    prefix('pakiki', '', {stemMinLength: 3}, RAW_ROOT),
    prefix('pakikipag', '', {stemStartsWith: CONSONANT, stemMinLength: 3}, RAW_ROOT),
    prefix('pakikipag-', '', {stemMinLength: 2}, RAW_ROOT),
]);
simplePrefix('paki', 'paki-', 'A polite request (pakisara → sara, pakiabot → abot).', 'paki', RAW_ROOT);
simplePrefix('naka', 'naka-', 'A state or position (nakaupo → upo, nakabukas → bukas).', 'naka', RAW_ROOT);
add('nakaka', 'nakaka-', 'Causing a feeling or state, in speech (nakakatawa → tawa, nakakapagod → pagod).', [
    prefix('nakaka', '', {stemMinLength: 3}, RAW_ROOT),
]);
// The superlative and intensive take an adjective (pinakamaganda) or a root
// (pinakagusto), so the output is a ma- adjective or a root.
const ADJ_OR_ROOT = [[], ['adj_ma', ...ROOT]];
add('pinaka', 'pinaka-', 'Superlative (pinakamaganda → maganda, pinakamalaki → malaki).', [
    prefix('pinaka', '', {stemMinLength: 3}, ADJ_OR_ROOT),
]);
add('napaka', 'napaka-', 'Very, with the root of a ma- adjective (napakaganda → maganda, ganda).', [
    prefix('napaka', 'ma', {stemMinLength: 3}, [[], ['adj_ma']]),
    prefix('napaka', '', {stemMinLength: 3}, ADJ_OR_ROOT),
]);
// kasing- before vowels, k, g, h, m, n, w and y; kasin- before d, l, r, s
// and t; kasim- before b and p; the same without ka-.
const equative = [];
for (const [p, before] of [['kasing', '[aeioughkmnwy]'], ['kasin', '[dlrst]'], ['kasim', '[bp]'],
    ['sing', '[aeioughkmnwy]'], ['sin', '[dlrst]'], ['sim', '[bp]']]) {
    equative.push(prefix(p, 'ma', {stemStartsWith: before, stemMinLength: 3}, [[], ['adj_ma']]));
    equative.push(prefix(p, '', {stemStartsWith: before, stemMinLength: 3}, RAW_ROOT));
}
add('equative', 'kasing-', 'As … as: kasing-, kasin- or kasim- with the root of an adjective (kasingganda → maganda, ganda; kasinlaki → malaki).', equative);
simplePrefix('taga', 'taga-', 'The one who does something, or someone from a place (tagaluto → luto, taga-Maynila → Maynila).', 'taga', RAW_ROOT);
add('pang', 'pang-', 'pang- for an instrument or purpose, which merges with the root\'s first consonant (pang-araw-araw, panulat → sulat, pambansa → bansa).', [
    prefix('pang', '', {stemStartsWith: '[aeioughkmnwy]', stemMinLength: 3}, RAW_ROOT),
    prefix('pang-', '', {stemMinLength: 2}, RAW_ROOT),
    prefix('pam', '', {stemStartsWith: '[bp]', stemMinLength: 3}, RAW_ROOT),
    prefix('pam', 'b', {stemStartsWith: VOWEL, stemMinLength: 3}, RAW_ROOT),
    prefix('pam', 'p', {stemStartsWith: VOWEL, stemMinLength: 3}, RAW_ROOT),
    prefix('pan', '', {stemStartsWith: '[dlrst]', stemMinLength: 3}, RAW_ROOT),
    prefix('pan', 'd', {stemStartsWith: VOWEL, stemMinLength: 3}, RAW_ROOT),
    prefix('pan', 's', {stemStartsWith: VOWEL, stemMinLength: 3}, RAW_ROOT),
    prefix('pan', 't', {stemStartsWith: VOWEL, stemMinLength: 3}, RAW_ROOT),
]);
add('mapag', 'mapag-', 'Inclined to (mapagmahal → mahal).', [
    prefix('mapag', '', {stemStartsWith: CONSONANT, stemMinLength: 3}, RAW_ROOT),
    prefix('mapag-', '', {stemMinLength: 2}, RAW_ROOT),
]);
simplePrefix('tig', 'tig-', 'Each, with numbers (tig-isa → isa, tigdalawa → dalawa).', 'tig', RAW_ROOT);

const out = {schema: 1, conditions, wordLists: {}, transforms};
const file = join(here, 'own.json');
writeFileSync(file, formatTransforms(out));
const count = transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`${file}: ${transforms.length} transforms, ${count} rules`);
