#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/sq/sources/own.json: the Albanian deinflection rules written
// for this pack (docs/languages.md, section 14 step 2), from the paradigm
// tables below. Run from the repository root:
//
//   node languages/sq/sources/build-own.mjs
//
// The tables follow the standard description of Albanian (Tosk-based standard
// language) inflection: noun declension by gender, number, definiteness and
// case, with the loss of unstressed ë before an ending (libër → libri, motër
// → motra), the definite and oblique endings after stressed vowels (shtëpia,
// shtëpisë; babai, vëllanë) and the plural types (male, shokë, libra, miq,
// zogj, lumenj, shembuj, fshatra, mbretër); adjectives with their preposed
// article (i/e/të/së), feminine, plural and definite forms and the analytic
// comparative (më i mirë); and verb conjugation in the indicative (present,
// imperfect, aorist), subjunctive, optative, admirative and imperative,
// active and non-active (mediopassive), with the participle, the analytic
// tenses built from it or from the subjunctive (kam punuar, do të punoj, u
// bë, duke punuar), the clitics an imperative takes (hape, merre, tregoji)
// and the ablaut of the irregular verbs. No table or text is copied from a
// source; the paradigms were checked against Wiktionary's Albanian
// inflection tables.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// --- Conditions -----------------------------------------------------------------
// v, n, adj and adv are the part-of-speech tags Albanian Yomitan dictionaries
// put in their `rules` column (wiktionary-to-yomitan writes v, n, adj and adv),
// with Yomitan's definitions (n stands for np and ns), which
// tools/merge-transforms.mjs requires both rule files to share. The other
// conditions are intermediate states of a chain: a rule that leaves one also
// gives v or adj when the text may already be a headword or a dictionary's
// form-of row (të punoj → punoj; kam parë → parë → shoh), and the rules that
// continue the chain take only the state they need, never a finished v.
// The first version of this file had v, n and adj as unions of these states;
// once Yomitan's rules were read (step 3) they took Yomitan's definitions,
// which changes no deinflection of these rules.
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['np', 'ns']},
    np: {name: 'Noun plural', isDictionaryForm: true},
    ns: {name: 'Noun singular', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    adv: {name: 'Adverb', isDictionaryForm: true},
    v_sbjv: {name: 'Verb form after të or do të (subjunctive, future, conditional)', isDictionaryForm: false},
    v_aor: {name: 'Verb form after u (non-active aorist, optative, admirative)', isDictionaryForm: false},
    v_imp: {name: 'Imperative without its attached pronoun', isDictionaryForm: false},
    v_ptcp: {name: 'Participle after an auxiliary or duke, pa, për të', isDictionaryForm: false},
    adj_m: {name: 'Adjective after the article i', isDictionaryForm: false},
    adj_f: {name: 'Adjective, feminine singular (after e or së)', isDictionaryForm: false},
    adj_fobl: {name: 'Adjective after së (feminine oblique)', isDictionaryForm: false},
    adj_pl: {name: 'Adjective after the article të (plural or oblique)', isDictionaryForm: false},
    adj_cmp: {name: 'Adjective or adverb after më (comparative)', isDictionaryForm: false},
};

// Classes of language.json, and the space a stem must not contain: a suffix
// rule changes the last word only when the text is that word, so `e kam` or
// `të mira` are never read through their last word (section 14 step 2).
const ONE_WORD = '[^ ]';
const CONSONANT = '{consonant}';
// A verb stem that takes a consonant ending never ends in j: the j of punoj,
// laj and hyj belongs to the first person (punoni, hyni), so hyjni and
// punojmë are not hyj + -ni or punoj + -më.
const VC = '{verbConsonant}';
const VOWEL = '{vowel}';

// --- Transforms -------------------------------------------------------------------
const transforms = [];
const byId = new Map();
const seen = new Set();

function transform(id, name, description) {
    if (byId.has(id)) { throw new Error(`transform ${id} defined twice`); }
    const t = {id, name, description, source: 'own', rules: []};
    transforms.push(t);
    byId.set(id, t);
    return t;
}

function add(id, rule) {
    const t = byId.get(id);
    if (t === undefined) { throw new Error(`no transform ${id}`); }
    const key = `${id}\u0000${JSON.stringify(rule)}`;
    if (seen.has(key)) { return; }
    seen.add(key);
    t.rules.push(rule);
}

/** A suffix rule on one word; extra holds further stem constraints. */
function suffix(id, inflected, deinflected, conditionsIn, conditionsOut, extra = {}) {
    const rule = {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut};
    const constraints = {stemCharacters: ONE_WORD, ...extra};
    if (constraints.stemCharacters === null) { delete constraints.stemCharacters; }
    add(id, {...rule, ...constraints});
    // A verb stem that ends in the digraph gj or nj (përgjigjem, shmenjem)
    // ends in j too: the twin rules carry the digraph in the ending. Only the
    // non-active endings have them; the active verbs in -gj and -nj (dergj,
    // gjegj, regj) are rare and the twins would add 80 rules.
    if (constraints.stemEndsWith === '{verbConsonant}' && id.startsWith('np-')) {
        for (const digraph of ['gj', 'nj']) {
            const {stemEndsWith: _drop, ...rest} = constraints;
            add(id, {...rule, inflected: digraph + inflected, deinflected: digraph + deinflected, ...rest, stemMinLength: Math.max(0, (rest.stemMinLength ?? 0) - 1)});
        }
    }
}

// Prefix rules take no minimum stem: an empty remainder is never recorded
// and a one-letter one reaches no headword, so a minimum would change nothing.
function prefix(id, inflected, deinflected, conditionsIn, conditionsOut, extra = {}) {
    const {stemMinLength: _ignored, ...rest} = extra;
    add(id, {type: 'prefix', inflected, deinflected, conditionsIn, conditionsOut, ...rest});
}

function whole(id, inflected, deinflected, conditionsIn, conditionsOut) {
    add(id, {type: 'wholeWord', inflected, deinflected, conditionsIn, conditionsOut});
}

function circumfix(id, prefixes, suffixes, conditionsIn, conditionsOut, extra = {}) {
    add(id, {type: 'circumfix', prefixes, suffixes, conditionsIn, conditionsOut, stemCharacters: ONE_WORD, ...extra});
}

/**
 * The forms of an irregular verb, each mapped to its lemma. A form of four
 * letters or more is a suffix rule, so prefixed compounds share it (ndërmora →
 * ndërmarr, tërhoqi → tërheq, kundërthotë → kundërthem); a shorter one is a
 * whole-word rule, so it is never read inside another word (pa, ra, del).
 */
// The verbs whose stem is one syllable ending in a vowel (jam, kam, ha, pi,
// di, rri, fle, lë, vë, zë, bie, dua, vete) have endings that end many other
// words (dalësh is not da- + lësh), and almost no compounds: their forms are
// whole words.
const WHOLE_WORD_VERBS = new Set(['jam', 'kam', 'ha', 'pi', 'di', 'rri', 'fle', 'lë', 'vë', 'zë', 'nxë', 'përzë', 'kundërvë', 'bashkëvë', 'bie', 'dua', 'vete']);
function irregular(id, forms, lemma, conditionsIn, conditionsOut = ['v']) {
    for (const form of forms) {
        if ([...form].length >= 4 && !WHOLE_WORD_VERBS.has(lemma)) {
            // The stem before a whole form is a compound's prefix (tërhoqi
            // → tërheq). Not të, which the subjunctive and article rules read:
            // të folur would leave të flas, a form-of row of wty-sq-en, whose
            // trace (present subjunctive) would be shown. Other phrases ending
            // in a whole form (e merr → e marr) spell no headword.
            add(id, {type: 'suffix', inflected: form, deinflected: lemma, conditionsIn, conditionsOut, stemNotStartsWithText: 'të '});
        } else {
            whole(id, form, lemma, conditionsIn, conditionsOut);
        }
    }
}

// ================================================================================
// Contractions
// ================================================================================
// s' (nuk, not) and ç' (çfarë, what) are written before a verb with an
// apostrophe that separates words, so a hover on the s of s'kam would find
// nothing; the rules read the verb. The apostrophe processor writes ’ and ʼ as '.
transform('neg', "s' (not)", "The negation s' (nuk) written before a verb: s'kam → kam, s'di → di.");
prefix('neg', "s'", '', [], [], {stemMinLength: 1});
transform('what', "ç' (what)", "The interrogative ç' (çfarë) written before a verb: ç'bën → bën → bëj.");
prefix('what', "ç'", '', [], [], {stemMinLength: 1});
// The apostrophe also stands inside three words, often so in informal
// writing (Tatoeba has ç'farë 42 times, çfarë 36): ç'farë (what), ç'do (every),
// ç'ka (what). Removing ç' there would leave farë (seed), do (wants), ka (has).
for (const [form, word] of [["ç'farë", 'çfarë'], ["ç'do", 'çdo'], ["ç'ka", 'çka']]) {
    whole('what', form, word, [], []);
}

// ================================================================================
// Nouns
// ================================================================================
// Case endings on the indefinite singular (the dictionary form). Masculine:
// -i (definite nominative; indefinite genitive, dative, ablative), -in
// (definite accusative), -it (definite genitive, dative, ablative); after k,
// g, h and stressed e, i, a the vowel is u (miku, mikun, mikut; dheu, njeriu,
// kau); after stressed u, y and i the ending is -ri (gjuri, syri, kushëriri);
// stressed a and o take -i, -në, -it (babai, babanë, babait; heroi). An
// unstressed final ë drops (djalë → djali), and so does the ë of a final -ër,
// -ël, -ërr (libër → libri, vjehërr → vjehrri). Feminine: -a (definite
// nominative), -n (accusative), -s (genitive, dative, ablative), -e
// (indefinite genitive, dative, ablative); after stressed vowels -ja, -në,
// -së, -je (kalaja, kalanë, kalasë, kalaje; shtëpia, shtëpinë, shtëpisë,
// shtëpie); nouns in -e take -ja (lule → lulja) and nouns in -je keep their j
// (pyetje → pyetja, pyetjeje).
const N = ['ns'];
const NPL = ['np'];
// A plural case ending leaves the indefinite plural, which for many nouns is
// also the singular (qen, muaj, pije, shtëpi), so its output is n (np and ns).
const NPL_OUT = ['n'];

transform('n-def-sg-m', 'definite (masculine) / indefinite oblique',
    'Masculine singular: the definite nominative, or the indefinite genitive, dative or ablative (mal → mali, mik → miku, djalë → djali, libër → libri).');
suffix('n-def-sg-m', 'i', '', [], N, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('n-def-sg-m', 'ri', 'ër', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-sg-m', 'rri', 'ërr', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-sg-m', 'i', '', [], N, {stemMinLength: 2, stemEndsWith: '[ao]'});
suffix('n-def-sg-m', 'u', '', [], N, {stemMinLength: 2, stemEndsWith: '[kgheia]'});
suffix('n-def-sg-m', 'ri', '', [], N, {stemMinLength: 2, stemEndsWith: '[uyea]'});
suffix('n-def-sg-m', 'ri', '', [], N, {stemMinLength: 3, stemEndsWith: '[i]'});
suffix('n-def-sg-m', 'oi', 'ua', [], N, {stemMinLength: 1});
suffix('n-def-sg-m', 'mi', 'ëm', [], N, {stemMinLength: 2, stemEndsWith: '[zs]'});
suffix('n-def-sg-m', 'ni', '', [], N, {stemMinLength: 2, stemEndsWith: '[youe]'});
suffix('n-def-sg-m', 'uni', 'un', [], N, {stemMinLength: 2});

transform('n-def-acc-m', 'definite accusative (masculine)',
    'Masculine singular definite accusative (mal → malin, mik → mikun, djalë → djalin, libër → librin, vëlla → vëllanë).');
suffix('n-def-acc-m', 'in', '', [], N, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('n-def-acc-m', 'rin', 'ër', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-acc-m', 'rrin', 'ërr', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-acc-m', 'in', '', [], N, {stemMinLength: 2, stemEndsWith: '[o]'});
suffix('n-def-acc-m', 'në', '', [], N, {stemMinLength: 2, stemEndsWith: '[a]'});
suffix('n-def-acc-m', 'un', '', [], N, {stemMinLength: 2, stemEndsWith: '[kgheia]'});
suffix('n-def-acc-m', 'rin', '', [], N, {stemMinLength: 2, stemEndsWith: '[uyea]'});
suffix('n-def-acc-m', 'rin', '', [], N, {stemMinLength: 3, stemEndsWith: '[i]'});
suffix('n-def-acc-m', 'oin', 'ua', [], N, {stemMinLength: 1});
suffix('n-def-acc-m', 'min', 'ëm', [], N, {stemMinLength: 2, stemEndsWith: '[zs]'});
suffix('n-def-acc-m', 'nin', '', [], N, {stemMinLength: 2, stemEndsWith: '[youe]'});

transform('n-def-obl-m', 'definite genitive/dative/ablative (masculine)',
    'Masculine singular definite genitive, dative or ablative (mal → malit, mik → mikut, djalë → djalit, libër → librit).');
suffix('n-def-obl-m', 'it', '', [], N, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('n-def-obl-m', 'rit', 'ër', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-obl-m', 'rrit', 'ërr', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-obl-m', 'it', '', [], N, {stemMinLength: 2, stemEndsWith: '[ao]'});
suffix('n-def-obl-m', 'ut', '', [], N, {stemMinLength: 2, stemEndsWith: '[kgheia]'});
suffix('n-def-obl-m', 'rit', '', [], N, {stemMinLength: 2, stemEndsWith: '[uyea]'});
suffix('n-def-obl-m', 'rit', '', [], N, {stemMinLength: 3, stemEndsWith: '[i]'});
suffix('n-def-obl-m', 'oit', 'ua', [], N, {stemMinLength: 1});
suffix('n-def-obl-m', 'mit', 'ëm', [], N, {stemMinLength: 2, stemEndsWith: '[zs]'});
suffix('n-def-obl-m', 'nit', '', [], N, {stemMinLength: 2, stemEndsWith: '[youe]'});

// Masculine nouns in unstressed -ë drop it before -i, -in, -it (djalë →
// djali, djalin, djalit). They are a closed set beside the 1,700 feminine
// nouns in -ë, whose -in, -it forms do not exist, so a rule for every stem in
// -ë read arrin as arrë and fermit as fermë; the common ones are listed. zë
// (voice) takes -ri (zëri). The colloquial babi and mami (dad, mum) decline
// so too (babin, mamit).
for (const noun of ['djalë', 'kalë', 'lumë', 'ujë', 'gjumë', 'burrë', 'brumë', 'djathë', 'gjalpë', 'drithë', 'dhjamë',
    'mjaltë', 'grurë', 'dyllë', 'ballë', 'vrerë', 'lëmë', 'atë', 'qirë', 'babë', 'mamë']) {
    const stem = noun.slice(0, -1);
    suffix('n-def-sg-m', `${stem}i`, noun, [], N);
    suffix('n-def-acc-m', `${stem}in`, noun, [], N);
    suffix('n-def-obl-m', `${stem}it`, noun, [], N);
}
whole('n-def-sg-m', 'zëri', 'zë', [], N);
whole('n-def-acc-m', 'zërin', 'zë', [], N);
whole('n-def-obl-m', 'zërit', 'zë', [], N);

transform('n-def-nom-f', 'definite (feminine)',
    'Feminine singular definite nominative (vajzë → vajza, motër → motra, shtëpi → shtëpia, lule → lulja, pyetje → pyetja, kala → kalaja).');
suffix('n-def-nom-f', 'a', 'ë', [], N, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('n-def-nom-f', 'ra', 'ër', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-nom-f', 'rra', 'ërr', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-nom-f', 'la', 'ël', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
// shtëpia → shtëpi; a stem of three letters at least, so mia (e mia, mine)
// is not mi (mouse).
suffix('n-def-nom-f', 'a', '', [], N, {stemMinLength: 3, stemEndsWith: '[i]'});
suffix('n-def-nom-f', 'ja', 'e', [], N, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('n-def-nom-f', 'a', 'e', [], N, {stemMinLength: 2, stemEndsWith: '[ji]'});
suffix('n-def-nom-f', 'ja', '', [], N, {stemMinLength: 2, stemEndsWith: '[aeouyë]'});
// The deinflector tries the longest ending first, and the file order decides
// only between rules at one ending (docs/languages.md 7.4). Where a verb
// ending is longer than the noun ending that reads a word, the verb came
// first although the dictionary names both: jeta (jes, aorist), lidhja (lidh,
// imperfect), pika (pi, admirative), tokën (tok, aorist). These rules make the
// deinflections of the rules above (a → ë after t or k, a → e after j,
// n → '' after ë) at the verb's ending, where nouns come first.
suffix('n-def-nom-f', 'ta', 'të', [], N, {stemMinLength: 1});
suffix('n-def-nom-f', 'ka', 'kë', [], N, {stemMinLength: 1});
suffix('n-def-nom-f', 'ja', 'je', [], N, {stemMinLength: 2, stemEndsWith: CONSONANT});
// e majta (the left) before the aorist in -jta (mbajta, I held).
suffix('n-def-nom-f', 'jta', 'jtë', [], N, {stemMinLength: 1});
// Not after o: the imperfect of the -oj verbs (kaloja, I was passing) is far
// more common than the nouns in -ojë (kalojë, passageway).
suffix('n-def-nom-f', 'ja', 'jë', [], N, {stemMinLength: 1, stemEndsWith: '[aeuyë]'});
// Whole verb forms are tried first of all; these are more often a noun in
// text: vija (the line, lines; vij, vë: I was coming, putting), bija (the
// daughter; bie: I was falling), goditja (the blow; godas) and zgjidhja (the
// solution; zgjedh: I was choosing).
for (const [form, noun] of [['vija', 'vijë'], ['bija', 'bijë'], ['goditja', 'goditje'], ['zgjidhja', 'zgjidhje'], ['leja', 'leje']]) {
    whole('n-def-nom-f', form, noun, [], N);
}

transform('n-def-acc-f', 'definite accusative (feminine)',
    'Feminine singular definite accusative (vajzë → vajzën, lule → lulen, motër → motrën, shtëpi → shtëpinë, grua → gruan).');
suffix('n-def-acc-f', 'n', '', [], N, {stemMinLength: 2, stemEndsWith: '[ëeao]'});
suffix('n-def-acc-f', 'ën', '', [], N, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('n-def-acc-f', 'rën', 'ër', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-acc-f', 'rrën', 'ërr', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-acc-f', 'lën', 'ël', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-acc-f', 'në', '', [], N, {stemMinLength: 2, stemEndsWith: '[aeiouy]'});
suffix('n-def-acc-f', 'ën', 'ë', [], N, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('n-def-acc-f', 'jtën', 'jtë', [], N, {stemMinLength: 1});

transform('n-def-obl-f', 'definite genitive/dative/ablative (feminine)',
    'Feminine singular definite genitive, dative or ablative (vajzë → vajzës, lule → lules, motër → motrës, shtëpi → shtëpisë, grua → gruas).');
suffix('n-def-obl-f', 's', '', [], N, {stemMinLength: 2, stemEndsWith: '[ëeao]'});
suffix('n-def-obl-f', 'ës', '', [], N, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('n-def-obl-f', 'rës', 'ër', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-obl-f', 'rrës', 'ërr', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-obl-f', 'lës', 'ël', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-def-obl-f', 'së', '', [], N, {stemMinLength: 2, stemEndsWith: '[aeiouy]'});

transform('n-indef-obl-f', 'indefinite genitive/dative/ablative (feminine)',
    'Feminine singular indefinite genitive, dative or ablative (vajzë → vajze, motër → motre, shtëpi → shtëpie, lule → luleje).');
suffix('n-indef-obl-f', 'e', 'ë', [], N, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('n-indef-obl-f', 're', 'ër', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-indef-obl-f', 'rre', 'ërr', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-indef-obl-f', 'le', 'ël', [], N, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('n-indef-obl-f', 'e', '', [], N, {stemMinLength: 2, stemEndsWith: '[i]'});
suffix('n-indef-obl-f', 'je', '', [], N, {stemMinLength: 2, stemEndsWith: VOWEL});
// mije (of a thousand; also mijë written without ë) is mijë, which wty-sq-en
// lists without a part-of-speech tag: only a rule with empty conditions
// reaches an untagged row (docs/languages.md 9.4), and this one comes before
// the -je and plural readings mi (mouse) and mill.
whole('n-indef-obl-f', 'mije', 'mijë', [], []);
suffix('n-indef-obl-f', 'ke', 'kë', [], N, {stemMinLength: 1});

// Plural case endings leave the indefinite plural (n_pl): -t after a vowel, r
// or j (malet, vajzat, shokët, duart, kuajt), -të after other consonants and
// stressed vowels (miqtë, djemtë, qentë, sytë, shtëpitë), -it after s, z and r
// (nxënësit, njerëzit, vëllezërit); -ve in the genitive, dative and ablative
// (maleve), -vet in the older definite oblique (djemvet); -sh in the
// indefinite ablative (malesh, miqsh), -ish after s, z and r (nxënësish).
transform('n-def-pl', 'definite plural',
    'Plural definite nominative or accusative (male → malet, vajza → vajzat, miq → miqtë, shtëpi → shtëpitë, njerëz → njerëzit).');
suffix('n-def-pl', 't', '', [], NPL_OUT, {stemMinLength: 2, stemEndsWith: '[eaëjou]'});
suffix('n-def-pl', 't', '', [], NPL_OUT, {stemMinLength: 4, stemEndsWith: '[r]'});
suffix('n-def-pl', 'të', '', [], NPL_OUT, {stemMinLength: 2});
suffix('n-def-pl', 'it', '', [], NPL_OUT, {stemMinLength: 2, stemEndsWith: '[szr]'});

transform('n-obl-pl', 'plural genitive/dative/ablative',
    'Plural genitive, dative or ablative, definite or indefinite (male → maleve, vajza → vajzave, miq → miqve).');
suffix('n-obl-pl', 've', '', [], NPL_OUT, {stemMinLength: 2});
suffix('n-obl-pl', 'vet', '', [], NPL_OUT, {stemMinLength: 2});

transform('n-abl-pl', 'indefinite ablative plural',
    'Plural indefinite ablative (male → malesh, vajza → vajzash, miq → miqsh, nxënës → nxënësish).');
suffix('n-abl-pl', 'sh', '', [], NPL_OUT, {stemMinLength: 2});
suffix('n-abl-pl', 'ish', '', [], NPL_OUT, {stemMinLength: 2, stemEndsWith: '[szr]'});

// The indefinite plural from the singular. Many plurals equal the singular
// (qen, muaj, sy, mësues, shtëpi, lule, fjalë), which n_pl reaches as it is.
transform('n-pl', 'plural',
    'Indefinite plural (mal → male, shok → shokë, gisht → gishta, vajzë → vajza, libër → libra, mik → miq, zog → zogj, lumë → lumenj, shembull → shembuj, fshat → fshatra, mbret → mbretër).');
for (const [inflected, deinflected, extra] of [
    ['e', '', {stemMinLength: 2, stemEndsWith: CONSONANT}],
    ['ë', '', {stemMinLength: 2, stemEndsWith: CONSONANT}],
    // The feminine plural in -a (kokë → koka) before the masculine one
    // (gisht → gishta): where both are headwords (kokat: kokë, kok) the
    // feminine is the common reading.
    ['a', 'ë', {stemMinLength: 2, stemEndsWith: CONSONANT}],
    ['a', '', {stemMinLength: 2, stemEndsWith: CONSONANT}],
    ['ra', 'ër', {stemMinLength: 1, stemEndsWith: CONSONANT}],
    ['rra', 'ërr', {stemMinLength: 1, stemEndsWith: CONSONANT}],
    ['la', 'ël', {stemMinLength: 1, stemEndsWith: CONSONANT}],
    ['ëra', 'ër', {stemMinLength: 2, stemEndsWith: CONSONANT}],
    ['ra', '', {stemMinLength: 3}],
    ['ër', '', {stemMinLength: 2, stemEndsWith: CONSONANT}],
    ['q', 'k', {stemMinLength: 1}],
    ['qe', 'k', {stemMinLength: 1}],
    ['gje', 'g', {stemMinLength: 1}],
    ['na', '', {stemMinLength: 2}],
    ['ëra', '', {stemMinLength: 2}],
    ['ma', 'ëm', {stemMinLength: 2, stemEndsWith: CONSONANT}],
    ['eq', 'ak', {stemMinLength: 1}],
    ['gj', 'g', {stemMinLength: 1}],
    ['nj', '', {stemMinLength: 2, stemEndsWith: '[oiu]'}],
    ['enj', 'ë', {stemMinLength: 2}],
    ['inj', '', {stemMinLength: 2}],
    ['ërinj', '', {stemMinLength: 2}],
    ['onj', 'ua', {stemMinLength: 1}],
    ['një', '', {stemMinLength: 2}],
    ['uj', 'ull', {stemMinLength: 1}],
    ['aj', 'all', {stemMinLength: 2}],
    ['j', 'll', {stemMinLength: 3, stemEndsWith: '[e]'}],
    ['je', 'll', {stemMinLength: 2, stemEndsWith: '[iy]'}],
    ['uj', 'ul', {stemMinLength: 1}],
    ['llarë', '', {stemMinLength: 2}],
    ['allarë', 'ë', {stemMinLength: 2}],
    ['ezër', 'a', {stemMinLength: 2}],
]) {
    suffix('n-pl', inflected, deinflected, NPL, N, extra);
}
// zotërinj is the plural of zotëri (gentleman, sir) more often than of zot
// (lord), whose -ërinj rule is tried first; male (mountains) is the plural of
// mal more often than the oblique of malë.
whole('n-pl', 'zotërinj', 'zotëri', NPL, N);
whole('n-pl', 'male', 'mal', NPL, N);
// Ties wty-sq-en's rows leave open, which the rule order decided the other
// way: varre (graves) before the oblique of varrë (wound), ligjet (the laws)
// before ligje (dirge).
whole('n-pl', 'varre', 'varr', NPL, N);
// vjetë (years) only as a whole word: no compound ends in it.
whole('n-pl', 'vjetë', 'vit', NPL, N);
// mijëra (thousands), qindra (hundreds), dhjetëra (tens) are the plurals of
// the untagged numerals: no conditions out.
for (const [plural, numeral] of [['mijëra', 'mijë'], ['qindra', 'qind'], ['dhjetëra', 'dhjetë']]) {
    whole('n-pl', plural, numeral, NPL, []);
}
whole('n-def-pl', 'ligjet', 'ligj', [], N);
// Plurals that change the stem.
for (const [plural, singular] of [
    ['djem', 'djalë'], ['kuaj', 'kalë'], ['duar', 'dorë'], ['dyer', 'derë'], ['net', 'natë'], ['netë', 'natë'],
    ['gra', 'grua'], ['njerëz', 'njeri'], ['desh', 'dash'], ['qe', 'ka'], ['vjet', 'vit'], ['etër', 'atë'],
    ['bij', 'bir'], ['thonj', 'thua'], ['dhen', 'dele'], ['rrathë', 'rreth'],
    // The plural of a masculine noun in -ë, so its trace is plural, not the
    // feminine definite -a, which reaches burrë first otherwise.
    ['burra', 'burrë'],
]) {
    if ([...plural].length >= 4) {
        suffix('n-pl', plural, singular, NPL, N);
    } else {
        whole('n-pl', plural, singular, NPL, N);
    }
}

// Verbal nouns in -im (bashkim, kthim, mashtrim) read as their verb, also in
// their case forms (mashtrimi → mashtrim → mashtroj). Added after Yomitan's
// rules were read: its nominalization transform makes the same deinflection
// without a minimum stem, which also read krim, dim and lim as verbs.
transform('vn', 'verbal noun (-im)', 'A verbal noun in -im read as its verb (bashkim → bashkoj, kthim → kthej, përkthim → përkthej).');
suffix('vn', 'im', 'oj', ['ns'], ['v'], {stemMinLength: 3});
suffix('vn', 'im', 'ej', ['ns'], ['v'], {stemMinLength: 3});

// ================================================================================
// Adjectives
// ================================================================================
// An articulated adjective follows its article as a separate word: i
// (masculine singular), e (feminine singular; also after a noun in the
// accusative), të (plural, and singular oblique cases), së (feminine oblique
// after a definite noun). The comparative and superlative put më before the
// article (më i mirë, më i miri).
// Ordinals whose form differs from the cardinal, alone or after the article
// (i katërt, e katërta, i pestë). The cardinals are untagged in wty-sq-en, so
// the output has no conditions; conditionsIn adj lets the rule follow the
// article. katërt alone read as the plural kat (floor) before.
transform('ord', 'ordinal', 'An ordinal number: i katërt, e katërta → katër (four); i pestë, e pesta → pesë (five).');
for (const [form, cardinal] of [['katërt', 'katër'], ['katërta', 'katër'], ['katërtit', 'katër'], ['katërtin', 'katër'],
    ['katërtës', 'katër'], ['katërtën', 'katër'], ['pestë', 'pesë'], ['pesta', 'pesë']]) {
    whole('ord', form, cardinal, ['adj'], []);
}

transform('cmp', 'comparative (më)', 'The comparative or superlative më before an adjective or a gradable adverb: më i mirë → mirë, më shpejt → shpejt, më vonë → vonë.');
// Not before a digit: më 2 shkurt is on 2 February (wty-sq-en has a row 2 →
// horizontal).
prefix('cmp', 'më ', '', [], ['adj', 'adj_cmp'], {stemMinLength: 1, stemNotStartsWith: '[0-9]'});
// Adverbs only from a list of gradable ones and those in -isht: më is also
// a preposition (deri më sot, deri më tani: until today, until now), which
// an open rule read as the comparative of sot and tani.
for (const adverb of ['vonë', 'herët', 'shpejt', 'ngadalë', 'shpesh', 'rrallë', 'shumë', 'pak', 'tepër', 'mirë', 'keq',
    'lart', 'lartë', 'poshtë', 'sipër', 'afër', 'pranë', 'larg', 'tej', 'tutje', 'përpara', 'prapa', 'mbrapa', 'pas',
    'parë', 'thellë', 'gjatë', 'fort', 'lehtë', 'rëndë', 'qartë', 'drejt', 'thjesht', 'mjaft', 'bukur', 'butë', 'saktë',
    'brenda', 'jashtë']) {
    whole('cmp', `më ${adverb}`, adverb, [], ['adv']);
}
circumfix('cmp', [['më ', '']], [['isht', 'isht']], [], ['adv']);

transform('art', 'adjective article (i/e/të/së)', 'The article an adjective takes: i mirë, e mirë, të mira, së madhe → mirë, madh.');
prefix('art', 'i ', '', ['adj_cmp'], ['adj', 'adj_m'], {stemMinLength: 1});
prefix('art', 'e ', '', ['adj_cmp'], ['adj', 'adj_f'], {stemMinLength: 1});
prefix('art', 'të ', '', ['adj_cmp'], ['adj', 'adj_pl'], {stemMinLength: 1});
prefix('art', 'së ', '', ['adj_cmp'], ['adj', 'adj_f', 'adj_fobl'], {stemMinLength: 1});
// të re (new, feminine after a noun: një punë të re) before the subjunctive
// of re, which wty-sq-en lists as a form of bie (to fall); the article and the
// feminine ending would take two steps against the subjunctive's one.
whole('art', 'të re', 'ri', ['adj_cmp'], ['adj']);

const A = ['adj'];
transform('adj-f', 'feminine', 'Feminine singular, also the feminine plural of adjectives without an article (madh → madhe, keq → keqe, ndryshëm → ndryshme, shqiptar → shqiptare, zi → zezë).');
suffix('adj-f', 'e', '', ['adj_f', 'adj_pl'], A, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('adj-f', 'me', 'ëm', ['adj_f', 'adj_pl'], A, {stemMinLength: 2});
suffix('adj-f', 'e', '', ['adj_f', 'adj_pl'], A, {stemMinLength: 2, stemEndsWith: '[i]'});
suffix('adj-f', 'zezë', 'zi', ['adj_f'], A);
whole('adj-f', 're', 'ri', ['adj_f'], A);
// kuqe (red) before the aorist (2sg) of the verb kuq (to redden), which
// wty-sq-en also lists: the lemma is the same, the trace would be the verb's.
whole('adj-f', 'kuqe', 'kuq', ['adj_f'], A);

transform('adj-pl-f', 'feminine plural', 'Feminine plural (mirë → mira, bukur → bukura, vogël → vogla, vjetër → vjetra, madh → mëdha, ri → reja, keq → këqija, zi → zeza).');
suffix('adj-pl-f', 'a', 'ë', ['adj_pl'], A, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('adj-pl-f', 'a', '', ['adj_pl'], A, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('adj-pl-f', 'ra', 'ër', ['adj_pl'], A, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('adj-pl-f', 'la', 'ël', ['adj_pl'], A, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('adj-pl-f', 'mëdha', 'madh', ['adj_pl'], A);
suffix('adj-pl-f', 'këqija', 'keq', ['adj_pl'], A);
suffix('adj-pl-f', 'zeza', 'zi', ['adj_pl'], A);
whole('adj-pl-f', 'reja', 'ri', ['adj_pl'], A);

transform('adj-pl-m', 'masculine plural', 'Masculine plural (shqiptar → shqiptarë, madh → mëdhenj, vogël → vegjël, ri → rinj, keq → këqij, zi → zinj); most articulated adjectives keep their singular (të mirë).');
suffix('adj-pl-m', 'ë', '', ['adj_pl'], A, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('adj-pl-m', 'mëdhenj', 'madh', ['adj_pl'], A);
suffix('adj-pl-m', 'vegjël', 'vogël', ['adj_pl'], A);
suffix('adj-pl-m', 'këqij', 'keq', ['adj_pl'], A);
whole('adj-pl-m', 'rinj', 'ri', ['adj_pl'], A);
whole('adj-pl-m', 'zinj', 'zi', ['adj_pl'], A);
whole('adj-pl-m', 'ligj', 'lig', ['adj_pl'], A);

// Definite adjectives (i miri, e mira, të mirët), used as nouns and in the
// superlative (më i miri).
transform('adj-def-m', 'definite (masculine)', 'Masculine definite adjective (i miri, të mirin, të mirit → mirë; i madhi → madh; i riu → ri).');
// The nominative follows i (i miri), the accusative të (të mirin); the
// genitive, dative and ablative (të mirit) are read after i only, since after
// të the same ending is far more often a genitive noun (të lumit, të shtetit).
for (const [end, after] of [['i', ['adj_m']], ['in', ['adj_m', 'adj_pl']], ['it', ['adj_m']]]) {
    suffix('adj-def-m', end, '', after, A, {stemMinLength: 2, stemEndsWith: CONSONANT});
    suffix('adj-def-m', end, 'ë', after, A, {stemMinLength: 2, stemEndsWith: CONSONANT});
    suffix('adj-def-m', `r${end}`, 'ër', after, A, {stemMinLength: 1, stemEndsWith: CONSONANT});
    suffix('adj-def-m', `l${end}`, 'ël', after, A, {stemMinLength: 1, stemEndsWith: CONSONANT});
    // Adjectives in -ëm lose the ë: i vetmi, të vetmin, të vetmit → vetëm;
    // i sotmi → sotëm; i ndershmi → ndershëm.
    suffix('adj-def-m', `m${end}`, 'ëm', after, A, {stemMinLength: 2, stemEndsWith: CONSONANT});
}
for (const end of ['u', 'un', 'ut']) {
    suffix('adj-def-m', end, '', ['adj_m', 'adj_pl'], A, {stemMinLength: 1, stemEndsWith: '[ikgh]'});
}
whole('adj-def-m', 'riu', 'ri', ['adj_m'], A);

transform('adj-def-f', 'definite (feminine)', 'Feminine definite adjective (e mira, të mirën, të mirës → mirë; e madhja, të madhen → madh; e reja → ri).');
suffix('adj-def-f', 'a', 'ë', ['adj_f', 'adj_pl'], A, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('adj-def-f', 'a', '', ['adj_f'], A, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('adj-def-f', 'ra', 'ër', ['adj_f', 'adj_pl'], A, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('adj-def-f', 'la', 'ël', ['adj_f', 'adj_pl'], A, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('adj-def-f', 'ja', 'e', ['adj_f', 'adj_pl'], ['adj', 'adj_f'], {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('adj-def-f', 'n', '', ['adj_f', 'adj_pl'], ['adj', 'adj_f'], {stemMinLength: 2, stemEndsWith: '[ëe]'});
// The oblique case (së mirës) is read only after së: after e and të the same
// ending is far more often a genitive noun (e matematikës, të fizikës).
suffix('adj-def-f', 's', '', ['adj_fobl'], ['adj', 'adj_f'], {stemMinLength: 2, stemEndsWith: '[ëe]'});
suffix('adj-def-f', 'rën', 'ër', ['adj_f', 'adj_pl'], A, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('adj-def-f', 'rës', 'ër', ['adj_fobl'], A, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('adj-def-f', 'lën', 'ël', ['adj_f', 'adj_pl'], A, {stemMinLength: 1, stemEndsWith: CONSONANT});
suffix('adj-def-f', 'lës', 'ël', ['adj_fobl'], A, {stemMinLength: 1, stemEndsWith: CONSONANT});
whole('adj-def-f', 'reja', 'ri', ['adj_f'], A);

transform('adj-def-pl', 'definite plural', 'Plural definite adjective (të mirët, të mirat, të mirëve, të mirave → mirë; të mëdhenjtë → madh).');
suffix('adj-def-pl', 't', '', ['adj_pl'], ['adj', 'adj_pl'], {stemMinLength: 2, stemEndsWith: '[aëe]'});
suffix('adj-def-pl', 'të', '', ['adj_pl'], ['adj', 'adj_pl'], {stemMinLength: 2, stemEndsWith: CONSONANT});
// të mëdhatë (the big ones, fem.): -të after the stressed -a of mëdha.
whole('adj-def-pl', 'mëdhatë', 'madh', ['adj_pl'], A);
// -it is the definite plural of adjectives in -r (të bukurit, të varfërit,
// të vdekurit); after other consonants të ...-it is a genitive noun (të lumit).
suffix('adj-def-pl', 'it', '', ['adj_pl'], ['adj', 'adj_pl'], {stemMinLength: 2, stemEndsWith: '[r]'});
suffix('adj-def-pl', 've', '', ['adj_pl'], ['adj', 'adj_pl'], {stemMinLength: 2, stemEndsWith: '[aë]'});
// and after a consonant: të varfërve, të rinjve, të huajve, të vdekurve.
suffix('adj-def-pl', 've', '', ['adj_pl'], ['adj', 'adj_pl'], {stemMinLength: 3, stemEndsWith: CONSONANT});

// ================================================================================
// Verbs: analytic forms
// ================================================================================
// The tenses built with an auxiliary or a particle. Each removes the word
// before the verb and leaves the form the construction takes: the
// subjunctive after të and do të (future, conditional), the participle after
// kam/kisha/pata (perfect, pluperfect, past anterior), jam/isha (non-active
// perfect, pluperfect), paça, paskam, paskësha, qenkam, qofsha (perfect
// optative and admirative), duke (gerund), pa (privative) and për të
// (infinitive), and after u the non-active aorist, optative and admirative.
const SB = ['v_sbjv'];
const PT = ['v_ptcp'];
const AO = ['v_aor'];
const IMP = ['v_imp'];
const V = ['v'];
// The outputs that leave a state also carry v (see Conditions).
const SB_OUT = ['v', 'v_sbjv'];
// A participle is never a verb's dictionary form, so after an auxiliary only
// the participle rules continue: neither a verb row spelled like a finite form
// (do të jetë lëvizja: lëvizja is also the imperfect of lëviz) nor an
// adjective spelled like the participle (për të marrë: i marrë, mad) matches.
const PT_OUT = ['v_ptcp'];
const AO_OUT = ['v', 'v_aor'];
const IMP_OUT = ['v', 'v_imp'];

transform('fut', 'future/conditional (do të)', 'do të before the subjunctive (future: do të punoj) or the imperfect (conditional: do të punoja); do ta and do t\'i carry the pronoun e or i.');
for (const p of ['do të ', 'do ta ', "do t'i ", "do t'ia "]) { prefix('fut', p, '', [], SB_OUT, {stemMinLength: 1}); }

transform('sbjv', 'subjunctive (të)', 'të before the present or imperfect subjunctive (të punoj, të punosh, të punonte); ta and t\'i carry the pronoun e or i.');
for (const p of ['të ', 'ta ', "t'i ", "t'ia ", "t'u "]) { prefix('sbjv', p, '', [], SB_OUT, {stemMinLength: 1}); }

const auxiliaries = [
    ['perf', 'perfect', 'kam', [['kam', '1sg'], ['ke', '2sg'], ['ka', '3sg'], ['kemi', '1pl'], ['keni', '2pl'], ['kanë', '3pl']], 'kam punuar'],
    ['perf-sbjv', 'perfect subjunctive', 'të kem', [['kem', '1sg'], ['kesh', '2sg'], ['ketë', '3sg'], ['kenë', '3pl']], 'të kem punuar'],
    ['plup', 'pluperfect', 'kisha', [['kisha', '1sg'], ['kishe', '2sg'], ['kishte', '3sg'], ['kishim', '1pl'], ['kishit', '2pl'], ['kishin', '3pl']], 'kisha punuar'],
    ['pant', 'past anterior', 'pata', [['pata', '1sg'], ['pate', '2sg'], ['pati', '3sg'], ['patëm', '1pl'], ['patët', '2pl'], ['patën', '3pl']], 'pata punuar'],
    ['np-perf', 'non-active perfect', 'jam', [['jam', '1sg'], ['je', '2sg'], ['është', '3sg'], ['jemi', '1pl'], ['jeni', '2pl'], ['janë', '3pl']], 'është bërë'],
    ['np-perf-sbjv', 'non-active perfect subjunctive', 'të jem', [['jem', '1sg'], ['jesh', '2sg'], ['jetë', '3sg'], ['jenë', '3pl']], 'të jetë bërë'],
    ['np-plup', 'non-active pluperfect', 'isha', [['isha', '1sg'], ['ishe', '2sg'], ['ishte', '3sg'], ['ishim', '1pl'], ['ishit', '2pl'], ['ishin', '3pl']], 'ishte bërë'],
    ['opt-perf', 'perfect optative', 'paça', [['paça', '1sg'], ['paç', '2sg'], ['pastë', '3sg'], ['paçim', '1pl'], ['paçi', '2pl'], ['paçit', '2pl'], ['paçin', '3pl']], 'paça punuar'],
    ['np-opt-perf', 'non-active perfect optative', 'qofsha', [['qofsha', '1sg'], ['qofsh', '2sg'], ['qoftë', '3sg'], ['qofshim', '1pl'], ['qofshi', '2pl'], ['qofshit', '2pl'], ['qofshin', '3pl']], 'qoftë bërë'],
    ['adm-perf', 'perfect admirative', 'paskam', [['paskam', '1sg'], ['paske', '2sg'], ['paska', '3sg'], ['paskemi', '1pl'], ['paskeni', '2pl'], ['paskan', '3pl']], 'paska punuar'],
    ['adm-plup', 'pluperfect admirative', 'paskësha', [['paskësha', '1sg'], ['paskëshe', '2sg'], ['paskësh', '3sg'], ['paskëshim', '1pl'], ['paskëshit', '2pl'], ['paskëshin', '3pl']], 'paskësh punuar'],
    ['np-adm-perf', 'non-active perfect admirative', 'qenkam', [['qenkam', '1sg'], ['qenke', '2sg'], ['qenka', '3sg'], ['qenkemi', '1pl'], ['qenkeni', '2pl'], ['qenkan', '3pl']], 'qenka bërë'],
    ['np-adm-plup', 'non-active pluperfect admirative', 'qenkësha', [['qenkësha', '1sg'], ['qenkëshe', '2sg'], ['qenkësh', '3sg'], ['qenkëshim', '1pl'], ['qenkëshit', '2pl'], ['qenkëshin', '3pl']], 'qenkësh bërë'],
];
for (const [id, name, aux, forms, example] of auxiliaries) {
    for (const [form, person] of forms) {
        const tid = `${id}-${person}`;
        if (!byId.has(tid)) {
            transform(tid, `${name} (${person})`, `The ${name} with ${aux}, ${person} (${example}): the auxiliary ${form} before the participle.`);
        }
        prefix(tid, `${form} `, '', SB, PT_OUT, {stemMinLength: 2});
    }
}
transform('ger', 'gerund (duke)', 'duke before the participle (duke punuar, duke u larë, duke pasë punuar).');
for (const p of ['duke ', 'duke u ', 'duke pasë ', 'duke qenë ', 'duke u pasë ']) { prefix('ger', p, '', [], PT_OUT, {stemMinLength: 2}); }
transform('priv', 'privative (pa)', 'pa before the participle (pa folur, pa u larë).');
for (const p of ['pa ', 'pa u ']) { prefix('priv', p, '', [], PT_OUT, {stemMinLength: 2}); }
transform('inf', 'infinitive (për të)', "për të before the participle (për të punuar), për t'u in the non-active (për t'u larë).");
for (const p of ['për të ', "për t'u "]) { prefix('inf', p, '', [], PT_OUT, {stemMinLength: 2}); }
transform('np-u', 'non-active (u)', 'u before the aorist, optative or admirative of the non-active (u bë, u largova, u bëfsha, u bëka).');
prefix('np-u', 'u ', '', [], AO_OUT, {stemMinLength: 1});

// The non-active lemma (-hem, -em) of the forms built with u or with a
// non-active auxiliary, where a dictionary lists the mediopassive verb:
// u largova, u largua, është larguar → largohem; u ul, është ulur → ulem.
transform('np-lemma', 'non-active', 'A non-active form read as the mediopassive verb a dictionary lists (u largua → largohem, u ul → ulem, është kthyer → kthehem).');
// The third person singular in -ua and -ye is non-active by its form, so the
// stem alone gives the mediopassive verb too (largua → largohem, kthye →
// kthehem); other stems give it only after u (u nda → ndahem).
for (const [inflected, deinflected] of [['ua', 'ohem'], ['ye', 'ehem']]) {
    suffix('np-lemma', inflected, deinflected, AO, V, {stemMinLength: 1});
}
circumfix('np-lemma', [['u ', '']], [['ova', 'ohem'], ['ove', 'ohem'], ['oi', 'ohem'], ['ua', 'ohem'], ['uam', 'ohem'], ['uat', 'ohem'], ['uan', 'ohem']],
    [], V, {stemMinLength: 1});
circumfix('np-lemma', [['u ', '']], [['eva', 'ehem'], ['eve', 'ehem'], ['eu', 'ehem'], ['ye', 'ehem'], ['yem', 'ehem'], ['yet', 'ehem'], ['yen', 'ehem']],
    [], V, {stemMinLength: 1});
circumfix('np-lemma', [['u ', '']], [['iva', 'ihem'], ['ive', 'ihem'], ['iu', 'ihem'], ['i', 'ihem'], ['imë', 'ihem'], ['itë', 'ihem'], ['inë', 'ihem']],
    [], V, {stemMinLength: 1});
circumfix('np-lemma', [['u ', '']], [['ava', 'ahem'], ['ave', 'ahem'], ['au', 'ahem'], ['a', 'ahem'], ['amë', 'ahem'], ['atë', 'ahem'], ['anë', 'ahem']],
    [], V, {stemMinLength: 1});
circumfix('np-lemma', [['u ', '']], [['a', 'em'], ['e', 'em'], ['i', 'em'], ['u', 'em'], ['', 'em'], ['ëm', 'em'], ['ët', 'em'], ['ën', 'em']],
    [], V, {stemMinLength: 2, stemEndsWith: CONSONANT});
// u before the optative and the admirative (u largofsha, u larguaka, u ulsha, u ulka).
const optEnds = ['sha', 'sh', 'të', 'shim', 'shi', 'shit', 'shin'];
const admEnds = ['kam', 'ke', 'ka', 'kemi', 'keni', 'kan', 'kësha', 'këshe', 'kësh', 'këshim', 'këshit', 'këshin'];
circumfix('np-lemma', [['u ', '']], [...optEnds.map((e) => [`of${e}`, 'ohem']), ...admEnds.map((e) => [`ua${e}`, 'ohem'])], [], V, {stemMinLength: 1});
circumfix('np-lemma', [['u ', '']], [...optEnds.map((e) => [`ef${e}`, 'ehem']), ...admEnds.map((e) => [`ye${e}`, 'ehem'])], [], V, {stemMinLength: 1});
circumfix('np-lemma', [['u ', '']], [...optEnds.map((e) => [e, 'em']), ...admEnds.map((e) => [e, 'em'])], [], V, {stemMinLength: 2, stemEndsWith: CONSONANT});
const npAux = ['jam ', 'je ', 'është ', 'jemi ', 'jeni ', 'janë ', 'isha ', 'ishe ', 'ishte ', 'ishim ', 'ishit ', 'ishin ',
    'jem ', 'jesh ', 'jetë ', 'jenë ', 'qenkam ', 'qenke ', 'qenka ', 'qenkemi ', 'qenkeni ', 'qenkan ',
    'qenkësha ', 'qenkëshe ', 'qenkësh ', 'qenkëshim ', 'qenkëshit ', 'qenkëshin ',
    'qofsha ', 'qofsh ', 'qoftë ', 'qofshim ', 'qofshi ', 'qofshit ', 'qofshin ', 'duke u ', "për t'u ", 'pa u '];
circumfix('np-lemma', npAux.map((p) => [p, '']), [['uar', 'ohem'], ['yer', 'ehem'], ['irë', 'ihem'], ['arë', 'ahem']],
    SB, V, {stemMinLength: 1});
circumfix('np-lemma', npAux.map((p) => [p, '']), [['ur', 'em']],
    SB, V, {stemMinLength: 2, stemEndsWith: CONSONANT});

// ================================================================================
// Verbs: synthetic forms
// ================================================================================
// The dictionary form is the first person singular of the present. Verbs end
// in a vowel and j (punoj, shkruaj, kthej, thyej, fshij, hyj, laj, bëj) or in a
// consonant (hap, lidh, vendos); the others are irregular (below).
//
// Present, imperfect, subjunctive and optative of the vowel + j verbs: the
// ending follows the vowel (puno-n, puno-jmë, puno-ni, puno-jnë; puno-ja,
// puno-nte; puno-sh, puno-jë; puno-fsha; shkrua-n, kthe-n, fshi-n, la-n,
// bë-n). The non-active adds -h- (punohem, punohet, punohej, punohu).
const VJ = '[aeioyë]';
const persons = ['1sg', '2sg', '3sg', '1pl', '2pl', '3pl'];
const pname = {'1sg': '1sg', '2sg': '2sg', '3sg': '3sg', '1pl': '1pl', '2pl': '2pl', '3pl': '3pl'};

transform('pres-2sg', 'present (2sg/3sg)', 'Present indicative, second or third person singular (punon, hap, flet, vjen).');
transform('pres-1pl', 'present (1pl)', 'Present indicative or subjunctive, first person plural (punojmë, hapim).');
transform('pres-2pl', 'present or imperative (2pl)', 'Present indicative or subjunctive, or imperative, second person plural (punoni, hapni, flisni).');
transform('pres-3pl', 'present (3pl)', 'Present indicative or subjunctive, third person plural (punojnë, hapin).');
for (const p of persons) {
    transform(`impf-${p}`, `imperfect (${pname[p]})`, `Imperfect indicative or subjunctive, ${p} (${{'1sg': 'punoja, hapja', '2sg': 'punoje, hapje', '3sg': 'punonte, hapte', '1pl': 'punonim, hapnim', '2pl': 'punonit, hapnit', '3pl': 'punonin, hapnin'}[p]}).`);
}
for (const p of persons) {
    transform(`aor-${p}`, `aorist (${pname[p]})`, `Aorist (simple past), ${p} (${{'1sg': 'punova, hapa', '2sg': 'punove, hape', '3sg': 'punoi, hapi', '1pl': 'punuam, hapëm', '2pl': 'punuat, hapët', '3pl': 'punuan, hapën'}[p]}).`);
}
transform('sbjv-2sg', 'subjunctive (2sg)', 'Present subjunctive, second person singular (të punosh, të hapësh).');
transform('sbjv-3sg', 'subjunctive (3sg)', 'Present subjunctive, third person singular (të punojë, të hapë).');
for (const p of persons) {
    transform(`opt-${p}`, `optative (${pname[p]})`, `Optative, ${p} (${{'1sg': 'punofsha, hapsha', '2sg': 'punofsh, hapsh', '3sg': 'punoftë, haptë', '1pl': 'punofshim, hapshim', '2pl': 'punofshi, hapshi', '3pl': 'punofshin, hapshin'}[p]}).`);
}
transform('imp-2sg', 'imperative (2sg)', 'Imperative, second person singular (puno, kthe, fshi; hap, merr, hidh).');
transform('ptcp', 'participle', 'Participle (punuar, shkruar, kthyer, fshirë, larë, bërë, hapur, dalë).');
for (const p of persons) {
    transform(`np-pres-${p}`, `non-active present (${pname[p]})`, `Non-active (mediopassive) present, ${p} (${{'1sg': 'punohem, hapem', '2sg': 'punohesh, hapesh', '3sg': 'punohet, hapet', '1pl': 'punohemi, hapemi', '2pl': 'punoheni, hapeni', '3pl': 'punohen, hapen'}[p]}).`);
}
for (const p of persons) {
    transform(`np-impf-${p}`, `non-active imperfect (${pname[p]})`, `Non-active imperfect, ${p} (${{'1sg': 'punohesha, hapesha', '2sg': 'punoheshe, hapeshe', '3sg': 'punohej, hapej', '1pl': 'punoheshim, hapeshim', '2pl': 'punoheshit, hapeshit', '3pl': 'punoheshin, hapeshin'}[p]}).`);
}
transform('np-imp-2sg', 'non-active imperative (2sg)', 'Non-active imperative, second person singular (largohu, lahu, ulu).');
transform('np-imp-2pl', 'non-active imperative (2pl)', 'Non-active imperative, second person plural (largohuni, lahuni, uluni).');
transform('np-aor-3sg', 'non-active aorist (3sg)', 'Non-active aorist, third person singular, after u (u largua, u kthye, u fshi, u la, u hap, u bë).');
transform('adm-pres', 'admirative (present)', 'Present admirative, built on the participle (punuakam, punuaka, hapka, qenka, paska).');
transform('adm-impf', 'admirative (imperfect)', 'Imperfect admirative, built on the participle (punuakësha, hapkësh, qenkësh).');

// Present.
suffix('pres-2sg', 'n', 'j', SB, V, {stemMinLength: 1, stemEndsWith: VJ});
// The present of the -uaj verbs at the ending of the aorist (3pl) of the
// shkrova type, so ruan, quan, vuan (present only; their aorist is ruajtën)
// show the present: the same deinflection as n → j after a.
suffix('pres-2sg', 'uan', 'uaj', SB, V, {stemMinLength: 1});
suffix('pres-1pl', 'jmë', 'j', SB, V, {stemMinLength: 1, stemEndsWith: VJ});
suffix('pres-2pl', 'ni', 'j', ['v_sbjv', 'v_imp'], V, {stemMinLength: 1, stemEndsWith: VJ});
suffix('pres-3pl', 'jnë', 'j', SB, V, {stemMinLength: 1, stemEndsWith: VJ});
suffix('pres-2sg', 'et', 'es', SB, V, {stemMinLength: 2, stemEndsWith: VC});
suffix('pres-2sg', 'et', 'as', SB, V, {stemMinLength: 2, stemEndsWith: VC});
suffix('pres-1pl', 'im', '', SB, V, {stemMinLength: 2, stemEndsWith: VC});
suffix('pres-2pl', 'ni', '', ['v_sbjv', 'v_imp'], V, {stemMinLength: 2, stemEndsWith: VC});
suffix('pres-3pl', 'in', '', SB, V, {stemMinLength: 2, stemEndsWith: VC});

// Imperfect.
for (const [p, vowelEnd, consEnd] of [['1sg', 'ja', 'ja'], ['2sg', 'je', 'je'], ['3sg', 'nte', 'te'], ['1pl', 'nim', 'nim'], ['2pl', 'nit', 'nit'], ['3pl', 'nin', 'nin']]) {
    suffix(`impf-${p}`, vowelEnd, 'j', SB, V, {stemMinLength: 1, stemEndsWith: VJ});
    suffix(`impf-${p}`, consEnd, '', SB, V, {stemMinLength: 2, stemEndsWith: VC});
}

// Subjunctive (the persons that differ from the present indicative).
suffix('sbjv-2sg', 'sh', 'j', SB, V, {stemMinLength: 1, stemEndsWith: VJ});
suffix('sbjv-3sg', 'jë', 'j', SB, V, {stemMinLength: 1, stemEndsWith: VJ});
suffix('sbjv-2sg', 'ësh', '', SB, V, {stemMinLength: 2, stemEndsWith: VC});
suffix('sbjv-3sg', 'ë', '', SB, V, {stemMinLength: 2, stemEndsWith: VC});

// Optative: vowel stems take -f- (punofsha, kthefsha, lafsha, bëfsha; -uaj
// verbs have o: shkrofsha), consonant stems none (hapsha, haptë).
for (const [p, vowelEnd, consEnd] of [['1sg', 'fsha', 'sha'], ['2sg', 'fsh', 'sh'], ['3sg', 'ftë', 'të'], ['1pl', 'fshim', 'shim'], ['2pl', 'fshi', 'shi'], ['2pl', 'fshit', 'shit'], ['3pl', 'fshin', 'shin']]) {
    suffix(`opt-${p}`, vowelEnd, 'j', AO, V, {stemMinLength: 1, stemEndsWith: VJ});
    suffix(`opt-${p}`, `o${vowelEnd}`, 'uaj', AO, V, {stemMinLength: 1});
    suffix(`opt-${p}`, consEnd, '', AO, V, {stemMinLength: 2, stemEndsWith: CONSONANT});
}

// Aorist by class.
const aorist = {
    // punoj: punova, punove, punoi, punuam, punuat, punuan
    oj: [['ova', 'oj'], ['ove', 'oj'], ['oi', 'oj'], ['uam', 'oj'], ['uat', 'oj'], ['uan', 'oj']],
    // shkruaj: shkrova, shkrove, shkroi, shkruam, shkruat, shkruan
    uaj: [['ova', 'uaj'], ['ove', 'uaj'], ['oi', 'uaj'], ['uam', 'uaj'], ['uat', 'uaj'], ['uan', 'uaj']],
    // mbaj, luaj, quaj, ruaj, brej: mbajta, mbajte, mbajti, mbajtëm, mbajtët, mbajtën
    jt: [['jta', 'j'], ['jte', 'j'], ['jti', 'j'], ['jtëm', 'j'], ['jtët', 'j'], ['jtën', 'j']],
    // tres, pyes, mas, pres: treta, trete, treti, tretëm, tretët, tretën
    st: [['ta', 's'], ['te', 's'], ['ti', 's'], ['tëm', 's'], ['tët', 's'], ['tën', 's']],
    // kthej: ktheva, ktheve, ktheu, kthyem, kthyet, kthyen
    ej: [['eva', 'ej'], ['eve', 'ej'], ['eu', 'ej'], ['yem', 'ej'], ['yet', 'ej'], ['yen', 'ej']],
    // thyej: theva, theve, theu, thyem, thyet, thyen
    yej: [['eva', 'yej'], ['eve', 'yej'], ['eu', 'yej'], ['yem', 'yej'], ['yet', 'yej'], ['yen', 'yej']],
    // blej: bleva, bleve, bleu, blemë, bletë, blenë
    blej: [['eva', 'ej'], ['eve', 'ej'], ['eu', 'ej'], ['emë', 'ej'], ['etë', 'ej'], ['enë', 'ej']],
    // fshij: fshiva, fshive, fshiu, fshimë, fshitë, fshinë
    ij: [['iva', 'ij'], ['ive', 'ij'], ['iu', 'ij'], ['imë', 'ij'], ['itë', 'ij'], ['inë', 'ij']],
    // shtyj: shtyva, shtyve, shtyu, shtymë, shtytë, shtynë; hyj: hyra, hyre, hyri
    yj: [['yva', 'yj'], ['yve', 'yj'], ['yu', 'yj'], ['ymë', 'yj'], ['ytë', 'yj'], ['ynë', 'yj']],
    yjr: [['yra', 'yj'], ['yre', 'yj'], ['yri', 'yj'], ['ymë', 'yj'], ['ytë', 'yj'], ['ynë', 'yj']],
    // laj: lava, lave, lau, lamë, latë, lanë
    aj: [['ava', 'aj'], ['ave', 'aj'], ['au', 'aj'], ['amë', 'aj'], ['atë', 'aj'], ['anë', 'aj']],
};
for (const rules of Object.values(aorist)) {
    rules.forEach(([inflected, deinflected], i) => {
        suffix(`aor-${persons[i]}`, inflected, deinflected, AO, V, {stemMinLength: 1});
    });
}
// ftoi (invited) before the noun ftua (quince, definite ftoi), whose
// rule comes first at the ending oi.
whole('aor-3sg', 'ftoi', 'ftoj', AO, V);
// ndjeva (I felt) is ndiej, not ndjej (to forgive), and thithe (you sucked)
// thith, not the oblique of thithë (nipple): ties the rows leave open.
whole('aor-1sg', 'ndjeva', 'ndiej', AO, V);
whole('aor-1pl', 'ndjemë', 'ndiej', AO, V);
whole('aor-2pl', 'ndjetë', 'ndiej', AO, V);
whole('aor-3pl', 'ndjenë', 'ndiej', AO, V);
whole('aor-2sg', 'thithe', 'thith', AO, V);
// hidhu (jump!) and vishu (get dressed!), the non-active imperatives of hedh
// and vesh (hidhem and vishem are not headwords), before hithër (nettle) and
// vij; kërcen (he jumps) before the accusative of kërce (cartilage); preke,
// preka (you, I touched) before the admirative of pres.
whole('np-imp-2sg', 'hidhu', 'hedh', IMP, V);
whole('np-imp-2sg', 'vishu', 'vesh', IMP, V);
whole('np-imp-2pl', 'vishuni', 'vesh', IMP, V);
whole('pres-2sg', 'kërcen', 'kërcej', SB, V);
whole('aor-1sg', 'preka', 'prek', AO, V);
whole('aor-2sg', 'preke', 'prek', AO, V);
// Consonant stems: hapa, hape, hapi (preku after k, g, h), hapëm, hapët, hapën.
for (const [p, end, extra] of [['1sg', 'a', {}], ['2sg', 'e', {}], ['3sg', 'i', {}], ['3sg', 'u', {stemEndsWith: '[kgh]'}], ['1pl', 'ëm', {}], ['2pl', 'ët', {}], ['3pl', 'ën', {}]]) {
    suffix(`aor-${p}`, end, '', AO, V, {stemMinLength: 2, stemEndsWith: VC, ...extra});
}

// Non-active aorist, third person singular: the aorist stem after u (u
// largua, u shkrua, u kthye, u thye, u fshi, u la, u bë, u mbajt; u hap is
// the stem itself). A hover starts at the hovered word, so the rules read the
// stem alone (largua → largoj, largohem) as well as after np-u.
for (const [inflected, deinflected, extra] of [
    ['ua', 'oj', {}], ['ua', 'uaj', {}], ['ye', 'ej', {}], ['ye', 'yej', {}], ['jt', 'j', {stemEndsWith: VOWEL}],
]) {
    suffix('np-aor-3sg', inflected, deinflected, AO, V, {stemMinLength: 1, ...extra});
}
// A stem in a, i or ë is read only after u (u bë → bëj, u la → laj, u fshi →
// fshij), since every word ends in one of them.
circumfix('np-aor-3sg', [['u ', '']], [['', 'j']], [], V, {stemMinLength: 1, stemEndsWith: '[aië]'});

// Imperative, second person singular: puno, kthe, fshi, shty (the -aj, -uaj
// and bëj verbs and the consonant stems are their dictionary form).
// A stem of three letters for e and i, so vi (VI) is not vij, whose
// imperative is eja; ço, shko keep o.
suffix('imp-2sg', '', 'j', IMP, V, {stemMinLength: 2, stemEndsWith: '[o]'});
suffix('imp-2sg', '', 'j', IMP, V, {stemMinLength: 3, stemEndsWith: '[ei]'});
suffix('imp-2sg', 'yr', 'yj', IMP, V, {stemMinLength: 1});

// Participle.
for (const [inflected, deinflected, extra] of [
    ['uar', 'oj', {}], ['uar', 'uaj', {}], ['jtur', 'j', {stemEndsWith: VOWEL}], ['ier', 'iej', {}], ['tur', 's', {stemMinLength: 2}],
    ['yer', 'ej', {}], ['yer', 'yej', {}], ['erë', 'ej', {}], ['irë', 'ij', {}], ['yrë', 'yj', {}], ['arë', 'aj', {}], ['ërë', 'ëj', {}],
    ['ur', '', {stemMinLength: 2, stemEndsWith: VC}],
    ['ë', '', {stemMinLength: 2, stemEndsWith: '[lr]'}],
]) {
    suffix('ptcp', inflected, deinflected, PT, V, {stemMinLength: 1, ...extra});
}

// Admirative: the participle without -r (punua-, kthye-), -ur (hap-), -rë
// (bë-, la-, pi-), or -ë (dal-, qen-, thën-), and the endings kam, ke, ka,
// kemi, keni, kan (present) and kësha, këshe, kësh, këshim, këshit, këshin
// (imperfect). The rule gives back the participle.
const admirativeEndings = [['adm-pres', ['kam', 'ke', 'ka', 'kemi', 'keni', 'kan']], ['adm-impf', ['kësha', 'këshe', 'kësh', 'këshim', 'këshit', 'këshin']]];
for (const [id, ends] of admirativeEndings) {
    for (const end of ends) {
        suffix(id, end, 'r', AO, PT_OUT, {stemMinLength: 2, stemEndsWith: '[ae]'});
        suffix(id, end, 'ur', AO, PT_OUT, {stemMinLength: 2, stemEndsWith: VC});
        suffix(id, end, 'rë', AO, PT_OUT, {stemMinLength: 1, stemEndsWith: '[aeiyë]'});
        suffix(id, end, 'ë', AO, PT_OUT, {stemMinLength: 2, stemEndsWith: '[nlr]'});
        suffix(id, `ë${end}`, 'ur', AO, PT_OUT, {stemMinLength: 2, stemEndsWith: '[kg]'});
    }
}

// Non-active present and imperfect, to the active verb (punohet → punoj,
// hapet → hap, shkruhet → shkruaj, kthehet → kthej) ...
for (const [p, vowelEnd, consEnd] of [['1sg', 'hem', 'em'], ['2sg', 'hesh', 'esh'], ['3sg', 'het', 'et'], ['1pl', 'hemi', 'emi'], ['2pl', 'heni', 'eni'], ['3pl', 'hen', 'en']]) {
    // The mediopassive verb first, where a dictionary lists it (largohet → largohem before largoj).
    if (p !== '1sg') { suffix(`np-pres-${p}`, vowelEnd, 'hem', SB, V, {stemMinLength: 1, stemEndsWith: VJ}); }
    suffix(`np-pres-${p}`, vowelEnd, 'j', SB, V, {stemMinLength: 1, stemEndsWith: VJ});
    suffix(`np-pres-${p}`, `u${vowelEnd}`, 'uaj', SB, V, {stemMinLength: 1});
    suffix(`np-pres-${p}`, `y${vowelEnd}`, 'yej', SB, V, {stemMinLength: 1});
    // After a consonant too, the mediopassive verb first (ulet → ulem before
    // ul, dukej → dukem before duk, varet → varem before var).
    if (p !== '1sg') { suffix(`np-pres-${p}`, consEnd, 'em', SB, V, {stemMinLength: 2, stemEndsWith: VC}); }
    suffix(`np-pres-${p}`, consEnd, '', SB, V, {stemMinLength: 2, stemEndsWith: VC});
}
for (const [p, vowelEnd, consEnd] of [['1sg', 'hesha', 'esha'], ['2sg', 'heshe', 'eshe'], ['3sg', 'hej', 'ej'], ['1pl', 'heshim', 'eshim'], ['2pl', 'heshit', 'eshit'], ['3pl', 'heshin', 'eshin']]) {
    suffix(`np-impf-${p}`, vowelEnd, 'hem', SB, V, {stemMinLength: 1, stemEndsWith: VJ});
    suffix(`np-impf-${p}`, vowelEnd, 'j', SB, V, {stemMinLength: 1, stemEndsWith: VJ});
    suffix(`np-impf-${p}`, `u${vowelEnd}`, 'uaj', SB, V, {stemMinLength: 1});
    suffix(`np-impf-${p}`, `y${vowelEnd}`, 'yej', SB, V, {stemMinLength: 1});
    suffix(`np-impf-${p}`, consEnd, 'em', SB, V, {stemMinLength: 2, stemEndsWith: VC});
    suffix(`np-impf-${p}`, consEnd, '', SB, V, {stemMinLength: 2, stemEndsWith: VC});
}
suffix('np-imp-2sg', 'hu', 'hem', IMP, V, {stemMinLength: 1, stemEndsWith: VJ});
suffix('np-imp-2sg', 'hu', 'j', IMP, V, {stemMinLength: 1, stemEndsWith: VJ});
suffix('np-imp-2sg', 'uhu', 'uaj', IMP, V, {stemMinLength: 1});
suffix('np-imp-2sg', 'u', 'em', IMP, V, {stemMinLength: 2, stemEndsWith: VC});
suffix('np-imp-2sg', 'u', '', IMP, V, {stemMinLength: 2, stemEndsWith: VC});
// After mos (do not), the non-active imperative is u and the active stem:
// mos u shqetëso, mos u kthe → shqetësohem, kthehem (and the active verb).
circumfix('np-imp-2sg', [['u ', '']], [['o', 'ohem'], ['o', 'oj'], ['e', 'ehem'], ['e', 'ej']], [], V, {stemMinLength: 2});
suffix('np-imp-2pl', 'huni', 'hem', IMP, V, {stemMinLength: 1, stemEndsWith: VJ});
suffix('np-imp-2pl', 'huni', 'j', IMP, V, {stemMinLength: 1, stemEndsWith: VJ});
suffix('np-imp-2pl', 'uni', 'em', IMP, V, {stemMinLength: 2, stemEndsWith: VC});
suffix('np-imp-2pl', 'uni', '', IMP, V, {stemMinLength: 2, stemEndsWith: VC});
// The -em rules above read the mediopassive verb a dictionary lists
// (largohet → largohem, duket → dukem, lutej → lutem, ulu → ulem); the -hem
// verbs are the -em endings after h.

// Pronouns attached to an imperative: e (it, him, her), i (to him, her,
// them), with j between vowels (hape, merre, bëje, lexoje, tregoji); in the
// plural before -ni (hapeni, lexojeni, jepini).
transform('cl-e', '+e (it, him, her)', 'The pronoun e attached to an imperative (hape → hap, merre → merr, lexoje → lexo, shkruaje → shkruaj, hapeni → hapni).');
suffix('cl-e', 'e', '', [], IMP_OUT, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('cl-e', 'je', '', [], IMP_OUT, {stemMinLength: 2, stemEndsWith: '[aeoiuyë]'});
suffix('cl-e', 'eni', 'ni', [], IMP_OUT, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('cl-e', 'jeni', 'ni', [], IMP_OUT, {stemMinLength: 2, stemEndsWith: '[aeoiuyë]'});
transform('cl-i', '+i (to him, her, them)', 'The pronoun i attached to an imperative (jepi → jep, tregoji → trego, thuaji → thuaj, jepini → jepni).');
suffix('cl-i', 'i', '', [], IMP_OUT, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('cl-i', 'ji', '', [], IMP_OUT, {stemMinLength: 2, stemEndsWith: '[aeoiuyë]'});
suffix('cl-i', 'ini', 'ni', [], IMP_OUT, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('cl-i', 'jini', 'ni', [], IMP_OUT, {stemMinLength: 2, stemEndsWith: '[aeoiuyë]'});
for (const [form, lemma] of [['jepe', 'jap'], ['lëre', 'lë'], ['vëre', 'vë'], ['zëre', 'zë'], ['thuaje', 'them'], ['sille', 'sjell'], ['hidhe', 'hedh'], ['hiqe', 'heq'], ['bjere', 'bie'], ['shihe', 'shoh'], ['prite', 'pres'],
    ['vrite', 'vras'], ['lëreni', 'lë']]) {
    whole('cl-e', form, lemma, [], V);
}
for (const [form, lemma] of [['jepi', 'jap'], ['thuaji', 'them'], ['thuaja', 'them'], ['lëri', 'lë'], ['vëri', 'vë'], ['silli', 'sjell'], ['hiqi', 'heq']]) {
    whole('cl-i', form, lemma, [], V);
}
transform('cl-me', '+më (me)', 'The pronoun më attached to an imperative (jepmë → jep, tregomë → trego, thuamë → thuaj).');
suffix('cl-me', 'më', '', [], IMP_OUT, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('cl-me', 'më', '', [], IMP_OUT, {stemMinLength: 2, stemEndsWith: '[o]'});
whole('cl-me', 'thuamë', 'thuaj', [], IMP_OUT);
transform('cl-na', '+na (us)', 'The pronoun na attached to an imperative (jepna → jep, tregona → trego, falna → fal).');
suffix('cl-na', 'na', '', [], IMP_OUT, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('cl-na', 'na', '', [], IMP_OUT, {stemMinLength: 2, stemEndsWith: '[o]'});

// ================================================================================
// Irregular verbs
// ================================================================================
// Ablaut verbs change their stem vowel in the second and third person
// singular of the present (jep, merr, flet, del), in the second person plural,
// the imperfect, the imperative and the non-active (jepni, merrni, flisni,
// hidhni, sillni; jepja; hidh; hidhet), and in the aorist (dhashë, mora, fola,
// hodha, solla). Each form is listed.
function verb(lemma, table) {
    for (const [id, forms] of Object.entries(table)) {
        const conditionsIn = id.startsWith('aor') || id.startsWith('opt') || id === 'np-aor-3sg' ? AO
            : id === 'ptcp' ? PT : id === 'imp-2sg' || id.startsWith('np-imp-') ? IMP : id === 'pres-2pl' ? ['v_sbjv', 'v_imp'] : SB;
        irregular(id, forms.split(' ').filter(Boolean), lemma, conditionsIn);
    }
}
verb('jam', {
    'pres-2sg': 'je është', 'pres-1pl': 'jemi', 'pres-2pl': 'jeni', 'pres-3pl': 'janë',
    'impf-1sg': 'isha', 'impf-2sg': 'ishe', 'impf-3sg': 'ishte ish', 'impf-1pl': 'ishim', 'impf-2pl': 'ishit', 'impf-3pl': 'ishin',
    'aor-1sg': 'qeshë', 'aor-3sg': 'qe', 'aor-1pl': 'qemë', 'aor-2pl': 'qetë', 'aor-3pl': 'qenë',
    'sbjv-2sg': 'jesh', 'sbjv-3sg': 'jetë',
    'opt-1sg': 'qofsha', 'opt-2sg': 'qofsh', 'opt-3sg': 'qoftë', 'opt-1pl': 'qofshim', 'opt-2pl': 'qofshi qofshit', 'opt-3pl': 'qofshin',
    'ptcp': 'qenë', 'imp-2sg': 'ji',
});
whole('sbjv', 'jem', 'jam', SB, V);
whole('pres-3pl', 'jenë', 'jam', SB, V);
whole('pres-2pl', 'jini', 'jam', IMP, V);
verb('kam', {
    'pres-2sg': 'ke ka', 'pres-1pl': 'kemi', 'pres-2pl': 'keni', 'pres-3pl': 'kanë',
    'impf-1sg': 'kisha', 'impf-2sg': 'kishe', 'impf-3sg': 'kishte', 'impf-1pl': 'kishim', 'impf-2pl': 'kishit', 'impf-3pl': 'kishin',
    'aor-1sg': 'pata', 'aor-2sg': 'pate', 'aor-3sg': 'pati', 'aor-1pl': 'patëm', 'aor-2pl': 'patët', 'aor-3pl': 'patën',
    'sbjv-2sg': 'kesh', 'sbjv-3sg': 'ketë',
    'opt-1sg': 'paça', 'opt-2sg': 'paç', 'opt-3sg': 'pastë', 'opt-1pl': 'paçim', 'opt-2pl': 'paçi paçit', 'opt-3pl': 'paçin',
    'ptcp': 'pasur patur', 'imp-2sg': 'ki',
});
whole('sbjv', 'kem', 'kam', SB, V);
whole('pres-3pl', 'kenë', 'kam', SB, V);
whole('pres-2pl', 'kini', 'kam', IMP, V);
verb('them', {
    'pres-2sg': 'thua thotë', 'pres-1pl': 'themi', 'pres-2pl': 'thoni', 'pres-3pl': 'thonë',
    'impf-1sg': 'thosha', 'impf-2sg': 'thoshe', 'impf-3sg': 'thoshte', 'impf-1pl': 'thoshim', 'impf-2pl': 'thoshit', 'impf-3pl': 'thoshin',
    'aor-1sg': 'thashë', 'aor-2sg': 'the', 'aor-3sg': 'tha', 'aor-1pl': 'thamë', 'aor-2pl': 'thatë', 'aor-3pl': 'thanë',
    'sbjv-2sg': 'thuash', 'sbjv-3sg': 'thotë',
    'opt-1sg': 'thënça', 'opt-2sg': 'thënç', 'opt-3sg': 'thëntë', 'opt-1pl': 'thënçim', 'opt-2pl': 'thënçi thënçit', 'opt-3pl': 'thënçin',
    'ptcp': 'thënë', 'imp-2sg': 'thuaj',
    'np-pres-1sg': 'thuhem', 'np-pres-2sg': 'thuhesh', 'np-pres-3sg': 'thuhet', 'np-pres-1pl': 'thuhemi', 'np-pres-2pl': 'thuheni', 'np-pres-3pl': 'thuhen',
    'np-impf-1sg': 'thuhesha', 'np-impf-2sg': 'thuheshe', 'np-impf-3sg': 'thuhej', 'np-impf-1pl': 'thuheshim', 'np-impf-2pl': 'thuheshit', 'np-impf-3pl': 'thuheshin',
    'np-aor-3sg': 'tha',
});
verb('jap', {
    'pres-2sg': 'jep', 'pres-1pl': 'japim', 'pres-2pl': 'jepni', 'pres-3pl': 'japin',
    'impf-1sg': 'jepja', 'impf-2sg': 'jepje', 'impf-3sg': 'jepte', 'impf-1pl': 'jepnim', 'impf-2pl': 'jepnit', 'impf-3pl': 'jepnin',
    'aor-1sg': 'dhashë', 'aor-2sg': 'dhe', 'aor-3sg': 'dha', 'aor-1pl': 'dhamë', 'aor-2pl': 'dhatë', 'aor-3pl': 'dhanë',
    'sbjv-2sg': 'japësh', 'sbjv-3sg': 'japë',
    'opt-1sg': 'dhënça', 'opt-2sg': 'dhënç', 'opt-3sg': 'dhëntë', 'opt-1pl': 'dhënçim', 'opt-2pl': 'dhënçi dhënçit', 'opt-3pl': 'dhënçin',
    'ptcp': 'dhënë', 'imp-2sg': 'jep',
    'np-pres-1sg': 'jepem', 'np-pres-2sg': 'jepesh', 'np-pres-3sg': 'jepet', 'np-pres-1pl': 'jepemi', 'np-pres-2pl': 'jepeni', 'np-pres-3pl': 'jepen',
    'np-impf-1sg': 'jepesha', 'np-impf-2sg': 'jepeshe', 'np-impf-3sg': 'jepej', 'np-impf-1pl': 'jepeshim', 'np-impf-2pl': 'jepeshit', 'np-impf-3pl': 'jepeshin',
    'np-aor-3sg': 'dha',
});
verb('shoh', {
    'pres-2sg': 'sheh', 'pres-1pl': 'shohim', 'pres-2pl': 'shihni', 'pres-3pl': 'shohin',
    'impf-1sg': 'shihja', 'impf-2sg': 'shihje', 'impf-3sg': 'shihte', 'impf-1pl': 'shihnim', 'impf-2pl': 'shihnit', 'impf-3pl': 'shihnin',
    'aor-1sg': 'pashë', 'aor-2sg': 'pe', 'aor-3sg': 'pa', 'aor-1pl': 'pamë', 'aor-2pl': 'patë', 'aor-3pl': 'panë',
    'sbjv-2sg': 'shohësh', 'sbjv-3sg': 'shohë',
    'opt-1sg': 'pafsha', 'opt-2sg': 'pafsh', 'opt-3sg': 'paftë', 'opt-1pl': 'pafshim', 'opt-2pl': 'pafshi pafshit', 'opt-3pl': 'pafshin',
    'ptcp': 'parë', 'imp-2sg': 'shih',
    'np-pres-1sg': 'shihem', 'np-pres-2sg': 'shihesh', 'np-pres-3sg': 'shihet', 'np-pres-1pl': 'shihemi', 'np-pres-2pl': 'shiheni', 'np-pres-3pl': 'shihen',
    'np-impf-1sg': 'shihesha', 'np-impf-2sg': 'shiheshe', 'np-impf-3sg': 'shihej', 'np-impf-1pl': 'shiheshim', 'np-impf-2pl': 'shiheshit', 'np-impf-3pl': 'shiheshin',
    'np-imp-2sg': 'shihu', 'np-imp-2pl': 'shihuni',
    'np-aor-3sg': 'pa',
});
verb('vij', {
    'pres-2sg': 'vjen',
    'aor-1sg': 'erdha', 'aor-2sg': 'erdhe', 'aor-3sg': 'erdhi', 'aor-1pl': 'erdhëm', 'aor-2pl': 'erdhët', 'aor-3pl': 'erdhën',
    'opt-1sg': 'ardhsha', 'opt-2sg': 'ardhsh', 'opt-3sg': 'ardhtë', 'opt-1pl': 'ardhshim', 'opt-2pl': 'ardhshi ardhshit', 'opt-3pl': 'ardhshin',
    'ptcp': 'ardhur', 'imp-2sg': 'eja',
});
whole('pres-2pl', 'ejani', 'vij', IMP, V);
// vë (put) has these forms too (whole words below); vij (come) is the common
// reading, so its rules come first at the same ending.
for (const [id, form] of [['pres-2pl', 'vini'], ['impf-1sg', 'vija'], ['impf-2sg', 'vije'], ['impf-3sg', 'vinte'],
    ['impf-1pl', 'vinim'], ['impf-2pl', 'vinit'], ['impf-3pl', 'vinin']]) {
    whole(id, form, 'vij', id === 'pres-2pl' ? ['v_sbjv', 'v_imp'] : SB, V);
}
// mundja is mostly I could (nuk mundja), not the rare noun mundje, which the
// noun rule -ja → -je reaches first.
whole('impf-1sg', 'mundja', 'mund', SB, V);
// The subjunctive (3sg) of marr is spelt like its participle marrë, which
// wty-sq-en has as a headword of its own: të marrë (that he take) would show
// marrë first. (të dalë cannot be helped: wty-sq-en names only dalë for it.)
for (const phrase of ['të marrë', 'ta marrë']) {
    whole('sbjv-3sg', phrase, 'marr', [], V);
}
verb('dua', {
    'pres-2sg': 'do', 'pres-1pl': 'duam', 'pres-2pl': 'doni', 'pres-3pl': 'duan',
    'impf-1sg': 'doja', 'impf-2sg': 'doje', 'impf-3sg': 'donte', 'impf-1pl': 'donim', 'impf-2pl': 'donit', 'impf-3pl': 'donin',
    'aor-1sg': 'desha', 'aor-2sg': 'deshe', 'aor-3sg': 'deshi', 'aor-1pl': 'deshëm', 'aor-2pl': 'deshët', 'aor-3pl': 'deshën',
    'sbjv-2sg': 'duash', 'sbjv-3sg': 'dojë',
    'opt-1sg': 'daça', 'opt-2sg': 'daç', 'opt-3sg': 'daçtë', 'opt-1pl': 'daçim', 'opt-2pl': 'daçi daçit', 'opt-3pl': 'daçin',
    'ptcp': 'dashur', 'imp-2sg': 'duaj',
});
verb('ha', {
    'pres-1pl': 'hamë', 'pres-2pl': 'hani', 'pres-3pl': 'hanë',
    'impf-1sg': 'haja', 'impf-2sg': 'haje', 'impf-3sg': 'hante', 'impf-1pl': 'hanim', 'impf-2pl': 'hanit', 'impf-3pl': 'hanin',
    'aor-1sg': 'hëngra', 'aor-2sg': 'hëngre', 'aor-3sg': 'hëngri', 'aor-1pl': 'hëngrëm', 'aor-2pl': 'hëngrët', 'aor-3pl': 'hëngrën',
    'sbjv-2sg': 'hash', 'sbjv-3sg': 'hajë',
    'opt-1sg': 'ngrënça', 'opt-2sg': 'ngrënç', 'opt-3sg': 'ngrëntë', 'opt-1pl': 'ngrënçim', 'opt-2pl': 'ngrënçi ngrënçit', 'opt-3pl': 'ngrënçin',
    'ptcp': 'ngrënë',
    'np-pres-1sg': 'hahem', 'np-pres-3sg': 'hahet', 'np-pres-3pl': 'hahen', 'np-impf-3sg': 'hahej',
    'np-aor-3sg': 'hëngër',
});
verb('pi', {
    'pres-1pl': 'pimë', 'pres-2pl': 'pini', 'pres-3pl': 'pinë',
    'impf-1sg': 'pija', 'impf-2sg': 'pije', 'impf-3sg': 'pinte', 'impf-1pl': 'pinim', 'impf-2pl': 'pinit', 'impf-3pl': 'pinin',
    'aor-1sg': 'piva', 'aor-2sg': 'pive', 'aor-3sg': 'piu', 'aor-1pl': 'pimë', 'aor-2pl': 'pitë', 'aor-3pl': 'pinë',
    'sbjv-2sg': 'pish', 'sbjv-3sg': 'pijë',
    'opt-1sg': 'pifsha', 'opt-2sg': 'pifsh', 'opt-3sg': 'piftë',
    'ptcp': 'pirë',
    'np-pres-3sg': 'pihet', 'np-pres-3pl': 'pihen', 'np-impf-3sg': 'pihej',
});
verb('di', {
    'pres-1pl': 'dimë', 'pres-2pl': 'dini', 'pres-3pl': 'dinë',
    'impf-1sg': 'dija', 'impf-2sg': 'dije', 'impf-3sg': 'dinte', 'impf-1pl': 'dinim', 'impf-2pl': 'dinit', 'impf-3pl': 'dinin',
    // dita, dite, ditët and ditën are also forms of ditë (day), the reading in
    // almost every text; wty-sq-en's own rows still give di.
    'aor-3sg': 'diti', 'aor-1pl': 'ditëm',
    'sbjv-2sg': 'dish', 'sbjv-3sg': 'dijë',
    'opt-1sg': 'ditsha', 'opt-2sg': 'ditsh', 'opt-3sg': 'dittë', 'opt-1pl': 'ditshim', 'opt-2pl': 'ditshi ditshit', 'opt-3pl': 'ditshin',
    'ptcp': 'ditur',
    'np-pres-3sg': 'dihet', 'np-pres-3pl': 'dihen', 'np-impf-3sg': 'dihej',
});
verb('rri', {
    'pres-1pl': 'rrimë', 'pres-2pl': 'rrini', 'pres-3pl': 'rrinë',
    'impf-1sg': 'rrija', 'impf-2sg': 'rrije', 'impf-3sg': 'rrinte', 'impf-1pl': 'rrinim', 'impf-2pl': 'rrinit', 'impf-3pl': 'rrinin',
    'aor-1sg': 'ndenja', 'aor-2sg': 'ndenje', 'aor-3sg': 'ndenji', 'aor-1pl': 'ndenjëm', 'aor-2pl': 'ndenjët', 'aor-3pl': 'ndenjën',
    'sbjv-2sg': 'rrish', 'sbjv-3sg': 'rrijë',
    'ptcp': 'ndenjur',
});
verb('fle', {
    'pres-1pl': 'flemë', 'pres-2pl': 'flini', 'pres-3pl': 'flenë',
    'impf-1sg': 'flija', 'impf-2sg': 'flije', 'impf-3sg': 'flinte', 'impf-1pl': 'flinim', 'impf-2pl': 'flinit', 'impf-3pl': 'flinin',
    'aor-1sg': 'fjeta', 'aor-2sg': 'fjete', 'aor-3sg': 'fjeti', 'aor-1pl': 'fjetëm', 'aor-2pl': 'fjetët', 'aor-3pl': 'fjetën',
    'sbjv-2sg': 'flesh', 'sbjv-3sg': 'flejë',
    'ptcp': 'fjetur', 'imp-2sg': 'fli',
});
for (const [lemma, i, aor, ptcp, imp] of [
    ['lë', 'li', ['lashë', 'le', 'la', 'lamë', 'latë', 'lanë'], 'lënë', 'lër'],
    ['vë', 'vi', ['vura', 'vure', 'vuri', 'vumë', 'vutë', 'vunë'], 'vënë', 'vër'],
    ['zë', 'zi', ['zura', 'zure', 'zuri', 'zumë', 'zutë', 'zunë'], 'zënë', 'zër'],
    // nxë (learn) and the compounds of vë and zë, which Yomitan's rules reach
    // and the whole-word forms of vë and zë do not.
    ['nxë', 'nxi', ['nxura', 'nxure', 'nxuri', 'nxumë', 'nxutë', 'nxunë'], 'nxënë', 'nxër'],
    ['përzë', 'përzi', ['përzura', 'përzure', 'përzuri', 'përzumë', 'përzutë', 'përzunë'], 'përzënë', 'përzër'],
    ['kundërvë', 'kundërvi', ['kundërvura', 'kundërvure', 'kundërvuri', 'kundërvumë', 'kundërvutë', 'kundërvunë'], 'kundërvënë', 'kundërvër'],
    ['bashkëvë', 'bashkëvi', ['bashkëvura', 'bashkëvure', 'bashkëvuri', 'bashkëvumë', 'bashkëvutë', 'bashkëvunë'], 'bashkëvënë', 'bashkëvër'],
]) {
    const s = lemma;
    verb(lemma, {
        'pres-1pl': `${s}më`, 'pres-2pl': `${i}ni ${s}ni`, 'pres-3pl': `${s}në`,
        'impf-1sg': `${i}ja`, 'impf-2sg': `${i}je`, 'impf-3sg': `${i}nte`, 'impf-1pl': `${i}nim`, 'impf-2pl': `${i}nit`, 'impf-3pl': `${i}nin`,
        'aor-1sg': aor[0], 'aor-2sg': aor[1], 'aor-3sg': aor[2], 'aor-1pl': aor[3], 'aor-2pl': aor[4], 'aor-3pl': aor[5],
        'sbjv-2sg': `${s}sh`, 'sbjv-3sg': `${s}rë`,
        'ptcp': ptcp, 'imp-2sg': imp,
        'np-pres-1sg': `${i}hem`, 'np-pres-2sg': `${i}hesh`, 'np-pres-3sg': `${i}het`, 'np-pres-1pl': `${i}hemi`, 'np-pres-2pl': `${i}heni`, 'np-pres-3pl': `${i}hen`,
        'np-impf-3sg': `${i}hej`, 'np-impf-3pl': `${i}heshin`,
        'np-aor-3sg': {lë: 'la', vë: 'vu', zë: 'zu', nxë: 'nxu', përzë: 'përzu', kundërvë: 'kundërvu', bashkëvë: 'bashkëvu'}[lemma],
    });
}
verb('bie', {
    'pres-1pl': 'biem', 'pres-2pl': 'bini', 'pres-3pl': 'bien',
    'impf-1sg': 'bija', 'impf-2sg': 'bije', 'impf-3sg': 'binte', 'impf-1pl': 'binim', 'impf-2pl': 'binit', 'impf-3pl': 'binin',
    'aor-1sg': 'rashë prura', 'aor-2sg': 're prure', 'aor-3sg': 'ra pruri', 'aor-1pl': 'ramë prumë', 'aor-2pl': 'ratë prutë', 'aor-3pl': 'ranë prunë',
    'sbjv-2sg': 'biesh', 'sbjv-3sg': 'bjerë',
    'ptcp': 'rënë prurë', 'imp-2sg': 'bjer',
});
verb('bëj', {
    'aor-1sg': 'bëra', 'aor-2sg': 'bëre', 'aor-3sg': 'bëri', 'aor-1pl': 'bëmë', 'aor-2pl': 'bëtë', 'aor-3pl': 'bënë',
    'np-aor-3sg': 'bë',
});
verb('dal', {
    'pres-2sg': 'del', 'pres-2pl': 'dilni',
    'impf-1sg': 'dilja', 'impf-2sg': 'dilje', 'impf-3sg': 'dilte', 'impf-1pl': 'dilnim', 'impf-2pl': 'dilnit', 'impf-3pl': 'dilnin',
    'aor-1sg': 'dola', 'aor-2sg': 'dole', 'aor-3sg': 'doli', 'aor-1pl': 'dolëm', 'aor-2pl': 'dolët', 'aor-3pl': 'dolën',
    'imp-2sg': 'dil',
});
verb('marr', {
    'pres-2sg': 'merr', 'pres-2pl': 'merrni',
    'impf-1sg': 'merrja', 'impf-2sg': 'merrje', 'impf-3sg': 'merrte', 'impf-1pl': 'merrnim', 'impf-2pl': 'merrnit', 'impf-3pl': 'merrnin',
    'aor-1sg': 'mora', 'aor-2sg': 'more', 'aor-3sg': 'mori', 'aor-1pl': 'morëm', 'aor-2pl': 'morët', 'aor-3pl': 'morën',
    'imp-2sg': 'merr',
    'np-pres-1sg': 'merrem', 'np-pres-2sg': 'merresh', 'np-pres-3sg': 'merret', 'np-pres-1pl': 'merremi', 'np-pres-2pl': 'merreni', 'np-pres-3pl': 'merren',
    'np-impf-1sg': 'merresha', 'np-impf-2sg': 'merreshe', 'np-impf-3sg': 'merrej', 'np-impf-1pl': 'merreshim', 'np-impf-2pl': 'merreshit', 'np-impf-3pl': 'merreshin',
    'np-aor-3sg': 'mor',
});
verb('flas', {
    'pres-2sg': 'flet', 'pres-2pl': 'flisni',
    'impf-1sg': 'flisja', 'impf-2sg': 'flisje', 'impf-3sg': 'fliste', 'impf-1pl': 'flisnim', 'impf-2pl': 'flisnit', 'impf-3pl': 'flisnin',
    'aor-1sg': 'fola', 'aor-2sg': 'fole', 'aor-3sg': 'foli', 'aor-1pl': 'folëm', 'aor-2pl': 'folët', 'aor-3pl': 'folën',
    'opt-1sg': 'folsha', 'opt-2sg': 'folsh', 'opt-3sg': 'foltë', 'opt-1pl': 'folshim', 'opt-2pl': 'folshi folshit', 'opt-3pl': 'folshin',
    'ptcp': 'folur', 'imp-2sg': 'fol',
    'np-pres-3sg': 'flitet', 'np-pres-3pl': 'fliten', 'np-impf-3sg': 'flitej', 'np-impf-3pl': 'fliteshin',
    'np-aor-3sg': 'fol',
});
// pres (wait; and cut: preva, prerë), vras, shes, pyes: s becomes t.
verb('pres', {
    'pres-2sg': 'pret', 'pres-2pl': 'prisni pritni',
    'impf-1sg': 'prisja', 'impf-2sg': 'prisje', 'impf-3sg': 'priste', 'impf-1pl': 'prisnim', 'impf-2pl': 'prisnit', 'impf-3pl': 'prisnin',
    'aor-1sg': 'prita preva', 'aor-2sg': 'prite preve', 'aor-3sg': 'priti preu', 'aor-1pl': 'pritëm premë', 'aor-2pl': 'pritët pretë', 'aor-3pl': 'pritën prenë',
    'ptcp': 'pritur prerë', 'imp-2sg': 'prit',
    'np-pres-1sg': 'pritem', 'np-pres-2sg': 'pritesh', 'np-pres-3sg': 'pritet', 'np-pres-1pl': 'pritemi', 'np-pres-2pl': 'priteni', 'np-pres-3pl': 'priten',
    'np-impf-3sg': 'pritej', 'np-impf-3pl': 'priteshin',
    'np-aor-3sg': 'prit pre',
});
verb('vras', {
    'pres-2sg': 'vret', 'pres-2pl': 'vritni',
    'impf-1sg': 'vrisja vritja', 'impf-2sg': 'vrisje vritje', 'impf-3sg': 'vriste', 'impf-1pl': 'vrisnim vritnim', 'impf-2pl': 'vrisnit vritnit', 'impf-3pl': 'vrisnin vritnin',
    'aor-1sg': 'vrava', 'aor-2sg': 'vrave', 'aor-3sg': 'vrau', 'aor-1pl': 'vramë', 'aor-2pl': 'vratë', 'aor-3pl': 'vranë',
    'ptcp': 'vrarë', 'imp-2sg': 'vrit',
    'np-pres-1sg': 'vritem', 'np-pres-2sg': 'vritesh', 'np-pres-3sg': 'vritet', 'np-pres-3pl': 'vriten', 'np-impf-3sg': 'vritej',
    'np-aor-3sg': 'vra',
});
verb('shes', {
    'pres-2sg': 'shet', 'pres-2pl': 'shitni',
    'impf-1sg': 'shisja', 'impf-2sg': 'shisje', 'impf-3sg': 'shiste', 'impf-1pl': 'shisnim', 'impf-2pl': 'shisnit', 'impf-3pl': 'shisnin',
    'aor-1sg': 'shita', 'aor-2sg': 'shite', 'aor-3sg': 'shiti', 'aor-1pl': 'shitëm', 'aor-2pl': 'shitët', 'aor-3pl': 'shitën',
    'sbjv-3sg': 'shesë', 'ptcp': 'shitur', 'imp-2sg': 'shit',
    'np-pres-3sg': 'shitet', 'np-pres-3pl': 'shiten', 'np-impf-3sg': 'shitej',
    'np-aor-3sg': 'shit',
});
verb('pyes', {
    'pres-2sg': 'pyet', 'pres-2pl': 'pyetni',
    'impf-3sg': 'pyeste',
    'aor-1sg': 'pyeta', 'aor-2sg': 'pyete', 'aor-3sg': 'pyeti', 'aor-1pl': 'pyetëm', 'aor-2pl': 'pyetët', 'aor-3pl': 'pyetën',
    'ptcp': 'pyetur', 'imp-2sg': 'pyet',
    'np-pres-3sg': 'pyetet', 'np-pres-3pl': 'pyeten', 'np-impf-3sg': 'pyetej',
    'np-aor-3sg': 'pyet',
});
verb('njoh', {
    'pres-2sg': 'njeh', 'pres-2pl': 'njihni',
    'impf-1sg': 'njihja', 'impf-2sg': 'njihje', 'impf-3sg': 'njihte', 'impf-1pl': 'njihnim', 'impf-2pl': 'njihnit', 'impf-3pl': 'njihnin',
    'imp-2sg': 'njih',
    'np-pres-1sg': 'njihem', 'np-pres-2sg': 'njihesh', 'np-pres-3sg': 'njihet', 'np-pres-1pl': 'njihemi', 'np-pres-2pl': 'njiheni', 'np-pres-3pl': 'njihen',
    'np-impf-3sg': 'njihej', 'np-impf-3pl': 'njiheshin',
});
verb('vdes', {
    'pres-2pl': 'vdisni',
    'impf-1sg': 'vdisja', 'impf-2sg': 'vdisje', 'impf-3sg': 'vdiste', 'impf-1pl': 'vdisnim', 'impf-2pl': 'vdisnit', 'impf-3pl': 'vdisnin',
    'aor-1sg': 'vdiqa', 'aor-2sg': 'vdiqe', 'aor-3sg': 'vdiq vdiqi', 'aor-1pl': 'vdiqëm', 'aor-2pl': 'vdiqët', 'aor-3pl': 'vdiqën',
    'ptcp': 'vdekur', 'imp-2sg': 'vdis',
});
// The e/je verbs with i in the present plural, imperfect and imperative, o in
// the aorist: hedh, heq, zgjedh, mbledh, sjell, mbjell, vjell, djeg, ndjek,
// pjek, nxjerr, and ndez, vesh with i only.
for (const [lemma, i, o] of [
    ['hedh', 'hidh', 'hodh'], ['heq', 'hiq', 'hoq'], ['zgjedh', 'zgjidh', 'zgjodh'], ['mbledh', 'mblidh', 'mblodh'],
    ['sjell', 'sill', 'soll'], ['mbjell', 'mbill', 'mboll'], ['vjell', 'vill', 'voll'], ['djeg', 'digj', 'dogj'],
    ['ndjek', 'ndiq', 'ndoq'], ['pjek', 'piq', 'poq'], ['nxjerr', 'nxirr', 'nxor'], ['ndez', 'ndiz', null], ['vesh', 'vish', null],
    ['bredh', 'bridh', 'brodh'], ['vjedh', 'vidh', 'vodh'], ['pjell', 'pill', 'poll'], ['mjel', 'mil', 'mol'], ['vjel', 'vil', 'vol'],
    ['tjerr', 'tirr', 'torr'],
]) {
    const table = {
        'pres-2pl': `${i}ni`,
        'impf-1sg': `${i}ja`, 'impf-2sg': `${i}je`, 'impf-3sg': `${i}te`, 'impf-1pl': `${i}nim`, 'impf-2pl': `${i}nit`, 'impf-3pl': `${i}nin`,
        'imp-2sg': i,
        'np-pres-1sg': `${i}em`, 'np-pres-2sg': `${i}esh`, 'np-pres-3sg': `${i}et`, 'np-pres-1pl': `${i}emi`, 'np-pres-2pl': `${i}eni`, 'np-pres-3pl': `${i}en`,
        'np-impf-1sg': `${i}esha`, 'np-impf-3sg': `${i}ej`, 'np-impf-3pl': `${i}eshin`,
    };
    if (o !== null) {
        Object.assign(table, {
            'aor-1sg': `${o}a`, 'aor-2sg': `${o}e`, 'aor-3sg': `${o}i`, 'aor-1pl': `${o}ëm`, 'aor-2pl': `${o}ët`, 'aor-3pl': `${o}ën`,
            'np-aor-3sg': o,
        });
    }
    verb(lemma, table);
}
// iki, eci, hipi: a consonant stem with -i in the first person singular.
for (const stem of ['ik', 'ec', 'hip']) {
    verb(`${stem}i`, {
        'pres-2sg': `${stem}ën`, 'pres-1pl': `${stem}im`, 'pres-2pl': `${stem}ni`, 'pres-3pl': `${stem}in`,
        'impf-1sg': `${stem}ja`, 'impf-2sg': `${stem}je`, 'impf-3sg': `${stem}te`, 'impf-1pl': `${stem}nim`, 'impf-2pl': `${stem}nit`, 'impf-3pl': `${stem}nin`,
        'aor-1sg': `${stem}a`, 'aor-2sg': `${stem}e`, 'aor-3sg': `${stem}u ${stem}i`, 'aor-1pl': `${stem}ëm`, 'aor-2pl': `${stem}ët`, 'aor-3pl': `${stem}ën`,
        'sbjv-2sg': `${stem}ësh`, 'sbjv-3sg': `${stem}ë`,
        'opt-1sg': `${stem}sha`, 'opt-2sg': `${stem}sh`, 'opt-3sg': `${stem}të`, 'opt-1pl': `${stem}shim`, 'opt-2pl': `${stem}shi ${stem}shit`, 'opt-3pl': `${stem}shin`,
        'ptcp': `${stem}ur`, 'imp-2sg': stem,
    });
}
verb('godas', {
    'pres-2sg': 'godet', 'pres-2pl': 'goditni',
    'impf-1sg': 'goditja', 'impf-2sg': 'goditje', 'impf-3sg': 'godiste', 'impf-1pl': 'goditnim', 'impf-2pl': 'goditnit', 'impf-3pl': 'goditnin',
    'aor-1sg': 'godita', 'aor-2sg': 'godite', 'aor-3sg': 'goditi', 'aor-1pl': 'goditëm', 'aor-2pl': 'goditët', 'aor-3pl': 'goditën',
    'ptcp': 'goditur', 'imp-2sg': 'godit', 'np-pres-3sg': 'goditet', 'np-pres-3pl': 'goditen', 'np-aor-3sg': 'godit',
});
for (const [lemma, t, third] of [['humbas', 'humbit', 'humbet'], ['stërvis', 'stërvit', 'stërvit']]) {
    verb(lemma, {
        'pres-2sg': third, 'pres-2pl': `${t}ni`,
        'impf-1sg': `${t}ja`, 'impf-2sg': `${t}je`, 'impf-3sg': `${t.slice(0, -1)}ste ${t}te`, 'impf-1pl': `${t}nim`, 'impf-2pl': `${t}nit`, 'impf-3pl': `${t}nin`,
        'imp-2sg': t, 'np-pres-3sg': `${t}et`, 'np-pres-3pl': `${t}en`,
    });
}
for (const lemma of ['arrij', 'mbërrij']) {
    const t = lemma.slice(0, -1);
    verb(lemma, {
        'aor-1sg': `${t}ta`, 'aor-2sg': `${t}te`, 'aor-3sg': `${t}ti`, 'aor-1pl': `${t}tëm`, 'aor-2pl': `${t}tët`, 'aor-3pl': `${t}tën`,
        'ptcp': `${t}tur`,
    });
}
verb('rrah', {
    'pres-2sg': 'rreh', 'pres-2pl': 'rrihni',
    'impf-1sg': 'rrihja', 'impf-2sg': 'rrihje', 'impf-3sg': 'rrihte', 'impf-1pl': 'rrihnim', 'impf-2pl': 'rrihnit', 'impf-3pl': 'rrihnin',
    'imp-2sg': 'rrih', 'np-pres-3sg': 'rrihet', 'np-pres-3pl': 'rrihen',
});
verb('gjej', {
    'aor-1sg': 'gjeta', 'aor-2sg': 'gjete', 'aor-3sg': 'gjeti', 'aor-1pl': 'gjetëm', 'aor-2pl': 'gjetët', 'aor-3pl': 'gjetën',
    'ptcp': 'gjetur', 'np-aor-3sg': 'gjet',
});
// gjendem (to be located) is the non-active of gjej; a dictionary may list
// only gjej.
for (const lemma of ['gjendem', 'gjej']) {
    verb(lemma, {'np-pres-1sg': 'gjendem', 'np-pres-2sg': 'gjendesh', 'np-pres-3sg': 'gjendet', 'np-pres-1pl': 'gjendemi', 'np-pres-2pl': 'gjendeni', 'np-pres-3pl': 'gjenden',
        'np-impf-1sg': 'gjendesha', 'np-impf-3sg': 'gjendej', 'np-impf-3pl': 'gjendeshin'});
}
verb('ngre', {
    'pres-1pl': 'ngremë', 'pres-2pl': 'ngrini', 'pres-3pl': 'ngrenë',
    'impf-1sg': 'ngrija', 'impf-2sg': 'ngrije', 'impf-3sg': 'ngrinte', 'impf-1pl': 'ngrinim', 'impf-2pl': 'ngrinit', 'impf-3pl': 'ngrinin',
    'aor-1sg': 'ngrita', 'aor-2sg': 'ngrite', 'aor-3sg': 'ngriti', 'aor-1pl': 'ngritëm', 'aor-2pl': 'ngritët', 'aor-3pl': 'ngritën',
    'sbjv-2sg': 'ngresh', 'sbjv-3sg': 'ngrejë',
    'ptcp': 'ngritur', 'imp-2sg': 'ngri',
    'np-pres-3sg': 'ngrihet', 'np-pres-3pl': 'ngrihen', 'np-impf-3sg': 'ngrihej', 'np-imp-2sg': 'ngrihu',
    'np-aor-3sg': 'ngrit',
});
verb('ngrihem', {
    'np-pres-2sg': 'ngrihesh', 'np-pres-3sg': 'ngrihet', 'np-pres-1pl': 'ngrihemi', 'np-pres-2pl': 'ngriheni', 'np-pres-3pl': 'ngrihen',
    'np-impf-3sg': 'ngrihej', 'np-imp-2sg': 'ngrihu', 'np-imp-2pl': 'ngrihuni', 'np-aor-3sg': 'ngrit',
});
// The non-active aorist of ngrihem (u ngrita ... u ngritën) is u with the
// active aorist of ngre, whose stem ends in a consonant the circumfix would
// read as ngritem.
for (const [p, form] of [['1sg', 'u ngrita'], ['2sg', 'u ngrite'], ['1pl', 'u ngritëm'], ['2pl', 'u ngritët'], ['3pl', 'u ngritën']]) {
    add(`aor-${p}`, {type: 'wholeWord', inflected: form, deinflected: 'ngrihem', conditionsIn: [], conditionsOut: V});
}
verb('blej', {
    'pres-2pl': 'blini', 'imp-2sg': 'bli', 'ptcp': 'blerë',
    'impf-1sg': 'blija', 'impf-2sg': 'blije', 'impf-3sg': 'blinte', 'impf-1pl': 'blinim', 'impf-2pl': 'blinit', 'impf-3pl': 'blinin',
    'np-pres-1sg': 'blihem', 'np-pres-2sg': 'blihesh', 'np-pres-3sg': 'blihet', 'np-pres-1pl': 'blihemi', 'np-pres-2pl': 'bliheni', 'np-pres-3pl': 'blihen',
    'np-impf-3sg': 'blihej', 'np-aor-3sg': 'ble',
});
verb('vete', {
    'pres-1pl': 'vemi', 'pres-2pl': 'veni', 'pres-3pl': 'venë',
    'aor-1sg': 'vajta', 'aor-2sg': 'vajte', 'aor-3sg': 'vajti', 'aor-1pl': 'vajtëm', 'aor-2pl': 'vajtët', 'aor-3pl': 'vajtën',
    'ptcp': 'vajtur',
});
verb('duhem', {'np-pres-3pl': 'duhen', 'np-impf-3sg': 'duhej', 'np-impf-3pl': 'duheshin'});
verb('duhet', {'np-impf-3sg': 'duhej'});

// --- Output -------------------------------------------------------------------------
for (const t of transforms) {
    if (t.rules.length === 0) { throw new Error(`transform ${t.id} has no rules`); }
}
// File order decides ties a dictionary's rows leave (docs/languages.md 9.6):
// nouns (and the contractions) first, then verbs, then adjectives. Measured
// on the Wikipedia texts and the frequent words: adjectives after verbs fix
// dalin (dal, not dalë) and të mundur (mund) and lose të tretë (tretë);
// verbs before nouns would lose toka (tokë) and more.
const isAdjective = (t) => t.id.startsWith('adj-') || t.id === 'art' || t.id === 'cmp';
const ordered = [...transforms.filter((t) => !isAdjective(t)), ...transforms.filter(isAdjective)];
const out = {schema: 1, conditions, transforms: ordered};
writeFileSync(join(here, 'own.json'), formatTransforms(out));
const count = transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`sq: ${transforms.length} transforms, ${count} rules in languages/sq/sources/own.json`);
