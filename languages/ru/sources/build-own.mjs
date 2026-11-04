#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/ru/sources/own.json: the Russian deinflection rules written
// for this pack (docs/languages.md, section 14 step 2), from the paradigm
// tables below. Run from the repository root:
//
//   node languages/ru/sources/build-own.mjs
//
// The tables follow the standard description of Russian inflection (the
// Academy grammar, Russkaja grammatika 1980; A. A. Zaliznjak's Grammatical
// dictionary of Russian; Wiktionary's Russian declension and conjugation
// tables): noun declensions with their spelling rules and fleeting vowels,
// adjectives (long, short, comparative, superlative), pronouns and numerals,
// and verbs (present/future by conjugation class with the consonant
// alternations of the first person, past, imperative, participles, adverbial
// participles, the reflexive -ся/-сь), with ё/е spellings of every ending.
//
// Each rule records the forms its ending can stand for; rules with the same
// set of forms make one transform, so a trace names every form an ending can
// be ("genitive singular, nominative plural" for книги).

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// --- Conditions ---------------------------------------------------------------
// v, n, name, adj, pron and num are dictionary forms: the infinitive, the
// nominative singular (or plural of a plural-only noun) and the masculine
// nominative singular. The others are steps no dictionary term carries:
// - fl: a masculine or feminine stem whose fleeting vowel is still missing
//   (отц-, дн-, любв-), which only the fleeting-vowel rules take;
// - cmp: a comparative after по- was removed, which only comparative rules take.
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    name: {name: 'Proper noun', isDictionaryForm: true},
    adj: {name: 'Adjective or participle', isDictionaryForm: true},
    pron: {name: 'Pronoun or determiner', isDictionaryForm: true},
    num: {name: 'Numeral', isDictionaryForm: true},
    fl: {name: 'Noun stem without its fleeting vowel', isDictionaryForm: false},
    cmp: {name: 'Comparative without по-', isDictionaryForm: false},
};

const NOUN = ['n', 'name'];
const ADJ = ['adj'];
const VERB = ['v'];
const STEM = '{stem}';

// --- Form labels ----------------------------------------------------------------
// Cases and numbers or genders of nouns, adjectives and pronouns; verb forms.
const CASES = ['nom', 'gen', 'dat', 'acc', 'ins', 'prp', 'loc'];
const CASE_NAME = {nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', ins: 'instrumental', prp: 'prepositional', loc: 'locative'};
const NUMBERS = ['sg', 'm', 'n', 'f', 'pl'];
const NUMBER_NAME = {sg: 'singular', m: 'masculine', n: 'neuter', f: 'feminine', pl: 'plural'};
const OTHER_FORMS = [
    ['short.m', 'masculine short form'],
    ['short.f', 'feminine short form'],
    ['short.n', 'neuter short form'],
    ['short.pl', 'plural short form'],
    ['cmp', 'comparative'],
    ['po', 'по- comparative'],
    ['sup', 'superlative'],
    ['adverb', 'по- adverb'],
    ['fleeting', 'fleeting vowel'],
    ['pres.1sg', 'first-person singular present/future'],
    ['pres.2sg', 'second-person singular present/future'],
    ['pres.3sg', 'third-person singular present/future'],
    ['pres.1pl', 'first-person plural present/future'],
    ['pres.2pl', 'second-person plural present/future'],
    ['pres.3pl', 'third-person plural present/future'],
    ['past.m', 'masculine singular past'],
    ['past.f', 'feminine singular past'],
    ['past.n', 'neuter singular past'],
    ['past.pl', 'plural past'],
    ['imp.2sg', 'second-person singular imperative'],
    ['imp.2pl', 'second-person plural imperative'],
    ['ptcp.pres.act', 'present active participle'],
    ['ptcp.past.act', 'past active participle'],
    ['ptcp.pres.pass', 'present passive participle'],
    ['ptcp.past.pass', 'past passive participle'],
    ['ger.pres', 'present adverbial participle'],
    ['ger.past', 'past adverbial participle'],
];
const OTHER_NAME = new Map(OTHER_FORMS);
const FORM_ORDER = new Map();
for (const number of NUMBERS) {
    for (const c of CASES) { FORM_ORDER.set(`${c}.${number}`, FORM_ORDER.size); }
}
for (const [code] of OTHER_FORMS) { FORM_ORDER.set(code, FORM_ORDER.size); }

/** The trace name of a set of forms: cases joined by "/", grouped by number or gender. */
function formsName(forms) {
    const caseForms = forms.filter((f) => CASE_NAME[f.split('.')[0]] !== undefined);
    const other = forms.filter((f) => CASE_NAME[f.split('.')[0]] === undefined);
    // number -> cases
    const byNumber = new Map();
    for (const f of caseForms) {
        const [c, number] = f.split('.');
        if (!byNumber.has(number)) { byNumber.set(number, []); }
        byNumber.get(number).push(c);
    }
    // numbers with the same case list are merged (genitive masculine/neuter)
    const groups = new Map();
    for (const number of NUMBERS) {
        if (!byNumber.has(number)) { continue; }
        const key = byNumber.get(number).sort((a, b) => CASES.indexOf(a) - CASES.indexOf(b)).join('/');
        if (!groups.has(key)) { groups.set(key, []); }
        groups.get(key).push(number);
    }
    const parts = [...groups].map(([cases, numbers]) => `${cases.split('/').map((c) => CASE_NAME[c]).join('/')} ${numbers.map((n) => NUMBER_NAME[n]).join('/')}`);
    for (const f of other) { parts.push(OTHER_NAME.get(f)); }
    return parts.join(', ');
}

// --- Rules ------------------------------------------------------------------------
// Every rule is collected with the forms it stands for and the part of speech
// of its transform (noun, adj, verb, pron), then grouped into transforms.
const collected = new Map();  // key -> {pos, rule, forms:Set, examples:[]}

function key(pos, rule) {
    return `${pos}\u0000${JSON.stringify(rule)}`;
}

function put(pos, forms, rule, example) {
    for (const f of forms) {
        if (!FORM_ORDER.has(f)) { throw new Error(`unknown form ${f}`); }
    }
    const k = key(pos, rule);
    if (!collected.has(k)) { collected.set(k, {pos, rule, forms: new Set(), examples: []}); }
    const entry = collected.get(k);
    for (const f of forms) { entry.forms.add(f); }
    if (example && !entry.examples.some(([a, b]) => a === example[0] && b === example[1])) { entry.examples.push(example); }
}

/** The е spelling of a text written with ё. */
function e(text) {
    return text.replaceAll('ё', 'е');
}

/**
 * A suffix rule and, when its ending has ё, the same rule for text written
 * with е (идёт, идет). When only the lemma has ё (котята → котёнок), the rule
 * is also written with the lemma's е spelling, for dictionaries that write е.
 */
function suffix(pos, forms, inflected, deinflected, conditionsIn, conditionsOut, extra = {}, example = null) {
    const make = (i, d) => ({type: 'suffix', inflected: i, deinflected: d, conditionsIn, conditionsOut, stemCharacters: STEM, ...extra});
    put(pos, forms, make(inflected, deinflected), example);
    if (inflected.includes('ё')) { put(pos, forms, make(e(inflected), e(deinflected)), example); }
    if (!inflected.includes('ё') && deinflected.includes('ё')) { put(pos, forms, make(inflected, e(deinflected)), example); }
}

function wholeWord(pos, forms, inflected, deinflected, conditionsIn, conditionsOut, example = null) {
    const make = (i, d) => ({type: 'wholeWord', inflected: i, deinflected: d, conditionsIn, conditionsOut});
    put(pos, forms, make(inflected, deinflected), example);
    if (inflected.includes('ё')) { put(pos, forms, make(e(inflected), e(deinflected)), example); }
    if (!inflected.includes('ё') && deinflected.includes('ё')) { put(pos, forms, make(inflected, e(deinflected)), example); }
}

function prefixRule(pos, forms, inflected, deinflected, conditionsIn, conditionsOut, extra = {}, example = null) {
    put(pos, forms, {type: 'prefix', inflected, deinflected, conditionsIn, conditionsOut, stemCharacters: STEM, ...extra}, example);
}

/** -ся after a consonant or й, -сь after a vowel (читается, читалась, читаться, нестись). */
function reflexive(text) {
    return /[аеёиоуыэюя]$/u.test(text) ? `${text}сь` : `${text}ся`;
}

/**
 * A verb rule and its reflexive twin (читает → читать, читается → читаться).
 * Participles always take -ся (читающийся), which reflexive() gives them since
 * they end in й. The past adverbial participle in -в has none: its reflexive
 * form is -вшись, written from -вши.
 */
function verb(forms, inflected, deinflected, extra = {}, example = null, {refl = true} = {}) {
    // A participle is declined (читающего) or short (сделана) before it becomes
    // its verb, so participle rules also take the adjective rules' output.
    const conditionsIn = forms.some((f) => f.startsWith('ptcp.')) ? ADJ : [];
    suffix('verb', forms, inflected, deinflected, conditionsIn, VERB, extra, example);
    if (refl) {
        const reflExample = example === null ? null : [reflexive(example[0]), reflexive(example[1])];
        suffix('verb', forms, reflexive(inflected), reflexive(deinflected), conditionsIn, VERB, extra, reflExample);
    }
}

// --- Nouns --------------------------------------------------------------------------
// noun(lemma ending, class of the stem's last letter, {form: [endings]}, options):
// one rule per ending, from the inflected ending to the lemma's. The stem has
// at least `min` letters (default 2), so a short word is not read as an ending
// on a one-letter stem. With `fleeting`, every oblique form also gives the stem
// with condition fl, which the fleeting-vowel rules below complete (отца → отц
// → отец); a plain reading of the same form (волка → волк) has one step, so it
// comes first.
const OBLIQUE = new Set(['gen.sg', 'dat.sg', 'ins.sg', 'prp.sg', 'loc.sg', 'nom.pl', 'gen.pl', 'dat.pl', 'ins.pl', 'prp.pl']);

function noun(lemma, stemEnd, table, {min = 2, example = null, fleeting = false, fleetingOnly = false, extra = {}} = {}) {
    for (const [form, endings] of Object.entries(table)) {
        for (const ending of endings) {
            // A genitive plural without an ending needs a stem of three letters,
            // so that он, ты and мы are not read as она, оно and мыть's forms.
            const constraints = {stemMinLength: ending === '' ? Math.max(min, 3) : min, ...extra};
            if (ending === '') { constraints.stemNotStartsWith = CAPITAL; }
            if (stemEnd !== null) { constraints.stemEndsWith = stemEnd; }
            const ex = example && example[form] ? [example[form], example.lemma] : null;
            if (!fleetingOnly) { suffix('noun', [form], ending, lemma, [], NOUN, constraints, ex); }
            // The dative and locative in -у leave out stems in к: the feminine
            // accusatives in -ку (коробку, пушку, бочку) are far more frequent
            // than the datives of -ок nouns (коробок, пушок), which
            // wiktionary-to-yomitan's own rows name (куску → кусок), and the
            // fleeting chain reached the -ок noun first. -цу keeps it
            // (американцу → американец).
            if (fleeting && OBLIQUE.has(form)) {
                const fl = ending === 'у' ? {stemMinLength: 1, stemNotEndsWith: '[к]', ...extra} : {stemMinLength: 1, ...extra};
                suffix('noun', [form], ending, lemma, [], ['fl'], fl, null);
            }
        }
    }
}

const HARD = '{hardConsonant}';
// A zero ending (книг → книга) and a comparative (быстрее → быстрый) are never a
// name's form, so they leave out stems that start with a capital: a word at the
// start of a sentence is then not read as a name (Итак → Итака, Вас → Вася,
// Наше → Наха) before the processors lower its first letter.
const CAPITAL = '{capital}';
const VELAR = '{velar}';
const HUSHING = '{hushing}';
const CONSONANT = '{consonant}';
const VOWEL = '{vowel}';

// Masculine nouns ending in a consonant (стол, урок, нож, месяц).
noun('', HARD, {
    'gen.sg': ['а'], 'dat.sg': ['у'], 'loc.sg': ['у'], 'ins.sg': ['ом'], 'prp.sg': ['е'],
    'nom.pl': ['ы', 'а'], 'gen.pl': ['ов'], 'dat.pl': ['ам'], 'ins.pl': ['ами'], 'prp.pl': ['ах'],
}, {fleeting: true, example: {lemma: 'стол', 'gen.sg': 'стола', 'dat.sg': 'столу', 'loc.sg': 'лесу', 'ins.sg': 'столом', 'prp.sg': 'столе', 'nom.pl': 'столы', 'gen.pl': 'столов', 'dat.pl': 'столам', 'ins.pl': 'столами', 'prp.pl': 'столах'}});
noun('', VELAR, {
    'gen.sg': ['а'], 'dat.sg': ['у'], 'loc.sg': ['у'], 'ins.sg': ['ом'], 'prp.sg': ['е'],
    'nom.pl': ['и', 'а'], 'gen.pl': ['ов'], 'dat.pl': ['ам'], 'ins.pl': ['ами'], 'prp.pl': ['ах'],
}, {fleeting: true, example: {lemma: 'урок', 'nom.pl': 'уроки'}});
noun('', HUSHING, {
    'gen.sg': ['а'], 'dat.sg': ['у'], 'ins.sg': ['ом', 'ем'], 'prp.sg': ['е'],
    'nom.pl': ['и', 'а'], 'gen.pl': ['ей'], 'dat.pl': ['ам'], 'ins.pl': ['ами'], 'prp.pl': ['ах'],
}, {fleeting: true, example: {lemma: 'нож', 'ins.sg': 'мужем', 'nom.pl': 'ножи', 'gen.pl': 'ножей'}});
noun('', '[ц]', {
    'gen.sg': ['а'], 'dat.sg': ['у'], 'ins.sg': ['ом', 'ем'], 'prp.sg': ['е'],
    'nom.pl': ['ы'], 'gen.pl': ['ов', 'ев'], 'dat.pl': ['ам'], 'ins.pl': ['ами'], 'prp.pl': ['ах'],
}, {fleeting: true, example: {lemma: 'месяц', 'ins.sg': 'месяцем', 'gen.pl': 'месяцев'}});

// Masculine soft nouns (словарь, учитель, путь) and -й (музей, край, бой).
noun('ь', CONSONANT, {
    'gen.sg': ['я'], 'dat.sg': ['ю'], 'ins.sg': ['ем', 'ём'], 'prp.sg': ['е'],
    'nom.pl': ['и', 'я'], 'gen.pl': ['ей'], 'dat.pl': ['ям'], 'ins.pl': ['ями'], 'prp.pl': ['ях'],
}, {fleeting: true, example: {lemma: 'словарь', 'gen.sg': 'словаря', 'ins.sg': 'словарём', 'nom.pl': 'учителя', 'gen.pl': 'словарей'}});
noun('й', VOWEL, {
    'gen.sg': ['я'], 'dat.sg': ['ю'], 'ins.sg': ['ем', 'ём'], 'prp.sg': ['е'],
    'nom.pl': ['и', 'я'], 'gen.pl': ['ев', 'ёв'], 'dat.pl': ['ям'], 'ins.pl': ['ями'], 'prp.pl': ['ях'],
}, {example: {lemma: 'музей', 'gen.sg': 'музея', 'gen.pl': 'музеев'}});
noun('й', '[ь]', {
    'gen.sg': ['я'], 'dat.sg': ['ю'], 'ins.sg': ['ем', 'ём'], 'prp.sg': ['е'],
    'nom.pl': ['и'], 'gen.pl': ['ев', 'ёв'], 'dat.pl': ['ям'], 'ins.pl': ['ями'], 'prp.pl': ['ях'],
}, {fleeting: true, fleetingOnly: true, min: 1});
noun('ий', null, {
    'gen.sg': ['ия'], 'dat.sg': ['ию'], 'ins.sg': ['ием'], 'prp.sg': ['ии'],
    'nom.pl': ['ии'], 'gen.pl': ['иев'], 'dat.pl': ['иям'], 'ins.pl': ['иями'], 'prp.pl': ['иях'],
}, {example: {lemma: 'гений', 'prp.sg': 'гении'}});

// Feminine (and masculine) nouns in -а (книга, папа, задача, улица).
noun('а', HARD, {
    'gen.sg': ['ы'], 'dat.sg': ['е'], 'acc.sg': ['у'], 'ins.sg': ['ой', 'ою'], 'prp.sg': ['е'],
    'nom.pl': ['ы'], 'gen.pl': [''], 'dat.pl': ['ам'], 'ins.pl': ['ами'], 'prp.pl': ['ах'],
}, {example: {lemma: 'школа', 'gen.sg': 'школы', 'dat.sg': 'школе', 'acc.sg': 'школу', 'ins.sg': 'школой', 'gen.pl': 'школ'}});
noun('а', VELAR, {
    'gen.sg': ['и'], 'dat.sg': ['е'], 'acc.sg': ['у'], 'ins.sg': ['ой', 'ою'], 'prp.sg': ['е'],
    'nom.pl': ['и'], 'gen.pl': [''], 'dat.pl': ['ам'], 'ins.pl': ['ами'], 'prp.pl': ['ах'],
}, {example: {lemma: 'книга', 'gen.sg': 'книги', 'gen.pl': 'книг'}});
noun('а', HUSHING, {
    'gen.sg': ['и'], 'dat.sg': ['е'], 'acc.sg': ['у'], 'ins.sg': ['ой', 'ою', 'ей', 'ею'], 'prp.sg': ['е'],
    'nom.pl': ['и'], 'gen.pl': [''], 'dat.pl': ['ам'], 'ins.pl': ['ами'], 'prp.pl': ['ах'],
}, {example: {lemma: 'задача', 'ins.sg': 'задачей'}});
noun('а', '[ц]', {
    'gen.sg': ['ы'], 'dat.sg': ['е'], 'acc.sg': ['у'], 'ins.sg': ['ой', 'ою', 'ей', 'ею'], 'prp.sg': ['е'],
    'nom.pl': ['ы'], 'gen.pl': [''], 'dat.pl': ['ам'], 'ins.pl': ['ами'], 'prp.pl': ['ах'],
}, {example: {lemma: 'улица', 'ins.sg': 'улицей'}});
// The genitive plural with an inserted vowel (ручек, ошибок, сосен, сестёр, овец, песен, земель).
for (const [inflected, lemma, ex] of [
    ['ок', 'ка', ['ошибок', 'ошибка']], ['ек', 'ка', ['ручек', 'ручка']], ['еек', 'ейка', ['копеек', 'копейка']],
    ['ен', 'на', ['сосен', 'сосна']], ['ён', 'на', null], ['ер', 'ра', ['сестер', 'сестра']], ['ёр', 'ра', ['сестёр', 'сестра']], ['еб', 'ьба', ['свадеб', 'свадьба']],
    ['ол', 'ла', null], ['ел', 'ла', null], ['ец', 'ца', ['овец', 'овца']],
    ['ен', 'ня', ['песен', 'песня']], ['ень', 'ня', ['деревень', 'деревня']], ['онь', 'ня', ['кухонь', 'кухня']],
    ['ель', 'ля', ['земель', 'земля']], ['ен', 'ьня', ['спален', 'спальня']],
]) {
    suffix('noun', ['gen.pl'], inflected, lemma, [], NOUN, {stemMinLength: 1, stemEndsWith: CONSONANT}, ex);
}

// Feminine nouns in -я (неделя, земля, тётя), -Vя (идея, стая), -ия (линия), -ья (статья).
noun('я', CONSONANT, {
    'gen.sg': ['и'], 'dat.sg': ['е'], 'acc.sg': ['ю'], 'ins.sg': ['ей', 'ею', 'ёй', 'ёю'], 'prp.sg': ['е'],
    'nom.pl': ['и'], 'gen.pl': ['ь', 'ей'], 'dat.pl': ['ям'], 'ins.pl': ['ями'], 'prp.pl': ['ях'],
}, {example: {lemma: 'неделя', 'gen.sg': 'недели', 'ins.sg': 'неделей', 'gen.pl': 'недель'}});
noun('я', '[аеоуэй]', {
    'gen.sg': ['и'], 'dat.sg': ['е'], 'acc.sg': ['ю'], 'ins.sg': ['ей', 'ею', 'ёй', 'ёю'], 'prp.sg': ['е'],
    'nom.pl': ['и'], 'gen.pl': ['й'], 'dat.pl': ['ям'], 'ins.pl': ['ями'], 'prp.pl': ['ях'],
}, {example: {lemma: 'идея', 'gen.pl': 'идей'}});
noun('ия', null, {
    'gen.sg': ['ии'], 'dat.sg': ['ии'], 'acc.sg': ['ию'], 'ins.sg': ['ией', 'иею'], 'prp.sg': ['ии'],
    'nom.pl': ['ии'], 'gen.pl': ['ий'], 'dat.pl': ['иям'], 'ins.pl': ['иями'], 'prp.pl': ['иях'],
}, {example: {lemma: 'линия', 'gen.sg': 'линии', 'gen.pl': 'линий'}});
noun('ья', null, {
    'gen.sg': ['ьи'], 'dat.sg': ['ье'], 'acc.sg': ['ью'], 'ins.sg': ['ьей', 'ьёй', 'ьею', 'ьёю'], 'prp.sg': ['ье'],
    'nom.pl': ['ьи'], 'gen.pl': ['ей', 'ий'], 'dat.pl': ['ьям'], 'ins.pl': ['ьями'], 'prp.pl': ['ьях'],
}, {min: 1, example: {lemma: 'статья', 'gen.sg': 'статьи', 'ins.sg': 'статьёй', 'gen.pl': 'статей'}});

// Feminine nouns in -ь (дверь, ночь, мать and дочь below).
noun('ь', CONSONANT, {
    'gen.sg': ['и'], 'dat.sg': ['и'], 'prp.sg': ['и'], 'ins.sg': ['ью'],
    'nom.pl': ['и'], 'gen.pl': ['ей'], 'dat.pl': ['ям'], 'ins.pl': ['ями', 'ьми'], 'prp.pl': ['ях'],
}, {fleeting: true, example: {lemma: 'дверь', 'gen.sg': 'двери', 'ins.sg': 'дверью', 'ins.pl': 'дверьми'}});
noun('ь', HUSHING, {
    'dat.pl': ['ам'], 'ins.pl': ['ами'], 'prp.pl': ['ах'],
}, {example: {lemma: 'ночь', 'dat.pl': 'ночам', 'ins.pl': 'ночами', 'prp.pl': 'ночах'}});
for (const [stem, lemma] of [['тер', 'ть'], ['чер', 'чь']]) {
    const ex = lemma === 'ть' ? 'мать' : 'дочь';
    const forms = {'gen.sg': 'и', 'ins.sg': 'ью', 'nom.pl': 'и', 'gen.pl': 'ей', 'dat.pl': 'ям', 'ins.pl': 'ями', 'prp.pl': 'ях'};
    for (const [form, ending] of Object.entries(forms)) {
        const fs = form === 'gen.sg' ? ['gen.sg', 'dat.sg', 'prp.sg', 'nom.pl'] : form === 'nom.pl' ? ['gen.sg', 'dat.sg', 'prp.sg', 'nom.pl'] : [form];
        suffix('noun', fs, stem + ending, lemma, [], NOUN, {stemMinLength: 1}, [ex.slice(0, -2) + stem + ending, ex]);
    }
    if (lemma === 'чь') { suffix('noun', ['ins.pl'], 'черьми', 'чь', [], NOUN, {stemMinLength: 1}, ['дочерьми', 'дочь']); }
}

// Neuter nouns: -о (место, окно, яблоко, лицо), -е (поле, сердце), -ие (здание), -ье (платье), -мя (время).
noun('о', CONSONANT, {
    'gen.sg': ['а'], 'dat.sg': ['у'], 'ins.sg': ['ом'], 'prp.sg': ['е'],
    'nom.pl': ['а'], 'gen.pl': [''], 'dat.pl': ['ам'], 'ins.pl': ['ами'], 'prp.pl': ['ах'],
}, {example: {lemma: 'место', 'gen.sg': 'места', 'gen.pl': 'мест'}});
noun('о', '[гкхжшщч]', {'nom.pl': ['и']}, {example: {lemma: 'яблоко', 'nom.pl': 'яблоки'}});
for (const [inflected, lemma, ex] of [
    ['он', 'но', ['окон', 'окно']], ['ен', 'но', ['пятен', 'пятно']], ['ён', 'но', ['зёрен', 'зерно']],
    ['ер', 'ро', ['ведер', 'ведро']], ['ец', 'цо', null],
    ['ем', 'ьмо', ['писем', 'письмо']], ['ем', 'ьма', ['тюрем', 'тюрьма']], ['ек', 'ко', ['окошек', 'окошко']],
]) {
    suffix('noun', ['gen.pl'], inflected, lemma, [], NOUN, {stemMinLength: 1, stemEndsWith: CONSONANT}, ex);
}
// колец, крылец: the л of кольцо, крыльцо follows a vowel.
suffix('noun', ['gen.pl'], 'лец', 'льцо', [], NOUN, {stemMinLength: 2, stemEndsWith: VOWEL}, ['колец', 'кольцо']);
// весел → весло, but тел is тело's (no fleeting vowel): a stem of two letters.
suffix('noun', ['gen.pl'], 'ел', 'ло', [], NOUN, {stemMinLength: 2, stemEndsWith: CONSONANT}, ['весел', 'весло']);
noun('е', '[лрнм]', {
    'gen.sg': ['я'], 'dat.sg': ['ю'], 'ins.sg': ['ем'],
    'nom.pl': ['я'], 'gen.pl': ['ей'], 'dat.pl': ['ям'], 'ins.pl': ['ями'], 'prp.pl': ['ях'],
}, {example: {lemma: 'поле', 'gen.sg': 'поля', 'gen.pl': 'полей'}});
noun('е', '[жшщчц]', {
    'gen.sg': ['а'], 'dat.sg': ['у'], 'ins.sg': ['ем'],
    'nom.pl': ['а'], 'gen.pl': [''], 'dat.pl': ['ам'], 'ins.pl': ['ами'], 'prp.pl': ['ах'],
}, {example: {lemma: 'сердце', 'gen.sg': 'сердца', 'gen.pl': 'жилищ'}});
suffix('noun', ['gen.pl'], 'ец', 'це', [], NOUN, {stemMinLength: 1, stemEndsWith: CONSONANT}, ['сердец', 'сердце']);
noun('ие', null, {
    'gen.sg': ['ия'], 'dat.sg': ['ию'], 'ins.sg': ['ием'], 'prp.sg': ['ии'],
    'nom.pl': ['ия'], 'gen.pl': ['ий'], 'dat.pl': ['иям'], 'ins.pl': ['иями'], 'prp.pl': ['иях'],
}, {example: {lemma: 'здание', 'gen.sg': 'здания', 'gen.pl': 'зданий'}});
noun('ье', null, {
    'gen.sg': ['ья'], 'dat.sg': ['ью'], 'ins.sg': ['ьем', 'ьём'],
    'nom.pl': ['ья'], 'gen.pl': ['ий', 'ьев', 'ей'], 'dat.pl': ['ьям'], 'ins.pl': ['ьями'], 'prp.pl': ['ьях'],
}, {min: 1, example: {lemma: 'платье', 'gen.sg': 'платья', 'gen.pl': 'платьев'}});
noun('ьё', null, {
    'gen.sg': ['ья'], 'dat.sg': ['ью'], 'ins.sg': ['ьём'], 'prp.sg': ['ье'],
    'nom.pl': ['ья'], 'gen.pl': ['ий', 'ей'], 'dat.pl': ['ьям'], 'ins.pl': ['ьями'], 'prp.pl': ['ьях'],
}, {min: 1, example: {lemma: 'бельё', 'gen.sg': 'белья'}});
noun('мя', null, {
    'gen.sg': ['мени'], 'dat.sg': ['мени'], 'ins.sg': ['менем'], 'prp.sg': ['мени'],
    'nom.pl': ['мена'], 'gen.pl': ['мён'], 'dat.pl': ['менам'], 'ins.pl': ['менами'], 'prp.pl': ['менах'],
}, {min: 1, example: {lemma: 'время', 'gen.sg': 'времени', 'nom.pl': 'времена', 'gen.pl': 'времён'}});

// Plurals of -анин/-янин (англичане), -ёнок/-онок (котята, медвежата), -ья (братья, деревья), сыновья, друзья.
for (const [sg, pl] of [['анин', 'ан'], ['янин', 'ян']]) {
    const table = {'nom.pl': 'е', 'gen.pl': '', 'dat.pl': 'ам', 'ins.pl': 'ами', 'prp.pl': 'ах'};
    for (const [form, ending] of Object.entries(table)) {
        suffix('noun', [form], pl + ending, sg, [], NOUN, {stemMinLength: 2}, sg === 'анин' ? [`англичан${ending}`, 'англичанин'] : [`крестьян${ending}`, 'крестьянин']);
    }
}
for (const [sg, pl] of [['ёнок', 'ят'], ['онок', 'ат']]) {
    const table = {'nom.pl': 'а', 'gen.pl': '', 'dat.pl': 'ам', 'ins.pl': 'ами', 'prp.pl': 'ах'};
    for (const [form, ending] of Object.entries(table)) {
        const extra = sg === 'онок' ? {stemMinLength: 2, stemEndsWith: HUSHING} : {stemMinLength: 2};
        suffix('noun', [form], pl + ending, sg, [], NOUN, extra, sg === 'ёнок' ? [`кот${pl}${ending}`, 'котёнок'] : [`медвеж${pl}${ending}`, 'медвежонок']);
    }
}
for (const [pl, sg, ex] of [['ья', '', ['братья', 'брат']], ['ья', 'о', ['деревья', 'дерево']], ['ья', 'ь', ['князья', 'князь']], ['овья', '', ['сыновья', 'сын']], ['зья', 'г', ['друзья', 'друг']]]) {
    const base = pl.slice(0, -2);  // '', 'ов', 'з'
    const table = {'nom.pl': 'ья', 'gen.pl': sg === 'о' || sg === '' && base === '' ? 'ьев' : 'ей', 'dat.pl': 'ьям', 'ins.pl': 'ьями', 'prp.pl': 'ьях'};
    for (const [form, ending] of Object.entries(table)) {
        suffix('noun', [form], base + ending, sg, [], NOUN, {stemMinLength: 2}, form === 'nom.pl' ? ex : null);
    }
    if (pl === 'ья' && sg === '') { suffix('noun', ['gen.pl'], 'ьев', '', [], NOUN, {stemMinLength: 2}, ['братьев', 'брат']); }
}

// Plural-only nouns, whose lemma is the nominative plural (часы, деньги, сутки, люди).
for (const [inflected, lemma, ex] of [
    ['ов', 'ы', ['часов', 'часы']], ['ам', 'ы', ['часам', 'часы']], ['ами', 'ы', ['часами', 'часы']], ['ах', 'ы', ['часах', 'часы']],
    ['ам', 'и', ['брюкам', 'брюки']], ['ами', 'и', ['брюками', 'брюки']], ['ах', 'и', ['брюках', 'брюки']],
    ['ей', 'и', ['людей', 'люди']], ['ям', 'и', ['людям', 'люди']], ['ями', 'и', null], ['ях', 'и', ['людях', 'люди']], ['ьми', 'и', ['людьми', 'люди']],
    ['', 'ы', ['ножниц', 'ножницы']], ['', 'и', ['брюк', 'брюки']], ['ок', 'ки', ['суток', 'сутки']], ['ег', 'ьги', ['денег', 'деньги']],
]) {
    const forms = {ов: 'gen.pl', ей: 'gen.pl', '': 'gen.pl', ок: 'gen.pl', ег: 'gen.pl', ам: 'dat.pl', ям: 'dat.pl', ами: 'ins.pl', ями: 'ins.pl', ьми: 'ins.pl', ах: 'prp.pl', ях: 'prp.pl'};
    const constraints = {stemMinLength: inflected === '' ? 3 : 2, stemEndsWith: inflected === '' ? CONSONANT : '[^ьй]'};
    if (inflected === '') { constraints.stemNotStartsWith = CAPITAL; }
    suffix('noun', [forms[inflected]], inflected, lemma, [], NOUN, constraints, ex);
}

// The fleeting vowel of a masculine or feminine stem (отц- → отец, дн- → день, любв- → любовь).
for (const [inflected, lemma, stemEnd, ex] of [
    ['к', 'ок', CONSONANT, ['куска', 'кусок']], ['к', 'ек', HUSHING, ['человечка', 'человечек']],
    ['ьк', 'ёк', null, ['кошелька', 'кошелёк']], ['йк', 'ёк', null, ['пайка', 'паёк']],
    ['ц', 'ец', '[бвгджзклмнпрстфхчшщ]', ['отца', 'отец']], ['льц', 'лец', null, ['пальца', 'палец']],
    ['йц', 'ец', VOWEL, ['бойца', 'боец']], ['йц', 'яц', VOWEL, ['зайца', 'заяц']],
    ['нь', 'ень', CONSONANT, ['дня', 'день']], ['нь', 'онь', '[г]', ['огня', 'огонь']],
    ['ьй', 'ей', null, ['воробья', 'воробей']],
    ['л', 'ол', '[г]', ['угла', 'угол']], ['ль', 'оль', '[г]', ['угля', 'уголь']],
    ['л', 'ёл', '[зстр]', ['орла', 'орёл']], ['л', 'ел', '[зпт]', ['узла', 'узел']],
    ['р', 'ер', '[т]', ['ветра', 'ветер']], ['р', 'ёр', '[тв]', ['костра', 'костёр']], ['р', 'ор', '[к]', ['свёкра', 'свёкор']],
    ['ль', 'ель', '[шт]', ['кашля', 'кашель']],
    ['вь', 'овь', CONSONANT, ['любви', 'любовь']],
]) {
    const extra = {stemMinLength: 1};
    if (stemEnd !== null) { extra.stemEndsWith = stemEnd; }
    suffix('noun', ['fleeting'], inflected, lemma, ['fl'], NOUN, extra, ex);
}
for (const [inflected, lemma] of [['рт', 'рот'], ['сн', 'сон'], ['лб', 'лоб'], ['пс', 'пёс'], ['льд', 'лёд'], ['льв', 'лев'], ['льн', 'лён'], ['мх', 'мох'], ['рв', 'ров'], ['шв', 'шов'], ['лжь', 'ложь'], ['ржь', 'рожь'], ['вшь', 'вошь']]) {
    suffix('noun', ['fleeting'], inflected, lemma, ['fl'], NOUN, {}, null);
}

// Irregular nouns, as whole words.
for (const [lemma, forms] of [
    ['человек', {'nom.pl': 'люди', 'gen.pl': 'людей', 'dat.pl': 'людям', 'ins.pl': 'людьми', 'prp.pl': 'людях'}],
    ['ребёнок', {'nom.pl': 'дети', 'gen.pl': 'детей', 'dat.pl': 'детям', 'ins.pl': 'детьми', 'prp.pl': 'детях'}],
    ['ухо', {'nom.pl': 'уши', 'gen.pl': 'ушей', 'dat.pl': 'ушам', 'ins.pl': 'ушами', 'prp.pl': 'ушах'}],
    ['око', {'nom.pl': 'очи', 'gen.pl': 'очей', 'dat.pl': 'очам', 'ins.pl': 'очами', 'prp.pl': 'очах'}],
    ['небо', {'nom.pl': 'небеса', 'gen.pl': 'небес', 'dat.pl': 'небесам', 'ins.pl': 'небесами', 'prp.pl': 'небесах'}],
    ['чудо', {'nom.pl': 'чудеса', 'gen.pl': 'чудес', 'dat.pl': 'чудесам', 'ins.pl': 'чудесами', 'prp.pl': 'чудесах'}],
    ['колено', {'nom.pl': 'колени', 'gen.pl': 'коленей', 'dat.pl': 'коленям', 'ins.pl': 'коленями', 'prp.pl': 'коленях'}],
    ['господин', {'nom.pl': 'господа', 'gen.pl': 'господ', 'dat.pl': 'господам', 'ins.pl': 'господами', 'prp.pl': 'господах'}],
    ['хозяин', {'nom.pl': 'хозяева', 'gen.pl': 'хозяев', 'dat.pl': 'хозяевам', 'ins.pl': 'хозяевами', 'prp.pl': 'хозяевах'}],
    ['сосед', {'nom.pl': 'соседи', 'gen.pl': 'соседей', 'dat.pl': 'соседям', 'ins.pl': 'соседями', 'prp.pl': 'соседях'}],
    ['чёрт', {'nom.pl': 'черти', 'gen.pl': 'чертей', 'dat.pl': 'чертям', 'ins.pl': 'чертями', 'prp.pl': 'чертях'}],
    ['цветок', {'nom.pl': 'цветы', 'gen.pl': 'цветов', 'dat.pl': 'цветам', 'ins.pl': 'цветами', 'prp.pl': 'цветах'}],
    ['путь', {'ins.sg': 'путём'}],
    ['семя', {'nom.pl': 'семена', 'gen.pl': 'семян', 'dat.pl': 'семенам', 'ins.pl': 'семенами', 'prp.pl': 'семенах'}],
    ['очки', {'gen.pl': 'очков', 'dat.pl': 'очкам', 'ins.pl': 'очками', 'prp.pl': 'очках'}],
    // деньги's forms, which the -а declension also reads as the rare деньга.
    ['деньги', {'gen.pl': 'денег', 'dat.pl': 'деньгам', 'ins.pl': 'деньгами', 'prp.pl': 'деньгах'}],
    ['господь', {'dat.sg': 'господу', 'ins.sg': 'господом', 'prp.sg': 'господе'}],
]) {
    for (const [form, word] of Object.entries(forms)) {
        wholeWord('noun', [form], word, lemma, [], NOUN, [word, lemma]);
    }
}

// --- Adjectives and participles ---------------------------------------------------
// adjective(lemma ending, class of the stem's last letter, {ending: [forms]}).
// The forms of an ending are the cases and genders it has in that class.
// Long forms also reach nouns and names declined as adjectives (учёного →
// учёный, Толстого → Толстой), so their output is a noun or a name too.
const LONG = ['adj', 'n', 'name'];
function adjective(lemma, stemEnd, table, {min = 2, example = null, conditionsOut = LONG} = {}) {
    for (const [ending, forms] of Object.entries(table)) {
        const extra = {stemMinLength: min};
        if (stemEnd !== null) { extra.stemEndsWith = stemEnd; }
        // A capitalised word read as an -ой adjective is mostly a name's form
        // that wiktionary-to-yomitan lists (Милая → Милой → Мила, Никого →
        // Никой → Ника); the surnames in -ой have their own form-of rows
        // (Толстого → Толстой), so -ой leaves out capitalised stems.
        if (lemma === 'ой') { extra.stemNotStartsWith = CAPITAL; }
        const ex = example && example[ending] ? [example[ending], example.lemma] : null;
        suffix('adj', forms, ending, lemma, [], conditionsOut, extra, ex);
        // Text writes ё as е, dictionaries write ё (темном → тёмный, веселого →
        // весёлый, отдаленной → отдалённый): the same ending with the stem's
        // last е, before consonants only, written ё. Without it the adverb or
        // short form in -о (темно, весело), which a noun rule reaches without a
        // processor step, would come before the adjective.
        if (!ending.includes('ё')) {
            put('adj', forms, {type: 'suffix', inflected: ending, deinflected: lemma, conditionsIn: [], conditionsOut, stemCharacters: STEM, ...extra,
                stemChange: {from: ['е'], to: 'ё', occurrence: 'last', between: CONSONANT}}, null);
        }
    }
}

const HARD_ENDINGS = {
    ого: ['gen.m', 'gen.n', 'acc.m'], ому: ['dat.m', 'dat.n'], ым: ['ins.m', 'ins.n', 'dat.pl'], ом: ['prp.m', 'prp.n'],
    ое: ['nom.n', 'acc.n'], ая: ['nom.f'], ой: ['gen.f', 'dat.f', 'ins.f', 'prp.f'], ую: ['acc.f'], ою: ['ins.f'],
    ые: ['nom.pl', 'acc.pl'], ых: ['gen.pl', 'prp.pl', 'acc.pl'], ыми: ['ins.pl'],
};
const VELAR_ENDINGS = {
    ого: ['gen.m', 'gen.n', 'acc.m'], ому: ['dat.m', 'dat.n'], им: ['ins.m', 'ins.n', 'dat.pl'], ом: ['prp.m', 'prp.n'],
    ое: ['nom.n', 'acc.n'], ая: ['nom.f'], ой: ['gen.f', 'dat.f', 'ins.f', 'prp.f'], ую: ['acc.f'], ою: ['ins.f'],
    ие: ['nom.pl', 'acc.pl'], их: ['gen.pl', 'prp.pl', 'acc.pl'], ими: ['ins.pl'],
};
const SOFT_ENDINGS = (a, u) => ({
    его: ['gen.m', 'gen.n', 'acc.m'], ему: ['dat.m', 'dat.n'], им: ['ins.m', 'ins.n', 'dat.pl'], ем: ['prp.m', 'prp.n'],
    ее: ['nom.n', 'acc.n'], [a]: ['nom.f'], ей: ['gen.f', 'dat.f', 'ins.f', 'prp.f'], [u]: ['acc.f'], ею: ['ins.f'],
    ие: ['nom.pl', 'acc.pl'], их: ['gen.pl', 'prp.pl', 'acc.pl'], ими: ['ins.pl'],
});

// новый, молодой; русский, другой; хороший, большой; синий; третий.
adjective('ый', HARD, HARD_ENDINGS, {example: {lemma: 'новый', ого: 'нового', ому: 'новому', ым: 'новым', ом: 'новом', ое: 'новое', ая: 'новая', ой: 'новой', ую: 'новую', ою: 'новою', ые: 'новые', ых: 'новых', ыми: 'новыми'}});
adjective('ой', HARD, Object.fromEntries(Object.entries(HARD_ENDINGS).filter(([ending]) => ending !== 'ой')), {example: {lemma: 'молодой', ого: 'молодого'}});
adjective('ий', VELAR, VELAR_ENDINGS, {example: {lemma: 'русский', ого: 'русского', ой: 'русской', ие: 'русские'}});
adjective('ой', VELAR, Object.fromEntries(Object.entries(VELAR_ENDINGS).filter(([ending]) => ending !== 'ой')), {example: {lemma: 'другой', ого: 'другого', ие: 'другие'}});
// The -ой rows come first: большой, чужой and other common -ой adjectives
// tie with the comparative-like -ий lemmas wty-ru-en lists (больший), and the
// first row reached wins the tie (docs/languages.md 9.6).
adjective('ой', HUSHING, Object.fromEntries(Object.entries(VELAR_ENDINGS).filter(([ending]) => ending !== 'ой')), {example: {lemma: 'большой', ого: 'большого', им: 'большим'}});
adjective('ий', HUSHING, SOFT_ENDINGS('ая', 'ую'), {example: {lemma: 'хороший', его: 'хорошего', ая: 'хорошая', ей: 'хорошей', ую: 'хорошую'}});
adjective('ий', '[нр]', SOFT_ENDINGS('яя', 'юю'), {example: {lemma: 'синий', его: 'синего', яя: 'синяя', юю: 'синюю'}});
adjective('ий', null, Object.fromEntries(Object.entries(SOFT_ENDINGS('я', 'ю')).map(([ending, forms]) => [`ь${ending}`, forms])), {min: 1, example: {lemma: 'третий', ьего: 'третьего', ья: 'третья', ье: 'третье'}});

// Nouns declined as feminine or neuter adjectives, whose lemma is the feminine
// or neuter nominative (запятая, столовая, животное, жаркое): the plural and
// the feminine oblique forms. Their output is a noun only.
for (const [ending, forms, lemmaF, lemmaN] of [
    ['ой', ['gen.f', 'dat.f', 'ins.f', 'prp.f'], 'ая', null], ['ую', ['acc.f'], 'ая', null], ['ою', ['ins.f'], 'ая', null],
    ['ые', ['nom.pl', 'acc.pl'], 'ая', 'ое'], ['ых', ['gen.pl', 'prp.pl', 'acc.pl'], 'ая', 'ое'], ['ым', ['dat.pl'], 'ая', 'ое'], ['ыми', ['ins.pl'], 'ая', 'ое'],
    ['ого', ['gen.n'], null, 'ое'], ['ому', ['dat.n'], null, 'ое'], ['ом', ['prp.n'], null, 'ое'],
]) {
    for (const lemma of [lemmaF, lemmaN]) {
        if (lemma === null) { continue; }
        const stemEnd = ['ого', 'ому', 'ом', 'ой', 'ую', 'ою'].includes(ending) ? '[бвдзлмнпрстфгкх]' : HARD;
        suffix('adj', forms, ending, lemma, [], ['n'], {stemMinLength: 3, stemEndsWith: stemEnd}, ending === 'ые' && lemma === 'ая' ? ['запятые', 'запятая'] : ending === 'ого' ? ['животного', 'животное'] : null);
    }
}
for (const [ending, forms] of [['ие', ['nom.pl', 'acc.pl']], ['их', ['gen.pl', 'prp.pl', 'acc.pl']], ['им', ['dat.pl']], ['ими', ['ins.pl']]]) {
    suffix('adj', forms, ending, 'ая', [], ['n'], {stemMinLength: 3, stemEndsWith: '[гкхжшщч]'}, ending === 'ие' ? ['прачечные', 'прачечная'] : null);
    suffix('adj', forms, ending, 'ее', [], ['n'], {stemMinLength: 3, stemEndsWith: '[жшщч]'}, ending === 'ие' ? ['подлежащие', 'подлежащее'] : null);
    suffix('adj', forms, ending, 'ое', [], ['n'], {stemMinLength: 3, stemEndsWith: '[гкх]'}, ending === 'ими' ? ['жаркими', 'жаркое'] : null);
}

// Reflexive participles (читающийся, учившийся), declined like хороший with -ся.
for (const [ending, forms] of Object.entries(SOFT_ENDINGS('ая', 'ую'))) {
    suffix('adj', forms, `${ending}ся`, 'ийся', [], ADJ, {stemMinLength: 2, stemEndsWith: '[шщ]'}, ending === 'его' ? ['учащегося', 'учащийся'] : null);
}

// Possessive adjectives and surnames in -ин, -ын, -ов, -ев (мамин, Пушкин, Иванов):
// the forms noun rules do not already give.
for (const [ending, forms] of Object.entries({ым: ['ins.m', 'ins.n', 'dat.pl'], ых: ['gen.pl', 'prp.pl', 'acc.pl'], ыми: ['ins.pl'], ой: ['gen.f', 'dat.f', 'ins.f', 'prp.f'], о: ['nom.n']})) {
    suffix('adj', forms, ending, '', [], ['n', 'name', 'adj'], {stemMinLength: 3, stemEndsWith: '[нв]'}, ending === 'ым' ? ['Пушкиным', 'Пушкин'] : null);
}

// Short forms (красив, красива, красиво, красивы).
// A stressed -ой adjective has the same short forms, but a rule from -а, -о and -ы
// to -ой would read every noun in -а as one (дома → домой, пока → покой), so
// the common ones are written out below.
for (const [lemma, stemEnd] of [['ый', HARD], ['ий', '[гкхжшщч]']]) {
    suffix('adj', ['short.f'], 'а', lemma, [], ADJ, {stemMinLength: 2, stemEndsWith: stemEnd}, lemma === 'ый' ? ['красива', 'красивый'] : null);
    suffix('adj', ['short.n'], 'о', lemma, [], ADJ, {stemMinLength: 2, stemEndsWith: stemEnd}, lemma === 'ый' ? ['красиво', 'красивый'] : null);
    suffix('adj', ['short.pl'], stemEnd === HARD ? 'ы' : 'и', lemma, [], ADJ, {stemMinLength: 2, stemEndsWith: stemEnd}, lemma === 'ый' ? ['красивы', 'красивый'] : null);
}
suffix('adj', ['short.m'], '', 'ый', [], ADJ, {stemMinLength: 2, stemEndsWith: HARD, stemNotStartsWithText: 'сам'}, ['красив', 'красивый']);
for (const lemma of ['молодой', 'простой', 'живой', 'густой', 'пустой', 'святой', 'слепой', 'немой', 'голубой', 'седой', 'худой', 'крутой', 'тупой', 'прямой', 'родной', 'больной', 'смешной', 'страшной']) {
    const stem = lemma.slice(0, -2);
    const short = /н$/u.test(stem) && /[^аеёиоуыэюя]н$/u.test(stem) ? `${stem.slice(0, -1)}ен` : stem;
    for (const [form, word] of [['short.m', short], ['short.f', `${stem}а`], ['short.n', `${stem}о`], ['short.pl', `${stem}ы`]]) {
        if (word === 'нем') { continue; }  // нём's, far more often than немой's short form
        wholeWord('adj', [form], word, lemma, [], ADJ, form === 'short.m' && lemma === 'молодой' ? ['молод', 'молодой'] : form === 'short.f' && lemma === 'простой' ? ['проста', 'простой'] : null);
    }
}
// другой has no short forms (друга is друг's).
for (const lemma of ['дорогой', 'сухой', 'плохой', 'глухой', 'тихой', 'нагой', 'строгой']) {
    const stem = lemma.slice(0, -2);
    for (const [form, word] of [['short.m', stem], ['short.f', `${stem}а`], ['short.n', `${stem}о`], ['short.pl', `${stem}и`]]) {
        if (word === 'дороги') { continue; }  // дорога's, far more often than дорогой's short form
        wholeWord('adj', [form], word, lemma, [], ADJ, form === 'short.f' && lemma === 'плохой' ? ['плоха', 'плохой'] : null);
    }
}
suffix('adj', ['short.m'], '', 'ий', [], ADJ, {stemMinLength: 2, stemEndsWith: '[гкхжшщч]'}, ['тих', 'тихий']);
// прав and сер are short forms of правый and серый far more often than the
// genitive plurals of права, право and сера, which the zero ending reads first.
for (const [word, lemma] of [['прав', 'правый'], ['сер', 'серый']]) {
    wholeWord('adj', ['short.m'], word, lemma, [], ADJ, word === 'прав' ? ['прав', 'правый'] : null);
}
// With a fleeting vowel (интересен, болен, умён, полон, короток, светел, зол, горек).
for (const [inflected, lemma, stemEnd, ex] of [
    ['ен', 'ный', CONSONANT, ['интересен', 'интересный']], ['ён', 'ный', CONSONANT, ['умён', 'умный']],
    ['лен', 'льный', null, ['силен', 'сильный']], ['лён', 'льный', null, ['силён', 'сильный']], ['лен', 'льной', null, ['болен', 'больной']],
    ['он', 'ный', '[л]', ['полон', 'полный']], ['ок', 'кий', CONSONANT, ['короток', 'короткий']], ['ёк', 'кий', CONSONANT, ['лёгок', 'лёгкий']],
    ['ек', 'ький', '[р]', ['горек', 'горький']], ['ел', 'лый', '[т]', ['светел', 'светлый']], ['ол', 'лой', '[з]', ['зол', 'злой']],
    ['ог', 'гий', '[л]', ['долог', 'долгий']], ['ёр', 'рый', '[т]', ['остёр', 'острый']],
]) {
    const extra = {stemMinLength: 1};
    if (stemEnd !== null) { extra.stemEndsWith = stemEnd; }
    suffix('adj', ['short.m'], inflected, lemma, [], ADJ, extra, ex);
}
// Short forms of participles and adjectives in -нный (сделан, сделана, решён, решена, уверен).
for (const [inflected, form] of [['н', 'short.m'], ['на', 'short.f'], ['но', 'short.n'], ['ны', 'short.pl']]) {
    suffix('adj', [form], inflected, 'нный', [], ADJ, {stemMinLength: 2, stemEndsWith: '[аяеёо]'}, form === 'short.f' ? ['сделана', 'сделанный'] : form === 'short.m' ? ['сделан', 'сделанный'] : null);
}
for (const [inflected, form] of [['ена', 'short.f'], ['ено', 'short.n'], ['ены', 'short.pl']]) {
    suffix('adj', [form], inflected, 'ённый', [], ADJ, {stemMinLength: 2}, form === 'short.f' ? ['решена', 'решённый'] : null);
}

// Comparatives (быстрее, красивей, громче, дороже, тише, чище, дешевле), and по- (побыстрее).
prefixRule('adj', ['po'], 'по', '', [], ['cmp'], {stemMinLength: 3}, ['побыстрее', 'быстрее']);
for (const [inflected, lemma, stemEnd, ex] of [
    ['ее', 'ый', CONSONANT, ['быстрее', 'быстрый']], ['ее', 'ой', CONSONANT, ['больнее', 'больной']], ['ее', 'ий', '[нгкхжшщч]', null],
    ['ей', 'ый', CONSONANT, ['быстрей', 'быстрый']], ['ей', 'ой', CONSONANT, null], ['ей', 'ий', '[нгкхжшщч]', null],
    ['че', 'кий', CONSONANT, ['громче', 'громкий']], ['че', 'тый', VOWEL, ['богаче', 'богатый']], ['че', 'той', VOWEL, ['круче', 'крутой']], ['оче', 'откий', null, ['короче', 'короткий']],
    ['же', 'гий', VOWEL, ['строже', 'строгий']], ['же', 'гой', VOWEL, ['дороже', 'дорогой']], ['же', 'дой', VOWEL, ['моложе', 'молодой']], ['же', 'дый', CONSONANT, ['твёрже', 'твёрдый']],
    ['же', 'зкий', VOWEL, ['ниже', 'низкий']], ['же', 'дкий', VOWEL, ['реже', 'редкий']],
    ['ше', 'хий', VOWEL, ['тише', 'тихий']], ['ше', 'хой', VOWEL, ['суше', 'сухой']],
    ['ще', 'стый', VOWEL, ['чище', 'чистый']], ['ще', 'стой', VOWEL, ['проще', 'простой']], ['ще', 'дкий', VOWEL, ['слаще', 'сладкий']],
    ['вле', 'вый', VOWEL, ['дешевле', 'дешёвый']], ['бже', 'бокий', VOWEL, ['глубже', 'глубокий']],
    ['ньше', 'нкий', VOWEL, ['тоньше', 'тонкий']], ['льше', 'лгий', VOWEL, ['дольше', 'долгий']], ['рше', 'рый', VOWEL, ['старше', 'старый']],
]) {
    const extra = {stemMinLength: 2, stemNotStartsWith: CAPITAL};
    if (stemEnd !== null) { extra.stemEndsWith = stemEnd; }
    suffix('adj', ['cmp'], inflected, lemma, ['cmp'], ADJ, extra, ex);
}
for (const [word, lemma] of [
    ['лучше', 'хороший'], ['хуже', 'плохой'], ['больше', 'большой'], ['меньше', 'маленький'], ['выше', 'высокий'], ['шире', 'широкий'],
    ['дальше', 'далёкий'], ['позже', 'поздний'], ['раньше', 'ранний'], ['младше', 'молодой'], ['легче', 'лёгкий'], ['уже', 'узкий'],
]) {
    wholeWord('adj', ['cmp'], word, lemma, ['cmp'], ADJ, [word, lemma]);
}
// Adverbs of manner by по- (по-новому, по-старинному, по-хорошему, по-русски,
// по-волчьи) read as their adjective; the common ones are also headwords.
put('adj', ['adverb'], {type: 'circumfix', prefixes: [['по-', '']], suffixes: [['ому', 'ый'], ['ому', 'ой'], ['ему', 'ий'], ['ски', 'ский'], ['цки', 'цкий'], ['ьи', 'ий']],
    conditionsIn: [], conditionsOut: ADJ, stemCharacters: STEM, stemMinLength: 2}, ['по-старинному', 'старинный']);
// Superlatives in -ейший, -айший (новейший, величайший, строжайший, ближайший, тишайший).
for (const [inflected, lemma, stemEnd, ex] of [
    ['ейший', 'ый', CONSONANT, ['новейший', 'новый']], ['ейший', 'ой', CONSONANT, ['простейший', 'простой']],
    ['чайший', 'кий', null, ['величайший', 'великий']], ['жайший', 'гий', null, ['строжайший', 'строгий']],
    ['жайший', 'зкий', null, ['ближайший', 'близкий']], ['жайший', 'гой', null, ['дорожайший', 'дорогой']], ['шайший', 'хий', null, ['тишайший', 'тихий']],
]) {
    const extra = {stemMinLength: 2, stemNotStartsWith: CAPITAL};
    if (stemEnd !== null) { extra.stemEndsWith = stemEnd; }
    suffix('adj', ['sup'], inflected, lemma, ADJ, ADJ, extra, ex);
}

// --- Verbs ------------------------------------------------------------------------------
// Forms made from the infinitive stem: past, past active participle, past
// adverbial participle (читать: читал, читала, читало, читали, читавший, читав).
for (const vowel of ['а', 'я', 'е', 'и', 'у', 'ы', 'о']) {
    const inf = `${vowel}ть`;
    const ex = {а: 'чита', я: 'гуля', е: 'уме', и: 'говори', у: 'верну', ы: 'забы', о: 'коло'}[vowel];
    // A stem of two letters: the verbs whose stem has one letter (дать, деть,
    // пить, быть, мыть …) are written out below, so that дело, мало, сила and
    // тело are not read as деть, мать, сить and теть.
    verb(['past.m'], `${vowel}л`, inf, {stemMinLength: 2}, [`${ex}л`, `${ex}ть`]);
    verb(['past.f'], `${vowel}ла`, inf, {stemMinLength: 2}, [`${ex}ла`, `${ex}ть`]);
    verb(['past.n'], `${vowel}ло`, inf, {stemMinLength: 2}, [`${ex}ло`, `${ex}ть`]);
    verb(['past.pl'], `${vowel}ли`, inf, {stemMinLength: 2}, [`${ex}ли`, `${ex}ть`]);
    verb(['ptcp.past.act'], `${vowel}вший`, inf, {stemMinLength: 1}, [`${ex}вший`, `${ex}ть`]);
    if (vowel !== 'о') {
        verb(['ger.past'], `${vowel}в`, inf, {stemMinLength: 2}, [`${ex}в`, `${ex}ть`], {refl: false});
        verb(['ger.past'], `${vowel}вши`, inf, {stemMinLength: 2}, [`${ex}вши`, `${ex}ть`]);
    }
}
// The past of verbs whose infinitive stem has one letter, and of their prefixed
// verbs (дал, отдала, допил, прожили, надело).
for (const inf of ['дать', 'жать', 'мять', 'деть', 'петь', 'греть', 'бить', 'вить', 'жить', 'лить', 'пить', 'шить', 'гнить', 'дуть', 'быть', 'выть', 'мыть', 'ныть', 'рыть', 'крыть']) {
    const stem = inf.slice(0, -2);
    for (const [form, ending] of [['past.m', 'л'], ['past.f', 'ла'], ['past.n', 'ло'], ['past.pl', 'ли']]) {
        verb([form], stem + ending, inf, {stemMinLength: 0}, form === 'past.f' && inf === 'дать' ? ['отдала', 'отдать'] : form === 'past.m' && inf === 'пить' ? ['допил', 'допить'] : null);
    }
}

// Past passive participles from the infinitive stem (сделанный, потерянный, увиденный, открытый, убитый, тронутый, взятый, колотый).
for (const [inflected, inf, min, ex] of [
    ['анный', 'ать', 1, ['сделанный', 'сделать']], ['янный', 'ять', 1, ['потерянный', 'потерять']], ['енный', 'еть', 2, ['увиденный', 'увидеть']],
    ['ытый', 'ыть', 1, ['открытый', 'открыть']], ['итый', 'ить', 1, ['убитый', 'убить']], ['утый', 'уть', 1, ['тронутый', 'тронуть']],
    ['ятый', 'ять', 2, ['взятый', 'взять']], ['атый', 'ать', 2, ['начатый', 'начать']], ['отый', 'оть', 2, ['колотый', 'колоть']],
    ['ертый', 'ереть', 1, ['запертый', 'запереть']], ['ёртый', 'ереть', 1, ['стёртый', 'стереть']],
]) {
    verb(['ptcp.past.pass'], inflected, inf, {stemMinLength: min}, ex, {refl: false});
}

const E1V = {'pres.1sg': 'ю', 'pres.2sg': 'ешь', 'pres.3sg': 'ет', 'pres.1pl': 'ем', 'pres.2pl': 'ете', 'pres.3pl': 'ют'};
const E1V_STRESSED = {'pres.1sg': 'ю', 'pres.2sg': 'ёшь', 'pres.3sg': 'ёт', 'pres.1pl': 'ём', 'pres.2pl': 'ёте', 'pres.3pl': 'ют'};
const E1C = {'pres.1sg': 'у', 'pres.2sg': 'ёшь', 'pres.3sg': 'ёт', 'pres.1pl': 'ём', 'pres.2pl': 'ёте', 'pres.3pl': 'ут'};
const E1C_SOFT = {'pres.1sg': 'ю', 'pres.2sg': 'ешь', 'pres.3sg': 'ет', 'pres.1pl': 'ем', 'pres.2pl': 'ете', 'pres.3pl': 'ют'};
const E2 = {'pres.1sg': 'ю', 'pres.2sg': 'ишь', 'pres.3sg': 'ит', 'pres.1pl': 'им', 'pres.2pl': 'ите', 'pres.3pl': 'ят'};
const E2_HUSHING = {'pres.1sg': 'у', 'pres.2sg': 'ишь', 'pres.3sg': 'ит', 'pres.1pl': 'им', 'pres.2pl': 'ите', 'pres.3pl': 'ат'};

/**
 * A present (or perfective future) class: the last letters of the present
 * stem (`pres`, part of every ending), the infinitive ending, the personal
 * endings, the imperative endings, and whether the present participles and
 * adverbial participle are made (from the third-person plural, the first-person
 * plural and the stem). `skip` leaves out forms written elsewhere.
 */
function presentClass({pres, inf, endings, imp = [], act = true, pass = false, ger = null, min = 2, stemEnd = null, stemNotEnd = null, example = null, skip = [], gerExclude = null, exclude = null, excludeForms = null}) {
    const base = {stemMinLength: min};
    if (stemEnd !== null) { base.stemEndsWith = stemEnd; }
    if (stemNotEnd !== null) { base.stemNotEndsWith = stemNotEnd; }
    // exclude: a stem text left out, in every form or only in excludeForms.
    const extraFor = (form) => (exclude !== null && (excludeForms === null || excludeForms.includes(form)) ? {...base, stemNotStartsWithText: exclude} : base);
    const extra = extraFor('ptcp.pres.act');
    const ex = (form) => (example && example[form] ? [example[form], example.inf] : null);
    for (const [form, ending] of Object.entries(endings)) {
        if (skip.includes(form)) { continue; }
        verb([form], pres + ending, inf, extraFor(form), ex(form));
    }
    for (const ending of imp) {
        verb(['imp.2sg'], pres + ending, inf, extraFor('imp.2sg'), ex('imp.2sg'));
        verb(['imp.2pl'], `${pres}${ending}те`, inf, extraFor('imp.2pl'), ex('imp.2pl'));
    }
    if (act && !skip.includes('ptcp.pres.act')) {
        verb(['ptcp.pres.act'], `${pres}${endings['pres.3pl'].slice(0, -1)}щий`, inf, extra, ex('ptcp.pres.act'));
    }
    if (pass) {
        const pl1 = endings['pres.1pl'];
        // ведомый, несомый after a consonant; рисуемый after a vowel.
        const passive = pl1 === 'ём' ? (/[аяеуюо]$/u.test(pres) ? 'ем' : 'ом') : pl1;
        verb(['ptcp.pres.pass'], `${pres}${passive}ый`, inf, extraFor('ptcp.pres.pass'), ex('ptcp.pres.pass'), {refl: false});
    }
    if (ger !== null) {
        const gerExtra = gerExclude === null ? extraFor('ger.pres') : {...base, stemNotStartsWithText: gerExclude};
        verb(['ger.pres'], pres + ger, inf, gerExtra, ex('ger.pres'));
    }
}

// First conjugation, vowel stems: читать, гулять, уметь, рисовать, танцевать, воевать, дуть, мыть, пить, надеяться, таять, давать.
presentClass({pres: 'а', inf: 'ать', endings: E1V, imp: ['й'], pass: true, ger: 'я', example: {inf: 'читать', 'pres.1sg': 'читаю', 'pres.2sg': 'читаешь', 'pres.3sg': 'читает', 'pres.1pl': 'читаем', 'pres.2pl': 'читаете', 'pres.3pl': 'читают', 'imp.2sg': 'читай', 'imp.2pl': 'читайте', 'ptcp.pres.act': 'читающий', 'ptcp.pres.pass': 'читаемый', 'ger.pres': 'читая'}});
presentClass({pres: 'я', inf: 'ять', endings: E1V, imp: ['й'], pass: true, ger: 'я', example: {inf: 'гулять', 'pres.3sg': 'гуляет', 'ger.pres': 'гуляя'}});
presentClass({pres: 'е', inf: 'еть', endings: E1V, imp: ['й'], pass: false, ger: 'я', example: {inf: 'уметь', 'pres.3sg': 'умеет', 'imp.2sg': 'умей'}});
// After ж, ш, щ, ч and ц the infinitive is -евать (танцевать), so -овать leaves those
// stems out (танцует is not танцовать, an old spelling).
presentClass({pres: 'у', inf: 'овать', endings: E1V_STRESSED, imp: ['й'], pass: true, ger: 'я', min: 1, stemNotEnd: '[жшщчц]', example: {inf: 'рисовать', 'pres.1sg': 'рисую', 'pres.3sg': 'рисует', 'imp.2sg': 'рисуй', 'ptcp.pres.act': 'рисующий', 'ger.pres': 'рисуя'}});
presentClass({pres: 'у', inf: 'евать', endings: E1V_STRESSED, imp: ['й'], pass: true, ger: 'я', min: 1, stemEnd: '[жшщчц]', example: {inf: 'танцевать', 'pres.1sg': 'танцую'}});
presentClass({pres: 'ю', inf: 'евать', endings: E1V_STRESSED, imp: ['й'], pass: true, ger: 'я', min: 1, example: {inf: 'воевать', 'pres.1sg': 'воюю'}});
presentClass({pres: 'у', inf: 'уть', endings: E1V_STRESSED, imp: ['й'], ger: 'я', min: 1, example: {inf: 'дуть', 'pres.1sg': 'дую'}});
presentClass({pres: 'о', inf: 'ыть', endings: E1V, imp: [], min: 1, example: {inf: 'мыть', 'pres.1sg': 'мою', 'pres.3sg': 'моет'}});
verb(['imp.2sg'], 'ой', 'ыть', {stemMinLength: 2}, ['открой', 'открыть']);
verb(['imp.2pl'], 'ойте', 'ыть', {stemMinLength: 2}, ['откройте', 'открыть']);
presentClass({pres: 'ь', inf: 'ить', endings: E1V_STRESSED, imp: [], min: 1, example: {inf: 'пить', 'pres.1sg': 'пью', 'pres.3sg': 'пьёт'}});
verb(['imp.2sg'], 'ей', 'ить', {stemMinLength: 1, stemEndsWith: CONSONANT}, ['пей', 'пить']);
verb(['imp.2pl'], 'ейте', 'ить', {stemMinLength: 1, stemEndsWith: CONSONANT}, ['пейте', 'пить']);
presentClass({pres: 'е', inf: 'еять', endings: E1V_STRESSED, imp: ['й'], ger: 'я', min: 1, example: {inf: 'надеяться', 'pres.1sg': 'надеюсь', 'pres.2sg': 'надеешься'}});
presentClass({pres: 'а', inf: 'аять', endings: E1V, imp: ['й'], ger: 'я', min: 1, example: {inf: 'таять', 'pres.3sg': 'тает'}});
for (const stem of ['да', 'ста']) {
    presentClass({pres: stem, inf: `${stem}вать`, endings: E1V_STRESSED, imp: [], min: 0, example: {inf: `${stem}вать`, 'pres.1sg': `${stem}ю`, 'pres.3sg': `${stem}ёт`}});
}
// -знавать (узнавать, признавать) only with ё: written with е, узнает, узнаешь and
// знаешь are the -знать verbs' own forms (узнать, знать), which the regular
// -ать rules read; a dictionary's ё spelling is reached through yoToE.
for (const [form, ending] of Object.entries({'pres.1sg': 'ю', 'pres.2sg': 'ёшь', 'pres.3sg': 'ёт', 'pres.1pl': 'ём', 'pres.2pl': 'ёте', 'pres.3pl': 'ют'})) {
    const make = (inflected, deinflected) => ({type: 'suffix', inflected, deinflected, conditionsIn: [], conditionsOut: VERB, stemCharacters: STEM, stemMinLength: 0});
    put('verb', [form], make(`зна${ending}`, 'знавать'), form === 'pres.3sg' ? ['узнаёт', 'узнавать'] : null);
    put('verb', [form], make(reflexive(`зна${ending}`), 'знаваться'), form === 'pres.3sg' ? ['признаётся', 'признаваться'] : null);
}

// First conjugation, consonant stems: -нуть, стать, деть, писать, сказать, плакать, прятать, искать, клеветать, сыпать, колебать, дремать.
// The stem ми is left out: минут is минута's genitive plural, not the rare
// минуть's (мигнуть's forms keep a longer stem, мигнут).
presentClass({pres: 'н', inf: 'нуть', endings: E1C, imp: ['и'], exclude: 'ми', excludeForms: ['pres.3pl', 'imp.2sg', 'imp.2pl'], example: {inf: 'крикнуть', 'pres.1sg': 'крикну', 'pres.3sg': 'крикнет', 'imp.2sg': 'крикни'}});
presentClass({pres: 'стан', inf: 'стать', endings: E1C, imp: ['ь'], act: false, min: 0, example: {inf: 'встать', 'pres.1sg': 'встану', 'imp.2sg': 'встань'}});
presentClass({pres: 'ден', inf: 'деть', endings: E1C, imp: ['ь'], act: false, min: 1, example: {inf: 'надеть', 'pres.1sg': 'надену', 'imp.2sg': 'надень'}});
presentClass({pres: 'ш', inf: 'сать', endings: E1C, imp: ['и'], min: 2, example: {inf: 'писать', 'pres.1sg': 'пишу', 'pres.3sg': 'пишет', 'imp.2sg': 'пиши', 'ptcp.pres.act': 'пишущий'}});
presentClass({pres: 'ш', inf: 'хать', endings: E1C, imp: ['и'], min: 2, example: {inf: 'махать', 'pres.1sg': 'машу'}});
presentClass({pres: 'ж', inf: 'зать', endings: E1C, imp: ['и', 'ь'], min: 2, example: {inf: 'сказать', 'pres.1sg': 'скажу', 'pres.3sg': 'скажет', 'imp.2sg': 'скажи'}});
presentClass({pres: 'ч', inf: 'кать', endings: E1C, imp: ['ь'], ger: 'а', min: 2, example: {inf: 'плакать', 'pres.1sg': 'плачу', 'imp.2sg': 'плачь', 'ger.pres': 'плача'}});
// Not after с: the -стать verbs keep their т (перестанешь, стану), so a text such
// as пересчете is not перес- + -тать (it is пересчёт's prepositional).
presentClass({pres: 'ч', inf: 'тать', endings: E1C, imp: ['ь'], ger: 'а', min: 2, stemNotEnd: '[с]', example: {inf: 'прятать', 'pres.1sg': 'прячу'}});
presentClass({pres: 'щ', inf: 'скать', endings: E1C, imp: ['и'], min: 1, example: {inf: 'искать', 'pres.1sg': 'ищу', 'imp.2sg': 'ищи'}});
presentClass({pres: 'щ', inf: 'тать', endings: E1C, imp: ['и'], min: 2, example: {inf: 'клеветать', 'pres.1sg': 'клевещу'}});
for (const [cons, inf, ex] of [['пл', 'пать', 'сыплю'], ['бл', 'бать', 'колеблю'], ['мл', 'мать', 'дремлю']]) {
    presentClass({pres: cons, inf, endings: E1C_SOFT, imp: [], min: 1, example: {inf: {сыплю: 'сыпать', колеблю: 'колебать', дремлю: 'дремать'}[ex], 'pres.1sg': ex}});
}
verb(['imp.2sg'], 'пь', 'пать', {stemMinLength: 2}, ['сыпь', 'сыпать']);

// Stems of a few verbs whose present is not their infinitive's (ждать: жду; брать: беру; жить: живу; быть: буду).
for (const [pres, inf, imp, ger, min, ex] of [
    ['жд', 'ждать', ['и'], null, 0, 'жду'], ['бер', 'брать', ['и'], null, 0, 'беру'], ['дер', 'драть', ['и'], null, 0, 'деру'],
    ['зов', 'звать', ['и'], null, 0, 'зову'], ['рв', 'рвать', ['и'], null, 0, 'рву'], ['вр', 'врать', ['и'], null, 0, 'вру'],
    ['жр', 'жрать', ['и'], null, 0, 'жру'], ['рж', 'ржать', ['и'], null, 0, 'ржу'], ['тк', 'ткать', ['и'], null, 0, 'тку'], ['сос', 'сосать', ['и'], null, 0, 'сосу'],
    ['жив', 'жить', ['и'], 'я', 0, 'живу'], ['плыв', 'плыть', ['и'], 'я', 0, 'плыву'], ['слыв', 'слыть', ['и'], null, 0, 'слыву'],
    ['буд', 'быть', ['ь'], null, 0, 'буду'], ['ед', 'ехать', [], null, 0, 'еду'],
    ['ид', 'идти', ['и'], 'я', 0, 'иду'], ['йд', 'йти', ['и'], 'я', 1, 'пойду'], ['прид', 'прийти', ['и'], 'я', 0, 'приду'],
    ['с', 'сти', ['и'], 'я', 1, 'несу'], ['з', 'зти', ['и'], 'я', 1, 'везу'], ['д', 'сти', ['и'], 'я', 1, 'веду'],
    ['т', 'сти', ['и'], 'я', 1, 'мету'], ['ст', 'сти', ['и'], null, 1, 'расту'],
    ['клад', 'класть', ['и'], 'я', 0, 'кладу'], ['крад', 'красть', ['и'], 'я', 0, 'краду'], ['пад', 'пасть', ['и'], null, 1, 'упаду'],
    ['сяд', 'сесть', ['ь'], null, 0, 'сяду'], ['лез', 'лезть', ['ь'], null, 0, 'лезу'], ['р', 'ереть', ['и'], null, 1, 'умру'],
]) {
    const inflected = {жд: 'ждать', бер: 'брать', дер: 'драть', зов: 'звать', рв: 'рвать', вр: 'врать', жр: 'жрать', рж: 'ржать', тк: 'ткать', сос: 'сосать', жив: 'жить', плыв: 'плыть', слыв: 'слыть', буд: 'быть', ед: 'ехать', ид: 'идти', йд: 'пойти', прид: 'прийти', с: 'нести', з: 'везти', д: 'вести', т: 'мести', ст: 'расти', клад: 'класть', крад: 'красть', пад: 'упасть', сяд: 'сесть', лез: 'лезть', р: 'умереть'}[pres];
    const extra = ger === 'я' && ['с', 'з', 'д', 'т'].includes(pres) ? {gerStemEnd: true} : {};
    presentClass({pres, inf, endings: E1C, imp, ger: extra.gerStemEnd ? null : ger, min, act: pres !== 'буд' && pres !== 'пад', pass: ['с', 'д'].includes(pres), example: {inf: inflected, 'pres.1sg': ex}});
    if (extra.gerStemEnd) {
        verb(['ger.pres'], `${pres}я`, inf, {stemMinLength: 1, stemEndsWith: '[еаяо]'}, [{с: 'неся', з: 'везя', д: 'ведя', т: 'метя'}[pres], inflected]);
    }
}
verb(['ger.pres'], 'будучи', 'быть', {stemMinLength: 0}, ['будучи', 'быть'], {refl: false});
verb(['imp.2sg'], 'езжай', 'ехать', {stemMinLength: 0}, ['поезжай', 'поехать']);
verb(['imp.2pl'], 'езжайте', 'ехать', {stemMinLength: 0}, ['поезжайте', 'поехать']);

// -чь: печь (пеку, печёшь), мочь, беречь (могу, можешь; берегу, бережёшь).
for (const [k, c, ex] of [['к', 'ч', ['пеку', 'печь']], ['г', 'ж', ['могу', 'мочь']]]) {
    const endings = {'pres.1sg': `${k}у`, 'pres.2sg': `${c}ёшь`, 'pres.3sg': `${c}ёт`, 'pres.1pl': `${c}ём`, 'pres.2pl': `${c}ёте`, 'pres.3pl': `${k}ут`};
    for (const [form, ending] of Object.entries(endings)) { verb([form], ending, 'чь', {stemMinLength: 1}, form === 'pres.1sg' ? ex : null); }
    verb(['imp.2sg'], `${k}и`, 'чь', {stemMinLength: 1}, [k === 'к' ? 'пеки' : 'помоги', k === 'к' ? 'печь' : 'помочь']);
    verb(['imp.2pl'], `${k}ите`, 'чь', {stemMinLength: 1}, null);
    verb(['ptcp.pres.act'], `${k}ущий`, 'чь', {stemMinLength: 1}, null);
}
verb(['ptcp.pres.pass'], 'комый', 'чь', {stemMinLength: 2}, ['влекомый', 'влечь'], {refl: false});

// Second conjugation: говорить, смотреть, учить, слышать, стоять (and строить after a vowel).
presentClass({pres: '', inf: 'ить', endings: E2, imp: ['и'], pass: true, ger: 'я', example: {inf: 'говорить', 'pres.1sg': 'говорю', 'pres.2sg': 'говоришь', 'pres.3sg': 'говорит', 'pres.1pl': 'говорим', 'pres.2pl': 'говорите', 'pres.3pl': 'говорят', 'imp.2sg': 'говори', 'imp.2pl': 'говорите', 'ptcp.pres.act': 'говорящий', 'ptcp.pres.pass': 'любимый', 'ger.pres': 'говоря'}});
presentClass({pres: '', inf: 'еть', endings: E2, imp: ['и'], pass: true, ger: 'я', example: {inf: 'смотреть', 'pres.1sg': 'смотрю', 'pres.3sg': 'смотрит', 'imp.2sg': 'смотри', 'ger.pres': 'смотря'}});
// The imperative in -ь after a stressed stem (ставь, готовь, брось, верь, будь
// is written above): a stem of three letters, so that весь, три and the noun
// plurals in -и are not read as весить, тереть and imperatives in -ичь.
for (const inf of ['ить', 'еть']) {
    verb(['imp.2sg'], 'ь', inf, {stemMinLength: 3, stemEndsWith: CONSONANT}, inf === 'ить' ? ['поставь', 'поставить'] : null);
    verb(['imp.2pl'], 'ьте', inf, {stemMinLength: 3, stemEndsWith: CONSONANT}, inf === 'ить' ? ['поставьте', 'поставить'] : null);
}
for (const [word, inf] of [['ставь', 'ставить'], ['брось', 'бросить'], ['верь', 'верить'], ['трать', 'тратить'], ['плавь', 'плавить']]) {
    wholeWord('verb', ['imp.2sg'], word, inf, [], VERB, null);
}
presentClass({pres: '', inf: 'ить', endings: E2_HUSHING, imp: [], ger: 'а', stemEnd: HUSHING, gerExclude: 'душ', skip: ['pres.2sg', 'pres.3sg', 'pres.1pl', 'pres.2pl'], example: {inf: 'учить', 'pres.1sg': 'учу', 'pres.3pl': 'учат', 'ger.pres': 'уча'}});
presentClass({pres: '', inf: 'ать', endings: E2_HUSHING, imp: ['и'], pass: true, ger: 'а', stemEnd: HUSHING, gerExclude: 'встреч', example: {inf: 'кричать', 'pres.1sg': 'кричу', 'pres.2sg': 'кричишь', 'pres.3pl': 'кричат', 'imp.2sg': 'кричи', 'ger.pres': 'крича'}});
presentClass({pres: 'о', inf: 'оять', endings: E2, imp: ['й'], ger: 'я', min: 1, example: {inf: 'стоять', 'pres.1sg': 'стою', 'pres.2sg': 'стоишь', 'imp.2sg': 'стой', 'ger.pres': 'стоя'}});
verb(['imp.2sg'], 'й', 'ить', {stemMinLength: 2, stemEndsWith: '[ео]'}, ['строй', 'строить']);
verb(['imp.2pl'], 'йте', 'ить', {stemMinLength: 2, stemEndsWith: '[ео]'}, ['стройте', 'строить']);

// First person singular of the second conjugation, with its consonant change
// (хожу, вижу, прошу, вишу, плачу, лечу, чищу, свищу, езжу, люблю, терплю, ставлю, кормлю).
for (const [inflected, infs, ex] of [
    ['жу', ['дить', 'зить', 'деть'], ['хожу', 'ходить']], ['шу', ['сить', 'сеть'], ['прошу', 'просить']],
    ['чу', ['тить', 'теть'], ['плачу', 'платить']], ['щу', ['тить', 'стить', 'стеть'], ['прощу', 'простить']],
    ['зжу', ['здить'], ['езжу', 'ездить']],
    ['блю', ['бить', 'беть'], ['люблю', 'любить']], ['плю', ['пить', 'петь'], ['куплю', 'купить']],
    ['влю', ['вить', 'веть'], ['ставлю', 'ставить']], ['млю', ['мить', 'меть'], ['кормлю', 'кормить']], ['флю', ['фить'], null],
]) {
    for (const inf of infs) {
        // кучу is куча's accusative, not the rare кутить's first person.
        const extra = inflected === 'чу' && inf === 'тить' ? {stemMinLength: 1, stemNotStartsWithText: 'ку'} : {stemMinLength: 1};
        verb(['pres.1sg'], inflected, inf, extra, inf === infs[0] ? ex : null);
    }
}
// Past passive participles of the second conjugation (решённый, построенный) and with the change (рождённый, брошенный, купленный).
for (const [inflected, inf, ex] of [
    ['енный', 'ить', ['построенный', 'построить']], ['ённый', 'ить', ['решённый', 'решить']],
    ['жденный', 'дить', null], ['ждённый', 'дить', ['рождённый', 'родить']],
    ['женный', 'дить', ['обиженный', 'обидеть']], ['жённый', 'дить', null], ['женный', 'зить', ['выраженный', 'выразить']], ['жённый', 'зить', ['поражённый', 'поразить']], ['женный', 'деть', ['обиженный', 'обидеть']],
    ['шенный', 'сить', ['брошенный', 'бросить']], ['шённый', 'сить', ['приглашённый', 'пригласить']],
    ['ченный', 'тить', ['оплаченный', 'оплатить']], ['чённый', 'тить', null],
    ['щенный', 'тить', null], ['щённый', 'тить', ['возвращённый', 'возвратить']], ['щенный', 'стить', ['очищенный', 'очистить']], ['щённый', 'стить', ['прощённый', 'простить']],
    ['бленный', 'бить', ['погубленный', 'погубить']], ['блённый', 'бить', ['употреблённый', 'употребить']],
    ['пленный', 'пить', ['купленный', 'купить']], ['плённый', 'пить', null],
    ['вленный', 'вить', ['поставленный', 'поставить']], ['влённый', 'вить', ['удивлённый', 'удивить']],
    ['мленный', 'мить', ['накормленный', 'накормить']], ['млённый', 'мить', ['утомлённый', 'утомить']],
    ['ёсенный', 'ести', null], ['есённый', 'ести', ['принесённый', 'принести']], ['едённый', 'ести', ['приведённый', 'привести']],
    ['етённый', 'ести', ['изобретённый', 'изобрести']], ['езённый', 'езти', ['увезённый', 'увезти']],
    ['чённый', 'чь', ['привлечённый', 'привлечь']], ['жённый', 'чь', ['сбережённый', 'сберечь']], ['йденный', 'йти', ['найденный', 'найти']], ['йдённый', 'йти', ['обойдённый', 'обойти']],
]) {
    verb(['ptcp.past.pass'], inflected, inf, {stemMinLength: 1}, ex, {refl: false});
}

// Past of consonant stems: нести (нёс, несла), вести (вёл, вела), везти (вёз), ползти (полз), расти (рос), мочь (мог),
// беречь (берёг), стричь (стриг), печь (пёк), -ереть (умер, тёр), -нуть without -ну- (привык, исчез, погиб).
const PAST = (m, stem, inf, min, ex, stemEnd = null) => {
    const extra = {stemMinLength: min};
    if (stemEnd !== null) { extra.stemEndsWith = stemEnd; }
    verb(['past.m'], m, inf, extra, ex);
    verb(['past.f'], `${stem}ла`, inf, extra, null);
    verb(['past.n'], `${stem}ло`, inf, extra, null);
    verb(['past.pl'], `${stem}ли`, inf, extra, null);
    verb(['ptcp.past.act'], `${m}ший`, inf, extra, null);
};
// The -ести verbs' masculine past: нёс (нести) after н; вёл, мёл, брёл, плёл, цвёл
// (вести, мести, брести, плести, цвести) after в, м, р, л. After ч it is a
// -честь verb (прочёл, учёл, счёл), written below.
PAST('ёс', 'ес', 'ести', 1, ['нёс', 'нести'], '[н]');
PAST('лез', 'лез', 'лезть', 0, ['залез', 'залезть']);
verb(['ger.past'], 'лезши', 'лезть', {stemMinLength: 0}, ['перелезши', 'перелезть']);
PAST('яс', 'яс', 'ясти', 1, ['тряс', 'трясти']);
PAST('ас', 'ас', 'асти', 2, ['спас', 'спасти']);
PAST('ёз', 'ез', 'езти', 1, ['вёз', 'везти']);
PAST('з', 'з', 'зти', 2, ['полз', 'ползти'], '[л]');
PAST('ог', 'ог', 'очь', 1, ['мог', 'мочь']);
PAST('ёг', 'ег', 'ечь', 1, ['берёг', 'беречь']);
PAST('иг', 'иг', 'ичь', 1, ['стриг', 'стричь']);
PAST('ёк', 'ек', 'ечь', 1, ['пёк', 'печь']);
PAST('ер', 'ер', 'ереть', 2, ['запер', 'запереть']);
PAST('ёр', 'ёр', 'ереть', 2, ['стёр', 'стереть']);
// The simple verbs, whose stem has one letter (мер is мера's genitive plural, so мереть keeps only its other forms).
for (const [inf, forms] of [
    ['умереть', {'past.m': 'умер', 'past.f': 'умерла', 'past.n': 'умерло', 'past.pl': 'умерли'}],
    ['тереть', {'past.m': 'тёр', 'past.f': 'тёрла', 'past.n': 'тёрло', 'past.pl': 'тёрли'}],
    ['переть', {'past.m': 'пёр', 'past.f': 'пёрла', 'past.n': 'пёрло', 'past.pl': 'пёрли'}],
    ['мереть', {'past.f': 'мёрла', 'past.n': 'мёрло', 'past.pl': 'мёрли'}],
]) {
    for (const [form, word] of Object.entries(forms)) {
        wholeWord('verb', [form], word, inf, [], VERB, form === 'past.m' ? [word, inf] : null);
        wholeWord('verb', [form], reflexive(word), reflexive(inf), [], VERB, null);
    }
}
for (const [m, inf, ex] of [['ёл', 'ести', ['вёл', 'вести']]]) {
    const after = {stemMinLength: 1, stemEndsWith: '[вмрлн]'};
    verb(['past.m'], m, inf, after, ex);
    verb(['past.f'], 'ела', inf, after, ['вела', 'вести']);
    verb(['past.n'], 'ело', inf, after, null);
    verb(['past.pl'], 'ели', inf, after, null);
}
// -честь (прочесть, учесть, счесть, почесть): прочту, прочёл, прочла, прочтённый, прочтя.
for (const [form, ending] of Object.entries({'pres.1sg': 'чту', 'pres.2sg': 'чтёшь', 'pres.3sg': 'чтёт', 'pres.1pl': 'чтём', 'pres.2pl': 'чтёте', 'pres.3pl': 'чтут', 'past.m': 'чёл', 'past.f': 'чла', 'past.n': 'чло', 'past.pl': 'чли', 'imp.2sg': 'чти', 'imp.2pl': 'чтите', 'ptcp.past.act': 'чётший', 'ger.pres': 'чтя'})) {
    // почту, почти, почтут, почтите are почта's, the adverb's and почтить's, which are far
    // more frequent than the rare почесть; its other forms (почёл, почла, почтёт) are its own.
    const collides = ['pres.1sg', 'pres.3pl', 'imp.2sg', 'imp.2pl'].includes(form);
    verb([form], ending, 'честь', collides ? {stemMinLength: 1, stemNotStartsWithText: 'по'} : {stemMinLength: 1}, form === 'past.m' ? ['прочёл', 'прочесть'] : form === 'past.f' ? ['учла', 'учесть'] : form === 'pres.1sg' ? ['прочту', 'прочесть'] : null);
}
verb(['ptcp.past.pass'], 'чтённый', 'честь', {stemMinLength: 1}, ['прочтённый', 'прочесть'], {refl: false});
for (const [m, inf, ex] of [['дший', 'сти', ['ведший', 'вести']], ['тший', 'сти', ['цветший', 'цвести']]]) {
    verb(['ptcp.past.act'], m, inf, {stemMinLength: 1}, ex);
}
PAST('', '', 'нуть', 2, ['привык', 'привыкнуть'], '[кгзбсхп]');
// Imperative and past of -ти verbs written above; past of идти and -йти.
for (const [m, f, n, pl, inf, min] of [['шёл', 'шла', 'шло', 'шли', 'йти', 1]]) {
    verb(['past.m'], m, inf, {stemMinLength: min}, ['пришёл', 'прийти']);
    verb(['past.f'], f, inf, {stemMinLength: min}, ['пошла', 'пойти']);
    verb(['past.n'], n, inf, {stemMinLength: min}, null);
    verb(['past.pl'], pl, inf, {stemMinLength: min}, ['вышли', 'выйти']);
    verb(['ptcp.past.act'], 'шедший', inf, {stemMinLength: min}, ['пришедший', 'прийти']);
}
for (const [word, form] of [['шёл', 'past.m'], ['шла', 'past.f'], ['шло', 'past.n'], ['шли', 'past.pl'], ['шедший', 'ptcp.past.act']]) {
    wholeWord('verb', [form], word, 'идти', [], VERB, [word, 'идти']);
}

// Irregular verbs. Suffix rules, so prefixed verbs follow (отдам → отдать, захочу → захотеть, поймёшь → понять).
const IRREGULAR = [
    ['хотеть', 0, {'pres.1sg': 'хочу', 'pres.2sg': 'хочешь', 'pres.3sg': 'хочет'}],
    ['бежать', 0, {'pres.1sg': 'бегу', 'pres.3pl': 'бегут', 'imp.2sg': 'беги', 'imp.2pl': 'бегите', 'ptcp.pres.act': 'бегущий'}],
    ['дать', 0, {'pres.1sg': 'дам', 'pres.2sg': 'дашь', 'pres.3sg': 'даст', 'pres.1pl': 'дадим', 'pres.2pl': 'дадите', 'pres.3pl': 'дадут', 'imp.2sg': 'дай', 'imp.2pl': 'дайте'}],
    ['взять', 0, {'pres.1sg': 'возьму', 'pres.2sg': 'возьмёшь', 'pres.3sg': 'возьмёт', 'pres.1pl': 'возьмём', 'pres.2pl': 'возьмёте', 'pres.3pl': 'возьмут', 'imp.2sg': 'возьми', 'imp.2pl': 'возьмите'}],
    ['нять', 1, {'pres.1sg': 'йму', 'pres.2sg': 'ймёшь', 'pres.3sg': 'ймёт', 'pres.1pl': 'ймём', 'pres.2pl': 'ймёте', 'pres.3pl': 'ймут', 'imp.2sg': 'йми', 'imp.2pl': 'ймите'}, ['пойму', 'понять']],
    ['нять', 1, {'pres.1sg': 'ниму', 'pres.2sg': 'нимешь', 'pres.3sg': 'нимет', 'pres.1pl': 'нимем', 'pres.2pl': 'нимете', 'pres.3pl': 'нимут', 'imp.2sg': 'ними', 'imp.2pl': 'нимите'}, ['сниму', 'снять']],
    ['принять', 0, {'pres.1sg': 'приму', 'pres.2sg': 'примешь', 'pres.3sg': 'примет', 'pres.1pl': 'примем', 'pres.2pl': 'примете', 'pres.3pl': 'примут', 'imp.2sg': 'прими', 'imp.2pl': 'примите'}],
    ['чать', 1, {'pres.1sg': 'чну', 'pres.2sg': 'чнёшь', 'pres.3sg': 'чнёт', 'pres.1pl': 'чнём', 'pres.2pl': 'чнёте', 'pres.3pl': 'чнут', 'imp.2sg': 'чни', 'imp.2pl': 'чните'}, ['начну', 'начать']],
    ['лечь', 0, {'pres.1sg': 'лягу', 'pres.2sg': 'ляжешь', 'pres.3sg': 'ляжет', 'pres.1pl': 'ляжем', 'pres.2pl': 'ляжете', 'pres.3pl': 'лягут', 'imp.2sg': 'ляг', 'imp.2pl': 'лягте'}],
    ['сесть', 0, {'past.m': 'сел', 'past.f': 'села', 'past.n': 'село', 'past.pl': 'сели', 'ptcp.past.act': 'севший'}],
    ['класть', 0, {'past.m': 'клал', 'past.f': 'клала', 'past.n': 'клало', 'past.pl': 'клали', 'ptcp.past.act': 'клавший'}],
    ['красть', 0, {'past.m': 'крал', 'past.f': 'крала', 'past.n': 'крало', 'past.pl': 'крали', 'ptcp.past.act': 'кравший'}],
    // спал, спала, спали are спать's (the -ал rule), not the rare спасть.
    ['пасть', 1, {'past.m': 'пал', 'past.f': 'пала', 'past.n': 'пало', 'past.pl': 'пали', 'ptcp.past.act': 'павший', 'ger.past': 'пав'}, ['упал', 'упасть'], {stemNotStartsWithText: 'с'}],
    ['расти', 0, {'past.m': 'рос', 'past.f': 'росла', 'past.n': 'росло', 'past.pl': 'росли', 'ptcp.past.act': 'росший'}],
    ['спать', 0, {'pres.1sg': 'сплю', 'pres.2sg': 'спишь', 'pres.3sg': 'спит', 'pres.1pl': 'спим', 'pres.2pl': 'спите', 'pres.3pl': 'спят', 'imp.2sg': 'спи', 'ptcp.pres.act': 'спящий'}],
    ['гнать', 0, {'pres.1sg': 'гоню', 'pres.2sg': 'гонишь', 'pres.3sg': 'гонит', 'pres.1pl': 'гоним', 'pres.2pl': 'гоните', 'pres.3pl': 'гонят', 'imp.2sg': 'гони', 'ptcp.pres.act': 'гонящий'}],
    ['лгать', 0, {'pres.1sg': 'лгу', 'pres.2sg': 'лжёшь', 'pres.3sg': 'лжёт', 'pres.1pl': 'лжём', 'pres.2pl': 'лжёте', 'pres.3pl': 'лгут', 'imp.2sg': 'лги'}],
    ['жечь', 0, {'pres.1sg': 'жгу', 'pres.2sg': 'жжёшь', 'pres.3sg': 'жжёт', 'pres.1pl': 'жжём', 'pres.2pl': 'жжёте', 'pres.3pl': 'жгут', 'imp.2sg': 'жги', 'past.f': 'жгла', 'past.n': 'жгло', 'past.pl': 'жгли'}],
    ['жечь', 1, {'pres.1sg': 'ожгу', 'pres.2sg': 'ожжёшь', 'pres.3sg': 'ожжёт', 'pres.1pl': 'ожжём', 'pres.2pl': 'ожжёте', 'pres.3pl': 'ожгут', 'imp.2sg': 'ожги', 'past.f': 'ожгла', 'past.n': 'ожгло', 'past.pl': 'ожгли'}, ['сожгу', 'сжечь']],
    ['шибить', 1, {'pres.1sg': 'шибу', 'pres.2sg': 'шибёшь', 'pres.3sg': 'шибёт', 'pres.1pl': 'шибём', 'pres.2pl': 'шибёте', 'pres.3pl': 'шибут', 'past.m': 'шиб', 'past.f': 'шибла', 'past.n': 'шибло', 'past.pl': 'шибли'}, ['ошибусь', 'ошибиться']],
    ['брить', 0, {'pres.1sg': 'брею', 'pres.2sg': 'бреешь', 'pres.3sg': 'бреет', 'pres.1pl': 'бреем', 'pres.2pl': 'бреете', 'pres.3pl': 'бреют', 'imp.2sg': 'брей', 'imp.2pl': 'брейте'}],
    ['слать', 0, {'pres.1sg': 'шлю', 'pres.2sg': 'шлёшь', 'pres.3sg': 'шлёт', 'pres.1pl': 'шлём', 'pres.2pl': 'шлёте', 'pres.3pl': 'шлют', 'imp.2sg': 'шли', 'imp.2pl': 'шлите'}],
    ['петь', 0, {'pres.1sg': 'пою', 'pres.2sg': 'поёшь', 'pres.3sg': 'поёт', 'pres.1pl': 'поём', 'pres.2pl': 'поёте', 'pres.3pl': 'поют', 'imp.2sg': 'пой', 'imp.2pl': 'пойте', 'ptcp.pres.act': 'поющий'}],
    ['есть', 0, {'ptcp.pres.act': 'едящий'}],
];
for (const [inf, min, forms, exOverride, extra = {}] of IRREGULAR) {
    let first = true;
    for (const [form, word] of Object.entries(forms)) {
        const ex = first ? (exOverride ?? [word, inf]) : null;
        first = false;
        verb([form], word, inf, {stemMinLength: min, ...extra}, ex, {refl: !form.startsWith('ger.past')});
    }
}
// есть (to eat): its short forms only as whole words and after ъ or по- (съем, объем, поем), so тем and систем are not read as it.
for (const [form, word] of Object.entries({'pres.1sg': 'ем', 'pres.2sg': 'ешь', 'pres.3sg': 'ест', 'pres.1pl': 'едим', 'pres.2pl': 'едите', 'pres.3pl': 'едят', 'past.m': 'ел', 'past.f': 'ела', 'past.n': 'ело', 'past.pl': 'ели', 'ptcp.past.act': 'евший', 'imp.2pl': 'ешьте'})) {
    const forms = form === 'pres.2sg' ? ['pres.2sg', 'imp.2sg'] : [form];
    wholeWord('verb', forms, word, 'есть', [], VERB, [word, 'есть']);
    wholeWord('verb', forms, `по${word}`, 'поесть', [], VERB, null);
    wholeWord('verb', forms, `на${reflexive(word)}`, 'наесться', [], VERB, null);
    suffix('verb', forms, word, 'есть', [], VERB, {stemEndsWith: '[ъ]'}, form === 'pres.1sg' ? ['съем', 'съесть'] : null);
}

// The vowel a prefix gains before a stem without a vowel (собью → сбить, обовью → обвить, разольёт → разлить, изошью → изшить is not a word).
for (const [inflected, lemma] of [['обь', 'бить'], ['овь', 'вить'], ['оль', 'лить'], ['опь', 'пить'], ['ошь', 'шить']]) {
    const endings = {'pres.1sg': 'ю', 'pres.2sg': 'ёшь', 'pres.3sg': 'ёт', 'pres.1pl': 'ём', 'pres.2pl': 'ёте', 'pres.3pl': 'ют'};
    for (const [form, ending] of Object.entries(endings)) {
        verb([form], inflected + ending, lemma, {stemMinLength: 1, stemEndsWith: '[бвдзстр]'}, form === 'pres.1sg' && lemma === 'бить' ? ['собью', 'сбить'] : form === 'pres.1sg' && lemma === 'вить' ? ['обовью', 'обвить'] : null);
    }
}
// жать (to press): жму, жмёшь; (to reap): жну, жнёшь.
for (const [pres, ex] of [['жм', ['прижму', 'прижать']], ['жн', ['сожну', 'сжать']]]) {
    const endings = {'pres.1sg': 'у', 'pres.2sg': 'ёшь', 'pres.3sg': 'ёт', 'pres.1pl': 'ём', 'pres.2pl': 'ёте', 'pres.3pl': 'ут'};
    for (const [form, ending] of Object.entries(endings)) { verb([form], pres + ending, 'жать', {stemMinLength: 0}, form === 'pres.1sg' ? ex : null); }
    verb(['imp.2sg'], `${pres}и`, 'жать', {stemMinLength: 0}, null);
    verb(['imp.2pl'], `${pres}ите`, 'жать', {stemMinLength: 0}, null);
}
// -олоть, -ороть: полю, полешь; борю, борешь; колю, колешь.
for (const [pres, inf, ex] of [['ол', 'олоть', ['выполют', 'выполоть']], ['ор', 'ороть', ['поборет', 'побороть']]]) {
    const endings = {'pres.1sg': 'ю', 'pres.2sg': 'ешь', 'pres.3sg': 'ет', 'pres.1pl': 'ем', 'pres.2pl': 'ете', 'pres.3pl': 'ют'};
    for (const [form, ending] of Object.entries(endings)) { verb([form], pres + ending, inf, {stemMinLength: 1, stemEndsWith: CONSONANT}, form === 'pres.3pl' && pres === 'ол' ? ex : form === 'pres.3sg' && pres === 'ор' ? ex : null); }
    verb(['imp.2sg'], `${pres}и`, inf, {stemMinLength: 1, stemEndsWith: CONSONANT}, pres === 'ор' ? ['побори', 'побороть'] : null);
    verb(['imp.2pl'], `${pres}ите`, inf, {stemMinLength: 1, stemEndsWith: CONSONANT}, null);
}
// прясть: пряду, прядёшь.
for (const [form, ending] of Object.entries({'pres.1sg': 'яду', 'pres.2sg': 'ядёшь', 'pres.3sg': 'ядёт', 'pres.1pl': 'ядём', 'pres.2pl': 'ядёте', 'pres.3pl': 'ядут'})) {
    verb([form], `пр${ending}`, 'прясть', {stemMinLength: 0}, form === 'pres.1pl' ? ['спрядём', 'спрясть'] : null);
}
// -пать, -бать, -мать with the л of the first person (сыплю): imperative, adverbial participle.
for (const [cons, inf] of [['пл', 'пать'], ['бл', 'бать'], ['мл', 'мать']]) {
    verb(['ger.pres'], `${cons}я`, inf, {stemMinLength: 1}, cons === 'пл' ? ['сыпля', 'сыпать'] : null);
}
verb(['imp.2pl'], 'пьте', 'пать', {stemMinLength: 2}, ['сыпьте', 'сыпать']);
// Past adverbial participles in -ши after a consonant (расползшись, принёсши, привыкши, запёрши) and of -ыть, -есть (выв, заев).
for (const [inflected, inf, ex] of [
    ['зши', 'зти', ['расползши', 'расползти']], ['ёсши', 'ести', ['принёсши', 'принести']], ['едши', 'ести', ['приведши', 'привести']],
    ['ёкши', 'ечь', ['испёкши', 'испечь']], ['огши', 'очь', ['помогши', 'помочь']], ['ёрши', 'ереть', ['запёрши', 'запереть']], ['ерши', 'ереть', ['умерши', 'умереть']],
]) {
    verb(['ger.past'], inflected, inf, {stemMinLength: 1}, ex);
}
for (const c of ['к', 'г', 'з', 'б', 'с', 'х', 'п']) {
    verb(['ger.past'], `${c}ши`, `${c}нуть`, {stemMinLength: 2}, c === 'к' ? ['привыкши', 'привыкнуть'] : null);
}
verb(['ger.past'], 'ев', 'есть', {stemMinLength: 1, stemEndsWith: '[ъа]'}, ['съев', 'съесть'], {refl: false});
verb(['ger.past'], 'ыв', 'ыть', {stemMinLength: 1}, ['выв', 'выть'], {refl: false});
// Prefixed есть: доест, заест, переест (the bare forms are whole words above).
for (const [form, word] of Object.entries({'pres.1sg': 'ем', 'pres.2sg': 'ешь', 'pres.3sg': 'ест', 'pres.1pl': 'едим', 'pres.2pl': 'едите', 'pres.3pl': 'едят', 'past.m': 'ел', 'past.f': 'ела', 'past.n': 'ело', 'past.pl': 'ели'})) {
    for (const prefix of ['до', 'за', 'пере', 'при', 'про', 'вы', 'недо', 'объ', 'подъ']) {
        wholeWord('verb', [form], prefix + word, `${prefix}есть`, [], VERB, form === 'pres.3sg' && prefix === 'до' ? ['доест', 'доесть'] : null);
        wholeWord('verb', [form], prefix + reflexive(word), `${prefix}есться`, [], VERB, null);
    }
}
// Nouns: лапоть, ноготь, коготь (fleeting о after т).
suffix('noun', ['fleeting'], 'ть', 'оть', ['fl'], NOUN, {stemMinLength: 2, stemEndsWith: '[пгк]'}, ['лаптя', 'лапоть']);
// Plurals without -ин: боярин → бояре, татарин and болгарин → татары, болгары.
for (const [ending, form] of [['е', 'nom.pl'], ['', 'gen.pl'], ['ам', 'dat.pl'], ['ами', 'ins.pl'], ['ах', 'prp.pl']]) {
    suffix('noun', [form], `яр${ending}`, 'ярин', [], NOUN, {stemMinLength: 1}, form === 'dat.pl' ? ['боярам', 'боярин'] : form === 'nom.pl' ? ['бояре', 'боярин'] : null);
}
for (const [ending, form] of [['ы', 'nom.pl'], ['', 'gen.pl'], ['ам', 'dat.pl'], ['ами', 'ins.pl'], ['ах', 'prp.pl']]) {
    suffix('noun', [form], `ар${ending}`, 'арин', [], NOUN, {stemMinLength: 3, stemEndsWith: '[тгб]'}, form === 'nom.pl' ? ['татары', 'татарин'] : null);
}

// Verbs whose present stem has two letters (гну, мну, чую, кляну), with their
// prefixed verbs; and шептать's imperative шепчи.
for (const [stem, inf, ex] of [['гн', 'гнуть', ['гнёт', 'гнуть']], ['мн', 'мять', ['мнёт', 'мять']], ['клян', 'клясть', ['клянётся', 'клясться']]]) {
    for (const [form, ending] of Object.entries({'pres.1sg': 'у', 'pres.2sg': 'ёшь', 'pres.3sg': 'ёт', 'pres.1pl': 'ём', 'pres.2pl': 'ёте', 'pres.3pl': 'ут'})) {
        verb([form], stem + ending, inf, {stemMinLength: 0}, form === 'pres.3sg' ? ex : null);
    }
    // Not мять's imperative: помни, помните are помнить's.
    if (inf !== 'мять') {
        verb(['imp.2sg'], `${stem}и`, inf, {stemMinLength: 0}, null);
        verb(['imp.2pl'], `${stem}ите`, inf, {stemMinLength: 0}, null);
    }
}
for (const [form, ending] of Object.entries({'pres.1sg': 'ую', 'pres.2sg': 'уешь', 'pres.3sg': 'ует', 'pres.1pl': 'уем', 'pres.2pl': 'уете', 'pres.3pl': 'уют', 'imp.2sg': 'уй', 'imp.2pl': 'уйте', 'ptcp.pres.act': 'ующий', 'ger.pres': 'уя'})) {
    verb([form], `ч${ending}`, 'чуять', {stemMinLength: 0}, form === 'pres.3sg' ? ['чует', 'чуять'] : null);
}
verb(['imp.2sg'], 'шепчи', 'шептать', {stemMinLength: 0}, ['шепчи', 'шептать']);
verb(['imp.2pl'], 'шепчите', 'шептать', {stemMinLength: 0}, null);

// -стичь, the other infinitive of -стигнуть (достичь, постичь, настичь, застичь):
// достигну, достиг, достигла, достигнув.
for (const [form, ending] of Object.entries({'pres.1sg': 'стигну', 'pres.2sg': 'стигнешь', 'pres.3sg': 'стигнет', 'pres.1pl': 'стигнем', 'pres.2pl': 'стигнете', 'pres.3pl': 'стигнут',
    'imp.2sg': 'стигни', 'imp.2pl': 'стигните', 'past.m': 'стиг', 'past.f': 'стигла', 'past.n': 'стигло', 'past.pl': 'стигли', 'ptcp.past.act': 'стигший', 'ger.past': 'стигнув'})) {
    verb([form], ending, 'стичь', {stemMinLength: 2}, form === 'pres.3sg' ? ['достигнет', 'достичь'] : form === 'past.m' ? ['постиг', 'постичь'] : null, {refl: form !== 'ger.past'});
}

// --- Pronouns and numerals, as whole words ---------------------------------------------
const PRON = ['pron'];
const NUM = ['num'];
function closed(pos, cond, lemma, table) {
    for (const [word, forms] of Object.entries(table)) {
        wholeWord(pos, forms, word, lemma, [], cond, [word, lemma]);
    }
}
const personal = {
    я: {меня: ['gen.sg', 'acc.sg'], мне: ['dat.sg', 'prp.sg'], мной: ['ins.sg'], мною: ['ins.sg']},
    ты: {тебя: ['gen.sg', 'acc.sg'], тебе: ['dat.sg', 'prp.sg'], тобой: ['ins.sg'], тобою: ['ins.sg']},
    он: {его: ['gen.m', 'acc.m'], него: ['gen.m', 'acc.m'], ему: ['dat.m'], нему: ['dat.m'], им: ['ins.m'], ним: ['ins.m'], нём: ['prp.m']},
    оно: {его: ['gen.n', 'acc.n'], него: ['gen.n', 'acc.n'], ему: ['dat.n'], нему: ['dat.n'], им: ['ins.n'], ним: ['ins.n'], нём: ['prp.n']},
    она: {её: ['gen.f', 'acc.f'], неё: ['gen.f', 'acc.f'], ей: ['dat.f', 'ins.f'], ней: ['dat.f', 'ins.f', 'prp.f'], ею: ['ins.f'], нею: ['ins.f']},
    мы: {нас: ['gen.pl', 'acc.pl', 'prp.pl'], нам: ['dat.pl'], нами: ['ins.pl']},
    вы: {вас: ['gen.pl', 'acc.pl', 'prp.pl'], вам: ['dat.pl'], вами: ['ins.pl']},
    они: {их: ['gen.pl', 'acc.pl'], них: ['gen.pl', 'acc.pl', 'prp.pl'], им: ['dat.pl'], ним: ['dat.pl'], ими: ['ins.pl'], ними: ['ins.pl']},
    себя: {себе: ['dat.sg', 'prp.sg'], собой: ['ins.sg'], собою: ['ins.sg']},
};
for (const [lemma, table] of Object.entries(personal)) { closed('pron', PRON, lemma, table); }
const KTO = {кого: ['gen.sg', 'acc.sg'], кому: ['dat.sg'], кем: ['ins.sg'], ком: ['prp.sg']};
const CHTO = {чего: ['gen.sg'], чему: ['dat.sg'], чем: ['ins.sg'], чём: ['prp.sg']};
for (const [lemma, table] of [['кто', KTO], ['что', CHTO]]) {
    closed('pron', PRON, lemma, table);
    for (const particle of ['-то', '-нибудь', '-либо']) {
        closed('pron', PRON, lemma + particle, Object.fromEntries(Object.entries(table).map(([w, f]) => [w + particle, f])));
    }
    closed('pron', PRON, `ни${lemma}`, Object.fromEntries(Object.entries(table).filter(([w]) => w !== 'ком' && w !== 'чём').map(([w, f]) => [`ни${w}`, f])));
}
// Declined like adjectives with short forms of their own: этот, тот, весь, сам, один, мой, твой, свой, наш, ваш, чей.
const DET = (g, d, i, p, f, fa, fo, n, pl, plg, pli) => ({
    [g]: ['gen.m', 'gen.n', 'acc.m'], [d]: ['dat.m', 'dat.n'], [i]: ['ins.m', 'ins.n', 'dat.pl'], [p]: ['prp.m', 'prp.n'],
    [f]: ['nom.f'], [fa]: ['acc.f'], [fo]: ['gen.f', 'dat.f', 'ins.f', 'prp.f'], [n]: ['nom.n', 'acc.n'], [pl]: ['nom.pl', 'acc.pl'], [plg]: ['gen.pl', 'prp.pl', 'acc.pl'], [pli]: ['ins.pl'],
});
for (const [lemma, table] of [
    ['этот', DET('этого', 'этому', 'этим', 'этом', 'эта', 'эту', 'этой', 'это', 'эти', 'этих', 'этими')],
    ['тот', DET('того', 'тому', 'тем', 'том', 'та', 'ту', 'той', 'то', 'те', 'тех', 'теми')],
    ['весь', DET('всего', 'всему', 'всем', 'всём', 'вся', 'всю', 'всей', 'всё', 'все', 'всех', 'всеми')],
    ['сам', DET('самого', 'самому', 'самим', 'самом', 'сама', 'саму', 'самой', 'само', 'сами', 'самих', 'самими')],
    ['мой', DET('моего', 'моему', 'моим', 'моём', 'моя', 'мою', 'моей', 'моё', 'мои', 'моих', 'моими')],
    ['твой', DET('твоего', 'твоему', 'твоим', 'твоём', 'твоя', 'твою', 'твоей', 'твоё', 'твои', 'твоих', 'твоими')],
    ['свой', DET('своего', 'своему', 'своим', 'своём', 'своя', 'свою', 'своей', 'своё', 'свои', 'своих', 'своими')],
    ['наш', DET('нашего', 'нашему', 'нашим', 'нашем', 'наша', 'нашу', 'нашей', 'наше', 'наши', 'наших', 'нашими')],
    ['ваш', DET('вашего', 'вашему', 'вашим', 'вашем', 'ваша', 'вашу', 'вашей', 'ваше', 'ваши', 'ваших', 'вашими')],
    ['чей', DET('чьего', 'чьему', 'чьим', 'чьём', 'чья', 'чью', 'чьей', 'чьё', 'чьи', 'чьих', 'чьими')],
]) {
    closed('pron', PRON, lemma, table);
}
closed('num', NUM, 'один', DET('одного', 'одному', 'одним', 'одном', 'одна', 'одну', 'одной', 'одно', 'одни', 'одних', 'одними'));
closed('num', NUM, 'два', {двух: ['gen.pl', 'prp.pl', 'acc.pl'], двум: ['dat.pl'], двумя: ['ins.pl'], две: ['nom.f', 'acc.f']});
closed('num', NUM, 'три', {трёх: ['gen.pl', 'prp.pl', 'acc.pl'], трём: ['dat.pl'], тремя: ['ins.pl']});
closed('num', NUM, 'четыре', {четырёх: ['gen.pl', 'prp.pl', 'acc.pl'], четырём: ['dat.pl'], четырьмя: ['ins.pl']});
closed('num', NUM, 'оба', {обоих: ['gen.pl', 'prp.pl', 'acc.pl'], обоим: ['dat.pl'], обоими: ['ins.pl'], обе: ['nom.f', 'acc.f']});
closed('num', NUM, 'обе', {обеих: ['gen.pl', 'prp.pl', 'acc.pl'], обеим: ['dat.pl'], обеими: ['ins.pl']});
for (const n of ['пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать', 'двадцать', 'тридцать']) {
    const stem = n === 'восемь' ? 'восьм' : n.slice(0, -1);
    closed('num', NUM, n, {[`${stem}и`]: ['gen.pl', 'dat.pl', 'prp.pl'], [`${stem}ью`]: ['ins.pl']});
}
for (const [n, oblique] of [['сорок', 'сорока'], ['девяносто', 'девяноста'], ['сто', 'ста']]) {
    closed('num', NUM, n, {[oblique]: ['gen.pl', 'dat.pl', 'ins.pl', 'prp.pl']});
}
for (const [n, gen, ins] of [['пятьдесят', 'пятидесяти', 'пятьюдесятью'], ['шестьдесят', 'шестидесяти', 'шестьюдесятью'], ['семьдесят', 'семидесяти', 'семьюдесятью'], ['восемьдесят', 'восьмидесяти', 'восьмьюдесятью']]) {
    closed('num', NUM, n, {[gen]: ['gen.pl', 'dat.pl', 'prp.pl'], [ins]: ['ins.pl']});
}
for (const [n, g, d, i, p] of [['двести', 'двухсот', 'двумстам', 'двумястами', 'двухстах'], ['триста', 'трёхсот', 'трёмстам', 'тремястами', 'трёхстах'], ['четыреста', 'четырёхсот', 'четырёмстам', 'четырьмястами', 'четырёхстах']]) {
    closed('num', NUM, n, {[g]: ['gen.pl'], [d]: ['dat.pl'], [i]: ['ins.pl'], [p]: ['prp.pl']});
}
for (const [n, stem, insStem] of [['пятьсот', 'пяти', 'пятью'], ['шестьсот', 'шести', 'шестью'], ['семьсот', 'семи', 'семью'], ['восемьсот', 'восьми', 'восьмью'], ['девятьсот', 'девяти', 'девятью']]) {
    closed('num', NUM, n, {[`${stem}сот`]: ['gen.pl'], [`${stem}стам`]: ['dat.pl'], [`${insStem}стами`]: ['ins.pl'], [`${stem}стах`]: ['prp.pl']});
}
for (const lemma of ['сколько', 'столько', 'несколько']) {
    const stem = lemma.slice(0, -1);
    closed('num', NUM, lemma, {[`${stem}их`]: ['gen.pl', 'prp.pl', 'acc.pl'], [`${stem}им`]: ['dat.pl'], [`${stem}ими`]: ['ins.pl']});
}

// --- Frequent words a regular ending reads as a rarer headword (README.md, History) ---
for (const [word, lemma, forms] of [
    ['любого', 'любой', ['gen.m', 'gen.n', 'acc.m']], ['любому', 'любой', ['dat.m', 'dat.n']], ['любым', 'любой', ['ins.m', 'ins.n', 'dat.pl']],
    ['любом', 'любой', ['prp.m', 'prp.n']], ['любое', 'любой', ['nom.n', 'acc.n']], ['любая', 'любой', ['nom.f']], ['любую', 'любой', ['acc.f']],
    ['любою', 'любой', ['ins.f']], ['любые', 'любой', ['nom.pl', 'acc.pl']], ['любых', 'любой', ['gen.pl', 'prp.pl', 'acc.pl']], ['любыми', 'любой', ['ins.pl']],
]) {
    wholeWord('adj', forms, word, lemma, [], ADJ);
}
for (const [word, lemma, forms] of [
    ['правила', 'правило', ['gen.sg', 'nom.pl']], ['правил', 'правило', ['gen.pl']], ['берегу', 'берег', ['dat.sg', 'loc.sg']], ['началом', 'начало', ['ins.sg']],
    ['начале', 'начало', ['prp.sg']], ['носки', 'носок', ['nom.pl']], ['десятки', 'десяток', ['nom.pl']],
]) {
    wholeWord('noun', forms, word, lemma, [], NOUN);
}
// Adjectival nouns read as the noun first; the adjective comes second.
for (const [word, lemma, forms] of [
    ['животных', 'животное', ['gen.pl', 'prp.pl', 'acc.pl']], ['животные', 'животное', ['nom.pl', 'acc.pl']], ['наличными', 'наличные', ['ins.pl']],
    ['шампанского', 'шампанское', ['gen.n']], ['мороженого', 'мороженое', ['gen.n']], ['гостиной', 'гостиная', ['gen.f', 'dat.f', 'ins.f', 'prp.f']],
    ['ванной', 'ванная', ['gen.f', 'dat.f', 'ins.f', 'prp.f']], ['ванную', 'ванная', ['acc.f']],
    ['данных', 'данные', ['gen.pl', 'prp.pl', 'acc.pl']], ['данным', 'данные', ['dat.pl']], ['столовой', 'столовая', ['gen.f', 'dat.f', 'ins.f', 'prp.f']],
    ['животного', 'животное', ['gen.n']], ['животному', 'животное', ['dat.n']], ['животным', 'животное', ['ins.m', 'ins.n', 'dat.pl']],
    ['животными', 'животное', ['ins.pl']], ['животном', 'животное', ['prp.n']], ['данными', 'данные', ['ins.pl']],
    ['шампанским', 'шампанское', ['ins.m', 'ins.n', 'dat.pl']], ['шампанском', 'шампанское', ['prp.n']],
    ['мороженому', 'мороженое', ['dat.n']], ['мороженым', 'мороженое', ['ins.m', 'ins.n', 'dat.pl']], ['мороженом', 'мороженое', ['prp.n']],
    ['гостиную', 'гостиная', ['acc.f']], ['гостиною', 'гостиная', ['ins.f']], ['столовую', 'столовая', ['acc.f']],
    ['набережной', 'набережная', ['gen.f', 'dat.f', 'ins.f', 'prp.f']], ['набережную', 'набережная', ['acc.f']], ['набережною', 'набережная', ['ins.f']],
    ...[['млекопитающее', 'е', 'и'], ['существительное', 'о', 'ы']].flatMap(([lemma, o, y]) => {
        const stem = lemma.slice(0, -2);
        return [[`${stem}${o}го`, lemma, ['gen.n']], [`${stem}${o}му`, lemma, ['dat.n']], [`${stem}${y}м`, lemma, ['ins.m', 'ins.n', 'dat.pl']], [`${stem}${o}м`, lemma, ['prp.n']],
            [`${stem}${y}е`, lemma, ['nom.pl', 'acc.pl']], [`${stem}${y}х`, lemma, ['gen.pl', 'acc.pl', 'prp.pl']], [`${stem}${y}ми`, lemma, ['ins.pl']]];
    }),
]) {
    put('adj', forms, {type: 'wholeWord', inflected: word, deinflected: lemma, conditionsIn: [], conditionsOut: NOUN});
}
// Words whose rarer reading an earlier ending reached first (third audit).
put('verb', ['pres.1sg'], {type: 'wholeWord', inflected: 'заплачу', deinflected: 'заплатить', conditionsIn: [], conditionsOut: VERB});
for (const [word, lemma, forms] of [
    ['тайной', 'тайна', ['ins.sg']], ['свечу', 'свеча', ['acc.sg']], ['солью', 'соль', ['ins.sg']], ['полем', 'поле', ['ins.sg']],
    ['турки', 'турок', ['nom.pl']], ['поляне', 'поляна', ['dat.sg', 'prp.sg']], ['ржи', 'рожь', ['gen.sg', 'dat.sg', 'prp.sg']],
    ['воротам', 'ворота', ['dat.pl']], ['воротами', 'ворота', ['ins.pl']], ['воротах', 'ворота', ['prp.pl']],
    ...['техник', 'физик', 'критик', 'практик', 'логик', 'математик', 'механик'].map((stem) => [`${stem}у`, `${stem}а`, ['acc.sg']]),
]) {
    wholeWord('noun', forms, word, lemma, [], NOUN);
}
for (const [ending, forms] of [['ого', ['gen.m', 'acc.m', 'gen.n']], ['ому', ['dat.m', 'dat.n']], ['ым', ['ins.m', 'ins.n', 'dat.pl']], ['ом', ['prp.m', 'prp.n']],
    ['ую', ['acc.f']], ['ые', ['nom.pl', 'acc.pl']], ['ых', ['gen.pl', 'acc.pl', 'prp.pl']], ['ыми', ['ins.pl']]]) {
    wholeWord('adj', forms, `полов${ending}`, 'половой', [], ADJ);
}
// Ranks 10,001-50,000 (fourth audit, m-1).
for (const [word, lemma, forms] of [['утру', 'утро', ['dat.sg']], ['западу', 'запад', ['dat.sg']], ['вечере', 'вечер', ['prp.sg']], ['правах', 'право', ['prp.pl']],
    ['правами', 'право', ['ins.pl']], ['правам', 'право', ['dat.pl']], ['уйму', 'уйма', ['acc.sg']], ['погоню', 'погоня', ['acc.sg']], ['лужу', 'лужа', ['acc.sg']],
    ['бельем', 'бельё', ['ins.sg']], ['запрете', 'запрет', ['prp.sg']]]) {
    wholeWord('noun', forms, word, lemma, [], NOUN);
}
for (const [word, lemma, form] of [['замечу', 'заметить', 'pres.1sg'], ['отмечу', 'отметить', 'pres.1sg'], ['кончу', 'кончить', 'pres.1sg'], ['раскрою', 'раскрыть', 'pres.1sg'],
    ['праздную', 'праздновать', 'pres.1sg'], ['заметите', 'заметить', 'pres.2pl'], ['спорите', 'спорить', 'pres.2pl'], ['заводи', 'заводить', 'imp.2sg'], ['удали', 'удалить', 'imp.2sg']]) {
    put('verb', [form], {type: 'wholeWord', inflected: word, deinflected: lemma, conditionsIn: [], conditionsOut: VERB});
}
for (const [word, lemma, form] of [['красив', 'красивый', 'short.m'], ['уязвим', 'уязвимый', 'short.m'], ['далек', 'далёкий', 'short.m'], ['краток', 'краткий', 'short.m'],
    ['сердит', 'сердитый', 'short.m']]) {
    wholeWord('adj', [form], word, lemma, [], ADJ);
}
// Ties the reading key decided until #83 (docs/languages.md 9.6).
for (const [word, lemma, forms] of [['дела', 'дело', ['gen.sg', 'nom.pl']], ['дел', 'дело', ['gen.pl']], ['лет', 'год', ['gen.pl']], ['пару', 'пара', ['acc.sg']],
    ['вещей', 'вещь', ['gen.pl']], ['миру', 'мир', ['dat.sg', 'loc.sg']], ['стену', 'стена', ['acc.sg']], ['стенах', 'стена', ['prp.pl']], ['стенами', 'стена', ['ins.pl']],
    ['плату', 'плата', ['acc.sg']], ['стекла', 'стекло', ['gen.sg', 'nom.pl']], ['чеки', 'чек', ['nom.pl']], ['коды', 'код', ['nom.pl']],
    ['меча', 'меч', ['gen.sg']], ['коров', 'корова', ['gen.pl']], ['песнями', 'песня', ['ins.pl']], ['песнях', 'песня', ['prp.pl']],
    ['буре', 'буря', ['dat.sg', 'prp.sg']], ['цвету', 'цвет', ['dat.sg', 'loc.sg']]]) {
    wholeWord('noun', forms, word, lemma, [], NOUN);
}
for (const [word, lemma, form] of [['выпей', 'выпить', 'imp.2sg'], ['выпью', 'выпить', 'pres.1sg']]) {
    put('verb', [form], {type: 'wholeWord', inflected: word, deinflected: lemma, conditionsIn: [], conditionsOut: VERB});
}
wholeWord('adj', ['short.m'], 'готов', 'готовый', [], ADJ);
wholeWord('adj', ['short.m'], 'весел', 'весёлый', [], ADJ);
put('verb', ['ptcp.past.pass'], {type: 'wholeWord', inflected: 'потрясён', deinflected: 'потрясти', conditionsIn: [], conditionsOut: VERB});
put('verb', ['ptcp.past.pass'], {type: 'wholeWord', inflected: 'потрясен', deinflected: 'потрясти', conditionsIn: [], conditionsOut: VERB});
// The adverb определённо; only its е spelling needs the row (with ё no rule reaches определить).
put('adj', ['short.n'], {type: 'wholeWord', inflected: 'определенно', deinflected: 'определённо', conditionsIn: [], conditionsOut: ADJ});
wholeWord('num', ['dat.pl'], 'двоим', 'двое', [], NUM);

// Stems a row leaves out (transform id, first ending, stem, and the row's
// stemEndsWith and first lemma ending where needed): методы, not метода.
const EXCLUDE = [
    ['noun-gen.sg+nom.pl', 'а', 'метод'], ['noun-gen.sg+nom.pl', 'я', 'постел'], ['noun-dat.sg+loc.sg', 'у', 'карьер', '{hardConsonant}'],
    ['noun-dat.sg+loc.sg', 'у', 'политик', '{velar}'], ['noun-dat.sg+prp.sg', 'е', 'воздух', '{velar}'], ['noun-prp.sg', 'е', 'лагер', '{hardConsonant}'],
    ['noun-gen.pl', 'ов', 'черт', '{hardConsonant}'], ['noun-gen.pl', 'ок', 'кошел'], ['noun-gen.pl', 'ов', 'черт', '[^ьй]'], ['noun-gen.pl', '', 'вперед', undefined, 'ы'],
    ['noun-fleeting', 'к', 'суч'], ['noun-fleeting', 'йц', 'уби'], ['verb-pres.1sg', 'олю', 'сп'],
];

// --- Transforms ----------------------------------------------------------------------------
const POS_ORDER = ['noun', 'adj', 'pron', 'num', 'verb'];
const POS_WORD = {noun: 'a noun', adj: 'an adjective or participle', pron: 'a pronoun or determiner', num: 'a numeral', verb: 'a verb'};
const groups = new Map();
for (const entry of collected.values()) {
    const forms = [...entry.forms].sort((a, b) => FORM_ORDER.get(a) - FORM_ORDER.get(b));
    const id = `${entry.pos}-${forms.join('+')}`;
    if (!groups.has(id)) { groups.set(id, {id, pos: entry.pos, forms, rules: [], examples: []}); }
    const group = groups.get(id);
    group.rules.push(entry.rule);
    for (const ex of entry.examples) {
        if (group.examples.length < 3 && !group.examples.some(([a]) => a === ex[0])) { group.examples.push(ex); }
    }
}
// The long forms of adjectives come before the nouns: a case ending such as -ой,
// -ом or -ую reads a common adjective (белом → белый, скорой → скорый, такою →
// такой) and a rare noun (бел, скора, така) at one step each, and the first
// transform reached wins the tie (docs/languages.md 9.6). Short forms keep
// their place after the nouns (звонка, тайны, ванной are nouns' forms).
const rank = (g) => (g.pos === 'adj' && !g.forms.some((f) => f.startsWith('short.') || ['cmp', 'po', 'sup', 'adverb'].includes(f)) ? -1 : POS_ORDER.indexOf(g.pos));
const ordered = [...groups.values()].sort((a, b) => (rank(a) - rank(b))
    || (FORM_ORDER.get(a.forms[0]) - FORM_ORDER.get(b.forms[0])) || (a.forms.length - b.forms.length) || a.id.localeCompare(b.id));
// Suffix rules of one transform that differ only in their endings are written
// as one cross-product row (docs/languages.md 7.3): a circumfix whose only
// prefix is empty, with the endings as its suffixes. The engine expands it
// into the same suffix rules when the pack loads; the files stay small
// (section 3: tests/ and sources/ hold at most 1 MB, and classes.json lists
// each row's classes once). Rows keep the order of their first rule.
function crossProducts(rules) {
    const rows = [];
    const byShape = new Map();
    for (const rule of rules) {
        if (rule.type !== 'suffix') { rows.push(rule); continue; }
        const {inflected, deinflected, ...shape} = rule;
        const key = JSON.stringify(shape);
        if (!byShape.has(key)) {
            const row = {type: 'circumfix', prefixes: [['', '']], suffixes: [], ...Object.fromEntries(Object.entries(shape).filter(([k]) => k !== 'type'))};
            byShape.set(key, row);
            rows.push(row);
        }
        byShape.get(key).suffixes.push([inflected, deinflected]);
    }
    // A row with one ending is written as the suffix rule it is.
    return rows.map((row) => {
        if (row.type !== 'circumfix' || row.suffixes.length > 1) { return row; }
        const {prefixes: _p, suffixes: [[inflected, deinflected]], type: _t, ...rest} = row;
        return {type: 'suffix', inflected, deinflected, ...rest};
    });
}

const transforms = ordered.map((g) => {
    const name = formsName(g.forms);
    const examples = g.examples.map(([form, lemma]) => `${form} → ${lemma}`).join(', ');
    const description = `${name[0].toUpperCase()}${name.slice(1)} of ${POS_WORD[g.pos]}${examples ? `: ${examples}` : ''}.`;
    return {id: g.id, name, description, source: 'own', rules: crossProducts(g.rules)};
});
for (const [id, ending, stem, stemEnd, lemmaEnding] of EXCLUDE) {
    const t = transforms.find((x) => x.id === id);
    const first = (r) => (r.type === 'suffix' ? [r.inflected, r.deinflected] : r.type === 'circumfix' && r.suffixes ? r.suffixes[0] : [null, null]);
    const row = t && t.rules.find((r) => first(r)[0] === ending && (lemmaEnding === undefined || first(r)[1] === lemmaEnding)
        && (stemEnd === undefined || r.stemEndsWith === stemEnd) && !r.stemChange && r.stemNotStartsWithText === undefined);
    if (!row) { throw new Error(`EXCLUDE: no row of ${id} starting with "${ending}"`); }
    row.stemNotStartsWithText = stem;
}

const out = {schema: 1, conditions, transforms};
writeFileSync(join(here, 'own.json'), formatTransforms(out));
const rowCount = transforms.reduce((n, t) => n + t.rules.length, 0);
const ruleCount = transforms.reduce((n, t) => n + t.rules.reduce((m, r) => m + (r.type === 'circumfix' ? r.suffixes.length : 1), 0), 0);
console.log(`sources/own.json: ${transforms.length} transforms, ${ruleCount} rules in ${rowCount} rows`);
