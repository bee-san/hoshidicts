#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/aii/sources/own.json: the Assyrian Neo-Aramaic deinflection
// rules written for this pack (docs/languages.md, section 14 step 2). Run from
// the repository root:
//
//   node languages/aii/sources/own-rules.mjs
//
// Yomitan has no deinflection rules for Assyrian Neo-Aramaic (d3c54c1 has only
// a diacritics preprocessor in ext/js/language/aii/), so these rules are the
// pack's whole rule set.
//
// The rules work on the consonantal skeleton. Wiktionary, and so the
// wiktionary-to-yomitan dictionaries, writes every lemma headword without
// vowel points (ܟܬܒܐ, ܦܬܚ), and much modern text is written without them;
// the pack's preprocessors remove vowel points and other marks, and these
// rules then map the unpointed inflected form to the unpointed lemma. A
// pointed word whose inflected form the dictionary lists (its form-of rows,
// such as ܦܬ݂ܝܼܚ ܠܝܼ → ܦܬܚ) is found as written. Every rule except the
// proclitics therefore requires a stem of bare letters (`{letter}`), which
// also keeps it to one word: no rule reads the last word of a longer phrase.
//
// The paradigms follow the standard (Urmian-based) literary language as
// Wiktionary's conjugation and declension tables give it (Template:aii-conj,
// Template:aii-infl-noun, Template:aii-infl-prep) and the descriptions of
// Tsereteli (1978), Odisho (1988) and Khan (2016, The Neo-Aramaic Dialect of
// the Assyrian Christians of Urmi). Lemmas, as in Wiktionary:
//   - verbs: the third person masculine singular of the non-past base, which
//     for Stem I is the root (ܦܵܬ݂ܹܚ pāṯēḥ → ܦܬܚ), for Stems II and III ܡ +
//     the root (ܡܦܲܚܸܠ, ܡܲܪܝܸܡ → ܡܦܚܠ, ܡܪܝܡ), for quadriliteral verbs ܡ +
//     four letters (ܡܬܲܪܓܸܡ → ܡܬܪܓܡ), and for verbs whose last radical is
//     weak a final ܐ (ܕܵܪܹܐ → ܕܪܐ, ܡܲܣܬܹܐ → ܡܣܬܐ);
//   - nouns and adjectives: the emphatic singular in -ā (ܟܲܠܒܵܐ → ܟܠܒܐ,
//     ܡܲܠܟܬ݂ܵܐ → ܡܠܟܬܐ);
//   - prepositions: the bare preposition (ܥܲܠ, ܓܵܘ); the proclitic ones are
//     written with a hyphen (ܒ-, ܕ-, ܠ-, ܘ-).
//
// Conditions keep the analyses to the chains the grammar has: proclitics
// first, then an L-suffix, then one subject ending or one other ending, then
// one stem alternation (past base, hollow verb). A rule with conditionsIn []
// applies only to the text as written and after a proclitic (section 7.2).
// wiktionary-to-yomitan leaves the `rules` column of its Assyrian Neo-Aramaic
// dictionaries empty (all 82,731 rows of wty-aii-en 2026.10.22), so the pack
// sets `lookup.untaggedTerms: "pass"`: such a row matches every condition
// below (docs/languages.md 9.4), and the conditions still decide which rule
// reads which output; v and n are also what a dictionary that tags verbs and
// nouns would use.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// The 22 letters of the Syriac alphabet as Assyrian Neo-Aramaic writes it.
const LETTERS = [...'ܐܒܓܕܗܘܙܚܛܝܟܠܡܢܣܥܦܨܩܪܫܬ'];
// A root whose last radical is ܐ is a verb in -ē, with paradigms of its own,
// so ܐ is never the last radical of a strong form.
const RADICALS = LETTERS.filter((c) => c !== 'ܐ');
const LETTER = '{letter}';

const conditions = {
    v: {name: 'Verb', isDictionaryForm: true, subConditions: ['v_l', 'v_s', 'v_f']},
    v_l: {name: 'Verb without its L-suffix', isDictionaryForm: false},
    v_s: {name: 'Verb stem without its subject ending', isDictionaryForm: false},
    v_f: {name: 'Verb in its dictionary form', isDictionaryForm: false},
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['n_p', 'n_f']},
    n_p: {name: 'Noun without its possessive suffix', isDictionaryForm: false},
    n_f: {name: 'Noun in its dictionary form', isDictionaryForm: false},
    adj: {name: 'Adjective', isDictionaryForm: true},
    prep: {name: 'Preposition', isDictionaryForm: true},
};

const transforms = [];
const byId = new Map();

function transform(id, name, description, {optional = false} = {}) {
    if (byId.has(id)) { throw new Error(`transform ${id} defined twice`); }
    const t = {id, name, description, source: 'own'};
    if (optional) { t.optional = true; }
    t.rules = [];
    transforms.push(t);
    byId.set(id, t);
    return t;
}

function rule(id, r) {
    const t = byId.get(id);
    if (t === undefined) { throw new Error(`no transform ${id}`); }
    const key = JSON.stringify(r);
    if (t.rules.some((x) => JSON.stringify(x) === key)) { throw new Error(`duplicate rule in ${id}: ${key}`); }
    t.rules.push(r);
}

/** A suffix rule on a stem of bare letters (one unpointed word). */
function suffix(id, inflected, deinflected, conditionsIn, conditionsOut, {minStem = 2, ...extra} = {}) {
    rule(id, {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, stemMinLength: minStem, stemCharacters: LETTER, ...extra});
}

// What each kind of rule takes and gives.
const ANY = [];               // the text as written, or after a proclitic
const AFTER_L = ['v_l'];      // also a verb whose L-suffix was removed
const STEM = ['v_l', 'v_s'];  // also a verb stem whose subject ending was removed
const VERB = ['v_f'];
const VSTEM = ['v_s'];

// --- Proclitics ---------------------------------------------------------------
// One-letter conjunctions and prepositions written together with the next
// word: ܘ- (and), ܕ- (of; that, which), ܒ- (in, with, by; also the gerund
// ܒ- + infinitive), ܠ- (to, for; also the object marker), and ܟ- / ܒܕ- of
// the indicative and the future written together with a verb. They stack
// (ܘܕܒܒܲܝܬܵܐ, and that in the house). Each applies to the text as written,
// so a pointed word after the proclitic (ܒܒܵܬܹ̈ܐ) can still meet its form-of
// row; the stem must start with a letter (not a vowel point on the
// proclitic, ܒܸܦܬ݂ܵܚܵܐ), and the word left has at least two letters.
function proclitic(id, name, description, inflected, deinflected) {
    transform(id, name, description);
    rule(id, {type: 'prefix', inflected, deinflected, conditionsIn: ANY, conditionsOut: [], stemMinLength: 2, stemStartsWith: LETTER});
}
proclitic('w-', 'ܘ- (and)', 'The conjunction ܘ- (w-, and), written together with the next word.', 'ܘ', '');
proclitic('d-', 'ܕ- (of, that)', 'The proclitic ܕ- (d-): of (the genitive), that, which (relative and subordinating), written together with the next word.', 'ܕ', '');
proclitic('b-', 'ܒ- (in, with)', 'The preposition ܒ- (b-, in, with, by), written together with the next word; before an infinitive it makes the gerund of the progressive (ܝܠܹܗ ܒܡܲܪܝܘܿܡܹܐ, he is raising).', 'ܒ', '');
proclitic('l-', 'ܠ- (to, for)', 'The preposition ܠ- (l-, to, for; also the marker of a definite object), written together with the next word.', 'ܠ', '');
// The vowel after ܟܐ is the verb's (ܟܐܵܙܹܠ: ܐܵ), so the stem may start with it.
transform('k-', 'ܟ- (indicative)', 'The indicative particle ܟܹܐ (kē) written together with a verb that starts with ܐ (ܟܐܵܙܹܠ, he goes).');
rule('k-', {type: 'prefix', inflected: 'ܟܐ', deinflected: 'ܐ', conditionsIn: ANY, conditionsOut: [], stemMinLength: 2});
proclitic('bd-', 'ܒܕ- (future)', 'The future particle ܒܸܬ (bit), shortened to ܒܕ- and written together with the verb (ܒܕܐܵܙܹܠ, he will go).', 'ܒܕ', '');

// --- L-suffixes -------------------------------------------------------------------
// ܠ- with a pronoun suffix: the agent of a past verb (ܦܬ݂ܝܼܚ ܠܝܼ, I opened)
// or the object of a non-past verb or an imperative (ܟܹܐ ܦܵܬ݂ܚܵܐ ܠܹܗ, she
// opens it). The standard spelling writes it as a separate word; the joined
// spellings are optional transforms below. The verb before it may already be
// the dictionary form (ܦܵܬ݂ܹܚ ܠܹܗ, he opens it; ܕܪܹܐ ܠܹܗ, he put), so the
// output is looked up as it is and also read by the verb rules.
const L_SUFFIXES = [
    ['l1s', 'ܠܝ', '-ܠܝ (I, me)', 'first person singular: the agent of a past verb (I), or the object (me)'],
    ['l2ms', 'ܠܘܟ', '-ܠܘܟ (you, m.)', 'second person masculine singular: the agent of a past verb (you), or the object (you)'],
    ['l2fs', 'ܠܟܝ', '-ܠܟܝ (you, f.)', 'second person feminine singular: the agent of a past verb (you), or the object (you)'],
    ['l3s', 'ܠܗ', '-ܠܗ (he, she; him, her)', 'third person singular, masculine ܠܹܗ or feminine ܠܵܗ̇ (the same letters): the agent of a past verb (he, she), or the object (him, her, it)'],
    ['l1p', 'ܠܢ', '-ܠܢ (we, us)', 'first person plural: the agent of a past verb (we), or the object (us)'],
    ['l2p', 'ܠܘܟܘܢ', '-ܠܘܟܘܢ (you, pl.)', 'second person plural: the agent of a past verb (you), or the object (you)'],
    ['l3p', 'ܠܗܘܢ', '-ܠܗܘܢ (they, them)', 'third person plural: the agent of a past verb (they), or the object (them)'],
];
for (const [id, letters, name, meaning] of L_SUFFIXES) {
    transform(id, name, `The L-suffix of the ${meaning}, written after the verb.`);
    suffix(id, ` ${letters}`, '', ANY, ['v_l']);
}
// Biblical style: ܠܟ݂ܘܿܢ for ܠܲܘܟ݂ܘܿܢ, ܠܗܹܝܢ for feminine them.
suffix('l2p', ' ܠܟܘܢ', '', ANY, ['v_l']);
suffix('l3p', ' ܠܗܝܢ', '', ANY, ['v_l']);

// The past of a Stem I verb in one step: the past base and the L-suffix
// (ܦܬ݂ܝܼܚ ܠܹܗ, he opened), and that of a hollow verb (ܨܝܼܡ ܠܹܗ, he fasted).
// The two steps above reach the same verb, but the past base with the
// L-suffix removed is sometimes a headword of its own (ܟܬܝܼܒ݂, written), and a
// reading in fewer steps comes first (docs/languages.md 9.6).
const PAST_NAMES = {l1s: 'past (I)', l2ms: 'past (you, m.)', l2fs: 'past (you, f.)', l3s: 'past (he, she)', l1p: 'past (we)', l2p: 'past (you, pl.)', l3p: 'past (they)'};
for (const [id, letters, , meaning] of L_SUFFIXES) {
    const pid = 'past' + id.slice(1);
    transform(pid, PAST_NAMES[id], `The past of a Stem I or hollow verb: the past base, with ܝ before the last radical, and the L-suffix of the ${meaning.split(':')[0]} (ܦܬ݂ܝܼܚ ܠܹܗ, he opened; ܨܝܼܡ ܠܹܗ, he fasted).`);
    const spellings = [` ${letters}`];
    if (id === 'l2p') { spellings.push(' ܠܟܘܢ'); }
    if (id === 'l3p') { spellings.push(' ܠܗܝܢ'); }
    for (const l of spellings) {
        for (const c of RADICALS) {
            suffix(pid, `ܝ${c}${l}`, c, ANY, VERB, {minStem: 2});
            suffix(pid, `ܝ${c}${l}`, `ܐ${c}`, ANY, VERB, {minStem: 1});
        }
    }
}

// Joined to the verb (ܦܬ݂ܝܼܚܠܹܗ). The Urmia Bible of 1893 and informal
// writing do this (in the Urmia Bible the third person masculine is ܠܹܐ:
// ܦܪܸܫܠܹܐ, he separated; ܚܙܹܠܹܐ, he saw, where a verb in -ē drops its ܐ;
// the third person plural ܠܘܿܢ).
// Off by default: many nouns end in the same letters (ܚܲܝܠܵܐ, strength;
// ܚܲܝܠܹܗ, his strength), and the standard spelling writes the L-suffix as
// a word of its own.
transform('lJoined', 'L-suffix (joined)', 'An L-suffix written together with the verb (ܦܬ݂ܝܼܚܠܹܗ, he opened; ܦܪܸܫܠܹܐ and ܚܙܹܠܹܐ in the Urmia Bible), as older and informal writing does.', {optional: true});
for (const [, letters] of L_SUFFIXES) {
    suffix('lJoined', letters, '', ANY, ['v_l']);
    suffix('lJoined', letters, 'ܐ', ANY, ['v_l'], {stemNotEndsWith: '[ܐ]'});
}
suffix('lJoined', 'ܠܐ', '', ANY, ['v_l'], {stemNotEndsWith: '[ܐ]'});
suffix('lJoined', 'ܠܐ', 'ܐ', ANY, ['v_l'], {stemNotEndsWith: '[ܐ]'});
suffix('lJoined', 'ܠܟܘܢ', '', ANY, ['v_l']);
// The Urmia Bible's third person plural is ܠܘܿܢ (ܐ݇ܬܹܠܘܿܢ, they came; ܫܩܸܠܘܿܢ,
// they took).
suffix('lJoined', 'ܠܘܢ', '', ANY, ['v_l']);
suffix('lJoined', 'ܠܘܢ', 'ܐ', ANY, ['v_l'], {stemNotEndsWith: '[ܐ]'});

// --- Stem alternations ----------------------------------------------------------
// After an L-suffix or a subject ending was removed, or in a bare word. They
// come before the subject endings in this file: where a past base and an
// ending read the same letters (ܦܬܝܚ, the past base of ܦܬܚ, or ܦܬܐ + -īḥ),
// the reading found first comes first on a tie (docs/languages.md 9.6), and
// the Stem I past base is the far more frequent of the two.
// Stem I past base: ܝ before the last radical (ܦܬ݂ܝܼܚ from ܦܬܚ). With an
// L-suffix it is the past (ܦܬ݂ܝܼܚ ܠܹܗ, he opened), with the subject endings
// above or alone the passive past (ܦܬ݂ܝܼܚܵܐ, she was opened; ܦܬ݂ܝܼܚ, it was
// opened).
transform('pastBase', 'past base', 'The past base of a Stem I verb, with ܝ before the last radical (ܦܬ݂ܝܼܚ ܠܹܗ, he opened; ܦܬ݂ܝܼܚ, it was opened).');
for (const c of RADICALS) {
    suffix('pastBase', `ܝ${c}`, c, STEM, VERB, {minStem: 2});
}
// Hollow verbs (middle radical ܐ: ܨܵܐܹܡ, to fast; ܩܵܐܹܡ, to rise) write ܝ
// for the ܐ before an ending and in the past base (ܨܵܝܡܵܐ, she fasts; ܨܝܼܡ
// ܠܹܗ, he fasted). The stem before ܝ is the first radical.
transform('hollow', 'hollow verb', 'A verb whose middle radical is ܐ writes ܝ for it before an ending and in the past (ܨܵܝܡܵܐ she fasts, ܨܝܼܡ ܠܹܗ he fasted, from ܨܵܐܹܡ).');
for (const c of RADICALS) {
    suffix('hollow', `ܝ${c}`, `ܐ${c}`, STEM, VERB, {minStem: 1});
}
// Stems II and III and quadriliterals: the past base puts ܘ after the first
// radical (Stem II and quadriliterals: ܡܦܲܚܸܠ → ܡܦܘܼܚܸܠ, ܡܬܲܪܓܸܡ →
// ܡܬܘܼܪܓܸܡ) or after the ܡ (Stem III: ܡܲܪܝܸܡ → ܡܘܼܪܝܸܡ).
transform('pastBaseM', 'past base (Stems II/III)', 'The past base of a Stem II, Stem III or quadriliteral verb, with ܘ after ܡ or after the first radical (ܡܦܘܼܚܸܠ ܠܹܗ, ܡܘܼܪܝܸܡ ܠܹܗ, ܡܬܘܼܪܓܸܡ ܠܹܗ).');
rule('pastBaseM', {type: 'prefix', inflected: 'ܡܘ', deinflected: 'ܡ', conditionsIn: STEM, conditionsOut: VERB, stemMinLength: 2, stemCharacters: LETTER});
for (const c of LETTERS) {
    rule('pastBaseM', {type: 'prefix', inflected: `ܡ${c}ܘ`, deinflected: `ܡ${c}`, conditionsIn: STEM, conditionsOut: VERB, stemMinLength: 1, stemCharacters: LETTER});
}
// The Urmia Bible writes the past of a Stem II verb without the ܡ, with the
// L-suffix joined (ܬܘܼܪܸܨܠܹܐ, he made, from ܡܬܲܪܸܨ). Optional, with the
// joined L-suffixes; one rule for the whole word, so that a word that only
// starts like it (ܛܘܼܪܵܐ, mountain) is not read as ܡ + root (ܡܛܪܐ, rain).
transform('pastBaseUrmia', 'past (Stem II, Urmia)', 'The past of a Stem II verb written without ܡ and with the L-suffix joined, as the Urmia Bible of 1893 writes it (ܬܘܼܪܸܨܠܹܐ, he made, from ܡܬܲܪܸܨ).', {optional: true});
rule('pastBaseUrmia', {type: 'circumfix', prefixes: LETTERS.map((c) => [`${c}ܘ`, `ܡ${c}`]),
    suffixes: [...L_SUFFIXES.map(([, letters]) => [letters, '']), ['ܠܐ', ''], ['ܠܟܘܢ', ''], ['ܠܘܢ', '']],
    conditionsIn: ANY, conditionsOut: VERB, stemMinLength: 2, stemCharacters: LETTER});
// Reflexive-passive verbs in ܡܬ- (ܡܸܬ݂ܟܬ݂ܹܒ݂, to be written) put ܘ before
// the last radical in the passive past and the participle (ܡܸܬ݂ܟܬ݂ܘܼܒ݂ܸܢ, I
// was written; ܡܸܬ݂ܟܬ݂ܘܼܒ݂ܵܐ).
transform('pastBaseMt', 'past base (ܡܬ- verbs)', 'The passive past base of a reflexive-passive verb in ܡܬ-, with ܘ before the last radical (ܡܸܬ݂ܟܬ݂ܘܼܒ݂ܸܢ, I was written, from ܡܸܬ݂ܟܬ݂ܹܒ݂).');
for (const c of RADICALS) {
    suffix('pastBaseMt', `ܘ${c}`, c, STEM, VERB, {minStem: 3, stemStartsWithText: 'ܡܬ'});
    suffix('pastBaseMt', `ܘ${c}ܐ`, c, AFTER_L, VERB, {minStem: 3, stemStartsWithText: 'ܡܬ'});
}

// --- Non-past (present) -------------------------------------------------------
// Subject endings on the non-past base (Wiktionary's "active non-past"),
// which is the lemma: ܦܵܬ݂ܚܵܐ (she opens), ܦܵܬ݂ܚܝܼ (they), ܦܵܬ݂ܚܹܬ (you m.),
// ܦܵܬ݂ܚܵܬܝ (you f.), ܦܵܬ݂ܚܝܼܬܘܿܢ (you pl.), ܦܵܬ݂ܚܹܢ / ܦܵܬ݂ܚܵܢ (I m. / f.),
// ܦܵܬ݂ܚܲܚ (we). The same endings make the passive past on the past base
// (ܦܬ݂ܝܼܚܵܐ, she was opened; below). A root has at least three letters, so
// the stem here does too. Biblical style also has -īn for they (ܕܵܥܪܝܼܢ).
// -ā is also the emphatic ending of nouns and the infinitive of Stem I
// (ܦܬ݂ܵܚܵܐ, to open), which has the letters of the third person feminine.
const PERSON = [
    ['3fs', 'ܐ', '-ā (she; infinitive)', 'Third person feminine singular of the non-past or the passive past (ܦܵܬ݂ܚܵܐ, she opens), and the infinitive of a Stem I verb (ܦܬ݂ܵܚܵܐ, to open), which has the same letters.'],
    ['3p', 'ܝ', '-ī (they)', 'Third person plural of the non-past or the passive past (ܦܵܬ݂ܚܝܼ, they open).'],
    ['2ms', 'ܬ', '-et (you, m.)', 'Second person masculine singular of the non-past or the passive past (ܦܵܬ݂ܚܹܬ, you open).'],
    ['2fs', 'ܬܝ', '-at (you, f.)', 'Second person feminine singular of the non-past or the passive past (ܦܵܬ݂ܚܵܬܝ, you open).'],
    ['2p', 'ܝܬܘܢ', '-ītōn (you, pl.)', 'Second person plural of the non-past or the passive past (ܦܵܬ݂ܚܝܼܬܘܿܢ, you open).'],
    ['1s', 'ܢ', '-ēn, -ān (I)', 'First person singular of the non-past or the passive past, masculine -ēn or feminine -ān (ܦܵܬ݂ܚܹܢ, I open).'],
    ['1p', 'ܚ', '-aḥ (we)', 'First person plural of the non-past or the passive past (ܦܵܬ݂ܚܲܚ, we open).'],
];
for (const [id, ending, name, description] of PERSON) {
    transform(id, name, description);
    suffix(id, ending, '', AFTER_L, VSTEM, {minStem: 3});
}
suffix('3p', 'ܝܢ', '', AFTER_L, VSTEM, {minStem: 3});
// Verbs in -ē (third radical weak: ܕܵܪܹܐ, ܒܵܢܹܐ, ܡܲܣܬܹܐ): ܐ becomes ܝ before
// the endings (ܕܵܪܝܵܐ, ܕܵܪܝܼ, ܕܵܪܹܝܬ, ܕܵܪܝܵܬܝ, ܕܵܪܲܝܬܘܿܢ, ܕܵܪܹܝܢ, ܕܵܪܹܝܚ;
// the infinitive ܕܪܵܝܵܐ), so the lemma's ܐ comes back.
// The stem of such a verb is two letters (Stem I: ܕܪ-), or ܡ and two to
// four (Stems II and III, quadriliterals, and their past bases: ܡܣܬ-,
// ܡܦܪܡ-, ܡܣܘܘܣ-), so these are patterns of that shape: a longer word in
// -āyā is a nisba adjective (ܐܵܬ݂ܘܿܪܵܝܵܐ, Assyrian), not the feminine of a
// verb in -ē (ܐܬܘܪܐ, Assyria).
const PL = '[\\u0710-\\u072C]';
const WEAK_STEM = `(${PL}{2}|ܡ${PL}{2,4})`;
for (const [id, ending] of [['3fs', 'ܝܐ'], ['3p', 'ܝ'], ['2ms', 'ܝܬ'], ['2fs', 'ܝܬܝ'], ['2p', 'ܝܬܘܢ'], ['1s', 'ܝܢ'], ['1p', 'ܝܚ'], ['3p', 'ܝܢ']]) {
    rule(id, {type: 'pattern', pattern: `^${WEAK_STEM}${ending}$`, replacement: '$1ܐ', anchorSuffix: ending, conditionsIn: AFTER_L, conditionsOut: VSTEM});
}
// Pointed text tells the non-past of a Stem I verb from a noun with the same
// letters: ܦܵܬ݂ܚܵܐ (pāṯḥā, she opens) has ā after the first radical and no
// vowel after the second, ܦܬ݂ܵܚܵܐ (pṯāḥā, opening) does not. These patterns
// read the pointed word as written, so the verb is found without removing
// the points and comes before a noun the unpointed letters spell (section
// 9.6: fewer processor steps first). C is a radical; N the marks that are
// not vowels (rukkakha, qushshaya, the tilde and breve of ܓ̰ ܟ̰ ܦ̮, dots,
// seyame, talqana); a vowel point is one code point.
const C = '([\\u0710\\u0712-\\u072C])';
// The middle radical of the strong pattern: not ܝ, which in this position is
// a hollow verb's (ܨܵܝܡܵܐ, from ܨܵܐܹܡ).
const C2 = '([\\u0710\\u0712-\\u071C\\u071E-\\u072C])';
// The last radical of the strong and hollow patterns: not ܝ either. A verb
// whose last radical is weak is a verb in -ē, which the patterns below read
// (ܕܵܪܝܵܐ, she puts, is ܕܪܐ, not ܕܪܝ; ܐܵܕܝܵܐ, now, is no verb at all); of
// wty-aii-en's three-letter verb headwords only ܣܓܝ ends in ܝ, and the
// unpointed suffix rules reach it.
const C3 = C2;
const N = '[\\u0303\\u0307\\u0308\\u0323\\u032E\\u0330\\u0740-\\u0742\\u0747]*';
const A = '\\u0735';  // zqapha, ā
const POINTED = [
    // [transform, pointed ending (anchor), strong: replacement, weak ending]
    ['3fs', '\u0735\u0710'],
    ['3p', '\u071D\u073C'],
    ['2ms', '\u0739\u072C'],
    ['2fs', '\u0735\u072C\u071D'],
    ['2p', '\u071D\u073C\u072C\u0718\u073F\u0722'],
    ['1s', '\u0739\u0722'],
    ['1s', '\u0735\u0722'],
    ['1p', '\u0732\u071A'],
    // The Urmia Bible and colloquial writing spell the first person
    // masculine and the second person masculine with zlama, -in and -it
    // (ܦܵܝܫܸܢ, I remain; ܐܵܡܪܸܬ, you say).
    ['1s', '\u0738\u0722'],
    ['2ms', '\u0738\u072C'],
];
const esc = (s) => [...s].map((ch) => `\\u${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join('');
// A pattern reads the pointed word as written, so its reading needs no
// processor step and comes before the word's own headword, which needs its
// points removed (docs/languages.md 9.6). That is the point of the patterns
// (ܦܵܬ݂ܚܵܐ, she opens, before ܦܬܚܐ, opening), but a few frequent words of
// these shapes are not verbs. The dictionary's rows have no part of speech
// (lookup.untaggedTerms "pass" gives them every condition), so nothing else
// keeps a pattern's verb reading from finding a noun of the same letters:
// ܡܵܪܝܵܐ (the Lord) would be the feminine of a verb ܡܪܐ, which is the noun
// "lord, master". These words are kept out of the one pattern that reads
// them: the kaikki citation forms that a pattern reads as a lemma of which
// wty-aii-en has no verb (3 of the 5,706 forms; the 8 others a pattern reads
// as another lemma are read as a verb the dictionary has), and the Urmia
// spelling ܐܵܢܝܼ of the pronoun "they" (README, Known gaps).
const NOT_VERBS = {
    '3fs': ['ܡܵܪܝܵܐ'],       // the Lord (ܡܪܝܐ), not she ... (ܡܪܐ, lord)
    '3p': ['ܐܵܢܝܼ'],         // they (ܐܢܝ), not they ... (ܐܢܐ, I)
    '1s': ['ܐܵܡܹܝܢ'],        // amen (ܐܡܝܢ), not I ... (ܐܡܐ, mother)
    '3fs strong': ['ܗܵܕܟ݂ܵܐ'],  // thus (ܗܕܟܐ), not she ... (ܗܕܟ)
};
// Each word is matched with any of the marks N between its letters and
// vowels, as the patterns themselves allow them (ܗܵܕܟ̣ܵܐ with a dot below,
// ܗܵܕܟܵܐ without rukkakha).
const N_MARKS = /[\u0303\u0307\u0308\u0323\u032E\u0330\u0740-\u0742\u0747]/gu;
const tolerant = (w) => [...w.normalize('NFC').replace(N_MARKS, '')].map((ch) => esc(ch) + N).join('');
const notWords = (key) => (NOT_VERBS[key] ? `(?!(?:${NOT_VERBS[key].map(tolerant).join('|')}))` : '');
for (const [id, ending] of POINTED) {
    // Stem I: C ā C C + ending (ܦܵܬ݂ܚܵܐ, ܦܵܬ݂ܚܝܼ, ܦܵܬ݂ܚܹܬ, ...).
    rule(id, {type: 'pattern', pattern: `^${notWords(`${id} strong`)}${C}${N}${A}${N}${C2}${N}${C3}${N}${esc(ending)}$`, replacement: '$1$2$3', anchorSuffix: ending, conditionsIn: ANY, conditionsOut: VERB});
    // Hollow verbs: C ā ܝ C + ending (ܨܵܝܡܵܐ, she fasts, from ܨܵܐܹܡ).
    rule(id, {type: 'pattern', pattern: `^${C}${N}${A}${N}\\u071D${N}${C3}${N}${esc(ending)}$`, replacement: '$1ܐ$2', anchorSuffix: ending, conditionsIn: ANY, conditionsOut: VERB});
}
// Verbs in -ē: C ā C + the endings with ܝ (ܕܵܪܝܵܐ, ܕܵܪܝܼ, ܕܵܪܹܝܬ, ܕܵܪܝܲܬܝ,
// ܕܵܪܲܝܬܘܿܢ, ܕܵܪܹܝܢ, ܕܵܪܝܲܢ, ܕܵܪܹܝܚ, as Wiktionary's tables write them; the
// second person feminine of ܐܵܬ݂ܹܐ, to come, is ܐܵܬ݂ܝܵܬܝ).
for (const [id, ending] of [['3fs', '\u071D\u0735\u0710'], ['3p', '\u071D\u073C'], ['2ms', '\u0739\u071D\u072C'], ['2fs', '\u071D\u0732\u072C\u071D'], ['2fs', '\u071D\u0735\u072C\u071D'],
    ['2p', '\u0732\u071D\u072C\u0718\u073F\u0722'], ['1s', '\u0739\u071D\u0722'], ['1s', '\u071D\u0732\u0722'], ['1p', '\u0739\u071D\u071A']]) {
    const not = ending === '\u071D\u0735\u0710' ? notWords('3fs') : ending === '\u071D\u073C' ? notWords('3p') : ending === '\u0739\u071D\u0722' ? notWords('1s') : '';
    rule(id, {type: 'pattern', pattern: `^${not}${C}${N}${A}${N}${C}${N}${esc(ending)}$`, replacement: '$1$2ܐ', anchorSuffix: ending, conditionsIn: ANY, conditionsOut: VERB});
}

// After a last radical ܪ or ܠ the ܠ of the L-suffix is assimilated and not
// written. Modern prose and Wiktionary's examples write ܐ݇ܡܝܼܪܹܗ (he said)
// and ܐ݇ܡܝܼܪܵܗ̇ (she said) for ܐ݇ܡܝܼܪ ܠܹܗ, ܐ݇ܡܝܼܪ ܠܵܗ̇; the Urmia Bible of
// 1893 writes the past base with zlama and the L-suffix's vowel after the
// radical (ܐ݇ܡܸܪܹܐ he said, ܐ݇ܡܸܪܵܐ she said, ܐ݇ܡܸܪܘܿܢ they said, ܫܩܸܠܹܐ he
// took). These are pointed patterns of a Stem I verb: unpointed, the letters
// are those of a noun (ܐܡܪܐ, lamb; ܐܡܝܪܗ, his emir). The first radical has
// no vowel (a noun of this shape has one: ܐܲܡܝܼܪܹܗ, his emir), there is no
// seyame (a plural: ܒܡܸ̈ܠܹܐ, in words), the first radical is not ܘ (the
// conjunction: ܘܕܸܪܹܐ is ܘ- and ܕܸܪܹܐ, he returned; no root starts with
// ܘ) and the second is not ܐ, so that a proclitic before ܐܸܠ- (to; ܕܐܸܠܝܼ,
// that to me) or the copula ܐܝܼܠܹܗ (ܕܐܝܼܠܹܗ, that he is) is not a root,
// nor ܘ: where it is spoken there, the dictionary writes the root with ܒ
// (ܥܒܪ, to enter; ܓܒܪ, to marry; ܬܒܪ, to break). The Urmia Bible spells
// the past of ܥܒܪ as it is spoken, ܐ݇ܘܸܪܹܐ (he entered), and a rule of its
// own reads it.
transform('pastContracted', 'past (assimilated L-suffix)', 'The past of a Stem I verb whose last radical is ܪ or ܠ, with the ܠ of the L-suffix assimilated: ܐ݇ܡܝܼܪܹܗ, he said (for ܐ݇ܡܝܼܪ ܠܹܗ), and in the Urmia Bible ܐ݇ܡܸܪܹܐ, he said; ܫܩܸܠܘܿܢ, they took.');
{
    const NV = '[\\u0303\\u0307\\u0323\\u032E\\u0330\\u0740-\\u0742\\u0747]*';
    const R1 = '([\\u0710\\u0712-\\u0717\\u0719-\\u072C])';
    const R2 = '([\\u0712-\\u0717\\u0719-\\u072C])';
    const LAST = '([\\u072A\\u0720])';
    // Modern: the past base with ī (ܝܼ), then ēh (he) or āh (she).
    for (const ending of ['\u0739\u0717', '\u0735\u0717\u0307', '\u0735\u0717']) {
        rule('pastContracted', {type: 'pattern', pattern: `^${R1}${NV}${R2}${NV}\\u071D${NV}\\u073C${NV}${LAST}${NV}${esc(ending)}$`, replacement: '$1$2$3', anchorSuffix: ending, conditionsIn: ANY, conditionsOut: VERB});
    }
    // Urmia: zlama before the last radical, then the person's vowel and
    // ending: ē (he), ā (she), ōn (they), ī (I), ūk (you, m.), an (we).
    for (const ending of ['\u0739\u0710', '\u0735\u0710', '\u0718\u073F\u0722', '\u071D\u073C', '\u0718\u073C\u071F', '\u0732\u0722']) {
        rule('pastContracted', {type: 'pattern', pattern: `^${R1}${NV}${R2}${NV}\\u0738${NV}${LAST}${NV}${esc(ending)}$`, replacement: '$1$2$3', anchorSuffix: ending, conditionsIn: ANY, conditionsOut: VERB});
        // ܐ݇ܘܸܪܹܐ, ܐ݇ܘܸܪܘܿܢ (he, they entered), the Urmia spelling of ܥܒܪ.
        rule('pastContracted', {type: 'pattern', pattern: `^\\u0710${NV}\\u0718${NV}\\u0738${NV}\\u072A${NV}${esc(ending)}$`, replacement: 'ܥܒܪ', anchorSuffix: ending, conditionsIn: ANY, conditionsOut: VERB});
    }
}

// --- Participles, imperatives, infinitives ------------------------------------------
// Stem I passive participle: the past base + -ā (masculine and plural) or
// -tā (feminine): ܦܬ݂ܝܼܚܵܐ, ܦܬ݂ܝܼܚܹ̈ܐ, ܦܬ݂ܝܼܚܬܵܐ (opened); with ܝܠܹܗ it makes
// the perfect. With an L-suffix the same base agrees with a feminine or
// plural object (ܦܬ݂ܝܼܚܵܐ ܠܹܗ, he opened it, f.).
transform('passiveParticiple', 'passive participle', 'The passive participle of a Stem I verb, masculine or plural in -ā (ܦܬ݂ܝܼܚܵܐ, ܦܬ݂ܝܼܚܹ̈ܐ, opened); the feminine in -tā (ܦܬ݂ܝܼܚܬܵܐ) is read through the feminine rule first. With ܝܠܹܗ it makes the perfect.');
// The feminine (ܦܬ݂ܝܼܚܬܵܐ) is read through the feminine rule first (adj),
// so that an adjective made from a participle (ܒܪܝܼܟ݂ܬܵܐ, blessed, from
// ܒܪܝܼܟ݂ܵܐ) is found in one step and comes before the verb.
const PARTICIPLE_IN = ['v_l', 'adj'];
for (const c of RADICALS) {
    suffix('passiveParticiple', `ܝ${c}ܐ`, c, PARTICIPLE_IN, VERB, {minStem: 2});
}
// Verbs in -ē: ܕܪܝܼܵܐ (put), from ܕܪܐ. Hollow verbs have ܝ for their ܐ
// (ܒܝܼܙܵܐ, from ܒܵܐܹܙ), as in their non-past.
rule('passiveParticiple', {type: 'pattern', pattern: `^(${PL}{2})ܝܐ$`, replacement: '$1ܐ', anchorSuffix: 'ܝܐ', conditionsIn: PARTICIPLE_IN, conditionsOut: VERB});
for (const c of RADICALS) {
    suffix('passiveParticiple', `ܝ${c}ܐ`, `ܐ${c}`, PARTICIPLE_IN, VERB, {minStem: 1});
}
// Stems II, III and quadriliterals: the past base + -ā, -tā (ܡܦܘܼܚܠܵܐ,
// ܡܘܼܪܝܡܵܐ, ܡܬܘܼܪܓܡܬܵܐ); verbs in -ē + -yā, -ytā (ܡܘܼܣܬܝܵܐ, from ܡܣܬܐ).
transform('passiveParticipleM', 'passive participle (Stems II/III)', 'The passive participle of a Stem II, Stem III or quadriliteral verb: the past base with -ā (ܡܦܘܼܚܠܵܐ, ܡܘܼܪܝܡܵܐ); the feminine in -tā through the feminine rule.');
const M_PREFIXES = [['ܡܘ', 'ܡ'], ...LETTERS.map((c) => [`ܡ${c}ܘ`, `ܡ${c}`])];
rule('passiveParticipleM', {type: 'circumfix', prefixes: M_PREFIXES, suffixes: [['ܐ', ''], ['ܝܐ', 'ܐ']], conditionsIn: PARTICIPLE_IN, conditionsOut: VERB, stemMinLength: 1, stemCharacters: LETTER});
// Imperative, Stem I: ܘ before the last radical (ܦܬ݂ܘܿܚ, open!; ܦܬ݂ܘܿܚܝ,
// feminine; ܦܬ݂ܘܿܚܘܼܢ, plural). Hollow verbs have ܘ for their ܐ (ܨܘܼܡ, ܨܘܼܡܝ,
// ܨܘܼܡܘܼܢ). Verbs in -ē end in -ī / -ay and plural -aw (ܕܪܝܼ, ܕܪܲܝ, ܕܪܲܘ);
// -ī has the letters of the third person plural above.
transform('imperative', 'imperative', 'Imperative of a Stem I verb, with ܘ before the last radical (ܦܬ݂ܘܿܚ, open!; feminine ܦܬ݂ܘܿܚܝ, plural ܦܬ݂ܘܿܚܘܼܢ); of a hollow verb, with ܘ for its ܐ (ܨܘܼܡ); of a verb in -ē, -ī and plural -aw (ܕܪܝܼ, ܕܪܲܘ).');
for (const c of RADICALS) {
    for (const ending of ['', 'ܝ', 'ܘܢ']) {
        suffix('imperative', `ܘ${c}${ending}`, c, AFTER_L, VERB, {minStem: 2});
        suffix('imperative', `ܘ${c}${ending}`, `ܐ${c}`, AFTER_L, VERB, {minStem: 1});
    }
}
suffix('imperative', 'ܘ', 'ܐ', AFTER_L, VERB, {minStem: 2});
// Stems II, III and quadriliterals: Stem II and quadriliterals drop the ܡ
// (ܦܲܚܸܠ, from ܡܦܲܚܸܠ; ܬܲܪܓܸܡ, from ܡܬܲܪܓܸܡ; feminine ܦܲܚܸܠܝ, plural
// ܦܲܚܠܘܼܢ; verbs in -ē: ܢܲܬܝܼ, ܢܲܬܲܘ, from ܡܢܲܬܹܐ); Stem III and the
// reflexive ܡܬ- verbs have ܐ for it (ܐܲܪܝܸܡ, raise!, from ܡܲܪܝܸܡ; ܐܸܬ݂ܟܬ݂ܸܒ݂,
// from ܡܸܬ݂ܟܬ݂ܹܒ݂; ܐܲܣܬܝܼ, ܐܲܣܬܲܘ, from ܡܲܣܬܹܐ). The root has three or four
// letters, so the ܐ- forms are patterns of that length: many other words
// start with ܐ.
transform('imperativeM', 'imperative (Stem III)', 'Imperative of a Stem III or reflexive ܡܬ- verb, with ܐ for the ܡ (ܐܲܪܝܸܡ, raise!; ܐܸܬ݂ܟܬ݂ܸܒ݂); feminine -ī, plural -ūn (ܐܲܪܝܸܡܝ, ܐܲܪܝܡܘܼܢ; ܐܲܣܬܝܼ, ܐܲܣܬܲܘ from ܡܲܣܬܹܐ).');
rule('imperativeM', {type: 'pattern', pattern: `^ܐ(${PL}{2,4}?)(?:ܝ|ܘܢ)?$`, replacement: 'ܡ$1', anchorPrefix: 'ܐ', conditionsIn: AFTER_L, conditionsOut: VERB});
rule('imperativeM', {type: 'pattern', pattern: `^ܐ(${PL}{2,3})[ܝܘ]$`, replacement: 'ܡ$1ܐ', anchorPrefix: 'ܐ', conditionsIn: AFTER_L, conditionsOut: VERB});
// The verbal noun of Stems II, III and quadriliterals in -ānūṯā
// (ܡܲܪܝܡܵܢܘܼܬ݂ܵܐ, ܡܲܣܬܝܵܢܘܼܬ݂ܵܐ), which Wiktionary's tables give as their
// infinitive noun; and that of Stem II and quadriliterals without ܡ, with ܘ
// after the first radical (ܦܘܼܚܵܠܵܐ, from ܡܦܲܚܸܠ; ܒܘܼܕ݂ܒܵܕ݂ܵܐ, from ܡܒܲܕ݂ܒܸܕ݂;
// ܐܘܼܣܵܝܵܐ, from ܡܐܲܣܹܐ).
transform('verbalNounM', 'verbal noun (Stems II/III)', 'The verbal noun of a Stem II, Stem III or quadriliteral verb: in -ānūṯā (ܡܲܪܝܡܵܢܘܼܬ݂ܵܐ, raising, from ܡܲܪܝܸܡ; ܡܲܣܬܝܵܢܘܼܬ݂ܵܐ, from ܡܲܣܬܹܐ), or without ܡ and with ܘ after the first radical (ܦܘܼܚܵܠܵܐ, from ܡܦܲܚܸܠ).');
suffix('verbalNounM', 'ܢܘܬܐ', '', ANY, VERB, {minStem: 3, stemStartsWith: '[ܡ]'});
suffix('verbalNounM', 'ܝܢܘܬܐ', 'ܐ', ANY, VERB, {minStem: 3, stemStartsWith: '[ܡ]'});
rule('verbalNounM', {type: 'circumfix', prefixes: LETTERS.map((c) => [`${c}ܘ`, `ܡ${c}`]), suffixes: [['ܐ', '']], conditionsIn: ANY, conditionsOut: VERB, stemMinLength: 2, stemCharacters: LETTER});
rule('verbalNounM', {type: 'circumfix', prefixes: LETTERS.map((c) => [`${c}ܘ`, `ܡ${c}`]), suffixes: [['ܝܐ', 'ܐ']], conditionsIn: ANY, conditionsOut: VERB, stemMinLength: 1, stemCharacters: LETTER});
// Infinitive of Stems II, III and quadriliterals: ܘ before the last letter and
// -ē (ܡܲܪܝܘܿܡܹܐ, ܡܬܲܪܓܘܿܡܹܐ); verbs in -ē end in -ōyē (ܡܲܣܬܘܿܝܹܐ). After ܒ-
// it is the gerund (ܒܡܲܪܝܘܿܡܹܐ).
transform('infinitiveM', 'infinitive (Stems II/III)', 'The infinitive of a Stem II, Stem III or quadriliteral verb, with ܘ before the last radical (ܡܲܪܝܘܿܡܹܐ, ܡܬܲܪܓܘܿܡܹܐ; ܡܲܣܬܘܿܝܹܐ from ܡܲܣܬܹܐ).');
for (const c of RADICALS) {
    suffix('infinitiveM', `ܘ${c}ܐ`, c, ANY, VERB, {minStem: 3, stemStartsWith: '[ܡ]'});
}
suffix('infinitiveM', 'ܘܝܐ', 'ܐ', ANY, VERB, {minStem: 3, stemStartsWith: '[ܡ]'});
// Gerund of Stem I: ܒ- + the infinitive (ܒܸܦܬ݂ܵܚܵܐ; ܒܸܕܪܵܝܵܐ from ܕܪܐ), the
// progressive with the copula (ܝܠܹܗ ܒܸܦܬ݂ܵܚܵܐ, he is opening). Hollow verbs
// have ܝ for their ܐ here too (ܒܸܨܝܵܡܵܐ), which the hollow rule reads.
transform('gerund', 'gerund (ܒ- + infinitive)', 'The gerund, ܒ- with the infinitive (ܒܸܦܬ݂ܵܚܵܐ; ܒܸܕܪܵܝܵܐ from ܕܪܐ), which makes the progressive with the copula (ܝܠܹܗ ܒܸܦܬ݂ܵܚܵܐ, he is opening).');
// The root has three letters (two for a verb in -ē), so these are patterns
// of that length: ܒ + a longer word in -ā is a noun after ܒ- (ܒܡܲܕܢܚܵܐ, in
// the east), and Stems II and III make their gerund from the infinitive
// (ܒܡܲܪܝܘܿܡܹܐ: ܒ- and infinitiveM).
// ܒܡܪܝܐ is ܒ- and ܡܪܝܐ (in the Lord), not a gerund (ܡܪܐ is a noun, and ܡܪܝ
// the title Mar; see NOT_VERBS above).
rule('gerund', {type: 'pattern', pattern: `^ܒ(?!ܡܪܝܐ)(${PL}{3})ܐ$`, replacement: '$1', anchorSuffix: 'ܐ', conditionsIn: ANY, conditionsOut: VSTEM});
rule('gerund', {type: 'pattern', pattern: `^ܒ(?!ܡܪܝܐ)(${PL}{2})ܝܐ$`, replacement: '$1ܐ', anchorSuffix: 'ܝܐ', conditionsIn: ANY, conditionsOut: VERB});

// --- Past particle -----------------------------------------------------------------
// ܗ݇ܘܵܐ (wā) after a verb, a participle or the copula makes the past of the
// tense (ܟܹܐ ܦܵܬ݂ܚܵܐ ܗ݇ܘܵܐ, she used to open; ܦܬ݂ܝܼܚܵܐ ܗ݇ܘܵܐ, it had been
// opened). It is written as a word of its own (ܗ݇ܘܵܐ, with a silent ܗ, or
// ܘܵܐ) or joined to the verb (ܚܵܝܝܼܘܵܐ, he was living).
transform('wa', 'ܗ݇ܘܵܐ (past)', 'The past particle ܗ݇ܘܵܐ (wā) after a verb, a participle or the copula, written as a separate word or joined to it (ܟܹܐ ܦܵܬ݂ܚܵܐ ܗ݇ܘܵܐ, she used to open).');
suffix('wa', ' ܗܘܐ', '', ANY, [], {minStem: 2});
suffix('wa', ' ܘܐ', '', ANY, [], {minStem: 2});
suffix('wa', 'ܘܐ', '', ANY, [], {minStem: 3});
// Between a past verb and its L-suffix it makes the pluperfect (ܦܬ݂ܝܼܚ ܗ݇ܘܵܐ
// ܠܹܗ, he had opened): the particle is removed and the L-suffix kept, for the
// L-suffix rules to read (their stem is one word).
for (const [, letters] of L_SUFFIXES) {
    for (const wa of [' ܗܘܐ', ' ܘܐ']) {
        suffix('wa', `${wa} ${letters}`, ` ${letters}`, ANY, [], {minStem: 2});
    }
}

// --- Nouns and adjectives ---------------------------------------------------------------
// Possessive suffixes replace the -ā of the emphatic state (ܟܲܠܒܵܐ, dog):
// ܟܲܠܒܝܼ my, ܟܲܠܒܘܼܟ݂ your (m.), ܟܲܠܒܵܟ݂ܝ your (f.), ܟܲܠܒܹܗ his,
// ܟܲܠܒܵܗ̇ her, ܟܲܠܒܲܢ our, ܟܲܠܒܲܘܟ݂ܘܿܢ your (pl.), ܟܲܠܒܗܘܿܢ their. On a
// plural in -ē they are the same letters except his ܟܲܠܒ݂ܘܼ̈ܗܝ, her ܟܲܠܒ݂ܘܼ̈ܗ̇
// and their ܟܲܠܒ݂ܲܝ̈ܗܘܿܢ. Feminine nouns keep their -t- (ܒܪܵܬ݂ܝ, my
// daughter, from ܒܪܵܬ݂ܵܐ), and so do plurals in -āṯā, -wāṯā, -yāṯā
// (ܫܪ̈ܵܓ݂ܵܬ݂ܝ, my lamps), which the plural rules then read. Biblical style
// has -kōn for your (pl.) after a plural in -āṯ (ܡܲܪ̈ܓܵܢܝܵܬ݂ܟ݂ܘܿܢ).
const POSSESSIVE = [
    ['poss1s', 'ܝ', 'my', 'First person singular possessive suffix (ܟܲܠܒܝܼ, my dog); with the same letters the construct plural (ܟܲܠܒ݂ܲܝ̈, the dogs of).'],
    ['poss2ms', 'ܘܟ', 'your (m.)', 'Second person masculine singular possessive suffix (ܟܲܠܒܘܼܟ݂, your dog).'],
    ['poss2fs', 'ܟܝ', 'your (f.)', 'Second person feminine singular possessive suffix (ܟܲܠܒܵܟ݂ܝ, your dog).'],
    ['poss3s', 'ܗ', 'his, her', 'Third person singular possessive suffix, masculine ܹܗ or feminine ܵܗ̇ (ܟܲܠܒܹܗ his dog, ܟܲܠܒܵܗ̇ her dog; on a plural ܟܲܠܒ݂ܘܼ̈ܗܝ, ܟܲܠܒ݂ܘܼ̈ܗ̇).'],
    ['poss1p', 'ܢ', 'our', 'First person plural possessive suffix (ܟܲܠܒܲܢ, our dog).'],
    ['poss2p', 'ܘܟܘܢ', 'your (pl.)', 'Second person plural possessive suffix (ܟܲܠܒܲܘܟ݂ܘܿܢ, your dog).'],
    ['poss3p', 'ܗܘܢ', 'their', 'Third person plural possessive suffix (ܟܲܠܒܗܘܿܢ, their dog; on a plural ܟܲܠܒ݂ܲܝ̈ܗܘܿܢ).'],
];
for (const [id, ending, name, description] of POSSESSIVE) {
    transform(id, name, description);
    suffix(id, ending, 'ܐ', ANY, ['n_p'], {minStem: 2});
}
suffix('poss3s', 'ܘܗܝ', 'ܐ', ANY, ['n_p'], {minStem: 2});
suffix('poss3s', 'ܘܗ', 'ܐ', ANY, ['n_p'], {minStem: 2});
suffix('poss3p', 'ܝܗܘܢ', 'ܐ', ANY, ['n_p'], {minStem: 2});
suffix('poss2p', 'ܟܘܢ', 'ܐ', ANY, ['n_p'], {minStem: 2});

// Plurals and the feminine. The plural in -ē has the letters of the singular
// (ܟܲܠܒ݂ܹ̈ܐ, with seyame, which the preprocessor removes). Others add letters
// before -ā: -ānē (ܛܘܼܪܵܢܹ̈ܐ, mountains, from ܛܘܼܪܵܐ), -wāṯā (ܢܲܗܪܲܘܵܬ݂ܵܐ,
// rivers, from ܢܲܗܪܵܐ), -āṯā (ܫܪ̈ܵܓ݂ܵܬ݂ܵܐ, lamps, from ܫܪܵܓ݂ܵܐ); a feminine
// noun in -tā makes -yāṯā (ܝܕ݂ܵܥ̈ܝܵܬ݂ܵܐ, from ܝܕ݂ܵܥܬܵܐ). They apply to the
// text as written and after a possessive suffix was removed.
const NOUN_STEM = ['n_p'];
transform('pluralAne', 'plural -ānē', 'Plural in -ānē (ܛܘܼܪܵܢܹ̈ܐ, mountains, from ܛܘܼܪܵܐ).');
suffix('pluralAne', 'ܢܐ', 'ܐ', NOUN_STEM, ['n_f'], {minStem: 2});
transform('pluralWata', 'plural -wāṯā', 'Plural in -wāṯā or -awāṯā (ܢܲܗܪܲܘܵܬ݂ܵܐ, rivers, from ܢܲܗܪܵܐ).');
suffix('pluralWata', 'ܘܬܐ', 'ܐ', NOUN_STEM, ['n_f'], {minStem: 2});
transform('feminine', 'feminine / plural -ṯā', 'Feminine of an adjective or noun in -tā (ܛܵܒ݂ܬܵܐ from ܛܵܒ݂ܵܐ, good; ܐܵܬ݂ܘܿܪܵܝܬܵܐ from ܐܵܬ݂ܘܿܪܵܝܵܐ, Assyrian), or in -ānīṯā of one in -ānā (ܡܲܪܝܡܵܢܝܼܬ݂ܵܐ from ܡܲܪܝܡܵܢܵܐ), and the plural in -āṯā of some nouns (ܫܪ̈ܵܓ݂ܵܬ݂ܵܐ, lamps).');
suffix('feminine', 'ܬܐ', 'ܐ', NOUN_STEM, ['n_f', 'adj'], {minStem: 2});
suffix('feminine', 'ܢܝܬܐ', 'ܢܐ', NOUN_STEM, ['n_f', 'adj'], {minStem: 2});
transform('pluralYata', 'plural -yāṯā', 'Plural in -yāṯā of a feminine noun in -tā (ܝܕ݂ܵܥ̈ܝܵܬ݂ܵܐ, from ܝܕ݂ܵܥܬܵܐ; ܚܲܕ݂̈ܘܼܝܵܬ݂ܵܐ, joys, from ܚܲܕ݂ܘܼܬ݂ܵܐ).');
suffix('pluralYata', 'ܝܬܐ', 'ܬܐ', NOUN_STEM, ['n_f'], {minStem: 2});
// The absolute plural in -īn (ܟܲܠܒ݂ܝܼ̈ܢ), after numbers and in set phrases.
transform('absolutePlural', 'absolute plural -īn', 'Absolute plural in -īn (ܟܲܠܒ݂ܝܼ̈ܢ, from ܟܲܠܒܵܐ), used after numbers and in set phrases.');
suffix('absolutePlural', 'ܝܢ', 'ܐ', ANY, ['n_f'], {minStem: 2});
// The construct and absolute singular drop the -ā (ܒܹܝܬ݂ ܣܸܦܪܵܐ, school,
// literally house of book; ܟܠܲܒ݂, from ܟܲܠܒܵܐ); a feminine noun keeps its t
// (ܡܲܠܟܲܬ݂, from ܡܲܠܟܬ݂ܵܐ).
transform('construct', 'construct state', 'The construct (or absolute) state of a noun, without the -ā of the emphatic state (ܒܹܝܬ݂ ܣܸܦܪܵܐ, school, from ܒܲܝܬܵܐ; ܡܲܠܟܲܬ݂, from ܡܲܠܟܬ݂ܵܐ).');
rule('construct', {type: 'suffix', inflected: '', deinflected: 'ܐ', conditionsIn: ANY, conditionsOut: ['n_f'], stemMinLength: 2, stemCharacters: LETTER, stemNotEndsWith: '[ܐ]'});

// Nouns that end in a consonant, mostly loanwords (ܐܵܐܲܪ, air; ܐܲܘܛܘܿܒܘܼܣ,
// bus), add the possessive suffixes to the whole word (ܐܲܘܛܘܿܒܘܼܣܹܗ, his
// bus) and make their plural with -ē or -āṯā (ܐܲܘܛܘܿܒܘܼ̈ܣܵܬ݂ܵܐ); so do a few
// nouns that keep their -ā (ܦܪܸܙܠܵܐܗܘܿܢ, their iron). A stem of three letters
// is a verb root as often as a noun, so these need four.
transform('possessiveC', 'possessive (consonant-final noun)', 'A possessive suffix on a noun that ends in a consonant, mostly a loanword (ܐܲܘܛܘܿܒܘܼܣܹܗ, his bus, from ܐܲܘܛܘܿܒܘܼܣ).');
for (const ending of ['ܝ', 'ܘܟ', 'ܟܝ', 'ܗ', 'ܢ', 'ܘܟܘܢ', 'ܗܘܢ', 'ܘܗܝ', 'ܘܗ', 'ܝܗܘܢ']) {
    suffix('possessiveC', ending, '', ANY, ['n_f'], {minStem: 4});
}
transform('pluralC', 'plural (consonant-final noun)', 'The plural in -āṯā of a noun that ends in a consonant (ܐܲܘܛܘܿܒܘܼ̈ܣܵܬ݂ܵܐ, buses, from ܐܲܘܛܘܿܒܘܼܣ).');
suffix('pluralC', 'ܬܐ', '', NOUN_STEM, ['n_f'], {minStem: 4});

// Nouns with plural or possessive stems of their own, written out: ܒܲܝܬܵܐ,
// house: ܒܵܬܹ̈ܐ, ܒܵܬܲܝ̈ (my houses); ܒܪܵܬ݂ܵܐ, daughter: ܒ̈ܢܵܬ݂ܵܐ;
// ܐܲܢ݇ܬܬ݂ܵܐ, woman: ܢܸܫܹ̈ܐ; ܐܸܒܪܵܐ, son: ܐܸܒ̈ܢܹܐ, construct ܒܲܪ; ܐܲܒ݂ܵܐ,
// father: ܐܲܒ݂ܵܗܹ̈ܐ, ܐܲܒ݂ܘܼܢ (our father); ܐܲܚܵܐ, brother: ܐܲܚܘܼܢ; ܐܸܡܵܐ,
// mother: ܐܸܡܵܗܹ̈ܐ; ܫܸܡܵܐ, name: ܫܸܡܵܗܹ̈ܐ; ܫܲܢ݇ܬܵܐ, year: ܫܸܢܹ̈ܐ; ܐܘܼܡܬ݂ܵܐ,
// nation: ܐܸܡ̈ܘܵܬ݂ܵܐ; ܝܵܡܵܐ, sea: ܝܲܡܡܹ̈ܐ; ܒܪܘܿܢܵܐ, son: ܒܢܘܿܢܹ̈ܐ.
transform('irregularNoun', 'irregular plural', 'A noun with a plural or possessive stem of its own (ܒܵܬܹ̈ܐ, houses; ܒ̈ܢܵܬ݂ܵܐ, daughters; ܢܸܫܹ̈ܐ, women; ܐܸܒ̈ܢܹܐ, sons; ܐܲܒ݂ܘܼܢ, our father).');
const PLURAL_ENDINGS = ['ܐ', 'ܝ', 'ܘܟ', 'ܟܝ', 'ܘܗܝ', 'ܘܗ', 'ܢ', 'ܘܟܘܢ', 'ܝܗܘܢ', 'ܝܢ'];
const IRREGULAR_PLURALS = [
    ['ܒܝܬܐ', ['ܒܬ', 'ܒܬܘܬ', 'ܒܬܢ']],
    ['ܒܪܬܐ', ['ܒܢܬ']],
    ['ܐܢܬܬܐ', ['ܢܫ']],
    ['ܐܒܪܐ', ['ܐܒܢ', 'ܒܢ']],
    ['ܒܪܘܢܐ', ['ܒܢܘܢ']],
    ['ܐܒܐ', ['ܐܒܗ', 'ܐܒܗܬ']],
    ['ܐܡܐ', ['ܐܡܗ', 'ܐܡܗܬ']],
    ['ܫܡܐ', ['ܫܡܗ']],
    ['ܫܢܬܐ', ['ܫܢ']],
    ['ܐܘܡܬܐ', ['ܐܡܘܬ']],
    ['ܝܡܐ', ['ܝܡܡ']],
];
const irregularSeen = new Set();
function irregular(form, lemma) {
    if (irregularSeen.has(form + '\u0000' + lemma)) { return; }
    irregularSeen.add(form + '\u0000' + lemma);
    rule('irregularNoun', {type: 'wholeWord', inflected: form, deinflected: lemma, conditionsIn: NOUN_STEM, conditionsOut: ['n_f']});
}
for (const [lemma, stems] of IRREGULAR_PLURALS) {
    for (const stem of stems) {
        for (const ending of PLURAL_ENDINGS) {
            irregular(stem + ending, lemma);
        }
    }
}
// The construct of ܐܸܒܪܵܐ (ܒܲܪ ܐ݇ܢܵܫܵܐ, human being), and the kinship
// nouns' possessive stem in -ū (ܐܲܒ݂ܘܼܢ, our father; ܐܲܚܘܼܟ݂, your brother).
irregular('ܒܪ', 'ܐܒܪܐ');
for (const [lemma, stem] of [['ܐܒܐ', 'ܐܒܘ'], ['ܐܚܐ', 'ܐܚܘ']]) {
    for (const ending of ['ܢ', 'ܟ', 'ܟܝ', 'ܗܝ', 'ܗ', 'ܟܘܢ', 'ܗܘܢ']) {
        irregular(stem + ending, lemma);
    }
}

// Closed-class words whose wty-aii-en row refers to a pointed form that no
// row has (the engine looks a reference up as written, docs/languages.md
// 9.10), so the lookup finds nothing for them, or a wrong reading: ܬܪܵܝ
// (two, the Urmia spelling; its row names ܬܪܹܝܢ, and the 3p rule then reads
// ܬܪܐ, to soak), ܡܵܐܐ (hundred; its row names ܐܸܡܐܵܐ) and the unpointed ܐܘܦ
// (also; its row names ܐܵܦ). These are the ones the measured texts use at
// least 80 times (README, Known gaps). ܬܪܵܝ is read only pointed: unpointed,
// ܒܬܪܝ is also ܒܵܬ݇ܪܝܼ (after me), which a proclitic would read as ܒ- + two.
// The Urmia Bible writes today in two words, ܐܸܕܝܘܼ ܝܘܿܡܵܐ (this day), which
// no row has (39 hovers, which the Stem I imperative read as ܐܕܝܐ, now).
transform('spelling', 'spelling variant', 'A spelling of a numeral or particle that the dictionary refers to a pointed form it has no row for, or does not list: ܬܪܵܝ (two) for ܬܪܹܝܢ, ܡܵܐܐ (hundred) for ܐܸܡܐܵܐ, ܐܘܦ (also) for ܐܵܦ, ܐܸܕܝܘܼ ܝܘܿܡܵܐ (this day) for ܐܸܕܝܘܿܡ (today).');
rule('spelling', {type: 'pattern', pattern: `^\\u072C${N}\\u072A${N}\\u0735${N}\\u071D$`, replacement: 'ܬܪܝܢ', anchorSuffix: 'ܝ', conditionsIn: ANY, conditionsOut: []});
for (const [form, lemma] of [['ܡܐܐ', 'ܐܡܐܐ'], ['ܐܘܦ', 'ܐܦ'], ['ܐܕܝܘ ܝܘܡܐ', 'ܐܕܝܘܡ']]) {
    rule('spelling', {type: 'wholeWord', inflected: form, deinflected: lemma, conditionsIn: ANY, conditionsOut: []});
}

// --- Prepositions with pronoun suffixes ----------------------------------------------
// The suffixes of nouns, on the bare preposition (ܥܲܡ, with: ܥܲܡܝ, ܥܲܡܘܼܟ݂,
// ܥܲܡܵܟ݂ܝ, ܥܲܡܹܗ, ܥܲܡܲܢ, ܥܲܡܲܘܟ݂ܘܿܢ, ܥܲܡܗܘܿܢ); ܥܲܠ and ܚܠܵܦ take the
// suffixes of plural nouns (ܥܠܘܼܗܝ, ܥܠܘܼܗ̇, ܥܠܲܝܗܘܿܢ); some add -t- or have
// a stem of their own (ܩܵܐ, for: ܩܵܬܝ; ܐܲܝܟ݂, like: ܐܲܟ݂ܘܵܬ݂ܝ). A closed list
// of the common ones, written out.
const SINGULAR_SET = ['ܝ', 'ܘܟ', 'ܟܝ', 'ܗ', 'ܢ', 'ܘܟܘܢ', 'ܗܘܢ'];
const PLURAL_SET = ['ܝ', 'ܘܟ', 'ܟܝ', 'ܘܗܝ', 'ܘܗ', 'ܢ', 'ܘܟܘܢ', 'ܝܗܘܢ'];
const PREPOSITIONS = [
    // [lemma, stem, suffix set]
    ['ܥܡ', 'ܥܡ', SINGULAR_SET],
    ['ܓܘ', 'ܓܘ', SINGULAR_SET],
    ['ܡܢ', 'ܡܢ', SINGULAR_SET],
    ['ܠܘܬ', 'ܠܘܬ', SINGULAR_SET],
    ['ܩܕܡ', 'ܩܕܡ', SINGULAR_SET],
    ['ܒܬܪ', 'ܒܬܪ', SINGULAR_SET],
    ['ܬܚܘܬ', 'ܬܚܘܬ', SINGULAR_SET],
    ['ܒܝܢ', 'ܒܝܢ', SINGULAR_SET],
    // The Urmia Bible writes ܒܹܝܠ- (ܒܹܝܠܝܼ ܘܒܹܝܠܘܼܟ, between me and you).
    ['ܒܝܢ', 'ܒܝܠ', SINGULAR_SET],
    ['ܓܢܒ', 'ܓܢܒ', SINGULAR_SET],
    ['ܒܝܕ', 'ܒܝܕ', SINGULAR_SET],
    ['ܕܝܠ', 'ܕܝܠ', SINGULAR_SET],
    ['ܥܒܪ', 'ܥܒܪ', SINGULAR_SET],
    ['ܠܓܘ', 'ܠܓܘ', SINGULAR_SET],
    ['ܡܓܘ', 'ܡܓܘ', SINGULAR_SET],
    ['ܥܠ', 'ܥܠ', PLURAL_SET],
    ['ܚܠܦ', 'ܚܠܦ', PLURAL_SET],
    ['ܩܐ', 'ܩܬ', SINGULAR_SET],
    ['ܛܠܐ', 'ܛܠܬ', SINGULAR_SET],
    ['ܐܝܟ', 'ܐܟܘܬ', SINGULAR_SET],
    ['ܡܛܠ', 'ܡܛܠܬ', SINGULAR_SET],
    ['ܟܣ', 'ܟܣܠ', SINGULAR_SET],
    ['ܒ-', 'ܒ', SINGULAR_SET],
    // ܒܝܼܵܝ (in me) is the Urmia spelling of ܒܝܼ.
    ['ܒ-', 'ܒܝ', ['ܝ', 'ܘܟ', 'ܟܝ', 'ܗ', 'ܢ', 'ܘܟܘܢ', 'ܗܘܢ']],
    ['ܠ-', 'ܠ', SINGULAR_SET],
    // ܐܸܠ- is ܠ- with a prosthetic vowel (ܐܸܠܹܗ or ܐܸܠܘܼܗܝ, to him), frequent in
    // the Urmia Bible; ܕܝ- is ܕ- with a pronoun (ܕܝܼܗ, his).
    ['ܠ-', 'ܐܠ', [...new Set([...SINGULAR_SET, ...PLURAL_SET, 'ܝܟܝ'])]],
    ['ܕ-', 'ܕܝ', SINGULAR_SET],
    ['ܕܝ', 'ܕܝ', SINGULAR_SET],
    ['ܟܠ', 'ܟܠ', SINGULAR_SET],
    ['ܝܬ', 'ܝܬ', SINGULAR_SET],
    ['ܒܠܝ', 'ܒܠܥܕ', PLURAL_SET],
    ['ܚܕܪܘܢ', 'ܚܕܪܘܢ', PLURAL_SET],
    ['ܒܪܩܘܒܠ', 'ܒܪܩܘܒܠ', SINGULAR_SET],
    ['ܕܠܩܘܒܠ', 'ܕܠܩܘܒܠ', SINGULAR_SET],
    ['ܠܚܘܕ', 'ܠܚܘܕ', SINGULAR_SET],
    ['ܠܥܒܪ', 'ܠܥܒܪ', SINGULAR_SET],
    ['ܠܦܘܬ', 'ܠܦܘܬ', SINGULAR_SET],
    ['ܡܐܝܟ', 'ܡܐܟܘܬ', SINGULAR_SET],
    ['ܡܨܥܬ', 'ܡܨܥܬ', SINGULAR_SET],
    ['ܩܕܡܬ', 'ܩܕܡܬ', SINGULAR_SET],
    ['ܒܕܘܟܬ', 'ܒܕܘܟܬ', SINGULAR_SET],
];
transform('prepositionSuffix', 'with a pronoun', 'A preposition with a pronoun suffix (ܥܲܡܹܗ, with him; ܥܠܘܼܗܝ, on him; ܩܵܬܝ, for me; ܒܹܗ, in it; ܠܹܗ, to him).');
for (const [lemma, stem, set] of PREPOSITIONS) {
    for (const ending of set) {
        rule('prepositionSuffix', {type: 'wholeWord', inflected: stem + ending, deinflected: lemma, conditionsIn: ANY, conditionsOut: ['prep']});
    }
}
// ܥܲܠ also takes the singular suffixes in informal writing (ܥܲܠܹܗ).
for (const ending of ['ܗ', 'ܗܘܢ']) {
    rule('prepositionSuffix', {type: 'wholeWord', inflected: 'ܥܠ' + ending, deinflected: 'ܥܠ', conditionsIn: ANY, conditionsOut: ['prep']});
}

// ܐܝܼܬ݂ (there is) and ܠܲܝܬ (there is not) with ܒ- and a pronoun: can, cannot
// (ܐܝܼܬ݂ ܒܹܗ, he can).
for (const lemma of ['ܐܝܬ', 'ܠܝܬ']) {
    for (const ending of SINGULAR_SET) {
        rule('prepositionSuffix', {type: 'wholeWord', inflected: `${lemma} ܒ${ending}`, deinflected: lemma, conditionsIn: ANY, conditionsOut: ['prep']});
    }
}

// --- Irregular verbs -----------------------------------------------------------------
// ܝܵܗ݇ܒ݂ܹܠ (yāḇēl, to give) loses its ܠ before the endings and in the
// imperative's stem (ܝܵܗ݇ܒ݂ܵܐ, she gives; ܝܘܼܗ݇ܒ݂ܹܠ ܠܹܗ, he gave; ܝܘܼܗ݇ܒ݂ܵܐ,
// given; ܗܲܒ݂݇ܠ, give!); ܐܵܙܹܠ (to go) and ܐܵܬ݂ܹܐ (to come) have short
// imperatives (ܙܹܠ݇, ܙܹܠ݇ܡܘܼܢ; ܬܵܐ, ܬܹܝܡܘܼܢ), ܐܵܬ݂ܹܐ has ܐܵܬ݂ܲܚ (we come), and
// ܗܵܘܹܐ (to be) ܗ݇ܘܝܼ, ܗ݇ܘܹܝܡܘܼܢ.
transform('irregularVerb', 'irregular verb', 'A form of an irregular verb, written out: ܝܵܗ݇ܒ݂ܹܠ, to give (ܝܵܗ݇ܒ݂ܵܐ, ܝܘܼܗ݇ܒ݂ܹܠ ܠܹܗ, ܗܲܒ݂݇ܠ); the imperatives of ܐܵܙܹܠ, to go (ܙܹܠ݇), ܐܵܬ݂ܹܐ, to come (ܬܵܐ), and ܗܵܘܹܐ, to be (ܗ݇ܘܝܼ).');
const IRREGULAR_VERBS = [
    ['ܝܗܒܠ', ['ܝܗܒܐ', 'ܝܗܒܝ', 'ܝܗܒܬ', 'ܝܗܒܬܝ', 'ܝܗܒܝܬܘܢ', 'ܝܗܒܢ', 'ܝܗܒܚ',
        'ܝܘܗܒܠ', 'ܝܘܗܒܐ', 'ܝܘܗܒܝ', 'ܝܘܗܒܬ', 'ܝܘܗܒܬܝ', 'ܝܘܗܒܝܬܘܢ', 'ܝܘܗܒܢ', 'ܝܘܗܒܚ', 'ܝܘܗܒܠܬܐ',
        'ܗܒܠ', 'ܗܒܠܝ', 'ܗܒܠܘܢ']],
    ['ܐܙܠ', ['ܙܠ', 'ܙܠܝ', 'ܙܠܡܘܢ']],
    ['ܐܬܐ', ['ܬܐ', 'ܬܐܝ', 'ܬܝܡܘܢ', 'ܐܬܚ']],
    ['ܗܘܐ', ['ܗܘܝ', 'ܗܘܝܡܘܢ']],
];
for (const [lemma, forms] of IRREGULAR_VERBS) {
    for (const form of forms) {
        rule('irregularVerb', {type: 'wholeWord', inflected: form, deinflected: lemma, conditionsIn: AFTER_L, conditionsOut: VERB});
    }
}

// --- Stem II imperative ------------------------------------------------------------
// Stem II and quadriliteral verbs drop the ܡ in the imperative (ܦܲܚܸܠ, from
// ܡܦܲܚܸܠ; ܬܲܪܓܸܡ, from ܡܬܲܪܓܸܡ; feminine ܦܲܚܸܠܝ, plural ܦܲܚܠܘܼܢ; verbs in -ē:
// ܢܲܬܝܼ, ܢܲܬܲܘ, from ܡܢܲܬܹܐ). The rule adds ܡ to the word, which also makes
// a verb of many nouns (ܚܲܒ݂ܪܝܼ, my friend, would be the imperative of
// ܡܚܲܒܸܪ), so it comes after the noun rules in this file: on a tie the
// reading found first comes first (docs/languages.md 9.6).
transform('imperativeII', 'imperative (Stem II)', 'Imperative of a Stem II or quadriliteral verb, without the ܡ (ܦܲܚܸܠ, from ܡܦܲܚܸܠ; ܬܲܪܓܸܡ, from ܡܬܲܪܓܸܡ); feminine -ī, plural -ūn; of a verb in -ē, -ī and plural -aw (ܢܲܬܝܼ, ܢܲܬܲܘ).');
for (const [ending, out, min] of [['', '', 3], ['ܝ', '', 3], ['ܘܢ', '', 3], ['ܝ', 'ܐ', 2], ['ܘ', 'ܐ', 2]]) {
    rule('imperativeII', {type: 'circumfix', inflectedPrefix: '', deinflectedPrefix: 'ܡ', inflectedSuffix: ending, deinflectedSuffix: out, conditionsIn: AFTER_L, conditionsOut: VERB, stemMinLength: min, stemCharacters: LETTER, stemNotEndsWith: '[ܐ]'});
}

// --- The copula ------------------------------------------------------------------------
// The enclitic present of to be (Wiktionary's ܝܼܠܹܗ, which wty-aii-en also
// lists under ܗܵܘܹܐ): ܝܼܘܸܢ / ܝܼܘܵܢ I am, ܝܼܘܸܬ / ܝܼܘܵܬܝ you are, ܝܼܠܹܗ /
// ܝܼܠܵܗ̇ he / she is, ܝܼܘܲܚ we are, ܝܼܬܘܿܢ you are, ܝܼܢܵܐ they are; also
// spelled with initial ܐ (ܐܝܼܠܹܗ) and in the Urmia Bible ܝܼܠܹܐ.
transform('copula', 'copula', 'A present form of the copula (ܝܼܘܸܢ I am, ܝܼܘܸܬ you are, ܝܼܠܹܗ he is, ܝܼܘܲܚ we are, ܝܼܬܘܿܢ you are, ܝܼܢܵܐ they are), under ܝܼܠܹܗ and the verb ܗܵܘܹܐ.');
const COPULA = ['ܝܘܢ', 'ܝܘܬ', 'ܝܘܬܝ', 'ܝܠܗ', 'ܝܘܚ', 'ܝܬܘܢ', 'ܝܢܐ', 'ܝܠܐ'];
for (const form of COPULA) {
    for (const lemma of ['ܝܠܗ', 'ܗܘܐ']) {
        if (form !== lemma) { rule('copula', {type: 'wholeWord', inflected: form, deinflected: lemma, conditionsIn: ANY, conditionsOut: VERB}); }
        rule('copula', {type: 'wholeWord', inflected: 'ܐ' + form, deinflected: lemma, conditionsIn: ANY, conditionsOut: VERB});
    }
}
// ܟܝ is how much informal text writes the indicative particle ܟܹܐ.
transform('ke', 'ܟܹܐ (indicative)', 'The indicative particle ܟܹܐ (kē) spelled ܟܝ.');
rule('ke', {type: 'wholeWord', inflected: 'ܟܝ', deinflected: 'ܟܐ', conditionsIn: ANY, conditionsOut: VERB});

const out = {schema: 1, conditions, transforms};
writeFileSync(join(here, 'own.json'), formatTransforms(out));
const count = transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`own.json: ${transforms.length} transforms, ${count} rule entries`);
