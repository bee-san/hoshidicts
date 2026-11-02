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
// v, n and adj are the part-of-speech tags Spanish Yomitan dictionaries put
// in their `rules` column (wiktionary-to-yomitan writes these, and ns, np).
// A verb rule's output is the conjugation of the infinitive it writes. imp
// and ger are intermediate states: an affirmative imperative or a gerund
// whose attached pronouns were removed. No dictionary term carries them, so
// a text with only these conditions never matches.
//
// The first version of this file had a single condition v and dictionary-form
// ns and np. Once Yomitan's rules were read (step 3), the conditions both
// files have were given Yomitan's definitions, which tools/merge-transforms.mjs
// requires to be equal; that changes no deinflection of these rules.
const conditions = {
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['ns', 'np']},
    np: {name: 'Noun plural', isDictionaryForm: false},
    ns: {name: 'Noun singular', isDictionaryForm: false},
    v: {name: 'Verb', isDictionaryForm: true, subConditions: ['v_ar', 'v_er', 'v_ir']},
    v_ar: {name: '-ar verb', isDictionaryForm: false},
    v_er: {name: '-er verb', isDictionaryForm: false},
    v_ir: {name: '-ir verb', isDictionaryForm: false},
    adj: {name: 'Adjective', isDictionaryForm: true},
    imp: {name: 'Imperative without its pronouns', isDictionaryForm: false},
    ger: {name: 'Gerund without its pronouns', isDictionaryForm: false},
    // A reflexive pronoun agrees with the imperative it follows: te with tú
    // and vos (siéntate), se with usted and ustedes (siéntese), nos with
    // nosotros (sentémonos), os with vosotros (sentaos). These mark an
    // imperative whose pronoun was moved before it as reflexive.
    imp_tu: {name: 'Imperative (tú, vos) with te before it', isDictionaryForm: false},
    imp_ud: {name: 'Imperative (usted, ustedes) with se before it', isDictionaryForm: false},
    imp_nos: {name: 'Imperative (nosotros) with nos before it', isDictionaryForm: false},
    imp_vos: {name: 'Imperative (vosotros) with os before it', isDictionaryForm: false},
    // The person of a conjugated form, which a reflexive pronoun before it
    // must agree with to make a -se verb (me levanto, te levantas, se
    // levanta, nos levantamos, os levantáis), so that me dijo, te digo and
    // me dio (indirect objects) do not read as decirse and darse.
    p1s: {name: 'First person singular (agrees with me)', isDictionaryForm: false},
    p2s: {name: 'Second person singular (agrees with te)', isDictionaryForm: false},
    p3: {name: 'Third person, usted, ustedes (agrees with se)', isDictionaryForm: false},
    p1p: {name: 'First person plural (agrees with nos)', isDictionaryForm: false},
    p2p: {name: 'Second person plural (agrees with os)', isDictionaryForm: false},
    // The written-out forms of the verbs whose stem has one letter or none
    // (ir, dar, ver, oír), by person, and their imperatives and gerunds. The
    // pronominal rule needs a stem of two letters, so that a pronoun before a
    // short word (me va, te es, me ha) gives no -se verb through a regular
    // ending; these verbs reach irse, darse, verse and oírse through these
    // conditions instead (me voy, se dio, nos vemos, vete).
    short_p1s: {name: 'Verb with a one-letter stem, first person singular', isDictionaryForm: false},
    short_p2s: {name: 'Verb with a one-letter stem, second person singular', isDictionaryForm: false},
    short_p3: {name: 'Verb with a one-letter stem, third person', isDictionaryForm: false},
    short_p1p: {name: 'Verb with a one-letter stem, first person plural', isDictionaryForm: false},
    short_p2p: {name: 'Verb with a one-letter stem, second person plural', isDictionaryForm: false},
    short_imp: {name: 'Verb with a one-letter stem, imperative or gerund', isDictionaryForm: false},
};

/** The condition of an infinitive (with or without -se). */
function verbClass(infinitive) {
    const match = /(ar|er|ir|ír)(se)?$/u.exec(infinitive);
    if (match === null) { throw new Error(`${infinitive} is not an infinitive`); }
    return {ar: 'v_ar', er: 'v_er', ir: 'v_ir', 'ír': 'v_ir'}[match[1]];
}

const LETTER = '{letter}';
// Classes of language.json: consonant (with the u of gu and qu) and the last
// letter of an imperative that takes a pronoun.
const CONSONANT_OR_U = '{stemConsonant}';
// The written accent a pronoun adds to an imperative is removed again
// (dámelo → da, cómpralo → compra).
const STRIP_ACUTE = [{map: {'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u'}}];

// --- Transforms -------------------------------------------------------------------
const transforms = [];
const byId = new Map();
const seen = new Set();  // a transform has each rule once (hablamos is both present-nosotros and preterite-nosotros)

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
    const key = `${id}\u0000${JSON.stringify(rule)}`;
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
    // decí, and deci after a pronoun took its accent away (decime, escribile).
    'imperative-vos': ['í', 'i'], 'imperative-vosotros': 'id',
};

const TENSES = [
    ['present', 'present', 'Present indicative', ['yo', 'tu', 'el', 'nosotros', 'vosotros', 'ellos', 'vos']],
    ['preterite', 'preterite', 'Preterite (pretérito perfecto simple)', ['yo', 'tu', 'el', 'nosotros', 'vosotros', 'ellos']],
    ['imperfect', 'imperfect', 'Imperfect indicative (pretérito imperfecto)', ['yoel', 'tu', 'nosotros', 'vosotros', 'ellos']],
    ['future', 'future', 'Future indicative', ['yo', 'tu', 'el', 'nosotros', 'vosotros', 'ellos']],
    ['conditional', 'conditional', 'Conditional', ['yoel', 'tu', 'nosotros', 'vosotros', 'ellos']],
    ['subjunctive', 'present subjunctive', 'Present subjunctive', ['yoel', 'tu', 'nosotros', 'vosotros', 'ellos', 'vos']],
    ['subjunctive-ra', 'imperfect subjunctive', 'Imperfect subjunctive in -ra', ['yoel', 'tu', 'nosotros', 'vosotros', 'ellos']],
    ['subjunctive-se', 'imperfect subjunctive (-se)', 'Imperfect subjunctive in -se', ['yoel', 'tu', 'nosotros', 'vosotros', 'ellos']],
    ['subjunctive-future', 'future subjunctive', 'Future subjunctive (archaic and legal language)', ['yoel', 'tu', 'nosotros', 'vosotros', 'ellos']],
];
const IMPERATIVES = [
    ['tu', 'tú', 'Affirmative imperative, tú'],
    ['vos', 'vos', 'Affirmative imperative, vos (voseo)'],
    ['vosotros', 'vosotros', 'Affirmative imperative, vosotros'],
    ['usted', 'usted', 'Imperative, usted (the present subjunctive form)'],
    ['ustedes', 'ustedes', 'Imperative, ustedes (the present subjunctive form)'],
    ['nosotros', 'nosotros', 'Imperative, nosotros (the present subjunctive form)'],
];
// The examples of a slot: hablar, comer and vivir with its regular endings.
const examples = (slot) => [['habl', 'ar'], ['com', 'er'], ['viv', 'ir']]
    .flatMap(([stem, conj]) => [ENDINGS[conj][slot]].flat().slice(0, 1).map((ending) => stem + ending)).join(', ');

for (const [id, name, text, persons] of TENSES) {
    for (const person of persons) {
        const slot = person === 'yoel' ? `${id}-yo-el` : `${id}-${person}`;
        transform(slot, `${name} (${P[person]})`, `${text}, ${PERSON_TEXT[person]}: ${examples(slot)}.`);
    }
}
for (const [person, label, text] of IMPERATIVES) {
    transform(`imperative-${person}`, `imperative (${label})`, `${text}: ${examples(`imperative-${person}`)}.`);
}
transform('gerund', 'gerund', `Gerund: ${examples('gerund')}.`);
transform('participle', 'past participle', 'Past participle, masculine or feminine, singular or plural: hablado, comida, vividos, abiertas.');

// Slots where the stem is stressed and takes its stem change (pienso,
// cuento, pido), and -ir slots with the weak change e→i, o→u (sintió,
// durmamos, pidiendo).
const STRESSED = new Set(['present-yo', 'present-tu', 'present-el', 'present-ellos', 'subjunctive-yo-el', 'subjunctive-tu', 'subjunctive-ellos',
    'imperative-tu', 'imperative-usted', 'imperative-ustedes']);
const WEAK_IR = new Set(['preterite-el', 'preterite-ellos', 'subjunctive-nosotros', 'subjunctive-vosotros', 'subjunctive-vos', 'imperative-nosotros', 'gerund']);
for (const tense of ['subjunctive-ra', 'subjunctive-se', 'subjunctive-future']) {
    for (const person of ['yo-el', 'tu', 'nosotros', 'vosotros', 'ellos']) { WEAK_IR.add(`${tense}-${person}`); }
}

// The last match of `from` followed only by consonants (and the u of gu,
// qu), or ending the stem where the ending begins with the consonant
// (pienso, cuentan, adquiero, envío; juegue, sigo, empiece). Changes with
// one result share a rule; at one position the longest `from` wins (sient
// → sent, pid → ped).
const change = (from, to) => ({from, to, occurrence: 'last', between: CONSONANT_OR_U});
// Where the ending begins with the consonant after the vowel (juegue, sigo,
// empiece) or the vowel ends the stem (envío), nothing comes between.
const atEnd = (c) => ({...c, betweenMinLength: 0});
// Changes of one word (jugar, oler) or a few (dormir, morir, adquirir) need no
// such limit.
const only = (from, to) => ({from, to, occurrence: 'last'});
const IE = change(['ie'], 'e');
const UE = change(['ue', 'üe'], 'o');       // cuento, avergüenzo
const JUE = only(['jue'], 'ju');            // juego (jugar)
const HUE = only(['hue'], 'o');             // huele (oler)
const ACCENT_I = atEnd(change(['í'], 'i'));  // envío, prohíbo
const ACCENT_U = atEnd(change(['ú'], 'u'));  // continúa, reúno
const IR_E = change(['ie', 'i'], 'e');      // siento, pido
const IR_UE = only(['uer'], 'or');          // duermo, muere: only dormir and morir
const IR_IE_I = only(['ie'], 'i');          // adquiero (adquirir, inquirir)
const ER_UE = change(['ue'], 'o');          // vuelvo, tuerzo
const WEAK_E = change(['i'], 'e');          // sintió, pidamos, siguiendo
const WEAK_O = change(['u'], 'o');          // durmió, muriendo
const CHANGES = {
    ar: {stressed: [IE, UE, JUE, ACCENT_I, ACCENT_U], weak: []},
    er: {stressed: [IE, ER_UE, HUE], weak: []},
    ir: {stressed: [IR_E, IR_UE, IR_IE_I, ACCENT_I, ACCENT_U], weak: [WEAK_E, WEAK_O]},
};

// Spelling changes that keep a consonant's sound: before e for -ar verbs
// (busqué, pague, empiece, averigüe), before a and o for -er and -ir verbs
// (venzo, conozco, cojo, dirija, sigo, delinco), each with the stem changes
// verbs of that spelling have (trueque, empiece, almuerce, juegue, cuelgue,
// tuerzo, sigo, elijo).
const SPELLING = {
    ar: [['qu', 'c', [UE]], ['gu', 'g', [IE, UE, JUE]], ['c', 'z', [IE, UE]], ['gü', 'gu', []]],
    er: [['z', 'c', [ER_UE]], ['zc', 'c', []], ['j', 'g', []]],
    ir: [['z', 'c', []], ['zc', 'c', []], ['j', 'g', [IR_E, WEAK_E]], ['g', 'gu', [IR_E, WEAK_E]], ['c', 'qu', []]],
};
const before = {ar: /^[eé]/u, er: /^[aoá]/u, ir: /^[aoá]/u};

const IMPERATIVE_IN = {
    'imperative-tu': ['imp', 'imp_tu'], 'imperative-vos': ['imp', 'imp_tu'], 'imperative-usted': ['imp', 'imp_ud'], 'imperative-ustedes': ['imp', 'imp_ud'],
    'imperative-nosotros': ['imp', 'imp_nos'], 'imperative-vosotros': ['imp', 'imp_vos'],
};
function inFor(slot) {
    if (slot.startsWith('imperative-')) { return IMPERATIVE_IN[slot]; }
    if (slot === 'gerund') { return ['ger']; }
    return [];
}

// The person conditions of a slot's output. Imperatives, gerunds and
// participles have none: a pronoun is attached after them, never written
// before them (siéntate, not te sienta, which is te + sentar's él form).
function personFor(slot) {
    if (/^(imperative-|gerund$|participle$)/.test(slot)) { return []; }
    const person = slot.replace(/^(present|preterite|imperfect|future|conditional|subjunctive(-ra|-se|-future)?)-/, '');
    const map = {yo: ['p1s'], tu: ['p2s'], vos: ['p2s'], el: ['p3'], 'yo-el': ['p1s', 'p3'], nosotros: ['p1p'], vosotros: ['p2p'], ellos: ['p3']};
    if (map[person] === undefined) { throw new Error(`no person for ${slot}`); }
    return map[person];
}

// The conditions the written-out forms of ir, dar, ver and oír add.
const SHORT = {p1s: 'short_p1s', p2s: 'short_p2s', p3: 'short_p3', p1p: 'short_p1p', p2p: 'short_p2p'};
function shortFor(slot) {
    if (slot === 'participle') { return []; }
    const persons = personFor(slot);
    return persons.length === 0 ? ['short_imp'] : persons.map((p) => SHORT[p]);
}

function verbRule(slot, inflected, deinflected, extra = {}, short = false) {
    suffix(slot, inflected, deinflected, inFor(slot), [verbClass(deinflected), ...personFor(slot), ...(short ? shortFor(slot) : [])], extra);
}

// Every regular ending needs a stem of two letters or more, so de, ten, tate,
// vía and sido are not read as dar, tar, ver and ser. The verbs whose stem
// has one letter or none (ir, dar, ver, ser, oír) are written out below.
const MIN_STEM = 2;
const CHANGE_NAMES = new Map([[IE, 'IE'], [UE, 'UE']]);
// Regular readings that would come before a frequent word's own lemma are
// left out by the stems they start with: puedo, muere, nueva, puertas and
// fuese are not podar, morar, novar, portar and fosar (regular -ar verbs,
// without the ue of poder, morir, nuevo, puerta and ir); viendo and vieja
// not vendar, vender and vejar (no common -ar or -er verb with ie starts
// with v, except verter); esta, esto and estas not estar (whose forms are
// está, estoy, estás). A rule's
// literal stem constraint takes one string, so such a rule is split by the
// first letter of its stem: one rule for the stems that start with another
// letter, and rules for the stems kept among those that start with it
// (muestro, fuerza and pruebo, and a pronoun before the verb: me cuento).
const SPLITS = {
    'ar:plain': [{stemNotStartsWithText: 'est'}, {stemStartsWithText: 'est', stemMinLength: 4}],
    'ar:UE': [{stemNotStartsWith: '[fmp]', stemNotStartsWithText: 'nuev'}, {stemStartsWith: '[m]', stemNotStartsWithText: 'muer'},
        {stemStartsWithText: 'fuerz', stemChange: only(['ue'], 'o')}, {stemStartsWithText: 'prueb', stemChange: only(['ue'], 'o')}],
    'ar:IE': [{stemNotStartsWith: '[v]'}],
    'er:IE': [{stemNotStartsWith: '[v]'}, {stemStartsWithText: 'viert', stemChange: only(['ie'], 'e')}],
};

/**
 * The stem constraints of a regular ending, one object per rule.
 * @param {string} conj ar, er or ir
 * @param {string} slot the transform id
 * @param {string} ending the regular ending
 * @param {string | null} spelling the spelling change's inflected consonant (qu, z, j, ...), or null
 * @param {object | null} change the stem change, or null
 */
function stemVariants(conj, slot, ending, spelling, change) {
    const base = {stemMinLength: MIN_STEM};
    const plain = spelling === null;
    // Spelling: before e an -ar verb writes qu, gu and c for c, g and z
    // (pequé, pague, empiece), so peces is not pecar; -egir verbs change
    // their e (rijo, elijo), so rejas is not regir; no -er verb with ie ends
    // its stem in c (empiece is empezar, not empecer).
    if (conj === 'ar' && plain && change === null && /^[eé]/u.test(ending)) { base.stemNotEndsWith = '[cgz]'; }
    if (conj === 'er' && change === IE) { base.stemNotEndsWith = '[c]'; }
    if (conj === 'ir' && spelling === 'j' && change === null) { base.stemNotEndsWith = '[e]'; }
    // Single words of irregular verbs: soler and salir write suela and
    // salga (sola, sala and salo are not theirs), and empezamos is empezar,
    // not empecer.
    if (conj === 'er' && spelling === 'z' && change === null) { base.stemNotStartsWithText = 'empe'; }
    if (conj === 'er' && plain && change === null && STRESSED.has(slot) && /^[aoá]/u.test(ending)) { base.stemNotStartsWithText = 'sol'; }
    if (conj === 'ir' && plain && change === null && /^[aoá]/u.test(ending)) { base.stemNotStartsWithText = 'sal'; }
    const split = plain && STRESSED.has(slot) ? SPLITS[`${conj}:${change === null ? 'plain' : CHANGE_NAMES.get(change)}`] : undefined;
    return split === undefined ? [base] : split.map((variant) => ({...base, ...variant}));
}

for (const conj of ['ar', 'er', 'ir']) {
    for (const [slot, value] of Object.entries(ENDINGS[conj])) {
        const endings = Array.isArray(value) ? value : [value];
        const changes = [
            ...(STRESSED.has(slot) ? CHANGES[conj].stressed : []),
            ...(WEAK_IR.has(slot) ? CHANGES[conj].weak : []),
        ];
        for (const ending of endings) {
            const forms = [[ending, conj, changes, null]];
            if (before[conj].test(ending)) {
                for (const [inflectedConsonant, lemmaConsonant, with_] of SPELLING[conj]) {
                    forms.push([inflectedConsonant + ending, lemmaConsonant + conj, changes.filter((c) => with_.includes(c)), inflectedConsonant]);
                }
            }
            for (const [inflected, deinflected, combined, spelling] of forms) {
                for (const stem of stemVariants(conj, slot, ending, spelling, null)) {
                    verbRule(slot, inflected, deinflected, stem);
                }
                for (const stemChange of combined) {
                    const placed = spelling === null || stemChange.betweenMinLength !== undefined ? stemChange : atEnd(stemChange);
                    for (const {stemChange: own, ...stem} of stemVariants(conj, slot, ending, spelling, stemChange)) {
                        verbRule(slot, inflected, deinflected, {...stem, stemChange: own ?? placed});
                    }
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

function paradigm(table, deinflected, extra = {}, short = false) {
    for (const [slot, value] of Object.entries(table)) {
        for (const inflected of Array.isArray(value) ? value : [value]) {
            verbRule(slot, inflected, deinflected, extra, short);
        }
    }
}

/** Forms that are whole words: wholeWord rules. */
function wholeParadigm(table, deinflected) {
    for (const [slot, value] of Object.entries(table)) {
        for (const inflected of Array.isArray(value) ? value : [value]) {
            add(slot, {type: 'wholeWord', inflected, deinflected, conditionsIn: inFor(slot), conditionsOut: [verbClass(deinflected), ...personFor(slot)]});
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
}, 'oír', {}, true);

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
        if (lemma === 'ñir') { paradigm(table, lemma, {stemMinLength: 1, stemChange: atEnd(WEAK_E)}); }
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
wholeParadigm({'present-yo': 'yerro', 'present-tu': 'yerras', 'present-el': 'yerra', 'present-ellos': 'yerran',
    'subjunctive-yo-el': 'yerre', 'subjunctive-tu': 'yerres', 'subjunctive-ellos': 'yerren',
    'imperative-tu': 'yerra', 'imperative-usted': 'yerre', 'imperative-ustedes': 'yerren'}, 'errar');

// Irregular tú imperatives; the compounds of tener, poner and venir write
// an accent (detén, compón, prevén).
paradigm({'imperative-tu': ['ten', 'tén']}, 'tener');
paradigm({'imperative-tu': ['pon', 'pón']}, 'poner');
paradigm({'imperative-tu': ['ven', 'vén']}, 'venir');
paradigm({'imperative-tu': 'sal'}, 'salir');
paradigm({'imperative-tu': 'haz'}, 'hacer');
paradigm({'imperative-tu': 'faz'}, 'facer');
paradigm({'gerund': 'pudiendo'}, 'poder');

// Forms of ir, estar, dar, ver, saber and decir that stand alone or after a
// pronoun (se va, me di, me sé): the stem is empty or ends in a space, so
// the pronominal rule can follow. Those of ser, haber and caber are whole
// words.
// The stem is empty or does not end in a letter (a space or the + of a moved
// pronoun). Two ranges, a-z and the lowercase Latin-1 letters, do what
// {letter} would for Spanish (caída, quédese), at a third of its size in
// tests/classes.json.
const WHOLE = {stemNotEndsWith: '[a-z\\u00E0-\\u00FF]'};
const fuiSeries = {
    'preterite-yo': 'fui', 'preterite-tu': 'fuiste', 'preterite-el': 'fue', 'preterite-nosotros': 'fuimos', 'preterite-vosotros': 'fuisteis', 'preterite-ellos': 'fueron',
    ...pastSubjunctive('fu', ''),
};
wholeParadigm({
    'present-yo': 'soy', 'present-tu': 'eres', 'present-el': 'es', 'present-nosotros': 'somos', 'present-vosotros': 'sois', 'present-ellos': 'son', 'present-vos': 'sos',
    'imperfect-yo-el': 'era', 'imperfect-tu': 'eras', 'imperfect-nosotros': 'éramos', 'imperfect-vosotros': 'erais', 'imperfect-ellos': 'eran',
    ...fuiSeries,
    'subjunctive-yo-el': 'sea', 'subjunctive-tu': 'seas', 'subjunctive-nosotros': 'seamos', 'subjunctive-vosotros': 'seáis', 'subjunctive-ellos': 'sean', 'subjunctive-vos': 'seás',
    'imperative-tu': 'sé', 'imperative-vosotros': 'sed', 'imperative-usted': 'sea', 'imperative-ustedes': 'sean', 'imperative-nosotros': 'seamos',
    'gerund': 'siendo', 'participle': 'sido',
}, 'ser');
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
}, 'ir', WHOLE, true);
paradigm({
    'present-yo': 'estoy', 'present-tu': 'estás', 'present-el': 'está', 'present-ellos': 'están',
    'subjunctive-yo-el': 'esté', 'subjunctive-tu': 'estés', 'subjunctive-ellos': 'estén',
    'imperative-tu': 'está', 'imperative-usted': 'esté', 'imperative-ustedes': 'estén',
}, 'estar', WHOLE);
wholeParadigm({
    'present-yo': 'he', 'present-tu': 'has', 'present-el': ['ha', 'hay'], 'present-nosotros': 'hemos', 'present-ellos': 'han', 'present-vos': 'has',
    'subjunctive-yo-el': 'haya', 'subjunctive-tu': 'hayas', 'subjunctive-nosotros': 'hayamos', 'subjunctive-vosotros': 'hayáis', 'subjunctive-ellos': 'hayan', 'subjunctive-vos': 'hayás',
}, 'haber');
// The future and conditional of a verb, from its infinitive.
function futureOf(infinitive) {
    const out = {};
    for (const [slot, ending] of Object.entries(ENDINGS.ar)) {
        if (slot.startsWith('future-') || slot.startsWith('conditional-')) { out[slot] = infinitive + ending.slice(2); }
    }
    return out;
}
paradigm({
    'present-yo': 'doy', 'present-tu': 'das', 'present-el': 'da', 'present-nosotros': 'damos', 'present-vosotros': 'dais', 'present-ellos': 'dan', 'present-vos': 'das',
    'preterite-yo': 'di', 'preterite-tu': 'diste', 'preterite-el': 'dio', 'preterite-nosotros': 'dimos', 'preterite-vosotros': 'disteis', 'preterite-ellos': 'dieron',
    'imperfect-yo-el': 'daba', 'imperfect-tu': 'dabas', 'imperfect-nosotros': 'dábamos', 'imperfect-vosotros': 'dabais', 'imperfect-ellos': 'daban',
    ...futureOf('dar'),
    'subjunctive-yo-el': 'dé', 'subjunctive-tu': 'des', 'subjunctive-nosotros': 'demos', 'subjunctive-vosotros': 'deis', 'subjunctive-ellos': 'den', 'subjunctive-vos': 'des',
    ...pastSubjunctive('d', 'i'),
    'imperative-tu': 'da', 'imperative-vosotros': 'dad', 'imperative-usted': 'dé', 'imperative-ustedes': 'den', 'imperative-nosotros': 'demos',
    'gerund': 'dando', 'participle': ['dado', 'dada', 'dados', 'dadas'],
}, 'dar', WHOLE, true);
paradigm({
    'present-tu': 'ves', 'present-el': 've', 'present-nosotros': 'vemos', 'present-vosotros': 'veis', 'present-ellos': 'ven', 'present-vos': 'ves',
    'preterite-yo': 'vi', 'preterite-tu': 'viste', 'preterite-el': 'vio', 'preterite-nosotros': 'vimos', 'preterite-vosotros': 'visteis', 'preterite-ellos': 'vieron',
    ...futureOf('ver'),
    ...pastSubjunctive('v', 'i'),
    'imperative-tu': 've', 'imperative-vosotros': 'ved',
    'gerund': 'viendo',
}, 'ver', WHOLE, true);
// ver and its compounds (prever, entrever): the e of the stem stays (veo, vea, veía).
paradigm({'present-yo': 'veo', ...presentSubjunctive('ve'),
    'imperfect-yo-el': 'veía', 'imperfect-tu': 'veías', 'imperfect-nosotros': 'veíamos', 'imperfect-vosotros': 'veíais', 'imperfect-ellos': 'veían'}, 'ver', {}, true);
paradigm({'present-yo': 'sé', ...presentSubjunctive('sep')}, 'saber', WHOLE);
wholeParadigm({'present-yo': 'quepo', ...presentSubjunctive('quep')}, 'caber');
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
// A reflexive pronoun attached to an imperative or a gerund is moved in front
// of it with a + (siéntate → te+sienta, sentándome → me+sentando), so the
// conjugation rules can read the verb and the pronominal rule then gives the
// -se verb. The + keeps these apart from a pronoun written before a word
// (te sienta bien, it suits you), which agrees with the verb's person.
// Pronouns written after an infinitive, a gerund or an affirmative
// imperative (hacerlo, diciéndome, dámelo). One transform per cluster. The
// written accent that the pronouns add is removed again (dámelo → da,
// comiéndolo → comiendo). Clusters that start with a reflexive pronoun
// also give the -se verb (acuérdate → acordarse, sentándome → sentarse).
// Two pronouns: an indirect (or reflexive) one before a direct one (dámelo,
// cómetela, dáselos), and se before an indirect one (olvidárseme,
// ocurrírsele).
const SINGLE = ['me', 'te', 'se', 'nos', 'os', 'lo', 'la', 'los', 'las', 'le', 'les'];
const REFLEXIVE = ['me', 'te', 'se', 'nos', 'os'];
const DIRECT = ['lo', 'la', 'los', 'las'];
const CLUSTERS = [
    ...SINGLE.map((p) => [p]),
    ...REFLEXIVE.flatMap((p) => DIRECT.map((o) => [p, o])),
    ...['me', 'te', 'nos', 'os', 'le', 'les'].map((o) => ['se', o]),
];
const IMPERATIVE_END = '{imperativeEnd}';
const REFLEXIVE_IMPERATIVE = {te: 'imp_tu', se: 'imp_ud', nos: 'imp_nos', os: 'imp_vos'};
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
        suffix(id, ending + cluster, lemma, [], [verbClass(lemma)]);
        if (reflexive && (two || first !== 'se')) { suffix(id, ending + cluster, lemma + 'se', [], [verbClass(lemma)]); }
    }
    // Gerund: always accented with a pronoun (haciéndolo, yéndose, riñéndole).
    for (const [ending, bare] of [['ándo', 'ando'], ['éndo', 'endo']]) {
        suffix(id, ending + cluster, bare, [], ['ger']);
        if (reflexive) {
            add(id, {type: 'circumfix', inflectedPrefix: '', deinflectedPrefix: first + '+', inflectedSuffix: ending + cluster, deinflectedSuffix: bare,
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
        const end = first === 'os' ? '{imperativeEndOs}' : IMPERATIVE_END;
        const constraint = deinflected === '' ? {stemEndsWith: end} : inflected === 'idos' ? WHOLE : {stemMinLength: 1};
        suffix(id, inflected, deinflected, [], ['imp'], {...constraint, then: STRIP_ACUTE});
        const person = REFLEXIVE_IMPERATIVE[first];
        if (person !== undefined) {
            add(id, {type: 'circumfix', inflectedPrefix: '', deinflectedPrefix: first + '+', inflectedSuffix: inflected, deinflectedSuffix: deinflected,
                conditionsIn: [], conditionsOut: [person], ...constraint, then: STRIP_ACUTE});
        }
    }
    // dé (dar, usted) keeps its accent with two pronouns (démelo) and in the
    // traditional spelling of one (deme, dese or dése).
    for (const de of (two ? ['dé'] : ['de', 'dé']).map((d) => d + cluster)) {
        suffix(id, de, 'dé', [], ['imp'], WHOLE);
        if (first === 'se') {
            add(id, {type: 'circumfix', inflectedPrefix: '', deinflectedPrefix: 'se+', inflectedSuffix: de, deinflectedSuffix: 'dé', conditionsIn: [], conditionsOut: ['imp_ud'], ...WHOLE});
        }
    }
}

// --- Pronominal verbs ----------------------------------------------------------------
transform('pronominal', '-se verb', 'A verb with a reflexive pronoun before it or attached to it, looked up in its -se form: me levanto → levantarse, te acuerdas → acordarse, siéntate → sentarse.');
const CLASSES = [['v_ar', [['ar', 'arse']]], ['v_er', [['er', 'erse']]], ['v_ir', [['ir', 'irse'], ['ír', 'írse']]]];
const PERSON = {me: 'p1s', te: 'p2s', se: 'p3', nos: 'p1p', os: 'p2p'};
// A pronoun written before the verb: it must agree with the verb's person,
// and the verb's stem has two letters or more, so that a pronoun before a
// short word gives no -se verb through a regular ending (me va is not verse,
// te es not irse, me ha not herse).
for (const pronoun of REFLEXIVE) {
    for (const [condition, suffixes] of CLASSES) {
        add('pronominal', {
            type: 'circumfix', prefixes: [[pronoun + ' ', '']], suffixes,
            conditionsIn: [PERSON[pronoun]], conditionsOut: [condition], stemCharacters: LETTER, stemMinLength: MIN_STEM,
        });
    }
}
// A pronoun the clitic rules moved from after an imperative or a gerund.
for (const [condition, suffixes] of CLASSES) {
    add('pronominal', {
        type: 'circumfix', prefixes: REFLEXIVE.map((p) => [p + '+', '']), suffixes,
        conditionsIn: [condition], conditionsOut: [condition], stemCharacters: LETTER, stemMinLength: MIN_STEM,
    });
}
// The written-out forms of ir, dar, ver and oír: me voy, se dio, nos vemos,
// te oyes (irse, darse, verse, oírse), and vete, dese, yéndose.
for (const pronoun of REFLEXIVE) {
    for (const [condition, suffixes] of CLASSES) {
        add('pronominal', {type: 'circumfix', prefixes: [[pronoun + ' ', '']], suffixes, conditionsIn: [SHORT[PERSON[pronoun]]], conditionsOut: [condition]});
    }
}
for (const [condition, suffixes] of CLASSES) {
    add('pronominal', {type: 'circumfix', prefixes: REFLEXIVE.map((p) => [p + '+', '']), suffixes, conditionsIn: ['short_imp'], conditionsOut: [condition]});
}

// --- Nouns and adjectives ------------------------------------------------------------
const VOWEL = '[aeiouáéíóú]';
transform('plural', 'plural', 'Plural of a noun or adjective: casas, árboles, luces, canciones, jóvenes.');
const NOMINAL = ['ns', 'adj'];
// At least two letters (mis → mi, tés → té, not os → o).
suffix('plural', 's', '', [], NOMINAL, {stemEndsWith: VOWEL, stemMinLength: 2});
suffix('plural', 'es', '', [], NOMINAL, {stemEndsWith: '[bdfghjklmnñpqrstvwxy]'});
// Loanwords that add s after a consonant (clubs, récords, cómics, emails,
// cowboys); Spanish words take -es there.
suffix('plural', 's', '', [], NOMINAL, {stemEndsWith: '[bcdfgklmnprtvwxyz]', stemMinLength: 2});
// Acronyms: ONGs, DNIs, CDs.
suffix('plural', 's', '', [], NOMINAL, {stemEndsWith: '[A-Z]', stemMinLength: 2});
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
    add('plural', {type: 'wholeWord', inflected: plural, deinflected: singular, conditionsIn: [], conditionsOut: NOMINAL});
}

transform('feminine', 'feminine', 'Feminine form of an adjective: bonita, trabajadora, inglesa, alemana, llorona, española, andaluza.');
for (const [feminine, masculine] of [['a', 'o'], ['ona', 'ón'], ['esa', 'és'], ['ana', 'án'], ['ina', 'ín'], ['ota', 'ote'], ['eta', 'ete'], ['ñola', 'ñol'], ['uza', 'uz']]) {
    suffix('feminine', feminine, masculine, ['adj'], ['adj'], {stemMinLength: 1});
}
// Adjectives in -or with a feminine are those in -dor, -tor and -sor
// (trabajadora, protectora); mejor, peor, mayor, menor and superior have
// none, so mejora is not mejor.
suffix('feminine', 'ora', 'or', ['adj'], ['adj'], {stemEndsWith: '[dts]'});
// Only the endings of nouns for people: a plain a → o would read casa as
// caso, cosa as coso and para as paro. Dictionaries list common feminine
// nouns (niña, chica, hija) as headwords of their own.
transform('feminine-noun', 'feminine noun', 'Feminine form of a noun for people: trabajadora, campeona, panadera, vecina, secretaria, bióloga, fotógrafa.');
// -era, -ina, -ora and -uza need a stem of three letters (panadera, vecina,
// señora, andaluza): fuera, reina, adora and cruza are not fuero, reino,
// ador and cruz.
for (const [feminine, masculine, stemMinLength] of [['ora', 'or', 3], ['ona', 'ón', 2], ['esa', 'és', 2], ['enta', 'ente', 2], ['ana', 'ano', 2], ['era', 'ero', 3],
    ['aria', 'ario', 2], ['eña', 'eño', 2], ['ina', 'ino', 3], ['óloga', 'ólogo', 2], ['grafa', 'grafo', 2], ['eca', 'eco', 2], ['ñola', 'ñol', 2], ['uza', 'uz', 3]]) {
    suffix('feminine-noun', feminine, masculine, ['ns'], ['ns'], {stemMinLength});
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
    add('superlative', {type: 'wholeWord', inflected: form, deinflected: base, conditionsIn: ['adj'], conditionsOut: ['adj']});
}

// -ito and -cito only: words in -illo and -illa are mostly words of their
// own (anillo, cuchillo, pasillo, pesadilla, rodilla), so those endings
// gave far more wrong bases than diminutives.
transform('diminutive', 'diminutive', 'Diminutive in -ito, -cito, -ecito: perrito, casita, cafecito, poquito, jovencito, pedacito, florecita.');
const DIMINUTIVE = ['ns', 'adj'];
for (const [form, base, stemMinLength] of [
    ['ito', 'o', 2], ['ita', 'a', 2], ['ito', '', 2], ['ita', '', 2], ['cito', '', 3], ['cita', '', 3], ['ecito', 'e', 2], ['ecita', 'e', 2],
    ['quito', 'co', 2], ['quita', 'ca', 2], ['guito', 'go', 2], ['guita', 'ga', 2], ['güita', 'gua', 2], ['güito', 'guo', 2],
    ['cecito', 'z', 2], ['cecita', 'z', 2], ['cito', 'zo', 2], ['cita', 'za', 2], ['oncito', 'ón', 2], ['oncita', 'ona', 2],
    ['ito', 'á', 2], ['ita', 'á', 2], ['ecito', 'é', 2], ['ecito', '', 3], ['ecita', '', 3],  // florecita, panecito, trenecito
]) {
    suffix('diminutive', form, base, DIMINUTIVE, DIMINUTIVE, {stemMinLength});
}

// Superlatives and diminutives of adverbs, determiners and pronouns, which
// dictionaries list without a part of speech the rules could name.
for (const [form, base] of [['muchísimo', 'mucho'], ['poquísimo', 'poco'], ['tantísimo', 'tanto'], ['lejísimos', 'lejos'], ['cerquísima', 'cerca'],
    ['tardísimo', 'tarde'], ['prontísimo', 'pronto'], ['tempranísimo', 'temprano']]) {
    add('superlative', {type: 'wholeWord', inflected: form, deinflected: base, conditionsIn: ['adj'], conditionsOut: []});
}
for (const [form, base] of [['ahorita', 'ahora'], ['cerquita', 'cerca'], ['lueguito', 'luego'], ['despacito', 'despacio'], ['todito', 'todo'], ['solito', 'solo']]) {
    add('diminutive', {type: 'wholeWord', inflected: form, deinflected: base, conditionsIn: ['adj'], conditionsOut: []});
}

transform('adverb', '-mente adverb', 'Adverb in -mente, looked up as its adjective: rápidamente → rápido, fácilmente → fácil.');
// The adverb is the feminine form plus -mente; after -a the base is the
// masculine (exactamente → exacto, not also exacta), except -ista.
suffix('adverb', 'amente', 'o', [], ['adj'], {stemMinLength: 2});
suffix('adverb', 'istamente', 'ista', [], ['adj'], {stemMinLength: 1});
suffix('adverb', 'ístamente', 'ísta', [], ['adj'], {stemMinLength: 1});
suffix('adverb', 'mente', '', [], ['adj'], {stemMinLength: 3, stemNotEndsWith: '[a]'});

// --- Output ------------------------------------------------------------------------------
const out = {schema: 1, conditions, transforms: transforms.filter((t) => t.rules.length > 0)};
const file = join(here, 'own.json');
writeFileSync(file, formatTransforms(out));
const rules = out.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`es: ${out.transforms.length} transforms, ${rules} rules in ${file}`);
