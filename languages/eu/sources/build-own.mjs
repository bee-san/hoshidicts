#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/eu/sources/own.json: the Basque deinflection rules written
// for this pack (docs/languages.md, section 14 step 2). Run from the
// repository root:
//
//   node languages/eu/sources/build-own.mjs
//
// The tables follow the standard description of Basque (Batua) morphology:
// Euskaltzaindia's grammar (Euskal Gramatika Laburra: Perpaus Bakuna) and its
// auxiliary-verb tables, and Wiktionary's Basque declension and conjugation
// tables. No text or table is copied from them; every form below is written
// from the paradigms they describe:
//
// - noun and adjective declension: the absolutive, ergative, dative,
//   genitive, comitative, benefactive, motivative, instrumental, inessive,
//   locative genitive (-ko), ablative, allative, directive, terminative,
//   destinative, partitive and prolative cases, in the indefinite, the
//   definite singular and plural and the proximal plural (-ok), for stems in
//   a vowel, in -a, in a consonant and in -r (lur, lurra), the animate local
//   cases (-gan), and the endings that are declined again (-ko, -(r)en, -rako);
//   after a consonant the endings take an -e- (gizonean, gizonek), which the
//   transform descriptions leave out;
// - comparative, superlative and excessive degree (-ago, -en, -egi) and the
//   adverbs in -ki;
// - the non-finite verb forms: imperfective participle (-t(z)en), future
//   participle (-ko/-go), verbal noun (-t(z)e, declined), resultative
//   (-ta/-da) and relative participle (-tako/-dako);
// - the finite verb: the auxiliaries izan, *edin, *edun (ukan) and *ezan with
//   their dative paradigms, and the synthetic verbs (egon, joan, etorri, ibili,
//   jakin, eduki, ekarri, eraman, erabili, esan, iruditu, iraun, jardun,
//   etzan, iritzi, ikusi, entzun), with one transform per tense and person,
//   so a trace names both ("present (hura, zuri, nik)" = I ... it to you);
// - what attaches to a finite verb: the relative and subjunctive -n, the
//   complementizer -(e)la, and the prefixes ba- (if) and bait- (because);
// - pronouns, demonstratives, interrogatives and other closed classes whose
//   oblique forms are irregular (honek, horretan, zertan, nirea).

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// --- Conditions -------------------------------------------------------------
// n, adj, adv and v are the parts of speech wty-eu-en (wiktionary-to-yomitan)
// writes in its `rules` column; names, pronouns, numerals and determiners
// have none there, so only forms with no conditions reach them (the text as
// written, or a closed-class rule below, whose output has none).
//
// sg and pl mark a declined form whose ending was removed: the case rules
// write them so that the rules for what such an ending attaches to (the
// genitive, -ko, the verbal noun, a finite verb with -n) can take the
// result. pl marks endings with a plural meaning. fin marks a finite verb
// form whose subordinating suffix or prefix was removed. No dictionary term
// has these three, so a text with only them is never a result.
const conditions = {
    n: {name: 'Noun', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    adv: {name: 'Adverb', isDictionaryForm: true},
    v: {name: 'Verb', isDictionaryForm: true},
    sg: {name: 'Declined form without its ending (singular or indefinite)', isDictionaryForm: false},
    pl: {name: 'Declined form without its ending (plural)', isDictionaryForm: false},
    sub: {name: 'Finite verb form without its relative -n or complementizer -la', isDictionaryForm: false},
    pfx: {name: 'Finite verb form without a prefix (ba-, bait-, ez-) or a familiar ending', isDictionaryForm: false},
    // What an indicative, potential or conditional form is read from besides
    // the text as written: a form a suffix or prefix rule left, or one a case
    // rule left (sg, pl), since a past form is its own relative (zenean,
    // when it was: zen + -ean).
    dep: {name: 'Finite, subordinated or declined form', isDictionaryForm: false, subConditions: ['sub', 'pfx', 'sg', 'pl']},
    fin: {name: 'Finite, subordinated or prefixed form', isDictionaryForm: false, subConditions: ['sub', 'pfx']},
};

// --- Collection -------------------------------------------------------------
const transforms = [];
const byId = new Map();

function transform(id, name, description) {
    if (byId.has(id)) { return byId.get(id); }
    const t = description === undefined ? {id, name, source: 'own', rules: []} : {id, name, description, source: 'own', rules: []};
    t.keys = new Set();
    transforms.push(t);
    byId.set(id, t);
    return t;
}

function add(id, rule) {
    const t = byId.get(id);
    if (t === undefined) { throw new Error(`no transform ${id}`); }
    const key = JSON.stringify(rule);
    if (t.keys.has(key)) { return; }
    t.keys.add(key);
    t.rules.push(rule);
}

// Character classes for stem constraints. Stems are matched after the
// decapitalize processor, so the classes are lowercase.
const VOWEL = '[aeiou]';
const VOWEL_NOT_A = '[eiou]';
const A = '[a]';
const CONSONANT = '[bcdfghjklmnpqrstvwxz\\u00F1]';
const R = '[r]';

// --- Nouns and adjectives ---------------------------------------------------
// Endings per case and number: [after a vowel, after a consonant]. A stem in
// -a (alaba, eliza, hizkuntza) drops the a- of a singular ending (alabaren,
// alaban) and its own -a before a plural ending in e- or o- (alabek, alaben,
// neskok); a stem in -r doubles it before a vowel (lur, lurrean, lurrek), as
// most do (ur, ura keeps one, which the consonant rule reads).
const NUMBERS = {sg: 'singular', pl: 'plural', indef: 'indefinite', prox: 'proximal plural'};
const CASES = [
    {id: 'abs', name: 'absolutive', v: true,
        sg: [['a', 'a']], pl: [['ak', 'ak']], prox: [['ok', 'ok']]},
    {id: 'erg', name: 'ergative', v: ['sg', 'pl'],
        sg: [['ak', 'ak']], pl: [['ek', 'ek']], indef: [['k', 'ek']], prox: [['ok', 'ok']]},
    // The indefinite -i after a consonant only after l, n and t (bati,
    // laguni, gizoni): after another consonant it reads ugari, hori and the
    // participles in -i (ikusi, hasi) as datives.
    {id: 'dat', name: 'dative',
        sg: [['ari', 'ari']], pl: [['ei', 'ei']], indef: [['ri', 'i', '[lnt]']], prox: [['oi', 'oi']]},
    {id: 'gen', name: 'genitive', stacker: true,
        sg: [['aren', 'aren']], pl: [['en', 'en']], indef: [['ren', 'en']], prox: [['on', 'on']]},
    {id: 'com', name: 'comitative',
        sg: [['arekin', 'arekin']], pl: [['ekin', 'ekin']], indef: [['rekin', 'ekin']], prox: [['okin', 'okin']]},
    {id: 'ben', name: 'benefactive',
        sg: [['arentzat', 'arentzat']], pl: [['entzat', 'entzat']], indef: [['rentzat', 'entzat']], prox: [['ontzat', 'ontzat']]},
    {id: 'mot', name: 'motivative (because of)',
        sg: [['arengatik', 'arengatik'], ['agatik', 'agatik']], pl: [['engatik', 'engatik']],
        indef: [['rengatik', 'engatik'], ['gatik', 'egatik']], prox: [['ongatik', 'ongatik']]},
    {id: 'ins', name: 'instrumental', v: true,
        sg: [['az', 'az']], pl: [['ez', 'ez']], indef: [['z', 'ez']], prox: [['otaz', 'otaz']]},
    {id: 'ine', name: 'inessive', adv: true,
        sg: [['an', 'ean']], pl: [['etan', 'etan']], indef: [['tan', 'etan']], prox: [['otan', 'otan']]},
    {id: 'loc', name: 'locative genitive (-ko)', adv: true, stacker: true,
        sg: [['ko', 'eko']], pl: [['etako', 'etako']], indef: [['tako', 'etako']], prox: [['otako', 'otako']]},
    {id: 'abl', name: 'ablative', adv: true,
        sg: [['tik', 'etik']], pl: [['etatik', 'etatik']], indef: [['tatik', 'etatik']], prox: [['otatik', 'otatik']]},
    {id: 'all', name: 'allative', adv: true,
        sg: [['ra', 'era']], pl: [['etara', 'etara']], indef: [['tara', 'etara']], prox: [['otara', 'otara']]},
    {id: 'dir', name: 'directive', adv: true,
        sg: [['rantz', 'erantz']], pl: [['etarantz', 'etarantz']], indef: [['tarantz', 'etarantz']], prox: [['otarantz', 'otarantz']]},
    {id: 'ter', name: 'terminative', adv: true,
        sg: [['raino', 'eraino']], pl: [['etaraino', 'etaraino']], indef: [['taraino', 'etaraino']], prox: [['otaraino', 'otaraino']]},
    {id: 'des', name: 'destinative', adv: true, stacker: true,
        sg: [['rako', 'erako']], pl: [['etarako', 'etarako']], indef: [['tarako', 'etarako']], prox: [['otarako', 'otarako']]},
    {id: 'ablko', name: 'ablative + -ko', adv: true, stacker: true,
        sg: [['tiko', 'etiko']], pl: [['etatiko', 'etatiko']], indef: [['tatiko', 'etatiko']]},
    {id: 'comko', name: 'comitative + -ko', stacker: true,
        sg: [['arekiko', 'arekiko']], pl: [['ekiko', 'ekiko']], indef: [['rekiko', 'ekiko']]},
    {id: 'dirko', name: 'directive + -ko', adv: true, stacker: true,
        sg: [['ranzko', 'eranzko']], pl: [['etaranzko', 'etaranzko']], indef: [['taranzko', 'etaranzko']]},
    {id: 'terko', name: 'terminative + -ko', adv: true, stacker: true,
        sg: [['rainoko', 'erainoko']], pl: [['etarainoko', 'etarainoko']], indef: [['tarainoko', 'etarainoko']]},
    {id: 'insko', name: 'instrumental + -ko (made of, about)', stacker: true,
        indef: [['zko', 'ezko']]},
    {id: 'par', name: 'partitive', v: true,
        indef: [['rik', 'ik']]},
    {id: 'pro', name: 'prolative',
        indef: [['tzat', 'tzat']]},
];

const startsWithVowel = (s) => /^[aeiou]/.test(s);

// One reading per stem type: {inflected, deinflected, stemEndsWith}.
function stemRules(vEnding, cEnding, consonant = CONSONANT) {
    const rules = [];
    if (startsWithVowel(vEnding)) {
        rules.push({inflected: vEnding, deinflected: '', stemEndsWith: VOWEL_NOT_A});
        if (vEnding.startsWith('a')) {
            if (vEnding.length > 1) { rules.push({inflected: vEnding.slice(1), deinflected: '', stemEndsWith: A}); }
        } else {
            // A stem in -a loses it before an ending in e- or o- (alaba -
            // alabek, txikoria - txikoriekin, plutokrazia - plutokrazioi).
            rules.push({inflected: vEnding, deinflected: 'a'});
        }
    } else {
        rules.push({inflected: vEnding, deinflected: '', stemEndsWith: VOWEL});
    }
    rules.push({inflected: cEnding, deinflected: '', stemEndsWith: consonant});
    if (startsWithVowel(cEnding)) {
        rules.push({inflected: 'r' + cEnding, deinflected: '', stemEndsWith: R});
    }
    return rules;
}

function declension() {
    // Readings grouped by the rule that makes them, so that one ending with
    // several meanings (gizonak: absolutive plural and ergative singular) is
    // one rule whose transform names them all.
    const groups = new Map();
    for (const c of CASES) {
        for (const number of Object.keys(NUMBERS)) {
            for (const [vEnding, cEnding, consonant] of c[number] ?? []) {
                for (const r of stemRules(vEnding, cEnding, consonant)) {
                    const conditionsIn = c.stacker ? ['sg', 'pl'] : [];
                    const key = JSON.stringify([r.inflected, r.deinflected, r.stemEndsWith, conditionsIn]);
                    let g = groups.get(key);
                    if (g === undefined) {
                        g = {...r, conditionsIn, readings: [], pos: new Set(['n', 'adj'])};
                        groups.set(key, g);
                    }
                    g.readings.push([c, number]);
                    // A participle takes the article and a few cases: ikusia
                    // (seen), eginak, esanez (saying), ikusirik (having seen).
                    if (c.v === true || (Array.isArray(c.v) && c.v.includes(number))) { g.pos.add('v'); }
                    if (c.adv) { g.pos.add('adv'); }
                }
            }
        }
    }
    // An -a stem rule that repeats a vowel-stem rule with the same parts of
    // speech (alabari is both dative singular and indefinite) joins it.
    for (const [key, g] of groups) {
        if (g.stemEndsWith !== A) { continue; }
        const vowelKey = JSON.stringify([g.inflected, g.deinflected, VOWEL, g.conditionsIn]);
        const v = groups.get(vowelKey);
        const samePos = v !== undefined && v.pos.size === g.pos.size && [...g.pos].every((p) => v.pos.has(p));
        if (samePos) {
            v.readings.push(...g.readings);
            for (const p of g.pos) { v.pos.add(p); }
            groups.delete(key);
        }
    }
    const caseOrder = new Map(CASES.map((c, i) => [c.id, i]));
    const numberOrder = new Map(Object.keys(NUMBERS).map((n, i) => [n, i]));
    for (const g of groups.values()) {
        const seen = new Set();
        const readings = g.readings.filter(([c, n]) => {
            const k = `${c.id}-${n}`;
            if (seen.has(k)) { return false; }
            seen.add(k);
            return true;
        }).sort(([c1, n1], [c2, n2]) => caseOrder.get(c1.id) - caseOrder.get(c2.id) || numberOrder.get(n1) - numberOrder.get(n2));
        const id = readings.map(([c, n]) => `${c.id}-${n}`).join('+');
        const byCase = [];
        for (const [c, n] of readings) {
            const last = byCase[byCase.length - 1];
            if (last && last.c === c) { last.numbers.push(n); } else { byCase.push({c, numbers: [n]}); }
        }
        const name = byCase.map(({c, numbers}) => `${c.name} ${numbers.map((n) => NUMBERS[n]).join(' or ')}`).join(', ');
        const examples = readings.map(([c, n]) => `-${(c[n] ?? [])[0][0]}`).filter((x, i, a) => a.indexOf(x) === i);
        transform(id, name, `${name[0].toUpperCase()}${name.slice(1)} of a noun or adjective: ${examples.join(', ')}.`);
        const plural = readings.some(([c, n]) => (n === 'pl' || n === 'prox') && c.id !== 'ins');
        // Adverbs take a local ending with no -e- after a consonant (hortik,
        // gaurko; adverbs() below), so only a vowel-stem rule here gives one
        // (atzotik, betiko).
        const adverb = g.pos.has('adv') && g.stemEndsWith !== CONSONANT && g.stemEndsWith !== R;
        const conditionsOut = [...['n', 'adj', 'v'].filter((p) => g.pos.has(p)), ...(adverb ? ['adv'] : []), plural ? 'pl' : 'sg'];
        const rule = {type: 'suffix', inflected: g.inflected, deinflected: g.deinflected, conditionsIn: g.conditionsIn, conditionsOut,
            stemMinLength: 2, stemEndsWith: g.stemEndsWith};
        add(id, rule);
    }
}

// The animate local cases attach to the genitive: gizonarengan (in the man),
// gizonengana (to the men), harengandik (from him).
function animate() {
    const cases = [
        ['gan', 'inessive (animate)', 'gizonarengan, nigan'],
        ['gandik', 'ablative (animate)', 'gizonarengandik'],
        ['gana', 'allative (animate)', 'gizonarengana'],
        ['ganaino', 'terminative (animate)', 'gizonarenganaino'],
        ['ganantz', 'directive (animate)', 'gizonarenganantz'],
        ['ganako', 'destinative (animate)', 'gizonarenganako, towards the man'],
    ];
    for (const [ending, name, example] of cases) {
        const id = `animate-${ending}`;
        transform(id, name, `Local case of a person or animal, attached to the genitive: -${ending} (${example}).`);
        // -ganako is an adjective of its own and takes the article (gizonarenganakoa).
        const conditionsIn = ending === 'ganako' ? ['sg', 'pl'] : [];
        add(id, {type: 'suffix', inflected: ending, deinflected: '', conditionsIn, conditionsOut: ['sg'],
            stemMinLength: 2, stemEndsWith: '[n]'});
    }
}

// Degree of adjectives and adverbs, declined again like any adjective
// (handiagoa, onena, zaharregia).
function degree() {
    const items = [
        ['comparative', 'comparative', 'Comparative degree: -ago (handiago, bigger; zaharrago, older).', 'ago'],
        ['superlative', 'superlative', 'Superlative degree: -en, usually with the article (handiena, the biggest; onena, the best).', 'en'],
        ['excessive', 'excessive', 'Excessive degree: -egi (handiegi, too big; zaharregi, too old).', 'egi'],
    ];
    for (const [id, name, description, ending] of items) {
        transform(id, name, description);
        add(id, {type: 'suffix', inflected: ending, deinflected: '', conditionsIn: ['sg', 'pl'], conditionsOut: ['adj', 'adv'],
            stemMinLength: 2, stemNotEndsWith: '[r ]'});
        add(id, {type: 'suffix', inflected: 'r' + ending, deinflected: '', conditionsIn: ['sg', 'pl'], conditionsOut: ['adj', 'adv'],
            stemMinLength: 2, stemEndsWith: R});
    }
    // Suppletive degrees: on (good) - hobe, hoberen; asko (much) - gehiago,
    // gehien, gehiegi; ondo/ongi (well) - hobeto.
    transform('degree-suppletive', 'comparative or superlative (irregular)', 'Irregular degree: hobe (better) and hoberen (best) of on, gehiago, gehien and gehiegi of asko, hobeto (better) of ondo.');
    // nahiago (rather; nahiago dut, I prefer) is the comparative of nahi (wish).
    add('comparative', {type: 'wholeWord', inflected: 'nahiago', deinflected: 'nahi', conditionsIn: [], conditionsOut: ['n']});
    for (const [form, lemma, pos] of [['hobe', 'on', 'adj'], ['hoberen', 'on', 'adj'], ['hobeto', 'ondo', 'adv'], ['gehiago', 'asko', 'adj'],
        ['gehien', 'asko', 'adj'], ['gehiegi', 'asko', 'adj'], ['gutxiago', 'gutxi', 'adj'], ['gutxien', 'gutxi', 'adj'], ['txarrago', 'txar', 'adj']]) {
        add('degree-suppletive', {type: 'wholeWord', inflected: form, deinflected: lemma, conditionsIn: ['sg', 'pl'], conditionsOut: [pos, 'adv']});
    }
}

// Adverbs of manner in -ki from adjectives (ederki, well; arinki, lightly),
// and the local endings of adverbs, which take no -e- after a consonant
// (gaurko, hortik), and -go and -dik after -n (hemengo, hemendik, oraindik).
function adverbs() {
    transform('adverb-ki', 'adverb (-ki)', 'Adverb of manner made from an adjective with -ki: ederki (finely, well) from eder.');
    // euskalki (a Basque dialect) is euskal + the noun suffix -ki, not an adverb.
    add('adverb-ki', {type: 'suffix', inflected: 'ki', deinflected: '', conditionsIn: [], conditionsOut: ['adj'], stemMinLength: 3,
        stemEndsWith: '[abdeghilnorstuxz]', stemNotStartsWithText: 'euskal'});
    transform('adverb-ko', 'locative genitive (-ko) of an adverb', 'Adverbs take -ko with no -e- after a consonant, and -go after -n: gaurko (today\'s), atzoko, hemengo, oraingo.');
    add('adverb-ko', {type: 'suffix', inflected: 'ko', deinflected: '', conditionsIn: ['sg', 'pl'], conditionsOut: ['adv', 'sg'], stemMinLength: 2,
        stemEndsWith: '[lrsxz]'});
    add('adverb-ko', {type: 'suffix', inflected: 'go', deinflected: '', conditionsIn: ['sg', 'pl'], conditionsOut: ['adv', 'n', 'adj', 'sg'], stemMinLength: 2,
        stemEndsWith: '[n]'});
    // Distributive -ka: ehunka (by hundreds), bakarka (one by one), taldeka
    // (in groups), oihuka (shouting).
    transform('adverb-ka', 'distributive (-ka)', 'Adverb made with -ka from a noun, adjective or numeral: ehunka (by hundreds), bakarka (one by one), taldeka (in groups), oihuka (shouting).');
    // Not after -i: politika (politics) is not polit + -ka.
    add('adverb-ka', {type: 'suffix', inflected: 'ka', deinflected: '', conditionsIn: [], conditionsOut: ['n', 'adj', 'sg'], stemMinLength: 4,
        stemEndsWith: '[aeoulnrt]'});
    transform('adverb-tik', 'ablative of an adverb', 'Adverbs take -tik with no -e- after a consonant, and -dik after -n: hortik (from there), gaurtik, hemendik, handik.');
    add('adverb-tik', {type: 'suffix', inflected: 'tik', deinflected: '', conditionsIn: [], conditionsOut: ['adv'], stemMinLength: 2,
        stemEndsWith: '[lrsxz]'});
    add('adverb-tik', {type: 'suffix', inflected: 'dik', deinflected: '', conditionsIn: [], conditionsOut: ['adv'], stemMinLength: 2,
        stemEndsWith: '[n]'});
    add('adverb-tik', {type: 'wholeWord', inflected: 'geroztik', deinflected: 'gero', conditionsIn: [], conditionsOut: ['adv']});
    // hona, horra, hara: to here, to there; the allatives of hemen, hor, han.
    transform('adverb-place', 'allative, terminative or directive of hemen, hor, han', 'Hona (to here), horra and hara are the allatives of hemen, hor and han; honaino, honantz and the others their terminative and directive.');
    for (const [forms, lemma] of [[['hona', 'honaino', 'honantz'], 'hemen'], [['horra', 'horraino', 'horrantz'], 'hor'], [['hara', 'haraino', 'harantz'], 'han']]) {
        for (const form of forms) {
            add('adverb-place', {type: 'wholeWord', inflected: form, deinflected: lemma, conditionsIn: [], conditionsOut: ['adv']});
        }
    }
}

// --- Non-finite verb forms --------------------------------------------------
// The dictionary form of a verb is its perfective participle (ikusi, egin,
// hartu, etorri). The imperfective participle and the verbal noun take
// -t(z)en and -t(z)e on the participle's stem:
//   -tu, -du after l/n/r: hartu - hartzen, galdu - galtzen;
//   -i after a sibilant: ikasi - ikasten, hautsi - hausten, utzi - uzten,
//     itxi - ixten, irabazi - irabazten;
//   -i after another consonant: etorri - etortzen, ibili - ibiltzen,
//     eskaini - eskaintzen;
//   -n: egin - egiten, joan - joaten, izan - izaten;
//   a vowel or -l: jo - jotzen, bete - betetzen, eduki - edukitzen,
//     hil - hiltzen.
// Each pair is [ending of the form, ending of the participle, stem class].
const PARTICIPLE_STEMS = [
    ['tz', 'tu', null],
    ['tz', 'du', '[lnr]'],
    ['tz', '', '[aeiol]'],
    ['tz', 'i', '[lnr]'],
    ['tz', 'ri', '[r]'],
    ['st', 'si', null],
    ['st', 'tsi', null],
    ['st', 'stu', null],
    ['zt', 'zi', null],
    ['zt', 'tzi', null],
    ['zt', 'ztu', null],
    ['xt', 'txi', null],
    ['t', 'n', VOWEL],
];

function nonFinite() {
    transform('imperfective', 'imperfective participle', 'Imperfective participle, -t(z)en: ikusten (seeing), egiten, hartzen, etortzen. With an auxiliary it makes the present and the past habitual (ikusten dut, I see it).');
    transform('verbal-noun', 'verbal noun', 'Verbal noun, -t(z)e, declined like a noun: ikustea (seeing), egiteko (in order to do), joatera (to go), hartzean (when taking).');
    for (const [stem, participle, cls] of PARTICIPLE_STEMS) {
        const constraint = cls === null ? {} : {stemEndsWith: cls};
        add('imperfective', {type: 'suffix', inflected: stem + 'en', deinflected: participle, conditionsIn: [], conditionsOut: ['v'],
            stemMinLength: 1, ...constraint});
        add('verbal-noun', {type: 'suffix', inflected: stem + 'e', deinflected: participle, conditionsIn: ['sg', 'pl'], conditionsOut: ['v'],
            stemMinLength: 1, ...constraint});
    }
    // The radical (short form) is the participle without -tu, -du or -i, as
    // written before the subjunctive, potential and imperative auxiliaries
    // (ikus dezagun, har ezazu, ezin naiz joan / ezin da jar).
    transform('radical', 'radical (short form)', 'Radical of a verb, the participle without -tu, -du, -i or -ri, used before the subjunctive, potential and imperative auxiliaries: ikus (ikus dezagun, let us see), har ezazu (take it), jar, itzul, konpon, joka.');
    add('radical', {type: 'suffix', inflected: '', deinflected: 'tu', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 3, stemEndsWith: '[aeiou]'});
    add('radical', {type: 'suffix', inflected: '', deinflected: 'tu', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 3, stemEndsWith: '[rsz]'});
    add('radical', {type: 'suffix', inflected: '', deinflected: 'du', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 3, stemEndsWith: '[lnr]'});
    add('radical', {type: 'suffix', inflected: '', deinflected: 'i', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 3, stemEndsWith: '[lsxz]'});
    add('radical', {type: 'suffix', inflected: '', deinflected: 'ri', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 3, stemEndsWith: '[r]'});
    add('radical', {type: 'suffix', inflected: '', deinflected: 'u', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 5, stemEndsWith: '[t]'});
    // The subjunctive, potential and imperative forms of the auxiliaries
    // are built on the roots *edin and *ezan; dictionaries describe them
    // under izan and *edun (ukan), and wiktionary-to-yomitan has only a stub
    // for edin and no entry for ezan.
    transform('auxiliary-root', 'auxiliary', 'The verb an auxiliary root belongs to: *edin is izan\'s (nadin, daiteke), *ezan is *edun\'s (dezan, dezake, ezazu).');
    add('auxiliary-root', {type: 'wholeWord', inflected: 'edin', deinflected: 'izan', conditionsIn: ['v'], conditionsOut: ['v']});
    add('auxiliary-root', {type: 'wholeWord', inflected: 'ezan', deinflected: 'edun', conditionsIn: ['v'], conditionsOut: ['v']});
    transform('compound', 'compound verb', 'The first word of a compound verb cited with izan, written apart from its auxiliary: uste (uste izan, to think), nahi (nahi izan, to want), maite (maite izan, to love).');
    for (const w of COMPOUND_VERBS) {
        add('compound', {type: 'wholeWord', inflected: w, deinflected: `${w} izan`, conditionsIn: [], conditionsOut: ['v']});
    }
    transform('future', 'future participle', 'Future (prospective) participle, -ko, or -go after -n (-en after -n and -l in the east: eginen): ikusiko (will see), etorriko, egingo, joango. With an auxiliary it makes the future (ikusiko dut, I will see it).');
    // ü is Souletin (batüko).
    add('future', {type: 'suffix', inflected: 'ko', deinflected: '', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 2, stemEndsWith: '[aeioulü]'});
    add('future', {type: 'suffix', inflected: 'go', deinflected: '', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 2, stemEndsWith: '[n]'});
    // Navarrese and Lapurdian, and Batua beside -go: -en after -n and -l (eginen, hilen).
    add('future', {type: 'suffix', inflected: 'en', deinflected: '', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 2, stemEndsWith: '[nl]'});
    // beharko (beharko dut, I will have to) is the future of behar izan,
    // which dictionaries list as behar (need).
    add('future', {type: 'wholeWord', inflected: 'beharko', deinflected: 'behar', conditionsIn: [], conditionsOut: ['n', 'adj']});
    transform('resultative', 'resultative participle (-ta, -da)', 'Participle of a state or a completed action, -ta, or -da after -n and -l: ikusita (having seen), nekatuta (tired), eginda (done), hilda (dead).');
    add('resultative', {type: 'suffix', inflected: 'ta', deinflected: '', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 2, stemEndsWith: VOWEL});
    add('resultative', {type: 'suffix', inflected: 'da', deinflected: '', conditionsIn: [], conditionsOut: ['v'], stemMinLength: 2, stemEndsWith: '[ln]'});
    transform('relative-participle', 'relative participle (-tako, -dako)', 'Participle used before a noun, -tako, or -dako after -n and -l, declined like an adjective: ikusitako (seen), egindako (done), esandakoa (what was said).');
    add('relative-participle', {type: 'suffix', inflected: 'tako', deinflected: '', conditionsIn: ['sg', 'pl'], conditionsOut: ['v'], stemMinLength: 2, stemEndsWith: VOWEL});
    add('relative-participle', {type: 'suffix', inflected: 'dako', deinflected: '', conditionsIn: ['sg', 'pl'], conditionsOut: ['v'], stemMinLength: 2, stemEndsWith: '[ln]'});
}

// --- Closed classes ---------------------------------------------------------
// Pronouns, demonstratives and interrogatives have irregular oblique stems
// (hau - honek, hori - horretan, ni - nik, zer - zertan). Dictionaries list
// them without a part of speech, so these rules write no conditions, which
// any dictionary row passes. Each takes a text a case rule left (sg, pl), so
// a genitive declined again reaches its pronoun: nirea (mine) - nire - ni.
// The plural demonstratives' forms reach the plural (haiei - haiek).
const CLOSED_CASES = {
    erg: 'ergative', dat: 'dative', gen: 'genitive', com: 'comitative', ben: 'benefactive',
    mot: 'motivative (because of)', ins: 'instrumental', ine: 'inessive', loc: 'locative genitive (-ko)', abl: 'ablative',
    all: 'allative', ter: 'terminative', des: 'destinative', dir: 'directive', aine: 'inessive (animate)', aabl: 'ablative (animate)',
    aall: 'allative (animate)',
};
const CLOSED = {
    ni: {erg: 'nik', dat: 'niri', gen: 'nire', com: 'nirekin', ben: 'niretzat', mot: 'niregatik', ins: 'nitaz', aine: 'niregan nigan', aabl: 'nigandik', aall: 'nigana'},
    hi: {erg: 'hik', dat: 'hiri', gen: 'hire', com: 'hirekin', ben: 'hiretzat', mot: 'hiregatik', ins: 'hitaz', aine: 'hiregan higan', aabl: 'higandik', aall: 'higana'},
    gu: {erg: 'guk', dat: 'guri', gen: 'gure', com: 'gurekin', ben: 'guretzat', mot: 'guregatik', ins: 'gutaz', aine: 'guregan gugan', aabl: 'gugandik', aall: 'gugana'},
    zu: {erg: 'zuk', dat: 'zuri', gen: 'zure', com: 'zurekin', ben: 'zuretzat', mot: 'zuregatik', ins: 'zutaz', aine: 'zuregan zugan', aabl: 'zugandik', aall: 'zugana'},
    zuek: {dat: 'zuei zeuei', gen: 'zuen zeuen', com: 'zuekin zeuekin', ben: 'zuentzat zeuentzat', mot: 'zuengatik', ins: 'zuetaz', aine: 'zuengan', aabl: 'zuengandik', aall: 'zuengana', erg: 'zeuek'},
    neu: {erg: 'neuk', dat: 'neuri', gen: 'neure', com: 'neurekin', ben: 'neuretzat', mot: 'neuregatik', ins: 'neutaz', aine: 'neuregan'},
    heu: {erg: 'heuk', dat: 'heuri', gen: 'heure', com: 'heurekin', ben: 'heuretzat'},
    geu: {erg: 'geuk', dat: 'geuri', gen: 'geure', com: 'geurekin', ben: 'geuretzat', mot: 'geuregatik', ins: 'geutaz', aine: 'geuregan'},
    zeu: {erg: 'zeuk', dat: 'zeuri', gen: 'zeure', com: 'zeurekin', ben: 'zeuretzat', mot: 'zeuregatik', ins: 'zeutaz', aine: 'zeuregan'},
    hau: {erg: 'honek', dat: 'honi', gen: 'honen', com: 'honekin', ben: 'honentzat', mot: 'honengatik honegatik', ins: 'honetaz', ine: 'honetan',
        loc: 'honetako', abl: 'honetatik', all: 'honetara', ter: 'honetaraino', des: 'honetarako', aine: 'honengan', aabl: 'honengandik', aall: 'honengana'},
    hori: {erg: 'horrek', dat: 'horri', gen: 'horren', com: 'horrekin', ben: 'horrentzat', mot: 'horrengatik horregatik', ins: 'horretaz', ine: 'horretan',
        loc: 'horretako', abl: 'horretatik', all: 'horretara', ter: 'horretaraino', des: 'horretarako', aine: 'horrengan', aabl: 'horrengandik', aall: 'horrengana'},
    hura: {erg: 'hark', dat: 'hari', gen: 'haren', com: 'harekin', ben: 'harentzat', mot: 'harengatik hargatik', ins: 'hartaz', ine: 'hartan',
        loc: 'hartako', abl: 'hartatik', all: 'hartara', ter: 'hartaraino', des: 'hartarako', aine: 'harengan', aabl: 'harengandik', aall: 'harengana'},
    hauek: {dat: 'hauei', gen: 'hauen', com: 'hauekin', ben: 'hauentzat', mot: 'hauengatik', ins: 'hauetaz', ine: 'hauetan',
        loc: 'hauetako', abl: 'hauetatik', all: 'hauetara', ter: 'hauetaraino', des: 'hauetarako', aine: 'hauengan', aabl: 'hauengandik', aall: 'hauengana'},
    horiek: {dat: 'horiei', gen: 'horien', com: 'horiekin', ben: 'horientzat', mot: 'horiengatik', ins: 'horietaz', ine: 'horietan',
        loc: 'horietako', abl: 'horietatik', all: 'horietara', ter: 'horietaraino', des: 'horietarako', aine: 'horiengan', aabl: 'horiengandik', aall: 'horiengana'},
    haiek: {dat: 'haiei', gen: 'haien', com: 'haiekin', ben: 'haientzat', mot: 'haiengatik', ins: 'haietaz', ine: 'haietan',
        loc: 'haietako', abl: 'haietatik', all: 'haietara', ter: 'haietaraino', des: 'haietarako', aine: 'haiengan', aabl: 'haiengandik', aall: 'haiengana'},
    // bera (the same) has the oblique stem bere- in the local cases (une
    // berean, at the same moment).
    bera: {erg: 'berak beraiek', dat: 'berari beraiei', gen: 'beraren beraien', com: 'berarekin beraiekin', ben: 'berarentzat beraientzat',
        mot: 'berarengatik', aine: 'beragan berarengan', ine: 'berean', abl: 'beretik', all: 'berera', loc: 'bereko'},
    edonor: {dat: 'edonori', erg: 'edonork'},
    edozer: {dat: 'edozeri', erg: 'edozerk'},
    nor: {erg: 'nork', dat: 'nori', gen: 'noren', com: 'norekin', ben: 'norentzat', mot: 'norengatik', ins: 'noretaz', aine: 'norengan', aabl: 'norengandik', aall: 'norengana'},
    inor: {erg: 'inork', dat: 'inori', gen: 'inoren', com: 'inorekin', ben: 'inorentzat', mot: 'inorengatik', aine: 'inorengan'},
    zer: {erg: 'zerk', dat: 'zeri', gen: 'zeren', com: 'zerekin', ben: 'zerentzat', mot: 'zergatik', ins: 'zertaz zerez', ine: 'zertan',
        loc: 'zertako', abl: 'zertatik', all: 'zertara', ter: 'zertaraino', des: 'zertarako', dir: 'zertarantz'},
    ezer: {erg: 'ezerk', dat: 'ezeri', gen: 'ezeren', com: 'ezerekin', ben: 'ezerentzat', ins: 'ezertaz ezerez', ine: 'ezertan',
        loc: 'ezertako', abl: 'ezertatik', all: 'ezertara', des: 'ezertarako'},
    zein: {erg: 'zeintzuek', dat: 'zeintzuei', gen: 'zeintzuen', com: 'zeintzuekin', ine: 'zeintzuetan'},
    batzuk: {erg: 'batzuek', dat: 'batzuei', gen: 'batzuen', com: 'batzuekin', ben: 'batzuentzat', ine: 'batzuetan', loc: 'batzuetako',
        abl: 'batzuetatik', all: 'batzuetara'},
};

function closedClasses() {
    for (const [id, name] of Object.entries(CLOSED_CASES)) {
        transform(`closed-${id}`, name, `The ${name} of a pronoun, demonstrative or interrogative, whose stem changes: nik (I), honek (this one), horretan (in that), zertan (in what).`);
    }
    // Only the endings that are declined again (the genitive, -ko and -rako:
    // nirea, horretakoa, zertarakoa) take a text a case rule left; the other
    // oblique forms are read only as written (zerion is not zeri + -on).
    const STACKING = new Set(['gen', 'loc', 'des']);
    const IN = ['sg', 'pl'];
    for (const [lemma, cases] of Object.entries(CLOSED)) {
        for (const [caseId, forms] of Object.entries(cases)) {
            for (const form of forms.split(' ')) {
                add(`closed-${caseId}`, {type: 'wholeWord', inflected: form, deinflected: lemma, conditionsIn: STACKING.has(caseId) ? IN : [], conditionsOut: []});
            }
        }
    }
    // Determiners, pronouns and numerals that decline like nouns (bestea,
    // batean, zenbatek, norbaiti, biak) but have no part of speech in the
    // dictionary: the case rule removes the ending, and this rule lets the
    // stem reach the row. hiru and lau take an -r- before an ending (hirurak,
    // lauretan).
    transform('closed-stem', 'pronoun, determiner or numeral', 'A determiner, pronoun or numeral, which dictionaries list without a part of speech, after its case ending was removed: bestea, batean, zenbatek, norbaiti, biak, hiruretan.');
    for (const lemma of ['beste', 'bat', 'zenbat', 'norbait', 'zerbait', 'edozein', 'edonor', 'edozer', 'guzti', 'bakoitz', 'zein',
        'bi', 'bost', 'sei', 'zazpi', 'zortzi', 'bederatzi', 'hamar', 'hamaika', 'hogei', 'ehun', 'mila', 'bere']) {
        add('closed-stem', {type: 'wholeWord', inflected: lemma, deinflected: lemma, conditionsIn: IN, conditionsOut: []});
    }
    add('closed-stem', {type: 'wholeWord', inflected: 'hirur', deinflected: 'hiru', conditionsIn: IN, conditionsOut: []});
    add('closed-stem', {type: 'wholeWord', inflected: 'laur', deinflected: 'lau', conditionsIn: IN, conditionsOut: []});
}

// --- Finite verbs -----------------------------------------------------------
// A finite form encodes its absolutive (nor), dative (nori) and ergative
// (nork) persons. Each tense and set of persons is one transform, named with
// the pronouns of those persons in their case (hura = it, hari = to him or
// her, nik = I), so `present (hura, zuri, nik)` reads "I ... it to you".
// Person codes: 1s ni, 2f hi (familiar), 3s hura, 1p gu, 2s zu, 2p zuek,
// 3p haiek.
const PERSON = {
    '1s': {abs: 'ni', dat: 'niri', erg: 'nik'},
    '2f': {abs: 'hi', dat: 'hiri', erg: 'hik'},
    '3s': {abs: 'hura', dat: 'hari', erg: 'hark'},
    '1p': {abs: 'gu', dat: 'guri', erg: 'guk'},
    '2s': {abs: 'zu', dat: 'zuri', erg: 'zuk'},
    '2p': {abs: 'zuek', dat: 'zuei', erg: 'zuek'},
    '3p': {abs: 'haiek', dat: 'haiei', erg: 'haiek'},
};
const TENSES = {
    present: ['present', 'Present indicative'],
    past: ['past', 'Past indicative'],
    cond: ['conditional', 'Conditional (would), the result clause of a hypothesis'],
    condpast: ['past conditional', 'Past conditional (would have)'],
    hyp: ['hypothetical', 'Hypothetical stem, the condition of a hypothesis, written after ba- (if) or bait-'],
    pot: ['potential', 'Present potential (can, may)'],
    pothyp: ['hypothetical potential', 'Hypothetical potential (could, might)'],
    potpast: ['past potential', 'Past potential (could have)'],
    subj: ['subjunctive', 'Subjunctive, used with -n (so that, let) or -la (that ... should)'],
    subjpast: ['past subjunctive', 'Past subjunctive (so that ... would)'],
    imp: ['imperative', 'Imperative'],
    allo: ['familiar present', 'Present indicative in familiar speech to a friend (hika), which marks the listener'],
    allopast: ['familiar past', 'Past indicative in familiar speech to a friend (hika), which marks the listener'],
};
// Finite forms reach their verb from the text as written, from a form a
// suffix or prefix rule left (fin), and from a form a case rule left (sg,
// pl): zenean (when it was) - zen - izan.
const FIN_IN = ['dep'];
// What each tense's forms take: an imperative is never subordinated or
// prefixed (so bezala, like, is not beza + -la); a hypothetical form takes
// only a prefix (balitz, bailitzateke); a subjunctive only the relative or
// complementizer (dadin, dezala); the others both, and a case rule's output
// where the form ends in -n.
function finiteIn(tense, form) {
    if (tense === 'imp') { return []; }
    if (tense === 'hyp') { return ['pfx']; }
    if (tense === 'subj' || tense === 'subjpast') { return ['sub']; }
    return form.endsWith('n') ? FIN_IN : ['fin'];
}

function personList(spec) {
    // "1s:naiz 2f:haiz,hintz" -> [['1s', ['naiz']], ['2f', ['haiz', 'hintz']]]
    return spec.trim().split(/\s+/).map((item) => {
        const [person, forms] = item.split(':');
        if (!(person in PERSON) || !forms) { throw new Error(`bad person item ${item}`); }
        return [person, forms.split(',')];
    });
}

// paradigm: {key, lemmas, about, roles: 'nor' | 'nork' | 'nor-nork' |
// 'nor-nori' | 'nor-nori-nork', tenses: {tense: table}}. A table is a person
// list for 'nor' and 'nork', {abs: list} for 'nor-nork' (ergative persons)
// and 'nor-nori' (dative persons), and {abs: {dat: list}} for
// 'nor-nori-nork' (ergative persons). One transform holds one tense and set
// of persons for every verb, so its name is the same whatever the verb
// (present (hura, nik): dut, dakit, daukat), and its description lists the
// forms.
const cellsById = new Map();
// The four rarest tense families with a dative (balitzaio, liezaioke,
// ziezaiokeen, niokeen: about 220 of the subtitle list's 3.9 million tokens)
// have one transform each, which names the tense but not the persons, so the
// pack's tests stay within the 1 MB of section 3.
const COARSE_DATIVE = new Set(['hyp', 'pothyp', 'potpast', 'condpast']);

function paradigm(p) {
    const cells = [];
    for (const [tense, table] of Object.entries(p.tenses)) {
        if (!(tense in TENSES)) { throw new Error(`${p.key}: unknown tense ${tense}`); }
        if (p.roles === 'nor' || p.roles === 'nork') {
            for (const [person, forms] of personList(table)) {
                cells.push({tense, abs: p.roles === 'nor' ? person : null, dat: null, erg: p.roles === 'nork' ? person : null, forms});
            }
        } else if (p.roles === 'nor-nork' || p.roles === 'nor-nori') {
            for (const [abs, list] of Object.entries(table)) {
                for (const [person, forms] of personList(list)) {
                    cells.push({tense, abs, dat: p.roles === 'nor-nori' ? person : null, erg: p.roles === 'nor-nork' ? person : null, forms});
                }
            }
        } else {
            for (const [abs, dats] of Object.entries(table)) {
                for (const [dat, list] of Object.entries(dats)) {
                    for (const [erg, forms] of personList(list)) {
                        cells.push({tense, abs, dat, erg, forms});
                    }
                }
            }
        }
    }
    for (const cell of cells) {
        const coarse = cell.dat !== null && COARSE_DATIVE.has(cell.tense);
        const id = coarse ? `${cell.tense}-dative`
            : [cell.tense, cell.abs && `a${cell.abs}`, cell.dat && `d${cell.dat}`, cell.erg && `e${cell.erg}`].filter(Boolean).join('-');
        let entry = cellsById.get(id);
        if (entry === undefined) {
            entry = {cell, rules: [], compound: []};
            cellsById.set(id, entry);
        }
        for (const form of cell.forms) {
            // A case ending follows a finite form only through the relative
            // -n, and a past form ends in it (zen, zuen: zenean, zirenak), so
            // only forms in -n take a text a case rule left; biz (let it be)
            // is not read in bizi (biz + -i).
            const conditionsIn = finiteIn(cell.tense, form);
            for (const lemma of p.lemmas) {
                entry.rules.push({type: 'wholeWord', inflected: form, deinflected: lemma, conditionsIn, conditionsOut: ['v']});
            }
            if (compoundCell(p, cell)) {
                entry.compound.push(form);
            }
        }
    }
}

function finiteTransforms() {
    for (const [id, {cell, rules, compound}] of cellsById) {
        const roles = [];
        if (cell.abs !== null) { roles.push(PERSON[cell.abs].abs); }
        if (cell.dat !== null) { roles.push(PERSON[cell.dat].dat); }
        if (cell.erg !== null) { roles.push(PERSON[cell.erg].erg); }
        const [name] = TENSES[cell.tense];
        if (id.endsWith('-dative')) {
            transform(id, `${name} (with a dative)`, `${TENSES[cell.tense][1]}, with a dative person (nori); the forms name the persons.`);
            for (const rule of rules) { add(id, rule); }
            continue;
        }
        // The name gives the tense and the persons by their pronouns in the
        // case of their role (hura absolutive, niri dative, zuk ergative).
        // These transforms have no description, so the file stays small
        // (docs/languages.md section 3); the README explains the names.
        transform(id, `${name} (${roles.join(', ')})`, undefined);
        for (const rule of rules) { add(id, rule); }
        // Compound verbs cited with izan (uste izan, to think; nahi izan, to
        // want; maite izan, to love) are written as their first word and
        // the auxiliary: uste dut, nahi nuke, maite zaitut, bizi naiz. The
        // first word is the prefix, the auxiliary the suffix, and nothing
        // may come between them (an empty stem: [] has no members).
        // A dictionary decides which compounds exist: the rule writes " izan"
        // for the auxiliary whatever comes before it (a lookup starts at the
        // hovered word, so that is the compound's first word, or a phrase no
        // dictionary has). gauza izan (to be able) is left out, since gauza da
        // is more often "it is a thing".
        for (const form of compound) {
            add(id, {type: 'suffix', inflected: ' ' + form, deinflected: ' izan', conditionsIn: finiteIn(cell.tense, form),
                conditionsOut: ['v'], stemMinLength: 2, stemNotStartsWithText: 'gauza'});
        }
    }
}

// The first words of compound verbs cited with izan that dictionaries list
// (wiktionary-to-yomitan has each as "<word> izan"), for the word written
// apart from its auxiliary (ez dut uste). gauza izan and gisa izan are left
// out: gauza da is more often "it is a thing".
const COMPOUND_VERBS = ['uste', 'nahi', 'maite', 'bizi', 'beldur', 'ari', 'balio', 'gai', 'opa', 'presa'];
// The auxiliary forms that also read as a compound verb's: the present,
// past and conditional of izan and *edun, and of *edun with a dative when
// its object is the third person singular (opa dizut, I wish you).
const COMPOUND_TENSES = new Set(['present', 'past', 'cond']);
function compoundCell(p, cell) {
    return p.compound && COMPOUND_TENSES.has(cell.tense) && (cell.dat === null || cell.abs === '3s');
}

// Synthetic verbs: the verbs with finite forms of their own. They come before
// the auxiliaries, so where a form is both (dakit: jakin "I know" and the
// rare dative subjunctive of *edin) the common reading is found first.
const SYNTHETIC = [
    {key: 'egon', lemmas: ['egon'], about: 'egon (to be, to stay)', roles: 'nor', tenses: {
        present: '1s:nago 2f:hago 3s:dago 1p:gaude 2s:zaude 2p:zaudete 3p:daude',
        past: '1s:nengoen 2f:hengoen 3s:zegoen 1p:geunden 2s:zeunden 2p:zeundeten 3p:zeuden',
        imp: '2f:hago 2s:zaude 2p:zaudete 3s:bego 3p:beude',
        hyp: '1s:nengo 2f:hengo 3s:lego 1p:geunde 2s:zeunde 2p:zeundete 3p:leude',
        cond: '1s:nengoke 2f:hengoke 3s:legoke 1p:geundeke 2s:zeundeke 2p:zeundekete 3p:leudeke',
        allo: '1s:nagok,nagon 3s:zagok,zagon 1p:gaudek 3p:zaudek',
        allopast: '1s:nengoan,nengonan 3s:zegoan,zegonan 3p:zeudean,zeudenan',
    }},
    {key: 'egon-dat', lemmas: ['egon'], about: 'egon with a dative (to correspond, to belong to)', roles: 'nor-nori', tenses: {
        present: {'3s': '1s:dagokit 2f:dagokik 3s:dagokio 1p:dagokigu 2s:dagokizu 2p:dagokizue 3p:dagokie',
            '3p': '1s:dagozkit 3s:dagozkio 1p:dagozkigu 2s:dagozkizu 3p:dagozkie'},
        past: {'3s': '1s:zegokidan 3s:zegokion 1p:zegokigun 2s:zegokizun 2p:zegokizuen 3p:zegokien',
            '3p': '3s:zegozkion 3p:zegozkien'},
    }},
    {key: 'joan', lemmas: ['joan'], about: 'joan (to go)', roles: 'nor', tenses: {
        present: '1s:noa 2f:hoa 3s:doa 1p:goaz 2s:zoaz 2p:zoazte 3p:doaz',
        past: '1s:nindoan 2f:hindoan 3s:zihoan 1p:gindoazen 2s:zindoazen 2p:zindoazten 3p:zihoazen',
        imp: '1p:goazen 2f:hoa 2s:zoaz 2p:zoazte 3s:bihoa 3p:bihoaz',
        hyp: '1s:nindoa 2f:hindoa 3s:lihoa 1p:gindoaz 2s:zindoaz 2p:zindoazte 3p:lihoaz',
        allo: '1s:noak 3s:zoak',
    }},
    {key: 'joan-dat', lemmas: ['joan'], about: 'joan with a dative (to go to, to concern)', roles: 'nor-nori', tenses: {
        present: {'3s': '1s:doakit 3s:doakio 1p:doakigu 2s:doakizu 3p:doakie', '3p': '1s:doazkit 3s:doazkio 2s:doazkizu 3p:doazkie',
            '1s': '3s:noakio 2s:noakizu 3p:noakie'},
    }},
    {key: 'etorri', lemmas: ['etorri'], about: 'etorri (to come)', roles: 'nor', tenses: {
        present: '1s:nator 2f:hator 3s:dator 1p:gatoz 2s:zatoz 2p:zatozte 3p:datoz',
        past: '1s:nentorren 2f:hentorren 3s:zetorren 1p:gentozen 2s:zentozen 2p:zentozten 3p:zetozen',
        imp: '2f:hator 2s:zatoz 2p:zatozte 3s:betor 3p:betoz',
        hyp: '1s:nentor 2f:hentor 3s:letor 1p:gentoz 2s:zentoz 2p:zentozte 3p:letoz',
    }},
    {key: 'etorri-dat', lemmas: ['etorri'], about: 'etorri with a dative (to come to)', roles: 'nor-nori', tenses: {
        present: {'3s': '1s:datorkit 2f:datorkik 3s:datorkio 1p:datorkigu 2s:datorkizu 2p:datorkizue 3p:datorkie',
            '3p': '1s:datozkit 3s:datozkio 1p:datozkigu 2s:datozkizu 3p:datozkie'},
        past: {'3s': '1s:zetorkidan 3s:zetorkion 1p:zetorkigun 2s:zetorkizun 3p:zetorkien'},
    }},
    {key: 'ibili', lemmas: ['ibili'], about: 'ibili (to walk, to go around, to be busy)', roles: 'nor', tenses: {
        present: '1s:nabil 2f:habil 3s:dabil 1p:gabiltza 2s:zabiltza 2p:zabiltzate 3p:dabiltza',
        past: '1s:nenbilen 2f:henbilen 3s:zebilen 1p:genbiltzan 2s:zenbiltzan 2p:zenbiltzaten 3p:zebiltzan',
        imp: '2f:habil 2s:zabiltza 2p:zabiltzate 3s:bebil 3p:bebiltza',
    }},
    {key: 'ibili-dat', lemmas: ['ibili'], about: 'ibili with a dative (to go around for, to happen to)', roles: 'nor-nori', tenses: {
        present: {'3s': '1s:dabilkit 3s:dabilkio 1p:dabilkigu 2s:dabilkizu 2p:dabilkizue 3p:dabilkie'},
    }},
    {key: 'etzan', lemmas: ['etzan'], about: 'etzan (to lie; datza, to consist in)', roles: 'nor', tenses: {
        present: '1s:natza 2f:hatza 3s:datza 1p:gautza 2s:zautza 2p:zautzate 3p:dautza',
        past: '1s:netzan 2f:hetzan 3s:zetzan',
    }},
    {key: 'jakin', lemmas: ['jakin'], about: 'jakin (to know)', roles: 'nor-nork', tenses: {
        present: {'3s': '1s:dakit 2f:dakik,dakin 3s:daki 1p:dakigu 2s:dakizu 2p:dakizue 3p:dakite',
            '3p': '1s:dakizkit 2f:dakizkik 3s:dakizki 1p:dakizkigu 2s:dakizkizu 2p:dakizkizue 3p:dakizkite'},
        past: {'3s': '1s:nekien 2f:hekien 3s:zekien 1p:genekien 2s:zenekien 2p:zenekiten 3p:zekiten',
            '3p': '1s:nekizkien 2f:hekizkien 3s:zekizkien 1p:genekizkien 2s:zenekizkien 2p:zenekizkiten 3p:zekizkiten'},
        hyp: {'3s': '1s:neki 2f:heki 3s:leki 1p:geneki 2s:zeneki 2p:zenekite 3p:lekite'},
        cond: {'3s': '1s:nekike 3s:lekike 1p:genekike 2s:zenekike 3p:lekikete'},
        imp: {'3s': '2f:jakik 2s:jakizu 2p:jakizue 3s:beki 3p:bekite'},
        allo: {'3s': '1s:zakiat,zakinat'},
    }},
    {key: 'eduki', lemmas: ['eduki'], about: 'eduki (to have, to hold)', roles: 'nor-nork', tenses: {
        present: {'3s': '1s:daukat 2f:daukak 3s:dauka 1p:daukagu 2s:daukazu 2p:daukazue 3p:daukate',
            '3p': '1s:dauzkat 2f:dauzkak 3s:dauzka 1p:dauzkagu 2s:dauzkazu 2p:dauzkazue 3p:dauzkate'},
        past: {'3s': '1s:neukan 2f:heukan 3s:zeukan 1p:geneukan 2s:zeneukan 2p:zeneukaten 3p:zeukaten',
            '3p': '1s:neuzkan 2f:heuzkan 3s:zeuzkan 1p:geneuzkan 2s:zeneuzkan 2p:zeneuzkaten 3p:zeuzkaten'},
        hyp: {'3s': '1s:neuka 3s:leuka 1p:geneuka 2s:zeneuka 3p:leukate'},
        imp: {'3s': '3s:beuka 3p:beukate', '3p': '3s:beuzka 3p:beuzkate'},
    }},
    {key: 'eduki-persons', lemmas: ['eduki'], about: 'eduki (to have, to hold) with a first or second person object', roles: 'nor-nork', tenses: {
        present: {'1s': '2f:naukak 3s:nauka 2s:naukazu 2p:naukazue 3p:naukate',
            '1p': '2f:gauzkak 3s:gauzka 2s:gauzkazu 2p:gauzkazue 3p:gauzkate',
            '2s': '1s:zauzkat 3s:zauzka 1p:zauzkagu 3p:zauzkate',
            '2p': '1s:zauzkatet 3s:zauzkate 1p:zauzkategu 3p:zauzkatete',
            '2f': '1s:haukat 3s:hauka 1p:haukagu 3p:haukate'},
    }},
    {key: 'ekarri', lemmas: ['ekarri'], about: 'ekarri (to bring)', roles: 'nor-nork', tenses: {
        present: {'3s': '1s:dakart 2f:dakark 3s:dakar 1p:dakargu 2s:dakarzu 2p:dakarzue 3p:dakarte',
            '3p': '1s:dakartzat 2f:dakartzak 3s:dakartza 1p:dakartzagu 2s:dakartzazu 2p:dakartzazue 3p:dakartzate'},
        past: {'3s': '1s:nekarren 2f:hekarren 3s:zekarren 1p:genekarren 2s:zenekarren 2p:zenekarten 3p:zekarten',
            '3p': '1s:nekartzan 2f:hekartzan 3s:zekartzan 1p:genekartzan 2s:zenekartzan 2p:zenekartzaten 3p:zekartzaten'},
        imp: {'3s': '2f:ekark 2s:ekarzu 2p:ekarzue 3s:bekar 3p:bekarte', '3p': '2f:ekartzak 2s:ekartzazu 2p:ekartzazue',
            '1s': '2s:nakarzu 2p:nakarzue'},
    }},
    {key: 'ekarri-persons', lemmas: ['ekarri'], about: 'ekarri (to bring) with a first or second person object', roles: 'nor-nork', tenses: {
        present: {'1s': '2f:nakark 3s:nakar 2s:nakarzu 2p:nakarzue 3p:nakarte',
            '1p': '2f:gakartzak 3s:gakartza 2s:gakartzazu 2p:gakartzazue 3p:gakartzate',
            '2s': '1s:zakartzat 3s:zakartza 1p:zakartzagu 3p:zakartzate',
            '2f': '1s:hakart 3s:hakar 1p:hakargu 3p:hakarte'},
    }},
    {key: 'ekarri-dat', lemmas: ['ekarri'], about: 'ekarri with a dative (to bring it to)', roles: 'nor-nori-nork', tenses: {
        present: {'3s': {'3s': '1s:dakarkiot 3s:dakarkio 1p:dakarkiogu 2s:dakarkiozu 2p:dakarkiozue 3p:dakarkiote',
            '1s': '3s:dakarkit 2s:dakarkidazu 2p:dakarkidazue 3p:dakarkidate', '2s': '1s:dakarkizut 3s:dakarkizu 1p:dakarkizugu 3p:dakarkizute',
            '2p': '1s:dakarkizuet 3s:dakarkizue 1p:dakarkizuegu 3p:dakarkizuete', '1p': '3s:dakarkigu 2s:dakarkiguzu 3p:dakarkigute',
            '3p': '1s:dakarkiet 3s:dakarkie 1p:dakarkiegu 2s:dakarkiezu 3p:dakarkiete'}},
        imp: {'3s': {'3s': '2s:ekarriozu 2p:ekarriozue', '1s': '2f:ekardak 2s:ekardazu 2p:ekardazue', '1p': '2s:ekarguzu', '3p': '2s:ekarriezu'},
            '3p': {'3s': '2s:ekarzkiozu', '1s': '2s:ekarzkidazu', '1p': '2s:ekarzkiguzu', '3p': '2s:ekarzkiezu'}},
        past: {'3s': {'3s': '1s:nekarkion 3s:zekarkion 1p:genekarkion 2s:zenekarkion 3p:zekarkioten',
            '1s': '3s:zekarkidan 3p:zekarkidaten', '2s': '1s:nekarkizun 3s:zekarkizun', '1p': '3s:zekarkigun', '3p': '3s:zekarkien'}},
    }},
    {key: 'eraman', lemmas: ['eraman'], about: 'eraman (to carry, to take; with a time, to have spent)', roles: 'nor-nork', tenses: {
        present: {'3s': '1s:daramat 2f:daramak 3s:darama 1p:daramagu 2s:daramazu 2p:daramazue 3p:daramate',
            '3p': '1s:daramatzat 2f:daramatzak 3s:daramatza 1p:daramatzagu 2s:daramatzazu 2p:daramatzazue 3p:daramatzate'},
        past: {'3s': '1s:neraman 2f:heraman 3s:zeraman 1p:generaman 2s:zeneraman 2p:zeneramaten 3p:zeramaten',
            '3p': '1s:neramatzan 2f:heramatzan 3s:zeramatzan 1p:generamatzan 2s:zeneramatzan 2p:zeneramatzaten 3p:zeramatzaten'},
        imp: {'3s': '2f:eramak 2s:eramazu 2p:eramazue 3s:berama 3p:beramate', '3p': '2f:eramatzak 2s:eramatzazu 2p:eramatzazue',
            '1s': '2f:naramak 2s:naramazu 2p:naramazue'},
    }},
    {key: 'eraman-persons', lemmas: ['eraman'], about: 'eraman (to carry, to take) with a first or second person object', roles: 'nor-nork', tenses: {
        present: {'1s': '2f:naramak 3s:narama 2s:naramazu 2p:naramazue 3p:naramate',
            '1p': '2f:garamatzak 3s:garamatza 2s:garamatzazu 2p:garamatzazue 3p:garamatzate',
            '2s': '1s:zaramatzat 3s:zaramatza 1p:zaramatzagu 3p:zaramatzate',
            '2f': '1s:haramat 3s:harama 1p:haramagu 3p:haramate'},
    }},
    {key: 'eraman-dat', lemmas: ['eraman'], about: 'eraman with a dative (to take it to)', roles: 'nor-nori-nork', tenses: {
        present: {'3s': {'3s': '1s:daramakiot 3s:daramakio 1p:daramakiogu 2s:daramakiozu 2p:daramakiozue 3p:daramakiote',
            '1s': '3s:daramakit 2s:daramakidazu 3p:daramakidate', '2s': '1s:daramakizut 3s:daramakizu 1p:daramakizugu 3p:daramakizute',
            '1p': '3s:daramakigu 2s:daramakiguzu 3p:daramakigute', '3p': '1s:daramakiet 3s:daramakie 1p:daramakiegu 2s:daramakiezu 3p:daramakiete'}},
    }},
    {key: 'erabili', lemmas: ['erabili'], about: 'erabili (to use)', roles: 'nor-nork', tenses: {
        present: {'3s': '1s:darabilt 2f:darabilk 3s:darabil 1p:darabilgu 2s:darabilzu 2p:darabilzue 3p:darabilte',
            '3p': '1s:darabiltzat 2f:darabiltzak 3s:darabiltza 1p:darabiltzagu 2s:darabiltzazu 2p:darabiltzazue 3p:darabiltzate'},
        past: {'3s': '1s:nerabilen 2f:herabilen 3s:zerabilen 1p:generabilen 2s:zenerabilen 2p:zenerabilten 3p:zerabilten',
            '3p': '1s:nerabiltzan 3s:zerabiltzan 1p:generabiltzan 2s:zenerabiltzan 2p:zenerabiltzaten 3p:zerabiltzaten'},
    }},
    {key: 'esan', lemmas: ['esan'], about: 'esan (to say)', roles: 'nor-nork', tenses: {
        present: {'3s': '1s:diot 2f:diok 3s:dio 1p:diogu 2s:diozu 2p:diozue 3p:diote'},
        imp: {'3s': '2f:esak 2s:esazu 2p:esazue'},
        past: {'3s': '1s:nioen 2f:hioen 3s:zioen 1p:genioen 2s:zenioen 2p:zenioten 3p:zioten'},
    }},
    {key: 'esan-dat', lemmas: ['esan'], about: 'esan with a dative (to say to, to tell)', roles: 'nor-nori-nork', tenses: {
        present: {'3s': {'3s': '1s:diotsot 3s:diotso 1p:diotsogu 2s:diotsozu 2p:diotsozue 3p:diotsote',
            '3p': '1s:diotset 3s:diotse 1p:diotsegu 2s:diotsezu 2p:diotsezue 3p:diotsete',
            '2s': '1s:diotsut 3s:diotsu 1p:diotsugu 3p:diotsute', '2p': '1s:diotsuet 3s:diotsue 1p:diotsuegu 3p:diotsuete',
            '1p': '3s:diosku 2s:dioskuzu 3p:dioskute'}},
        imp: {'3s': {'3s': '2f:esaiok 2s:esaiozu 2p:esaiozue', '1s': '2f:esadak 2s:esadazu 2p:esadazue',
            '1p': '2f:esaguk 2s:esaguzu 2p:esaguzue', '3p': '2f:esaiek 2s:esaiezu 2p:esaiezue'}},
    }},
    {key: 'eman-dat', lemmas: ['eman'], about: 'eman with a dative (to give to)', roles: 'nor-nori-nork', tenses: {
        imp: {'3s': {'3s': '2f:emaiok 2s:emaiozu 2p:emaiozue', '1s': '2f:emadak 2s:emaidazu,emadazu 2p:emaidazue,emadazue',
            '1p': '2s:emaiguzu,emaguzu 2p:emaiguzue', '3p': '2s:emaiezu 2p:emaiezue'}},
    }},
    {key: 'egin', lemmas: ['egin'], about: 'egin (to do, to make)', roles: 'nor-nork', tenses: {
        imp: {'3s': '2f:egik 2s:egizu 2p:egizue'},
    }},
    {key: 'egin-dat', lemmas: ['egin'], about: 'egin with a dative (to do for, to do to)', roles: 'nor-nori-nork', tenses: {
        imp: {'3s': {'3s': '2s:egiozu 2p:egiozue', '1s': '2f:egidak 2s:egidazu 2p:egidazue', '1p': '2s:egiguzu', '3p': '2s:egiezu'}},
    }},
    {key: 'iruditu', lemmas: ['iruditu'], about: 'iruditu (to seem, to look like)', roles: 'nork', tenses: {
        present: '1s:dirudit 2f:dirudik 3s:dirudi 1p:dirudigu 2s:dirudizu 2p:dirudizue 3p:dirudite',
        past: '1s:nirudien 2f:hirudien 3s:zirudien 1p:genirudien 2s:zenirudien 2p:zeniruditen 3p:ziruditen',
    }},
    {key: 'iraun', lemmas: ['iraun'], about: 'iraun (to last, to endure)', roles: 'nork', tenses: {
        present: '1s:diraut 3s:dirau 1p:diraugu 2s:dirauzu 3p:diraute',
        past: '1s:nirauen 3s:zirauen 1p:genirauen 2s:zenirauen 3p:zirauten',
    }},
    {key: 'jardun', lemmas: ['jardun'], about: 'jardun (to be engaged in, to keep doing)', roles: 'nork', tenses: {
        present: '1s:dihardut 2f:diharduk 3s:dihardu 1p:dihardugu 2s:diharduzu 2p:diharduzue 3p:dihardute',
        past: '1s:nihardun 3s:zihardun 1p:genihardun 2s:zenihardun 3p:ziharduten',
    }},
    {key: 'iritzi', lemmas: ['iritzi'], about: 'iritzi (to consider, to think of), with the thing thought of in the dative', roles: 'nor-nori-nork', tenses: {
        present: {'3s': {'3s': '1s:deritzot,deritzat 2f:deritzok 3s:deritzo,deritza 1p:deritzogu,deritzagu 2s:deritzozu 2p:deritzozue 3p:deritzote',
            '3p': '1s:deritzet 3s:deritze 1p:deritzegu 2s:deritzezu 3p:deritzete'}},
        past: {'3s': {'3s': '1s:neritzon 3s:zeritzon 1p:generitzon 2s:zeneritzon 3p:zeritzoten'}},
    }},
    {key: 'jario', lemmas: ['jario'], about: 'jario (to flow, to drip from), with the source in the dative', roles: 'nor-nori', tenses: {
        present: {'3s': '1s:darit 3s:dario 1p:darigu 2s:darizu 2p:darizue 3p:darie'},
        past: {'3s': '1s:zeridan 3s:zerion 3p:zerien'},
    }},
    {key: 'egin-present', lemmas: ['egin'], about: 'egin (to do), its literary synthetic present', roles: 'nor-nork', tenses: {
        present: {'3s': '1s:dagit 2f:dagik 3s:dagi 1p:dagigu 2s:dagizu 2p:dagizue 3p:dagite'},
    }},
    {key: 'ikusi', lemmas: ['ikusi'], about: 'ikusi (to see), its literary synthetic forms', roles: 'nor-nork', tenses: {
        present: {'3s': '1s:dakusat 2f:dakusak 3s:dakusa 1p:dakusagu 2s:dakusazu 2p:dakusazue 3p:dakusate'},
        past: {'3s': '1s:nekusan 2f:hekusan 3s:zekusan 1p:genekusan 2s:zenekusan 2p:zenekusaten 3p:zekusaten'},
    }},
    {key: 'entzun-imp', lemmas: ['entzun'], about: 'entzun (to listen)', roles: 'nor-nork', tenses: {
        imp: {'3s': '2s:entzuzu 2p:entzuzue'},
    }},
    {key: 'entzun-dat', lemmas: ['entzun'], about: 'entzun with a dative (to listen to)', roles: 'nor-nori-nork', tenses: {
        imp: {'3s': {'1s': '2f:entzudak 2s:entzudazu 2p:entzudazue'}},
    }},
    {key: 'eutsi-dat', lemmas: ['eutsi'], about: 'eutsi with a dative (to hold on to)', roles: 'nor-nori-nork', tenses: {
        imp: {'3s': {'3s': '2f:eutsiok 2s:eutsiozu 2p:eutsiozue'}},
    }},
    {key: 'entzun', lemmas: ['entzun'], about: 'entzun (to hear), its literary synthetic forms', roles: 'nor-nork', tenses: {
        present: {'3s': '1s:dantzut 2f:dantzuk 3s:dantzu 1p:dantzugu 2s:dantzuzu 2p:dantzuzue 3p:dantzute'},
        past: {'3s': '1s:nentzuen 3s:zentzuen 1p:genentzuen 2s:zenentzuen 3p:zentzuten'},
    }},
];

// The auxiliaries. izan (intransitive, nor), *edun or ukan (transitive,
// nor-nork; dictionaries list it as edun), and the forms with a dative
// (nor-nori, nor-nori-nork). The subjunctive, potential and imperative are
// built on the roots *edin and *ezan; their forms reach both the root and
// the verb whose dictionary entry describes the auxiliary (izan, edun).
// A few familiar (hi) forms that are also common words are left out: hau
// (this) as "he has you", zain (waiting) as "it is to you (f.)", and the
// feminine dion, didan and digun, which are also the -n forms of dio, dit
// and digu. zan, ziran and nintzan (zen, ziren, nintzen), det, dezu, degu
// and dezue (dut, duzu, dugu, duzue), genduen,
// zenduen and zenduten (genuen, zenuen, zenuten), and zuan and zituan
// (zuen, zituen) are Gipuzkoan forms that older literature writes (Txomin
// Agirre's Garoa); zuan and zituan are also the familiar forms of zen and
// ziren, which come after them.
const AUXILIARIES = [
    {key: 'izan', lemmas: ['izan'], compound: true, about: 'izan (to be), the intransitive auxiliary', roles: 'nor', tenses: {
        present: '1s:naiz 2f:haiz 3s:da 1p:gara 2s:zara 2p:zarete 3p:dira',
        past: '1s:nintzen,nintzan 2f:hintzen 3s:zen,zan 1p:ginen 2s:zinen 2p:zineten 3p:ziren,ziran',
        cond: '1s:nintzateke 2f:hintzateke 3s:litzateke 1p:ginateke 2s:zinateke 2p:zinatekete 3p:lirateke',
        condpast: '1s:nintzatekeen 2f:hintzatekeen 3s:zatekeen 1p:ginatekeen 2s:zinatekeen 2p:zinateketen 3p:ziratekeen',
        hyp: '1s:nintz 2f:hintz 3s:litz,bailitzan 1p:gina 2s:zina 2p:zinete 3p:lira',
        pot: '1s:naizateke 2f:haizateke 3s:dateke 1p:garateke 2s:zarateke 2p:zaratekete 3p:dirateke',
        imp: '3s:biz 3p:bira',
    }},
    // The familiar forms of izan are built on the root of *edun (duk, zuan),
    // and UniMorph lists them under edun, so they reach both.
    {key: 'izan-allo', lemmas: ['izan', 'edun'], about: 'izan (to be) in familiar speech to a friend', roles: 'nor', tenses: {
        allo: '1s:nauk,naun 3s:duk,dun 1p:gaituk,gaitun 3p:dituk,ditun',
        allopast: '1s:ninduan,nindunan 3s:zuan,zunan 1p:gintuan,gintunan 3p:zituan,zitunan',
    }},
    {key: 'edin', lemmas: ['edin'], about: '*edin, the root of the intransitive auxiliary\'s subjunctive, potential and imperative', roles: 'nor', tenses: {
        pot: '1s:naiteke 2f:haiteke 3s:daiteke 1p:gaitezke 2s:zaitezke 2p:zaitezkete 3p:daitezke',
        pothyp: '1s:ninteke 2f:hinteke 3s:liteke 1p:gintezke 2s:zintezke 2p:zintezkete 3p:litezke',
        potpast: '1s:nintekeen 2f:hintekeen 3s:zitekeen 1p:gintezkeen 2s:zintezkeen 2p:zintezketen 3p:zitezkeen',
        subj: '1s:nadi 2f:hadi 3s:dadi 1p:gaitez 2s:zaitez 2p:zaitezte 3p:daitez',
        subjpast: '1s:nendin 2f:hendin 3s:zedin 1p:gintezen 2s:zintezen 2p:zintezten 3p:zitezen',
        hyp: '1s:nendi 2f:hendi 3s:ledi 1p:gintez 2s:zintez 2p:zintezte 3p:litez',
        imp: '2f:hadi 2s:zaitez 2p:zaitezte 3s:bedi 3p:bitez',
    }},
    {key: 'ukan', lemmas: ['edun'], compound: true, about: '*edun (ukan), the transitive auxiliary and "to have"', roles: 'nor-nork', tenses: {
        present: {
            '1s': '2f:nauk,naun 3s:nau 2s:nauzu 2p:nauzue 3p:naute',
            '2f': '1s:haut 1p:haugu 3p:haute',
            '3s': '1s:dut,det 2f:duk,dun 3s:du 1p:dugu,degu 2s:duzu,dezu 2p:duzue,dezue 3p:dute',
            '1p': '2f:gaituk,gaitun 3s:gaitu 2s:gaituzu 2p:gaituzue 3p:gaituzte',
            '2s': '1s:zaitut 3s:zaitu 1p:zaitugu 3p:zaituzte',
            '2p': '1s:zaituztet 3s:zaituzte 1p:zaituztegu 3p:zaituztete',
            '3p': '1s:ditut 2f:dituk,ditun 3s:ditu 1p:ditugu 2s:dituzu 2p:dituzue 3p:dituzte',
        },
        past: {
            '1s': '2f:ninduan,nindunan 3s:ninduen 2s:ninduzun 2p:ninduzuen 3p:ninduten',
            '2f': '1s:hindudan 3s:hinduen 1p:hindugun 3p:hinduten',
            '3s': '1s:nuen 2f:huen 3s:zuen,zuan 1p:genuen,genduen 2s:zenuen,zenduen 2p:zenuten,zenduten 3p:zuten',
            '1p': '2f:gintuan,gintunan 3s:gintuen 2s:gintuzun 2p:gintuzuen 3p:gintuzten',
            '2s': '1s:zintudan 3s:zintuen 1p:zintugun 3p:zintuzten',
            '2p': '1s:zintuztedan 3s:zintuzten 1p:zintuztegun 3p:zintuzteten',
            '3p': '1s:nituen 2f:hituen 3s:zituen,zituan 1p:genituen 2s:zenituen 2p:zenituzten 3p:zituzten',
        },
        cond: {
            '1s': '3s:ninduke 2s:nindukezu 2p:nindukezue 3p:nindukete',
            '3s': '1s:nuke 2f:huke 3s:luke 1p:genuke 2s:zenuke 2p:zenukete 3p:lukete',
            '1p': '3s:gintuzke 2s:gintuzkezu 2p:gintuzkezue 3p:gintuzkete',
            '2s': '1s:zintuzket 3s:zintuzke 1p:zintuzkegu 3p:zintuzkete',
            '2p': '1s:zintuzketet 3s:zintuzkete 1p:zintuzketegu 3p:zintuzketete',
            '3p': '1s:nituzke 2f:hituzke 3s:lituzke 1p:genituzke 2s:zenituzke 2p:zenituzkete 3p:lituzkete',
        },
        condpast: {
            '1s': '3s:nindukeen 2s:nindukezun 2p:nindukezuen 3p:ninduketen',
            '3s': '1s:nukeen 2f:hukeen 3s:zukeen 1p:genukeen 2s:zenukeen 2p:zenuketen 3p:zuketen',
            '1p': '3s:gintuzkeen 2s:gintuzkezun 2p:gintuzkezuen 3p:gintuzketen',
            '2s': '1s:zintuzkedan 3s:zintuzkeen 1p:zintuzkegun 3p:zintuzketen',
            '3p': '1s:nituzkeen 2f:hituzkeen 3s:zituzkeen 1p:genituzkeen 2s:zenituzkeen 2p:zenituzketen 3p:zituzketen',
        },
        hyp: {
            '1s': '3s:nindu 2s:ninduzu 2p:ninduzue 3p:nindute',
            '3s': '1s:nu 2f:hu 3s:lu 1p:genu 2s:zenu 2p:zenute 3p:lute',
            '1p': '3s:gintu 2s:gintuzu 2p:gintuzue 3p:gintuzte',
            '2s': '1s:zintut 3s:zintu 1p:zintugu 3p:zintuzte',
            '3p': '1s:nitu 2f:hitu 3s:litu 1p:genitu 2s:zenitu 2p:zenituzte 3p:lituzte',
        },
        pot: {'3s': '1s:duket 2f:dukek 3s:duke 1p:dukegu 2s:dukezu 2p:dukezue 3p:dukete',
            '3p': '1s:dituket 3s:dituke 1p:ditukegu 2s:ditukezu 3p:ditukete'},
        allo: {'3s': '1s:diat,dinat 3s:dik,din 1p:diagu,dinagu 3p:ditek,diten', '3p': '1s:ditiat,ditinat 3s:ditik,ditin 1p:ditiagu,ditinagu 3p:ditiztek,ditizten'},
    }},
    {key: 'ezan', lemmas: ['ezan'], about: '*ezan, the root of the transitive auxiliary\'s subjunctive, potential and imperative', roles: 'nor-nork', tenses: {
        pot: {
            '1s': '2f:nazakek 3s:nazake 2s:nazakezu 2p:nazakezue 3p:nazakete',
            '2f': '1s:hazaket 3s:hazake 1p:hazakegu 3p:hazakete',
            '3s': '1s:dezaket 2f:dezakek 3s:dezake 1p:dezakegu 2s:dezakezu 2p:dezakezue 3p:dezakete',
            '1p': '2f:gaitzakek 3s:gaitzake 2s:gaitzakezu 2p:gaitzakezue 3p:gaitzakete',
            '2s': '1s:zaitzaket 3s:zaitzake 1p:zaitzakegu 3p:zaitzakete',
            '2p': '1s:zaitzaketet 3s:zaitzakete 1p:zaitzaketegu 3p:zaitzaketete',
            '3p': '1s:ditzaket 2f:ditzakek 3s:ditzake 1p:ditzakegu 2s:ditzakezu 2p:ditzakezue 3p:ditzakete',
        },
        pothyp: {
            '1s': '2f:nintzakek 3s:nintzake 2s:nintzakezu 2p:nintzakezue 3p:nintzakete',
            '2f': '1s:hintzaket 3s:hintzake 1p:hintzakegu 3p:hintzakete',
            '3s': '1s:nezake 2f:hezake 3s:lezake 1p:genezake 2s:zenezake 2p:zenezakete 3p:lezakete',
            '1p': '2f:gintzakek 3s:gintzake 2s:gintzakezu 2p:gintzakezue 3p:gintzakete',
            '2s': '1s:zintzaket 3s:zintzake 1p:zintzakegu 3p:zintzakete',
            '2p': '1s:zintzaketet 3s:zintzakete 1p:zintzaketegu 3p:zintzaketete',
            '3p': '1s:nitzake 2f:hitzake 3s:litzake 1p:genitzake 2s:zenitzake 2p:zenitzakete 3p:litzakete',
        },
        potpast: {
            '1s': '3s:nintzakeen 2s:nintzakezun 2p:nintzakezuen 3p:nintzaketen',
            '2f': '1s:hintzakedan 3s:hintzakeen 1p:hintzakegun 3p:hintzaketen',
            '3s': '1s:nezakeen 2f:hezakeen 3s:zezakeen 1p:genezakeen 2s:zenezakeen 2p:zenezaketen 3p:zezaketen',
            '1p': '3s:gintzakeen 2s:gintzakezun 2p:gintzakezuen 3p:gintzaketen',
            '2s': '1s:zintzakedan 3s:zintzakeen 1p:zintzakegun 3p:zintzaketen',
            '3p': '1s:nitzakeen 2f:hitzakeen 3s:zitzakeen 1p:genitzakeen 2s:zenitzakeen 2p:zenitzaketen 3p:zitzaketen',
        },
        subj: {
            '1s': '2f:nazak 3s:naza 2s:nazazu 2p:nazazue 3p:nazate',
            '2f': '1s:hazat 3s:haza 1p:hazagu 3p:hazate',
            '3s': '1s:dezat 2f:dezak 3s:deza 1p:dezagu 2s:dezazu 2p:dezazue 3p:dezate',
            '1p': '2f:gaitzak 3s:gaitza 2s:gaitzazu 2p:gaitzazue 3p:gaitzate',
            '2s': '1s:zaitzat 3s:zaitza 1p:zaitzagu 3p:zaitzate',
            '2p': '1s:zaitzatet 3s:zaitzate 1p:zaitzategu 3p:zaitzatete',
            '3p': '1s:ditzat 2f:ditzak 3s:ditza 1p:ditzagu 2s:ditzazu 2p:ditzazue 3p:ditzate',
        },
        subjpast: {
            '1s': '3s:nintzan 2s:nintzazun 2p:nintzazuen 3p:nintzaten',
            '2f': '1s:hintzadan 3s:hintzan 1p:hintzagun 3p:hintzaten',
            '3s': '1s:nezan 2f:hezan 3s:zezan 1p:genezan 2s:zenezan 2p:zenezaten 3p:zezaten',
            '1p': '3s:gintzan 2s:gintzazun 2p:gintzazuen 3p:gintzaten',
            '2s': '1s:zintzadan 3s:zintzan 1p:zintzagun 3p:zintzaten',
            '3p': '1s:nitzan 3s:zitzan 1p:genitzan 2s:zenitzan 2p:zenitzaten 3p:zitzaten',
        },
        hyp: {
            '1s': '3s:nintza 2s:nintzazu 2p:nintzazue 3p:nintzate',
            '3s': '1s:neza 2f:heza 3s:leza 1p:geneza 2s:zeneza 2p:zenezate 3p:lezate',
            '1p': '3s:gintza 2s:gintzazu 2p:gintzazue 3p:gintzate',
            '2s': '1s:zintzat 3s:zintza 1p:zintzagu 3p:zintzate',
            '3p': '1s:nitza 3s:litza 1p:genitza 2s:zenitza 2p:zenitzate 3p:litzate',
        },
        imp: {
            '1s': '2f:nazak,nazan 2s:nazazu 2p:nazazue',
            '3s': '2f:ezak,ezan 2s:ezazu 2p:ezazue 3s:beza 3p:bezate',
            '1p': '2f:gaitzak,gaitzan 2s:gaitzazu 2p:gaitzazue',
            '3p': '2f:itzak,itzan 2s:itzazu 2p:itzazue 3s:bitza 3p:bitzate',
        },
    }},
    {key: 'ukan-allo', lemmas: ['edun'], about: '*edun (ukan) in familiar speech to a friend', roles: 'nor-nork', tenses: {
        allopast: {'3s': '1s:nian,ninan 3s:zian,zinan 1p:genian,geninan 3p:ziaten,zinaten',
            '3p': '1s:nitian,nitinan 3s:zitian,zitinan 1p:genitian,genitinan 3p:zitiztean,zitiztenan'},
    }},
    // The feminine forms that are also a common past or relative form (zidan,
    // zion, zaidan, zaion) are left out, so those keep their usual reading.
    {key: 'ukan-dat-allo', lemmas: ['edun'], about: '*edun with a dative in familiar speech to a friend', roles: 'nor-nori-nork', tenses: {
        allo: {'3s': {'1s': '3s:zidak 3p:zidatek', '3s': '1s:zioat,zionat 3s:ziok 1p:zioagu,zionagu 3p:ziotek',
            '1p': '3s:ziguk 3p:zigutek', '3p': '1s:zieat,zienat 3s:ziek 1p:zieagu,zienagu 3p:zietek'}},
    }},
    {key: 'izan-dat-allo', lemmas: ['izan'], about: 'izan with a dative in familiar speech to a friend', roles: 'nor-nori', tenses: {
        allo: {'3s': '1s:zaidak 3s:zaiok 1p:zaiguk 3p:zaiek', '3p': '1s:zaizkidak 3s:zaizkiok 3p:zaizkiek'},
    }},
    {key: 'izan-dat', lemmas: ['izan'], about: 'izan with a dative (nor-nori: it is to me, it happens to me)', roles: 'nor-nori', tenses: {
        present: {
            '3s': '1s:zait 2f:zaik 3s:zaio 1p:zaigu 2s:zaizu 2p:zaizue 3p:zaie',
            '3p': '1s:zaizkit 2f:zaizkik 3s:zaizkio 1p:zaizkigu 2s:zaizkizu 2p:zaizkizue 3p:zaizkie',
            '1s': '2f:natzaik 3s:natzaio 2s:natzaizu 2p:natzaizue 3p:natzaie',
            '2s': '1s:zatzaizkit 3s:zatzaizkio 1p:zatzaizkigu 3p:zatzaizkie',
            '1p': '2f:gatzaizkik 3s:gatzaizkio 2s:gatzaizkizu 2p:gatzaizkizue 3p:gatzaizkie',
        },
        past: {
            '3s': '1s:zitzaidan 2f:zitzaian 3s:zitzaion 1p:zitzaigun 2s:zitzaizun 2p:zitzaizuen 3p:zitzaien',
            '3p': '1s:zitzaizkidan 2f:zitzaizkian 3s:zitzaizkion 1p:zitzaizkigun 2s:zitzaizkizun 2p:zitzaizkizuen 3p:zitzaizkien',
            '1s': '2f:nintzaian 3s:nintzaion 2s:nintzaizun 2p:nintzaizuen 3p:nintzaien',
            '2s': '1s:zintzaizkidan 3s:zintzaizkion 1p:zintzaizkigun 3p:zintzaizkien',
            '1p': '2f:gintzaizkian 3s:gintzaizkion 2s:gintzaizkizun 2p:gintzaizkizuen 3p:gintzaizkien',
        },
        cond: {
            '3s': '1s:litzaidake 3s:litzaioke 1p:litzaiguke 2s:litzaizuke 2p:litzaizueke 3p:litzaieke',
            '3p': '1s:litzaizkidake 3s:litzaizkioke 1p:litzaizkiguke 2s:litzaizkizuke 2p:litzaizkizueke 3p:litzaizkieke',
            '1s': '3s:nintzaioke 2s:nintzaizuke 2p:nintzaizueke 3p:nintzaieke',
        },
        hyp: {
            '3s': '1s:litzait 3s:litzaio 1p:litzaigu 2s:litzaizu 2p:litzaizue 3p:litzaie',
            '3p': '1s:litzaizkit 3s:litzaizkio 1p:litzaizkigu 2s:litzaizkizu 3p:litzaizkie',
        },
    }},
    {key: 'edin-dat', lemmas: ['edin'], about: '*edin with a dative (nor-nori), the subjunctive and potential of izan with a dative', roles: 'nor-nori', tenses: {
        pot: {
            '3s': '1s:dakidake 3s:dakioke 1p:dakiguke 2s:dakizuke 2p:dakizueke 3p:dakieke',
            '3p': '1s:dakizkidake 3s:dakizkioke 1p:dakizkiguke 2s:dakizkizuke 2p:dakizkizueke 3p:dakizkieke',
        },
        pothyp: {'3s': '1s:lekidake 3s:lekioke 1p:lekiguke 2s:lekizuke 2p:lekizueke 3p:lekieke'},
        subj: {
            '3s': '1s:dakit 3s:dakio 1p:dakigu 2s:dakizu 2p:dakizue 3p:dakie',
            '3p': '1s:dakizkit 3s:dakizkio 1p:dakizkigu 2s:dakizkizu 2p:dakizkizue 3p:dakizkie',
        },
        subjpast: {'3s': '1s:zekidan 3s:zekion 1p:zekigun 2s:zekizun 2p:zekizuen 3p:zekien'},
        imp: {'3s': '1s:bekit 3s:bekio 1p:bekigu 2s:bekizu 3p:bekie'},
    }},
];

// nor-nori-nork: the absolutive is hura (3s) or haiek (3p, with -zki-).
AUXILIARIES.push(
    {key: 'ukan-dat', lemmas: ['edun'], compound: true, about: '*edun (ukan) with a dative (nor-nori-nork: I give it to you, he tells me)', roles: 'nor-nori-nork', tenses: {
        present: {
            '3s': {
                '1s': '2f:didak 3s:dit 2s:didazu 2p:didazue 3p:didate',
                '2f': '1s:diat,dinat 3s:dik,din 1p:diagu,dinagu 3p:diate,dinate',
                '3s': '1s:diot 2f:diok 3s:dio 1p:diogu 2s:diozu 2p:diozue 3p:diote',
                '1p': '2f:diguk 3s:digu 2s:diguzu 2p:diguzue 3p:digute',
                '2s': '1s:dizut 3s:dizu 1p:dizugu 3p:dizute',
                '2p': '1s:dizuet 3s:dizue 1p:dizuegu 3p:dizuete',
                '3p': '1s:diet 2f:diek 3s:die 1p:diegu 2s:diezu 2p:diezue 3p:diete',
            },
            '3p': {
                '1s': '2f:dizkidak 3s:dizkit 2s:dizkidazu 2p:dizkidazue 3p:dizkidate',
                '2f': '1s:dizkiat,dizkinat 3s:dizkik,dizkin 1p:dizkiagu,dizkinagu 3p:dizkiate,dizkinate',
                '3s': '1s:dizkiot 2f:dizkiok 3s:dizkio 1p:dizkiogu 2s:dizkiozu 2p:dizkiozue 3p:dizkiote',
                '1p': '2f:dizkiguk 3s:dizkigu 2s:dizkiguzu 2p:dizkiguzue 3p:dizkigute',
                '2s': '1s:dizkizut 3s:dizkizu 1p:dizkizugu 3p:dizkizute',
                '2p': '1s:dizkizuet 3s:dizkizue 1p:dizkizuegu 3p:dizkizuete',
                '3p': '1s:dizkiet 2f:dizkiek 3s:dizkie 1p:dizkiegu 2s:dizkiezu 2p:dizkiezue 3p:dizkiete',
            },
        },
        past: {
            '3s': {
                '1s': '2f:hidan 3s:zidan 2s:zenidan 2p:zenidaten 3p:zidaten',
                '2f': '1s:nian,ninan 3s:zian,zinan 1p:genian,geninan 3p:ziaten,zinaten',
                '3s': '1s:nion 2f:hion 3s:zion 1p:genion 2s:zenion 2p:zenioten 3p:zioten',
                '1p': '2f:higun 3s:zigun 2s:zenigun 2p:zeniguten 3p:ziguten',
                '2s': '1s:nizun 3s:zizun 1p:genizun 3p:zizuten',
                '2p': '1s:nizuen 3s:zizuen 1p:genizuen 3p:zizueten',
                '3p': '1s:nien 2f:hien 3s:zien 1p:genien 2s:zenien 2p:zenieten 3p:zieten',
            },
            '3p': {
                '1s': '2f:hizkidan 3s:zizkidan 2s:zenizkidan 2p:zenizkidaten 3p:zizkidaten',
                '3s': '1s:nizkion 2f:hizkion 3s:zizkion 1p:genizkion 2s:zenizkion 2p:zenizkioten 3p:zizkioten',
                '1p': '3s:zizkigun 2s:zenizkigun 2p:zenizkiguten 3p:zizkiguten',
                '2s': '1s:nizkizun 3s:zizkizun 1p:genizkizun 3p:zizkizuten',
                '2p': '1s:nizkizuen 3s:zizkizuen 1p:genizkizuen 3p:zizkizueten',
                '3p': '1s:nizkien 2f:hizkien 3s:zizkien 1p:genizkien 2s:zenizkien 2p:zenizkieten 3p:zizkieten',
            },
        },
        cond: {
            '3s': {
                '1s': '2f:hidake 3s:lidake 2s:zenidake 2p:zenidakete 3p:lidakete',
                '3s': '1s:nioke 2f:hioke 3s:lioke 1p:genioke 2s:zenioke 2p:zeniokete 3p:liokete',
                '1p': '2f:higuke 3s:liguke 2s:zeniguke 2p:zenigukete 3p:ligukete',
                '2s': '1s:nizuke 3s:lizuke 1p:genizuke 3p:lizukete',
                '2p': '1s:nizueke 3s:lizueke 1p:genizueke 3p:lizuekete',
                '3p': '1s:nieke 2f:hieke 3s:lieke 1p:genieke 2s:zenieke 2p:zeniekete 3p:liekete',
            },
            '3p': {
                '1s': '3s:lizkidake 2s:zenizkidake 2p:zenizkidakete 3p:lizkidakete',
                '3s': '1s:nizkioke 3s:lizkioke 1p:genizkioke 2s:zenizkioke 2p:zenizkiokete 3p:lizkiokete',
                '1p': '3s:lizkiguke 2s:zenizkiguke 2p:zenizkigukete 3p:lizkigukete',
                '2s': '1s:nizkizuke 3s:lizkizuke 1p:genizkizuke 3p:lizkizukete',
                '3p': '1s:nizkieke 3s:lizkieke 1p:genizkieke 2s:zenizkieke 2p:zenizkiekete 3p:lizkiekete',
            },
        },
        condpast: {
            '3s': {
                '1s': '3s:zidakeen 2s:zenidakeen 3p:zidaketen',
                '3s': '1s:niokeen 3s:ziokeen 1p:geniokeen 2s:zeniokeen 2p:zenioketen 3p:zioketen',
                '2s': '1s:nizukeen 3s:zizukeen 1p:genizukeen 3p:zizuketen',
                '3p': '1s:niekeen 3s:ziekeen 1p:geniekeen 2s:zeniekeen 3p:zieketen',
            },
        },
    }},
    {key: 'ezan-dat', lemmas: ['ezan'], about: '*ezan with a dative (nor-nori-nork), the subjunctive, potential and imperative of *edun with a dative', roles: 'nor-nori-nork', tenses: {
        pot: {
            '3s': {
                '1s': '2f:diezadakek 3s:diezadake 2s:diezadakezu 2p:diezadakezue 3p:diezadakete',
                '3s': '1s:diezaioket 2f:diezaiokek 3s:diezaioke 1p:diezaiokegu 2s:diezaiokezu 2p:diezaiokezue 3p:diezaiokete',
                '1p': '2f:diezagukek 3s:diezaguke 2s:diezagukezu 2p:diezagukezue 3p:diezagukete',
                '2s': '1s:diezazuket 3s:diezazuke 1p:diezazukegu 3p:diezazukete',
                '2p': '1s:diezazueket 3s:diezazueke 1p:diezazuekegu 3p:diezazuekete',
                '3p': '1s:diezaieket 2f:diezaiekek 3s:diezaieke 1p:diezaiekegu 2s:diezaiekezu 2p:diezaiekezue 3p:diezaiekete',
            },
            '3p': {
                '1s': '3s:diezazkidake 2s:diezazkidakezu 2p:diezazkidakezue 3p:diezazkidakete',
                '3s': '1s:diezazkioket 3s:diezazkioke 1p:diezazkiokegu 2s:diezazkiokezu 2p:diezazkiokezue 3p:diezazkiokete',
                '1p': '3s:diezazkiguke 2s:diezazkigukezu 2p:diezazkigukezue 3p:diezazkigukete',
                '2s': '1s:diezazkizuket 3s:diezazkizuke 1p:diezazkizukegu 3p:diezazkizukete',
                '3p': '1s:diezazkieket 3s:diezazkieke 1p:diezazkiekegu 2s:diezazkiekezu 2p:diezazkiekezue 3p:diezazkiekete',
            },
        },
        pothyp: {
            '3s': {
                '1s': '3s:liezadake 2s:zeniezadake 2p:zeniezadakete 3p:liezadakete',
                '3s': '1s:niezaioke 2f:hiezaioke 3s:liezaioke 1p:geniezaioke 2s:zeniezaioke 2p:zeniezaiokete 3p:liezaiokete',
                '1p': '3s:liezaguke 2s:zeniezaguke 2p:zeniezagukete 3p:liezagukete',
                '2s': '1s:niezazuke 3s:liezazuke 1p:geniezazuke 3p:liezazukete',
                '3p': '1s:niezaieke 3s:liezaieke 1p:geniezaieke 2s:zeniezaieke 2p:zeniezaiekete 3p:liezaiekete',
            },
        },
        potpast: {
            '3s': {
                '1s': '3s:ziezadakeen 2s:zeniezadakeen 3p:ziezadaketen',
                '3s': '1s:niezaiokeen 3s:ziezaiokeen 1p:geniezaiokeen 2s:zeniezaiokeen 2p:zeniezaioketen 3p:ziezaioketen',
                '2s': '1s:niezazukeen 3s:ziezazukeen 1p:geniezazukeen 3p:ziezazuketen',
                '3p': '1s:niezaiekeen 3s:ziezaiekeen 1p:geniezaiekeen 2s:zeniezaiekeen 3p:ziezaieketen',
            },
        },
        subj: {
            '3s': {
                '1s': '2f:diezadak 3s:diezada 2s:diezadazu 2p:diezadazue 3p:diezadate',
                '3s': '1s:diezaiot 2f:diezaiok 3s:diezaio 1p:diezaiogu 2s:diezaiozu 2p:diezaiozue 3p:diezaiote',
                '1p': '2f:diezaguk 3s:diezagu 2s:diezaguzu 2p:diezaguzue 3p:diezagute',
                '2s': '1s:diezazut 3s:diezazu 1p:diezazugu 3p:diezazute',
                '2p': '1s:diezazuet 3s:diezazue 1p:diezazuegu 3p:diezazuete',
                '3p': '1s:diezaiet 2f:diezaiek 3s:diezaie 1p:diezaiegu 2s:diezaiezu 2p:diezaiezue 3p:diezaiete',
            },
            '3p': {
                '1s': '3s:diezazkida 2s:diezazkidazu 3p:diezazkidate',
                '3s': '1s:diezazkiot 3s:diezazkio 1p:diezazkiogu 2s:diezazkiozu 2p:diezazkiozue 3p:diezazkiote',
                '3p': '1s:diezazkiet 3s:diezazkie 2s:diezazkiezu 3p:diezazkiete',
            },
        },
        subjpast: {
            '3s': {
                '1s': '3s:ziezadan 2s:zeniezadan 2p:zeniezadaten 3p:ziezadaten',
                '3s': '1s:niezaion 2f:hiezaion 3s:ziezaion 1p:geniezaion 2s:zeniezaion 2p:zeniezaioten 3p:ziezaioten',
                '1p': '3s:ziezagun 2s:zeniezagun 2p:zeniezaguten 3p:ziezaguten',
                '2s': '1s:niezazun 3s:ziezazun 1p:geniezazun 3p:ziezazuten',
                '3p': '1s:niezaien 2f:hiezaien 3s:ziezaien 1p:geniezaien 2s:zeniezaien 2p:zeniezaieten 3p:ziezaieten',
            },
        },
        imp: {
            '3s': {
                '1s': '2f:iezadak 2s:iezadazu 2p:iezadazue',
                '3s': '2f:iezaiok 2s:iezaiozu 2p:iezaiozue 3s:biezaio 3p:biezaiote',
                '1p': '2f:iezaguk 2s:iezaguzu 2p:iezaguzue',
                '3p': '2f:iezaiek 2s:iezaiezu 2p:iezaiezue 3s:biezaie',
            },
            '3p': {
                '1s': '2f:iezazkidak 2s:iezazkidazu 2p:iezazkidazue',
                '3s': '2f:iezazkiok 2s:iezazkiozu 2p:iezazkiozue',
                '1p': '2s:iezazkiguzu 2p:iezazkiguzue',
                '3p': '2s:iezazkiezu 2p:iezazkiezue',
            },
        },
    }},
);

// --- What attaches to a finite verb -------------------------------------------
// The relative and subordinate -(e)n (den, duen, dudan, nagoen: that is, that
// has; also the subjunctive, nadin, dezan, and indirect questions) and the
// complementizer -(e)la (dela, duela, dudala: that it is, that he has). The
// -a of izan's present becomes -e- (da - den, dela; dira - diren); a final
// -t becomes -da- (dut - dudan, dudala); -r doubles (dator - datorren); a
// past form, which ends in -n, is its own relative (zen) and drops the -n
// before -la (zen - zela). Case endings follow the relative (dena, duenari,
// denean, direnak) and -ko or -rik the complementizer (delako, delarik).
// den, the relative of da, takes only singular endings here: denak, denok
// and denek are mostly den "all", which dictionaries do not list.
function subordination() {
    const IN = ['sg', 'pl'];
    transform('relative', '-n (relative, subjunctive)', 'Relative or subordinate -(e)n on a finite verb: den (that is), duen (that has), dudan, nagoen, datorren; also the subjunctive (nadin, dezan) and indirect questions.');
    const rel = (rule) => add('relative', {type: 'suffix', conditionsIn: IN, conditionsOut: ['sub'], ...rule});
    rel({inflected: 'en', deinflected: '', stemMinLength: 2});
    rel({inflected: 'n', deinflected: '', stemMinLength: 2, stemEndsWith: VOWEL});
    rel({inflected: 'en', deinflected: 'a', stemMinLength: 2});
    rel({inflected: 'dan', deinflected: 't', stemMinLength: 1});
    rel({inflected: 'rren', deinflected: 'r', stemMinLength: 2});
    add('relative', {type: 'wholeWord', inflected: 'den', deinflected: 'da', conditionsIn: ['sg'], conditionsOut: ['sub']});
    // Gipuzkoan and older writing: dan for den (danean, when it is).
    add('relative', {type: 'wholeWord', inflected: 'dan', deinflected: 'da', conditionsIn: ['sg'], conditionsOut: ['sub']});
    transform('complementizer', '-(e)la (that)', 'Complementizer -(e)la on a finite verb: dela (that it is), duela, dudala, naizela, zela (that it was); with -ko, because (delako), and -rik, while (delarik).');
    const comp = (rule) => add('complementizer', {type: 'suffix', conditionsIn: IN, conditionsOut: ['sub'], ...rule});
    comp({inflected: 'la', deinflected: '', stemMinLength: 2, stemEndsWith: VOWEL});
    comp({inflected: 'ela', deinflected: '', stemMinLength: 2});
    comp({inflected: 'ela', deinflected: 'a', stemMinLength: 1});
    comp({inflected: 'dala', deinflected: 't', stemMinLength: 1});
    comp({inflected: 'rrela', deinflected: 'r', stemMinLength: 2});
    comp({inflected: 'la', deinflected: 'n', stemMinLength: 2});
}

// ba- (if, and affirmative: badakit, I do know) and bait- (because, since),
// which joins the verb with t + d > t, t + n > n, t + g > k, t + l > l
// (baita, bainaiz, baikara, bailitzateke). In speech and older spelling ez
// (not) joins the verb the same way (ezta, isn't it; ezpada, if not).
function prefixes() {
    transform('ba', 'ba- (if; affirmative)', 'ba- on a finite verb: the condition of a hypothesis (bada, if it is; balitz, if it were) or an affirmative stress (badakit, I do know).');
    add('ba', {type: 'prefix', inflected: 'ba', deinflected: '', conditionsIn: ['fin'], conditionsOut: ['pfx'], stemMinLength: 2, stemStartsWith: '[dglnhz]'});
    transform('bait', 'bait- (because, since)', 'bait- on a finite verb: because, since (baita, since it is; baitu, bainaiz, baikara, baitzen).');
    for (const [inflected, deinflected, starts] of [['bait', 'd', VOWEL], ['bait', '', '[z]'], ['bain', 'n', VOWEL], ['baik', 'g', VOWEL], ['bail', 'l', VOWEL]]) {
        add('bait', {type: 'prefix', inflected, deinflected, conditionsIn: ['fin'], conditionsOut: ['pfx'], stemMinLength: 1, stemStartsWith: starts});
    }
    // Familiar speech to a friend (hika) marks the listener on the verb: -k
    // to a man (gaitezkek, nintekek, noakiok), and for a third-person form
    // z- for d- as well (dago - zagok, dabiltza - zabiltzak); the past
    // takes -an for -en (nekien - nekian, zegoen - zegoan). Western and
    // older writing has -an for -en in the same forms without the familiar
    // meaning (zan, zuan, zegoan for zen, zuen, zegoen), so that rule names
    // both. The forms -n (to a woman) adds are those of the relative.
    transform('familiar', 'familiar (hika, to a man)', 'Familiar speech to a male friend: -k on the verb (gaitezkek, noakiok), with z- for d- (zagok, zabiltzak).');
    // Only forms whose absolutive or ergative is not the listener take it: a
    // first person (n-, g-) or a hypothetical third person (l-).
    add('familiar', {type: 'suffix', inflected: 'k', deinflected: '', conditionsIn: [], conditionsOut: ['pfx'], stemMinLength: 3, stemStartsWith: '[gln]'});
    add('familiar', {type: 'circumfix', inflectedPrefix: 'z', deinflectedPrefix: 'd', inflectedSuffix: 'k', deinflectedSuffix: '', conditionsIn: [],
        conditionsOut: ['pfx'], stemMinLength: 2, stemStartsWith: VOWEL});
    transform('past-an', '-an for -en (familiar or western past)', 'A past form with -an for -en: familiar speech to a man (nekian, zegoan) and western and older writing (zan, zuan, zegoan for zen, zuen, zegoen).');
    add('past-an', {type: 'suffix', inflected: 'an', deinflected: 'en', conditionsIn: ['fin'], conditionsOut: ['pfx'], stemMinLength: 1, stemStartsWith: '[ghlnz]'});
    transform('ez', 'ez- (not) joined to the verb', 'ez (not) written with the verb, as in speech: ezta (= ez da, isn\'t it), ezpada (= ez bada, if not), ezkara (= ez gara).');
    for (const [inflected, deinflected] of [['ezt', 'd'], ['ezp', 'b'], ['ezk', 'g'], ['etz', 'z']]) {
        add('ez', {type: 'prefix', inflected, deinflected, conditionsIn: [], conditionsOut: ['pfx'], stemMinLength: 1, stemStartsWith: VOWEL});
    }
}

// --- Output -----------------------------------------------------------------
// Order matters where rules share an ending (section 7.4: at one node, file
// order): the relative -n comes before the genitive plural -en, so dagoen is
// traced as egon + relative, and the superlative before the genitive, so
// handiena is traced as handi + superlative.
subordination();
prefixes();
degree();
declension();
animate();
adverbs();
nonFinite();
closedClasses();
for (const p of SYNTHETIC) { paradigm(p); }
for (const p of AUXILIARIES) { paradigm(p); }
finiteTransforms();

for (const t of transforms) { delete t.keys; }
const unused = transforms.filter((t) => t.rules.length === 0).map((t) => t.id);
if (unused.length > 0) { throw new Error(`transforms without rules: ${unused.join(', ')}`); }
const out = {schema: 1, conditions, transforms};
writeFileSync(join(here, 'own.json'), formatTransforms(out));
const rules = transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`own.json: ${transforms.length} transforms, ${rules} rules`);
