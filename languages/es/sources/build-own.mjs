#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/es/sources/own.json: the Spanish deinflection rules written
// for this pack (docs/languages.md, section 14 step 2), from the paradigm
// tables below. Run from the repository root:
//
//   node languages/es/sources/build-own.mjs
//
// The tables follow the standard description of Spanish inflection (RAE,
// Nueva gramática de la lengua española and Ortografía de la lengua
// española, 2010; Wiktionary's Spanish conjugation tables): three
// conjugations with their spelling changes before e (-car, -gar, -zar,
// -guar) and before a/o (-cer, -cir, -ger, -gir, -guir, -quir, -zc-), the
// stem changes ie/ue/i (and jugar, oler, avergonzar, adquirir), accented
// í/ú stems (enviar, continuar, prohibir, reunir), the -uir, -eer/-aer,
// -oír, -eír, -ñir/-llir patterns, the irregular verbs, voseo, enclitic
// pronouns, pronominal (-se) verbs, and plural, gender, superlative,
// diminutive and -mente forms of nouns and adjectives.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// --- Conditions ---------------------------------------------------------------
// v, n, ns, np and adj are the part-of-speech tags Spanish Yomitan
// dictionaries put in their `rules` column (wiktionary-to-yomitan writes
// exactly these). imp and ger are intermediate states: an affirmative
// imperative or a gerund whose attached pronouns were removed. No dictionary
// term carries them, so a text with only these conditions never matches.
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['ns', 'np']},
    ns: {name: 'Noun, singular', isDictionaryForm: true},
    np: {name: 'Noun, plural', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    imp: {name: 'Imperative without its pronouns', isDictionaryForm: false},
    ger: {name: 'Gerund without its pronouns', isDictionaryForm: false},
};

const LETTER = '{letter}';
const CONSONANT_OR_U = '[bcdfghjklmnñpqrstvwxyzu]';
const STRIP_ACUTE = [{normalize: 'NFD'}, {strip: '[\\u0301]'}, {normalize: 'NFC'}];

// --- Transforms -------------------------------------------------------------------
const transforms = [];
const byId = new Map();
const seen = new Set();  // identical rules are written once, in the first transform that has them

function transform(id, name, description) {
    if (byId.has(id)) { return byId.get(id); }
    const t = {id, name, description, source: 'own', rules: []};
    transforms.push(t);
    byId.set(id, t);
    return t;
}

function add(id, rule) {
    const t = byId.get(id);
    if (t === undefined) { throw new Error(`no transform ${id}`); }
    const key = JSON.stringify(rule);
    if (seen.has(key)) { return; }
    seen.add(key);
    t.rules.push(rule);
}

function suffix(id, inflected, deinflected, conditionsIn, conditionsOut, extra = {}) {
    add(id, {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, ...extra});
}

// --- Verb slots ------------------------------------------------------------------------
// Each slot is one transform: tense and person. Persons whose forms are the
// same in every conjugation share a slot (yo/él in the imperfect,
// conditional and subjunctives).
const P = {yo: 'yo', tu: 'tú', el: 'él', nosotros: 'nosotros', vosotros: 'vosotros', ellos: 'ellos', vos: 'vos', yoel: 'yo/él'};
const PERSON_TEXT = {
    yo: 'first person singular (yo)',
    tu: 'second person singular (tú)',
    el: 'third person singular (él, ella, usted)',
    nosotros: 'first person plural (nosotros)',
    vosotros: 'second person plural (vosotros)',
    ellos: 'third person plural (ellos, ellas, ustedes)',
    vos: 'second person singular with voseo (vos)',
    yoel: 'first and third person singular (yo, él, ella, usted)',
};
const TENSES = [
    ['present', 'present', 'Present indicative', ['yo', 'tu', 'el', 'nosotros', 'vosotros', 'ellos', 'vos'], 'hablo, comes, vive'],
    ['preterite', 'preterite', 'Preterite (pretérito perfecto simple)', ['yo', 'tu', 'el', 'nosotros', 'vosotros', 'ellos'], 'hablé, comiste, vivió'],
    ['imperfect', 'imperfect', 'Imperfect indicative (pretérito imperfecto)', ['yoel', 'tu', 'nosotros', 'vosotros', 'ellos'], 'hablaba, comías, vivíamos'],
    ['future', 'future', 'Future indicative', ['yo', 'tu', 'el', 'nosotros', 'vosotros', 'ellos'], 'hablaré, comerás, vivirá'],
    ['conditional', 'conditional', 'Conditional', ['yoel', 'tu', 'nosotros', 'vosotros', 'ellos'], 'hablaría, comerías, viviríamos'],
    ['subjunctive', 'present subjunctive', 'Present subjunctive', ['yoel', 'tu', 'nosotros', 'vosotros', 'ellos', 'vos'], 'hable, comas, vivamos'],
    ['subjunctive-ra', 'imperfect subjunctive', 'Imperfect subjunctive in -ra', ['yoel', 'tu', 'nosotros', 'vosotros', 'ellos'], 'hablara, comieras, viviéramos'],
    ['subjunctive-se', 'imperfect subjunctive (-se)', 'Imperfect subjunctive in -se', ['yoel', 'tu', 'nosotros', 'vosotros', 'ellos'], 'hablase, comieses, viviésemos'],
    ['subjunctive-future', 'future subjunctive', 'Future subjunctive (archaic and legal language)', ['yoel', 'tu', 'nosotros', 'vosotros', 'ellos'], 'hablare, comieres, viviéremos'],
];
const IMPERATIVES = [
    ['tu', 'tú', 'Affirmative imperative, tú', 'habla, come, vive'],
    ['vos', 'vos', 'Affirmative imperative, vos (voseo)', 'hablá, comé, viví'],
    ['vosotros', 'vosotros', 'Affirmative imperative, vosotros', 'hablad, comed, vivid'],
    ['usted', 'usted', 'Imperative, usted (the present subjunctive form)', 'hable, coma, viva'],
    ['ustedes', 'ustedes', 'Imperative, ustedes (the present subjunctive form)', 'hablen, coman, vivan'],
    ['nosotros', 'nosotros', 'Imperative, nosotros (the present subjunctive form)', 'hablemos, comamos, vivamos'],
];

for (const [id, name, text, persons, examples] of TENSES) {
    for (const person of persons) {
        const slot = person === 'yoel' ? `${id}-yo-el` : `${id}-${person}`;
        transform(slot, `${name} (${P[person]})`, `${text}, ${PERSON_TEXT[person]}: ${examples}.`);
    }
}
for (const [person, label, text, examples] of IMPERATIVES) {
    transform(`imperative-${person}`, `imperative (${label})`, `${text}: ${examples}.`);
}
transform('gerund', 'gerund', 'Gerund: hablando, comiendo, viviendo.');
transform('participle', 'past participle', 'Past participle, masculine or feminine, singular or plural: hablado, comida, vividos, abiertas.');

// Regular endings of the three conjugations, by slot.
const ENDINGS = {
    ar: {
        'present-yo': 'o', 'present-tu': 'as', 'present-el': 'a', 'present-nosotros': 'amos', 'present-vosotros': 'áis', 'present-ellos': 'an', 'present-vos': 'ás',
        'preterite-yo': 'é', 'preterite-tu': 'aste', 'preterite-el': 'ó', 'preterite-nosotros': 'amos', 'preterite-vosotros': 'asteis', 'preterite-ellos': 'aron',
        'imperfect-yo-el': 'aba', 'imperfect-tu': 'abas', 'imperfect-nosotros': 'ábamos', 'imperfect-vosotros': 'abais', 'imperfect-ellos': 'aban',
        'future-yo': 'aré', 'future-tu': 'arás', 'future-el': 'ará', 'future-nosotros': 'aremos', 'future-vosotros': 'aréis', 'future-ellos': 'arán',
        'conditional-yo-el': 'aría', 'conditional-tu': 'arías', 'conditional-nosotros': 'aríamos', 'conditional-vosotros': 'aríais', 'conditional-ellos': 'arían',
        'subjunctive-yo-el': 'e', 'subjunctive-tu': 'es', 'subjunctive-nosotros': 'emos', 'subjunctive-vosotros': 'éis', 'subjunctive-ellos': 'en', 'subjunctive-vos': 'és',
        'subjunctive-ra-yo-el': 'ara', 'subjunctive-ra-tu': 'aras', 'subjunctive-ra-nosotros': 'áramos', 'subjunctive-ra-vosotros': 'arais', 'subjunctive-ra-ellos': 'aran',
        'subjunctive-se-yo-el': 'ase', 'subjunctive-se-tu': 'ases', 'subjunctive-se-nosotros': 'ásemos', 'subjunctive-se-vosotros': 'aseis', 'subjunctive-se-ellos': 'asen',
        'subjunctive-future-yo-el': 'are', 'subjunctive-future-tu': 'ares', 'subjunctive-future-nosotros': 'áremos', 'subjunctive-future-vosotros': 'areis', 'subjunctive-future-ellos': 'aren',
        'imperative-tu': 'a', 'imperative-vos': 'á', 'imperative-vosotros': 'ad', 'imperative-usted': 'e', 'imperative-ustedes': 'en', 'imperative-nosotros': 'emos',
        'gerund': 'ando',
        'participle': ['ado', 'ada', 'ados', 'adas'],
    },
    er: {
        'present-yo': 'o', 'present-tu': 'es', 'present-el': 'e', 'present-nosotros': 'emos', 'present-vosotros': 'éis', 'present-ellos': 'en', 'present-vos': 'és',
        'preterite-yo': 'í', 'preterite-tu': 'iste', 'preterite-el': 'ió', 'preterite-nosotros': 'imos', 'preterite-vosotros': 'isteis', 'preterite-ellos': 'ieron',
        'imperfect-yo-el': 'ía', 'imperfect-tu': 'ías', 'imperfect-nosotros': 'íamos', 'imperfect-vosotros': 'íais', 'imperfect-ellos': 'ían',
        'future-yo': 'eré', 'future-tu': 'erás', 'future-el': 'erá', 'future-nosotros': 'eremos', 'future-vosotros': 'eréis', 'future-ellos': 'erán',
        'conditional-yo-el': 'ería', 'conditional-tu': 'erías', 'conditional-nosotros': 'eríamos', 'conditional-vosotros': 'eríais', 'conditional-ellos': 'erían',
        'subjunctive-yo-el': 'a', 'subjunctive-tu': 'as', 'subjunctive-nosotros': 'amos', 'subjunctive-vosotros': 'áis', 'subjunctive-ellos': 'an', 'subjunctive-vos': 'ás',
        'subjunctive-ra-yo-el': 'iera', 'subjunctive-ra-tu': 'ieras', 'subjunctive-ra-nosotros': 'iéramos', 'subjunctive-ra-vosotros': 'ierais', 'subjunctive-ra-ellos': 'ieran',
        'subjunctive-se-yo-el': 'iese', 'subjunctive-se-tu': 'ieses', 'subjunctive-se-nosotros': 'iésemos', 'subjunctive-se-vosotros': 'ieseis', 'subjunctive-se-ellos': 'iesen',
        'subjunctive-future-yo-el': 'iere', 'subjunctive-future-tu': 'ieres', 'subjunctive-future-nosotros': 'iéremos', 'subjunctive-future-vosotros': 'iereis', 'subjunctive-future-ellos': 'ieren',
        'imperative-tu': 'e', 'imperative-vos': 'é', 'imperative-vosotros': 'ed', 'imperative-usted': 'a', 'imperative-ustedes': 'an', 'imperative-nosotros': 'amos',
        'gerund': 'iendo',
        'participle': ['ido', 'ida', 'idos', 'idas'],
    },
};
ENDINGS.ir = {
    ...ENDINGS.er,
    'present-nosotros': 'imos', 'present-vosotros': 'ís', 'present-vos': 'ís',
    'future-yo': 'iré', 'future-tu': 'irás', 'future-el': 'irá', 'future-nosotros': 'iremos', 'future-vosotros': 'iréis', 'future-ellos': 'irán',
    'conditional-yo-el': 'iría', 'conditional-tu': 'irías', 'conditional-nosotros': 'iríamos', 'conditional-vosotros': 'iríais', 'conditional-ellos': 'irían',
    'imperative-vos': 'í', 'imperative-vosotros': 'id',
};

// Slots where the stem is stressed and takes its stem change (pienso,
// cuento, pido), and -ir slots with the weak change e→i, o→u (sintió,
// durmamos, pidiendo).
const STRESSED = new Set(['present-yo', 'present-tu', 'present-el', 'present-ellos', 'subjunctive-yo-el', 'subjunctive-tu', 'subjunctive-ellos',
    'imperative-tu', 'imperative-usted', 'imperative-ustedes']);
const WEAK_IR = new Set(['preterite-el', 'preterite-ellos', 'subjunctive-nosotros', 'subjunctive-vosotros', 'subjunctive-vos', 'imperative-nosotros', 'gerund']);
for (const tense of ['subjunctive-ra', 'subjunctive-se', 'subjunctive-future']) {
    for (const person of ['yo-el', 'tu', 'nosotros', 'vosotros', 'ellos']) { WEAK_IR.add(`${tense}-${person}`); }
}

const change = (from, to) => ({from: [from], to, occurrence: 'last', between: CONSONANT_OR_U, betweenMinLength: 0});
const CHANGES = {
    ar: {stressed: [change('ie', 'e'), change('ue', 'o'), change('jue', 'ju'), change('üe', 'o'), change('í', 'i'), change('ú', 'u')], weak: []},
    er: {stressed: [change('ie', 'e'), change('ue', 'o'), change('hue', 'o')], weak: []},
    ir: {stressed: [change('ie', 'e'), change('ue', 'o'), change('i', 'e'), change('ie', 'i'), change('í', 'i'), change('ú', 'u')], weak: [change('i', 'e'), change('u', 'o')]},
};

// Spelling changes that keep a consonant's sound: before e for -ar verbs
// (busqué, pague, empiece, averigüe), before a and o for -er and -ir verbs
// (venzo, conozco, cojo, dirija, sigo, delinco).
const SPELLING = {
    ar: [['qu', 'c'], ['gu', 'g'], ['c', 'z'], ['gü', 'gu']],
    er: [['z', 'c'], ['zc', 'c'], ['j', 'g']],
    ir: [['z', 'c'], ['zc', 'c'], ['j', 'g'], ['g', 'gu'], ['c', 'qu']],
};
const before = {ar: /^[eé]/u, er: /^[aoá]/u, ir: /^[aoá]/u};

function inFor(slot) {
    if (slot.startsWith('imperative-')) { return ['imp']; }
    if (slot === 'gerund') { return ['ger']; }
    return [];
}

function verbRule(slot, inflected, deinflected, extra = {}) {
    suffix(slot, inflected, deinflected, inFor(slot), ['v'], extra);
}

for (const conj of ['ar', 'er', 'ir']) {
    for (const [slot, value] of Object.entries(ENDINGS[conj])) {
        const endings = Array.isArray(value) ? value : [value];
        const changes = [
            ...(STRESSED.has(slot) ? CHANGES[conj].stressed : []),
            ...(WEAK_IR.has(slot) ? CHANGES[conj].weak : []),
        ];
        for (const ending of endings) {
            // A one-letter stem is enough except for -ar "e" (hable), which
            // would read de, le, me, se and te as verbs.
            const stemMinLength = conj === 'ar' && ending === 'e' ? 2 : 1;
            const forms = [[ending, conj]];
            if (before[conj].test(ending)) {
                for (const [inflectedConsonant, lemmaConsonant] of SPELLING[conj]) {
                    forms.push([inflectedConsonant + ending, lemmaConsonant + conj]);
                }
            }
            for (const [inflected, deinflected] of forms) {
                verbRule(slot, inflected, deinflected, {stemMinLength});
                for (const stemChange of changes) {
                    verbRule(slot, inflected, deinflected, {stemMinLength, stemChange});
                }
            }
        }
    }
}

// Future and conditional attach to the infinitive, which needs no stem.
for (const conj of ['ar', 'er', 'ir']) {
    for (const slot of Object.keys(ENDINGS[conj])) {
        if (!slot.startsWith('future-') && !slot.startsWith('conditional-')) { continue; }
        verbRule(slot, ENDINGS[conj][slot], conj);
    }
}

// --- Verb classes with their own endings ---------------------------------------------
// Imperfect and future subjunctive endings on a preterite stem; `i` is "i"
// or "" (after j, ñ, ll and y).
function pastSubjunctive(stem, i) {
    const s = stem + i;
    return {
        'subjunctive-ra-yo-el': s + 'era', 'subjunctive-ra-tu': s + 'eras', 'subjunctive-ra-nosotros': s + 'éramos', 'subjunctive-ra-vosotros': s + 'erais', 'subjunctive-ra-ellos': s + 'eran',
        'subjunctive-se-yo-el': s + 'ese', 'subjunctive-se-tu': s + 'eses', 'subjunctive-se-nosotros': s + 'ésemos', 'subjunctive-se-vosotros': s + 'eseis', 'subjunctive-se-ellos': s + 'esen',
        'subjunctive-future-yo-el': s + 'ere', 'subjunctive-future-tu': s + 'eres', 'subjunctive-future-nosotros': s + 'éremos', 'subjunctive-future-vosotros': s + 'ereis', 'subjunctive-future-ellos': s + 'eren',
    };
}

function paradigm(table, deinflected, extra = {}) {
    for (const [slot, value] of Object.entries(table)) {
        for (const inflected of Array.isArray(value) ? value : [value]) {
            verbRule(slot, inflected, deinflected, extra);
        }
    }
}

// -uir (not -guir, -quir): y before a, e, o (construyo, construyó, construyendo).
const UY = {
    'present-yo': 'uyo', 'present-tu': 'uyes', 'present-el': 'uye', 'present-ellos': 'uyen',
    'subjunctive-yo-el': 'uya', 'subjunctive-tu': 'uyas', 'subjunctive-nosotros': 'uyamos', 'subjunctive-vosotros': 'uyáis', 'subjunctive-ellos': 'uyan', 'subjunctive-vos': 'uyás',
    'preterite-el': 'uyó', 'preterite-ellos': 'uyeron',
    ...pastSubjunctive('uy', ''),
    'imperative-tu': 'uye', 'imperative-usted': 'uya', 'imperative-ustedes': 'uyan', 'imperative-nosotros': 'uyamos',
    'gerund': 'uyendo',
};
paradigm(UY, 'uir', {stemMinLength: 1});
// argüir, redargüir: arguyo, arguyó.
paradigm(UY, 'üir', {stemMinLength: 1, stemEndsWith: '[g]'});


// -eer, -aer, -oer: y between vowels (leyó, cayeron, leyendo) and í after a
// vowel (leíste, caímos, leído).
paradigm({
    'preterite-tu': 'íste', 'preterite-el': 'yó', 'preterite-nosotros': 'ímos', 'preterite-vosotros': 'ísteis', 'preterite-ellos': 'yeron',
    ...pastSubjunctive('y', ''),
    'gerund': 'yendo',
    'participle': ['ído', 'ída', 'ídos', 'ídas'],
}, 'er', {stemMinLength: 1, stemEndsWith: '[aeo]'});

// oír, desoír, entreoír.
paradigm({
    'present-yo': 'oigo', 'present-tu': 'oyes', 'present-el': 'oye', 'present-nosotros': 'oímos', 'present-vosotros': 'oís', 'present-ellos': 'oyen', 'present-vos': 'oís',
    'preterite-yo': 'oí', 'preterite-tu': 'oíste', 'preterite-el': 'oyó', 'preterite-nosotros': 'oímos', 'preterite-vosotros': 'oísteis', 'preterite-ellos': 'oyeron',
    'imperfect-yo-el': 'oía', 'imperfect-tu': 'oías', 'imperfect-nosotros': 'oíamos', 'imperfect-vosotros': 'oíais', 'imperfect-ellos': 'oían',
    'future-yo': 'oiré', 'future-tu': 'oirás', 'future-el': 'oirá', 'future-nosotros': 'oiremos', 'future-vosotros': 'oiréis', 'future-ellos': 'oirán',
    'conditional-yo-el': 'oiría', 'conditional-tu': 'oirías', 'conditional-nosotros': 'oiríamos', 'conditional-vosotros': 'oiríais', 'conditional-ellos': 'oirían',
    'subjunctive-yo-el': 'oiga', 'subjunctive-tu': 'oigas', 'subjunctive-nosotros': 'oigamos', 'subjunctive-vosotros': 'oigáis', 'subjunctive-ellos': 'oigan', 'subjunctive-vos': 'oigás',
    ...pastSubjunctive('oy', ''),
    'imperative-tu': 'oye', 'imperative-vos': 'oí', 'imperative-vosotros': 'oíd', 'imperative-usted': 'oiga', 'imperative-ustedes': 'oigan', 'imperative-nosotros': 'oigamos',
    'gerund': 'oyendo',
    'participle': ['oído', 'oída', 'oídos', 'oídas'],
}, 'oír');

// reír, sonreír, freír, desleír: the stem before -eír is r, sonr, fr, desl.
paradigm({
    'present-yo': 'ío', 'present-tu': 'íes', 'present-el': 'íe', 'present-nosotros': 'eímos', 'present-vosotros': 'eís', 'present-ellos': 'íen', 'present-vos': 'eís',
    'preterite-yo': 'eí', 'preterite-tu': 'eíste', 'preterite-el': ['io', 'ió'], 'preterite-nosotros': 'eímos', 'preterite-vosotros': 'eísteis', 'preterite-ellos': 'ieron',
    'imperfect-yo-el': 'eía', 'imperfect-tu': 'eías', 'imperfect-nosotros': 'eíamos', 'imperfect-vosotros': 'eíais', 'imperfect-ellos': 'eían',
    'future-yo': 'eiré', 'future-tu': 'eirás', 'future-el': 'eirá', 'future-nosotros': 'eiremos', 'future-vosotros': 'eiréis', 'future-ellos': 'eirán',
    'conditional-yo-el': 'eiría', 'conditional-tu': 'eirías', 'conditional-nosotros': 'eiríamos', 'conditional-vosotros': 'eiríais', 'conditional-ellos': 'eirían',
    'subjunctive-yo-el': 'ía', 'subjunctive-tu': 'ías', 'subjunctive-nosotros': 'iamos', 'subjunctive-vosotros': 'iáis', 'subjunctive-ellos': 'ían', 'subjunctive-vos': 'iás',
    ...pastSubjunctive('', 'i'),
    'imperative-tu': 'íe', 'imperative-vos': 'eí', 'imperative-vosotros': 'eíd', 'imperative-usted': 'ía', 'imperative-ustedes': 'ían', 'imperative-nosotros': 'iamos',
    'gerund': 'iendo',
    'participle': ['eído', 'eída', 'eídos', 'eídas'],
}, 'eír', {stemMinLength: 1, stemEndsWith: '[rl]'});

// After pronouns the imperative's accent is removed (oídme → oid, ríete →
// rie), but these keep it; the bare imperative reads both spellings.
paradigm({'imperative-vos': 'oi', 'imperative-vosotros': 'oid'}, 'oír');
paradigm({'imperative-tu': 'ie', 'imperative-vos': 'ei', 'imperative-vosotros': 'eid', 'imperative-usted': 'ia', 'imperative-ustedes': 'ian'}, 'eír', {stemMinLength: 1, stemEndsWith: '[rl]'});

// -ñir, -ñer, -llir: no i after ñ and ll (riñó, tañeron, bullendo), with
// reñir's e→i.
for (const [consonant, lemmas] of [['ñ', ['ñir', 'ñer']], ['ll', ['llir']]]) {
    const table = {
        'preterite-el': consonant + 'ó', 'preterite-ellos': consonant + 'eron',
        ...pastSubjunctive(consonant, ''),
        'gerund': consonant + 'endo',
    };
    for (const lemma of lemmas) {
        paradigm(table, lemma, {stemMinLength: 1});
        if (lemma === 'ñir') { paradigm(table, lemma, {stemMinLength: 1, stemChange: change('i', 'e')}); }
    }
}

// --- Irregular verbs --------------------------------------------------------------------
// Strong preterites: their stems also make the imperfect and future
// subjunctive. Suffix rules, so compounds follow (mantuve, propuse,
// convine, deshice, predije, atraje, conduje).
const STRONG = [
    ['anduv', 'andar'], ['estuv', 'estar'], ['tuv', 'tener'], ['hub', 'haber'], ['pud', 'poder'], ['pus', 'poner'],
    ['sup', 'saber'], ['cup', 'caber'], ['quis', 'querer'], ['vin', 'venir'], ['hic', 'hacer'], ['fic', 'facer'],
    ['dij', 'decir'], ['traj', 'traer'], ['duj', 'ducir'],
];
for (const [stem, lemma] of STRONG) {
    const j = stem.endsWith('j');
    const i = j ? '' : 'i';
    paradigm({
        'preterite-yo': stem + 'e', 'preterite-tu': stem + 'iste', 'preterite-el': stem === 'hic' ? 'hizo' : stem === 'fic' ? 'fizo' : stem + 'o',
        'preterite-nosotros': stem + 'imos', 'preterite-vosotros': stem + 'isteis', 'preterite-ellos': stem + i + 'eron',
        ...pastSubjunctive(stem, i),
    }, lemma);
}

// Irregular future and conditional stems.
const FUTURE_STEMS = [
    ['tendr', 'tener'], ['pondr', 'poner'], ['saldr', 'salir'], ['vendr', 'venir'], ['valdr', 'valer'], ['podr', 'poder'],
    ['querr', 'querer'], ['sabr', 'saber'], ['cabr', 'caber'], ['habr', 'haber'], ['har', 'hacer'], ['far', 'facer'], ['dir', 'decir'],
];
for (const [stem, lemma] of FUTURE_STEMS) {
    paradigm({
        'future-yo': stem + 'é', 'future-tu': stem + 'ás', 'future-el': stem + 'á', 'future-nosotros': stem + 'emos', 'future-vosotros': stem + 'éis', 'future-ellos': stem + 'án',
        'conditional-yo-el': stem + 'ía', 'conditional-tu': stem + 'ías', 'conditional-nosotros': stem + 'íamos', 'conditional-vosotros': stem + 'íais', 'conditional-ellos': stem + 'ían',
    }, lemma);
}

// Present stems of the first person singular, which the present
// subjunctive and the usted, ustedes and nosotros imperatives share.
const YO_STEMS = [
    ['teng', 'tener'], ['veng', 'venir'], ['pong', 'poner'], ['salg', 'salir'], ['valg', 'valer'], ['hag', 'hacer'], ['fag', 'facer'],
    ['dig', 'decir'], ['traig', 'traer'], ['caig', 'caer'], ['asg', 'asir'],
];
function presentSubjunctive(stem) {
    return {
        'subjunctive-yo-el': stem + 'a', 'subjunctive-tu': stem + 'as', 'subjunctive-nosotros': stem + 'amos', 'subjunctive-vosotros': stem + 'áis', 'subjunctive-ellos': stem + 'an', 'subjunctive-vos': stem + 'ás',
        'imperative-usted': stem + 'a', 'imperative-ustedes': stem + 'an', 'imperative-nosotros': stem + 'amos',
    };
}
for (const [stem, lemma] of YO_STEMS) {
    paradigm({'present-yo': stem + 'o', ...presentSubjunctive(stem)}, lemma);
}

// errar: ye- where the stem is stressed (yerro, yerran, yerre).
paradigm({'present-yo': 'yerro', 'present-tu': 'yerras', 'present-el': 'yerra', 'present-ellos': 'yerran',
    'subjunctive-yo-el': 'yerre', 'subjunctive-tu': 'yerres', 'subjunctive-ellos': 'yerren',
    'imperative-tu': 'yerra', 'imperative-usted': 'yerre', 'imperative-ustedes': 'yerren'}, 'errar', {stemNotEndsWith: LETTER});

// Irregular tú imperatives; the compounds of tener, poner and venir write
// an accent (detén, compón, prevén).
paradigm({'imperative-tu': ['ten', 'tén']}, 'tener');
paradigm({'imperative-tu': ['pon', 'pón']}, 'poner');
paradigm({'imperative-tu': ['ven', 'vén']}, 'venir');
paradigm({'imperative-tu': 'sal'}, 'salir');
paradigm({'imperative-tu': 'haz'}, 'hacer');
paradigm({'imperative-tu': 'faz'}, 'facer');
paradigm({'gerund': 'pudiendo'}, 'poder');

// Forms of ser, ir, estar, haber, dar, ver, saber, caber and decir that only
// stand alone or after a pronoun (se va, me di): the stem is empty or ends
// in a space.
const WHOLE = {stemNotEndsWith: LETTER};
const fuiSeries = {
    'preterite-yo': 'fui', 'preterite-tu': 'fuiste', 'preterite-el': 'fue', 'preterite-nosotros': 'fuimos', 'preterite-vosotros': 'fuisteis', 'preterite-ellos': 'fueron',
    ...pastSubjunctive('fu', ''),
};
paradigm({
    'present-yo': 'soy', 'present-tu': 'eres', 'present-el': 'es', 'present-nosotros': 'somos', 'present-vosotros': 'sois', 'present-ellos': 'son', 'present-vos': 'sos',
    'imperfect-yo-el': 'era', 'imperfect-tu': 'eras', 'imperfect-nosotros': 'éramos', 'imperfect-vosotros': 'erais', 'imperfect-ellos': 'eran',
    ...fuiSeries,
    'subjunctive-yo-el': 'sea', 'subjunctive-tu': 'seas', 'subjunctive-nosotros': 'seamos', 'subjunctive-vosotros': 'seáis', 'subjunctive-ellos': 'sean', 'subjunctive-vos': 'seás',
    'imperative-tu': 'sé', 'imperative-vosotros': 'sed', 'imperative-usted': 'sea', 'imperative-ustedes': 'sean', 'imperative-nosotros': 'seamos',
}, 'ser', WHOLE);
paradigm({
    'present-yo': 'voy', 'present-tu': 'vas', 'present-el': 'va', 'present-nosotros': 'vamos', 'present-vosotros': 'vais', 'present-ellos': 'van', 'present-vos': 'vas',
    'imperfect-yo-el': 'iba', 'imperfect-tu': 'ibas', 'imperfect-nosotros': 'íbamos', 'imperfect-vosotros': 'ibais', 'imperfect-ellos': 'iban',
    ...fuiSeries,
    'future-yo': 'iré', 'future-tu': 'irás', 'future-el': 'irá', 'future-nosotros': 'iremos', 'future-vosotros': 'iréis', 'future-ellos': 'irán',
    'conditional-yo-el': 'iría', 'conditional-tu': 'irías', 'conditional-nosotros': 'iríamos', 'conditional-vosotros': 'iríais', 'conditional-ellos': 'irían',
    'subjunctive-yo-el': 'vaya', 'subjunctive-tu': 'vayas', 'subjunctive-nosotros': 'vayamos', 'subjunctive-vosotros': 'vayáis', 'subjunctive-ellos': 'vayan', 'subjunctive-vos': 'vayás',
    'imperative-tu': 've', 'imperative-vosotros': 'id', 'imperative-usted': 'vaya', 'imperative-ustedes': 'vayan', 'imperative-nosotros': ['vamos', 'vayamos'],
    'gerund': 'yendo',
    'participle': ['ido', 'ida', 'idos', 'idas'],
}, 'ir', WHOLE);
paradigm({
    'present-yo': 'estoy', 'present-el': 'está', 'present-ellos': 'están',
    'subjunctive-yo-el': 'esté', 'subjunctive-tu': 'estés', 'subjunctive-ellos': 'estén',
    'imperative-tu': 'está', 'imperative-usted': 'esté', 'imperative-ustedes': 'estén',
}, 'estar', WHOLE);
paradigm({
    'present-yo': 'he', 'present-tu': 'has', 'present-el': ['ha', 'hay'], 'present-nosotros': 'hemos', 'present-ellos': 'han', 'present-vos': 'has',
    'subjunctive-yo-el': 'haya', 'subjunctive-tu': 'hayas', 'subjunctive-nosotros': 'hayamos', 'subjunctive-vosotros': 'hayáis', 'subjunctive-ellos': 'hayan', 'subjunctive-vos': 'hayás',
}, 'haber', WHOLE);
paradigm({
    'present-yo': 'doy', 'present-vosotros': 'dais',
    'preterite-yo': 'di', 'preterite-tu': 'diste', 'preterite-el': 'dio', 'preterite-nosotros': 'dimos', 'preterite-vosotros': 'disteis', 'preterite-ellos': 'dieron',
    ...pastSubjunctive('d', 'i'),
    'subjunctive-yo-el': 'dé', 'subjunctive-vosotros': 'deis', 'imperative-usted': 'dé',
}, 'dar', WHOLE);
paradigm({'present-vosotros': 'veis', 'preterite-yo': 'vi', 'preterite-el': 'vio'}, 'ver', WHOLE);
// ver and its compounds (prever, entrever): the e of the stem stays (veo, vea, veía).
paradigm({'present-yo': 'veo', ...presentSubjunctive('ve'),
    'imperfect-yo-el': 'veía', 'imperfect-tu': 'veías', 'imperfect-nosotros': 'veíamos', 'imperfect-vosotros': 'veíais', 'imperfect-ellos': 'veían'}, 'ver');
paradigm({'present-yo': 'sé', ...presentSubjunctive('sep')}, 'saber', WHOLE);
paradigm({'present-yo': 'quepo', ...presentSubjunctive('quep')}, 'caber', WHOLE);
paradigm({'imperative-tu': 'di'}, 'decir', WHOLE);

// Irregular past participles (with their feminine and plural forms).
const PARTICIPLES = [
    ['bierto', 'brir'], ['muerto', 'morir'], ['uelto', 'olver'], ['puesto', 'poner'], ['visto', 'ver'], ['scrito', 'scribir'],
    ['hecho', 'hacer'], ['fecho', 'facer'], ['dicho', 'decir'], ['roto', 'romper'], ['frito', 'freír'], ['impreso', 'imprimir'], ['provisto', 'proveer'],
];
for (const [form, lemma] of PARTICIPLES) {
    const stem = form.slice(0, -1);
    paradigm({participle: [stem + 'o', stem + 'a', stem + 'os', stem + 'as']}, lemma);
}

// --- Enclitic pronouns ---------------------------------------------------------------
// Pronouns written after an infinitive, a gerund or an affirmative
// imperative (hacerlo, diciéndome, dámelo). One transform per cluster. The
// written accent that the pronouns add is removed again (dámelo → da,
// comiéndolo → comiendo). Clusters that start with a reflexive pronoun
// also give the -se verb (acuérdate → acordarse, sentándome → sentarse).
const SINGLE = ['me', 'te', 'se', 'nos', 'os', 'lo', 'la', 'los', 'las', 'le', 'les'];
const REFLEXIVE = ['me', 'te', 'se', 'nos', 'os'];
const OBJECT = ['lo', 'la', 'los', 'las', 'le', 'les'];
const CLUSTERS = [
    ...SINGLE.map((p) => [p]),
    ...REFLEXIVE.flatMap((p) => OBJECT.map((o) => [p, o])),
    ...['me', 'te', 'nos', 'os', 'le', 'les'].map((o) => ['se', o]),
    ['te', 'me'], ['te', 'nos'], ['os', 'me'], ['os', 'nos'],
];
const IMPERATIVE_END = '[aeiouáéíóúdnszl]';
for (const pronouns of CLUSTERS) {
    const cluster = pronouns.join('');
    const id = `clitic-${cluster}`;
    const two = pronouns.length === 2;
    const first = pronouns[0];
    const reflexive = REFLEXIVE.includes(first);
    transform(id, pronouns.map((p) => `+${p}`).join(' '),
        `${two ? 'The pronouns' : 'The pronoun'} ${pronouns.join(' and ')} attached to an infinitive, a gerund or an affirmative imperative.`);
    // Infinitive: no accent with one pronoun (hacerlo, oírte), an accent on
    // the ending with two (hacérselo, decírmelo).
    const infinitives = two ? [['ár', 'ar'], ['ér', 'er'], ['ír', 'ir'], ['ír', 'ír']] : [['ar', 'ar'], ['er', 'er'], ['ir', 'ir'], ['ír', 'ír']];
    for (const [ending, lemma] of infinitives) {
        suffix(id, ending + cluster, lemma, [], ['v']);
        if (reflexive && (two || first !== 'se')) { suffix(id, ending + cluster, lemma + 'se', [], ['v']); }
    }
    // Gerund: always accented with a pronoun (haciéndolo, yéndose, riñéndole).
    for (const [ending, bare] of [['ándo', 'ando'], ['éndo', 'endo']]) {
        suffix(id, ending + cluster, bare, [], ['ger']);
        if (reflexive) {
            add(id, {type: 'circumfix', inflectedPrefix: '', deinflectedPrefix: first + ' ', inflectedSuffix: ending + cluster, deinflectedSuffix: bare,
                conditionsIn: [], conditionsOut: ['ger']});
        }
    }
    // Imperative. A lone os follows only the vosotros and nosotros forms,
    // whose d and s drop before it (sentaos, sentémoos; idos keeps its d).
    const endings = cluster === 'os' ? [] : [[cluster, '']];
    if (first === 'nos') { endings.push(['mo' + cluster, 'mos']); }               // sentémonos
    if (first === 'se' && two) { endings.push(['mo' + cluster, 'mos']); }         // digámoselo
    if (first === 'os' && !two) { endings.push(['aos', 'ad'], ['eos', 'ed'], ['íos', 'id'], ['moos', 'mos'], ['idos', 'id']); }  // sentaos, poneos, vestíos, sentémoos, idos
    for (const [inflected, deinflected] of endings) {
        // The d of the vosotros imperative drops before os (sentaos), except
        // in idos.
        const end = first === 'os' ? IMPERATIVE_END.replace('d', '') : IMPERATIVE_END;
        const constraint = deinflected === '' ? {stemEndsWith: end} : inflected === 'idos' ? WHOLE : {stemMinLength: 1};
        suffix(id, inflected, deinflected, [], ['imp'], {...constraint, then: STRIP_ACUTE});
        if (reflexive) {
            add(id, {type: 'circumfix', inflectedPrefix: '', deinflectedPrefix: first + ' ', inflectedSuffix: inflected, deinflectedSuffix: deinflected,
                conditionsIn: [], conditionsOut: ['imp'], ...constraint, then: STRIP_ACUTE});
        }
    }
    // dé (dar, usted) keeps its accent only with two pronouns: deme, démelo.
    suffix(id, (two ? 'dé' : 'de') + cluster, 'dé', [], ['imp'], WHOLE);
}

// --- Pronominal verbs ----------------------------------------------------------------
transform('pronominal', '-se verb', 'A verb with a reflexive pronoun before it, looked up in its -se form: me levanto → levantarse, te acuerdas → acordarse.');
add('pronominal', {
    type: 'circumfix',
    prefixes: REFLEXIVE.map((p) => [p + ' ', '']),
    suffixes: [['ar', 'arse'], ['er', 'erse'], ['ir', 'irse'], ['ír', 'írse']],
    conditionsIn: ['v'], conditionsOut: ['v'], stemCharacters: LETTER,
});

// --- Nouns and adjectives ------------------------------------------------------------
const VOWEL = '[aeiouáéíóú]';
transform('plural', 'plural', 'Plural of a noun or adjective: casas, árboles, luces, canciones, jóvenes.');
const NOMINAL = ['ns', 'adj'];
suffix('plural', 's', '', [], NOMINAL, {stemEndsWith: VOWEL});
suffix('plural', 'es', '', [], NOMINAL, {stemEndsWith: '[bdfghjklmnñpqrstvwxy]'});
suffix('plural', 's', '', [], NOMINAL, {stemEndsWith: '[bcdfgkmnprtvwxz]', stemMinLength: 2});  // clubs, récords, cómics
suffix('plural', 'íes', 'í', [], NOMINAL, {stemMinLength: 1});
suffix('plural', 'úes', 'ú', [], NOMINAL, {stemMinLength: 1});
suffix('plural', 'ces', 'z', [], NOMINAL, {stemMinLength: 1});
// The singular writes an accent that the plural does not need.
for (const [plural, singular] of [['ones', 'ón'], ['anes', 'án'], ['enes', 'én'], ['ines', 'ín'], ['unes', 'ún'], ['eses', 'és'], ['ases', 'ás'], ['oses', 'ós'], ['uses', 'ús'], ['ises', 'ís']]) {
    suffix('plural', plural, singular, [], NOMINAL, {stemMinLength: 1});
}
// The plural writes an accent that the singular does not need (exámenes, cánones).
for (const [plural, singular] of [['enes', 'en'], ['ones', 'on']]) {
    suffix('plural', plural, singular, [], NOMINAL, {stemContains: '[áéíóú]', then: STRIP_ACUTE});
}
for (const [plural, singular] of [['regímenes', 'régimen'], ['especímenes', 'espécimen'], ['caracteres', 'carácter']]) {
    suffix('plural', plural, singular, [], NOMINAL, WHOLE);
}

transform('feminine', 'feminine', 'Feminine form of an adjective: bonita, trabajadora, inglesa, alemana, llorona.');
for (const [feminine, masculine] of [['a', 'o'], ['ora', 'or'], ['ona', 'ón'], ['esa', 'és'], ['ana', 'án'], ['ina', 'ín'], ['ota', 'ote'], ['eta', 'ete']]) {
    suffix('feminine', feminine, masculine, ['adj'], ['adj'], {stemMinLength: 1});
}
transform('feminine-noun', 'feminine noun', 'Feminine form of a noun for people and animals: niña, gata, trabajadora, campeona.');
for (const [feminine, masculine] of [['a', 'o'], ['ora', 'or'], ['ona', 'ón'], ['esa', 'és'], ['enta', 'ente']]) {
    suffix('feminine-noun', feminine, masculine, ['ns'], ['ns'], {stemMinLength: 2});
}

transform('superlative', 'superlative', 'Absolute superlative in -ísimo: buenísimo, facilísimo, riquísimo, amabilísimo.');
for (const [form, base] of [['ísimo', 'o'], ['ísimo', 'e'], ['ísimo', ''], ['císimo', 'z'], ['císimo', ''], ['quísimo', 'co'], ['guísimo', 'go'], ['bilísimo', 'ble'], ['esísimo', 'és']]) {
    suffix('superlative', form, base, ['adj'], ['adj'], {stemMinLength: 1});
}
// The adjective writes an accent on its stem (rápido, fácil, simpático).
for (const [form, base] of [['idísimo', 'ido'], ['ilísimo', 'il'], ['iquísimo', 'ico'], ['ulísimo', 'ulo'], ['odísimo', 'odo'], ['edísimo', 'edo']]) {
    for (const [plain, accented] of [['a', 'á'], ['e', 'é'], ['i', 'í'], ['o', 'ó'], ['u', 'ú']]) {
        suffix('superlative', form, base, ['adj'], ['adj'], {stemChange: {from: [plain], to: accented, occurrence: 'last', between: '[bcdfghjklmnñpqrstvwxyz]', betweenMinLength: 1}});
    }
}
for (const [form, base] of [
    ['antiquísimo', 'antiguo'], ['fortísimo', 'fuerte'], ['novísimo', 'nuevo'], ['bonísimo', 'bueno'], ['certísimo', 'cierto'], ['fidelísimo', 'fiel'],
    ['nobilísimo', 'noble'], ['friísimo', 'frío'], ['ternísimo', 'tierno'], ['sapientísimo', 'sabio'], ['celebérrimo', 'célebre'],
    ['paupérrimo', 'pobre'], ['pulquérrimo', 'pulcro'], ['acérrimo', 'acre'], ['libérrimo', 'libre'], ['integérrimo', 'íntegro'], ['misérrimo', 'mísero'],
]) {
    suffix('superlative', form, base, ['adj'], ['adj'], WHOLE);
}

transform('diminutive', 'diminutive', 'Diminutive in -ito, -cito, -illo: perrito, casita, cafecito, poquito, jovencito.');
const DIMINUTIVE = ['ns', 'adj'];
for (const [form, base] of [
    ['ito', 'o'], ['ita', 'a'], ['ito', ''], ['ita', ''], ['cito', ''], ['cita', ''], ['ecito', 'e'], ['ecita', 'e'],
    ['quito', 'co'], ['quita', 'ca'], ['guito', 'go'], ['guita', 'ga'], ['güita', 'gua'], ['güito', 'guo'],
    ['cecito', 'z'], ['cecita', 'z'], ['oncito', 'ón'], ['oncita', 'ona'], ['ito', 'á'], ['ita', 'á'], ['ecito', 'é'],
    ['illo', 'o'], ['illa', 'a'], ['cillo', ''], ['cilla', ''],
]) {
    suffix('diminutive', form, base, DIMINUTIVE, DIMINUTIVE, {stemMinLength: 2});
}

transform('adverb', '-mente adverb', 'Adverb in -mente, looked up as its adjective: rápidamente → rápido, fácilmente → fácil.');
suffix('adverb', 'amente', 'o', [], ['adj'], {stemMinLength: 2});
suffix('adverb', 'mente', '', [], ['adj'], {stemMinLength: 3});

// --- Output ------------------------------------------------------------------------------
const out = {schema: 1, conditions, transforms: transforms.filter((t) => t.rules.length > 0)};
const file = join(here, 'own.json');
writeFileSync(file, formatTransforms(out));
const rules = out.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`es: ${out.transforms.length} transforms, ${rules} rules in ${file}`);
