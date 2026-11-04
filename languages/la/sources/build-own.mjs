#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/la/sources/own.json, the Latin rules written for this pack
// (docs/languages.md section 14 step 2), from the tables below. Run from the
// repository root: node languages/la/sources/build-own.mjs
//
// The tables follow Allen and Greenough (1903), Gildersleeve and Lodge (1895)
// and Wiktionary's inflection tables; nothing is copied (README.md, Rule
// provenance). Words are spelled as dictionaries spell headwords, with no
// macrons and i and v for consonantal i and u; language.json's processors
// bring text there. Dictionary forms are tagged v, n, adj and adv: the first
// person singular present (deponents too) and participles, the nominative
// singular (plural for plural-only nouns), the masculine nominative singular.
// Pronouns, determiners, numerals and names have no part of speech, so the
// rules that make them have an empty conditionsOut (section 7.2); the name
// rules apply only to a capitalised word.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// --- Conditions --------------------------------------------------------------
// v, n, adj and adv are defined as in Yomitan's Latin rules, as
// tools/merge-transforms.mjs requires. v has no parts there, so a form that
// must match a row tagged v carries v besides the marker the next rule takes:
// a perfect brought to its first person is [vpf, v] (rēxērunt → rēxī, which a
// form-of row names as regō's), a participle [ptc, v] (amātōrum → amātus).
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['ns', 'np']},
    ns: {name: 'Noun singular', isDictionaryForm: true, subConditions: ['n1s', 'n2s', 'n3s', 'n4s', 'n5s']},
    np: {name: 'Noun plural', isDictionaryForm: true, subConditions: ['n1p', 'n2p', 'n3p', 'n4p', 'n5p']},
    n1: {name: 'Noun, 1st declension', isDictionaryForm: true, subConditions: ['n1s', 'n1p']},
    n1p: {name: 'Noun, 1st declension, plural', isDictionaryForm: true},
    n1s: {name: 'Noun, 1st declension, singular', isDictionaryForm: true},
    n2: {name: 'Noun, 2nd declension', isDictionaryForm: true, subConditions: ['n2s', 'n2p']},
    n2p: {name: 'Noun, 2nd declension, plural', isDictionaryForm: true},
    n2s: {name: 'Noun, 2nd declension, singular', isDictionaryForm: true},
    n3: {name: 'Noun, 3rd declension', isDictionaryForm: true, subConditions: ['n3s', 'n3p']},
    n3p: {name: 'Noun, 3rd declension, plural', isDictionaryForm: true},
    n3s: {name: 'Noun, 3rd declension, singular', isDictionaryForm: true},
    n4: {name: 'Noun, 4th declension', isDictionaryForm: true, subConditions: ['n4s', 'n4p']},
    n4p: {name: 'Noun, 4th declension, plural', isDictionaryForm: true},
    n4s: {name: 'Noun, 4th declension, singular', isDictionaryForm: true},
    n5: {name: 'Noun, 5th declension', isDictionaryForm: true, subConditions: ['n5s', 'n5p']},
    n5p: {name: 'Noun, 5th declension, plural', isDictionaryForm: true},
    n5s: {name: 'Noun, 5th declension, singular', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true, subConditions: ['adj3', 'adj12']},
    adj12: {name: 'Adjective, 1st-2nd declension', isDictionaryForm: true},
    adj3: {name: 'Adjective, 3rd declension', isDictionaryForm: true},
    adv: {name: 'Adverb', isDictionaryForm: true},
    // Markers the next rule takes; no dictionary row has them.
    ptc: {name: 'Participle or gerundive, masculine nominative singular', isDictionaryForm: false},
    vpf: {name: 'Verb, first person singular perfect indicative', isDictionaryForm: false},
    cmp: {name: 'Adjective, comparative, masculine nominative singular', isDictionaryForm: false},
    // A participle or gerundive followed by a form of esse (amātus est,
    // amātūrus esse, delenda est), whose esse was removed.
    aux: {name: 'Participle or gerundive before a form of esse', isDictionaryForm: false},
    auxi: {name: 'Participle or gerundive before esse, fuisse, fore or īrī', isDictionaryForm: false},
    ptcx: {name: 'Participle or gerundive before esse, masculine nominative singular', isDictionaryForm: false},
};

// --- Rule collection ----------------------------------------------------------
// Every rule is added with the slot (form) that makes it. Rules that are equal
// in every field are one rule, in one transform named after all their slots:
// regent (future of regō) and ament (present subjunctive of amō) both end in
// -ent → -ō, so that rule's transform is "future / present subjunctive, 3rd pl".
const SLOTS = new Map();
const RULES = new Map();
let order = 0;

function slot(id, name, description) {
    if (!SLOTS.has(id)) { SLOTS.set(id, {id, name, description, index: SLOTS.size}); }
    return id;
}

function add(slotId, rule) {
    if (!SLOTS.has(slotId)) { throw new Error(`no slot ${slotId}`); }
    if (rule.inflected !== undefined && rule.inflected === rule.deinflected) { return; }
    const key = JSON.stringify(rule);
    let entry = RULES.get(key);
    if (entry === undefined) {
        entry = {rule, slots: [], order: order++};
        RULES.set(key, entry);
    }
    if (!entry.slots.includes(slotId)) { entry.slots.push(slotId); }
}

// A lookup tries prefixes of several words (section 9.2), and a suffix rule's
// stem is everything before its ending. An ending of one or two letters must
// not take a stem with a space, or it fires on a word followed by a short one
// (in eō read as in eus); a longer ending can, which lets the last word of a
// two-word headword inflect (senātūs cōnsultī → senātūs cōnsultum).
const WORD = '[^ ]';
// A word that begins a sentence is capitalised, and a lookup tries it as
// written before it decapitalises it (one processor step), so a rule that
// reads the capitalised word reaches a capitalised headword before the
// lowercase lemma: Mane (in the morning) read as Mānēs, Dīves as a form of
// Deus. Short noun and verb endings therefore take no capital in their stem
// either; adjectives keep it for the proper adjectives (Rōmāna → Rōmānus).
const LOWER_WORD = '[^ A-Z]';

// Leaves out stems exactly: the rule takes no stem that starts with one of
// them, and copies take the longer stems that do (perītus is not pereō's,
// but perterritus is perterreō's). Several stems (with different first
// letters) split the rule by the stem's first letter.
function exceptStems(slotIds, rule, stems) {
    const base = {...rule};
    const copy = (extra) => { for (const slotId of slotIds) { add(slotId, {...base, ...extra}); } };
    const longer = (stem) => copy({stemStartsWithText: stem, stemMinLength: Math.max(rule.stemMinLength ?? 0, [...stem].length + 1)});
    if (stems.length === 1) {
        rule.stemNotStartsWithText = stems[0];
        longer(stems[0]);
        return;
    }
    rule.stemNotStartsWith = `[${stems.map((stem) => stem[0]).join('')}]`;
    for (const stem of stems) {
        copy({stemStartsWithText: stem[0], stemNotStartsWithText: stem});
        longer(stem);
    }
}

function sfx(slotId, inflected, deinflected, conditionsIn, conditionsOut, extra = {}) {
    const adjective = conditionsOut.some((c) => c.startsWith('adj'));
    const noun = !adjective && conditionsOut.some((c) => c === 'n' || /^n[1-5]/u.test(c));
    // A common noun's or a verb's endings of three letters or fewer take no
    // capital in their stem (names have rules of their own; Crēdisne was read
    // as Crēs, Annuit as annō);
    // adjectives keep it for the proper adjectives (Rōmāna). A longer verb
    // ending may take a stem with a space, which reaches idioms such as
    // grātiās agere and certiōrem facere (grātiās agunt → grātiās agō).
    const length = [...inflected].length;
    const verb = !adjective && conditionsOut.some((c) => c === 'v' || c === 'vpf');
    const guard = (noun || verb) && length <= 3 ? {stemCharacters: LOWER_WORD} : length <= 2 && !inflected.includes(' ') ? {stemCharacters: WORD} : {};
    add(slotId, {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, ...guard, ...extra});
}

// Families of compounds written as one cross-product circumfix per form: the
// prefixes that take the form, before it with nothing between (stemCharacters
// "[]" allows only an empty stem), so abest, adest, deest and prōdest are one
// rule whose prefixes are ab, ad, dē and prōd.
const FAMILIES = new Map();
function familyForm(slotId, prefix, lemmaPrefix, form, lemmaSuffix, conditionsIn, conditionsOut) {
    const key = JSON.stringify([slotId, form, lemmaSuffix, conditionsIn, conditionsOut]);
    let entry = FAMILIES.get(key);
    if (entry === undefined) {
        entry = {slotId, form, lemmaSuffix, conditionsIn, conditionsOut, prefixes: []};
        FAMILIES.set(key, entry);
    }
    if (!entry.prefixes.some(([a, b]) => a === prefix && b === lemmaPrefix)) { entry.prefixes.push([prefix, lemmaPrefix]); }
}
function flushFamilies() {
    for (const {slotId, form, lemmaSuffix, conditionsIn, conditionsOut, prefixes} of FAMILIES.values()) {
        add(slotId, {type: 'circumfix', prefixes, suffixes: [[form, lemmaSuffix]], conditionsIn, conditionsOut, stemCharacters: '[]'});
    }
    FAMILIES.clear();
}

function whole(slotId, inflected, deinflected, conditionsIn, conditionsOut) {
    add(slotId, {type: 'wholeWord', inflected, deinflected, conditionsIn, conditionsOut});
}

const alts = (cell) => cell.split('|');

// --- Verbs: the present system ----------------------------------------------------
// Conjugations: 1 (amō, amāre), 2 (moneō, monēre), 3 (regō, regere), 3io
// (capiō, capere), 4 (audiō, audīre). An ending replaces the vowel and ending of
// the dictionary form after the root (am-, mon-, reg-, cap-, aud-). Passive
// forms are read both as the passive of an active verb (amātur → amō) and as
// a deponent verb, whose dictionary form is passive (hortātur → hortor).
const CONJ = ['1', '2', '3', '3io', '4'];
const LEMMA = {1: 'o', 2: 'eo', 3: 'o', '3io': 'io', 4: 'io'};
const DEPONENT = {1: 'or', 2: 'eor', 3: 'or', '3io': 'ior', 4: 'ior'};
const ROOT = {1: 'am', 2: 'mon', 3: 'reg', '3io': 'cap', 4: 'aud'};
const DEP_ROOT = {1: 'hort', 2: 'ver', 3: 'sequ', '3io': 'pat', 4: 'larg'};
const PERSONS = ['1s', '2s', '3s', '1p', '2p', '3p'];
const PERSON_NAME = {'1s': '1st sg', '2s': '2nd sg', '3s': '3rd sg', '1p': '1st pl', '2p': '2nd pl', '3p': '3rd pl'};
const PERSON_TEXT = {
    '1s': 'first person singular', '2s': 'second person singular', '3s': 'third person singular',
    '1p': 'first person plural', '2p': 'second person plural', '3p': 'third person plural',
};
// A verb ending needs a root of two letters (st-at, ag-it), so that short
// words are not read as verbs (e-at, d-at; dō is written out below).
const MIN = {stemMinLength: 2};
// A third conjugation root ends in a consonant or u (reg-, statu-): meam,
// deam and ream are not forms of meō, deō and reō.
const THIRD_ROOT = {stemMinLength: 2, stemNotEndsWith: '[aeio]'};
const minFor = (c) => (c === '3' ? THIRD_ROOT : MIN);
const VB = ['v'];

const ACTIVE = ['m', 's', 't', 'mus', 'tis', 'nt'];
const PASSIVE = ['r', 'ris|re', 'tur', 'mur', 'mini', 'ntur'];
const themed = (vowels, endings) => Object.fromEntries(CONJ.map((c) => [c, endings.map((e) => alts(e).map((x) => vowels[c] + x).join('|'))]));

const FINITE = [
    ['pres', 'present', 'Present indicative', 'act', {
        1: [null, 'as', 'at', 'amus', 'atis', 'ant'],
        2: [null, 'es', 'et', 'emus', 'etis', 'ent'],
        3: [null, 'is', 'it', 'imus', 'itis', 'unt'],
        '3io': [null, 'is', 'it', 'imus', 'itis', 'iunt'],
        4: [null, 'is', 'it', 'imus', 'itis', 'iunt'],
    }],
    ['impf', 'imperfect', 'Imperfect indicative', 'act', themed({1: 'aba', 2: 'eba', 3: 'eba', '3io': 'ieba', 4: 'ieba'}, ACTIVE)],
    ['fut', 'future', 'Future indicative', 'act', {
        1: ['abo', 'abis', 'abit', 'abimus', 'abitis', 'abunt'],
        2: ['ebo', 'ebis', 'ebit', 'ebimus', 'ebitis', 'ebunt'],
        3: ['am', 'es', 'et', 'emus', 'etis', 'ent'],
        '3io': ['iam', 'ies', 'iet', 'iemus', 'ietis', 'ient'],
        4: ['iam', 'ies', 'iet', 'iemus', 'ietis', 'ient'],
    }],
    ['subj', 'present subjunctive', 'Present subjunctive', 'act', {
        1: ['em', 'es', 'et', 'emus', 'etis', 'ent'],
        2: ['eam', 'eas', 'eat', 'eamus', 'eatis', 'eant'],
        3: ['am', 'as', 'at', 'amus', 'atis', 'ant'],
        '3io': ['iam', 'ias', 'iat', 'iamus', 'iatis', 'iant'],
        4: ['iam', 'ias', 'iat', 'iamus', 'iatis', 'iant'],
    }],
    ['impf-subj', 'imperfect subjunctive', 'Imperfect subjunctive', 'act', themed({1: 'are', 2: 'ere', 3: 'ere', '3io': 'ere', 4: 'ire'}, ACTIVE)],
    ['pres-pass', 'present passive', 'Present indicative passive', 'pass', {
        1: ['or', 'aris|are', 'atur', 'amur', 'amini', 'antur'],
        2: ['eor', 'eris|ere', 'etur', 'emur', 'emini', 'entur'],
        3: ['or', 'eris|ere', 'itur', 'imur', 'imini', 'untur'],
        '3io': ['ior', 'eris|ere', 'itur', 'imur', 'imini', 'iuntur'],
        4: ['ior', 'iris|ire', 'itur', 'imur', 'imini', 'iuntur'],
    }],
    ['impf-pass', 'imperfect passive', 'Imperfect indicative passive', 'pass', themed({1: 'aba', 2: 'eba', 3: 'eba', '3io': 'ieba', 4: 'ieba'}, PASSIVE)],
    ['fut-pass', 'future passive', 'Future indicative passive', 'pass', {
        1: ['abor', 'aberis|abere', 'abitur', 'abimur', 'abimini', 'abuntur'],
        2: ['ebor', 'eberis|ebere', 'ebitur', 'ebimur', 'ebimini', 'ebuntur'],
        3: ['ar', 'eris|ere', 'etur', 'emur', 'emini', 'entur'],
        '3io': ['iar', 'ieris|iere', 'ietur', 'iemur', 'iemini', 'ientur'],
        4: ['iar', 'ieris|iere', 'ietur', 'iemur', 'iemini', 'ientur'],
    }],
    ['subj-pass', 'present subjunctive passive', 'Present subjunctive passive', 'pass', {
        1: ['er', 'eris|ere', 'etur', 'emur', 'emini', 'entur'],
        2: ['ear', 'earis|eare', 'eatur', 'eamur', 'eamini', 'eantur'],
        3: ['ar', 'aris|are', 'atur', 'amur', 'amini', 'antur'],
        '3io': ['iar', 'iaris|iare', 'iatur', 'iamur', 'iamini', 'iantur'],
        4: ['iar', 'iaris|iare', 'iatur', 'iamur', 'iamini', 'iantur'],
    }],
    ['impf-subj-pass', 'imperfect subjunctive passive', 'Imperfect subjunctive passive', 'pass', themed({1: 'are', 2: 'ere', 3: 'ere', '3io': 'ere', 4: 'ire'}, PASSIVE)],
];

function examples(table, index, roots, lemmaOf) {
    return CONJ.map((c) => {
        const cell = Array.isArray(table[c]) ? table[c][index] : table[c];
        return cell === null ? roots[c] + lemmaOf[c] : roots[c] + alts(cell)[0];
    }).join(', ');
}

const DEPONENT_NOTE = 'Deponent verbs have these forms with an active meaning';

for (const [id, name, text, voice, table] of FINITE) {
    PERSONS.forEach((person, i) => {
        let description = `${text}, ${PERSON_TEXT[person]}: ${examples(table, i, ROOT, LEMMA)}.`;
        if (voice === 'pass') { description += ` ${DEPONENT_NOTE} (${examples(table, i, DEP_ROOT, DEPONENT)}).`; }
        const slotId = slot(`${id}-${person}`, `${name}, ${PERSON_NAME[person]}`, description);
        for (const c of CONJ) {
            const cell = table[c][i];
            if (cell === null) { continue; }
            for (const ending of alts(cell)) {
                sfx(slotId, ending, LEMMA[c], [], VB, minFor(c));
                if (voice === 'pass') { sfx(slotId, ending, DEPONENT[c], [], VB, minFor(c)); }
            }
        }
    });
}

// Imperatives, infinitives, gerunds and participles.
const NONFINITE = [
    // id, name, description, table (per conjugation: one cell), voice ('act': active
    // verbs; 'pass': active and deponent; 'both': active and deponent, active in form)
    ['imp-2s', 'imperative, 2nd sg', 'Present imperative, second person singular', {1: 'a', 2: 'e', 3: 'e', '3io': 'e', 4: 'i'}, 'act'],
    ['imp-2p', 'imperative, 2nd pl', 'Present imperative, second person plural', {1: 'ate', 2: 'ete', 3: 'ite', '3io': 'ite', 4: 'ite'}, 'act'],
    ['imp-fut-2s', 'future imperative, 2nd/3rd sg', 'Future imperative, second and third person singular', {1: 'ato', 2: 'eto', 3: 'ito', '3io': 'ito', 4: 'ito'}, 'act'],
    ['imp-fut-2p', 'future imperative, 2nd pl', 'Future imperative, second person plural', {1: 'atote', 2: 'etote', 3: 'itote', '3io': 'itote', 4: 'itote'}, 'act'],
    ['imp-fut-3p', 'future imperative, 3rd pl', 'Future imperative, third person plural', {1: 'anto', 2: 'ento', 3: 'unto', '3io': 'iunto', 4: 'iunto'}, 'act'],
    ['imp-pass-2s', 'imperative passive, 2nd sg', 'Present imperative passive, second person singular', {1: 'are', 2: 'ere', 3: 'ere', '3io': 'ere', 4: 'ire'}, 'pass'],
    ['imp-pass-2p', 'imperative passive, 2nd pl', 'Present imperative passive, second person plural', {1: 'amini', 2: 'emini', 3: 'imini', '3io': 'imini', 4: 'imini'}, 'pass'],
    ['imp-fut-pass-2s', 'future imperative passive, 2nd/3rd sg', 'Future imperative passive, second and third person singular', {1: 'ator', 2: 'etor', 3: 'itor', '3io': 'itor', 4: 'itor'}, 'pass'],
    ['imp-fut-pass-3p', 'future imperative passive, 3rd pl', 'Future imperative passive, third person plural', {1: 'antor', 2: 'entor', 3: 'untor', '3io': 'iuntor', 4: 'iuntor'}, 'pass'],
    ['inf', 'infinitive', 'Present active infinitive', {1: 'are', 2: 'ere', 3: 'ere', '3io': 'ere', 4: 'ire'}, 'act'],
    ['inf-pass', 'passive infinitive', 'Present passive infinitive (also the old forms in -ier)', {1: 'ari|arier', 2: 'eri|erier', 3: 'i', '3io': 'i', 4: 'iri|irier'}, 'pass'],
    ['gerund-gen', 'gerund, genitive', 'Gerund, genitive', {1: 'andi', 2: 'endi', 3: 'endi', '3io': 'iendi|iundi', 4: 'iendi|iundi'}, 'both'],
    ['gerund-dat', 'gerund, dative/ablative', 'Gerund, dative and ablative', {1: 'ando', 2: 'endo', 3: 'endo', '3io': 'iendo|iundo', 4: 'iendo|iundo'}, 'both'],
    ['gerund-acc', 'gerund, accusative', 'Gerund, accusative (after ad and in)', {1: 'andum', 2: 'endum', 3: 'endum', '3io': 'iendum|iundum', 4: 'iendum|iundum'}, 'both'],
];

for (const [id, name, text, table, voice] of NONFINITE) {
    let description = `${text}: ${examples(table, 0, ROOT, LEMMA)}.`;
    if (voice !== 'act') { description += ` Deponent verbs: ${examples(table, 0, DEP_ROOT, DEPONENT)}.`; }
    const slotId = slot(id, name, description);
    for (const c of CONJ) {
        for (const ending of alts(table[c])) {
            // The passive infinitive of the third conjugation is the root and -ī
            // (regī, sequī); a root ending in a, e, i or o is not a third
            // conjugation root (meī is not meō, deī is not deō).
            const extra = minFor(c);
            sfx(slotId, ending, LEMMA[c], [], VB, extra);
            if (voice !== 'act') { sfx(slotId, ending, DEPONENT[c], [], VB, extra); }
        }
    }
}

// Participles and the gerundive are adjectives with entries of their own
// (amāns, amandus, amātus); these rules take such a word, as written or as an
// adjective rule made it from a declined form (amantium → amāns), to its verb.
const PARTICIPLE_IN = ['ptc', 'aux', 'ptcx'];
slot('ptc-pres', 'present participle', 'Present active participle (declined as a third-declension adjective): amāns, monēns, regēns, capiēns, audiēns; of deponent verbs hortāns, verēns, sequēns, patiēns, largiēns.');
slot('gerundive', 'gerundive', 'Gerundive (future passive participle): amandus, monendus, regendus, capiendus (capiundus), audiendus; of deponent verbs hortandus, verendus, sequendus.');
for (const c of CONJ) {
    for (const [slotId, cell, conditionsIn] of [['ptc-pres', {1: 'ans', 2: 'ens', 3: 'ens', '3io': 'iens', 4: 'iens'}[c], ['ptc']],
                                                ['gerundive', {1: 'andus', 2: 'endus', 3: 'endus', '3io': 'iendus|iundus', 4: 'iendus|iundus'}[c], PARTICIPLE_IN]]) {
        for (const ending of alts(cell)) {
            sfx(slotId, ending, LEMMA[c], conditionsIn, VB, MIN);
            sfx(slotId, ending, DEPONENT[c], conditionsIn, VB, MIN);
        }
    }
}

// --- Verbs: the perfect system ------------------------------------------------------
// A perfect form is read in two steps: its ending is replaced by -ī, the first
// person singular perfect (rēxerat → rēxī), and that form by the verb, through
// a regular stem (amāvī → amō, monuī → moneō, audīvī → audiō, audiī → audiō)
// or through the stem table below (rēxī → regō). A first person singular the
// table lacks still reaches its verb through a dictionary's form-of row for
// it, which vpf matches (see the conditions above).
const VPF = ['vpf', 'v'];
const VPF_IN = ['vpf'];
const PERFECT = [
    ['perf', 'perfect', 'Perfect indicative active', [null, 'isti', 'it', 'imus', 'istis', 'erunt|ere']],
    ['plupf', 'pluperfect', 'Pluperfect indicative active', ['eram', 'eras', 'erat', 'eramus', 'eratis', 'erant']],
    ['futpf', 'future perfect', 'Future perfect active', ['ero', 'eris', 'erit', 'erimus', 'eritis', 'erint']],
    ['perf-subj', 'perfect subjunctive', 'Perfect subjunctive active', ['erim', 'eris', 'erit', 'erimus', 'eritis', 'erint']],
    ['plupf-subj', 'pluperfect subjunctive', 'Pluperfect subjunctive active', ['issem', 'isses', 'isset', 'issemus', 'issetis', 'issent']],
];
for (const [id, name, text, endings] of PERFECT) {
    PERSONS.forEach((person, i) => {
        const ending = endings[i];
        if (ending === null) { return; }
        const slotId = slot(`${id}-${person}`, `${name}, ${PERSON_NAME[person]}`,
                            `${text}, ${PERSON_TEXT[person]}: amāv${alts(ending)[0]}, rēx${alts(ending)[0]}, audīv${alts(ending)[0]}.`);
        for (const e of alts(ending)) { sfx(slotId, e, 'i', [], VPF, MIN); }
    });
}
slot('inf-perf', 'perfect infinitive', 'Perfect active infinitive: amāvisse, rēxisse, audīvisse.');
sfx('inf-perf', 'isse', 'i', [], VPF, MIN);

// Perfects of the -āvī, -īvī, -ēvī and -ōvī stems that drop v (and the vowel
// after it): amāstī, amārunt, amāsse, audīstī, audīsse, cognōstī, cognōrunt,
// complēsse. They become the full first person singular (amāvī).
const CONTRACTED = [
    // [slot, contracted ending, full first person singular, constraints]
    ...[['perf-2s', 'asti'], ['perf-2p', 'astis'], ['perf-3p', 'arunt'], ['plupf-1s', 'aram'], ['plupf-2s', 'aras'], ['plupf-3s', 'arat'],
        ['plupf-1p', 'aramus'], ['plupf-2p', 'aratis'], ['plupf-3p', 'arant'], ['perf-subj-1s', 'arim'], ['perf-subj-3s', 'arit'],
        ['futpf-3s', 'arit'], ['perf-subj-1p', 'arimus'], ['futpf-1p', 'arimus'], ['perf-subj-2p', 'aritis'], ['futpf-2p', 'aritis'], ['perf-subj-3p', 'arint'],
        ['futpf-3p', 'arint'],
        ['plupf-subj-1s', 'assem'], ['plupf-subj-2s', 'asses'], ['plupf-subj-3s', 'asset'], ['plupf-subj-1p', 'assemus'],
        ['plupf-subj-2p', 'assetis'], ['plupf-subj-3p', 'assent'], ['inf-perf', 'asse']].map(([s, e]) => [s, e, 'avi', MIN]),
    ...[['perf-3p', 'irunt'], ['perf-2s', 'isti'], ['perf-2p', 'istis'], ['inf-perf', 'isse'], ['plupf-subj-1s', 'issem'], ['plupf-subj-2s', 'isses'],
        ['plupf-subj-3s', 'isset'], ['plupf-subj-1p', 'issemus'], ['plupf-subj-2p', 'issetis'], ['plupf-subj-3p', 'issent']].map(([s, e]) => [s, e, 'ivi', MIN]),
    // -ōvī only in the compounds of nōscō (cognōstī, agnōrunt, ignōsse), whose
    // root ends in n; nōscō itself is written out below.
    ...[['perf-2s', 'osti'], ['perf-2p', 'ostis'], ['perf-3p', 'orunt'], ['plupf-1s', 'oram'], ['plupf-2s', 'oras'], ['plupf-3s', 'orat'],
        ['plupf-1p', 'oramus'], ['plupf-2p', 'oratis'], ['plupf-3p', 'orant'], ['plupf-subj-1s', 'ossem'], ['plupf-subj-2s', 'osses'],
        ['plupf-subj-3s', 'osset'], ['plupf-subj-1p', 'ossemus'], ['plupf-subj-2p', 'ossetis'], ['plupf-subj-3p', 'ossent'],
        ['inf-perf', 'osse']].map(([s, e]) => [s, e, 'ovi', {...MIN, stemEndsWith: '[n]'}]),
    // -ēvī only after l (dēlēstī, complēsse, implēssent), so that adesse and
    // abesse stay forms of adsum and absum.
    ...[['perf-2s', 'esti'], ['perf-2p', 'estis'], ['inf-perf', 'esse'], ['plupf-subj-1s', 'essem'], ['plupf-subj-2s', 'esses'],
        ['plupf-subj-3s', 'esset'], ['plupf-subj-1p', 'essemus'], ['plupf-subj-2p', 'essetis'], ['plupf-subj-3p', 'essent']]
        .map(([s, e]) => [s, e, 'evi', {...MIN, stemEndsWith: '[l]'}]),
];
for (const [slotId, ending, full, extra] of CONTRACTED) { sfx(slotId, ending, full, [], VPF, extra); }
for (const form of ['nosti', 'nostis', 'norunt', 'noram', 'noras', 'norat', 'noramus', 'noratis', 'norant', 'norim', 'noris', 'norit',
                    'nossem', 'nosses', 'nosset', 'nossemus', 'nossetis', 'nossent', 'nosse']) {
    const slotId = {nosti: 'perf-2s', nostis: 'perf-2p', norunt: 'perf-3p', noram: 'plupf-1s', noras: 'plupf-2s', norat: 'plupf-3s',
                    noramus: 'plupf-1p', noratis: 'plupf-2p', norant: 'plupf-3p', norim: 'perf-subj-1s', noris: 'perf-subj-2s',
                    norit: 'perf-subj-3s', nossem: 'plupf-subj-1s', nosses: 'plupf-subj-2s', nosset: 'plupf-subj-3s',
                    nossemus: 'plupf-subj-1p', nossetis: 'plupf-subj-2p', nossent: 'plupf-subj-3p', nosse: 'inf-perf'}[form];
    whole(slotId, form, 'novi', [], VPF);
}

// The first person singular perfect read as its verb: regular stems.
slot('perf-stem', 'perfect stem', 'The first person singular perfect (-ī) read as its verb: amāvī → amō, monuī → moneō, dēlēvī → dēleō, audīvī and audiī → audiō, coluī → colō, rapuī → rapiō, statuī → statuō, convaluī → convalēscō, and perfects with the root of the present (dēfendī → dēfendō, vertī → vertō, solvī → solvō); the stems that are not regular come from a table (rēxī → regō, fēcī → faciō, vīdī → videō, fūgī → fugiō, tulī → ferō).');
// Perfects with the root of the present are read by the cluster that ends
// the root (dēfendī, vertī, solvī, statuī, verrī, vellī, bibī); a rule for any
// -ī would read fūgī, sēdī and dedī as fugō, sēdō and dēdō, which are other
// verbs (fugiō, sedeō and dō are in the table). potuī is possum's, not pōtō's.
// -uī → -uō comes before -iō and -ō (ties go by discovery): annuī, statuī
// and expuī are annuō, statuō and expuō. -uī → -ō only after l, m, p, r or x
// (coluī, gemuī, strepuī, seruī, texuī; potuī is possum's). The -iō verbs
// with -uī (rapiō, sapiō, aperiō, saliō) are in the table.
for (const [ending, lemma, extra] of [['avi', 'o', MIN], ['ivi', 'io', MIN], ['ii', 'io', MIN], ['evi', 'eo', MIN], ['ui', 'eo', MIN],
                                      ['ui', 'uo', {stemMinLength: 1}], ['ui', 'o', {...MIN, stemEndsWith: '[lmprx]'}],
                                      ['ndi', 'ndo', {stemMinLength: 1}], ['rti', 'rto', {stemMinLength: 1}], ['lvi', 'lvo', {stemMinLength: 1}],
                                      ['rri', 'rro', {stemMinLength: 1}], ['lli', 'llo', {stemMinLength: 1}], ['bibi', 'bibo', {}],
                                      ['di', 'do', {stemMinLength: 2, stemNotEndsWith: '[ei]'}], ['ssivi', 'sso', {stemMinLength: 1}],
                                      ['ui', 'esco', MIN], ['ui', 'isco', MIN], ['avi', 'asco', MIN], ['evi', 'esco', MIN], ['ivi', 'isco', MIN]]) {
    sfx('perf-stem', ending, lemma, VPF_IN, VB, extra);
}

// Perfect passive participle, future active participle and supine.
slot('ptc-perf', 'perfect participle', 'Perfect passive participle (of deponent verbs, active in meaning): amātus, monitus, audītus, rēctus; hortātus, veritus, secūtus.');
slot('ptc-fut', 'future participle', 'Future active participle: amātūrus, monitūrus, audītūrus, rēctūrus; hortātūrus, secūtūrus.');
slot('supine', 'supine', 'Supine in -um (purpose after verbs of motion): amātum, monitum, audītum, rēctum.');
slot('supine-abl', 'supine in -ū', 'Supine in -ū (after adjectives): amātū, dictū, factū, vīsū.');

function participles(stem, lemma, extra, {perfect = true, future = true, all = true, conditionsIn = PARTICIPLE_IN, except} = {}) {
    if (perfect) {
        if (except === undefined) {
            sfx('ptc-perf', `${stem}us`, lemma, conditionsIn, VB, extra);
        } else {
            sfx('ptc-perf', `${stem}us`, lemma, conditionsIn, VB, {...extra, stemNotStartsWithText: except});
            sfx('ptc-perf', `${stem}us`, lemma, conditionsIn, VB,
                {...extra, stemStartsWithText: except, stemMinLength: Math.max(extra.stemMinLength ?? 0, [...except].length + 1)});
        }
        if (all) {
            sfx('supine', `${stem}um`, lemma, [], VB, extra);
            sfx('supine-abl', `${stem}u`, lemma, [], VB, extra);
        }
    }
    if (future && all) { sfx('ptc-fut', `${stem}urus`, lemma, PARTICIPLE_IN, VB, extra); }
}
// The future participle and the supine of the verbs in the stem table below
// are read through the perfect participle's form (ductūrus → ductus → dūcō,
// dictū → dictus → dīcō); the supine in -um is the participle's neuter.
slot('ptc-fut-stem', 'future participle', 'Future active participle, read through the perfect participle it is made from: ductūrus → ductus, factūrus → factus.');
sfx('ptc-fut-stem', 'urus', 'us', PARTICIPLE_IN, ['ptc'], {stemMinLength: 3});
sfx('supine-abl', 'u', 'us', [], ['ptc'], {stemMinLength: 3});
// Regular: -ātus (1st), -ītus (4th), -itus and -ētus (2nd), -ūtus (statuō,
// and solvō, volvō after l). The order decides ties: furātus is furor's
// before furō's, audītus audiō's before audeō's.
// The perfect participle of three of them leaves out the stem of a frequent
// adjective or noun that is not that participle: advocātus (a lawyer, not
// advocō's in advocātus esse optat), perītus (skilled, not pereō's) and
// invītus (unwilling, not inviō's), in the active and the deponent rule.
for (const [stem, lemma, extra, not] of [['at', 'or', MIN, 'advoc'], ['at', 'o', MIN, 'advoc'], ['it', 'io', MIN, 'inv'], ['it', 'ior', MIN, 'inv'],
                                         ['it', 'eo', MIN, 'per'], ['it', 'eor', MIN, 'per'], ['et', 'eo', MIN], ['ut', 'uo', MIN],
                                         ['ut', 'vo', {...MIN, stemEndsWith: '[l]'}]]) {
    participles(stem, lemma, extra, {except: not});
}

// The stems that are not regular: dictionary form, perfect (first person
// singular), perfect participle, with alternatives separated by |, - for none,
// and fap: for a future participle that does not come from the perfect one.
// A line that starts with + gives the form of the compounds, whose stems
// differ from the simple verb's: +ficiō fēcī fectus makes conficiō, cōnfēcī,
// cōnfectus. Rules are suffix rules, so a compound that keeps the simple verb's
// stem (addūcō, addūxī, adductus) needs no line; those of a + line need a
// prefix. Perfect forms of three letters (ēgī, ēmī) are whole words.
const PRINCIPAL_PARTS = `
do dedi datus fap:daturus
+do didi ditus min:1
sto steti - fap:staturus
+sto stiti -
iuvo iuvi iutus fap:iuvaturus
lavo lavi lautus|lotus
seco secui sectus fap:secaturus
veto vetui vetitus
domo domui domitus
sono sonui sonitus fap:sonaturus
tono tonui tonitus
crepo crepui crepitus
cubo cubui cubitus
mico micui -
frico fricui frictus
plico plicui plicitus
poto potavi potus
video vidi visus
sedeo sedi sessus
+sideo sedi sessus
moveo movi motus
voveo vovi votus
foveo fovi fotus
caveo cavi cautus
faveo favi fautus
maneo mansi mansus
rideo risi risus
suadeo suasi suasus
ardeo arsi - fap:arsurus
haereo haesi haesus
iubeo iussi iussus
augeo auxi auctus
luceo luxi -
lugeo luxi luctus
fulgeo fulsi -
indulgeo indulsi indultus
mulceo mulsi mulsus
torqueo torsi tortus
urgeo ursi -
tergeo tersi tersus
spondeo spopondi sponsus
+spondeo spondi sponsus
mordeo momordi morsus
pendeo pependi -
+pendeo pendi -
tondeo totondi tonsus
prandeo prandi pransus
cieo civi citus
doceo - doctus
teneo - tentus
+tineo - tentus
misceo - mixtus|mistus
censeo - census
torreo - tostus
audeo - ausus
gaudeo - gavisus
soleo - solitus
ago egi actus
+igo egi actus
+ago egi actus
cogo coegi coactus
alo - altus noesse
cado cecidi - fap:casurus
+cido cidi casus
caedo cecidi caesus
+cido cidi cisus
cano cecini cantus
+cino cinui -
capio cepi captus
+cipio cepi ceptus
cedo cessi cessus
cerno crevi cretus
cingo cinxi cinctus
claudo clausi clausus
+cludo clusi clusus
colo - cultus
consulo - consultus
coquo coxi coctus
cresco crevi cretus
cupio - cupitus
curro cucurri cursus
+curro curri|cucurri cursus
dico dixi dictus
disco didici -
divido divisi divisus
duco duxi ductus
edo edi esus noesse
+edo edi esus|estus noesse
+mordeo mordi morsus
emo emi emptus
+imo emi emptus
como compsi comptus
demo dempsi demptus
promo prompsi promptus
sumo sumpsi sumptus
fallo fefelli falsus noesse
fingo finxi fictus
figo fixi fixus
findo fidi fissus
flecto flexi flexus
fluo fluxi fluxus
frango fregi fractus
+fringo fregi fractus
fundo fudi fusus
gero gessi gestus
gigno genui genitus
iacio ieci iactus
+icio ieci iectus min:1
+iicio ieci iectus min:1
+ligo legi lectus min:1
+ligo lexi lectus min:1
lego legi lectus
+lego lexi lectus
linquo liqui -
+linquo liqui lictus
ludo lusi lusus
laedo laesi laesus
+lido lisi lisus min:1
mergo mersi mersus
mitto misi missus
nosco novi notus
+gnosco gnovi gnitus min:1
occulo - occultus
pando pandi passus|pansus
pango pepigi pactus
+pingo pegi pactus
parco peperci - fap:parsurus
pario peperi partus fap:pariturus
pasco pavi pastus
pello pepuli pulsus
+pello puli pulsus
repello reppuli|repuli repulsus
pendo pependi pensus
+pendo pendi pensus
peto petivi|petii petitus
pingo pinxi pictus
pono posui|posivi positus
posco poposci -
+posco poposci -
premo pressi pressus
+primo pressi pressus
quaero quaesivi|quaesii quaesitus
+quiro quisivi|quisii quisitus
quiesco quievi quietus
rapio rapui raptus
sapio sapui -
+ripio ripui reptus min:1
rego rexi rectus noesse
+rigo rexi rectus min:1
surgo surrexi surrectus
+surgo surrexi surrectus
pergo perrexi perrectus
rumpo rupi ruptus
scindo scidi|scicidi scissus
carpo carpsi carptus
+cerpo cerpsi cerptus
stinguo stinxi stinctus
scribo scripsi scriptus
sero sevi satus
+sero sevi situs
+sero serui sertus
sino sivi situs noesse
desino desii|desivi desitus
sisto stiti|steti status
+sisto stiti -
solvo - solutus
spargo sparsi sparsus
+spergo spersi spersus
sperno sprevi spretus
sterno stravi stratus
stringo strinxi strictus
struo struxi structus
suesco suevi suetus
tango tetigi tactus
+tingo tigi tactus
tego texi tectus
tendo tetendi tentus|tensus
+tendo tendi tentus|tensus
tero trivi tritus
texo - textus
tollo sustuli sublatus
traho traxi tractus
veho vexi vectus
vello velli|vulsi vulsus
verto verti versus
vinco vici victus
vivo vixi - fap:victurus
fugio fugi - fap:fugiturus
fodio fodi fossus noesse
facio feci factus
+ficio feci fectus
quatio - quassus
+cutio cussi cussus
+spicio spexi spectus min:1
+licio lexi lectus
elicio elicui elicitus
uro ussi ustus not:abcdefghijklmnopqrstuvwxyz perf:whole
+uro ussi ustus not:abcfghijklmopqrstuvwyz
comburo combussi combustus
contemno contempsi contemptus
ico ici ictus
lino levi|livi litus noesse
meto messui messus
mingo minxi mictus
nubo nupsi nuptus
necto nexui|nexi nexus
pecto pexi pexus
plango planxi planctus
plaudo plausi plausus
+plodo plosi plosus
prehendo prehendi prehensus|prensus
prendo prendi prensus
rado rasi rasus
rodo rosi rosus noesse
sugo suxi suctus
tingo tinxi tinctus
trudo trusi trusus
tundo tutudi tunsus|tusus
+tundo tudi tusus
ungo unxi unctus
unguo unxi unctus
+vado vasi vasus min:1
viso visi visus
verro verri versus
percello perculi perculsus
accendo accendi accensus
incendo incendi incensus
scando scandi scansus
+scendo scendi scensus min:1
mando mandi mansus
defendo defendi defensus
offendo offendi offensus
fido - fisus
+fido - fisus
ruo rui rutus fap:ruiturus
metuo metui -
venio veni ventus
aperio aperui apertus
operio operui opertus
reperio repperi repertus
comperio comperi compertus
sentio sensi sensus
haurio hausi haustus
sancio sanxi sanctus
vincio vinxi vinctus
fulcio fulsi fultus
farcio farsi fartus
sarcio sarsi sartus
saepio saepsi saeptus
salio salui saltus
+silio silui sultus
sepelio sepelivi sepultus
+fercio fersi fertus
+cumbo cubui cubitus
+sido sedi|sidi sessus
+scisco scivi scitus min:1
reor - ratus
for - fatus
amicio amicui amictus
sequor - secutus|sequutus
loquor - locutus|loquutus
queror - questus
fruor - fructus|fruitus fap:fruiturus noesse
fungor - functus
labor - lapsus
nitor - nisus|nixus noesse
utor - usus not:acdefghijklmnopqrstuvwxyz
patior - passus
+petior - pessus
morior - mortuus fap:moriturus
gradior - gressus
+gredior - gressus min:1
nascor - natus fap:nasciturus
proficiscor - profectus
obliviscor - oblitus
paciscor - pactus
nanciscor - nactus|nanctus
adipiscor - adeptus
ulciscor - ultus
irascor - iratus
comminiscor - commentus
expergiscor - experrectus
ordior - orsus
orior - ortus fap:oriturus not:hmpst
metior - mensus noesse
experior - expertus
opperior - oppertus
+plector - plexus
tueor - tuitus|tutus
fateor - fassus
+fiteor - fessus
misereor - misertus
assentior - assensus
odi - - fap:osurus
coepi - coeptus
`;

for (const line of PRINCIPAL_PARTS.trim().split('\n')) {
    const compound = line.startsWith('+');
    const [lemma, perfects, supines, ...rest] = (compound ? line.slice(1) : line).trim().split(/\s+/);
    // The parts of a + line need a prefix before them (cōnfēcī, not fēcī), of
    // two letters (regī is not rigō, as exēgī is exigō) unless the line says
    // min:1, for the compounds with ē- (ēligō, ēiciō, ērigō, ēripiō).
    const extra = compound ? {stemMinLength: rest.includes('min:1') ? 1 : 2} : {};
    // not:<letters>: the participle's rules take no stem ending in them
    // (hortus is not h + ortus, custōs and iūstus not c and i + ūstus).
    const not = rest.find((r) => r.startsWith('not:'))?.slice(4);
    const participleExtra = not === undefined ? extra : {...extra, stemNotEndsWith: `[${not}]`};
    // noesse: the participle is mostly a noun or an adjective (altus, mēnsa,
    // falsum, rosa), so it is not read as this verb before a form of esse.
    const participleIn = rest.includes('noesse') ? ['ptc'] : PARTICIPLE_IN;
    // perf:whole: the perfect is a whole word (ussī is ūrō's, but iussī is
    // iubeō's).
    for (const perfect of perfects === '-' ? [] : alts(perfects)) {
        if (!compound && (perfect.length <= 3 || rest.includes('perf:whole'))) {
            whole('perf-stem', perfect, lemma, VPF_IN, VB);
        } else {
            sfx('perf-stem', perfect, lemma, VPF_IN, VB, extra);
        }
    }
    const future = rest.find((r) => r.startsWith('fap:'))?.slice(4);
    for (const supine of supines === '-' ? [] : alts(supines)) {
        if (!supine.endsWith('us')) { throw new Error(`${line}: a perfect participle ends in -us`); }
        participles(supine.slice(0, -2), lemma, participleExtra, {all: false, conditionsIn: participleIn});
    }
    if (future !== undefined) { sfx('ptc-fut', future, lemma, PARTICIPLE_IN, VB, extra); }
}

// ferō's compounds take their prefix in another form before tulī and lātus
// (attulī, allātus → afferō); sustulī and sublātus are tollō's.
for (const [lemma, perfects, supines] of [
    ['fero', 'tuli', 'latus'], ['affero', 'attuli', 'allatus'], ['adfero', 'attuli|adtuli', 'adlatus'], ['aufero', 'abstuli', 'ablatus'],
    ['confero', 'contuli', 'collatus|conlatus'], ['differo', 'distuli', 'dilatus'], ['effero', 'extuli', 'elatus'],
    ['infero', 'intuli', 'illatus|inlatus'], ['offero', 'obtuli', 'oblatus'], ['refero', 'rettuli|retuli', 'relatus'],
    ['transfero', 'transtuli', 'translatus|tralatus'], ['suffero', 'sustuli', 'sublatus'],
]) {
    for (const perfect of alts(perfects)) { sfx('perf-stem', perfect, lemma, VPF_IN, VB); }
    for (const supine of alts(supines)) { participles(supine.slice(0, -2), lemma, {}, {all: false}); }
}
// The imperatives dīc, dūc, fac (and their compounds ēdūc, indīc).
for (const [form, lemma, kind] of [['dic', 'dico', 'suffix'], ['duc', 'duco', 'suffix'], ['fac', 'facio', 'whole']]) {
    if (kind === 'suffix') { sfx('imp-2s', form, lemma, [], VB); } else { whole('imp-2s', form, lemma, [], VB); }
}
// sum, possum and the compounds of sum: fuī → sum (adfuī → adsum).
for (const [perfect, lemma] of [['fui', 'sum'], ['afui', 'absum'], ['abfui', 'absum'], ['affui', 'adsum'], ['offui', 'obsum'], ['potui', 'possum']]) {
    sfx('perf-stem', perfect, lemma, VPF_IN, VB);
}
for (const [future, lemma] of [['futurus', 'sum'], ['afuturus', 'absum'], ['abfuturus', 'absum'], ['affuturus', 'adsum'], ['offuturus', 'obsum']]) {
    sfx('ptc-fut', future, lemma, PARTICIPLE_IN, VB);
}

// --- Verbs: irregular -------------------------------------------------------------------
// Each form of these verbs is written out, as a whole word, with the slot of
// the regular paradigm it fills.
function paradigm(lemma, table, conditionsOut = VB) {
    for (const [slotPrefix, cells] of Object.entries(table)) {
        if (typeof cells === 'string') {
            for (const form of alts(cells)) { whole(slotPrefix, form, lemma, [], conditionsOut); }
            continue;
        }
        cells.forEach((cell, i) => {
            if (cell === null) { return; }
            const imperative = Object.hasOwn(IMPERATIVE_PERSONS, slotPrefix);
            const slotId = imperative ? IMPERATIVE_PERSONS[slotPrefix][i] : `${slotPrefix}-${PERSONS[i]}`;
            for (const form of alts(cell)) { whole(slotId, form, lemma, [], conditionsOut); }
        });
    }
}
const IMPERATIVE_PERSONS = {
    imp: ['imp-2s', 'imp-2p'],
    'imp-fut': ['imp-fut-2s', 'imp-fut-2p', 'imp-fut-3p'],
};
slot('inf-fut', 'future infinitive', 'Future infinitive of sum: fore (= futūrus esse).');

// sum and its compounds. Each prefix has its forms before e (ab-es, prōd-es),
// before s (ab-sum) and before f (ā-fore, af-fuī).
const SUM = {
    pres: ['sum', 'es', 'est', 'sumus', 'estis', 'sunt'],
    impf: ['eram', 'eras', 'erat', 'eramus', 'eratis', 'erant'],
    fut: ['ero', 'eris', 'erit', 'erimus', 'eritis', 'erunt'],
    subj: ['sim|siem', 'sis|sies', 'sit|siet', 'simus', 'sitis', 'sint|sient'],
    'impf-subj': ['essem|forem', 'esses|fores', 'esset|foret', 'essemus|foremus', 'essetis|foretis', 'essent|forent'],
    imp: ['es', 'este'],
    'imp-fut': ['esto', 'estote', 'sunto'],
    inf: 'esse',
    'inf-fut': 'fore',
};
function prefixed(table, prefix) {
    const pick = (form) => {
        const p = form.startsWith('e') ? prefix.e : form.startsWith('f') ? prefix.f : prefix.s;
        return alts(p).map((x) => x + form).join('|');
    };
    const out = {};
    for (const [key, cells] of Object.entries(table)) {
        out[key] = typeof cells === 'string' ? alts(cells).map(pick).join('|') : cells.map((c) => (c === null ? null : alts(c).map(pick).join('|')));
    }
    return out;
}
for (const [lemma, prefix] of [['sum', {e: '', s: '', f: ''}],
    ['absum', {e: 'ab', s: 'ab', f: 'a|ab'}], ['adsum', {e: 'ad', s: 'ad|as', f: 'ad|af'}], ['assum', {e: 'ad', s: 'as', f: 'af'}],
    ['desum', {e: 'de', s: 'de', f: 'de'}], ['insum', {e: 'in', s: 'in', f: 'in'}], ['intersum', {e: 'inter', s: 'inter', f: 'inter'}],
    ['obsum', {e: 'ob', s: 'ob', f: 'ob|of'}], ['praesum', {e: 'prae', s: 'prae', f: 'prae'}], ['prosum', {e: 'prod', s: 'pro', f: 'pro'}],
    ['subsum', {e: 'sub', s: 'sub', f: 'sub'}], ['supersum', {e: 'super', s: 'super', f: 'super'}],
]) {
    const lemmaPrefix = lemma.slice(0, -3);
    for (const [key, cells] of Object.entries(SUM)) {
        const forms = typeof cells === 'string' ? [[key, cells]] : cells.map((c, i) => [IMPERATIVE_PERSONS[key]?.[i] ?? `${key}-${PERSONS[i]}`, c]);
        for (const [slotId, cell] of forms) {
            if (cell === null) { continue; }
            for (const form of alts(cell)) {
                const letter = form.startsWith('e') ? 'e' : form.startsWith('f') ? 'f' : 's';
                for (const p of alts(prefix[letter])) {
                    if (p + form !== lemma) { familyForm(slotId, p, lemmaPrefix, form, 'sum', [], VB); }
                }
            }
        }
    }
}
flushFamilies();
// possum: pot- before e, pos- before s; possem and posse are its own.
paradigm('possum', {
    pres: ['possum', 'potes', 'potest', 'possumus', 'potestis', 'possunt'],
    impf: ['poteram', 'poteras', 'poterat', 'poteramus', 'poteratis', 'poterant'],
    fut: ['potero', 'poteris', 'poterit', 'poterimus', 'poteritis', 'poterunt'],
    subj: ['possim', 'possis', 'possit', 'possimus', 'possitis', 'possint'],
    'impf-subj': ['possem', 'posses', 'posset', 'possemus', 'possetis', 'possent'],
    inf: 'posse',
});

// eō and its compounds (abeō, redeō, praetereō, ...); queō and nequeō go the
// same way, without the forms that would be the pronouns quis and quī.
const EO = {
    pres: [null, 'is', 'it', 'imus', 'itis', 'eunt'],
    impf: ['ibam', 'ibas', 'ibat', 'ibamus', 'ibatis', 'ibant'],
    fut: ['ibo', 'ibis', 'ibit', 'ibimus', 'ibitis', 'ibunt'],
    subj: ['eam', 'eas', 'eat', 'eamus', 'eatis', 'eant'],
    'impf-subj': ['irem', 'ires', 'iret', 'iremus', 'iretis', 'irent'],
    imp: ['i', 'ite'],
    'imp-fut': ['ito', 'itote', 'eunto'],
    inf: 'ire',
    'inf-pass': 'iri',
    'pres-pass': [null, null, 'itur', null, null, 'euntur'],
    'impf-pass': [null, null, 'ibatur', null, null, 'ibantur'],
    'fut-pass': [null, null, 'ibitur', null, null, 'ibuntur'],
    'subj-pass': [null, null, 'eatur', null, null, 'eantur'],
    'impf-subj-pass': [null, null, 'iretur', null, null, 'irentur'],
    'gerund-gen': 'eundi',
    'gerund-dat': 'eundo',
    'gerund-acc': 'eundum',
};
// The perfect: iī and īvī, and the contracted forms of iī (īstī, īsse).
const EO_PERFECT_CONTRACTED = {
    'perf-2s': 'isti', 'perf-2p': 'istis', 'inf-perf': 'isse', 'plupf-subj-1s': 'issem', 'plupf-subj-2s': 'isses', 'plupf-subj-3s': 'isset',
    'plupf-subj-1p': 'issemus', 'plupf-subj-2p': 'issetis', 'plupf-subj-3p': 'issent',
};
for (const prefix of ['', 'ab', 'ad', 'ante', 'circum', 'co', 'deper', 'ex', 'in', 'inter', 'intro', 'ob', 'per', 'post', 'prae', 'praeter', 'prod', 'red',
                      'sub', 'subter', 'trans', 'qu', 'nequ']) {
    const lemma = `${prefix}eo`;
    const table = {};
    for (const [key, cells] of Object.entries(EO)) {
        table[key] = typeof cells === 'string' ? alts(cells).map((f) => prefix + f).join('|') : cells.map((c) => (c === null ? null : prefix + c));
    }
    if (prefix === 'qu') {
        // quis, quī (pronouns), and no imperative or participle in use.
        table.pres = [null, null, 'quit', 'quimus', 'quitis', 'queunt'];
        for (const key of ['imp', 'imp-fut', 'ptc-pres', 'gerund-gen', 'gerund-dat', 'gerund-acc', 'pres-pass', 'impf-pass', 'fut-pass', 'subj-pass', 'impf-subj-pass', 'inf-pass']) { delete table[key]; }
    } else if (prefix === 'nequ') {
        for (const key of ['imp', 'imp-fut', 'ptc-pres', 'gerund-gen', 'gerund-dat', 'gerund-acc', 'pres-pass', 'impf-pass', 'fut-pass', 'subj-pass', 'impf-subj-pass', 'inf-pass']) { delete table[key]; }
    } else if (prefix === '') {
        // Simple eō: is and it are also the pronoun is and id's neighbour;
        // ī, ītur are kept (the dictionary has them as forms of eō too).
    }
    for (const [key, cells] of Object.entries(table)) {
        const forms = typeof cells === 'string' ? [[key, cells]] : cells.map((c, i) => [IMPERATIVE_PERSONS[key]?.[i] ?? `${key}-${PERSONS[i]}`, c]);
        for (const [slotId, cell] of forms) {
            if (cell === null) { continue; }
            for (const form of alts(cell)) { familyForm(slotId, prefix, prefix, form.slice(prefix.length), 'eo', [], VB); }
        }
    }
    for (const perfect of ['ii', 'ivi']) { familyForm('perf-stem', prefix, prefix, perfect, 'eo', VPF_IN, VB); }
    if (prefix !== '') {
        for (const [slotId, ending] of Object.entries(EO_PERFECT_CONTRACTED)) { familyForm(slotId, prefix, prefix, ending, 'ii', [], VPF); }
    }
}
flushFamilies();
// The perfect of eō itself (iērunt, iit, iisse): its stem i- is shorter than
// the endings above take.
for (const [id, , , endings] of PERFECT) {
    PERSONS.forEach((person, i) => {
        if (endings[i] !== null) { for (const e of alts(endings[i])) { whole(`${id}-${person}`, `i${e}`, 'ii', [], VPF); } }
    });
}
whole('inf-perf', 'iisse', 'ii', [], VPF);
// eō's supine and participles (itum, itūrus), whose root is shorter than
// the regular rules take; dō's gerundive (dandus).
for (const [slotId, form] of [['supine', 'itum'], ['supine-abl', 'itu'], ['ptc-perf', 'itus'], ['ptc-fut', 'iturus']]) {
    whole(slotId, form, 'eo', slotId.startsWith('ptc') ? PARTICIPLE_IN : PARTICIPLE_IN, VB);
}
whole('gerundive', 'dandus', 'do', PARTICIPLE_IN, VB);
// The gerundive of eō's compounds (adeundus, praetereundus).
sfx('gerundive', 'eundus', 'eo', PARTICIPLE_IN, VB);

// ferō: the forms without a thematic vowel (fers, fert, ferre, fer); the
// others are regular third conjugation forms (ferimus, ferunt, ferēbat).
// Suffix rules, so that its compounds have them too (affert → afferō).
const FERO = {
    'pres-2s': 'fers', 'pres-3s': 'fert', 'pres-2p': 'fertis', 'inf': 'ferre',
    'impf-subj-1s': 'ferrem', 'impf-subj-2s': 'ferres', 'impf-subj-3s': 'ferret', 'impf-subj-1p': 'ferremus', 'impf-subj-2p': 'ferretis',
    'impf-subj-3p': 'ferrent', 'imp-2s': 'fer', 'imp-2p': 'ferte', 'imp-fut-2s': 'ferto', 'imp-fut-2p': 'fertote',
    'pres-pass-2s': 'ferris|ferre', 'pres-pass-3s': 'fertur', 'inf-pass': 'ferri',
    'impf-subj-pass-1s': 'ferrer', 'impf-subj-pass-2s': 'ferreris|ferrere', 'impf-subj-pass-3s': 'ferretur',
    'impf-subj-pass-1p': 'ferremur', 'impf-subj-pass-2p': 'ferremini', 'impf-subj-pass-3p': 'ferrentur',
    'imp-pass-2s': 'ferre', 'imp-fut-pass-2s': 'fertor',
};
for (const [slotId, forms] of Object.entries(FERO)) {
    for (const form of alts(forms)) { sfx(slotId, form, 'fero', [], VB); }
}

// volō, nōlō, mālō: the forms that are not regular third conjugation forms.
paradigm('volo', {
    pres: [null, 'vis', 'vult|volt', 'volumus', 'vultis|voltis', null],
    subj: ['velim', 'velis', 'velit', 'velimus', 'velitis', 'velint'],
    'impf-subj': ['vellem', 'velles', 'vellet', 'vellemus', 'velletis', 'vellent'],
    inf: 'velle',
});
paradigm('nolo', {
    pres: [null, null, null, 'nolumus', null, null],
    subj: ['nolim', 'nolis', 'nolit', 'nolimus', 'nolitis', 'nolint'],
    'impf-subj': ['nollem', 'nolles', 'nollet', 'nollemus', 'nolletis', 'nollent'],
    imp: ['noli', 'nolite'],
    'imp-fut': ['nolito', 'nolitote', 'nolunto'],
    inf: 'nolle',
});
paradigm('malo', {
    pres: [null, 'mavis', 'mavult|mavolt', 'malumus', 'mavultis', null],
    subj: ['malim', 'malis', 'malit', 'malimus', 'malitis', 'malint'],
    'impf-subj': ['mallem', 'malles', 'mallet', 'mallemus', 'malletis', 'mallent'],
    inf: 'malle',
});
// fīō (also the passive of faciō).
paradigm('fio', {
    pres: [null, 'fis', 'fit', 'fimus', 'fitis', 'fiunt'],
    impf: ['fiebam', 'fiebas', 'fiebat', 'fiebamus', 'fiebatis', 'fiebant'],
    fut: ['fiam', 'fies', 'fiet', 'fiemus', 'fietis', 'fient'],
    subj: ['fiam', 'fias', 'fiat', 'fiamus', 'fiatis', 'fiant'],
    'impf-subj': ['fierem', 'fieres', 'fieret', 'fieremus', 'fieretis', 'fierent'],
    imp: ['fi', 'fite'],
    inf: 'fieri',
});
// dō: a first conjugation verb with the root d- (the endings above need two
// letters) and a short a (damus, dare). circumdō goes the same way.
for (const root of ['d', 'circumd']) {
    const add1 = (slotId, ending) => familyForm(slotId, root, root, ending, 'o', [], VB);
    for (const [id, , , voice, cells] of FINITE) {
        cells[1].forEach((c, i) => {
            if (c === null && !(voice === 'pass' && i === 0)) { return; }
            for (const e of alts(c ?? cells[1][0])) { add1(`${id}-${PERSONS[i]}`, e); }
        });
    }
    for (const [id, , , cells] of NONFINITE) {
        for (const ending of alts(cells[1])) { add1(id, ending); }
    }
    for (const ending of ['ans', 'antis', 'anti', 'antem', 'ante', 'antes', 'antium', 'antibus', 'antia']) { add1('ptc-pres', ending); }
}
flushFamilies();
// inquam, aiō, the imperative of meminī, and the impersonal verbs, whose
// dictionary form is the third person singular (licet, oportet).
paradigm('inquam', {
    pres: [null, 'inquis', 'inquit', 'inquimus', 'inquitis', 'inquiunt'],
    impf: [null, null, 'inquiebat', null, null, 'inquiebant'],
    fut: [null, 'inquies', 'inquiet', null, null, null],
    subj: [null, null, 'inquiat', null, null, null],
    imp: ['inque', null],
    'imp-fut': ['inquito', null, null],
});
whole('perf-3s', 'inquit', 'inquam', [], VB);
paradigm('aio', {
    pres: [null, 'ais', 'ait', null, null, 'aiunt'],
    impf: ['aiebam', 'aiebas', 'aiebat', 'aiebamus', 'aiebatis', 'aiebant'],
    subj: [null, 'aias', 'aiat', null, null, 'aiant'],
});
paradigm('memini', {'imp-fut': ['memento', 'mementote', null]});
// for (fārī), a first conjugation deponent with the root f-.
paradigm('for', {
    'pres-pass': [null, 'faris|fare', 'fatur', 'famur', 'famini', 'fantur'],
    'fut-pass': ['fabor', 'faberis', 'fabitur', 'fabimur', 'fabimini', 'fabuntur'],
    'impf-subj-pass': ['farer', 'fareris', 'faretur', 'faremur', 'faremini', 'farentur'],
    'inf-pass': 'fari',
    'ptc-pres': 'fans|fantis|fanti|fantem|fante|fantes|fantium|fantibus',
    'gerund-gen': 'fandi',
    'gerund-dat': 'fando',
    'gerund-acc': 'fandum',
});
// reor: a second conjugation deponent whose root r- is shorter than the
// endings above take.
paradigm('reor', {
    'pres-pass': [null, 'reris|rere', 'retur', 'remur', 'remini', 'rentur'],
    'impf-pass': ['rebar', 'rebaris|rebare', 'rebatur', 'rebamur', 'rebamini', 'rebantur'],
    'fut-pass': ['rebor', 'reberis', 'rebitur', 'rebimur', 'rebimini', 'rebuntur'],
    'subj-pass': ['rear', 'rearis', 'reatur', 'reamur', 'reamini', 'reantur'],
    'impf-subj-pass': ['rerer', 'rereris', 'reretur', 'reremur', 'reremini', 'rerentur'],
    'inf-pass': 'reri',
});
for (const lemma of ['licet', 'oportet', 'decet', 'dedecet', 'libet', 'lubet', 'piget', 'pudet', 'taedet', 'paenitet', 'poenitet', 'miseret']) {
    const root = lemma.slice(0, -2);
    for (const [slotId, ending] of [['impf-3s', 'ebat'], ['fut-3s', 'ebit'], ['subj-3s', 'eat'], ['impf-subj-3s', 'eret'], ['inf', 'ere'],
                                    ['perf-3s', 'uit'], ['plupf-3s', 'uerat'], ['futpf-3s', 'uerit'], ['plupf-subj-3s', 'uisset'], ['inf-perf', 'uisse']]) {
        familyForm(slotId, root, root, ending, 'et', [], VB);
    }
}
flushFamilies();

// --- Nouns ----------------------------------------------------------------------------
const N1 = ['n1s'];
const N2 = ['n2s'];
const N3 = ['n3s'];
const N4 = ['n4s'];
const N5 = ['n5s'];
const N = ['n'];
const CASE_SLOTS = [
    ['gen-sg', 'genitive singular'], ['dat-sg', 'dative singular'], ['acc-sg', 'accusative singular'], ['abl-sg', 'ablative singular'],
    ['voc-sg', 'vocative singular'], ['nom-pl', 'nominative plural'], ['gen-pl', 'genitive plural'], ['dat-pl', 'dative/ablative plural'],
    ['acc-pl', 'accusative plural'], ['loc', 'locative'],
];
for (const [id, name] of CASE_SLOTS) {
    slot(`n-${id}`, name, `Noun, ${name}.`);
}
// [nominative ending, stem ending before the case ending, {case: endings}, constraints]
function declension(slotPrefix, nominative, stem, cases, conditionsOut, extra) {
    for (const [caseId, endings] of Object.entries(cases)) {
        for (const ending of alts(endings)) { sfx(`${slotPrefix}-${caseId}`, stem + ending, nominative, [], conditionsOut, extra); }
    }
}
const NOUN_MIN = {stemMinLength: 2};
// First declension: rosa, rosae.
declension('n', 'a', '', {'gen-sg': 'ae', 'dat-sg': 'ae', 'acc-sg': 'am', 'nom-pl': 'ae', 'gen-pl': 'arum', 'dat-pl': 'is|abus', 'acc-pl': 'as'}, N1, NOUN_MIN);
// Second declension: dominus, -ī; bellum, -ī; filius, gen. and voc. filī; puer, puerī; ager, agrī; vir, virī.
declension('n', 'us', '', {'gen-sg': 'i', 'dat-sg': 'o', 'acc-sg': 'um', 'abl-sg': 'o', 'voc-sg': 'e', 'nom-pl': 'i', 'gen-pl': 'orum|um', 'dat-pl': 'is', 'acc-pl': 'os'}, N2, NOUN_MIN);
declension('n', 'ius', '', {'gen-sg': 'i', 'voc-sg': 'i'}, N2, NOUN_MIN);
declension('n', 'um', '', {'gen-sg': 'i', 'dat-sg': 'o', 'abl-sg': 'o', 'nom-pl': 'a', 'gen-pl': 'orum', 'dat-pl': 'is', 'acc-pl': 'a'}, N2, NOUN_MIN);
declension('n', 'ium', '', {'gen-sg': 'i'}, N2, NOUN_MIN);
declension('n', 'er', 'r', {'gen-sg': 'i', 'dat-sg': 'o', 'acc-sg': 'um', 'abl-sg': 'o', 'nom-pl': 'i', 'gen-pl': 'orum', 'dat-pl': 'is', 'acc-pl': 'os'}, N2, {stemMinLength: 1});
// Stems that are the nominative: second declension puer, gener, vir (after
// -er and -ir only, so that labōrō is not a form of labor), and third
// declension cōnsul, sōl, labor, carcer, animal, exemplar (after l or r).
for (const [final, min] of [['er', 2], ['ir', 1]]) {
    declension('n', final, final, {'gen-sg': 'i', 'dat-sg': 'o', 'acc-sg': 'um', 'abl-sg': 'o', 'nom-pl': 'i', 'gen-pl': 'orum', 'dat-pl': 'is', 'acc-pl': 'os'}, N2, {stemMinLength: min});
}
const LR = {stemMinLength: 2, stemEndsWith: '[lr]'};
declension('n', '', '', {'gen-sg': 'is', 'dat-sg': 'i', 'acc-sg': 'em', 'abl-sg': 'e|i', 'nom-pl': 'es|ia', 'gen-pl': 'um|ium', 'dat-pl': 'ibus', 'acc-pl': 'es'}, N3, LR);
// Third-declension stems in -en that are the nominative (splēn, rēn, liēn).
declension('n', '', '', {'gen-sg': 'is', 'dat-sg': 'i', 'acc-sg': 'em', 'abl-sg': 'e', 'nom-pl': 'es', 'gen-pl': 'um|ium', 'dat-pl': 'ibus'}, N3, {stemMinLength: 3, stemEndsWith: '[n]'});
// Third declension: the nominative from the stem (cīvitās, cīvitātis; legiō,
// legiōnis; homō, hominis; pater, patris; rēx, rēgis; nox, noctis; pēs, pedis;
// mīles, mīlitis; mōns, montis; urbs, urbis; prīnceps, prīncipis ...).
const THIRD = {'gen-sg': 'is', 'dat-sg': 'i', 'acc-sg': 'em', 'abl-sg': 'e', 'nom-pl': 'es', 'gen-pl': 'um|ium', 'dat-pl': 'ibus', 'acc-pl': 'es'};
// A stem of two letters before the stem ending (rē-gis, pe-dis, no-ctis), so
// that pōne is not po with -ōne; ars and ops are written out.
const THIRD_MIN = {stemMinLength: 2};
// Nouns in -ō, -inis have d, g, m, b or l before it (ōrdō, virgō, homō,
// turbō, Apollō); dominī and vīcīnī are not domō and vīcō.
for (const ending of Object.values(THIRD).flatMap(alts)) {
    sfx(`n-${Object.entries(THIRD).find(([, e]) => alts(e).includes(ending))[0]}`, `in${ending}`, 'o', [], N3,
        {stemMinLength: 1, stemEndsWith: '[bdglm]', stemNotStartsWithText: 'dom'});
}
for (const [nominative, stem] of [['as', 'at'], ['us', 'ut'], ['o', 'on'], ['on', 'on'], ['on', 'ont'], ['as', 'ant'], ['us', 'od'], ['en', 'in'], ['os', 'or'], ['er', 'r'], ['x', 'c'], ['ex', 'ic'],
                                  ['x', 'g'], ['x', 'ct'], ['s', 'd'], ['es', 'id'], ['es', 'it'], ['es', 'et'], ['os', 'ot'], ['ns', 'nt'], ['rs', 'rt'],
                                  ['eps', 'ip'], ['ps', 'p'], ['bs', 'b'], ['l', 'll'], ['guis', 'guin']]) {
    declension('n', nominative, stem, THIRD, N3, THIRD_MIN);
}
// Neuters: corpus, corporis; genus, generis; nōmen, nōminis; rōbur, rōboris;
// poēma, poēmatis; mare, maris (i-stem).
const THIRD_NEUTER = {'gen-sg': 'is', 'dat-sg': 'i', 'abl-sg': 'e', 'nom-pl': 'a', 'gen-pl': 'um', 'dat-pl': 'ibus', 'acc-pl': 'a'};
for (const [nominative, stem] of [['us', 'or'], ['us', 'er'], ['en', 'in'], ['ur', 'or'], ['ma', 'mat']]) {
    // cētera (the rest) is not a form of cētus (whale)
    declension('n', nominative, stem, THIRD_NEUTER, N3, stem === 'er' ? {...NOUN_MIN, stemNotStartsWithText: 'cet'} : NOUN_MIN);
}
declension('n', 'e', '', {'gen-sg': 'is', 'dat-sg': 'i', 'abl-sg': 'i', 'nom-pl': 'ia', 'gen-pl': 'ium', 'dat-pl': 'ibus', 'acc-pl': 'ia'}, N3, NOUN_MIN);
// i-stems whose nominative is -is or -ēs: cīvis, cīvem, turrim; nūbēs, nūbis.
declension('n', 'is', '', {'acc-sg': 'em|im', 'dat-sg': 'i', 'abl-sg': 'e|i', 'nom-pl': 'es', 'gen-pl': 'ium|um', 'dat-pl': 'ibus', 'acc-pl': 'es'}, N3, NOUN_MIN);
declension('n', 'es', '', {'gen-sg': 'is', 'dat-sg': 'i', 'acc-sg': 'em', 'abl-sg': 'e', 'gen-pl': 'ium|um', 'dat-pl': 'ibus', 'acc-pl': 'is'}, N3, NOUN_MIN);
// Fourth declension: manus, manuī, manum, manū, manuum, manibus; cornū, cornua.
declension('n', 'us', '', {'dat-sg': 'ui', 'abl-sg': 'u', 'gen-pl': 'uum', 'dat-pl': 'ibus|ubus'}, N4, {stemMinLength: 3});
declension('n', 'u', '', {'gen-sg': 'us', 'nom-pl': 'ua', 'gen-pl': 'uum', 'dat-pl': 'ibus', 'acc-pl': 'ua'}, N4, NOUN_MIN);
// Fifth declension: rēs, reī, rem, rē, rērum, rēbus; diēs.
declension('n', 'es', '', {'gen-sg': 'ei', 'dat-sg': 'ei', 'acc-sg': 'em', 'abl-sg': 'e', 'gen-pl': 'erum', 'dat-pl': 'ebus'}, N5, {stemMinLength: 1});
// Greek nouns: second declension in -os and -on (cynoglossos, maldacon),
// first declension in -ē (hecatombē, hecatombēn).
declension('n', 'os', '', {'gen-sg': 'i', 'dat-sg': 'o', 'acc-sg': 'on|um', 'abl-sg': 'o', 'nom-pl': 'i', 'gen-pl': 'orum', 'dat-pl': 'is', 'acc-pl': 'os'}, N2, {stemMinLength: 3});
declension('n', 'on', '', {'gen-sg': 'i', 'dat-sg': 'o', 'abl-sg': 'o', 'nom-pl': 'a', 'gen-pl': 'orum'}, N2, {stemMinLength: 3});
declension('n', 'e', '', {'gen-sg': 'es', 'acc-sg': 'en'}, N1, {stemMinLength: 3});
// Greek third declension in -is, genitive -eōs (genesis, geneseōs; basis).
declension('n', 'is', '', {'gen-sg': 'eos', 'acc-sg': 'in'}, N3, {stemMinLength: 3});
// Plural-only nouns, whose dictionary form is the nominative plural: īnsidiae,
// līberī, castra, moenia, maiōrēs.
declension('n', 'ae', '', {'gen-pl': 'arum', 'dat-pl': 'is', 'acc-pl': 'as'}, ['n1p'], NOUN_MIN);
declension('n', 'i', '', {'gen-pl': 'orum', 'dat-pl': 'is', 'acc-pl': 'os'}, ['n2p'], NOUN_MIN);
declension('n', 'a', '', {'gen-pl': 'orum', 'dat-pl': 'is'}, ['n2p'], NOUN_MIN);
declension('n', 'ia', '', {'gen-pl': 'ium', 'dat-pl': 'ibus'}, ['n3p'], NOUN_MIN);
declension('n', 'es', '', {'gen-pl': 'um|ium', 'dat-pl': 'ibus'}, ['n3p'], NOUN_MIN);
// Irregular nouns.
for (const [lemma, table] of [
    ['vis', {'acc-sg': 'vim', 'abl-sg': 'vi', 'nom-pl': 'vires', 'gen-pl': 'virium', 'dat-pl': 'viribus', 'acc-pl': 'vires|viris'}],
    ['bos', {'gen-sg': 'bovis', 'dat-sg': 'bovi', 'acc-sg': 'bovem', 'abl-sg': 'bove', 'nom-pl': 'boves', 'gen-pl': 'boum|bovum', 'dat-pl': 'bubus|bobus', 'acc-pl': 'boves'}],
    ['iter', {'gen-sg': 'itineris', 'dat-sg': 'itineri', 'abl-sg': 'itinere', 'nom-pl': 'itinera', 'gen-pl': 'itinerum', 'dat-pl': 'itineribus'}],
    ['senex', {'gen-sg': 'senis', 'dat-sg': 'seni', 'acc-sg': 'senem', 'abl-sg': 'sene', 'nom-pl': 'senes', 'gen-pl': 'senum', 'dat-pl': 'senibus'}],
    ['caro', {'gen-sg': 'carnis', 'dat-sg': 'carni', 'acc-sg': 'carnem', 'abl-sg': 'carne', 'nom-pl': 'carnes', 'gen-pl': 'carnium', 'dat-pl': 'carnibus'}],
    ['nix', {'gen-sg': 'nivis', 'dat-sg': 'nivi', 'acc-sg': 'nivem', 'abl-sg': 'nive', 'nom-pl': 'nives', 'gen-pl': 'nivium', 'dat-pl': 'nivibus'}],
    ['domus', {'gen-sg': 'domus|domi', 'dat-sg': 'domui|domo', 'acc-sg': 'domum', 'abl-sg': 'domo|domu', 'nom-pl': 'domus', 'gen-pl': 'domuum|domorum', 'dat-pl': 'domibus', 'acc-pl': 'domos|domus', loc: 'domi'}],
    ['deus', {'gen-sg': 'dei', 'dat-sg': 'deo', 'acc-sg': 'deum', 'abl-sg': 'deo', 'nom-pl': 'di|dii|dei', 'gen-pl': 'deorum|deum|divum', 'dat-pl': 'dis|diis|deis', 'acc-pl': 'deos'}],
    ['os', {'gen-sg': 'oris|ossis', 'dat-sg': 'ori|ossi', 'abl-sg': 'ore|osse', 'nom-pl': 'ora|ossa', 'gen-pl': 'orum|ossium', 'dat-pl': 'oribus|ossibus'}],
    ['mos', {'gen-sg': 'moris', 'dat-sg': 'mori', 'acc-sg': 'morem', 'abl-sg': 'more', 'nom-pl': 'mores', 'gen-pl': 'morum', 'dat-pl': 'moribus'}],
    ['ars', {'gen-sg': 'artis', 'dat-sg': 'arti', 'acc-sg': 'artem', 'abl-sg': 'arte', 'nom-pl': 'artes', 'gen-pl': 'artium', 'dat-pl': 'artibus'}],
    ['ops', {'gen-sg': 'opis', 'acc-sg': 'opem', 'abl-sg': 'ope', 'nom-pl': 'opes', 'gen-pl': 'opum', 'dat-pl': 'opibus'}],
    ['as', {'gen-sg': 'assis', 'dat-sg': 'assi', 'acc-sg': 'assem', 'abl-sg': 'asse', 'nom-pl': 'asses', 'gen-pl': 'assium', 'dat-pl': 'assibus'}],
    ['vas', {'gen-sg': 'vasis', 'dat-sg': 'vasi', 'abl-sg': 'vase', 'nom-pl': 'vasa', 'gen-pl': 'vasorum', 'dat-pl': 'vasis'}],
    ['caput', {'gen-sg': 'capitis', 'dat-sg': 'capiti', 'abl-sg': 'capite', 'nom-pl': 'capita', 'gen-pl': 'capitum', 'dat-pl': 'capitibus'}],
    ['ius', {'gen-sg': 'iuris', 'dat-sg': 'iuri', 'abl-sg': 'iure', 'nom-pl': 'iura', 'gen-pl': 'iurum|iurium', 'dat-pl': 'iuribus'}],
    ['rus', {'gen-sg': 'ruris', 'dat-sg': 'ruri', 'abl-sg': 'rure', 'nom-pl': 'rura', 'dat-pl': 'ruribus', loc: 'ruri'}],
    ['tellus', {'gen-sg': 'telluris', 'dat-sg': 'telluri', 'acc-sg': 'tellurem', 'abl-sg': 'tellure'}],
    ['crus', {'gen-sg': 'cruris', 'dat-sg': 'cruri', 'abl-sg': 'crure', 'nom-pl': 'crura', 'gen-pl': 'crurum', 'dat-pl': 'cruribus'}],
    ['cinis', {'gen-sg': 'cineris', 'dat-sg': 'cineri', 'acc-sg': 'cinerem', 'abl-sg': 'cinere', 'nom-pl': 'cineres', 'gen-pl': 'cinerum', 'dat-pl': 'cineribus'}],
    ['pulvis', {'gen-sg': 'pulveris', 'dat-sg': 'pulveri', 'acc-sg': 'pulverem', 'abl-sg': 'pulvere', 'nom-pl': 'pulveres', 'dat-pl': 'pulveribus'}],
    ['aes', {'gen-sg': 'aeris', 'dat-sg': 'aeri', 'abl-sg': 'aere', 'nom-pl': 'aera', 'dat-pl': 'aeribus'}],
    ['cor', {'gen-sg': 'cordis', 'dat-sg': 'cordi', 'abl-sg': 'corde', 'nom-pl': 'corda', 'gen-pl': 'cordium', 'dat-pl': 'cordibus'}],
    ['lac', {'gen-sg': 'lactis', 'dat-sg': 'lacti', 'abl-sg': 'lacte'}],
    ['coniunx', {'gen-sg': 'coniugis', 'dat-sg': 'coniugi', 'acc-sg': 'coniugem', 'abl-sg': 'coniuge', 'nom-pl': 'coniuges', 'gen-pl': 'coniugum', 'dat-pl': 'coniugibus'}],
    ['iecur', {'gen-sg': 'iecoris|iocineris', 'dat-sg': 'iecori', 'abl-sg': 'iecore'}],
    ['supellex', {'gen-sg': 'supellectilis', 'dat-sg': 'supellectili', 'acc-sg': 'supellectilem', 'abl-sg': 'supellectile|supellectili'}],
    ['hiems', {'gen-sg': 'hiemis', 'dat-sg': 'hiemi', 'acc-sg': 'hiemem', 'abl-sg': 'hieme', 'nom-pl': 'hiemes', 'gen-pl': 'hiemum', 'dat-pl': 'hiemibus'}],
    ['humus', {loc: 'humi'}],
    ['sus', {'acc-sg': 'suem', 'nom-pl': 'sues', 'dat-pl': 'suibus|subus'}],
]) {
    for (const [caseId, forms] of Object.entries(table)) {
        for (const form of alts(forms)) { whole(`n-${caseId}`, form, lemma, [], N); }
    }
}

// --- Adjectives ------------------------------------------------------------------------
// First and second declension (bonus, -a, -um; līber, -era, -erum; pulcher,
// -chra, -chrum). Participles and gerundives decline the same way, so these
// rules give ptc and v as well as adj12 (amātōrum → amātus → amō).
const ADJ_ENDINGS = [
    ['i', 'genitive singular masculine/neuter, nominative plural masculine'],
    ['o', 'dative/ablative singular masculine/neuter'],
    ['um', 'accusative singular masculine, nominative/accusative singular neuter'],
    ['e', 'vocative singular masculine'],
    ['orum', 'genitive plural masculine/neuter'],
    ['is', 'dative/ablative plural'],
    ['os', 'accusative plural masculine'],
    ['a', 'nominative/ablative singular feminine, nominative/accusative plural neuter'],
    ['ae', 'genitive/dative singular feminine, nominative plural feminine'],
    ['am', 'accusative singular feminine'],
    ['arum', 'genitive plural feminine'],
    ['as', 'accusative plural feminine'],
];
for (const [ending, name] of ADJ_ENDINGS) { slot(`adj-${ending}`, name, `Adjective, participle or gerundive, ${name}.`); }
const ADJ_PTC = ['adj12', 'ptc', 'v'];
const ADJ3_PTC = ['adj3', 'ptc', 'v'];
const ADJ12 = ['adj12'];
const ADJ3 = ['adj3'];
const ADJ = ['adj'];
for (const [ending] of ADJ_ENDINGS) {
    sfx(`adj-${ending}`, ending, 'us', [], ADJ_PTC, {stemMinLength: 2});
    // līber, lībera; miser, misera (the stem is the dictionary form)
    sfx(`adj-${ending}`, ending, '', [], ADJ12, {stemMinLength: 2, stemEndsWith: '[r]'});
    // pulcher, pulchra; sacer, sacra; noster is a determiner (below)
    sfx(`adj-${ending}`, `r${ending}`, 'er', [], ADJ12, {stemMinLength: 2});
}
// Third declension: fortis, forte; ācer, ācris, ācre; celer, celeris;
// fēlīx, fēlīcis; ingēns, ingentis; vetus, veteris; dīves, dīvitis; and the
// comparative (altior, altius, altiōris). Present participles decline so too.
const ADJ3_ENDINGS = [
    ['is', 'genitive singular'], ['e', 'nominative/accusative singular neuter, ablative singular'], ['em', 'accusative singular masculine/feminine'],
    ['i', 'dative/ablative singular'], ['es', 'nominative/accusative plural masculine/feminine'], ['ia', 'nominative/accusative plural neuter'],
    ['a', 'nominative/accusative plural neuter'], ['ium', 'genitive plural'], ['um', 'genitive plural'], ['ibus', 'dative/ablative plural'],
    ['ius', 'nominative/accusative singular neuter'],
];
for (const [ending, name] of ADJ3_ENDINGS) { slot(`adj3-${ending}`, name, `Third-declension adjective or participle, ${name}.`); }
const ADJ3_REGULAR = ['e', 'em', 'i', 'es', 'ia', 'ium', 'ibus'];
const ADJ3_CONSONANT = ['is', 'e', 'em', 'i', 'es', 'ia', 'a', 'ium', 'um', 'ibus'];
for (const ending of ADJ3_REGULAR) { sfx(`adj3-${ending}`, ending, 'is', [], ADJ3, {stemMinLength: 2}); }
for (const ending of ['is', ...ADJ3_REGULAR]) {
    sfx(`adj3-${ending}`, `r${ending}`, 'er', [], ADJ3, {stemMinLength: 2});
    sfx(`adj3-${ending}`, ending, '', [], ADJ3, {stemMinLength: 2, stemEndsWith: '[lr]'});
}
for (const [nominative, stem, conditionsOut] of [['x', 'c', ADJ3], ['ex', 'ic', ADJ3], ['ns', 'nt', ADJ3_PTC], ['rs', 'rt', ADJ3], ['es', 'it', ADJ3],
                                                 ['es', 'et', ADJ3], ['os', 'ot', ADJ3], ['us', 'er', ADJ3], ['eps', 'ipit', ADJ3]]) {
    for (const ending of ADJ3_CONSONANT) { sfx(`adj3-${ending}`, stem + ending, nominative, [], conditionsOut, {stemMinLength: 2}); }
}
// The comparative declines like a consonant stem (altiōrem, altiōra, altius).
const CMP = ['cmp', 'adj3'];
for (const ending of ['is', 'e', 'em', 'i', 'es', 'a', 'um', 'ibus']) { sfx(`adj3-${ending}`, `ior${ending}`, 'ior', [], CMP, {stemMinLength: 1}); }
sfx('adj3-ius', 'ius', 'ior', [], CMP, {stemMinLength: 2});
// The pronominal adjectives ūnus, sōlus, tōtus: genitive -īus.
for (const lemma of ['unus', 'solus', 'totus']) { whole('adj3-is', `${lemma.slice(0, -2)}ius`, lemma, [], ADJ12); }
slot('comparative', 'comparative', 'Comparative degree: altior → altus, fortior → fortis, pulchrior → pulcher, fēlīcior → fēlīx, sapientior → sapiēns; melior → bonus, peior → malus, maior → magnus, minor → parvus, plūs → multus.');
slot('superlative', 'superlative', 'Superlative degree: altissimus → altus, fortissimus → fortis, fēlīcissimus → fēlīx, pulcherrimus → pulcher, facillimus → facilis; optimus → bonus, pessimus → malus, maximus → magnus, minimus → parvus, plūrimus → multus.');
for (const [inflected, deinflected, extra] of [['ior', 'us', {}], ['ior', 'is', {}], ['ior', '', {stemEndsWith: '[r]'}], ['rior', 'er', {}],
                                              ['cior', 'x', {}], ['ntior', 'ns', {}], ['rtior', 'rs', {}],
                                              ['etior', 'es', {}], ['itior', 'es', {}]]) {
    sfx('comparative', inflected, deinflected, ['cmp'], ADJ, {stemMinLength: 2, ...extra});
}
for (const [inflected, deinflected] of [['issimus', 'us'], ['issimus', 'is'], ['cissimus', 'x'], ['ntissimus', 'ns'], ['rtissimus', 'rs'],
                                        ['errimus', 'er'], ['illimus', 'ilis'], ['issumus', 'us'], ['issumus', 'is'], ['errumus', 'er'], ['illumus', 'ilis']]) {
    sfx('superlative', inflected, deinflected, ADJ, ADJ, {stemMinLength: 2});
}
for (const [form, lemma, slotId] of [
    ['melior', 'bonus', 'comparative'], ['peior', 'malus', 'comparative'], ['pejor', 'malus', 'comparative'], ['maior', 'magnus', 'comparative'],
    ['major', 'magnus', 'comparative'], ['minor', 'parvus', 'comparative'], ['senior', 'senex', 'comparative'], ['iunior', 'iuvenis', 'comparative'],
    ['ditior', 'dives', 'comparative'], ['divitior', 'dives', 'comparative'], ['superior', 'superus', 'comparative'], ['inferior', 'inferus', 'comparative'],
    ['posterior', 'posterus', 'comparative'], ['exterior', 'exterus', 'comparative'],
    ['optimus', 'bonus', 'superlative'], ['pessimus', 'malus', 'superlative'], ['maximus', 'magnus', 'superlative'], ['minimus', 'parvus', 'superlative'],
    ['plurimus', 'multus', 'superlative'], ['summus', 'superus', 'superlative'], ['supremus', 'superus', 'superlative'], ['infimus', 'inferus', 'superlative'],
    ['imus', 'inferus', 'superlative'], ['postremus', 'posterus', 'superlative'], ['extremus', 'exterus', 'superlative'], ['veterrimus', 'vetus', 'superlative'],
    ['ditissimus', 'dives', 'superlative'], ['maturrimus', 'maturus', 'superlative'], ['vetustior', 'vetus', 'comparative'],
    ['vetustissimus', 'vetus', 'superlative'], ['optumus', 'bonus', 'superlative'], ['pessumus', 'malus', 'superlative'],
    ['maxumus', 'magnus', 'superlative'], ['minumus', 'parvus', 'superlative'], ['plurumus', 'multus', 'superlative'],
    ['extimus', 'exterus', 'superlative'], ['extremus', 'exter', 'superlative'], ['extimus', 'exter', 'superlative'], ['ditior', 'dis', 'comparative'], ['ditissimus', 'dis', 'superlative'],
]) {
    whole(slotId, form, lemma, slotId === 'comparative' ? ['cmp'] : ADJ, ADJ);
}
// plūs, plūris and plūrēs, plūrium: the comparative of multus.
for (const form of ['plus', 'pluris', 'plures', 'plura', 'plurium', 'pluribus']) { whole('comparative', form, 'multus', [], ADJ); }
// Adverbs made from adjectives.
slot('adverb', 'adverb', 'Adverb made from an adjective: longē → longus, fortiter → fortis, celeriter → celer, ācriter → ācer, fēlīciter → fēlīx, audācter → audāx, sapienter → sapiēns; bene → bonus, male → malus.');
sfx('adverb', 'e', 'us', [], ADJ_PTC, {stemMinLength: 2});
for (const [inflected, deinflected, extra, conditionsOut] of [['iter', 'is', {}, ADJ], ['iter', '', {stemEndsWith: '[r]'}, ADJ], ['riter', 'er', {}, ADJ],
                                                             ['citer', 'x', {}, ADJ], ['cter', 'x', {}, ADJ], ['nter', 'ns', {}, ADJ3_PTC], ['rter', 'rs', {}, ADJ]]) {
    sfx('adverb', inflected, deinflected, [], conditionsOut, {stemMinLength: 2, ...extra});
}
for (const [form, lemma] of [['bene', 'bonus'], ['male', 'malus'], ['melius', 'bonus'], ['optime', 'bonus'], ['peius', 'malus'], ['pessime', 'malus'],
                             ['maxime', 'magnus'], ['minime', 'parvus'], ['minus', 'parvus'], ['plurimum', 'multus']]) {
    whole('adverb', form, lemma, [], ADJ);
}

// The present participle of eō and its compounds declines with eunt-
// (iēns, euntis; rediēns, redeuntis), which these rules bring to -iēns.
for (const ending of ['is', 'i', 'em', 'e', 'es', 'ium', 'ibus', 'ia']) { sfx(`adj3-${ending}`, `eunt${ending}`, 'iens', [], ['adj3', 'ptc', 'v']); }
sfx('ptc-pres', 'iens', 'eo', ['ptc'], VB);

// --- Proper names -----------------------------------------------------------------------
// Names have no part of speech, so these rules have no conditions (section
// 7.2) and apply only to a capitalised word (Rōmam → Rōma). A capital that
// starts a sentence is tried before it is decapitalised, and second-declension
// endings read Vidē as Vidus at 137 places of the test books. So these rules
// keep endings a common word rarely has: -ae, -am, Greek -ān, -ēn and -on,
// the genitive and accusative of l and r stems, and third-declension stems in
// -ōn-, -in-, -er-, -rt-, -ant- and -ad-. Other names come through form-of
// rows (Marcī, Herculis).
const NAME = {stemMinLength: 2, stemStartsWith: '[A-Z]'};
for (const [id, name] of CASE_SLOTS) { slot(`name-${id}`, name, `Proper name, ${name}.`); }
declension('name', 'a', '', {'gen-sg': 'ae', 'dat-sg': 'ae', 'acc-sg': 'am', loc: 'ae'}, [], NAME);
declension('name', 'as', '', {'gen-sg': 'ae', 'dat-sg': 'ae', 'acc-sg': 'am|an'}, [], NAME);
declension('name', 'es', '', {'acc-sg': 'en'}, [], NAME);
// No plural names: Deōrum, Stellārum and Terrārum at the start of a sentence
// were read as names Deus, Stella and Terra (Helvētiōrum and Belgārum come
// from form-of rows).
declension('name', 'os', '', {'acc-sg': 'on'}, [], NAME);
declension('name', '', '', {'gen-sg': 'is', 'acc-sg': 'em'}, [], {...NAME, stemEndsWith: '[lr]'});
// No name rule makes an ending another name rule removes: their outputs have
// no conditions, so every rule applies to them again (with Greek names in -ē,
// Rōmae → Rōme → Rōmēs → ... gave 218 deinflections for Rōmae; a rule that
// makes -is from -e did not stop at all).
const NAME_THIRD = {'gen-sg': 'is', 'dat-sg': 'i', 'acc-sg': 'em', 'abl-sg': 'e'};
// Not the stems in -er- (Venus, Veneris; Cerēs): with them, the infinitives
// Vidēre and Crēdere and the ablative Opere at the start of a sentence were
// read as names Vidus, Crēs and Opus. Those names come from form-of rows.
for (const [nominative, stem] of [['o', 'on'], ['o', 'in'], ['rs', 'rt'], ['as', 'ant'], ['as', 'ad']]) {
    declension('name', nominative, stem, NAME_THIRD, [], {stemMinLength: 1, stemStartsWith: '[A-Z]'});
}
for (const [lemma, forms] of [['Iuppiter', 'Iovis|Iovi|Iovem|Iove|Iupiter'], ['Iesus', 'Iesu|Iesum'], ['Iuno', 'Iunonis|Iunoni|Iunonem|Iunone']]) {
    for (const form of alts(forms)) { whole('name-gen-sg', form, lemma, [], []); }
}

// --- Pronouns, determiners and numerals -------------------------------------------------
// Written out, with their case, number and gender. Each cell is
// masculine/feminine/neuter, or one form for all three; | separates
// alternatives.
const PRONOUN_CASES = [['nom', 'nominative'], ['gen', 'genitive'], ['dat', 'dative'], ['acc', 'accusative'], ['abl', 'ablative']];
const GENDERS = [['m', 'masculine'], ['f', 'feminine'], ['n', 'neuter']];
for (const number of ['sg', 'pl']) {
    for (const [c, caseName] of PRONOUN_CASES) {
        for (const [g, genderName] of [...GENDERS, ['', '']]) {
            const id = `pron-${c}-${number}${g ? `-${g}` : ''}`;
            const name = `${caseName} ${number === 'sg' ? 'singular' : 'plural'}${g ? ` ${genderName}` : ''}`;
            slot(id, name, `Pronoun, determiner or numeral, ${name}.`);
        }
    }
}
function pronoun(lemma, cells, conditionsOut = []) {
    // cells: {nom: 'is/ea/id', gen: 'eius', ..., Nom: 'ei|ii/eae/ea', ...}; a capital key is plural.
    for (const [key, value] of Object.entries(cells)) {
        const number = key[0] === key[0].toUpperCase() ? 'pl' : 'sg';
        const c = key.toLowerCase();
        const parts = value.split('/');
        parts.forEach((part, i) => {
            const g = parts.length === 3 ? GENDERS[i][0] : '';
            for (const form of alts(part)) { whole(`pron-${c}-${number}${g ? `-${g}` : ''}`, form, lemma, [], conditionsOut); }
        });
    }
}
pronoun('ego', {gen: 'mei', dat: 'mihi|mi', acc: 'me', abl: 'me'});
pronoun('nos', {Gen: 'nostri|nostrum', Dat: 'nobis', Abl: 'nobis'});
pronoun('tu', {gen: 'tui', dat: 'tibi', acc: 'te|tete', abl: 'te'});
pronoun('vos', {Gen: 'vestri|vestrum|vostrum', Dat: 'vobis', Abl: 'vobis'});
pronoun('sui', {dat: 'sibi', acc: 'se|sese', abl: 'se|sese'});
const IS = {nom: 'is/ea/id', gen: 'eius|eiius', dat: 'ei', acc: 'eum/eam/id', abl: 'eo/ea/eo',
            Nom: 'ei|ii|i/eae/ea', Gen: 'eorum/earum/eorum', Dat: 'eis|iis|is', Acc: 'eos/eas/ea', Abl: 'eis|iis|is'};
pronoun('is', IS);
// Dictionaries also have ea and id as headwords of their own (eius names is,
// ea and id); their forms are the feminine and neuter ones.
for (const [lemma, gender] of [['ea', 1], ['id', 2]]) {
    const cells = {};
    for (const [key, value] of Object.entries(IS)) {
        const parts = value.split('/');
        cells[key] = parts.length === 3 ? parts[gender] : value;
    }
    pronoun(lemma, cells);
}
pronoun('hic', {nom: 'hic/haec/hoc', gen: 'huius|huiusce', dat: 'huic', acc: 'hunc/hanc/hoc', abl: 'hoc/hac/hoc',
                Nom: 'hi/hae/haec', Gen: 'horum/harum/horum', Dat: 'his', Acc: 'hos|hosce/has|hasce/haec', Abl: 'his'});
for (const stem of ['ill', 'ist']) {
    pronoun(`${stem}e`, {nom: `${stem}e/${stem}a/${stem}ud`, gen: `${stem}ius`, dat: `${stem}i`, acc: `${stem}um/${stem}am/${stem}ud`,
                         abl: `${stem}o/${stem}a/${stem}o`, Nom: `${stem}i/${stem}ae/${stem}a`, Gen: `${stem}orum/${stem}arum/${stem}orum`,
                         Dat: `${stem}is`, Acc: `${stem}os/${stem}as/${stem}a`, Abl: `${stem}is`});
}
pronoun('ipse', {nom: 'ipse/ipsa/ipsum', gen: 'ipsius', dat: 'ipsi', acc: 'ipsum/ipsam/ipsum', abl: 'ipso/ipsa/ipso',
                 Nom: 'ipsi/ipsae/ipsa', Gen: 'ipsorum/ipsarum/ipsorum', Dat: 'ipsis', Acc: 'ipsos/ipsas/ipsa', Abl: 'ipsis'});
pronoun('idem', {nom: 'idem/eadem/idem', gen: 'eiusdem', dat: 'eidem', acc: 'eundem/eandem/idem', abl: 'eodem/eadem/eodem',
                 Nom: 'eidem|iidem|idem/eaedem/eadem', Gen: 'eorundem/earundem/eorundem', Dat: 'eisdem|iisdem|isdem', Acc: 'eosdem/easdem/eadem',
                 Abl: 'eisdem|iisdem|isdem'});
const QUI = {nom: 'qui/quae/quod', gen: 'cuius|quoius', dat: 'cui|quoi', acc: 'quem/quam/quod', abl: 'quo/qua/quo',
             Nom: 'qui/quae/quae', Gen: 'quorum/quarum/quorum', Dat: 'quibus|quis', Acc: 'quos/quas/quae', Abl: 'quibus|quis'};
pronoun('qui', QUI);
pronoun('quis', {...QUI, nom: 'quis/quae/quid', acc: 'quem/quam/quid'});
// Pronouns made of quī or quis and a fixed part: quīdam, quisque, quīvīs ...
function compoundPronoun(lemma, base, suffix, overrides = {}) {
    const cells = {};
    for (const [key, value] of Object.entries({...base, ...overrides})) {
        cells[key] = value.split('/').map((part) => alts(part).map((f) => f + suffix).join('|')).join('/');
    }
    pronoun(lemma, cells);
}
compoundPronoun('quidam', QUI, 'dam', {nom: 'qui/quae/quod|quid', acc: 'quen/quan/quod|quid', Gen: 'quorun/quarun/quorun'});
compoundPronoun('quisque', QUI, 'que', {nom: 'quis/quae/quod|quid|quic', acc: 'quem/quam/quod|quid|quic'});
compoundPronoun('quisquam', {nom: 'quis/quae/quid|quic', gen: 'cuius', dat: 'cui', acc: 'quem/quam/quid|quic', abl: 'quo/qua/quo'}, 'quam');
compoundPronoun('quivis', QUI, 'vis', {nom: 'qui/quae/quod|quid', acc: 'quem/quam/quod|quid'});
compoundPronoun('quilibet', QUI, 'libet', {nom: 'qui/quae/quod|quid', acc: 'quem/quam/quod|quid'});
compoundPronoun('quicumque', QUI, 'cumque');
compoundPronoun('quispiam', QUI, 'piam', {nom: 'quis/quae/quod|quid', acc: 'quem/quam/quod|quid'});
pronoun('unusquisque', {nom: 'unusquisque/unaquaeque/unumquodque|unumquidque', gen: 'uniuscuiusque', dat: 'unicuique',
                        acc: 'unumquemque/unamquamque/unumquodque|unumquidque', abl: 'unoquoque/unaquaque/unoquoque'});
compoundPronoun('quicunque', QUI, 'cunque');
// aliquis: the prefix ali- before every form (alicuius, aliquem)
for (const [key, value] of Object.entries({nom: 'aliquis/aliqua|aliquae/aliquid|aliquod', gen: 'alicuius', dat: 'alicui', acc: 'aliquem/aliquam/aliquid|aliquod',
                                           abl: 'aliquo/aliqua/aliquo', Nom: 'aliqui/aliquae/aliqua', Gen: 'aliquorum/aliquarum/aliquorum',
                                           Dat: 'aliquibus', Acc: 'aliquos/aliquas/aliqua', Abl: 'aliquibus'})) {
    pronoun('aliquis', {[key]: value});
}
pronoun('quisquis', {nom: 'quisquis/quisquis/quidquid|quicquid', abl: 'quoquo'});
pronoun('uter', {nom: 'uter/utra/utrum', gen: 'utrius', dat: 'utri', acc: 'utrum/utram/utrum', abl: 'utro/utra/utro',
                 Nom: 'utri/utrae/utra', Gen: 'utrorum/utrarum/utrorum', Dat: 'utris', Acc: 'utros/utras/utra', Abl: 'utris'});
pronoun('uterque', {nom: 'uterque/utraque/utrumque', gen: 'utriusque', dat: 'utrique', acc: 'utrumque/utramque/utrumque',
                    abl: 'utroque/utraque/utroque', Nom: 'utrique/utraeque/utraque', Gen: 'utrorumque/utrarumque/utrorumque',
                    Dat: 'utrisque', Acc: 'utrosque/utrasque/utraque', Abl: 'utrisque'});
// Determiners and pronominal adjectives without a part of speech in the dictionaries.
function firstSecond(lemma, stem, {gen = `${stem}ius`, dat = `${stem}i`, neuter = `${stem}um`, feminine = `${stem}a`} = {}) {
    pronoun(lemma, {nom: `${lemma}/${feminine}/${neuter}`, gen: `${gen}/${gen}/${gen}`, dat: `${dat}/${dat}/${dat}`,
                    acc: `${stem}um/${stem}am/${neuter}`, abl: `${stem}o/${stem}a/${stem}o`, Nom: `${stem}i/${stem}ae/${stem}a`,
                    Gen: `${stem}orum/${stem}arum/${stem}orum`, Dat: `${stem}is`, Acc: `${stem}os/${stem}as/${stem}a`, Abl: `${stem}is`});
}
firstSecond('nullus', 'null');
firstSecond('ullus', 'ull');
firstSecond('alius', 'ali', {gen: 'alterius|alius', dat: 'alii', neuter: 'aliud'});
firstSecond('alter', 'alter', {feminine: 'altera', neuter: 'alterum'});
firstSecond('neuter', 'neutr', {feminine: 'neutra', neuter: 'neutrum'});
for (const [lemma, stem] of [['meus', 'me'], ['tuus', 'tu'], ['suus', 'su'], ['noster', 'nostr'], ['vester', 'vestr'], ['voster', 'vostr']]) {
    firstSecond(lemma, stem, {gen: `${stem}i`, dat: `${stem}o`, feminine: `${stem}a`, neuter: `${stem}um`});
}
pronoun('meus', {nom: 'mi'});
pronoun('nemo', {gen: 'neminis|nullius', dat: 'nemini', acc: 'neminem', abl: 'nemine|nullo'});
pronoun('nihil', {gen: 'nihili', abl: 'nihilo', nom: 'nil'});
pronoun('duo', {Nom: 'duo/duae/duo', Gen: 'duorum|duum/duarum/duorum', Dat: 'duobus/duabus/duobus', Acc: 'duos|duo/duas/duo', Abl: 'duobus/duabus/duobus'});
pronoun('ambo', {Nom: 'ambo/ambae/ambo', Gen: 'amborum/ambarum/amborum', Dat: 'ambobus/ambabus/ambobus', Acc: 'ambos|ambo/ambas/ambo', Abl: 'ambobus/ambabus/ambobus'});
pronoun('tres', {Nom: 'tres/tres/tria', Gen: 'trium', Dat: 'tribus', Acc: 'tres|tris/tres|tris/tria', Abl: 'tribus'});
pronoun('mille', {Nom: 'milia|millia', Gen: 'milium|millium', Dat: 'milibus|millibus', Acc: 'milia|millia', Abl: 'milibus|millibus'});

// --- Enclitics -----------------------------------------------------------------------------
slot('cum', '-cum', 'cum written after a personal or relative pronoun: mēcum, tēcum, nōbīscum, quōcum.');
slot('met', '-met', 'The emphatic -met: egomet, mihimet, sēmet.');
slot('nam', '-nam', 'The emphatic -nam of questions: quisnam, quidnam, ubinam.');
// -que, -ne and -ve are removed by the pack's enclitic processor
// (language.json), not by rules: a word without its enclitic is then a text
// as written, whose own form-of row confirms its lemma (section 9.6), so
// pedibusque reads as pēs, not as the plural pedēs, as pedibus does.
for (const [form, base] of [['mecum', 'me'], ['tecum', 'te'], ['secum', 'se'], ['nobiscum', 'nobis'], ['vobiscum', 'vobis'], ['quocum', 'quo'],
                            ['quacum', 'qua'], ['quicum', 'qui'], ['quibuscum', 'quibus']]) {
    whole('cum', form, base, [], []);
}
for (const [form, base] of [['egomet', 'ego'], ['memet', 'me'], ['mihimet', 'mihi'], ['temet', 'te'], ['tibimet', 'tibi'], ['semet', 'se'],
                            ['sibimet', 'sibi'], ['nosmet', 'nos'], ['vosmet', 'vos'], ['nobismet', 'nobis'], ['vobismet', 'vobis'], ['ipsemet', 'ipse']]) {
    whole('met', form, base, [], []);
}
for (const [form, base] of [['quisnam', 'quis'], ['quidnam', 'quid'], ['quaenam', 'quae'], ['quodnam', 'quod'], ['cuiusnam', 'cuius'], ['cuinam', 'cui'],
                            ['quemnam', 'quem'], ['quonam', 'quo'], ['quanam', 'qua'], ['quinam', 'qui'], ['ubinam', 'ubi']]) {
    whole('nam', form, base, [], []);
}

// --- Periphrastic forms with esse ---------------------------------------------------------
// A participle or gerundive and a form of esse are one verb form: amātus est
// (perfect passive), hortātus est (perfect of a deponent), amātūrus esse
// (future infinitive), dēlenda est (passive periphrastic). The form of esse
// is removed and the participle read as its verb, through the participle's
// own ending (amāta, amātī, amātum agree with the subject).
const ESSE = ['sum', 'es', 'est', 'sumus', 'estis', 'sunt', 'eram', 'eras', 'erat', 'eramus', 'eratis', 'erant', 'ero', 'eris', 'erit', 'erimus',
              'eritis', 'erunt', 'sim', 'sis', 'sit', 'simus', 'sitis', 'sint', 'essem', 'esses', 'esset', 'essemus', 'essetis', 'essent', 'forem',
              'fores', 'foret', 'forent', 'esse', 'fore', 'fui', 'fuisti', 'fuit', 'fuimus', 'fuistis', 'fuerunt', 'fuere', 'fueram', 'fueras', 'fuerat',
              'fueramus', 'fueratis', 'fuerant', 'fuero', 'fueris', 'fuerit', 'fuerimus', 'fueritis', 'fuerint', 'fuerim', 'fuissem', 'fuisses',
              'fuisset', 'fuissemus', 'fuissetis', 'fuissent', 'fuisse', 'iri'];
slot('esse', '+ esse', 'A participle or gerundive with a form of esse: amātus est, hortātī sunt, amātūrus esse, dēlenda est, laudandum erat; and the supine with īrī, the future passive infinitive (amātum īrī).');
// The infinitives also say auxi: an accusative participle (-ōs, -ās, -am)
// forms a periphrastic only with them (amātās esse, captam esse), so vēritās
// est is not read as vereor's.
const ESSE_INFINITIVE = new Set(['esse', 'fore', 'fuisse', 'iri']);
for (const form of ESSE) { sfx('esse', ` ${form}`, '', [], ESSE_INFINITIVE.has(form) ? ['aux', 'auxi'] : ['aux'], {stemMinLength: 3}); }
// The participle before esse ends its stem in t, s or x (amāt-a, vīs-um,
// fix-ī) or nd (dēlend-a); the future participle's in r (futūr-um esse,
// factūr-ī sunt), only in the masculine and neuter, since -ūra and -ūrae are
// mostly nouns (nātūrae sunt, cūra est). The stem has no capital: Mūsa sum
// is not a participle.
// The participle they give says ptcx, which the participles of the noesse
// lines of the stem table do not take.
for (const [ending, slotId] of [['a', 'adj-a'], ['um', 'adj-um'], ['i', 'adj-i'], ['ae', 'adj-ae'], ['os', 'adj-os'], ['as', 'adj-as'], ['am', 'adj-am']]) {
    const conditionsIn = ['os', 'as', 'am'].includes(ending) ? ['auxi'] : ['aux'];
    sfx(slotId, ending, 'us', conditionsIn, ['ptcx'], {stemMinLength: 3, stemCharacters: '[^ A-Z]', stemEndsWith: '[dstx]'});
    if (['um', 'i', 'os'].includes(ending)) {
        sfx(slotId, ending, 'us', conditionsIn, ['ptcx'], {stemMinLength: 3, stemCharacters: '[^ A-Z]', stemEndsWith: '[r]'});
    }
}

// --- Output -------------------------------------------------------------------------------
function buildTransforms() {
    const groups = new Map();
    for (const entry of [...RULES.values()].sort((a, b) => a.order - b.order)) {
        const slots = [...entry.slots].sort((a, b) => SLOTS.get(a).index - SLOTS.get(b).index);
        const id = slots.join('+');
        let transform = groups.get(id);
        if (transform === undefined) {
            const parts = slots.map((s) => SLOTS.get(s));
            // A rule several forms share is described by its first form's
            // description and the names of the others.
            const description = parts.length === 1 ? parts[0].description
                : `${parts[0].description} Also: ${parts.slice(1).map((p) => p.name).join('; ')}.`;
            transform = {id, name: parts.map((p) => p.name).join(' / '), description, source: 'own', rules: []};
            groups.set(id, transform);
        }
        transform.rules.push(entry.rule);
    }
    // Two readings that tie on every other key are ordered by discovery
    // (section 9.6), which follows this order. Adjectives first: an adjective
    // and a noun made from it (omnibus: omnis, omnia; summō: summus, summum)
    // are mostly the adjective, and a participle is read as one (data: datus,
    // datum). Then nouns, names and pronouns, then the vocative and adverb in
    // -e (sōle is sōl, not sōlus), then verbs. Measured on the 101,097
    // positions of the two test books: nouns first gave 106 wrong first
    // results and about 550 weaker readings of ties.
    // Names come before adjectives, which only matters for a capitalised word
    // (Galliam is Gallia's before Gallius'). Among nouns the dative and
    // ablative plural come late (maris is mare's before marum's, generis
    // genus' before gener's) and the vocative last (mēnse is mēnsis, not
    // mēnsus); among verbs the perfect comes before the present (dedit is dō's
    // before dēdō's, tulit ferō's before tulō's).
    const all = [...groups.values()];
    const rank = (t) => (t.id === 'adj-e+adverb' || t.id === 'adverb' ? 2
        : /^(name-|n-first)/u.test(t.id) ? -1
        : /^(adj|comparative|superlative|adverb)/u.test(t.id) ? 0
        : /^(n-|pron-)/u.test(t.id) ? 1 : 3);
    const within = (t) => (/^(perf|plupf|futpf|inf-perf)/u.test(t.id) ? 0 : t.id === 'n-dat-pl' ? 2 : t.id === 'n-voc-sg' ? 3 : 1);
    return all.map((t, i) => [rank(t), within(t), i, t]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]).map(([, , , t]) => t);
}

// --- Rare readings of frequent forms left to the dictionary ----------------------------
// A rule that reaches a rare lemma of a frequent form ties with the common
// lemma that the form's own form-of rows also name, and the rule's reading
// is found first (section 9.6): nāvī read as nāvus before nāvis. These rules
// leave such a stem out (stemNotStartsWithText); the dictionary's form-of
// rows still give the rare reading, after the common one.
for (const [slotId, inflected, deinflected, conditionsOut, stem] of [
    ['adj-i', 'i', 'us', ['adj12', 'ptc', 'v'], 'nav'],        // nāvī: nāvis, not nāvus
    ['adj-o', 'o', 'us', ['adj12', 'ptc', 'v'], 'argent'],     // argentō: argentum, not argentus
    ['adj-am', 'am', 'us', ['adj12', 'ptc', 'v'], 'mens|patri|line'], // mēnsam: mēnsa, not mēnsus; patriam, līneam
    ['adj-ae', 'ae', 'us', ['adj12', 'ptc', 'v'], 'patri|mens|line'], // patriae, mēnsae, līneae
    ['adj-a', 'a', 'us', ['adj12', 'ptc', 'v'], 'bell'],       // bella: bellum, not bellus
    ['adj-as', 'as', 'us', ['adj12', 'ptc', 'v'], 'mens'],     // mēnsās: mēnsa, not mēnsus
    ['inf', 'ere', 'eo', ['v'], 'can'],                        // canere: canō, not caneō
    ['n-gen-pl', 'etum', 'es', ['n3s'], 'imp'],                // impetum: impetus, not impes
    ['n-nom-pl', 'a', 'um', ['n2s'], 'loc*'],                  // loca: locus, not locum (* and longer stems)
    ['adj3-i', 'i', 'is', ['adj3'], 'Ital*'],                  // Itali: Italus, not Italis
    ['perf-3p', 'ere', 'i', ['vpf', 'v'], 'exist*'],           // existere: exsistō, not exeō (existī)
    ['perf-3s', 'it', 'i', ['vpf', 'v'], 'exist*'],            // existit
    ['adj3-ius', 'ius', 'ior', ['cmp', 'adj3'], 'curt*'],      // CURTIUS: Curtius, not curtus
    ['n-gen-sg', 'is', 'es', ['n3s'], 'coel*'],                // coelīs: caelum, not caelēs
    ['imp-2s', 'e', 'o', ['v'], 'jur*'],                       // jūre: iūre, not iūrō
    ['pres-2s', 'is', 'o', ['v'], 'jur*'],                     // jūris: iūs
    ['imp-2s', 'a', 'o', ['v'], 'jur*'],                       // jūra: iūs
    ['n-acc-sg', 'erum', 'er', ['n2s'], 'gen*'],               // generum: genus, not gener
    ['n-gen-sg', 'eri', 'er', ['n2s'], 'gen*'],                // generī
    ['pres-3s', 'et', 'eo', ['v'], 'put'],                     // putet: putō, not puteō
    ['n-acc-sg', 'am', 'a', ['n1s'], 'scrib*'],                // scrībam: scrībō, not scrība
    ['impf-3s', 'ebat', 'eo', ['v'], 'can'],                   // canēbat: canō, not caneō
    ['n-voc-sg', 'e', 'us', ['n2s'], 'pen*'],                  // pene: paene, not penus
    ['adj3-ia', 'icia', 'ex', ['adj3'], 'suppl'],              // supplicia: supplicium, not supplex
    ['subj-2s', 'ias', 'io', ['v'], 'cop'],                    // cōpiās: cōpia, not cōpiō
    ['imp-fut-2s', 'eto', 'eo', ['v'], 'ac'],                  // acētō: acētum, not aceō
    ['n-gen-pl', 'cum', 'x', ['n3s'], 'la'],                   // lacum: lacus, not lāx
    ['n-gen-pl', 'orum', 'us', ['n2s'], 'arm'],                // armōrum: arma, not armus
    ['n-gen-pl', 'orum', 'us', ['n3s'], 'arm'],
    ['n-dat-sg', 'o', 'us', ['n2s'], 'argent'],                // argentō
    ['n-nom-pl', 'rtes', 'rs', ['n3s'], 'fo'],                 // fortēs: fortis, not fors
    ['n-acc-sg', 'rtem', 'rs', ['n3s'], 'fo'],
    ['n-dat-sg', 'rti', 'rs', ['n3s'], 'fo'],
    ['n-gen-pl', 'rtium', 'rs', ['n3s'], 'fo'],
    ['n-dat-pl', 'rtibus', 'rs', ['n3s'], 'fo'],
]) {
    const matches = [...RULES.values()].filter(({rule, slots}) => slots.includes(slotId) && rule.inflected === inflected
        && rule.deinflected === deinflected && rule.conditionsIn.length === 0 && JSON.stringify(rule.conditionsOut) === JSON.stringify(conditionsOut));
    if (matches.length !== 1) { throw new Error(`${slotId} ${inflected} → ${deinflected}: ${matches.length} rules`); }
    if (matches[0].rule.stemNotStartsWithText) { throw new Error(`${slotId} ${inflected}: two exclusions`); }
    if (stem.endsWith('*')) { matches[0].rule.stemNotStartsWithText = stem.slice(0, -1); continue; }
    exceptStems(matches[0].slots, matches[0].rule, stem.split('|'));
}

// Nouns that a participle headword shadows: adjectives come first on ties,
// and wty-la-en has headwords for future participles (creātūrus) and some
// perfect ones (tēctus), so these noun forms come first: the -tūra and -sūra
// nouns (creātūram, Scrīptūrīs, mēnsūrae) and second-declension neuters that
// are nouns in most sentences (tēcta, dictīs, peccātī, vōta, arva, fātīs).
slot('n-first', 'noun', 'A noun form that is also a form of a participle headword: creātūram → creātūra, tēcta → tēctum.');
add('n-first', {type: 'circumfix', prefixes: [['', '']], suffixes: ['am', 'ae', 'is', 'as', 'arum'].flatMap((e) => [['t', 's'].map((c) => [`${c}ur${e}`, `${c}ura`])].flat()),
    conditionsIn: [], conditionsOut: ['n1s'], stemMinLength: 3, stemNotStartsWithText: 'fac'}); // not futūrīs, saturae, factūram (esse)
add('n-first', {type: 'circumfix', prefixes: ['tect', 'dict', 'peccat', 'fat', 'arv', 'vot', 'bell', 'mandat', 'promiss', 'praecept', 'punct', 'institut'].map((x) => [x, x]), suffixes: ['a', 'i', 'o', 'is', 'orum'].map((e) => [e, 'um']),
    conditionsIn: [], conditionsOut: ['n2s'], stemCharacters: '[]'});

const transforms = buildTransforms();
const out = {schema: 1, conditions, transforms};
const text = formatTransforms(out);
writeFileSync(join(here, 'own.json'), text);
const rules = transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`la: ${transforms.length} transforms, ${rules} rules in ${join(here, 'own.json')}`);
