#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/pt/sources/own.json, the Portuguese deinflection rules
// written for this pack (docs/languages.md, section 14 step 2). Run from the
// repository root:
//
//   node languages/pt/sources/build-own.mjs
//
// The tables follow the standard description of Portuguese inflection, in
// the Brazilian and the European norm (Cunha and Cintra, Nova gramática do
// português contemporâneo; Bechara, Moderna gramática portuguesa; the
// spelling of the Acordo Ortográfico de 1990; Wiktionary's Portuguese
// conjugation tables). No text or table is copied from them.
//
// Conditions. v, n and adj are dictionary forms: a verb rule writes an
// infinitive (v), a plural rule a singular noun or adjective (n, adj). vf is
// an intermediate state, a verb form whose attached pronoun was removed
// (deixa-me → deixa, fazê-lo → fazer is written at once); only the verb
// rules take it, and no dictionary term carries it. Yomitan has no
// Portuguese rules, so these rules are the pack's union and final set.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    vf: {name: 'Verb form whose attached pronoun was removed', isDictionaryForm: false},
};

// --- Transforms ---------------------------------------------------------------
// Rules that match at one node of the suffix trie apply in file order, and a
// lookup ranks the terms it finds first ahead on ties (docs/languages.md 7.4,
// 9.6). So the transforms are declared here in the order that decides those
// ties: plural before the verb forms (casas: casa before casar), the present
// before the subjunctive (pode: poder before podar).
const transforms = [];
const byId = new Map();
const seen = new Set();

function transform(id, name, description) {
    if (byId.has(id)) { throw new Error(`transform ${id} declared twice`); }
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

// A verb rule: the ending of a conjugated form, or of a form whose pronoun was
// removed (vf), replaced by the infinitive's. The stem has two letters unless
// the rule says otherwise: de, se and vê are not dar, ser and ver through a
// regular ending (those verbs are written out). An ending of one or two
// letters also needs a stem of letters only, so it never reads a word after
// a space or a hyphen as inflected (te ama, deixa-me).
const SHORT = 2;
const letters = (inflected) => ([...inflected].length <= SHORT ? {stemCharacters: '{letter}'} : {});
function verb(id, inflected, deinflected, extra = {}) {
    add(id, {type: 'suffix', inflected, deinflected, conditionsIn: ['vf'], conditionsOut: ['v'], stemMinLength: 2, ...letters(inflected), ...extra});
}

function verbWord(id, inflected, deinflected) {
    add(id, {type: 'wholeWord', inflected, deinflected, conditionsIn: ['vf'], conditionsOut: ['v']});
}

// A rule of a noun or adjective form.
function nominal(id, inflected, deinflected, conditionsIn, conditionsOut, extra = {}) {
    add(id, {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, stemMinLength: 2, ...letters(inflected), ...extra});
}

const PERSON_TEXT = {
    eu: 'first person singular (eu)',
    tu: 'second person singular (tu)',
    ele: 'third person singular (ele, ela, você)',
    nos: 'first person plural (nós)',
    vos: 'second person plural (vós)',
    eles: 'third person plural (eles, elas, vocês)',
    'eu-ele': 'first and third person singular (eu, ele, ela, você)',
};
const PERSON_NAME = {eu: 'eu', tu: 'tu', ele: 'ele', nos: 'nós', vos: 'vós', eles: 'eles', 'eu-ele': 'eu/ele'};
const SIX = ['eu', 'tu', 'ele', 'nos', 'vos', 'eles'];
const FIVE = ['eu-ele', 'tu', 'nos', 'vos', 'eles'];
// [id, trace name, description, persons]
const TENSES = [
    ['present', 'present', 'Present indicative', SIX],
    ['preterite', 'preterite', 'Preterite (pretérito perfeito)', SIX],
    ['imperfect', 'imperfect', 'Imperfect indicative (pretérito imperfeito)', FIVE],
    ['pluperfect', 'pluperfect', 'Simple pluperfect (pretérito mais-que-perfeito)', FIVE],
    ['future', 'future', 'Future indicative (futuro do presente)', SIX],
    ['conditional', 'conditional', 'Conditional (futuro do pretérito)', FIVE],
    ['subjunctive', 'present subjunctive', 'Present subjunctive, also the negative imperative', FIVE],
    ['imperfect-subjunctive', 'imperfect subjunctive', 'Imperfect subjunctive', FIVE],
    ['future-subjunctive', 'future subjunctive', 'Future subjunctive of a verb whose future subjunctive is not its personal infinitive', FIVE],
    ['personal-infinitive', 'personal infinitive', 'Personal infinitive, which is also the future subjunctive of a regular verb', ['tu', 'nos', 'vos', 'eles']],
];
// [person id, trace label, description]
const IMPERATIVES = [
    ['tu', 'tu', 'Affirmative imperative, tu'],
    ['vos', 'vós', 'Affirmative imperative, vós'],
    ['voce', 'você', 'Imperative, você (the present subjunctive form)'],
    ['nos', 'nós', 'Imperative, nós (the present subjunctive form)'],
    ['voces', 'vocês', 'Imperative, vocês (the present subjunctive form)'],
];
// The forms the descriptions give, for the slots whose examples are not the
// regular forms of falar, comer and partir.
const EXAMPLES = {
    'future-subjunctive-eu-ele': 'fizer, tiver, for',
    'future-subjunctive-tu': 'fizeres, tiveres, fores',
    'future-subjunctive-nos': 'fizermos, tivermos, formos',
    'future-subjunctive-vos': 'fizerdes, tiverdes, fordes',
    'future-subjunctive-eles': 'fizerem, tiverem, forem',
};
// Filled in by part 2 (ENDINGS) before the descriptions are written.
const examples = (slot) => EXAMPLES[slot] ?? [['fal', 'ar'], ['com', 'er'], ['part', 'ir']]
    .map(([stem, conj]) => stem + [ENDINGS[conj][slot]].flat()[0]).join(', ');

// --- Regular endings ------------------------------------------------------------
// The endings of the three conjugations, by slot (transform id). A list gives
// several spellings (the preterite falámos of the European norm, the four
// participle forms).
const ENDINGS = {
    ar: {
        'present-eu': 'o', 'present-tu': 'as', 'present-ele': 'a', 'present-nos': 'amos', 'present-vos': 'ais', 'present-eles': 'am',
        'preterite-eu': 'ei', 'preterite-tu': 'aste', 'preterite-ele': 'ou', 'preterite-nos': ['amos', 'ámos'], 'preterite-vos': 'astes', 'preterite-eles': 'aram',
        'imperfect-eu-ele': 'ava', 'imperfect-tu': 'avas', 'imperfect-nos': 'ávamos', 'imperfect-vos': 'áveis', 'imperfect-eles': 'avam',
        'pluperfect-eu-ele': 'ara', 'pluperfect-tu': 'aras', 'pluperfect-nos': 'áramos', 'pluperfect-vos': 'áreis', 'pluperfect-eles': 'aram',
        'future-eu': 'arei', 'future-tu': 'arás', 'future-ele': 'ará', 'future-nos': 'aremos', 'future-vos': 'areis', 'future-eles': 'arão',
        'conditional-eu-ele': 'aria', 'conditional-tu': 'arias', 'conditional-nos': 'aríamos', 'conditional-vos': 'aríeis', 'conditional-eles': 'ariam',
        'subjunctive-eu-ele': 'e', 'subjunctive-tu': 'es', 'subjunctive-nos': 'emos', 'subjunctive-vos': 'eis', 'subjunctive-eles': 'em',
        'imperfect-subjunctive-eu-ele': 'asse', 'imperfect-subjunctive-tu': 'asses', 'imperfect-subjunctive-nos': 'ássemos', 'imperfect-subjunctive-vos': 'ásseis', 'imperfect-subjunctive-eles': 'assem',
        'personal-infinitive-tu': 'ares', 'personal-infinitive-nos': 'armos', 'personal-infinitive-vos': 'ardes', 'personal-infinitive-eles': 'arem',
        'imperative-tu': 'a', 'imperative-vos': 'ai', 'imperative-voce': 'e', 'imperative-nos': 'emos', 'imperative-voces': 'em',
        'gerund': 'ando',
        'participle': ['ado', 'ada', 'ados', 'adas'],
    },
    er: {
        'present-eu': 'o', 'present-tu': 'es', 'present-ele': 'e', 'present-nos': 'emos', 'present-vos': 'eis', 'present-eles': 'em',
        'preterite-eu': 'i', 'preterite-tu': 'este', 'preterite-ele': 'eu', 'preterite-nos': 'emos', 'preterite-vos': 'estes', 'preterite-eles': 'eram',
        'imperfect-eu-ele': 'ia', 'imperfect-tu': 'ias', 'imperfect-nos': 'íamos', 'imperfect-vos': 'íeis', 'imperfect-eles': 'iam',
        'pluperfect-eu-ele': 'era', 'pluperfect-tu': 'eras', 'pluperfect-nos': 'êramos', 'pluperfect-vos': 'êreis', 'pluperfect-eles': 'eram',
        'future-eu': 'erei', 'future-tu': 'erás', 'future-ele': 'erá', 'future-nos': 'eremos', 'future-vos': 'ereis', 'future-eles': 'erão',
        'conditional-eu-ele': 'eria', 'conditional-tu': 'erias', 'conditional-nos': 'eríamos', 'conditional-vos': 'eríeis', 'conditional-eles': 'eriam',
        'subjunctive-eu-ele': 'a', 'subjunctive-tu': 'as', 'subjunctive-nos': 'amos', 'subjunctive-vos': 'ais', 'subjunctive-eles': 'am',
        'imperfect-subjunctive-eu-ele': 'esse', 'imperfect-subjunctive-tu': 'esses', 'imperfect-subjunctive-nos': 'êssemos', 'imperfect-subjunctive-vos': 'êsseis', 'imperfect-subjunctive-eles': 'essem',
        'personal-infinitive-tu': 'eres', 'personal-infinitive-nos': 'ermos', 'personal-infinitive-vos': 'erdes', 'personal-infinitive-eles': 'erem',
        'imperative-tu': 'e', 'imperative-vos': 'ei', 'imperative-voce': 'a', 'imperative-nos': 'amos', 'imperative-voces': 'am',
        'gerund': 'endo',
        'participle': ['ido', 'ida', 'idos', 'idas'],
    },
};
ENDINGS.ir = {
    ...ENDINGS.er,
    'present-nos': 'imos', 'present-vos': 'is',
    'preterite-tu': 'iste', 'preterite-ele': 'iu', 'preterite-nos': 'imos', 'preterite-vos': 'istes', 'preterite-eles': 'iram',
    'pluperfect-eu-ele': 'ira', 'pluperfect-tu': 'iras', 'pluperfect-nos': 'íramos', 'pluperfect-vos': 'íreis', 'pluperfect-eles': 'iram',
    'future-eu': 'irei', 'future-tu': 'irás', 'future-ele': 'irá', 'future-nos': 'iremos', 'future-vos': 'ireis', 'future-eles': 'irão',
    'conditional-eu-ele': 'iria', 'conditional-tu': 'irias', 'conditional-nos': 'iríamos', 'conditional-vos': 'iríeis', 'conditional-eles': 'iriam',
    'imperfect-subjunctive-eu-ele': 'isse', 'imperfect-subjunctive-tu': 'isses', 'imperfect-subjunctive-nos': 'íssemos', 'imperfect-subjunctive-vos': 'ísseis', 'imperfect-subjunctive-eles': 'issem',
    'personal-infinitive-tu': 'ires', 'personal-infinitive-nos': 'irmos', 'personal-infinitive-vos': 'irdes', 'personal-infinitive-eles': 'irem',
    'imperative-vos': 'i',
    'gerund': 'indo',
};

// --- Declarations, in tie-breaking order -------------------------------------------
transform('plural', 'plural', 'Plural of a noun or adjective: casas, flores, leões, pães, homens, animais, papéis, fáceis.');
for (const [tense, name, text, persons] of TENSES) {
    for (const person of persons) {
        const id = `${tense}-${person}`;
        transform(id, `${name} (${PERSON_NAME[person]})`, `${text}, ${PERSON_TEXT[person]}: ${examples(id)}.`);
    }
}
for (const [person, label, text] of IMPERATIVES) {
    const id = `imperative-${person}`;
    transform(id, `imperative (${label})`, `${text}: ${examples(id)}.`);
}
transform('gerund', 'gerund', 'Gerund: falando, comendo, partindo.');
transform('participle', 'past participle', 'Past participle, masculine or feminine, singular or plural: falado, comida, partidos, feitas.');
transform('feminine', 'feminine', 'Feminine form of an adjective or of a noun for a person: bonita, trabalhadora, portuguesa, alemã, europeia, boa.');
transform('diminutive', 'diminutive', 'Diminutive in -inho, -zinho: gatinho, casinha, pouquinho, cafezinho, florzinha, pãezinhos.');
transform('superlative', 'superlative', 'Absolute superlative in -íssimo: lindíssimo, rapidíssima, felicíssimo, riquíssimos, facílimo.');
transform('adverb', '-mente adverb', 'Adverb in -mente, looked up as its adjective: rapidamente → rápido, facilmente → fácil, provavelmente → provável.');
// One transform per pronoun attached to a verb, after it (enclisis: deixa-me,
// fazê-lo, dão-no) or inside its future or conditional (mesoclisis: dir-te-ei,
// fá-lo-ia). The contracted pairs (mo = me + o, lho = lhe + o) are one pronoun
// form each.
const PRONOUNS = [
    ['me', 'me'], ['te', 'te'], ['se', 'se'], ['lhe', 'lhe'], ['lhes', 'lhes'], ['nos', 'nos'], ['vos', 'vos'],
    ['o', 'o (lo, no)'], ['a', 'a (la, na)'], ['os', 'os (los, nos)'], ['as', 'as (las, nas)'],
    ['mo', 'mo (me + o)'], ['ma', 'ma (me + a)'], ['mos', 'mos (me + os)'], ['mas', 'mas (me + as)'],
    ['to', 'to (te + o)'], ['ta', 'ta (te + a)'], ['tos', 'tos (te + os)'], ['tas', 'tas (te + as)'],
    ['lho', 'lho (lhe + o)'], ['lha', 'lha (lhe + a)'], ['lhos', 'lhos (lhe + os)'], ['lhas', 'lhas (lhe + as)'],
];
for (const [p, label] of PRONOUNS) {
    transform(`clitic-${p}`, `+${p}`, `The pronoun ${label} attached to a verb, after it or inside its future or conditional.`);
}
transform('haver-de', '+de', 'Haver de in the European spelling before 2009, with a hyphen: hei-de, há-de, hão-de.');

// --- Regular verbs ------------------------------------------------------------------
// Spelling keeps the stem's sound: an -ar verb writes qu, gu and c before e
// (fique, cheguei, comece), an -er or -ir verb ç, j and g before a and o
// (conheço, protejo, dirija, ergo, distinga). So the plain ending never
// follows c or g there: rege is not regar, vaga not vagir.
for (const conj of ['ar', 'er', 'ir']) {
    for (const [slot, value] of Object.entries(ENDINGS[conj])) {
        for (const ending of [value].flat()) {
            if (conj === 'ar' && ending.startsWith('e')) {
                verb(slot, ending, 'ar', {stemNotEndsWith: '[cg]'});
                verb(slot, `qu${ending}`, 'car');
                verb(slot, `gu${ending}`, 'gar');
                verb(slot, `c${ending}`, 'çar');
            } else if (conj !== 'ar' && /^[ao]/u.test(ending)) {
                verb(slot, ending, conj, {stemNotEndsWith: '[cg]'});
                if (conj === 'er') { verb(slot, `ç${ending}`, 'cer'); }
                verb(slot, `j${ending}`, `g${conj}`);
                verb(slot, `g${ending}`, `gu${conj}`);
            } else {
                verb(slot, ending, conj);
            }
        }
    }
}

// The present of -guir and -guer verbs keeps gu before e. These come before the
// -gar subjunctive at the same ending, so segue, consegue and persegue give
// seguir, conseguir and perseguir before segar.
for (const slot of ['present-tu', 'present-ele', 'present-eles', 'imperative-tu']) {
    verb(slot, `gu${ENDINGS.ir[slot]}`, 'guir');
    verb(slot, `gu${ENDINGS.er[slot]}`, 'guer');
}

// -ir verbs whose stem vowel changes: e → i and o → u before a and o
// (sinto, sirva, prefiro, visto, durmo, cubra, tussa), u → o before a
// stressed e (sobe, foge, consome, cospe, sacode).
const IR_BEFORE_AO = ['present-eu', 'subjunctive-eu-ele', 'subjunctive-tu', 'subjunctive-nos', 'subjunctive-vos', 'subjunctive-eles',
    'imperative-voce', 'imperative-nos', 'imperative-voces'];
for (const slot of IR_BEFORE_AO) {
    const ending = ENDINGS.ir[slot];
    verb(slot, ending, 'ir', {stemNotEndsWith: '[cg]', stemChange: {from: ['i'], to: 'e', occurrence: 'last', between: '{consonant}'}});
    verb(slot, ending, 'ir', {stemNotEndsWith: '[cg]', stemChange: {from: ['u'], to: 'o', occurrence: 'last', between: '{consonant}'}});
    // seguir and its compounds: sigo, consiga, persigam, prossigamos.
    verb(slot, `ig${ending}`, 'eguir', {stemMinLength: 1});
}
for (const slot of ['present-tu', 'present-ele', 'present-eles', 'imperative-tu']) {
    verb(slot, ENDINGS.ir[slot], 'ir', {stemChange: {from: ['o'], to: 'u', occurrence: 'last', between: '{consonant}'}});
}
// agredir, progredir, regredir, transgredir and prevenir change e to i in
// every stressed form: agrido, progride, transgridam, previne.
for (const slot of [...IR_BEFORE_AO, 'present-tu', 'present-ele', 'present-eles', 'imperative-tu']) {
    const ending = ENDINGS.ir[slot];
    verb(slot, `grid${ending}`, 'gredir', {stemMinLength: 1});
    verb(slot, `evin${ending}`, 'evenir', {stemMinLength: 1});
}

// A stressed i or u after a vowel takes an accent where the infinitive has
// none: proíbe → proibir, reúne → reunir, saúda → saudar, enraízo → enraizar.
const STRESSED = ['present-eu', 'present-tu', 'present-ele', 'present-eles', 'subjunctive-eu-ele', 'subjunctive-tu', 'subjunctive-eles',
    'imperative-tu', 'imperative-voce', 'imperative-voces'];
for (const conj of ['ar', 'er', 'ir']) {
    for (const slot of STRESSED) {
        const ending = ENDINGS[conj][slot];
        const exclusion = (conj === 'ar' && ending.startsWith('e')) || (conj !== 'ar' && /^[ao]/u.test(ending)) ? {stemNotEndsWith: '[cg]'} : {};
        for (const [accented, plain] of [['í', 'i'], ['ú', 'u']]) {
            verb(slot, ending, conj, {...exclusion, stemChange: {from: [accented], to: plain, occurrence: 'last', between: '{consonant}'}});
        }
    }
}

// -ear verbs take i in the stressed forms (passeio, receias, freiam); odiar,
// mediar, remediar, incendiar, intermediar and ansiar do the same (odeio,
// anseia).
const EAR = {'present-eu': 'eio', 'present-tu': 'eias', 'present-ele': 'eia', 'present-eles': 'eiam', 'subjunctive-eu-ele': 'eie',
    'subjunctive-tu': 'eies', 'subjunctive-eles': 'eiem', 'imperative-tu': 'eia', 'imperative-voce': 'eie', 'imperative-voces': 'eiem'};
for (const [slot, ending] of Object.entries(EAR)) {
    verb(slot, ending, 'ear');
    verb(slot, `d${ending}`, 'diar', {stemMinLength: 1});
    verb(slot, `ns${ending}`, 'nsiar', {stemMinLength: 1});
}

// -uir, -air and -oer verbs write the vowel of the ending apart from the stem's
// (inclui, incluímos, incluía; sai, saímos, saía; dói, moía, roído).
const HIATUS = {
    'present-tu': ['is'], 'present-ele': ['i'], 'present-nos': ['ímos'], 'present-vos': ['ís'],
    'preterite-eu': ['í'], 'preterite-tu': ['íste'], 'preterite-ele': ['iu'], 'preterite-nos': ['ímos'], 'preterite-vos': ['ístes'], 'preterite-eles': ['íram'],
    'imperfect-eu-ele': ['ía'], 'imperfect-tu': ['ías'], 'imperfect-nos': ['íamos'], 'imperfect-vos': ['íeis'], 'imperfect-eles': ['íam'],
    'pluperfect-eu-ele': ['íra'], 'pluperfect-tu': ['íras'], 'pluperfect-nos': ['íramos'], 'pluperfect-vos': ['íreis'], 'pluperfect-eles': ['íram'],
    'imperfect-subjunctive-eu-ele': ['ísse'], 'imperfect-subjunctive-tu': ['ísses'], 'imperfect-subjunctive-nos': ['íssemos'],
    'imperfect-subjunctive-vos': ['ísseis'], 'imperfect-subjunctive-eles': ['íssem'],
    'personal-infinitive-tu': ['íres'], 'personal-infinitive-eles': ['írem'],
    'imperative-tu': ['i'], 'imperative-vos': ['í'],
    'participle': ['ído', 'ída', 'ídos', 'ídas'],
};
for (const [slot, endings] of Object.entries(HIATUS)) {
    for (const ending of endings) {
        // seguir, conseguir and distinguir end in -guir but are regular: segui is not a form of an -uir verb.
        verb(slot, `u${ending}`, 'uir', {stemMinLength: 1, stemNotEndsWith: '[gq]'});
        verb(slot, `a${ending}`, 'air', {stemMinLength: 1});
    }
}
verb('present-eles', 'uem', 'uir', {stemMinLength: 1, stemNotEndsWith: '[gq]'});
for (const [slot, ending] of [['present-eu', 'aio'], ['present-eles', 'aem'], ['subjunctive-eu-ele', 'aia'], ['subjunctive-tu', 'aias'],
    ['subjunctive-nos', 'aiamos'], ['subjunctive-vos', 'aiais'], ['subjunctive-eles', 'aiam'], ['imperative-voce', 'aia'],
    ['imperative-nos', 'aiamos'], ['imperative-voces', 'aiam']]) {
    verb(slot, ending, 'air', {stemMinLength: 1});
}
// construir, destruir and reconstruir: constróis, constrói, constroem.
for (const [slot, ending] of [['present-tu', 'tróis'], ['present-ele', 'trói'], ['present-eles', 'troem'], ['imperative-tu', 'trói']]) {
    verb(slot, ending, 'truir', {stemMinLength: 1});
}
for (const [slot, ending] of [['present-eu', 'oo'], ['present-tu', 'óis'], ['present-ele', 'ói'], ['imperative-tu', 'ói'], ['preterite-eu', 'oí'],
    ['imperfect-eu-ele', 'oía'], ['imperfect-tu', 'oías'], ['imperfect-nos', 'oíamos'], ['imperfect-vos', 'oíeis'], ['imperfect-eles', 'oíam'],
    ['participle', 'oído'], ['participle', 'oída'], ['participle', 'oídos'], ['participle', 'oídas']]) {
    verb(slot, ending, 'oer', {stemMinLength: 1});
}
// -uzir verbs drop the e of the third person: conduz, produz, traduz.
verb('present-ele', 'uz', 'uzir');
verb('imperative-tu', 'uz', 'uzir');

// --- Irregular verbs -----------------------------------------------------------------
// A paradigm lists the irregular forms by tense: p present, pt preterite,
// i imperfect, pp pluperfect, f future, c conditional, s present
// subjunctive, is imperfect subjunctive, fs future subjunctive, pi personal
// infinitive, imp imperative (tu, vós, você, nós, vocês), g gerund, pa
// participle. A cell is a form, a list of spellings, or null.
const TENSE_SLOTS = {
    p: SIX.map((p) => `present-${p}`),
    pt: SIX.map((p) => `preterite-${p}`),
    i: FIVE.map((p) => `imperfect-${p}`),
    pp: FIVE.map((p) => `pluperfect-${p}`),
    f: SIX.map((p) => `future-${p}`),
    c: FIVE.map((p) => `conditional-${p}`),
    s: FIVE.map((p) => `subjunctive-${p}`),
    is: FIVE.map((p) => `imperfect-subjunctive-${p}`),
    fs: FIVE.map((p) => `future-subjunctive-${p}`),
    pi: ['tu', 'nos', 'vos', 'eles'].map((p) => `personal-infinitive-${p}`),
    imp: ['tu', 'vos', 'voce', 'nos', 'voces'].map((p) => `imperative-${p}`),
    g: ['gerund'],
    pa: ['participle', 'participle', 'participle', 'participle'],
};
const SLOT_TENSE = {present: 'p', preterite: 'pt', imperfect: 'i', pluperfect: 'pp', future: 'f', conditional: 'c', subjunctive: 's',
    'imperfect-subjunctive': 'is', 'personal-infinitive': 'pi', gerund: 'g', participle: 'pa'};

/** [slot, form] pairs of a paradigm. */
function cells(paradigm) {
    const out = [];
    for (const [tense, list] of Object.entries(paradigm)) {
        const slots = TENSE_SLOTS[tense];
        if (slots === undefined || list.length > slots.length) { throw new Error(`bad tense ${tense}`); }
        list.forEach((cell, k) => {
            for (const form of [cell ?? []].flat()) { out.push([slots[k], form]); }
        });
    }
    return out;
}

/** The regular forms of a verb in the given tenses (`fill`), for verbs whose stem is too short for the regular rules. */
function regularCells(infinitive, fill) {
    if (fill.length === 0) { return []; }
    const conj = infinitive.slice(-2);
    const stem = infinitive.slice(0, -2);
    const out = [];
    for (const [slot, value] of Object.entries(ENDINGS[conj])) {
        const tense = SLOT_TENSE[slot.replace(/-(eu-ele|eu|tu|ele|nos|vos|eles)$/u, '')];
        if (!fill.includes(tense)) { continue; }
        for (const ending of [value].flat()) { out.push([slot, stem + ending]); }
    }
    return out;
}

/**
 * Writes an irregular verb: every form as a whole word, for the verb and for
 * each compound prefix (manter, compor, desfazer). `compound` replaces cells
 * of the compounds (mantém where the verb has tem); `fill` adds the regular
 * forms of a verb whose stem has fewer than two letters.
 */
function irregular(infinitive, paradigm, {prefixes = [], compound = {}, fill = [], compoundInfinitive = infinitive} = {}) {
    for (const [slot, form] of [...cells(paradigm), ...regularCells(infinitive, fill)]) { verbWord(slot, form, infinitive); }
    if (prefixes.length === 0) { return; }
    // The compounds' paradigm is the verb's with the cells `compound` gives
    // replaced; their regular forms (manterei, mantendo) need no rule here.
    // One cross-product rule per slot: each prefix with each form, and an
    // empty stem between them ([] has no member), so only the listed
    // compounds match.
    const merged = {};
    for (const [tense, list] of Object.entries(paradigm)) {
        merged[tense] = list.map((cell, k) => compound[tense]?.[k] ?? cell);
    }
    const bySlot = new Map();
    for (const [slot, form] of cells(merged)) {
        if (!bySlot.has(slot)) { bySlot.set(slot, []); }
        bySlot.get(slot).push([form, compoundInfinitive]);
    }
    for (const [slot, suffixes] of bySlot) {
        add(slot, {type: 'circumfix', prefixes: prefixes.map((x) => [x, x]), suffixes, conditionsIn: ['vf'], conditionsOut: ['v'], stemCharacters: '[]'});
    }
}

irregular('ser', {
    p: ['sou', 'és', 'é', 'somos', 'sois', 'são'],
    pt: ['fui', 'foste', 'foi', 'fomos', 'fostes', 'foram'],
    i: ['era', 'eras', 'éramos', 'éreis', 'eram'],
    pp: ['fora', 'foras', 'fôramos', 'fôreis', 'foram'],
    s: ['seja', 'sejas', 'sejamos', 'sejais', 'sejam'],
    is: ['fosse', 'fosses', 'fôssemos', 'fôsseis', 'fossem'],
    fs: ['for', 'fores', 'formos', 'fordes', 'forem'],
    imp: ['sê', 'sede', 'seja', 'sejamos', 'sejam'],
    pa: ['sido'],
}, {fill: ['f', 'c', 'pi', 'g']});
irregular('ir', {
    p: ['vou', 'vais', 'vai', 'vamos', 'ides', 'vão'],
    pt: ['fui', 'foste', 'foi', 'fomos', 'fostes', 'foram'],
    i: ['ia', 'ias', 'íamos', 'íeis', 'iam'],
    pp: ['fora', 'foras', 'fôramos', 'fôreis', 'foram'],
    s: ['vá', 'vás', 'vamos', 'vades', 'vão'],
    is: ['fosse', 'fosses', 'fôssemos', 'fôsseis', 'fossem'],
    fs: ['for', 'fores', 'formos', 'fordes', 'forem'],
    imp: ['vai', 'ide', 'vá', 'vamos', 'vão'],
    g: ['indo'],
    pa: ['ido'],
}, {fill: ['f', 'c', 'pi']});
irregular('estar', {
    p: ['estou', 'estás', 'está', 'estamos', 'estais', 'estão'],
    pt: ['estive', 'estiveste', 'esteve', 'estivemos', 'estivestes', 'estiveram'],
    pp: ['estivera', 'estiveras', 'estivéramos', 'estivéreis', 'estiveram'],
    s: ['esteja', 'estejas', 'estejamos', 'estejais', 'estejam'],
    is: ['estivesse', 'estivesses', 'estivéssemos', 'estivésseis', 'estivessem'],
    fs: ['estiver', 'estiveres', 'estivermos', 'estiverdes', 'estiverem'],
    imp: ['está', 'estai', 'esteja', 'estejamos', 'estejam'],
});
irregular('ter', {
    p: ['tenho', 'tens', 'tem', 'temos', 'tendes', 'têm'],
    pt: ['tive', 'tiveste', 'teve', 'tivemos', 'tivestes', 'tiveram'],
    i: ['tinha', 'tinhas', 'tínhamos', 'tínheis', 'tinham'],
    pp: ['tivera', 'tiveras', 'tivéramos', 'tivéreis', 'tiveram'],
    s: ['tenha', 'tenhas', 'tenhamos', 'tenhais', 'tenham'],
    is: ['tivesse', 'tivesses', 'tivéssemos', 'tivésseis', 'tivessem'],
    fs: ['tiver', 'tiveres', 'tivermos', 'tiverdes', 'tiverem'],
    imp: ['tem', 'tende', 'tenha', 'tenhamos', 'tenham'],
}, {fill: ['f', 'c', 'pi', 'g', 'pa'], prefixes: ['man', 'con', 'ob', 'de', 're', 'entre', 'a', 'abs', 'sus'],
    compound: {p: [null, 'téns', 'tém', null, null, null], imp: ['tém', null, null, null, null]}});
irregular('haver', {
    p: ['hei', 'hás', 'há', ['havemos', 'hemos'], ['haveis', 'heis'], 'hão'],
    pt: ['houve', 'houveste', 'houve', 'houvemos', 'houvestes', 'houveram'],
    pp: ['houvera', 'houveras', 'houvéramos', 'houvéreis', 'houveram'],
    s: ['haja', 'hajas', 'hajamos', 'hajais', 'hajam'],
    is: ['houvesse', 'houvesses', 'houvéssemos', 'houvésseis', 'houvessem'],
    fs: ['houver', 'houveres', 'houvermos', 'houverdes', 'houverem'],
    imp: ['há', 'havei', 'haja', 'hajamos', 'hajam'],
});
irregular('vir', {
    p: ['venho', 'vens', 'vem', 'vimos', 'vindes', 'vêm'],
    pt: ['vim', 'vieste', 'veio', 'viemos', 'viestes', 'vieram'],
    i: ['vinha', 'vinhas', 'vínhamos', 'vínheis', 'vinham'],
    pp: ['viera', 'vieras', 'viéramos', 'viéreis', 'vieram'],
    s: ['venha', 'venhas', 'venhamos', 'venhais', 'venham'],
    is: ['viesse', 'viesses', 'viéssemos', 'viésseis', 'viessem'],
    fs: ['vier', 'vieres', 'viermos', 'vierdes', 'vierem'],
    imp: ['vem', 'vinde', 'venha', 'venhamos', 'venham'],
    g: ['vindo'],
    pa: ['vindo', 'vinda', 'vindos', 'vindas'],
}, {fill: ['f', 'c', 'pi'], prefixes: ['con', 'inter', 'pro', 'ad', 'sobre'],
    compound: {p: [null, 'véns', 'vém', null, null, null], imp: ['vém', null, null, null, null]}});
irregular('ver', {
    p: ['vejo', 'vês', 'vê', 'vemos', 'vedes', ['veem', 'vêem']],
    pt: ['vi', 'viste', 'viu', 'vimos', 'vistes', 'viram'],
    pp: ['vira', 'viras', 'víramos', 'víreis', 'viram'],
    s: ['veja', 'vejas', 'vejamos', 'vejais', 'vejam'],
    is: ['visse', 'visses', 'víssemos', 'vísseis', 'vissem'],
    fs: ['vir', 'vires', 'virmos', 'virdes', 'virem'],
    imp: ['vê', 'vede', 'veja', 'vejamos', 'vejam'],
    pa: ['visto', 'vista', 'vistos', 'vistas'],
}, {fill: ['i', 'f', 'c', 'pi', 'g'], prefixes: ['re', 'pre', 'ante', 'entre']});
irregular('dar', {
    p: ['dou', 'dás', 'dá', 'damos', 'dais', 'dão'],
    pt: ['dei', 'deste', 'deu', 'demos', 'destes', 'deram'],
    pp: ['dera', 'deras', 'déramos', 'déreis', 'deram'],
    s: ['dê', 'dês', 'demos', 'deis', ['deem', 'dêem']],
    is: ['desse', 'desses', 'déssemos', 'désseis', 'dessem'],
    fs: ['der', 'deres', 'dermos', 'derdes', 'derem'],
    imp: ['dá', 'dai', 'dê', 'demos', ['deem', 'dêem']],
}, {fill: ['i', 'f', 'c', 'pi', 'g', 'pa']});
irregular('fazer', {
    p: ['faço', null, 'faz'],
    pt: ['fiz', 'fizeste', 'fez', 'fizemos', 'fizestes', 'fizeram'],
    pp: ['fizera', 'fizeras', 'fizéramos', 'fizéreis', 'fizeram'],
    f: ['farei', 'farás', 'fará', 'faremos', 'fareis', 'farão'],
    c: ['faria', 'farias', 'faríamos', 'faríeis', 'fariam'],
    s: ['faça', 'faças', 'façamos', 'façais', 'façam'],
    is: ['fizesse', 'fizesses', 'fizéssemos', 'fizésseis', 'fizessem'],
    fs: ['fizer', 'fizeres', 'fizermos', 'fizerdes', 'fizerem'],
    imp: [['faz', 'faze'], null, 'faça', 'façamos', 'façam'],
    pa: ['feito', 'feita', 'feitos', 'feitas'],
}, {prefixes: ['re', 'des', 'satis', 'contra', 'per']});
irregular('dizer', {
    p: ['digo', null, 'diz'],
    pt: ['disse', 'disseste', 'disse', 'dissemos', 'dissestes', 'disseram'],
    pp: ['dissera', 'disseras', 'disséramos', 'disséreis', 'disseram'],
    f: ['direi', 'dirás', 'dirá', 'diremos', 'direis', 'dirão'],
    c: ['diria', 'dirias', 'diríamos', 'diríeis', 'diriam'],
    s: ['diga', 'digas', 'digamos', 'digais', 'digam'],
    is: ['dissesse', 'dissesses', 'disséssemos', 'dissésseis', 'dissessem'],
    fs: ['disser', 'disseres', 'dissermos', 'disserdes', 'disserem'],
    imp: [['diz', 'dize'], null, 'diga', 'digamos', 'digam'],
    pa: ['dito', 'dita', 'ditos', 'ditas'],
}, {prefixes: ['pre', 'contra', 'des', 'ben', 'mal']});
irregular('trazer', {
    p: ['trago', null, 'traz'],
    pt: ['trouxe', 'trouxeste', 'trouxe', 'trouxemos', 'trouxestes', 'trouxeram'],
    pp: ['trouxera', 'trouxeras', 'trouxéramos', 'trouxéreis', 'trouxeram'],
    f: ['trarei', 'trarás', 'trará', 'traremos', 'trareis', 'trarão'],
    c: ['traria', 'trarias', 'traríamos', 'traríeis', 'trariam'],
    s: ['traga', 'tragas', 'tragamos', 'tragais', 'tragam'],
    is: ['trouxesse', 'trouxesses', 'trouxéssemos', 'trouxésseis', 'trouxessem'],
    fs: ['trouxer', 'trouxeres', 'trouxermos', 'trouxerdes', 'trouxerem'],
    imp: [['traz', 'traze'], null, 'traga', 'tragamos', 'tragam'],
});
irregular('poder', {
    p: ['posso'],
    pt: ['pude', 'pudeste', 'pôde', 'pudemos', 'pudestes', 'puderam'],
    pp: ['pudera', 'puderas', 'pudéramos', 'pudéreis', 'puderam'],
    s: ['possa', 'possas', 'possamos', 'possais', 'possam'],
    is: ['pudesse', 'pudesses', 'pudéssemos', 'pudésseis', 'pudessem'],
    fs: ['puder', 'puderes', 'pudermos', 'puderdes', 'puderem'],
});
irregular('querer', {
    p: ['quero', null, 'quer'],
    pt: ['quis', 'quiseste', 'quis', 'quisemos', 'quisestes', 'quiseram'],
    pp: ['quisera', 'quiseras', 'quiséramos', 'quiséreis', 'quiseram'],
    s: ['queira', 'queiras', 'queiramos', 'queirais', 'queiram'],
    is: ['quisesse', 'quisesses', 'quiséssemos', 'quisésseis', 'quisessem'],
    fs: ['quiser', 'quiseres', 'quisermos', 'quiserdes', 'quiserem'],
    imp: [null, null, 'queira', 'queiramos', 'queiram'],
});
irregular('requerer', {
    p: ['requeiro', null, 'requer'],
    s: ['requeira', 'requeiras', 'requeiramos', 'requeirais', 'requeiram'],
    imp: [null, null, 'requeira', 'requeiramos', 'requeiram'],
});
irregular('saber', {
    p: ['sei'],
    pt: ['soube', 'soubeste', 'soube', 'soubemos', 'soubestes', 'souberam'],
    pp: ['soubera', 'souberas', 'soubéramos', 'soubéreis', 'souberam'],
    s: ['saiba', 'saibas', 'saibamos', 'saibais', 'saibam'],
    is: ['soubesse', 'soubesses', 'soubéssemos', 'soubésseis', 'soubessem'],
    fs: ['souber', 'souberes', 'soubermos', 'souberdes', 'souberem'],
    imp: [null, null, 'saiba', 'saibamos', 'saibam'],
});
irregular('caber', {
    p: ['caibo'],
    pt: ['coube', 'coubeste', 'coube', 'coubemos', 'coubestes', 'couberam'],
    pp: ['coubera', 'couberas', 'coubéramos', 'coubéreis', 'couberam'],
    s: ['caiba', 'caibas', 'caibamos', 'caibais', 'caibam'],
    is: ['coubesse', 'coubesses', 'coubéssemos', 'coubésseis', 'coubessem'],
    fs: ['couber', 'couberes', 'coubermos', 'couberdes', 'couberem'],
});
// pôr is the only verb in -or; its compounds have no accent (compor, dispor).
irregular('pôr', {
    p: ['ponho', 'pões', 'põe', 'pomos', 'pondes', 'põem'],
    pt: ['pus', 'puseste', 'pôs', 'pusemos', 'pusestes', 'puseram'],
    i: ['punha', 'punhas', 'púnhamos', 'púnheis', 'punham'],
    pp: ['pusera', 'puseras', 'puséramos', 'puséreis', 'puseram'],
    f: ['porei', 'porás', 'porá', 'poremos', 'poreis', 'porão'],
    c: ['poria', 'porias', 'poríamos', 'poríeis', 'poriam'],
    s: ['ponha', 'ponhas', 'ponhamos', 'ponhais', 'ponham'],
    is: ['pusesse', 'pusesses', 'puséssemos', 'pusésseis', 'pusessem'],
    fs: ['puser', 'puseres', 'pusermos', 'puserdes', 'puserem'],
    pi: ['pores', 'pormos', 'pordes', 'porem'],
    imp: ['põe', 'ponde', 'ponha', 'ponhamos', 'ponham'],
    g: ['pondo'],
    pa: ['posto', 'posta', 'postos', 'postas'],
}, {compoundInfinitive: 'por', prefixes: ['com', 'decom', 'recom', 'de', 'dis', 'indis', 'predis', 'ex', 'im', 'o', 'pro', 're', 'su',
    'pressu', 'trans', 'ante', 'contra', 'entre', 'inter', 'justa', 'sobre', 'super', 'a']});
irregular('ler', {
    p: ['leio', 'lês', 'lê', 'lemos', 'ledes', ['leem', 'lêem']],
    pt: ['li', 'leste', 'leu', 'lemos', 'lestes', 'leram'],
    pp: ['lera', 'leras', 'lêramos', 'lêreis', 'leram'],
    s: ['leia', 'leias', 'leiamos', 'leiais', 'leiam'],
    is: ['lesse', 'lesses', 'lêssemos', 'lêsseis', 'lessem'],
    imp: ['lê', 'lede', 'leia', 'leiamos', 'leiam'],
}, {fill: ['i', 'f', 'c', 'pi', 'g', 'pa'], prefixes: ['re', 'tres']});
irregular('crer', {
    p: ['creio', 'crês', 'crê', 'cremos', 'credes', ['creem', 'crêem']],
    pt: ['cri'],
    s: ['creia', 'creias', 'creiamos', 'creiais', 'creiam'],
    imp: ['crê', 'crede', 'creia', 'creiamos', 'creiam'],
}, {prefixes: ['des']});
irregular('rir', {
    p: ['rio', 'ris', 'ri', 'rimos', 'rides', 'riem'],
    pt: ['ri', 'riste', 'riu', 'rimos', 'ristes', 'riram'],
    s: ['ria', 'rias', 'riamos', 'riais', 'riam'],
    imp: ['ri', 'ride', 'ria', 'riamos', 'riam'],
}, {fill: ['i', 'pp', 'f', 'c', 'is', 'pi', 'g', 'pa'], prefixes: ['sor']});
irregular('perder', {p: ['perco'], s: ['perca', 'percas', 'percamos', 'percais', 'percam'], imp: [null, null, 'perca', 'percamos', 'percam']});
irregular('valer', {p: ['valho'], s: ['valha', 'valhas', 'valhamos', 'valhais', 'valham'], imp: [null, null, 'valha', 'valhamos', 'valham']},
    {prefixes: ['equi']});
irregular('ouvir', {p: [['ouço', 'oiço']], s: [['ouça', 'oiça'], ['ouças', 'oiças'], ['ouçamos', 'oiçamos'], ['ouçais', 'oiçais'], ['ouçam', 'oiçam']],
    imp: [null, null, ['ouça', 'oiça'], ['ouçamos', 'oiçamos'], ['ouçam', 'oiçam']]});
irregular('pedir', {p: ['peço'], s: ['peça', 'peças', 'peçamos', 'peçais', 'peçam'], imp: [null, null, 'peça', 'peçamos', 'peçam']},
    {prefixes: ['des', 'im', 'ex', 'desim']});
irregular('medir', {p: ['meço'], s: ['meça', 'meças', 'meçamos', 'meçais', 'meçam'], imp: [null, null, 'meça', 'meçamos', 'meçam']});
irregular('prover', {p: ['provejo', 'provês', 'provê', null, 'provedes', 'proveem'], s: ['proveja', 'provejas', 'provejamos', 'provejais', 'provejam'],
    imp: ['provê', null, 'proveja', 'provejamos', 'provejam']});

// Irregular participles, with their feminine and plural. Families that
// share an ending (escrito, descrito, inscrito; aberto, reaberto; coberto,
// descoberto, encoberto) are suffix rules.
const PARTICIPLE_FORMS = (masculine) => [masculine, `${masculine.slice(0, -1)}a`, `${masculine}s`, `${masculine.slice(0, -1)}as`];
for (const [form, infinitive] of [['crito', 'crever'], ['aberto', 'abrir'], ['coberto', 'cobrir']]) {
    for (const f of PARTICIPLE_FORMS(form)) { verb('participle', f, infinitive, {stemMinLength: form === 'crito' ? 2 : 0}); }
}
for (const [form, infinitives] of [
    ['ganho', ['ganhar']], ['gasto', ['gastar']], ['pago', ['pagar']], ['aceito', ['aceitar']], ['aceite', ['aceitar']], ['entregue', ['entregar']],
    ['morto', ['morrer', 'matar']], ['preso', ['prender']], ['solto', ['soltar']], ['eleito', ['eleger']], ['impresso', ['imprimir']],
    ['aceso', ['acender']], ['limpo', ['limpar']], ['salvo', ['salvar']], ['expresso', ['exprimir', 'expressar']], ['extinto', ['extinguir']],
    ['frito', ['fritar']], ['suspenso', ['suspender']], ['envolto', ['envolver']], ['junto', ['juntar']], ['enxuto', ['enxugar']],
    ['isento', ['isentar']], ['omisso', ['omitir']], ['tinto', ['tingir']], ['farto', ['fartar']], ['roto', ['romper']], ['expulso', ['expulsar']],
    ['inserto', ['inserir']], ['incluso', ['incluir']], ['confuso', ['confundir']], ['corrupto', ['corromper']], ['distinto', ['distinguir']],
    ['submerso', ['submergir']], ['absorto', ['absorver']], ['bento', ['benzer']], ['findo', ['findar']], ['pego', ['pegar']],
]) {
    const forms = form.endsWith('o') ? PARTICIPLE_FORMS(form) : [form, `${form}s`];
    for (const f of forms) { for (const infinitive of infinitives) { verbWord('participle', f, infinitive); } }
}

// --- Pronouns attached to verbs -------------------------------------------------------
// The pronoun is removed and the verb form is deinflected again (vf), except
// where the form left is an infinitive (dizer-lhe, fazê-lo), which is written
// at once. A rule may take vf itself, so a second pronoun goes too
// (diz-se-lhe). o, a, os and as are written lo, la, los, las after a form
// whose final r, s or z they drop (fazê-lo, fá-lo, fazemo-lo, di-lo), and no,
// na, nos, nas after a nasal (fazem-no, dão-na, põe-nos).
function clitic(p, inflected, deinflected, conditionsOut, extra = {}) {
    add(`clitic-${p}`, {type: 'suffix', inflected, deinflected, conditionsIn: ['vf'], conditionsOut, stemMinLength: 1, ...extra});
}
const O_FORMS = {o: ['lo', 'no'], a: ['la', 'na'], os: ['los', 'nos'], as: ['las', 'nas']};
const OTHER = PRONOUNS.map(([p]) => p).filter((p) => !(p in O_FORMS));
// Future and conditional endings, which a pronoun goes before (mesoclisis).
const FUTURE_ENDINGS = ['ei', 'ás', 'á', 'emos', 'eis', 'ão', 'ia', 'ias', 'íamos', 'íeis', 'iam'];
for (const p of OTHER) {
    clitic(p, `-${p}`, '', ['vf'], {stemNotEndsWith: '[r]'});   // deixa-me, disse-lhe, sentou-se, deu-mo
    clitic(p, `r-${p}`, 'r', ['v']);                              // dizer-lhe, sentar-se
    // The contracted pairs are rare inside the verb (dar-to-ei) and left out there.
    if (p.length <= 4 && !/^(m|t|lh)[oa]s?$/u.test(p)) {
        for (const ending of FUTURE_ENDINGS) {
            clitic(p, `r-${p}-${ending}`, `r${ending}`, ['vf']);  // dir-te-ei, far-se-á, dar-lhe-ia
        }
    }
}
// sentamo-nos, vamo-nos: the -s of the first person plural goes before nos.
clitic('nos', 'mo-nos', 'mos', ['vf']);
for (const [p, [l, n]] of Object.entries(O_FORMS)) {
    clitic(p, `-${p}`, '', ['vf'], {stemNotEndsWith: '[rszm]'}); // vi-o, conhece-a, deixe-os
    // An infinitive whose r was dropped: amá-lo, fazê-lo, parti-lo, compô-lo.
    for (const [vowel, infinitive] of [['á', 'ar'], ['ê', 'er'], ['i', 'ir'], ['ô', 'or']]) {
        clitic(p, `${vowel}-${l}`, infinitive, ['v']);
        for (const ending of FUTURE_ENDINGS) {
            clitic(p, `${vowel}-${l}-${ending}`, `${infinitive}${ending}`, ['vf']);   // amá-lo-ei, fá-lo-ia, di-lo-ei
        }
    }
    add(`clitic-${p}`, {type: 'wholeWord', inflected: `pô-${l}`, deinflected: 'pôr', conditionsIn: ['vf'], conditionsOut: ['v']});
    // A finite form whose s or z was dropped: fá-lo (faz), fê-lo (fez),
    // di-lo (diz), condu-lo (conduz), dá-lo (dás), vê-lo (vês), qui-lo (quis),
    // pu-lo (pus), pô-lo (pôs), ama-lo (amas), come-lo (comes), fazemo-lo.
    for (const [ending, form] of [['á', 'az'], ['á', 'ás'], ['ê', 'ez'], ['ê', 'ês'], ['i', 'iz'], ['i', 'is'], ['u', 'uz'], ['u', 'us'],
        ['ô', 'ôs'], ['a', 'as'], ['e', 'es'], ['mo', 'mos']]) {
        clitic(p, `${ending}-${l}`, form, ['vf']);
    }
    // After a nasal: fazem-no, tem-na, dão-no, põe-nas.
    for (const nasal of ['m', 'ão', 'õe']) {
        clitic(p, `${nasal}-${n}`, nasal, ['vf']);
    }
    // eis (here is): ei-lo, ei-las.
    add(`clitic-${p}`, {type: 'wholeWord', inflected: `ei-${l}`, deinflected: 'eis', conditionsIn: [], conditionsOut: []});
}
for (const p of ['me', 'te', 'nos', 'vos']) {
    add(`clitic-${p}`, {type: 'wholeWord', inflected: `eis-${p}`, deinflected: 'eis', conditionsIn: [], conditionsOut: []});
}
for (const form of ['hei', 'hás', 'há', 'havemos', 'hemos', 'haveis', 'heis', 'hão']) {
    add('haver-de', {type: 'wholeWord', inflected: `${form}-de`, deinflected: 'haver', conditionsIn: [], conditionsOut: ['v']});
}

// --- Nouns and adjectives ----------------------------------------------------------------
// An accent the base word has on an earlier syllable is lost before -inho,
// -íssimo and -mente (pássaro → passarinho, rápido → rapidíssimo,
// fácil → facilmente). A copy of the rule puts it back on the last vowel
// that has at least two letters after it in the stem.
const ACCENTS = [['a', 'á'], ['a', 'â'], ['e', 'é'], ['e', 'ê'], ['i', 'í'], ['o', 'ó'], ['o', 'ô'], ['u', 'ú']];
function withAccents(write) {
    write({});
    for (const [plain, accented] of ACCENTS) {
        write({stemChange: {from: [plain], to: accented, occurrence: 'last', between: '{letter}', betweenMinLength: 2}});
    }
}
const NA = ['n', 'adj'];

// Plural. Each rule names the vowel or consonant before the ending, so that
// it shares its node with the verb endings (as, es) and comes first there:
// casas → casa before casar.
for (const vowel of ['a', 'e', 'i', 'o', 'u', 'á', 'é', 'ê', 'í', 'ó', 'ô', 'ú', 'ã']) {
    nominal('plural', `${vowel}s`, vowel, [], NA, {stemMinLength: 1});
}
for (const [inflected, deinflected, stemMinLength] of [
    ['ões', 'ão', 1], ['ães', 'ão', 1],                      // leões, pães (mãos is vowel + s)
    ['res', 'r', 1], ['zes', 'z', 1], ['ses', 's', 2],       // flores, luzes, deuses
    ['eses', 'ês', 1], ['ases', 'ás', 1], ['íses', 'ís', 1], // meses, gases, países
    ['ns', 'm', 1], ['éns', 'ém', 1],                        // homens, jardins, armazéns
    ['ais', 'al', 2], ['éis', 'el', 1], ['eis', 'el', 2], ['eis', 'il', 2], ['óis', 'ol', 1], ['uis', 'ul', 1], ['is', 'il', 2],
]) {
    nominal('plural', inflected, deinflected, [], NA, {stemMinLength});
}

// Feminine of adjectives and of nouns for people.
for (const [inflected, deinflected, stemMinLength] of [
    ['a', 'o', 3], ['ora', 'or', 2], ['esa', 'ês', 2], ['ã', 'ão', 2], ['ona', 'ão', 2], ['oa', 'ão', 2], ['eia', 'eu', 2], ['ua', 'u', 1], ['triz', 'tor', 1],
]) {
    nominal('feminine', inflected, deinflected, ['adj'], NA, {stemMinLength});
}
for (const [form, base] of [['boa', 'bom'], ['boas', 'bom'], ['má', 'mau'], ['más', 'mau'], ['judia', 'judeu'], ['judias', 'judeu']]) {
    add('feminine', {type: 'wholeWord', inflected: form, deinflected: base, conditionsIn: ['adj'], conditionsOut: NA});
}

// Diminutives in -inho and -zinho, singular and plural, to the base word.
for (const [inflected, deinflected, stemMinLength, accents] of [
    ['inho', 'o', 2, true], ['inha', 'a', 2, true], ['inhos', 'o', 2, true], ['inhas', 'a', 2, true],
    ['inho', 'e', 2, false], ['inha', 'e', 2, false], ['inhos', 'e', 2, false], ['inhas', 'e', 2, false],
    ['quinho', 'co', 1, false], ['quinha', 'ca', 1, false], ['quinhos', 'co', 1, false], ['quinhas', 'ca', 1, false],
    ['guinho', 'go', 1, false], ['guinha', 'ga', 1, false], ['guinhos', 'go', 1, false], ['guinhas', 'ga', 1, false],
    ['cinho', 'ço', 1, false], ['cinha', 'ça', 1, false], ['cinhos', 'ço', 1, false], ['cinhas', 'ça', 1, false],
    ['zinho', '', 2, true], ['zinha', '', 2, true], ['zinhos', '', 2, true], ['zinhas', '', 2, true],
    ['ezinho', 'é', 1, false], ['ezinho', 'ê', 1, false], ['ezinha', 'é', 1, false], ['ezinha', 'ê', 1, false],
    ['ezinhos', 'é', 1, false], ['ezinhos', 'ê', 1, false], ['ezinhas', 'é', 1, false], ['ezinhas', 'ê', 1, false],
    ['azinho', 'á', 1, false], ['azinha', 'á', 1, false], ['ozinho', 'ô', 1, false], ['ozinha', 'ó', 1, false],
    ['ãezinhos', 'ão', 1, false], ['õezinhos', 'ão', 1, false], ['õezinhas', 'ão', 1, false],
    ['aizinhos', 'al', 1, false], ['aizinhas', 'al', 1, false], ['eizinhos', 'el', 1, false], ['eizinhas', 'el', 1, false],
    ['ezinhos', '', 2, false], ['ezinhas', '', 2, false],
]) {
    const write = (extra) => nominal('diminutive', inflected, deinflected, NA, NA, {stemMinLength, ...extra});
    if (accents) { withAccents(write); } else { write({}); }
}

// Absolute superlatives, every gender and number, to the base adjective.
for (const ending of ['íssimo', 'íssima', 'íssimos', 'íssimas']) {
    const tail = ending.slice('íssim'.length);   // o, a, os, as
    for (const [inflected, deinflected, accents] of [
        [ending, 'o', true], [ending, 'e', false], [ending, '', true],               // lindíssimo, grandíssimo, normalíssimo, facilíssimo
        [`c${ending}`, 'z', false], [`qu${ending}`, 'co', false], [`gu${ending}`, 'go', false], // felicíssimo, riquíssimo, larguíssimo
        [`abil${ending}`, 'ável', false], [`ibil${ending}`, 'ível', false],           // amabilíssimo, possibilíssimo
        [`ílim${tail}`, 'il', true],                                                   // facílimo, dificílimo
    ]) {
        const write = (extra) => nominal('superlative', inflected, deinflected, ['adj'], ['adj'], extra);
        if (accents) { withAccents(write); } else { write({}); }
    }
}
for (const [masculine, base] of [['paupérrimo', 'pobre'], ['celebérrimo', 'célebre'], ['libérrimo', 'livre'], ['misérrimo', 'mísero'],
    ['nigérrimo', 'negro'], ['aspérrimo', 'áspero'], ['macérrimo', 'magro'], ['integérrimo', 'íntegro'], ['salubérrimo', 'salubre'],
    ['ótimo', 'bom'], ['péssimo', 'mau']]) {
    const stem = masculine.slice(0, -1);
    for (const form of [masculine, `${stem}a`, `${stem}os`, `${stem}as`]) {
        add('superlative', {type: 'wholeWord', inflected: form, deinflected: base, conditionsIn: ['adj'], conditionsOut: ['adj']});
    }
}

// Adverbs in -mente: the feminine adjective + mente, so -amente gives the
// masculine (rapidamente → rápido) and -velmente the accented -vel.
withAccents((extra) => nominal('adverb', 'amente', 'o', [], ['adj'], extra));
withAccents((extra) => nominal('adverb', 'mente', '', [], ['adj'], {stemMinLength: 3, stemNotEndsWith: '[a]', ...extra}));
for (const [inflected, deinflected] of [['avelmente', 'ável'], ['ivelmente', 'ível'], ['ovelmente', 'óvel'], ['uvelmente', 'úvel'],
    ['istamente', 'ista'], ['ãmente', 'ão']]) {
    nominal('adverb', inflected, deinflected, [], ['adj'], {stemMinLength: 1});
}

// --- Exclusions ---------------------------------------------------------------------------
// esta, estas, este and estes are demonstratives, not forms of estar (whose
// forms are está, estás, esteja): the regular -ar endings a, as, e and es
// leave out the stem est itself and keep longer ones (estuda, estime).
for (const t of transforms) {
    const twins = [];
    for (const rule of t.rules) {
        if (rule.type === 'suffix' && rule.deinflected === 'ar' && ['a', 'as', 'e', 'es'].includes(rule.inflected) && rule.stemChange === undefined) {
            rule.stemNotStartsWithText = 'est';
            const {stemNotStartsWithText: _drop, ...rest} = rule;
            twins.push({...rest, stemStartsWithText: 'est', stemMinLength: 4});
        }
    }
    t.rules.push(...twins);
}

// --- Output --------------------------------------------------------------------------------
const out = {schema: 1, conditions, transforms: transforms.filter((t) => t.rules.length > 0)};
const file = join(here, 'own.json');
writeFileSync(file, formatTransforms(out));
const rules = out.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`pt: ${out.transforms.length} transforms, ${rules} rules in ${file}`);
