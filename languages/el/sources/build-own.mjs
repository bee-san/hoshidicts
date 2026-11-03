#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/el/sources/own.json: the Modern Greek deinflection rules
// written for this pack (docs/languages.md, section 14 step 2), from the
// paradigm tables below. Run from the repository root:
//
//   node languages/el/sources/build-own.mjs
//
// The tables follow the standard description of Standard Modern Greek
// inflection (Holton, Mackridge, Philippaki-Warburton and Spyropoulos, Greek:
// A Comprehensive Grammar, 2nd ed., 2012; Triantafyllidis, Νεοελληνική
// Γραμματική, 1941; the conjugation and declension tables of Wiktionary). No
// text or table is copied from them.
//
// Greek moves the accent. A form is stressed on one of its last three
// syllables, so an ending of a different length can move the accent of the
// stem: άνθρωπος, ανθρώπου; αγοράζω, αγόρασα, αγοράσαμε; έγραψα, γράψαμε.
// A rule whose output has the accent where its input had it is a plain
// suffix rule. Where the accent moves, the rule writes the ending and an
// internal condition that says where the accent goes, and the `accent`
// transform at the end of the file puts it there with a stem change (one rule
// per vowel letter; docs/languages.md 7.3):
//   - last (v_acc, n_last, adj_last): on the last vowel of the stem before the
//     lemma's ending (αγόρασα → αγόραζω → αγοράζω; γραφτήκαμε → γραφω → γράφω;
//     ωρών → ωρα → ώρα); an accent left in the stem is removed;
//   - ante (n_ante, adj_ante): on the vowel before the stem's last vowel
//     (θαλασσών → θαλασσα → θάλασσα; ομορφότερος → ομορφος → όμορφος;
//     ανθρώπου → ανθρώπος → άνθρωπος, the accent of the stem removed). A stem
//     change cannot count vowels, so this takes the last vowel letter with at
//     least two, and the last with at least three, letters after it: one of
//     them is the right one unless the stem ends in a long cluster
//     (νηφαλι-ος, θαλασσ-α).
// So a reading whose accent moved has two steps in its trace, the inflection
// and `accent`. Conjugation II puts the lemma's accent on its ending
// (αγάπησα → αγαπάω), which the rule writes; its `then` step removes the
// accent of the stem. No rule has a `pattern` step: tests/classes.json
// records every such step on every corpus string (section 12.1), which per
// rule would far exceed the 1 MB that tests/ and sources/ may hold.
//
// Conditions. Verb rules write `v`, noun rules `n`, adjective rules `adj`
// (both where a form is either: δρόμου, καλού). The rules of a declension take
// only the text as scanned (conditionsIn empty), so they never read each
// other's output; the chains Greek needs take the adjective or noun they start
// from: a comparative (ψηλότερης → ψηλότερος → ψηλός), a participle
// (γραμμένη → γραμμένος → γράφω) and a diminutive (σπιτάκια → σπιτάκι → σπίτι).
// `aug` marks a past form whose internal augment was removed (επέστρεψα →
// επιστρεψα): only verb rules continue it, and no dictionary term matches it.
// The recommended dictionary, wiktionary-to-yomitan's wty-el-en, tags only
// verbs (`v`); its nouns and adjectives have an empty part-of-speech column,
// which `lookup.untaggedTerms: "pass"` lets every deinflection reach.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    aug: {name: 'Past form without its internal augment', isDictionaryForm: false},
    v_acc: {name: 'Verb, accent on the last vowel of the stem', isDictionaryForm: false},
    n_last: {name: 'Noun, accent on the last vowel of the stem', isDictionaryForm: false},
    n_ante: {name: 'Noun, accent on the vowel before the last vowel of the stem', isDictionaryForm: false},
    adj_last: {name: 'Adjective, accent on the last vowel of the stem', isDictionaryForm: false},
    adj_ante: {name: 'Adjective, accent on the vowel before the last vowel of the stem', isDictionaryForm: false},
};

// --- Accents ------------------------------------------------------------------

const VOWELS = 'αεηιουω';
const ACUTE = {α: 'ά', ε: 'έ', η: 'ή', ι: 'ί', ο: 'ό', υ: 'ύ', ω: 'ώ', ϊ: 'ΐ', ϋ: 'ΰ', Α: 'Ά', Ε: 'Έ', Η: 'Ή', Ι: 'Ί', Ο: 'Ό', Υ: 'Ύ', Ω: 'Ώ'};
const PLAIN = Object.fromEntries(Object.entries(ACUTE).map(([k, v]) => [v, k]));
const isVowel = (c) => VOWELS.includes(c) || c in PLAIN || c === 'ϊ' || c === 'ϋ';

/** The text without its acute accents. */
function plain(s) {
    return [...s].map((c) => PLAIN[c] ?? c).join('');
}

/** The text with an accent on the last letter of its last vowel run, or unchanged without a vowel. */
function acc(s) {
    const chars = [...plain(s)];
    for (let i = chars.length - 1; i >= 0; --i) {
        if (isVowel(chars[i])) {
            chars[i] = ACUTE[chars[i]] ?? chars[i];
            return chars.join('');
        }
    }
    return s;
}

// Where a rule's accent goes (see the header): the kind, which shared()
// turns into the internal condition of each part of speech the rule writes.
const stemLast = () => 'last';
const stemSecond = () => 'ante';
const LEFT = 'ante';
const KIND = {
    last: {v: 'v_acc', n: 'n_last', adj: 'adj_last'},
    ante: {n: 'n_ante', adj: 'adj_ante'},
};
/** The rule writes the lemma's ending with its accent; the stem's accent is removed. */
const finalAccent = (accented) => ({final: accented});

const NFD = {normalize: 'NFD'};
const NFC = {normalize: 'NFC'};
// On the NFD form, where an accent is U+0301 after its vowel.
const REMOVE_FIRST_ACCENT = [NFD, {map: {'\u0301': ''}, at: 'first'}, NFC];
const REMOVE_LAST_ACCENT = [NFD, {map: {'\u0301': ''}, at: 'last'}, NFC];

// --- Rule builders ---------------------------------------------------------------

// Stems are Greek letters only (no space, apostrophe or digit), so that a rule
// never reads the last word of a phrase (docs/languages.md 14, "Count the
// space").
const LETTERS = '{greek}';

const transforms = [];
const byId = new Map();

function transform(id, name, description) {
    if (byId.has(id)) { return byId.get(id); }
    const t = {id, name, description, source: 'own', rules: []};
    transforms.push(t);
    byId.set(id, t);
    return t;
}

function constraints(opts) {
    const out = {};
    out.stemMinLength = opts.min ?? 2;
    out.stemCharacters = opts.chars ?? LETTERS;
    for (const key of ['stemContains', 'stemStartsWith', 'stemEndsWith', 'stemNotStartsWith', 'stemNotEndsWith', 'stemNotStartsWithText', 'stemStartsWithText']) {
        if (opts[key] !== undefined) { out[key] = opts[key]; }
    }
    if (out.stemMinLength === 0) { delete out.stemMinLength; }
    return out;
}

/**
 * A plain suffix rule (the accent stays where the input has it).
 * @param {string} id transform id
 * @param {string} inflected
 * @param {string} deinflected
 * @param {object} [opts] {out: conditionsOut, in: conditionsIn, min, chars, stemContains, ...}
 */
function suffix(id, inflected, deinflected, opts = {}) {
    const t = byId.get(id);
    if (t === undefined) { throw new Error(`no transform ${id}`); }
    t.rules.push({
        type: 'suffix', inflected, deinflected,
        conditionsIn: opts.in ?? [], conditionsOut: opts.out ?? [],
        ...constraints(opts),
    });
}

function whole(id, inflected, deinflected, opts = {}) {
    const t = byId.get(id);
    if (t === undefined) { throw new Error(`no transform ${id}`); }
    t.rules.push({type: 'wholeWord', inflected, deinflected, conditionsIn: opts.in ?? [], conditionsOut: opts.out ?? []});
}

function prefix(id, inflected, deinflected, opts = {}) {
    const t = byId.get(id);
    t.rules.push({type: 'prefix', inflected, deinflected, conditionsIn: opts.in ?? [], conditionsOut: opts.out ?? [], ...constraints(opts)});
}

/**
 * Suffix pairs that share `then` steps, as one circumfix in the cross-product
 * form. `prefixes` defaults to the empty prefix.
 */
function shared(id, pairs, then, opts = {}) {
    if (pairs.length === 0) { return; }
    const t = byId.get(id);
    if (t === undefined) { throw new Error(`no transform ${id}`); }
    const seen = new Set();
    const unique = pairs.filter(([a, b]) => {
        const key = `${a}\u0000${b}`;
        if (seen.has(key)) { return false; }
        seen.add(key);
        return true;
    });
    let out = opts.out ?? [];
    let suffixes = unique;
    let steps = then;
    let more = {};
    if (typeof then === 'string') {
        out = out.map((c) => {
            const kind = KIND[then][c];
            if (kind === undefined) { throw new Error(`${id}: no ${then} accent for ${c}`); }
            return kind;
        });
        steps = null;
    } else if (then !== null && then.final !== undefined) {
        const bare = plain(then.final);
        suffixes = unique.map(([a, b]) => {
            if (!b.endsWith(bare)) { throw new Error(`${id}: ${b} does not end with ${bare}`); }
            return [a, b.slice(0, b.length - bare.length) + then.final];
        });
        // A stem without an accent (after an internal augment, απέκτησα →
        // αποκτησα) takes the ending as it is.
        if (opts.stemContains === undefined) {
            t.rules.push({type: 'circumfix', prefixes: opts.prefixes ?? [['', '']], suffixes, conditionsIn: opts.in ?? [], conditionsOut: out,
                ...constraints({...opts, chars: '{unaccented}'})});
        }
        steps = REMOVE_FIRST_ACCENT;
        more = {stemContains: ACCENTED};
    }
    const rule = {
        type: 'circumfix',
        prefixes: opts.prefixes ?? [['', '']],
        suffixes,
        conditionsIn: opts.in ?? [], conditionsOut: out,
        ...constraints({...opts, ...more}),
    };
    if (steps !== null) { rule.then = steps; }
    t.rules.push(rule);
}

// --- Verbs --------------------------------------------------------------------------
//
// Conjugation I (barytone, lemma -ω, γράφω; mediopassive -ομαι, γράφομαι) is
// stressed on the last syllable of its stem. Conjugation II (oxytone) has
// lemmas in -άω/-ώ (αγαπάω, αγαπώ; passive αγαπιέμαι; κοιμάμαι) and in -ώ
// with -είς (θεωρώ; passive θεωρούμαι). wty-el-en lists -άω verbs under -άω
// and gives -ώ as their alternative form, so readings of such forms give
// both.
//
// The perfective stem (aorist and dependent) adds -σ-, -ψ- or -ξ- to the
// stem, or changes its consonant: the table maps the end of the perfective
// stem to the end of the present stem.

const PERSON = {
    '1sg': ['1st sg', 'first person singular (εγώ)'],
    '2sg': ['2nd sg', 'second person singular (εσύ)'],
    '3sg': ['3rd sg', 'third person singular (αυτός, αυτή, αυτό)'],
    '1pl': ['1st pl', 'first person plural (εμείς)'],
    '2pl': ['2nd pl', 'second person plural (εσείς)'],
    '3pl': ['3rd pl', 'third person plural (αυτοί, αυτές, αυτά)'],
};
const PERSONS = Object.keys(PERSON);

function personTransforms(prefixId, label, description, examples) {
    for (const p of PERSONS) {
        const [short, long] = PERSON[p];
        const ex = examples[p];
        transform(`${prefixId}-${p}`, `${label} (${short})`, `${description}, ${long}${ex ? `: ${ex}` : ''}.`);
    }
}

personTransforms('present', 'present', 'Present (imperfective non-past)', {
    '1sg': 'αγαπώ (αγαπάω)', '2sg': 'γράφεις, αγαπάς, θεωρείς', '3sg': 'γράφει, αγαπά, αγαπάει, θεωρεί', '1pl': 'γράφουμε, γράφομε, αγαπάμε, θεωρούμε',
    '2pl': 'γράφετε, αγαπάτε, θεωρείτε', '3pl': 'γράφουν, γράφουνε, αγαπάνε, θεωρούν'});
personTransforms('imperfect', 'imperfect', 'Imperfect (imperfective past)', {
    '1sg': 'έγραφα, αγόραζα, αγαπούσα', '2sg': 'έγραφες, αγαπούσες', '3sg': 'έγραφε, αγαπούσε', '1pl': 'γράφαμε, αγαπούσαμε',
    '2pl': 'γράφατε, αγαπούσατε', '3pl': 'έγραφαν, γράφανε, αγαπούσαν'});
personTransforms('aorist', 'aorist', 'Aorist (simple past, perfective)', {
    '1sg': 'έγραψα, αγόρασα, αγάπησα', '2sg': 'έγραψες, αγόρασες', '3sg': 'έγραψε, αγόρασε', '1pl': 'γράψαμε, αγοράσαμε, αγαπήσαμε',
    '2pl': 'γράψατε, αγοράσατε', '3pl': 'έγραψαν, γράψανε, αγόρασαν'});
personTransforms('dependent', 'dependent', 'Perfective non-past (dependent), used after θα, να and ας; the 3rd singular is also the form used with έχω and είχα (έχω γράψει)', {
    '1sg': '(θα) γράψω, αγοράσω, αγαπήσω', '2sg': 'γράψεις', '3sg': 'γράψει', '1pl': 'γράψουμε, γράψομε', '2pl': 'γράψετε', '3pl': 'γράψουν, γράψουνε'});
transform('imperative-2sg', 'imperative (2nd sg)', 'Imperative, imperfective, second person singular: γράφε, αγάπα.');
transform('imperative-2pl', 'imperative (2nd pl)', 'Imperative, imperfective, second person plural: γράφετε, αγαπάτε (as the present).');
transform('perfective-imperative-2sg', 'perfective imperative (2nd sg)', 'Imperative, perfective, second person singular: γράψε, αγόρασε, αγάπησε.');
transform('perfective-imperative-2pl', 'perfective imperative (2nd pl)', 'Imperative, perfective, second person plural: γράψτε, αγοράστε, αγαπήστε.');
transform('gerund', 'gerund', 'Active participle (gerund), indeclinable: γράφοντας, αγαπώντας.');

personTransforms('passive-present', 'passive present', 'Mediopassive present', {
    '1sg': 'γράφομαι → γράφω', '2sg': 'γράφεσαι, αγαπιέσαι, κοιμάσαι, θεωρείσαι', '3sg': 'γράφεται, αγαπιέται, κοιμάται, θεωρείται', '1pl': 'γραφόμαστε, αγαπιόμαστε, θεωρούμαστε',
    '2pl': 'γράφεστε, γραφόσαστε, αγαπιέστε', '3pl': 'γράφονται, αγαπιούνται, θεωρούνται'});
personTransforms('passive-imperfect', 'passive imperfect', 'Mediopassive imperfect', {
    '1sg': 'γραφόμουν, γραφόμουνα, αγαπιόμουν', '2sg': 'γραφόσουν, γραφόσουνα', '3sg': 'γραφόταν, γραφότανε', '1pl': 'γραφόμασταν',
    '2pl': 'γραφόσασταν', '3pl': 'γράφονταν, γραφόντουσαν, αγαπιούνταν'});
personTransforms('passive-aorist', 'passive aorist', 'Mediopassive aorist (simple past)', {
    '1sg': 'γράφτηκα, αγοράστηκα, αγαπήθηκα', '2sg': 'γράφτηκες', '3sg': 'γράφτηκε', '1pl': 'γραφτήκαμε', '2pl': 'γραφτήκατε', '3pl': 'γράφτηκαν, γραφτήκανε'});
personTransforms('passive-dependent', 'passive dependent', 'Mediopassive perfective non-past (dependent), used after θα, να and ας; the 3rd singular is also the form used with έχω (έχω γραφτεί)', {
    '1sg': '(θα) γραφτώ, αγαπηθώ', '2sg': 'γραφτείς', '3sg': 'γραφτεί', '1pl': 'γραφτούμε', '2pl': 'γραφτείτε', '3pl': 'γραφτούν, γραφτούνε'});
transform('passive-imperative-2sg', 'passive imperative (2nd sg)', 'Mediopassive imperative, second person singular: ντύσου, σκέψου, θυμήσου.');
transform('passive-participle', 'passive participle', 'Perfect passive participle, as an adjective in -μένος: γραμμένος, αγορασμένος, αγαπημένος.');
transform('internal-augment', 'internal augment', 'Past form of a compound verb with the augment ε inside it: επέστρεψα (επιστρέφω), κατέστρεψα, παρέδωσα, συνέλαβα.');
transform('xana', 'ξανα- (again)', 'The prefix ξανα- (again): ξαναγράφω, ξανάγραψα → γράφω.');

const VERB = {out: ['v'], in: ['aug']};

// Conjugation I: present, imperfect and imperative endings on the present stem.
const PRESENT_ENDINGS = {'2sg': ['εις'], '3sg': ['ει'], '1pl': ['ουμε', 'ομε'], '2pl': ['ετε'], '3pl': ['ουν', 'ουνε']};
// Stressed on the third syllable from the end, before the stem's last vowel
// (αγόραζα), or on the augment of a one-syllable stem (έγραφα).
const PAST_STRESSED = {'1sg': ['α'], '2sg': ['ες'], '3sg': ['ε'], '3pl': ['αν']};
// Stressed on the stem's last vowel, as the lemma (αγοράζαμε, γράφαμε,
// αγοράσαν, αγαπήσανε).
const PAST_KEEP = {'1pl': ['αμε'], '2pl': ['ατε'], '3pl': ['ανε', 'αν']};
const DEPENDENT_ENDINGS = {'1sg': ['ω'], '2sg': ['εις'], '3sg': ['ει'], '1pl': ['ουμε', 'ομε'], '2pl': ['ετε'], '3pl': ['ουν', 'ουνε']};
// The augment: έ- before a one-syllable stem (έγραψα), ή- in θέλω, ξέρω, πίνω
// (ήθελα, ήξερα, ήπια) and in learned verbs that begin with ε or α
// (ελπίζω/ήλπιζα, αγγέλλω/ήγγειλα).
const AUGMENTS = [['έ', ''], ['ή', ''], ['ή', 'ε'], ['ή', 'α']];

const ACCENTED = '{accented}';

for (const [p, endings] of Object.entries(PRESENT_ENDINGS)) {
    for (const e of endings) { suffix(`present-${p}`, e, 'ω', {...VERB, stemContains: ACCENTED}); }
}
// Imperfect: the stressed forms, with and without the augment, then the others.
// Stems ending in a vowel add γ (άκουγα, έφταιγα, έκλαιγα).
for (const [p, endings] of Object.entries(PAST_STRESSED)) {
    const pairs = endings.flatMap((e) => [[e, 'ω'], ['γ' + e, 'ω'], ['αριζ' + e, 'αρω']]);
    shared(`imperfect-${p}`, pairs, stemLast('ω'), {...VERB});
    shared(`imperfect-${p}`, pairs, stemLast('ω'), {...VERB, prefixes: AUGMENTS, min: 1});
}
for (const [p, endings] of Object.entries(PAST_KEEP)) {
    for (const e of endings) {
        suffix(`imperfect-${p}`, e, 'ω', {...VERB, stemContains: ACCENTED});
        suffix(`imperfect-${p}`, 'γ' + e, 'ω', {...VERB, stemContains: ACCENTED, stemEndsWith: ACCENTED});
    }
}
suffix('imperative-2sg', 'ε', 'ω', {...VERB, stemContains: ACCENTED});
suffix('gerund', 'οντας', 'ω', {...VERB, stemContains: ACCENTED});
suffix('gerund', 'γοντας', 'ω', {...VERB, stemEndsWith: ACCENTED});

// The perfective stem: [end of the perfective stem, end of the present stem].
// Regular sigmatic aorists, then asigmatic and irregular stems that compounds
// share (κατάλαβα, απέφυγα, παρέμεινα).
const PERFECTIVE = [
    // -σ-: αγοράζω/αγόρασα, κλείνω/έκλεισα, πλάθω/έπλασα, ακούω/άκουσα, αρέσω/άρεσα; -άρω loans: παρκάρω/παρκάρισα
    ['σ', 'ζ'], ['σ', 'ν'], ['σ', 'θ'], ['σ', ''], ['σ', 'σ'], ['αρισ', 'αρ'],
    // -ψ-: γράφω/έγραψα, κόβω/έκοψα, λείπω/έλειψα, βλάπτω/έβλαψα, ανάβω, δουλεύω/δούλεψα, παύω/έπαψα, καίω/έκαψα
    ['ψ', 'φ'], ['ψ', 'β'], ['ψ', 'π'], ['ψ', 'πτ'], ['ψ', 'φτ'], ['εψ', 'ευ'], ['αψ', 'αυ'], ['αψ', 'αι'],
    // -ξ-: πλέκω/έπλεξα, τρέχω/έτρεξα, ανοίγω/άνοιξα, αλλάζω/άλλαξα, φυλάσσω, ψάχνω/έψαξα, σφίγγω/έσφιξα, φταίω/έφταιξα
    ['ξ', 'κ'], ['ξ', 'χ'], ['ξ', 'γ'], ['ξ', 'ζ'], ['ξ', 'σσ'], ['ξ', 'ττ'], ['ξ', 'χν'], ['ξ', 'γγ'], ['ιξ', 'ι'],
    // asigmatic: φέρνω/έφερα, κάνω/έκανα, κρίνω/έκρινα, πεθαίνω/πέθανα, στέλνω/έστειλα, αγγέλλω/άγγειλα,
    // δέρνω/έδειρα, σέρνω/έσυρα
    ['ρ', 'ρν'], ['ν', 'ν'], ['λ', 'λλ'], ['αν', 'αιν'], ['ειλ', 'ελν'], ['ειλ', 'ελλ'], ['ειλ', 'ελ'], ['ειρ', 'ερν'], ['υρ', 'ερν'],
    // νέμω/ένειμα (διανέμω/διένειμα), learned πνέω/έπνευσα, πλέω/έπλευσα
    ['ειμ', 'εμ'], ['ευσ', 'ε'],
    // irregular stems, which compounds share: φεύγω/έφυγα, μένω/έμεινα, βάζω/έβαλα, -βάλλω/-έβαλα,
    // βγάζω/έβγαλα, -λαμβάνω/-έλαβα, καταλαβαίνω/κατάλαβα, δίνω/έδωσα, -δίδω/-έδωσα, -θέτω/-έθεσα,
    // πέφτω/έπεσα, μαθαίνω/έμαθα, παθαίνω/έπαθα, τυχαίνω/έτυχα, πλένω/έπλυνα, απολαμβάνω/απόλαυσα,
    // ανασταίνω/ανάστησα; past only: πίνω/ήπια (καταπίνω/κατάπια), -βαίνω/-έβηκα, τρώω/έφαγα
    ['φυγ', 'φευγ'], ['μειν', 'μεν'], ['βαλ', 'βαζ'], ['βαλ', 'βαλλ'], ['βγαλ', 'βγαζ'], ['λαβ', 'λαμβαν'], ['λαβ', 'λαβαιν'],
    ['δωσ', 'διν'], ['δωσ', 'διδ'], ['θεσ', 'θετ'], ['πεσ', 'πεφτ'], ['μαθ', 'μαθαιν'], ['παθ', 'παθαιν'], ['τυχ', 'τυχαιν'],
    ['πλυν', 'πλεν'], ['λαυσ', 'λαμβαν'], ['στησ', 'σταιν'], ['πι', 'πιν', 'past'], ['βηκ', 'βαιν', 'past'], ['φαγ', 'τρω', 'past'],
];
// Endings of one or two letters need a stem before them; the irregular stems
// may stand alone after the augment (έφυγα: έ + φυγ + α) or without it (φύγαμε).
const IRREGULAR_STEMS = new Set(['φυγ', 'μειν', 'βαλ', 'βγαλ', 'λαβ', 'δωσ', 'θεσ', 'πεσ', 'μαθ', 'παθ', 'τυχ', 'πλυν', 'βηκ', 'φαγ', 'πι']);
for (const [aor, pres, only] of PERFECTIVE) {
    const min = IRREGULAR_STEMS.has(aor) ? 0 : 1;
    const accentInStem = aor === acc(aor) ? ACCENTED : undefined;
    for (const [p, endings] of Object.entries(PAST_STRESSED)) {
        shared(`aorist-${p}`, endings.map((e) => [aor + e, pres + 'ω']), stemLast('ω'), {...VERB, min: 1});
        shared(`aorist-${p}`, endings.map((e) => [aor + e, pres + 'ω']), stemLast('ω'), {...VERB, prefixes: AUGMENTS, min});
    }
    const keep = (id, inflected, deinflected) => {
        if (inflected !== deinflected) { suffix(id, inflected, deinflected, {...VERB, min, stemContains: accentInStem}); }
    };
    for (const [p, endings] of Object.entries(PAST_KEEP)) {
        for (const e of endings) { keep(`aorist-${p}`, acc(aor) + e, acc(pres) + 'ω'); }
    }
    if (only === 'past') { continue; }
    for (const [p, endings] of Object.entries(DEPENDENT_ENDINGS)) {
        for (const e of endings) { keep(`dependent-${p}`, acc(aor) + e, acc(pres) + 'ω'); }
    }
    // Imperative: γράψε (stressed on the stem's last vowel), αγόρασε (the
    // aorist's 3rd singular, above); γράψτε, αγοράστε, φέρτε, κάντε, στείλτε.
    keep('perfective-imperative-2sg', acc(aor) + 'ε', acc(pres) + 'ω');
    keep('perfective-imperative-2pl', acc(aor) + 'τε', acc(pres) + 'ω');
}

// Conjugation II. The ending carries the accent, except in the stressed past
// forms (αγάπησα, μπόρεσα) and the imperative (αγάπα), where finalAccent()
// moves it back. Some verbs take both sets of present endings (συζητάς and
// συζητείς), so those of -ώ/-είς also give -άω.
const C2 = ['άω', 'ώ'];
const C2_PRESENT = {
    '2sg': ['άς', 'είς'], '3sg': ['ά', 'άει', 'εί'], '1pl': ['άμε', 'ούμε'], '2pl': ['άτε', 'είτε'], '3pl': ['άνε', 'ούν', 'ούνε', 'άν'],
};
suffix('present-1sg', 'ώ', 'άω', {...VERB});
suffix('present-1sg', 'άω', 'ώ', {...VERB});
for (const [p, endings] of Object.entries(C2_PRESENT)) {
    for (const e of endings) { for (const l of C2) { suffix(`present-${p}`, e, l, {...VERB, chars: '{unaccented}'}); } }
}
const C2_IMPERFECT = {'1sg': ['ούσα'], '2sg': ['ούσες'], '3sg': ['ούσε'], '1pl': ['ούσαμε'], '2pl': ['ούσατε'], '3pl': ['ούσαν', 'ούσανε']};
for (const [p, endings] of Object.entries(C2_IMPERFECT)) {
    for (const e of endings) { for (const l of C2) { suffix(`imperfect-${p}`, e, l, {...VERB, chars: '{unaccented}'}); } }
}
// Colloquial -αγα imperfect: αγάπαγα, σταμάταγαν, αγαπάγαμε.
for (const l of C2) {
    for (const [p, endings] of Object.entries({'1sg': ['αγα'], '2sg': ['αγες'], '3sg': ['αγε'], '3pl': ['αγαν']})) {
        shared(`imperfect-${p}`, endings.map((e) => [e, plain(l)]), finalAccent(l), {...VERB, stemContains: ACCENTED});
    }
    for (const [p, endings] of Object.entries({'1pl': ['άγαμε'], '2pl': ['άγατε'], '3pl': ['άγανε']})) {
        for (const e of endings) { suffix(`imperfect-${p}`, e, l, {...VERB, chars: '{unaccented}'}); }
    }
    suffix('gerund', 'ώντας', l, {...VERB, chars: '{unaccented}'});
    // Imperfective imperative: αγάπα, βάστα, ξεψύχα (stressed before the ending).
    shared('imperative-2sg', [['α', plain(l)]], finalAccent(l), {...VERB, stemContains: ACCENTED});
}

// Perfective stems of conjugation II: αγαπώ/αγάπησα, γελώ/γέλασα, μπορώ/μπόρεσα,
// πηδώ/πήδηξα, πετώ/πέταξα, κοιτάω/κοίταξα.
const C2_PERFECTIVE = ['ησ', 'ασ', 'εσ', 'ηξ', 'αξ'];
for (const aor of C2_PERFECTIVE) {
    for (const lemma of C2) {
        for (const [p, endings] of Object.entries(PAST_STRESSED)) {
            shared(`aorist-${p}`, endings.map((e) => [aor + e, plain(lemma)]), finalAccent(lemma), {...VERB});
        }
        for (const [p, endings] of Object.entries(PAST_KEEP)) {
            for (const e of endings) { suffix(`aorist-${p}`, acc(aor) + e, lemma, {...VERB, chars: '{unaccented}'}); }
        }
        for (const [p, endings] of Object.entries(DEPENDENT_ENDINGS)) {
            for (const e of endings) { suffix(`dependent-${p}`, acc(aor) + e, lemma, {...VERB, chars: '{unaccented}'}); }
        }
        suffix('perfective-imperative-2pl', acc(aor) + 'τε', lemma, {...VERB, chars: '{unaccented}'});
    }
}
// Colloquial imperative of -εύω, -αύω verbs: σημαδεύτε, κλαδεύτε.
suffix('perfective-imperative-2pl', 'ύτε', 'ύω', {...VERB, stemEndsWith: '[εα]'});

// Mediopassive of conjugation I. Every rule gives the active lemma (wty-el-en
// lists γράφομαι as a form of γράφω) and the -ομαι lemma (deponent verbs:
// έρχομαι, σκέφτομαι, κάθομαι).
const PASSIVE_LEMMAS = [['ω', 'ω'], ['ομαι', 'ομαι']];
suffix('passive-present-1sg', 'ομαι', 'ω', {...VERB, stemContains: ACCENTED});
for (const [p, endings] of Object.entries({'2sg': ['εσαι'], '3sg': ['εται'], '2pl': ['εστε'], '3pl': ['ονται']})) {
    for (const e of endings) { for (const [l] of PASSIVE_LEMMAS) { suffix(`passive-present-${p}`, e, l, {...VERB, stemContains: ACCENTED}); } }
}
for (const [l, e] of PASSIVE_LEMMAS) {
    shared('passive-present-1pl', [['όμαστε', l]], stemLast(e), {...VERB, chars: '{unaccented}'});
    shared('passive-present-2pl', [['όσαστε', l]], stemLast(e), {...VERB, chars: '{unaccented}'});
    shared('passive-imperfect-1sg', [['όμουν', l], ['όμουνα', l]], stemLast(e), {...VERB, chars: '{unaccented}'});
    shared('passive-imperfect-2sg', [['όσουν', l], ['όσουνα', l]], stemLast(e), {...VERB, chars: '{unaccented}'});
    shared('passive-imperfect-3sg', [['όταν', l], ['ότανε', l]], stemLast(e), {...VERB, chars: '{unaccented}'});
    shared('passive-imperfect-1pl', [['όμασταν', l], ['όμαστε', l]], stemLast(e), {...VERB, chars: '{unaccented}'});
    shared('passive-imperfect-2pl', [['όσασταν', l], ['όσαστε', l]], stemLast(e), {...VERB, chars: '{unaccented}'});
    shared('passive-imperfect-3pl', [['όντουσαν', l], ['όντουσανε', l], ['όντανε', l]], stemLast(e), {...VERB, chars: '{unaccented}'});
    suffix('passive-imperfect-3pl', 'ονταν', l, {...VERB, stemContains: ACCENTED});
    suffix('passive-imperfect-3pl', 'οντανε', l, {...VERB, stemContains: ACCENTED});
}

// Passive perfective stems: [end of the stem before -ηκα/-ώ, end of the present stem].
// γράφτηκα (γράφ-τ-), δουλεύτηκα, δέχτηκα (δέχ-τ-, δέχομαι); αγοράστηκα, κλείστηκα,
// πείστηκα, ακούστηκα; αλλάχτηκα, δείχτηκα, ανοίχτηκα, μπλέχτηκα, σφίχτηκα;
// κρύφτηκα, κλέφτηκα; λύθηκα, χάθηκα, σώθηκα, πληρώθηκα; αισθάνθηκα; πνίγηκα,
// σκέφτηκα (σκέφτ-, σκέφτομαι); κόπηκα.
// The learned -θ- forms beside -τ- (δεχθεί, εκλέχθηκε, γράφθηκε, αναπαύθηκα,
// σπάρθηκε), and the irregular stems of compounds (επιβλήθηκε, συνελήφθη,
// αντισταθείτε).
const PASSIVE_PERFECTIVE = [
    ['τ', ''], ['στ', 'ζ'], ['στ', 'ν'], ['στ', 'θ'], ['στ', ''], ['χτ', 'ζ'], ['χτ', 'χν'], ['χτ', 'γ'], ['χτ', 'κ'],
    ['χτ', 'σσ'], ['χτ', 'γγ'], ['φτ', 'β'], ['φτ', 'π'], ['φτ', 'πτ'], ['θ', 'ν'], ['θ', 'ζ'], ['θ', ''], ['νθ', 'ν'], ['', ''], ['π', 'β'],
    ['χθ', 'χ'], ['χθ', 'γ'], ['χθ', 'κ'], ['χθ', 'χν'], ['φθ', 'φ'], ['φθ', 'β'], ['φθ', 'π'], ['φθ', 'πτ'], ['σθ', 'ζ'], ['σθ', 'ν'],
    ['ρθ', 'ρν'], ['λθ', 'λν'], ['λθ', 'λλ'], ['λθ', 'ζ'], ['αθ', 'αιν'], ['αρθ', 'ερν'], ['δοθ', 'διν'], ['δοθ', 'διδ'],
    ['βληθ', 'βαλλ'], ['ληφθ', 'λαμβαν'], ['σταθ', 'στεκ'],
];
const PASSIVE_AORIST_KEEP = {'1sg': ['ηκα'], '2sg': ['ηκες'], '3sg': ['ηκε'], '3pl': ['ηκαν']};
const PASSIVE_AORIST_MOVED = {'1pl': ['ήκαμε'], '2pl': ['ήκατε'], '3pl': ['ήκανε', 'ήκαν']};
const PASSIVE_DEPENDENT = {'1sg': ['ώ'], '2sg': ['είς'], '3sg': ['εί'], '1pl': ['ούμε'], '2pl': ['είτε'], '3pl': ['ούν', 'ούνε']};
for (const [aor, pres] of PASSIVE_PERFECTIVE) {
    for (const [l, e] of PASSIVE_LEMMAS) {
        for (const [p, endings] of Object.entries(PASSIVE_AORIST_KEEP)) {
            for (const end of endings) {
                const vowelInStem = aor !== acc(aor);
                suffix(`passive-aorist-${p}`, acc(aor) + end, (vowelInStem ? acc(pres) : pres) + l, {...VERB, stemContains: vowelInStem ? undefined : ACCENTED});
            }
        }
        for (const [p, endings] of Object.entries(PASSIVE_AORIST_MOVED)) {
            shared(`passive-aorist-${p}`, endings.map((end) => [aor + end, pres + l]), stemLast(e), {...VERB, chars: '{unaccented}', min: /[αεηιουω]/.test(aor) ? 0 : 2});
        }
        const min = /[αεηιουω]/.test(aor) ? 0 : 2;
        for (const [p, endings] of Object.entries(PASSIVE_DEPENDENT)) {
            const opts = {...VERB, chars: '{unaccented}', min, stemEndsWith: aor === '' ? '[τθχ]' : undefined};
            shared(`passive-dependent-${p}`, endings.map((end) => [aor + end, pres + l]), stemLast(e), opts);
        }
    }
}
// The learned aorist of the -θ- stems: (συν)ελήφθη, εξελέγη (above as -η after γ is
// left out), εκλέχθησαν.
for (const [aor, pres] of PASSIVE_PERFECTIVE.filter(([a]) => a.endsWith('θ'))) {
    for (const [l] of PASSIVE_LEMMAS) {
        const vowelInStem = aor !== acc(aor);
        for (const [p, end] of [['3sg', 'η'], ['3pl', 'ησαν']]) {
            suffix(`passive-aorist-${p}`, acc(aor) + end, (vowelInStem ? acc(pres) : pres) + l, {...VERB, stemContains: vowelInStem ? undefined : ACCENTED});
        }
    }
}
// Passive imperative: ντύσου, ετοιμάσου, σκέψου, (θα) σταθείτε.
for (const [aor, pres] of [['σ', 'ν'], ['σ', 'ζ'], ['ψ', 'φτ'], ['ψ', 'φ'], ['ξ', 'χ']]) {
    suffix('passive-imperative-2sg', aor + 'ου', pres + 'ομαι', {...VERB, stemContains: ACCENTED});
}
// απογοητέψου, ανιχνέψου (-εύομαι)
suffix('passive-imperative-2sg', 'έψου', 'εύομαι', {...VERB});

// Mediopassive of conjugation II: αγαπιέμαι (of αγαπάω), κοιμάμαι, θεωρούμαι, εξαρτώμαι.
const C2_PASSIVE = [
    // [lemma ending, present endings by person, imperfect endings by person, active lemmas]
    ['ιέμαι', {'2sg': ['ιέσαι'], '3sg': ['ιέται'], '1pl': ['ιόμαστε'], '2pl': ['ιέστε'], '3pl': ['ιούνται', 'ιόνται']},
        {'1sg': ['ιόμουν', 'ιόμουνα'], '2sg': ['ιόσουν', 'ιόσουνα'], '3sg': ['ιόταν', 'ιότανε'], '1pl': ['ιόμασταν'], '2pl': ['ιόσασταν'], '3pl': ['ιόνταν', 'ιούνταν', 'ιόντουσαν']}, C2],
    ['άμαι', {'2sg': ['άσαι'], '3sg': ['άται'], '1pl': ['όμαστε', 'ούμαστε'], '2pl': ['άστε', 'όσαστε'], '3pl': ['ούνται', 'όνται']},
        {'1sg': ['όμουν', 'όμουνα'], '2sg': ['όσουν', 'όσουνα'], '3sg': ['όταν', 'ότανε'], '1pl': ['όμασταν', 'ούμασταν'], '2pl': ['όσασταν'],
            '3pl': ['όνταν', 'όντανε', 'ούνταν', 'όντουσαν']}, []],
    ['ούμαι', {'2sg': ['είσαι'], '3sg': ['είται'], '1pl': ['ούμαστε', 'όμαστε', 'ιόμαστε'], '2pl': ['είστε', 'όσαστε', 'ιόσαστε'], '3pl': ['ούνται', 'ιούνται']},
        {'1sg': ['ούμουν', 'ούμουνα', 'ιόμουν', 'ιόμουνα'], '2sg': ['ούσουν', 'ούσουνα', 'ιόσουν', 'ιόσουνα'], '3sg': ['είτο', 'ιόταν', 'ιότανε'],
            '1pl': ['ιόμασταν'], '2pl': ['ιόσασταν'], '3pl': ['ούνταν', 'ούντο', 'ιόνταν', 'ιόντανε', 'ιούνταν', 'ιόντουσαν']}, ['ώ']],
    ['ώμαι', {'2sg': ['άσαι'], '3sg': ['άται'], '1pl': ['ώμαστε'], '2pl': ['άστε'], '3pl': ['ώνται']}, {}, []],
];
for (const [lemma, present, imperfect, active] of C2_PASSIVE) {
    for (const l of [lemma, ...active]) {
        if (l !== lemma) { suffix('passive-present-1sg', lemma, l, {...VERB, chars: '{unaccented}'}); }
        for (const [p, endings] of Object.entries(present)) {
            for (const e of endings) { suffix(`passive-present-${p}`, e, l, {...VERB, chars: '{unaccented}'}); }
        }
        for (const [p, endings] of Object.entries(imperfect)) {
            for (const e of endings) { suffix(`passive-imperfect-${p}`, e, l, {...VERB, chars: '{unaccented}'}); }
        }
    }
}
// Passive perfective of conjugation II: αγαπήθηκα, θεωρήθηκα, κοιμήθηκα (-ήθ-),
// φορέθηκα (-έθ-), γελάστηκα (-άστ-), τραβήχτηκα (-ήχτ-).
const C2_PASSIVE_PERFECTIVE = [
    ['ηθ', ['άω', 'ώ', 'ιέμαι', 'άμαι', 'ούμαι', 'ώμαι']], ['εθ', ['άω', 'ώ']], ['αστ', ['άω', 'ώ', 'ιέμαι', 'άμαι']], ['ηχτ', ['άω', 'ώ', 'ιέμαι']],
    ['αχτ', ['άω', 'ώ', 'ιέμαι']],
];
for (const [aor, lemmas] of C2_PASSIVE_PERFECTIVE) {
    for (const l of lemmas) {
        for (const [p, endings] of Object.entries(PASSIVE_AORIST_KEEP)) {
            for (const end of endings) { suffix(`passive-aorist-${p}`, acc(aor) + end, l, {...VERB, chars: '{unaccented}'}); }
        }
        for (const [p, endings] of Object.entries(PASSIVE_AORIST_MOVED)) {
            for (const end of endings) { suffix(`passive-aorist-${p}`, aor + end, l, {...VERB, chars: '{unaccented}'}); }
        }
        for (const [p, endings] of Object.entries(PASSIVE_DEPENDENT)) {
            for (const end of endings) { suffix(`passive-dependent-${p}`, aor + end, l, {...VERB, chars: '{unaccented}'}); }
        }
    }
}
for (const [inf, l] of [['ήσου', 'άμαι'], ['ήσου', 'ούμαι'], ['ήσου', 'ιέμαι']]) {
    suffix('passive-imperative-2sg', inf, l, {...VERB, chars: '{unaccented}'});
}

// Perfect passive participles (adjectives in -μένος) to their verb.
const PARTICIPLES = [
    ['σμένος', ['ζω', 'νω', 'θω', 'ω', 'ζομαι', 'νομαι']], ['γμένος', ['ζω', 'γω', 'χνω', 'κω', 'χω', 'σσω', 'γγω', 'ζομαι', 'γομαι']],
    ['μμένος', ['φω', 'βω', 'πτω', 'πω', 'φομαι', 'βομαι']], ['μένος', ['νω', 'νομαι']], ['εμένος', ['ευω', 'ευομαι']],
    ['λμένος', ['λνω', 'ζω']], ['ρμένος', ['ρνω']],
];
// The participle itself, or the masculine an adjective rule made of another of
// its forms (γραμμένη → γραμμένος), gives the verb.
const FROM_ADJ = {...VERB, in: ['adj']};
for (const [inf, lemmas] of PARTICIPLES) {
    shared('passive-participle', lemmas.filter((l) => !l.endsWith('ομαι')).map((l) => [inf, l]), stemLast('ω'), FROM_ADJ);
    shared('passive-participle', lemmas.filter((l) => l.endsWith('ομαι')).map((l) => [inf, l]), stemLast('ομαι'), FROM_ADJ);
}
for (const [inf, l] of [['ημένος', 'άω'], ['ημένος', 'ώ'], ['εμένος', 'άω'], ['εμένος', 'ώ'], ['ασμένος', 'άω'], ['ασμένος', 'ώ'], ['ηγμένος', 'άω']]) {
    suffix('passive-participle', inf, l, {...FROM_ADJ, chars: '{unaccented}'});
}

// Internal augment of learned compound verbs: the prefix's augmented form
// becomes the prefix again, and a past-tense rule reads the rest
// (επέστρεψα → επιστρεψα → επιστρέφω). The output carries `aug`, which only
// verb rules take, and which no dictionary term matches.
const INTERNAL_AUGMENTS = [
    ['επέ', 'επι'], ['απέ', 'απο'], ['κατέ', 'κατα'], ['παρέ', 'παρα'], ['μετέ', 'μετα'], ['διέ', 'δια'], ['εξέ', 'εκ'],
    ['ενέ', 'εν'], ['ενέ', 'εμ'], ['ενέ', 'εγ'], ['συνέ', 'συν'], ['συνέ', 'συμ'], ['συνέ', 'συλ'], ['συνέ', 'συγ'],
    ['υπέ', 'υπο'], ['περιέ', 'περι'], ['προέ', 'προ'], ['προσέ', 'προσ'], ['ανέ', 'ανα'], ['αντέ', 'αντι'], ['επανέ', 'επανα'],
    ['υπή', 'υπα'], ['ανή', 'ανα'], ['παρή', 'παρα'], ['εξή', 'εξα'], ['εισή', 'εισα'], ['συνή', 'συνα'],
    ['επε', 'επι'], ['απε', 'απο'], ['κατε', 'κατα'], ['παρε', 'παρα'], ['μετε', 'μετα'], ['διε', 'δια'], ['εξε', 'εκ'],
    ['συνε', 'συν'], ['υπε', 'υπο'], ['ενε', 'εν'],
];
for (const [inf, def] of INTERNAL_AUGMENTS) {
    prefix('internal-augment', inf, def, {out: ['aug'], min: 2});
}
prefix('xana', 'ξανα', '', {min: 2});
prefix('xana', 'ξανά', '', {min: 2});

// Irregular verbs, written out.
const IRREGULAR = [
    // [transform id, form, lemma]
    ...[['present-1sg', 'είμαι'], ['present-2sg', 'είσαι'], ['present-3sg', 'είναι'], ['present-1pl', 'είμαστε'], ['present-2pl', 'είστε'], ['present-2pl', 'είσαστε'],
        ['imperfect-1sg', 'ήμουν'], ['imperfect-1sg', 'ήμουνα'], ['imperfect-2sg', 'ήσουν'], ['imperfect-2sg', 'ήσουνα'], ['imperfect-3sg', 'ήταν'], ['imperfect-3sg', 'ήτανε'],
        ['imperfect-1pl', 'ήμασταν'], ['imperfect-1pl', 'ήμαστε'], ['imperfect-2pl', 'ήσασταν'], ['imperfect-2pl', 'ήσαστε'], ['imperfect-3pl', 'ήσαν'], ['imperfect-3pl', 'ήσανε'],
        ['gerund', 'όντας']].map(([t, f]) => [t, f, 'είμαι']),
    ...[['imperfect-1sg', 'είχα'], ['imperfect-2sg', 'είχες'], ['imperfect-3sg', 'είχε'], ['imperfect-1pl', 'είχαμε'], ['imperfect-2pl', 'είχατε'], ['imperfect-3pl', 'είχαν'], ['imperfect-3pl', 'είχανε']]
        .map(([t, f]) => [t, f, 'έχω']),
    ...[['present-2sg', 'λες'], ['present-3sg', 'λέει'], ['present-1pl', 'λέμε'], ['present-2pl', 'λέτε'], ['present-3pl', 'λένε'], ['present-3pl', 'λεν'],
        ['aorist-1sg', 'είπα'], ['aorist-2sg', 'είπες'], ['aorist-3sg', 'είπε'], ['aorist-1pl', 'είπαμε'], ['aorist-2pl', 'είπατε'], ['aorist-3pl', 'είπαν'], ['aorist-3pl', 'είπανε'],
        ['dependent-1sg', 'πω'], ['dependent-2sg', 'πεις'], ['dependent-3sg', 'πει'], ['dependent-1pl', 'πούμε'], ['dependent-2pl', 'πείτε'], ['dependent-3pl', 'πουν'], ['dependent-3pl', 'πούνε'],
        ['perfective-imperative-2sg', 'πες'], ['perfective-imperative-2pl', 'πείτε'], ['imperative-2sg', 'λέγε'], ['gerund', 'λέγοντας'],
        ['passive-aorist-1sg', 'ειπώθηκα'], ['passive-aorist-3sg', 'ειπώθηκε'], ['passive-aorist-3pl', 'ειπώθηκαν'], ['passive-dependent-3sg', 'ειπωθεί'], ['passive-participle', 'ειπωμένος']]
        .map(([t, f]) => [t, f, 'λέω']),
    ...[['present-2sg', 'πας'], ['present-3sg', 'πάει'], ['present-1pl', 'πάμε'], ['present-2pl', 'πάτε'], ['present-3pl', 'πάνε'],
        ['aorist-1sg', 'πήγα'], ['aorist-2sg', 'πήγες'], ['aorist-3sg', 'πήγε'], ['aorist-1pl', 'πήγαμε'], ['aorist-2pl', 'πήγατε'], ['aorist-3pl', 'πήγαν'], ['aorist-3pl', 'πήγανε']]
        .map(([t, f]) => [t, f, 'πηγαίνω']),
    ...[['aorist-1sg', 'πήγα'], ['present-2sg', 'πας'], ['present-3sg', 'πάει'], ['present-1pl', 'πάμε'], ['present-2pl', 'πάτε'], ['present-3pl', 'πάνε']].map(([t, f]) => [t, f, 'πάω']),
    ...[['present-2sg', 'τρως'], ['present-3sg', 'τρώει'], ['present-1pl', 'τρώμε'], ['present-2pl', 'τρώτε'], ['present-3pl', 'τρώνε'],
        ['aorist-1sg', 'έφαγα'], ['aorist-2sg', 'έφαγες'], ['aorist-3sg', 'έφαγε'], ['aorist-1pl', 'φάγαμε'], ['aorist-2pl', 'φάγατε'], ['aorist-3pl', 'έφαγαν'], ['aorist-3pl', 'φάγανε'],
        ['dependent-1sg', 'φάω'], ['dependent-2sg', 'φας'], ['dependent-3sg', 'φάει'], ['dependent-1pl', 'φάμε'], ['dependent-2pl', 'φάτε'], ['dependent-3pl', 'φάνε'],
        ['perfective-imperative-2sg', 'φάε'], ['perfective-imperative-2pl', 'φάτε'], ['passive-participle', 'φαγωμένος']]
        .map(([t, f]) => [t, f, 'τρώω']),
    ...[['aorist-1sg', 'είδα'], ['aorist-2sg', 'είδες'], ['aorist-3sg', 'είδε'], ['aorist-1pl', 'είδαμε'], ['aorist-2pl', 'είδατε'], ['aorist-3pl', 'είδαν'], ['aorist-3pl', 'είδανε'],
        ['dependent-1sg', 'δω'], ['dependent-2sg', 'δεις'], ['dependent-3sg', 'δει'], ['dependent-1pl', 'δούμε'], ['dependent-2pl', 'δείτε'], ['dependent-3pl', 'δουν'], ['dependent-3pl', 'δούνε'],
        ['perfective-imperative-2sg', 'δες'], ['perfective-imperative-2pl', 'δείτε'],
        ['passive-aorist-1sg', 'ειδώθηκα'], ['passive-aorist-3sg', 'ειδώθηκε'], ['passive-aorist-3pl', 'ειδώθηκαν'], ['passive-dependent-1sg', 'ειδωθώ'], ['passive-dependent-3sg', 'ειδωθεί']]
        .map(([t, f]) => [t, f, 'βλέπω']),
    ...[['aorist-1sg', 'βρήκα'], ['aorist-2sg', 'βρήκες'], ['aorist-3sg', 'βρήκε'], ['aorist-1pl', 'βρήκαμε'], ['aorist-2pl', 'βρήκατε'], ['aorist-3pl', 'βρήκαν'], ['aorist-3pl', 'βρήκανε'],
        ['dependent-1sg', 'βρω'], ['dependent-2sg', 'βρεις'], ['dependent-3sg', 'βρει'], ['dependent-1pl', 'βρούμε'], ['dependent-2pl', 'βρείτε'], ['dependent-3pl', 'βρουν'], ['dependent-3pl', 'βρούνε'],
        ['perfective-imperative-2sg', 'βρες'], ['perfective-imperative-2pl', 'βρείτε']]
        .map(([t, f]) => [t, f, 'βρίσκω']),
    ...[['passive-aorist-1sg', 'βρέθηκα'], ['passive-aorist-2sg', 'βρέθηκες'], ['passive-aorist-3sg', 'βρέθηκε'], ['passive-aorist-1pl', 'βρεθήκαμε'], ['passive-aorist-2pl', 'βρεθήκατε'],
        ['passive-aorist-3pl', 'βρέθηκαν'], ['passive-aorist-3pl', 'βρεθήκανε'], ['passive-dependent-1sg', 'βρεθώ'], ['passive-dependent-2sg', 'βρεθείς'], ['passive-dependent-3sg', 'βρεθεί'],
        ['passive-dependent-1pl', 'βρεθούμε'], ['passive-dependent-2pl', 'βρεθείτε'], ['passive-dependent-3pl', 'βρεθούν']]
        .flatMap(([t, f]) => [[t, f, 'βρίσκομαι'], [t, f, 'βρίσκω']]),
    ...[['aorist-1sg', 'μπήκα'], ['aorist-2sg', 'μπήκες'], ['aorist-3sg', 'μπήκε'], ['aorist-1pl', 'μπήκαμε'], ['aorist-2pl', 'μπήκατε'], ['aorist-3pl', 'μπήκαν'], ['aorist-3pl', 'μπήκανε'],
        ['dependent-1sg', 'μπω'], ['dependent-2sg', 'μπεις'], ['dependent-3sg', 'μπει'], ['dependent-1pl', 'μπούμε'], ['dependent-2pl', 'μπείτε'], ['dependent-3pl', 'μπουν'], ['dependent-3pl', 'μπούνε'],
        ['perfective-imperative-2sg', 'μπες'], ['perfective-imperative-2sg', 'έμπα'], ['perfective-imperative-2pl', 'μπείτε'], ['perfective-imperative-2pl', 'μπέστε']]
        .map(([t, f]) => [t, f, 'μπαίνω']),
    ...[['aorist-1sg', 'βγήκα'], ['aorist-2sg', 'βγήκες'], ['aorist-3sg', 'βγήκε'], ['aorist-1pl', 'βγήκαμε'], ['aorist-2pl', 'βγήκατε'], ['aorist-3pl', 'βγήκαν'], ['aorist-3pl', 'βγήκανε'],
        ['dependent-1sg', 'βγω'], ['dependent-2sg', 'βγεις'], ['dependent-3sg', 'βγει'], ['dependent-1pl', 'βγούμε'], ['dependent-2pl', 'βγείτε'], ['dependent-3pl', 'βγουν'], ['dependent-3pl', 'βγούνε'],
        ['perfective-imperative-2sg', 'βγες'], ['perfective-imperative-2sg', 'έβγα'], ['perfective-imperative-2pl', 'βγείτε'], ['perfective-imperative-2pl', 'βγέστε']]
        .map(([t, f]) => [t, f, 'βγαίνω']),
    ...[['aorist-1sg', 'πήρα'], ['aorist-2sg', 'πήρες'], ['aorist-3sg', 'πήρε'], ['aorist-1pl', 'πήραμε'], ['aorist-2pl', 'πήρατε'], ['aorist-3pl', 'πήραν'], ['aorist-3pl', 'πήρανε'],
        ['dependent-1sg', 'πάρω'], ['dependent-2sg', 'πάρεις'], ['dependent-3sg', 'πάρει'], ['dependent-1pl', 'πάρουμε'], ['dependent-2pl', 'πάρετε'], ['dependent-3pl', 'πάρουν'], ['dependent-3pl', 'πάρουνε'],
        ['perfective-imperative-2sg', 'πάρε'], ['perfective-imperative-2pl', 'πάρτε'], ['passive-aorist-1sg', 'πάρθηκα'], ['passive-aorist-3sg', 'πάρθηκε'], ['passive-dependent-3sg', 'παρθεί'],
        ['passive-participle', 'παρμένος']]
        .map(([t, f]) => [t, f, 'παίρνω']),
    ...[['aorist-1sg', 'ήπια'], ['aorist-2sg', 'ήπιες'], ['aorist-3sg', 'ήπιε'], ['aorist-1pl', 'ήπιαμε'], ['aorist-2pl', 'ήπιατε'], ['aorist-3pl', 'ήπιαν'], ['aorist-3pl', 'ήπιανε'],
        ['dependent-1sg', 'πιω'], ['dependent-2sg', 'πιεις'], ['dependent-3sg', 'πιει'], ['dependent-1pl', 'πιούμε'], ['dependent-2pl', 'πιείτε'], ['dependent-3pl', 'πιουν'], ['dependent-3pl', 'πιούνε'],
        ['perfective-imperative-2sg', 'πιες'], ['perfective-imperative-2pl', 'πιείτε'], ['passive-participle', 'πιωμένος']]
        .map(([t, f]) => [t, f, 'πίνω']),
    ...[['aorist-1sg', 'ήρθα'], ['aorist-2sg', 'ήρθες'], ['aorist-3sg', 'ήρθε'], ['aorist-1pl', 'ήρθαμε'], ['aorist-2pl', 'ήρθατε'], ['aorist-3pl', 'ήρθαν'], ['aorist-3pl', 'ήρθανε'],
        ['aorist-1sg', 'ήλθα'], ['aorist-2sg', 'ήλθες'], ['aorist-3sg', 'ήλθε'], ['aorist-1pl', 'ήλθαμε'], ['aorist-2pl', 'ήλθατε'], ['aorist-3pl', 'ήλθαν'],
        ['dependent-1sg', 'έρθω'], ['dependent-2sg', 'έρθεις'], ['dependent-3sg', 'έρθει'], ['dependent-1pl', 'έρθουμε'], ['dependent-2pl', 'έρθετε'], ['dependent-3pl', 'έρθουν'], ['dependent-3pl', 'έρθουνε'],
        ['dependent-1sg', 'έλθω'], ['dependent-2sg', 'έλθεις'], ['dependent-3sg', 'έλθει'], ['dependent-1pl', 'έλθουμε'], ['dependent-2pl', 'έλθετε'], ['dependent-3pl', 'έλθουν'],
        ['perfective-imperative-2sg', 'έλα'], ['perfective-imperative-2pl', 'ελάτε']]
        .map(([t, f]) => [t, f, 'έρχομαι']),
    ...[['aorist-1sg', 'έγινα'], ['aorist-2sg', 'έγινες'], ['aorist-3sg', 'έγινε'], ['aorist-1pl', 'γίναμε'], ['aorist-2pl', 'γίνατε'], ['aorist-3pl', 'έγιναν'], ['aorist-3pl', 'γίνανε'],
        ['dependent-1sg', 'γίνω'], ['dependent-2sg', 'γίνεις'], ['dependent-3sg', 'γίνει'], ['dependent-1pl', 'γίνουμε'], ['dependent-2pl', 'γίνετε'], ['dependent-3pl', 'γίνουν'],
        ['perfective-imperative-2sg', 'γίνε'], ['perfective-imperative-2pl', 'γίνετε']]
        .map(([t, f]) => [t, f, 'γίνομαι']),
    ...[['passive-aorist-1sg', 'φάνηκα'], ['passive-aorist-2sg', 'φάνηκες'], ['passive-aorist-3sg', 'φάνηκε'], ['passive-aorist-1pl', 'φανήκαμε'], ['passive-aorist-2pl', 'φανήκατε'],
        ['passive-aorist-3pl', 'φάνηκαν'], ['passive-dependent-1sg', 'φανώ'], ['passive-dependent-2sg', 'φανείς'], ['passive-dependent-3sg', 'φανεί'], ['passive-dependent-1pl', 'φανούμε'],
        ['passive-dependent-2pl', 'φανείτε'], ['passive-dependent-3pl', 'φανούν']]
        .map(([t, f]) => [t, f, 'φαίνομαι']),
    ...[['passive-aorist-1sg', 'χάρηκα'], ['passive-aorist-2sg', 'χάρηκες'], ['passive-aorist-3sg', 'χάρηκε'], ['passive-aorist-1pl', 'χαρήκαμε'], ['passive-aorist-2pl', 'χαρήκατε'],
        ['passive-aorist-3pl', 'χάρηκαν'], ['passive-dependent-1sg', 'χαρώ'], ['passive-dependent-2sg', 'χαρείς'], ['passive-dependent-3sg', 'χαρεί'], ['passive-dependent-1pl', 'χαρούμε'],
        ['passive-dependent-2pl', 'χαρείτε'], ['passive-dependent-3pl', 'χαρούν']]
        .map(([t, f]) => [t, f, 'χαίρομαι']),
    ...[['passive-aorist-1sg', 'στάθηκα'], ['passive-aorist-2sg', 'στάθηκες'], ['passive-aorist-3sg', 'στάθηκε'], ['passive-aorist-1pl', 'σταθήκαμε'], ['passive-aorist-2pl', 'σταθήκατε'],
        ['passive-aorist-3pl', 'στάθηκαν'], ['passive-dependent-1sg', 'σταθώ'], ['passive-dependent-2sg', 'σταθείς'], ['passive-dependent-3sg', 'σταθεί'], ['passive-dependent-1pl', 'σταθούμε'],
        ['passive-dependent-2pl', 'σταθείτε'], ['passive-dependent-3pl', 'σταθούν'], ['passive-imperative-2sg', 'στάσου']]
        .map(([t, f]) => [t, f, 'στέκομαι']),
    ...[['aorist-1sg', 'κάθισα'], ['aorist-3sg', 'κάθισε'], ['aorist-1sg', 'κάθησα'], ['aorist-3sg', 'κάθησε'], ['aorist-1pl', 'καθίσαμε'], ['aorist-3pl', 'κάθισαν'],
        ['dependent-1sg', 'καθίσω'], ['dependent-3sg', 'καθίσει'], ['dependent-1sg', 'κάτσω'], ['dependent-2sg', 'κάτσεις'], ['dependent-3sg', 'κάτσει'], ['dependent-1pl', 'κάτσουμε'],
        ['dependent-2pl', 'κάτσετε'], ['dependent-3pl', 'κάτσουν'], ['perfective-imperative-2sg', 'κάτσε'], ['perfective-imperative-2sg', 'κάθισε'], ['perfective-imperative-2pl', 'καθίστε'],
        ['perfective-imperative-2pl', 'κάτσετε']]
        .map(([t, f]) => [t, f, 'κάθομαι']),
    ...[['present-2sg', 'ζεις'], ['present-3sg', 'ζει'], ['present-1pl', 'ζούμε'], ['present-2pl', 'ζείτε'], ['present-3pl', 'ζουν'], ['present-3pl', 'ζούνε'],
        ['imperfect-1sg', 'ζούσα'], ['imperfect-2sg', 'ζούσες'], ['imperfect-3sg', 'ζούσε'], ['imperfect-1pl', 'ζούσαμε'], ['imperfect-2pl', 'ζούσατε'], ['imperfect-3pl', 'ζούσαν'],
        ['aorist-1sg', 'έζησα'], ['aorist-2sg', 'έζησες'], ['aorist-3sg', 'έζησε'], ['aorist-1pl', 'ζήσαμε'], ['aorist-2pl', 'ζήσατε'], ['aorist-3pl', 'έζησαν'],
        ['dependent-1sg', 'ζήσω'], ['dependent-2sg', 'ζήσεις'], ['dependent-3sg', 'ζήσει'], ['dependent-1pl', 'ζήσουμε'], ['dependent-2pl', 'ζήσετε'], ['dependent-3pl', 'ζήσουν'],
        ['perfective-imperative-2sg', 'ζήσε'], ['gerund', 'ζώντας']]
        .map(([t, f]) => [t, f, 'ζω']),
    ...[['present-2sg', 'ακούς'], ['present-3sg', 'ακούει'], ['present-1pl', 'ακούμε'], ['present-2pl', 'ακούτε'], ['present-3pl', 'ακούν'], ['present-3pl', 'ακούνε'],
        ['imperfect-1sg', 'άκουγα'], ['imperfect-2sg', 'άκουγες'], ['imperfect-3sg', 'άκουγε'], ['imperfect-1pl', 'ακούγαμε'], ['imperfect-2pl', 'ακούγατε'], ['imperfect-3pl', 'άκουγαν'],
        ['imperative-2sg', 'άκου'], ['gerund', 'ακούγοντας']]
        .map(([t, f]) => [t, f, 'ακούω']),
    ...[['present-2sg', 'καις'], ['present-3sg', 'καίει'], ['present-1pl', 'καίμε'], ['present-2pl', 'καίτε'], ['present-3pl', 'καίνε']].map(([t, f]) => [t, f, 'καίω']),
    ...[['present-2sg', 'κλαις'], ['present-3sg', 'κλαίει'], ['present-1pl', 'κλαίμε'], ['present-2pl', 'κλαίτε'], ['present-3pl', 'κλαίνε']].map(([t, f]) => [t, f, 'κλαίω']),
    ...[['present-2sg', 'φταις'], ['present-3sg', 'φταίει'], ['present-1pl', 'φταίμε'], ['present-2pl', 'φταίτε'], ['present-3pl', 'φταίνε'], ['aorist-1sg', 'έφταιξα'],
        ['aorist-3sg', 'έφταιξε'], ['dependent-3sg', 'φταίξει']].map(([t, f]) => [t, f, 'φταίω']),
    ...[['aorist-1sg', 'άφησα'], ['aorist-2sg', 'άφησες'], ['aorist-3sg', 'άφησε'], ['aorist-1pl', 'αφήσαμε'], ['aorist-2pl', 'αφήσατε'], ['aorist-3pl', 'άφησαν'],
        ['dependent-1sg', 'αφήσω'], ['dependent-2sg', 'αφήσεις'], ['dependent-3sg', 'αφήσει'], ['dependent-1pl', 'αφήσουμε'], ['dependent-2pl', 'αφήσετε'], ['dependent-3pl', 'αφήσουν'],
        ['perfective-imperative-2sg', 'άσε'], ['perfective-imperative-2sg', 'άφησε'], ['perfective-imperative-2pl', 'αφήστε'], ['perfective-imperative-2pl', 'άστε']]
        .map(([t, f]) => [t, f, 'αφήνω']),
    ...[['aorist-1sg', 'ξέχασα'], ['aorist-2sg', 'ξέχασες'], ['aorist-3sg', 'ξέχασε'], ['aorist-1pl', 'ξεχάσαμε'], ['aorist-2pl', 'ξεχάσατε'], ['aorist-3pl', 'ξέχασαν'],
        ['dependent-1sg', 'ξεχάσω'], ['dependent-2sg', 'ξεχάσεις'], ['dependent-3sg', 'ξεχάσει'], ['dependent-1pl', 'ξεχάσουμε'], ['dependent-2pl', 'ξεχάσετε'], ['dependent-3pl', 'ξεχάσουν'],
        ['perfective-imperative-2pl', 'ξεχάστε'], ['passive-aorist-1sg', 'ξεχάστηκα'], ['passive-aorist-3sg', 'ξεχάστηκε'], ['passive-participle', 'ξεχασμένος']]
        .flatMap(([t, f]) => [[t, f, 'ξεχνάω'], [t, f, 'ξεχνώ']]),
    ...[['aorist-1sg', 'πέρασα'], ['aorist-2sg', 'πέρασες'], ['aorist-3sg', 'πέρασε'], ['aorist-1pl', 'περάσαμε'], ['aorist-2pl', 'περάσατε'], ['aorist-3pl', 'πέρασαν'],
        ['dependent-1sg', 'περάσω'], ['dependent-2sg', 'περάσεις'], ['dependent-3sg', 'περάσει'], ['dependent-1pl', 'περάσουμε'], ['dependent-2pl', 'περάσετε'], ['dependent-3pl', 'περάσουν'],
        ['perfective-imperative-2pl', 'περάστε']]
        .flatMap(([t, f]) => [[t, f, 'περνάω'], [t, f, 'περνώ']]),
    ...[['aorist-1sg', 'έσπασα'], ['aorist-3sg', 'έσπασε'], ['aorist-3pl', 'έσπασαν'], ['aorist-1pl', 'σπάσαμε'], ['dependent-1sg', 'σπάσω'], ['dependent-3sg', 'σπάσει']]
        .map(([t, f]) => [t, f, 'σπάω']),
    ...[['imperfect-1sg', 'ήθελα'], ['imperfect-2sg', 'ήθελες'], ['imperfect-3sg', 'ήθελε'], ['imperfect-3pl', 'ήθελαν']].map(([t, f]) => [t, f, 'θέλω']),
    ...[['imperfect-1sg', 'ήξερα'], ['imperfect-2sg', 'ήξερες'], ['imperfect-3sg', 'ήξερε'], ['imperfect-3pl', 'ήξεραν']].map(([t, f]) => [t, f, 'ξέρω']),
    ...[['aorist-3sg', 'συνέβη'], ['dependent-3sg', 'συμβεί'], ['aorist-3sg', 'έτυχε']].map(([t, f]) => [t, f, t === 'aorist-3sg' && f === 'έτυχε' ? 'τυχαίνω' : 'συμβαίνω']),
];
for (const [id, form, lemma] of IRREGULAR) {
    whole(id, form, lemma, {out: ['v']});
}
// Forms that compounds share, as suffix rules: έρχομαι (συνέρχομαι συνήλθα,
// προέρχομαι προέλθει, επανέρχομαι), περνάω (διαπερνάω διαπέρασα).
for (const [id, form, lemma] of IRREGULAR.filter(([, f, l]) => (l === 'έρχομαι' && /^(?:ήλθ|έλθ|ήρθ|έρθ)/.test(f)) || (l === 'περνάω' || l === 'περνώ'))) {
    suffix(id, form, lemma, {...VERB, min: 2});
}
suffix('passive-dependent-3sg', 'ιδωθεί', 'βλέπομαι', {...VERB, min: 0});
suffix('passive-dependent-3pl', 'ιδωθούν', 'βλέπομαι', {...VERB, min: 0});
// Old spellings of the lemma: τρώγω (τρώω), λέγω (λέω).
whole('present-1sg', 'τρώγω', 'τρώω', {out: ['v']});
whole('present-1sg', 'λέγω', 'λέω', {out: ['v']});
// The same irregular forms after a prefix, where they take the accent:
// καταπιώ, ξαναδώ, ξαναβρείς, ξαναμπούμε, ξαναπείτε, ξαναφάω.
const COMPOUNDED = [
    ['πίνω', 'πι', ['ώ', 'είς', 'εί', 'ούμε', 'είτε', 'ούν', 'ούνε']], ['βλέπω', 'δ', ['ώ', 'είς', 'εί', 'ούμε', 'είτε', 'ούν', 'ούνε']],
    ['βρίσκω', 'βρ', ['ώ', 'είς', 'εί', 'ούμε', 'είτε', 'ούν', 'ούνε']], ['μπαίνω', 'μπ', ['ώ', 'είς', 'εί', 'ούμε', 'είτε', 'ούν', 'ούνε']],
    ['βγαίνω', 'βγ', ['ώ', 'είς', 'εί', 'ούμε', 'είτε', 'ούν', 'ούνε']], ['λέω', 'π', ['ώ', 'είς', 'εί', 'ούμε', 'είτε', 'ούν', 'ούνε']],
    ['τρώω', 'φ', ['άω', 'ας', 'άει', 'άμε', 'άτε', 'άνε']],
];
for (const [lemma, stem, endings] of COMPOUNDED) {
    endings.forEach((e, i) => {
        const id = ['dependent-1sg', 'dependent-2sg', 'dependent-3sg', 'dependent-1pl', 'dependent-2pl', 'dependent-3pl', 'dependent-3pl'][i];
        suffix(id, stem + e, lemma, {...VERB, min: 2});
    });
}
// -βαίνω compounds: ανέβηκα (ανεβαίνω), κατέβηκα; dependent ανέβω, κατέβεις.
for (const [p, endings] of Object.entries({'1sg': ['ω'], '2sg': ['εις'], '3sg': ['ει'], '1pl': ['ούμε', 'ουμε'], '2pl': ['είτε', 'ετε'], '3pl': ['ουν', 'ούν', 'ουνε', 'ούνε']})) {
    shared(`dependent-${p}`, endings.map((e) => ['β' + e, 'βαινω']), stemLast('ω'), {...VERB, stemEndsWith: '[έεμ]'});
}
shared('perfective-imperative-2sg', [['βα', 'βαινω']], stemLast('ω'), {...VERB, stemEndsWith: '[έε]'});

// --- Nouns and adjectives ------------------------------------------------------------
//
// Cases and numbers of the declensions (Triantafyllidis' classes):
// masculine -ος/-οι, -ας/-ες, -ας/-άδες, -ης/-ες, -ης/-ηδες, -ές/-έδες,
// -ούς/-ούδες, -έας/-είς; feminine -α/-ες, -α/-άδες, -η/-ες, -η/-εις, -ος/-οι,
// -ού/-ούδες; neuter -ο/-α, -ι/-ια, -μα/-ματα, -ος/-η, -ιμο/-ίματα, -ον/-οντα,
// -ός/-ότα, -ας/-ατα. Nouns of three or more syllables stressed on the third
// syllable from the end move the accent in the genitive (άνθρωπος, ανθρώπου,
// ανθρώπων, ανθρώπους; πρόσωπο, προσώπου; όνομα, ονόματος) and in the
// feminine genitive plural (θάλασσα, θαλασσών); adjectives keep it
// (όμορφος, όμορφου, όμορφων).

transform('gen-sg', 'genitive singular', 'Genitive singular: δρόμου, ανθρώπου, βουνού, σπιτιού, ονόματος, ώρας, τέχνης, πόλης, πόλεως, έθνους (also the accusative plural in -ους).');
transform('acc-sg', 'accusative singular', 'Accusative singular of masculine and feminine nouns and adjectives in -ος (δρόμο, καλό), also the neuter singular of adjectives (καλό, όμορφο).');
transform('voc-sg', 'vocative singular', 'Vocative singular of nouns and adjectives in -ος: φίλε, δρόμε, καλέ.');
transform('obl-sg', 'genitive/accusative/vocative singular', 'Genitive, accusative and vocative singular of masculine nouns in -ας, -ης, -ές, -ούς: πατέρα, ναύτη, μαθητή, καφέ, παππού.');
transform('nom-pl', 'nominative plural', 'Nominative and vocative plural of nouns and adjectives in -ος: δρόμοι, άνθρωποι, καλοί.');
transform('acc-pl', 'accusative plural', 'Accusative plural of nouns and adjectives in -ος: δρόμους, ανθρώπους, καλούς; also the genitive singular of neuters in -ος (έθνους, μέρους).');
transform('gen-pl', 'genitive plural', 'Genitive plural: δρόμων, ανθρώπων, ωρών, θαλασσών, τεχνών, πόλεων, ονομάτων, παιδιών.');
transform('plural', 'plural', 'Nominative, accusative and vocative plural: πατέρες, ώρες, πόλεις, βουνά, σπίτια, ονόματα, έθνη, καφέδες, γιαγιάδες.');
transform('feminine', 'feminine', 'Feminine singular of an adjective, nominative, accusative and vocative: καλή, όμορφη, ωραία, γλυκιά, βαθιά.');
transform('feminine-gen-sg', 'feminine genitive singular', 'Feminine genitive singular of an adjective: καλής, όμορφης, ωραίας, βαθιάς.');
transform('feminine-pl', 'feminine plural', 'Feminine plural of an adjective, nominative, accusative and vocative: καλές, όμορφες, ωραίες, βαθιές.');
transform('neuter-pl', 'neuter plural', 'Neuter plural of an adjective, nominative, accusative and vocative (and the adverb in -α): καλά, όμορφα, ωραία, βαθιά.');
transform('comparative', 'comparative', 'Comparative of an adjective: ψηλότερος, ωραιότερος, ομορφότερος, βαθύτερος, ακριβέστερος, απλούστερος.');
transform('superlative', 'superlative', 'Absolute superlative of an adjective: ψηλότατος, ωραιότατος, βαθύτατος, σαφέστατος.');
transform('diminutive', 'diminutive', 'Diminutive of a noun: σπιτάκι, παιδάκι, σκυλάκι, γατούλα, κουκλίτσα.');

// Nouns (`n`), nouns and adjectives (`n`, `adj`) and adjectives (`adj`); letters
// only, stems of two letters or more.
const N = {out: ['n']};
const NA = {out: ['n', 'adj']};
const A = {out: ['adj']};

// Masculine and feminine -ος, and the masculine of adjectives in -ος.
suffix('gen-sg', 'ου', 'ος', NA);
shared('gen-sg', [['ου', 'ος']], LEFT, N);
suffix('gen-sg', 'ού', 'ός', NA);
suffix('acc-sg', 'ο', 'ος', NA);
suffix('acc-sg', 'ό', 'ός', NA);
suffix('voc-sg', 'ε', 'ος', NA);
suffix('voc-sg', 'έ', 'ός', NA);
suffix('nom-pl', 'οι', 'ος', NA);
suffix('nom-pl', 'οί', 'ός', NA);
suffix('gen-pl', 'ων', 'ος', NA);
shared('gen-pl', [['ων', 'ος']], LEFT, N);
suffix('gen-pl', 'ών', 'ός', NA);
suffix('acc-pl', 'ους', 'ος', NA);
shared('acc-pl', [['ους', 'ος']], LEFT, N);
suffix('acc-pl', 'ούς', 'ός', NA);

// Neuter -ο: βιβλίο, βουνό, πρόσωπο.
suffix('gen-sg', 'ου', 'ο', N);
shared('gen-sg', [['ου', 'ο']], LEFT, N);
suffix('gen-sg', 'ού', 'ό', N);
suffix('plural', 'α', 'ο', N);
suffix('plural', 'ά', 'ό', N);
suffix('gen-pl', 'ων', 'ο', N);
shared('gen-pl', [['ων', 'ο']], LEFT, N);
suffix('gen-pl', 'ών', 'ό', N);

// Neuter -ι: σπίτι, τραπέζι, παιδί.
shared('gen-sg', [['ιού', 'ι']], stemLast('ι'), N);
suffix('gen-sg', 'ιού', 'ί', N);
suffix('plural', 'ια', 'ι', N);
suffix('plural', 'ιά', 'ί', N);
shared('gen-pl', [['ιών', 'ι']], stemLast('ι'), N);
suffix('gen-pl', 'ιών', 'ί', N);

// Masculine -ας: πατέρας, άντρας, μήνας, γείτονας, ταμίας; -άς/-άδες: μπαμπάς, ψαράς.
suffix('obl-sg', 'α', 'ας', N);
suffix('obl-sg', 'ά', 'άς', N);
suffix('plural', 'ες', 'ας', N);
suffix('plural', 'άδες', 'άς', N);
suffix('gen-pl', 'ων', 'ας', N);
shared('gen-pl', [['ων', 'ας']], LEFT, N);
shared('gen-pl', [['ών', 'ας']], stemLast('ας'), N);
suffix('gen-pl', 'ιών', 'ίας', N);
suffix('gen-pl', 'άδων', 'άς', N);

// Masculine -ης: ναύτης, κλέφτης, μαθητής, νοικοκύρης/νοικοκύρηδες.
suffix('obl-sg', 'η', 'ης', NA);
suffix('obl-sg', 'ή', 'ής', N);
suffix('plural', 'ες', 'ης', N);
suffix('plural', 'ές', 'ής', N);
suffix('plural', 'ηδες', 'ης', NA);
suffix('plural', 'ήδες', 'ής', N);
suffix('gen-pl', 'ήδων', 'ής', N);
shared('gen-pl', [['ών', 'ης']], stemLast('ης'), N);
suffix('gen-pl', 'ών', 'ής', N);
suffix('gen-pl', 'ηδων', 'ης', N);

// Masculine -ές/-έδες (καφές), -ούς/-ούδες (παππούς), -έας/-είς (συγγραφέας).
suffix('obl-sg', 'έ', 'ές', N);
suffix('plural', 'έδες', 'ές', N);
suffix('gen-pl', 'έδων', 'ές', N);
suffix('obl-sg', 'ού', 'ούς', N);
suffix('plural', 'ούδες', 'ούς', N);
suffix('gen-pl', 'ούδων', 'ούς', N);
suffix('obl-sg', 'έα', 'έας', N);
suffix('plural', 'είς', 'έας', N);
suffix('gen-pl', 'έων', 'έας', N);

// Feminine -α: ώρα, χώρα, θάλασσα, μητέρα, καρδιά, θεωρία; -ά/-άδες: γιαγιά.
suffix('gen-sg', 'ας', 'α', N);
suffix('gen-sg', 'άς', 'ά', N);
suffix('plural', 'ες', 'α', N);
suffix('plural', 'ές', 'ά', N);
suffix('plural', 'άδες', 'ά', N);
shared('gen-pl', [['ών', 'α']], stemLast('α'), N);
shared('gen-pl', [['ών', 'α']], stemSecond('α'), N);
suffix('gen-pl', 'ων', 'α', N);
shared('gen-pl', [['ων', 'α']], LEFT, N);
suffix('gen-pl', 'ών', 'ά', N);
suffix('gen-pl', 'ιών', 'ία', N);
suffix('gen-pl', 'άδων', 'ά', N);

// Feminine -η: τέχνη, νίκη, φωνή; -η/-εις: πόλη, λέξη, δύναμη, απόφαση.
suffix('gen-sg', 'ης', 'η', N);
suffix('gen-sg', 'ής', 'ή', N);
suffix('gen-sg', 'εως', 'η', N);
shared('gen-sg', [['εως', 'η']], LEFT, N);
suffix('plural', 'ες', 'η', N);
suffix('plural', 'ές', 'ή', N);
suffix('plural', 'εις', 'η', N);
shared('plural', [['εις', 'η']], LEFT, N);
shared('gen-pl', [['ών', 'η']], stemLast('η'), N);
suffix('gen-pl', 'ών', 'ή', N);
suffix('gen-pl', 'εων', 'η', N);
suffix('gen-pl', 'ων', 'η', N);
shared('gen-pl', [['εων', 'η']], LEFT, N);

// Feminine -ού/-ούδες: αλεπού.
suffix('gen-sg', 'ούς', 'ού', N);
suffix('plural', 'ούδες', 'ού', N);
suffix('gen-pl', 'ούδων', 'ού', N);

// Neuter -μα: γράμμα, όνομα, πρόβλημα; -ιμο: γράψιμο; -ας: κρέας, τέρας.
suffix('gen-sg', 'ματος', 'μα', N);
shared('gen-sg', [['ματος', 'μα']], LEFT, N);
suffix('plural', 'ματα', 'μα', N);
shared('plural', [['ματα', 'μα']], LEFT, N);
shared('gen-pl', [['μάτων', 'μα']], stemLast('α'), N);
shared('gen-pl', [['μάτων', 'μα']], stemSecond('α'), N);
shared('gen-sg', [['ίματος', 'ιμο']], stemSecond('ο'), N);
shared('plural', [['ίματα', 'ιμο']], stemSecond('ο'), N);
shared('gen-pl', [['ιμάτων', 'ιμο']], stemSecond('ο'), N);
suffix('gen-sg', 'ατος', 'ας', N);
suffix('plural', 'ατα', 'ας', N);
shared('gen-pl', [['άτων', 'ας']], stemLast('ας'), N);

// Neuter -ος: έθνος, μέρος, λάθος, έδαφος. The genitive singular -ους is the
// masculine accusative plural rule.
suffix('plural', 'η', 'ος', N);
shared('plural', [['η', 'ος']], LEFT, N);
shared('gen-pl', [['ών', 'ος']], stemLast('ος'), N);
shared('gen-pl', [['ών', 'ος']], stemSecond('ος'), N);

// Neuter -ον/-οντα (ενδιαφέρον, προϊόν), -ός/-ότα (γεγονός), and the participial
// adjectives -ων/-ουσα/-ον (ενδιαφέρων).
suffix('gen-sg', 'οντος', 'ον', N);
suffix('plural', 'οντα', 'ον', N);
shared('gen-pl', [['όντων', 'ον']], stemLast('ον'), N);
suffix('gen-sg', 'όντος', 'όν', N);
suffix('plural', 'όντα', 'όν', N);
suffix('gen-pl', 'όντων', 'όν', N);
suffix('gen-sg', 'ότος', 'ός', N);
suffix('plural', 'ότα', 'ός', N);
suffix('gen-pl', 'ότων', 'ός', N);
suffix('feminine', 'ουσα', 'ων', A);
suffix('feminine-gen-sg', 'ουσας', 'ων', A);
suffix('feminine-pl', 'ουσες', 'ων', A);
suffix('gen-sg', 'οντος', 'ων', NA);
suffix('plural', 'οντες', 'ων', NA);
suffix('plural', 'οντα', 'ων', A);
suffix('acc-sg', 'οντα', 'ων', NA);

// Adjectives -ος/-η/-ο, -ος/-α/-ο (after a vowel: ωραίος, νέος, πλούσιος),
// -ός/-ιά/-ό (γλυκός, ξανθός), -ύς/-ιά/-ύ (βαθύς), -ής/-ές (ακριβής, συνήθης),
// -ης/-α/-ικο (τεμπέλης). The masculine forms are the noun rules above; the
// neuter singular is the accusative rule.
const AFTER_VOWEL = '{vowel}';
suffix('feminine', 'η', 'ος', A);
suffix('feminine', 'ή', 'ός', A);
suffix('feminine', 'α', 'ος', {...A, stemEndsWith: AFTER_VOWEL});
suffix('feminine', 'ιά', 'ός', A);
suffix('feminine', 'ιά', 'ύς', A);
suffix('feminine', 'α', 'ης', A);
suffix('feminine-gen-sg', 'ης', 'ος', A);
suffix('feminine-gen-sg', 'ής', 'ός', A);
suffix('feminine-gen-sg', 'ας', 'ος', {...A, stemEndsWith: AFTER_VOWEL});
suffix('feminine-gen-sg', 'ιάς', 'ός', A);
suffix('feminine-gen-sg', 'ιάς', 'ύς', A);
suffix('feminine-pl', 'ες', 'ος', A);
suffix('feminine-pl', 'ές', 'ός', A);
suffix('feminine-pl', 'ιές', 'ός', A);
suffix('feminine-pl', 'ιές', 'ύς', A);
suffix('neuter-pl', 'α', 'ος', A);
suffix('neuter-pl', 'ά', 'ός', A);
suffix('neuter-pl', 'ιά', 'ύς', A);
suffix('neuter-pl', 'ικα', 'ης', A);
suffix('acc-sg', 'ικο', 'ης', A);
// -ύς: βαθύς, βαθιού, βαθύ, βαθιοί, βαθιών, βαθιούς.
suffix('acc-sg', 'ύ', 'ύς', A);
suffix('gen-sg', 'ιού', 'ύς', A);
suffix('nom-pl', 'ιοί', 'ύς', A);
suffix('gen-pl', 'ιών', 'ύς', A);
suffix('acc-pl', 'ιούς', 'ύς', A);
// Learned forms of -ύς: ευθεία, ευθείας, ευθειών, ημίσεα, βαθέος, βαθείς.
for (const [id, e] of [['feminine', 'εία'], ['feminine-gen-sg', 'είας'], ['feminine-pl', 'είες'], ['gen-pl', 'ειών'], ['neuter-pl', 'έα'], ['gen-sg', 'έος'], ['plural', 'είς']]) {
    suffix(id, e, 'ύς', A);
}
// Colour adjectives -ής/-ιά/-ί: θαλασσής, θαλασσιά, θαλασσί, θαλασσιοί.
for (const [id, e] of [['acc-sg', 'ί'], ['feminine', 'ιά'], ['feminine-gen-sg', 'ιάς'], ['feminine-pl', 'ιές'], ['nom-pl', 'ιοί'], ['gen-sg', 'ιού'], ['gen-pl', 'ιών'], ['acc-pl', 'ιούς']]) {
    suffix(id, e, 'ής', A);
}
// -ων/-ονα (γενναιόφρων, γενναιόφρονα, γενναιόφρονος, γενναιόφρονες).
for (const [id, e] of [['acc-sg', 'ονα'], ['gen-sg', 'ονος'], ['plural', 'ονες']]) {
    suffix(id, e, 'ων', A);
}
// -ής/-ές: ακριβής, ακριβούς, ακριβή, ακριβείς, ακριβών, ακριβές; συνήθης, συνήθους, συνήθεις.
suffix('gen-sg', 'ούς', 'ής', A);
suffix('plural', 'είς', 'ής', A);
suffix('acc-sg', 'ές', 'ής', A);
suffix('gen-pl', 'ών', 'ές', N);
suffix('gen-sg', 'ους', 'ης', A);
suffix('plural', 'εις', 'ης', A);
suffix('gen-pl', 'ων', 'ης', A);

// Comparative and superlative: the text as scanned or the masculine an
// adjective rule made (ψηλότερης → ψηλότερος → ψηλός). The accent of the
// positive is not in these forms, so each gives the three places it can
// have: ψηλός, ωραίος, όμορφος.
const FROM_A = {...A, in: ['adj']};
for (const [id, stem] of [['comparative', 'ότερ'], ['superlative', 'ότατ']]) {
    suffix(id, stem + 'ος', 'ός', FROM_A);
    shared(id, [[stem + 'ος', 'ος']], stemLast('ος'), FROM_A);
    shared(id, [[stem + 'ος', 'ος']], stemSecond('ος'), FROM_A);
}
for (const [id, inf, lemmas] of [['comparative', 'ύτερος', ['ύς', 'ός']], ['superlative', 'ύτατος', ['ύς']], ['comparative', 'έστερος', ['ής']],
    ['superlative', 'έστατος', ['ής']], ['comparative', 'ούστερος', ['ός']], ['superlative', 'ούστατος', ['ός']]]) {
    for (const l of lemmas) { suffix(id, inf, l, FROM_A); }
}
shared('comparative', [['ύτερος', 'ος']], stemLast('ος'), FROM_A);
for (const [form, lemma] of [['χειρότερος', 'κακός'], ['καλύτερος', 'καλός'], ['περισσότερος', 'πολύς'], ['λιγότερος', 'λίγος'], ['μεγαλύτερος', 'μεγάλος'],
    ['άριστος', 'καλός'], ['κάκιστος', 'κακός'], ['ελάχιστος', 'λίγος'], ['μέγιστος', 'μεγάλος'], ['πλείστος', 'πολύς'], ['ελάσσων', 'μικρός']]) {
    whole(form.includes('τερ') || form === 'ελάσσων' ? 'comparative' : 'superlative', form, lemma, FROM_A);
}
// Diminutives: the text as scanned or the singular a noun rule made
// (σπιτάκια → σπιτάκι → σπίτι): σπιτάκι (σπίτι), παιδάκι (παιδί), σκυλάκι
// (σκύλος), γατάκι (γάτα), μωράκι (μωρό); γατούλα, κουκλίτσα.
const FROM_N = {...N, in: ['n']};
shared('diminutive', [['άκι', 'ι']], stemLast('ι'), FROM_N);
suffix('diminutive', 'άκι', 'ί', FROM_N);
shared('diminutive', [['άκι', 'ος']], stemLast('ος'), FROM_N);
shared('diminutive', [['άκι', 'α']], stemLast('α'), FROM_N);
shared('diminutive', [['άκι', 'ο']], stemLast('ο'), FROM_N);
suffix('diminutive', 'άκι', 'ό', FROM_N);
shared('diminutive', [['ούλα', 'α'], ['ίτσα', 'α']], stemLast('α'), FROM_N);

// --- Elision and aphaeresis --------------------------------------------------------
// A word whose final vowel is elided before another vowel ends in an
// apostrophe (απ' το, είν' αλήθεια, δώσ' το); a word whose first vowel is
// dropped after another vowel starts with one (θα 'ρθει, να 'ναι, που 'χε).
// The lookup normalises ’ and ʼ to '.
transform('elision', 'elision', 'An elided final vowel written as an apostrophe: απ\' (από), είν\' (είναι), δώσ\' (δώσε), αλλ\' (αλλά), κάτ\' (κάτι).');
transform('aphaeresis', 'aphaeresis', 'A dropped first vowel written as an apostrophe: \'ρθει (έρθει), \'ναι (είναι), \'χε (είχε), \'θελα (ήθελα).');
for (const v of ['ε', 'α', 'ο', 'ι', 'ά', 'ό', 'έ', 'ί', 'αι', 'ού', 'ου']) {
    suffix('elision', '\'', v, {min: 1});
}
for (const v of ['έ', 'ε', 'εί', 'ει', 'ή', 'α', 'ό', 'ο']) {
    prefix('aphaeresis', '\'', v, {min: 1});
}

// --- Accent ----------------------------------------------------------------------------
// The second step of a reading whose accent moved (see the header). Each rule
// takes the lemma's ending as its suffix, unchanged, and accents one vowel
// letter of the stem with a stem change; a digraph (αι, ει, οι, ου, αυ, ευ)
// takes the accent on its second letter, which is the letter the change
// finds. These rules also apply to text as scanned (conditions 0, section
// 7.2), where they give a word written without its accent its accented forms
// (ΘΑΛΑΣΣΑ → θαλασσα → θάλασσα).
transform('accent', 'accent', 'The accent written where the dictionary form has it. Greek moves the accent when an ending adds or removes a syllable: '
    + 'αγόρασα → αγοράζω, γραφτήκαμε → γράφω, ανθρώπου → άνθρωπος, θαλασσών → θάλασσα, ομορφότερος → όμορφος.');
const LEMMA_ENDINGS = {
    v: ['ω', 'ομαι'],
    n: ['ος', 'ο', 'α', 'η', 'ι', 'ας', 'ης', 'ον', 'ων'],
    adj: ['ος', 'ης', 'ων'],
};
const VOWEL_LETTERS = ['α', 'ε', 'η', 'ι', 'ο', 'υ', 'ω', 'ϊ', 'ϋ', 'Α', 'Ε', 'Η', 'Ι', 'Ο', 'Υ', 'Ω'];
const identity = (pos) => LEMMA_ENDINGS[pos].map((e) => [e, e]);
function accentRule(pos, kind, letter, change, extra) {
    byId.get('accent').rules.push({
        type: 'circumfix',
        prefixes: [['', '']],
        suffixes: identity(pos),
        conditionsIn: [KIND[kind][pos]],
        conditionsOut: [pos],
        stemMinLength: 2,
        stemCharacters: LETTERS,
        ...extra,
        stemChange: {from: [letter], to: ACUTE[letter], ...change},
    });
}
const CLEAN = {stemCharacters: '{unaccented}'};
for (const pos of ['v', 'n', 'adj']) {
    for (const letter of VOWEL_LETTERS) {
        // last: the last vowel of the stem, followed only by consonants
        // (αγοραζ-ω → αγοράζ-ω, ωρ-α → ώρ-α, ακου-ω → ακού-ω).
        const last = {occurrence: 'last', between: '{consonant}', betweenMinLength: 0};
        accentRule(pos, 'last', letter, last, CLEAN);
        if (pos === 'v') {
            // The accent a stressed past form left in the stem is removed:
            // αγόραζ-ω → αγόράζ-ω → αγοράζ-ω.
            accentRule(pos, 'last', letter, last, {stemContains: ACCENTED, then: REMOVE_FIRST_ACCENT});
            continue;
        }
        // ante: in a stem without an accent, the last vowel letter with two,
        // or three, letters or more after it (νηφαλι-ος → νηφάλι-ος, θαλασσ-α
        // → θάλασσ-α); in one with an accent, the vowel before it, whose
        // accent is then removed (ανθρώπ-ος → άνθρώπ-ος → άνθρωπ-ος).
        for (const minimum of [2, 3]) {
            accentRule(pos, 'ante', letter, {occurrence: 'last', between: '{greek}', betweenMinLength: minimum}, CLEAN);
        }
        // With the stem's accent on its last vowel, only consonants and that
        // accent may follow the vowel that takes it; a digraph whose second
        // letter has the accent (αυγούστ-ος → αύγουστ-ος) also lets its first
        // letter through.
        const left = {stemContains: ACCENTED, then: REMOVE_LAST_ACCENT};
        accentRule(pos, 'ante', letter, {occurrence: 'last', between: '[{consonant}{accented}]', betweenMinLength: 2}, left);
        // At least three letters, so that the digraph's own first letter is
        // not taken (συνελεύσ-η → συνέλευσ-η, not συνελέυσ-η; πετρελαί-ο →
        // πετρέλαι-ο).
        accentRule(pos, 'ante', letter, {occurrence: 'last', between: '[{consonant}{accented}αεο]', betweenMinLength: 3}, {...left, stemContains: '[ίύΐΰ]'});
    }
}

// --- Output -------------------------------------------------------------------------
// Rules of a transform that differ only in their affixes are written as one
// circumfix in the cross-product form with an empty prefix, which keeps the
// file small (docs/languages.md 3 and 7.3); a suffix rule and such a circumfix
// deinflect alike. `--flat <file>` also writes every rule on its own, for
// `eval-language --per-rule`.

function groupKey(rule) {
    const {type, inflected, deinflected, suffixes, ...rest} = rule;
    if (type !== 'suffix' && type !== 'circumfix') { return null; }
    if (type === 'suffix' && rest.stemChange !== undefined) { return null; }
    return JSON.stringify({...rest, prefixes: rest.prefixes ?? [['', '']]});
}

function compact(list) {
    const groups = new Map();
    const order = [];
    for (const rule of list) {
        const key = groupKey(rule);
        if (key === null) { order.push(rule); continue; }
        const pairs = rule.type === 'suffix' ? [[rule.inflected, rule.deinflected]] : rule.suffixes;
        if (!groups.has(key)) {
            const group = {first: rule, pairs: []};
            groups.set(key, group);
            order.push(group);
        }
        groups.get(key).pairs.push(...pairs);
    }
    return order.map((item) => {
        if (item.first === undefined) { return item; }
        const {first, pairs} = item;
        const seen = new Set();
        const unique = pairs.filter(([i, d]) => !seen.has(i + '\u0000' + d) && seen.add(i + '\u0000' + d));
        if (first.type === 'suffix' && unique.length === 1) { return first; }
        const {type, inflected, deinflected, suffixes, prefixes, ...rest} = first;
        return {type: 'circumfix', prefixes: prefixes ?? [['', '']], suffixes: unique, ...rest};
    });
}

const kept = transforms.filter((t) => t.rules.length > 0);
const expanded = (list) => list.reduce((m, r) => m + (r.type === 'circumfix' ? r.prefixes.length * r.suffixes.length : 1), 0);
const flatIndex = process.argv.indexOf('--flat');
if (flatIndex !== -1) {
    writeFileSync(process.argv[flatIndex + 1], formatTransforms({schema: 1, conditions, transforms: kept}));
}
const out = {schema: 1, conditions, transforms: kept.map((t) => ({...t, rules: compact(t.rules)}))};
writeFileSync(join(here, 'own.json'), formatTransforms(out));
console.log(`own.json: ${out.transforms.length} transforms, ${out.transforms.reduce((n, t) => n + t.rules.length, 0)} rule entries, `
    + `${out.transforms.reduce((n, t) => n + expanded(t.rules), 0)} rules expanded (flat: ${kept.reduce((n, t) => n + expanded(t.rules), 0)})`);
