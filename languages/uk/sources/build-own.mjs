#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/uk/sources/own.json: the Ukrainian deinflection rules
// written for this pack (docs/languages.md, section 14 step 2), from the
// paradigm tables in this file. The tables follow the standard description of
// Ukrainian inflection: the four noun declensions with their hard, soft and
// mixed groups, the і ~ о/е alternation, fleeting vowels and consonant
// mutations; adjective declension and comparison; pronouns and numerals; the
// two verb conjugations with their stem classes and mutations, the synthetic
// future, the past, the imperative, participles, adverbial participles and
// the reflexive -ся/-сь.
//
//   node languages/uk/sources/build-own.mjs [--out <file>]
//
// Every suffix rule's stem is limited to {stem} (letters, combining
// marks, apostrophes, hyphens), so no rule reads a word followed by another
// word as one (docs/languages.md, section 14 step 2).

import {writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? resolve(args[outIndex + 1]) : join(here, 'own.json');

// ---------------------------------------------------------------------------
// Conditions: the parts of speech wiktionary-to-yomitan writes in the rules
// column of a Ukrainian term bank. Every rule ends at a dictionary form.
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    adv: {name: 'Adverb', isDictionaryForm: true},
    pron: {name: 'Pronoun', isDictionaryForm: true},
    num: {name: 'Numeral', isDictionaryForm: true},
};

// Classes defined in language.json.
const STEM = '{stem}';
const C = '{consonant}';      // б в г ґ д ж з к л м н п р с т ф х ц ч ш щ
const V = '{vowel}';          // а е є и і ї о у ю я
const VA = '{vowelOrApostrophe}';  // a vowel or an apostrophe (лінія, сім'я)
const HARD = '{hard}';        // б в г ґ д з к л м н п р с т ф х
const HARD_NV = '{hardNoVelar}';  // б в ґ д з л м н п р с т ф (no г к х)
const HUSH = '{hushing}';     // ж ч ш щ
const SOFT = '{softable}';    // д т з с ц л н

/** @type {Map<string, {id: string, name: string, description: string, rules: object[], keys: Set<string>, examples: string[]}>} */
const transforms = new Map();

function transform(id, name, description) {
    if (!transforms.has(id)) {
        transforms.set(id, {id, name, description, rules: [], keys: new Set(), examples: []});
    }
    return id;
}

function keyOf(rule) {
    return JSON.stringify(Object.keys(rule).sort().map((k) => [k, rule[k]]));
}

function add(id, rule, example) {
    const t = transforms.get(id);
    if (!t) { throw new Error(`no transform ${id}`); }
    if (example && t.examples.length < 4 && !t.examples.includes(example)) { t.examples.push(example); }
    const key = keyOf(rule);
    if (t.keys.has(key)) { return; }
    t.keys.add(key);
    t.rules.push(rule);
}

const CONSTRAINTS = ['stemMinLength', 'stemCharacters', 'stemEndsWith', 'stemNotEndsWith', 'stemStartsWith', 'stemNotStartsWith',
    'stemStartsWithText', 'stemNotStartsWithText', 'stemContains', 'stemChange'];

/**
 * A suffix rule. `opt` may give stemMinLength (default 1), stemEndsWith,
 * stemNotEndsWith, stemChange and the other constraints; stemCharacters is
 * {stem} unless opt names another class.
 */
function suffix(id, inflected, deinflected, conditionsIn, conditionsOut, opt = {}, example = undefined) {
    const rule = {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut};
    const minimum = opt.stemMinLength ?? 1;
    const full = {...opt, stemMinLength: minimum > 0 ? minimum : undefined, stemCharacters: opt.stemCharacters ?? STEM};
    for (const key of CONSTRAINTS) {
        if (full[key] !== undefined) { rule[key] = full[key]; }
    }
    if (inflected === '' && !rule.stemEndsWith && !rule.stemContains) {
        throw new Error(`empty ending without a stem constraint in ${id}`);
    }
    add(id, rule, example);
}

function whole(id, inflected, deinflected, conditionsIn, conditionsOut, example = `${inflected} → ${deinflected}`) {
    add(id, {type: 'wholeWord', inflected, deinflected, conditionsIn, conditionsOut}, example);
}

// The і of a closed final syllable is о or е where the syllable opens (стіл,
// стола; ніч, ночі; піч, печі; осінь, осені): the last о or е of the stem,
// followed only by consonants, becomes і.
const toI = {from: ['о', 'е'], to: 'і', occurrence: 'last', between: C};
const toI0 = {from: ['о', 'е'], to: 'і', occurrence: 'last', between: C, betweenMinLength: 0};
// The same after a soft consonant written ьо (лід, льоду).
const toIfromJo = {from: ['ьо'], to: 'і', occurrence: 'last', between: C};
// The other way, for forms whose last syllable closes (ніг from нога, сіл from
// село).
const fromItoO = {from: ['і'], to: 'о', occurrence: 'last', between: C};
const fromItoE = {from: ['і'], to: 'е', occurrence: 'last', between: C};
const fromItoJo = {from: ['і'], to: 'ьо', occurrence: 'last', between: C};

// ---------------------------------------------------------------------------
// Nouns. A rule's transform is named by the cases the ending has in the
// paradigms that make it; the same ending of another declension that gives
// the same lemma ending under the same stem constraint shares the rule.
const CASES = {
    'gen.sg': ['genitive', 'singular'], 'dat.sg': ['dative', 'singular'], 'acc.sg': ['accusative', 'singular'],
    'ins.sg': ['instrumental', 'singular'], 'loc.sg': ['locative', 'singular'], 'voc.sg': ['vocative', 'singular'],
    'nom.pl': ['nominative', 'plural'], 'gen.pl': ['genitive', 'plural'], 'dat.pl': ['dative', 'plural'],
    'ins.pl': ['instrumental', 'plural'], 'loc.pl': ['locative', 'plural'],
};
const CASE_ORDER = Object.keys(CASES);

function caseName(labels) {
    const sorted = CASE_ORDER.filter((c) => labels.includes(c));
    const parts = [];
    for (const number of ['singular', 'plural']) {
        const names = sorted.filter((c) => CASES[c][1] === number).map((c) => CASES[c][0]);
        if (names.length > 0) { parts.push(`${names.join('/')} ${number}`); }
    }
    return parts.join(', ');
}

// Rules collected first, so a rule both declensions make gets the union of
// their cases.
/** @type {Map<string, {inflected: string, deinflected: string, opt: object, labels: Set<string>, examples: string[], pos: string[]}>} */
const nominal = new Map();

function noun(inflected, deinflected, labels, opt = {}, example = undefined, pos = ['n']) {
    const key = JSON.stringify([inflected, deinflected, pos, Object.keys(opt).sort().map((k) => [k, opt[k]])]);
    if (opt.whole && Object.keys(opt).length > 1) { throw new Error('a whole-word noun rule takes no stem constraint'); }
    if (!nominal.has(key)) { nominal.set(key, {inflected, deinflected, opt, labels: new Set(), examples: [], pos}); }
    const entry = nominal.get(key);
    for (const label of labels) { entry.labels.add(label); }
    if (example) { entry.examples.push(example); }
}

/** A noun rule and its twin with the і ~ о/е alternation. */
function nounAlt(inflected, deinflected, labels, opt, example, altExample, change = toI) {
    noun(inflected, deinflected, labels, opt, example);
    noun(inflected, deinflected, labels, {...opt, stemChange: change}, altExample);
}

// First declension: feminine and masculine nouns in -а, -я.
// Hard group (вода, книга, рука, нога, муха, сестра).
noun('и', 'а', ['gen.sg', 'nom.pl'], {stemEndsWith: HARD}, 'води → вода');
noun('і', 'а', ['dat.sg', 'loc.sg'], {stemEndsWith: HARD_NV}, 'воді → вода');
noun('зі', 'га', ['dat.sg', 'loc.sg'], {}, 'нозі → нога');
noun('ці', 'ка', ['dat.sg', 'loc.sg'], {}, 'руці → рука');
noun('сі', 'ха', ['dat.sg', 'loc.sg'], {}, 'мусі → муха');
noun('у', 'а', ['acc.sg'], {stemEndsWith: C}, 'воду → вода');
noun('ою', 'а', ['ins.sg'], {stemEndsWith: HARD}, 'водою → вода');
noun('о', 'а', ['voc.sg'], {stemEndsWith: HARD}, 'мамо → мама');
noun('', 'а', ['gen.pl'], {stemContains: V, stemEndsWith: C}, 'книг → книга');
noun('', 'а', ['gen.pl'], {stemContains: V, stemEndsWith: C, stemChange: fromItoO}, 'ніг → нога');
noun('', 'а', ['gen.pl'], {stemContains: V, stemEndsWith: C, stemChange: fromItoJo}, 'сліз → сльоза');
noun('ок', 'ка', ['gen.pl'], {stemEndsWith: C}, 'книжок → книжка');
noun('ок', 'ка', ['gen.pl'], {stemEndsWith: '[й]'}, 'чайок → чайка');
noun('ьок', 'ька', ['gen.pl'], {}, 'кальок → калька');
noun('ок', 'ко', ['gen.pl'], {stemEndsWith: C}, 'сонечок → сонечко');
noun('ок', 'ки', ['gen.pl'], {stemEndsWith: C}, 'колготок → колготки');
noun('ов', 'ва', ['gen.pl'], {stemEndsWith: '[тк]', stemMinLength: 3}, 'молитов → молитва');
noun('ин', 'ини', ['gen.pl'], {}, 'відносин → відносини');
noun('ек', 'ка', ['gen.pl'], {stemEndsWith: C}, 'позичек → позичка');
noun('ер', 'ра', ['gen.pl'], {stemEndsWith: C}, 'сестер → сестра');
noun('ен', 'на', ['gen.pl'], {stemEndsWith: C}, 'весен → весна');
noun('ам', 'а', ['dat.pl'], {stemEndsWith: C}, 'водам → вода');
noun('ами', 'а', ['ins.pl'], {stemEndsWith: C}, 'водами → вода');
noun('ах', 'а', ['loc.pl'], {stemEndsWith: C}, 'водах → вода');
// Mixed group, after ж ч ш щ (груша, задача, площа).
noun('і', 'а', ['gen.sg', 'dat.sg', 'loc.sg', 'nom.pl'], {stemEndsWith: HUSH}, 'груші → груша');
noun('ею', 'а', ['ins.sg'], {stemEndsWith: HUSH}, 'грушею → груша');
noun('е', 'а', ['voc.sg'], {stemEndsWith: HUSH}, 'груше → груша');
// Soft group after a consonant (земля, пісня, неділя, вулиця).
noun('і', 'я', ['gen.sg', 'dat.sg', 'loc.sg', 'nom.pl'], {stemEndsWith: C}, 'землі → земля');
noun('ю', 'я', ['acc.sg'], {}, 'землю → земля');
noun('ею', 'я', ['ins.sg'], {stemEndsWith: C}, 'землею → земля');
noun('е', 'я', ['voc.sg'], {stemEndsWith: C}, 'земле → земля');
noun('ь', 'я', ['gen.pl'], {stemEndsWith: '[лтдсзц]'}, 'неділь → неділя');
noun('ень', 'ня', ['gen.pl'], {stemEndsWith: C}, 'пісень → пісня');
noun('ень', 'ьня', ['gen.pl'], {stemEndsWith: '[л]'}, 'спалень → спальня');
noun('ель', 'ля', ['gen.pl'], {stemEndsWith: C}, 'земель → земля');
noun('онь', 'ня', ['gen.pl'], {stemEndsWith: C}, 'кухонь → кухня');
noun('ць', 'ця', ['gen.pl'], {}, 'вулиць → вулиця');
noun('ям', 'я', ['dat.pl'], {}, 'землям → земля');
noun('ів', 'я', ['gen.pl'], {stemEndsWith: '[д]', stemMinLength: 2}, 'суддів → суддя');
noun('ями', 'я', ['ins.pl'], {}, 'землями → земля');
noun('ях', 'я', ['loc.pl'], {}, 'землях → земля');
// Soft group after a vowel (лінія, мрія, надія, зброя, шия).
noun('ї', 'я', ['gen.sg', 'dat.sg', 'loc.sg', 'nom.pl'], {stemEndsWith: VA}, 'лінії → лінія');
noun('єю', 'я', ['ins.sg'], {stemEndsWith: VA}, 'лінією → лінія');
noun('є', 'я', ['voc.sg'], {stemEndsWith: VA}, 'Маріє → Марія');
noun('й', 'я', ['gen.pl'], {stemEndsWith: VA}, 'ліній → лінія');

// Second declension: masculine nouns with a zero ending, neuter nouns in -о,
// -е, -я, masculine nouns in -о.
// Masculine, hard and mixed (брат, стіл, кіт, ніж, товариш), with the
// alternation of the last syllable (стіл, стола).
nounAlt('а', '', ['gen.sg'], {stemEndsWith: C}, 'брата → брат', 'стола → стіл');
nounAlt('у', '', ['gen.sg', 'dat.sg', 'loc.sg', 'voc.sg'], {stemEndsWith: C}, 'лісу → ліс', 'дому → дім');
nounAlt('ові', '', ['dat.sg', 'loc.sg'], {stemEndsWith: C}, 'братові → брат', 'котові → кіт');
nounAlt('ом', '', ['ins.sg'], {stemEndsWith: HARD}, 'братом → брат', 'столом → стіл');
nounAlt('ем', '', ['ins.sg'], {stemEndsWith: HUSH}, 'товаришем → товариш', 'ножем → ніж');
nounAlt('еві', '', ['dat.sg', 'loc.sg'], {stemEndsWith: HUSH}, 'товаришеві → товариш', 'ножеві → ніж');
nounAlt('і', '', ['loc.sg'], {stemEndsWith: '[бвґдзлмнпстф]'}, 'заводі → завод', 'столі → стіл');
nounAlt('і', '', ['loc.sg', 'nom.pl'], {stemEndsWith: '[р]'}, 'лікарі → лікар', 'вечорі → вечір');
nounAlt('і', '', ['loc.sg', 'nom.pl', 'gen.sg', 'dat.sg'], {stemEndsWith: HUSH}, 'товариші → товариш', 'ножі → ніж');
for (const [ending, labels, example] of [['и', ['nom.pl'], 'палаци → палац'], ['ом', ['ins.sg'], 'палацом → палац'],
    ['е', ['voc.sg'], 'принце → принц'], ['і', ['loc.sg'], 'палаці → палац']]) {
    noun(ending, '', labels, {stemEndsWith: '[ц]', stemMinLength: 3}, example);
}
noun('зі', 'г', ['loc.sg'], {}, 'березі → берег');
noun('сі', 'х', ['loc.sg'], {}, 'дусі → дух');
nounAlt('ці', 'к', ['loc.sg'], {}, 'вовці → вовк', 'році → рік', toI0);
nounAlt('е', '', ['voc.sg'], {stemEndsWith: HARD}, 'брате → брат', 'коте → кіт');
noun('же', 'г', ['voc.sg'], {}, 'друже → друг');
noun('че', 'к', ['voc.sg'], {}, 'козаче → козак');
noun('ше', 'х', ['voc.sg'], {}, 'пастуше → пастух');
nounAlt('и', '', ['nom.pl'], {stemEndsWith: HARD}, 'брати → брат', 'столи → стіл');
nounAlt('ів', '', ['gen.pl'], {stemEndsWith: C}, 'братів → брат', 'столів → стіл');
nounAlt('ам', '', ['dat.pl'], {stemEndsWith: C}, 'братам → брат', 'столам → стіл');
nounAlt('ами', '', ['ins.pl'], {stemEndsWith: C}, 'братами → брат', 'столами → стіл');
nounAlt('ах', '', ['loc.pl'], {stemEndsWith: C}, 'братах → брат', 'столах → стіл');
for (const [ending, labels] of [['а', ['gen.sg']], ['у', ['gen.sg', 'dat.sg', 'loc.sg', 'voc.sg']], ['ові', ['dat.sg', 'loc.sg']],
    ['ом', ['ins.sg']], ['і', ['loc.sg']], ['и', ['nom.pl']], ['ів', ['gen.pl']], ['ам', ['dat.pl']], ['ами', ['ins.pl']], ['ах', ['loc.pl']]]) {
    noun(ending, '', labels, {stemEndsWith: C, stemChange: toIfromJo}, ending === 'у' ? 'льоду → лід' : undefined);
}
// Fleeting о and е: -ок (будинок, будинку), -ець (хлопець, хлопця), -ень
// (учень, учня; день, дня), -онь (вогонь, вогню) and the roots вітер, бобер,
// свекор, вугор, орел, осел, козел, котел, дятел, посол, сон, пес.
const HARD_ENDINGS = [['а', ['gen.sg']], ['у', ['gen.sg', 'dat.sg', 'loc.sg', 'voc.sg']], ['ові', ['dat.sg', 'loc.sg']],
    ['ом', ['ins.sg']], ['і', ['loc.sg']], ['е', ['voc.sg']], ['и', ['nom.pl']], ['ів', ['gen.pl']], ['ам', ['dat.pl']], ['ами', ['ins.pl']], ['ах', ['loc.pl']]];
const SOFT_ENDINGS = [['я', ['gen.sg']], ['ю', ['gen.sg', 'dat.sg', 'voc.sg']], ['еві', ['dat.sg', 'loc.sg']], ['ем', ['ins.sg']],
    ['і', ['loc.sg', 'nom.pl']], ['ів', ['gen.pl']], ['ям', ['dat.pl']], ['ями', ['ins.pl']], ['ях', ['loc.pl']]];
for (const [ending, labels] of HARD_ENDINGS) {
    noun('к' + ending, 'ок', labels, {stemEndsWith: C}, ending === 'у' ? 'будинку → будинок' : undefined);
}
for (const [ending, labels] of SOFT_ENDINGS) {
    noun('ц' + ending, 'ець', labels, {stemEndsWith: '[{consonant}{vowel}]'}, ending === 'я' ? 'хлопця → хлопець' : undefined);
    noun('н' + ending, 'ень', labels, {stemEndsWith: C}, ending === 'я' ? 'учня → учень' : undefined);
    noun('н' + ending, 'онь', labels, {stemEndsWith: C}, ending === 'ю' ? 'вогню → вогонь' : undefined);
}
noun('че', 'ець', ['voc.sg'], {}, 'хлопче → хлопець');
for (const [ending, labels] of SOFT_ENDINGS) {
    noun('жн' + ending, 'ждень', labels, {}, ending === 'я' ? 'тижня → тиждень' : undefined);
}
for (const [ending, labels] of SOFT_ENDINGS) {
    noun('йц' + ending, 'єць', labels, {stemEndsWith: V}, ending === 'я' ? 'європейця → європеєць' : undefined);
    noun('ьц' + ending, 'ець', labels, {stemEndsWith: C}, ending === 'я' ? 'пальця → палець' : undefined);
    noun('л' + ending, 'ель', labels, {stemEndsWith: C}, ending === 'я' ? 'рубля → рубель' : undefined);
}
// The genitive singular -ости of the 1928 orthography, still written in
// the diaspora and in older books (радости, суспільности).
noun('ости', 'ість', ['gen.sg'], {}, 'радости → радість');
for (const [oblique, lemma, example] of [['тр', 'тер', 'вітру → вітер'], ['бр', 'бер', 'бобра → бобер'], ['кр', 'кор', 'свекра → свекор'],
    ['гр', 'гор', 'вугра → вугор'], ['рл', 'рел', 'орла → орел'], ['сл', 'сел', 'осла → осел'], ['зл', 'зел', 'козла → козел'],
    ['тл', 'тел', 'котла → котел'], ['сл', 'сол', 'посла → посол'], ['сн', 'сон', 'сну → сон'], ['пс', 'пес', 'пса → пес']]) {
    const shown = example.split(' ')[0];
    for (const [ending, labels] of HARD_ENDINGS) {
        const minimum = ['сн', 'пс'].includes(oblique) ? 0 : 1;
        noun(oblique + ending, lemma, labels, {stemMinLength: minimum}, shown.endsWith(oblique + ending) ? example : undefined);
    }
}
// Masculine nouns whose і alternates with о before й (бій, бою; рій, рою).
for (const root of ['б', 'р', 'гн', 'л', 'кр', 'пок']) {
    for (const [ending, labels] of [['ою', ['gen.sg', 'dat.sg', 'loc.sg']], ['оєві', ['dat.sg', 'loc.sg']], ['оєм', ['ins.sg']],
        ['ої', ['loc.sg', 'nom.pl']], ['оїв', ['gen.pl']], ['оям', ['dat.pl']], ['оями', ['ins.pl']], ['оях', ['loc.pl']]]) {
        noun(root + ending, root + 'ій', labels, {stemMinLength: 0}, root === 'б' && ending === 'ою' ? 'бою → бій' : undefined);
    }
}
// Masculine, soft (учитель, кінь, біль, лікар).
nounAlt('я', 'ь', ['gen.sg'], {stemEndsWith: SOFT}, 'учителя → учитель', 'коня → кінь');
nounAlt('ю', 'ь', ['gen.sg', 'dat.sg', 'voc.sg'], {stemEndsWith: SOFT}, 'учителю → учитель', 'болю → біль');
nounAlt('еві', 'ь', ['dat.sg', 'loc.sg'], {stemEndsWith: SOFT}, 'учителеві → учитель', 'коневі → кінь');
nounAlt('ем', 'ь', ['ins.sg'], {stemEndsWith: SOFT}, 'учителем → учитель', 'конем → кінь');
nounAlt('і', 'ь', ['loc.sg', 'nom.pl', 'gen.sg', 'dat.sg'], {stemEndsWith: SOFT}, 'учителі → учитель', 'коні → кінь');
nounAlt('ів', 'ь', ['gen.pl'], {stemEndsWith: SOFT}, 'учителів → учитель', 'конів → кінь');
nounAlt('ей', 'ь', ['gen.pl'], {stemEndsWith: SOFT}, 'тіней → тінь', 'коней → кінь');
nounAlt('ям', 'ь', ['dat.pl'], {stemEndsWith: SOFT}, 'учителям → учитель', 'коням → кінь');
nounAlt('ями', 'ь', ['ins.pl'], {stemEndsWith: SOFT}, 'учителями → учитель', 'конями → кінь');
nounAlt('ях', 'ь', ['loc.pl'], {stemEndsWith: SOFT}, 'учителях → учитель', 'конях → кінь');
noun('ьми', 'ь', ['ins.pl'], {stemEndsWith: SOFT}, 'кіньми → кінь');
for (const [ending, labels, example] of [['я', ['gen.sg'], 'лікаря → лікар'], ['ю', ['gen.sg', 'dat.sg', 'voc.sg'], 'лікарю → лікар'],
    ['еві', ['dat.sg', 'loc.sg'], 'лікареві → лікар'], ['ем', ['ins.sg'], 'лікарем → лікар'], ['ям', ['dat.pl'], 'лікарям → лікар'],
    ['ями', ['ins.pl'], 'лікарями → лікар'], ['ях', ['loc.pl'], 'лікарях → лікар']]) {
    noun(ending, '', labels, {stemEndsWith: '[р]'}, example);
}
// Masculine in -й (герой, край, музей).
noun('я', 'й', ['gen.sg'], {stemEndsWith: V}, 'героя → герой');
noun('ю', 'й', ['gen.sg', 'dat.sg', 'voc.sg'], {stemEndsWith: V}, 'краю → край');
noun('єві', 'й', ['dat.sg', 'loc.sg'], {stemEndsWith: V}, 'героєві → герой');
noun('єм', 'й', ['ins.sg'], {stemEndsWith: V}, 'героєм → герой');
noun('ї', 'й', ['loc.sg', 'nom.pl'], {stemEndsWith: V}, 'краї → край');
noun('їв', 'й', ['gen.pl'], {stemEndsWith: V}, 'героїв → герой');
noun('ям', 'й', ['dat.pl'], {stemEndsWith: V}, 'героям → герой');
noun('ями', 'й', ['ins.pl'], {stemEndsWith: V}, 'героями → герой');
noun('ях', 'й', ['loc.pl'], {stemEndsWith: V}, 'героях → герой');
// Neuter in -о (вікно, місто, слово, село, яблуко, вухо) and masculine in -о
// (батько, Петро).
noun('а', 'о', ['gen.sg', 'nom.pl'], {stemEndsWith: C}, 'вікна → вікно');
noun('у', 'о', ['dat.sg', 'loc.sg', 'voc.sg'], {stemEndsWith: C}, 'вікну → вікно');
noun('ові', 'о', ['dat.sg', 'loc.sg'], {stemEndsWith: C}, 'батькові → батько');
noun('ом', 'о', ['ins.sg'], {stemEndsWith: C}, 'вікном → вікно');
noun('і', 'о', ['loc.sg'], {stemEndsWith: HARD_NV}, 'вікні → вікно');
noun('ці', 'ко', ['loc.sg'], {}, 'яблуці → яблуко');
noun('сі', 'хо', ['loc.sg'], {}, 'вусі → вухо');
noun('е', 'о', ['voc.sg'], {stemEndsWith: C}, 'Петре → Петро');
noun('и', 'о', ['nom.pl'], {stemEndsWith: C}, 'батьки → батько');
noun('ів', 'о', ['gen.pl'], {stemEndsWith: C}, 'батьків → батько');
noun('', 'о', ['gen.pl'], {stemContains: V, stemEndsWith: C}, 'міст → місто');
noun('', 'о', ['gen.pl'], {stemContains: V, stemEndsWith: C, stemChange: fromItoO}, 'слів → слово');
noun('', 'о', ['gen.pl'], {stemContains: V, stemEndsWith: C, stemChange: fromItoE}, 'сіл → село');
noun('он', 'но', ['gen.pl'], {stemEndsWith: C}, 'вікон → вікно');
noun('ер', 'ро', ['gen.pl'], {stemEndsWith: C}, 'відер → відро');
noun('ел', 'ло', ['gen.pl'], {stemEndsWith: C}, 'весел → весло');
noun('ам', 'о', ['dat.pl'], {stemEndsWith: C}, 'вікнам → вікно');
noun('ами', 'о', ['ins.pl'], {stemEndsWith: C}, 'вікнами → вікно');
noun('ах', 'о', ['loc.pl'], {stemEndsWith: C}, 'вікнах → вікно');
// Neuter in -е: soft (поле, море, серце, місце) and mixed (плече, прізвище).
noun('я', 'е', ['gen.sg', 'nom.pl'], {stemEndsWith: '[лрц]'}, 'поля → поле');
noun('ю', 'е', ['dat.sg'], {stemEndsWith: '[лрц]'}, 'полю → поле');
noun('ем', 'е', ['ins.sg'], {stemEndsWith: C}, 'полем → поле');
noun('і', 'е', ['loc.sg'], {stemEndsWith: '[лрц]'}, 'полі → поле');
noun('ів', 'е', ['gen.pl'], {stemEndsWith: '[лр]'}, 'полів → поле');
noun('ць', 'це', ['gen.pl'], {}, 'місць → місце');
noun('ям', 'е', ['dat.pl'], {stemEndsWith: '[лрц]'}, 'полям → поле');
noun('ями', 'е', ['ins.pl'], {stemEndsWith: '[лрц]'}, 'полями → поле');
noun('ях', 'е', ['loc.pl'], {stemEndsWith: '[лрц]'}, 'полях → поле');
noun('а', 'е', ['gen.sg', 'nom.pl'], {stemEndsWith: HUSH}, 'прізвища → прізвище');
noun('у', 'е', ['dat.sg'], {stemEndsWith: HUSH}, 'прізвищу → прізвище');
noun('і', 'е', ['loc.sg', 'nom.pl'], {stemEndsWith: HUSH}, 'плечі → плече');
noun('', 'е', ['gen.pl'], {stemContains: V, stemEndsWith: HUSH}, 'прізвищ → прізвище');
noun('ей', 'е', ['gen.pl'], {stemEndsWith: HUSH}, 'плечей → плече');
noun('ам', 'е', ['dat.pl'], {stemEndsWith: HUSH}, 'прізвищам → прізвище');
noun('ами', 'е', ['ins.pl'], {stemEndsWith: HUSH}, 'прізвищами → прізвище');
noun('има', 'е', ['ins.pl'], {stemEndsWith: HUSH}, 'плечима → плече');
noun('ах', 'е', ['loc.pl'], {stemEndsWith: HUSH}, 'прізвищах → прізвище');
// Neuter in -я with a doubled consonant (знання, питання, життя, обличчя).
noun('ю', 'я', ['dat.sg'], {}, 'знанню → знання');
noun('ям', 'я', ['ins.sg'], {}, 'знанням → знання');
noun('і', 'я', ['loc.sg'], {stemEndsWith: C}, 'знанні → знання');
for (const [ending, lemma, example] of [['нь', 'ння', 'питань → питання'], ['ль', 'лля', 'весіль → весілля'], ['ть', 'ття', 'сторіть → сторіття'],
    ['дь', 'ддя', 'знарядь → знаряддя'], ['сь', 'сся', 'колось → колосся'], ['зь', 'ззя', 'гроззь → гроззя'], ['ч', 'ччя', 'облич → обличчя'],
    ['ж', 'жжя', 'узбереж → узбережжя'], ['ш', 'шшя', 'безгрош → безгрошшя']]) {
    noun(ending, lemma, ['gen.pl'], {}, example);
}

// Third declension: feminine nouns with a zero ending (ніч, сіль, радість,
// любов, тінь, подорож, мить) and мати.
nounAlt('і', 'ь', ['gen.sg', 'dat.sg', 'loc.sg', 'nom.pl'], {stemEndsWith: SOFT}, 'тіні → тінь', 'солі → сіль');
nounAlt('і', '', ['gen.sg', 'dat.sg', 'loc.sg', 'nom.pl'], {stemEndsWith: '[бпвмф]'}, 'любові → любов', undefined);
for (const [ending, lemma, example] of [['ччю', 'ч', 'ніччю → ніч'], ['жжю', 'ж', 'подорожжю → подорож'], ['шшю', 'ш', 'мишшю → миш'],
    ['ллю', 'ль', 'сіллю → сіль'], ['нню', 'нь', 'тінню → тінь'], ['ддю', 'дь', 'міддю → мідь'], ['ттю', 'ть', 'миттю → мить'],
    ['ззю', 'зь', 'маззю → мазь'], ['ссю', 'сь', 'віссю → вісь'], ['ццю', 'ць', 'міццю → міць'], ['стю', 'сть', 'радістю → радість'],
    ['ртю', 'рть', 'смертю → смерть'], ["в'ю", 'в', "любов'ю → любов"], ["ф'ю", 'ф', "верф'ю → верф"], ["б'ю", 'б', "голуб'ю → голуб"],
    ["п'ю", 'п', "степ'ю → степ"]]) {
    noun(ending, lemma, ['ins.sg'], {}, example);
}
nounAlt('е', 'ь', ['voc.sg'], {stemEndsWith: SOFT}, 'тіне → тінь', 'радосте → радість');
nounAlt('е', '', ['voc.sg'], {stemEndsWith: HUSH}, 'подороже → подорож', 'ноче → ніч');
nounAlt('ей', '', ['gen.pl'], {stemEndsWith: HUSH}, 'подорожей → подорож', 'ночей → ніч');
// мати
for (const [form, labels] of [['матері', ['gen.sg', 'dat.sg', 'loc.sg', 'nom.pl']], ['матір', ['acc.sg']], ["матір'ю", ['ins.sg']],
    ['матерів', ['gen.pl']], ['матерям', ['dat.pl']], ['матерями', ['ins.pl']], ['матерях', ['loc.pl']]]) {
    noun(form, 'мати', labels, {stemMinLength: 0}, `${form} → мати`);
}

// Fourth declension: young beings in -а, -я (кошеня, курча) and -м'я (ім'я).
for (const [ending, labels] of [['ти', ['gen.sg']], ['ті', ['dat.sg', 'loc.sg']], ['та', ['nom.pl']], ['т', ['gen.pl']],
    ['там', ['dat.pl']], ['тами', ['ins.pl']], ['тах', ['loc.pl']]]) {
    noun('я' + ending, 'я', labels, {}, ending === 'ти' ? 'кошеняти → кошеня' : undefined);
    noun('а' + ending, 'а', labels, {stemEndsWith: '[жчш]'}, ending === 'та' ? 'курчата → курча' : undefined);
}
noun('ам', 'а', ['ins.sg'], {stemEndsWith: '[жчш]'}, 'курчам → курча');
for (const [ending, labels] of [['ені', ['gen.sg', 'dat.sg', 'loc.sg']], ['енем', ['ins.sg']], ['ена', ['nom.pl']], ['ен', ['gen.pl']],
    ['енам', ['dat.pl']], ['енами', ['ins.pl']], ['енах', ['loc.pl']]]) {
    noun('м' + ending, "м'я", labels, {}, ending === 'ені' ? "імені → ім'я" : undefined);
}

// Plural-only nouns (двері, гроші, штани, ножиці) and irregular plurals.
noun('ів', 'и', ['gen.pl'], {stemEndsWith: C}, 'штанів → штани');
noun('ам', 'и', ['dat.pl'], {stemEndsWith: C}, 'штанам → штани');
noun('ами', 'и', ['ins.pl'], {stemEndsWith: C}, 'штанами → штани');
noun('ах', 'и', ['loc.pl'], {stemEndsWith: C}, 'штанах → штани');
noun('ей', 'і', ['gen.pl'], {stemEndsWith: C}, 'дверей → двері');
noun('ів', 'і', ['gen.pl'], {stemEndsWith: C}, 'джунглів → джунглі');
noun('ам', 'і', ['dat.pl'], {stemEndsWith: HUSH}, 'грошам → гроші');
noun('ами', 'і', ['ins.pl'], {stemEndsWith: HUSH}, 'нутрощами → нутрощі');
noun('ах', 'і', ['loc.pl'], {stemEndsWith: HUSH}, 'грошах → гроші');
noun('ями', 'і', ['ins.pl'], {stemEndsWith: C}, 'ножицями → ножиці');
noun('има', 'і', ['ins.pl'], {stemEndsWith: C}, 'дверима → двері');
noun('ям', 'і', ['dat.pl'], {stemEndsWith: C}, 'дверям → двері');
noun('ях', 'і', ['loc.pl'], {stemEndsWith: C}, 'дверях → двері');
noun('ць', 'ці', ['gen.pl'], {}, 'ножиць → ножиці');
for (const [lemmas, forms] of [[['людина', 'люди'], [['люди', ['nom.pl']], ['людей', ['gen.pl']], ['людям', ['dat.pl']], ['людьми', ['ins.pl']], ['людях', ['loc.pl']]]],
    [['дитина', 'діти'], [['діти', ['nom.pl']], ['дітей', ['gen.pl']], ['дітям', ['dat.pl']], ['дітьми', ['ins.pl']], ['дітях', ['loc.pl']]]],
    [['око'], [['очі', ['nom.pl']], ['очей', ['gen.pl']], ['очам', ['dat.pl']], ['очима', ['ins.pl']], ['очах', ['loc.pl']]]],
    [['друг'], [['друзі', ['nom.pl']], ['друзів', ['gen.pl']], ['друзям', ['dat.pl']], ['друзями', ['ins.pl']], ['друзях', ['loc.pl']]]],
    [['небо'], [['небеса', ['nom.pl']], ['небес', ['gen.pl']], ['небесам', ['dat.pl']], ['небесами', ['ins.pl']], ['небесах', ['loc.pl']]]],
    [['чудо'], [['чудеса', ['nom.pl']], ['чудес', ['gen.pl']], ['чудесам', ['dat.pl']], ['чудесами', ['ins.pl']], ['чудесах', ['loc.pl']]]],
    [['серце'], [['сердець', ['gen.pl']]]],
    [['вівця'], [['овець', ['gen.pl']]]],
    [['четвер'], [['четверга', ['gen.sg']], ['четвергу', ['dat.sg', 'loc.sg']], ['четвергові', ['dat.sg', 'loc.sg']], ['четвергом', ['ins.sg']],
        ['четверги', ['nom.pl']], ['четвергів', ['gen.pl']], ['четвергам', ['dat.pl']], ['четвергами', ['ins.pl']], ['четвергах', ['loc.pl']]]]]) {
    for (const lemma of lemmas) {
        for (const [form, labels] of forms) {
            if (form !== lemma) { noun(form, lemma, labels, {whole: true}, `${form} → ${lemma}`); }
        }
    }
}
// -анин, -янин (громадянин, селянин, киянин): plural without -ин.
for (const vowel of ['а', 'я']) {
    for (const [ending, labels] of [['ни', ['nom.pl']], ['н', ['gen.pl']], ['нам', ['dat.pl']], ['нами', ['ins.pl']], ['нах', ['loc.pl']]]) {
        noun(vowel + ending, vowel + 'нин', labels, {stemMinLength: 2}, ending === 'ни' && vowel === 'я' ? 'громадяни → громадянин' : undefined);
    }
}

// ---------------------------------------------------------------------------
// Adjectives: hard (новий), soft (синій, третій), comparison, short forms.
const ADJ_HARD = [
    ['а', 'adj.f', 'nominative feminine singular', 'нова → новий'],
    ['е', 'adj.n', 'nominative/accusative neuter singular', 'нове → новий'],
    ['і', 'adj.pl', 'nominative plural', 'нові → новий'],
    ['ого', 'adj.gen.mn', 'genitive masculine/neuter singular', 'нового → новий'],
    ['ої', 'adj.gen.f', 'genitive feminine singular', 'нової → новий'],
    ['ому', 'adj.dat-loc.mn', 'dative/locative masculine/neuter singular', 'новому → новий'],
    ['ій', 'adj.dat-loc.f', 'dative/locative feminine singular', 'новій → новий'],
    ['им', 'adj.ins.mn+dat.pl', 'instrumental masculine/neuter singular, dative plural', 'новим → новий'],
    ['у', 'adj.acc.f', 'accusative feminine singular', 'нову → новий'],
    ['ою', 'adj.ins.f', 'instrumental feminine singular', 'новою → новий'],
    ['ім', 'adj.loc.mn', 'locative masculine/neuter singular', 'новім → новий'],
    ['их', 'adj.gen-loc.pl', 'genitive/locative plural', 'нових → новий'],
    ['ими', 'adj.ins.pl', 'instrumental plural', 'новими → новий'],
];
const ADJ_SOFT = [
    ['я', 'adj.f', 'синя → синій'], ['є', 'adj.n', 'синє → синій'], ['і', 'adj.pl', 'сині → синій'],
    ['ього', 'adj.gen.mn', 'синього → синій'], ['ьої', 'adj.gen.f', 'синьої → синій'], ['ьому', 'adj.dat-loc.mn', 'синьому → синій'],
    ['ім', 'adj.ins-loc.mn+dat.pl', 'синім → синій'], ['ю', 'adj.acc.f', 'синю → синій'], ['ьою', 'adj.ins.f', 'синьою → синій'],
    ['іх', 'adj.gen-loc.pl', 'синіх → синій'], ['іми', 'adj.ins.pl', 'синіми → синій'],
];
const ADJ_NAMES = Object.fromEntries(ADJ_HARD.map(([, id, name]) => [id, name]));
ADJ_NAMES['adj.ins-loc.mn+dat.pl'] = 'instrumental/locative masculine/neuter singular, dative plural';
for (const [id, name] of Object.entries(ADJ_NAMES)) {
    transform(id, name, `The ${name} form of an adjective, participle or adjectival pronoun.`);
}
// The output is also a noun (хворий, черговий), a pronoun that declines as
// an adjective (який, котрий, будь-який) or a participle, which
// wiktionary-to-yomitan files under its verb (литий, прочитаний: v).
const ADJ_OUT = ['adj', 'n', 'pron', 'v'];
for (const [ending, id, , example] of ADJ_HARD) {
    suffix(id, ending, 'ий', [], ADJ_OUT, {stemMinLength: 2}, example);
}
for (const [ending, id, example] of ADJ_SOFT) {
    suffix(id, ending, 'ій', [], ADJ_OUT, {stemMinLength: 2, stemEndsWith: '[нт]'}, example);
}
// Indefinite pronouns in -сь and -небудь, which decline as adjectives
// (якийсь: якогось, якоюсь, якимось; який-небудь: якого-небудь).
transform('adj.indef', 'case form (indefinite pronoun)', 'A case form of an indefinite pronoun in -сь or -небудь: якогось (якийсь), якоюсь (якийсь), якого-небудь (який-небудь).');
for (const [ending, , , example] of ADJ_HARD) {
    const particle = /[мх]$/u.test(ending) ? 'ось' : 'сь';
    suffix('adj.indef', ending + particle, 'ийсь', [], [], {stemMinLength: 2}, ending === 'ого' ? 'якогось → якийсь' : undefined);
    suffix('adj.indef', ending + '-небудь', 'ий-небудь', [], [], {stemMinLength: 2}, ending === 'ого' ? 'якого-небудь → який-небудь' : undefined);
}
suffix('adj.indef', 'имсь', 'ийсь', [], [], {stemMinLength: 2});
suffix('adj.indef', 'ихсь', 'ийсь', [], [], {stemMinLength: 2});
// Possessive adjectives from personal nouns: батьків (батькового, батькову),
// сестрин (сестриного, сестрину). -ова, -ових and -овими are left out: they
// also end the far more frequent relational adjectives in -овий (світова,
// світових), which would read as possessives of plural nouns (світів).
transform('adj.poss', 'case form (possessive adjective)', 'A case form of a possessive adjective: батькового (батьків), сестриною (сестрин).');
for (const ending of ['ового', 'овому', 'овим', 'ової', 'овій', 'ову', 'овою', 'ове', 'ові', 'овім']) {
    suffix('adj.poss', ending, 'ів', [], ['adj'], {stemMinLength: 2}, ending === 'ового' ? 'батькового → батьків' : undefined);
}
for (const ending of ['иного', 'иному', 'иним', 'ина', 'иної', 'иній', 'ину', 'иною', 'ине', 'ині', 'иних', 'иними', 'иним']) {
    suffix('adj.poss', ending, 'ин', [], ['adj'], {stemMinLength: 3}, ending === 'иного' ? 'сестриного → сестрин' : undefined);
}
transform('adj.cmp', 'comparative', 'Comparative degree of an adjective: новіший (новий), вищий (високий), кращий (гарний).');
const ADJ_CMP = [
    ['іший', 'ий', {stemMinLength: 2}, 'новіший → новий'], ['іший', 'ій', {stemMinLength: 2, stemEndsWith: '[н]'}, 'синіший → синій'],
    ['ший', 'ий', {stemMinLength: 2, stemEndsWith: '[бвдтр]'}, 'молодший → молодий'], ['ший', 'кий', {stemMinLength: 2, stemEndsWith: C}, 'легший → легкий'],
    ['кший', 'кий', {stemMinLength: 2}, "м'якший → м'який"], ['ший', 'окий', {stemMinLength: 2, stemEndsWith: C}, 'ширший → широкий'],
    ['ший', 'гий', {stemMinLength: 2, stemEndsWith: C}, 'довший → довгий'], ['щий', 'сокий', {stemMinLength: 1}, 'вищий → високий'],
    ['жчий', 'зький', {stemMinLength: 1}, 'нижчий → низький'], ['жчий', 'гий', {stemMinLength: 2}, 'дорожчий → дорогий'],
    ['жчий', 'жий', {stemMinLength: 2}, 'дужчий → дужий'], ['чий', 'кий', {stemMinLength: 2, stemEndsWith: '[ж]'}, 'важчий → важкий'],
    ['льший', 'лекий', {stemMinLength: 2}, 'дальший → далекий'], ['щий', 'стий', {stemMinLength: 2}, 'товщий → товстий']];
for (const [inflected, deinflected, opt, example] of ADJ_CMP) {
    suffix('adj.cmp', inflected, deinflected, ['adj'], ['adj'], opt, example);
}
const ADJ_SUPPLETIVE = [['кращий', ['гарний', 'добрий', 'хороший']], ['ліпший', ['добрий']], ['гірший', ['поганий', 'лихий']], ['більший', ['великий']], ['менший', ['малий', 'маленький']]];
for (const [form, lemmas] of ADJ_SUPPLETIVE) {
    for (const lemma of lemmas) { add('adj.cmp', {type: 'wholeWord', inflected: form, deinflected: lemma, conditionsIn: ['adj'], conditionsOut: ['adj']}, `${form} → ${lemma}`); }
}
// The superlative is най- (якнай-, щонай-) before the comparative; it goes to
// the positive in one step (найближчий → близький), as dictionaries name it,
// so a comparative headword (ближчий) does not come before the positive.
transform('adj.sup', 'superlative', 'Superlative degree of an adjective: найновіший (новий), найближчий (близький), якнайшвидший (швидкий), найкращий (добрий).');
const SUP_PREFIXES = ['най', 'якнай', 'щонай'].map((x) => [x, '']);
for (const [inflected, deinflected, opt] of ADJ_CMP) {
    add('adj.sup', {type: 'circumfix', prefixes: SUP_PREFIXES, suffixes: [[inflected, deinflected]], conditionsIn: ['adj'], conditionsOut: ['adj'],
        stemMinLength: opt.stemMinLength, stemCharacters: STEM, ...(opt.stemEndsWith ? {stemEndsWith: opt.stemEndsWith} : {})}, inflected === 'іший' && deinflected === 'ий' ? 'найновіший → новий' : undefined);
}
for (const [form, lemmas] of ADJ_SUPPLETIVE) {
    for (const prefix of ['най', 'якнай', 'щонай']) {
        for (const lemma of lemmas) { add('adj.sup', {type: 'wholeWord', inflected: prefix + form, deinflected: lemma, conditionsIn: ['adj'], conditionsOut: ['adj']}); }
    }
}
transform('adj.short', 'short form', 'Short masculine form of an adjective: повен (повний), зелен (зелений), рад (радий).');
suffix('adj.short', 'ен', 'ний', [], ['adj'], {stemMinLength: 3}, 'повен → повний');
suffix('adj.short', 'ен', 'ений', [], ['adj'], {stemMinLength: 3}, 'зелен → зелений');
for (const [form, lemma] of [['рад', 'радий'], ['здоров', 'здоровий'], ['годен', 'годний'], ['винен', 'винний'], ['повинен', 'повинний']]) {
    add('adj.short', {type: 'wholeWord', inflected: form, deinflected: lemma, conditionsIn: [], conditionsOut: ['adj']}, `${form} → ${lemma}`);
}
transform('adv.cmp', 'comparative', 'Comparative degree of an adverb: швидше (швидко), вище (високо), краще (добре).');
const ADV_CMP = [
    ['іше', 'о', {stemMinLength: 2}, 'частіше → часто'], ['ше', 'ко', {stemMinLength: 2}, 'швидше → швидко'],
    ['ше', 'о', {stemMinLength: 2, stemEndsWith: '[бвдтрх]'}, 'тихше → тихо'], ['ше', 'око', {stemMinLength: 2}, 'ширше → широко'],
    ['ше', 'го', {stemMinLength: 2}, 'довше → довго'], ['ще', 'соко', {stemMinLength: 1}, 'вище → високо'],
    ['жче', 'зько', {stemMinLength: 1}, 'нижче → низько'], ['жче', 'го', {stemMinLength: 2}, 'дорожче → дорого'],
    ['че', 'ко', {stemMinLength: 2, stemEndsWith: '[жг]'}, 'важче → важко']];
for (const [inflected, deinflected, opt, example] of ADV_CMP) {
    suffix('adv.cmp', inflected, deinflected, ['adv'], ['adv'], opt, example);
}
const ADV_SUPPLETIVE = [['краще', ['добре', 'гарно']], ['гірше', ['погано']], ['більше', ['багато']], ['менше', ['мало']], ['далі', ['далеко']]];
for (const [form, lemmas] of ADV_SUPPLETIVE) {
    for (const lemma of lemmas) { add('adv.cmp', {type: 'wholeWord', inflected: form, deinflected: lemma, conditionsIn: ['adv'], conditionsOut: ['adv']}, `${form} → ${lemma}`); }
}
transform('adv.sup', 'superlative', 'Superlative degree of an adverb: найшвидше (швидко), якнайкраще (добре).');
for (const [inflected, deinflected, opt] of ADV_CMP) {
    add('adv.sup', {type: 'circumfix', prefixes: SUP_PREFIXES, suffixes: [[inflected, deinflected]], conditionsIn: ['adv'], conditionsOut: ['adv'],
        stemMinLength: opt.stemMinLength, stemCharacters: STEM, ...(opt.stemEndsWith ? {stemEndsWith: opt.stemEndsWith} : {})}, inflected === 'ше' && deinflected === 'ко' ? 'найшвидше → швидко' : undefined);
}
for (const [form, lemmas] of ADV_SUPPLETIVE) {
    for (const prefix of ['най', 'якнай', 'щонай']) {
        for (const lemma of lemmas) { add('adv.sup', {type: 'wholeWord', inflected: prefix + form, deinflected: lemma, conditionsIn: ['adv'], conditionsOut: ['adv']}); }
    }
}

// ---------------------------------------------------------------------------
// Pronouns and numerals: whole words.
function pronoun(id, name, lemma, forms, conditionsOut = ['pron']) {
    transform(id, name, `${name[0].toUpperCase()}${name.slice(1)}.`);
    for (const form of forms) { whole(id, form, lemma, [], conditionsOut); }
}
const PRONOUNS = [
    ['я', {'gen-acc': ['мене'], 'dat-loc': ['мені'], ins: ['мною']}],
    ['ти', {'gen-acc': ['тебе'], 'dat-loc': ['тобі'], ins: ['тобою']}],
    ['він', {'gen-acc': ['його', 'нього'], dat: ['йому'], ins: ['ним'], loc: ['ньому', 'нім']}],
    ['воно', {'gen-acc': ['його', 'нього'], dat: ['йому'], ins: ['ним'], loc: ['ньому', 'нім']}],
    ['вона', {'gen-acc': ['її', 'неї'], 'dat-loc': ['їй', 'ній'], ins: ['нею']}],
    ['ми', {'gen-acc-loc': ['нас'], dat: ['нам'], ins: ['нами']}],
    ['ви', {'gen-acc-loc': ['вас'], dat: ['вам'], ins: ['вами']}],
    ['вони', {'gen-acc-loc': ['їх', 'них'], dat: ['їм'], ins: ['ними']}],
    ['себе', {'dat-loc': ['собі'], ins: ['собою']}],
    ['хто', {'gen-acc': ['кого'], 'dat-loc': ['кому'], ins: ['ким'], loc: ['кім']}],
    ['що', {gen: ['чого'], 'dat-loc': ['чому'], ins: ['чим'], loc: ['чім']}],
    ['ніхто', {'gen-acc': ['нікого'], 'dat-loc': ['нікому'], ins: ['ніким']}],
    ['ніщо', {gen: ['нічого'], 'dat-loc': ['нічому'], ins: ['нічим']}],
    ['хтось', {'gen-acc': ['когось'], 'dat-loc': ['комусь'], ins: ['кимось']}],
    ['щось', {gen: ['чогось'], 'dat-loc': ['чомусь'], ins: ['чимось']}],
    ['дехто', {'gen-acc': ['декого'], 'dat-loc': ['декому'], ins: ['деким']}],
    ['дещо', {gen: ['дечого'], 'dat-loc': ['дечому'], ins: ['дечим']}],
];
const PRON_CASES = {'gen-acc': 'genitive/accusative', 'dat-loc': 'dative/locative', ins: 'instrumental', dat: 'dative', loc: 'locative',
    'gen-acc-loc': 'genitive/accusative/locative', gen: 'genitive'};
for (const [lemma, cases] of PRONOUNS) {
    for (const [c, forms] of Object.entries(cases)) {
        pronoun(`pron.${c}`, `${PRON_CASES[c]} (pronoun)`, lemma, forms);
    }
}
// Possessive and other declined pronouns: мій, твій, свій (м-ій type), наш,
// ваш, цей, той, весь, сам, чий, їхній.
const DECLINED_PRONOUNS = [
    ['мій', 'pron', {f: ['моя'], n: ['моє'], pl: ['мої'], 'gen.mn': ['мого'], 'gen.f': ['моєї'], 'gen-loc.pl': ['моїх'], 'dat-loc.mn': ['моєму'], 'dat-loc.f': ['моїй'], 'ins-loc.mn+dat.pl': ['моїм'], 'acc.f': ['мою'], 'ins.f': ['моєю'], 'ins.pl': ['моїми']}],
    ['наш', 'pron', {f: ['наша'], n: ['наше'], pl: ['наші'], 'gen.mn': ['нашого'], 'gen.f': ['нашої'], 'gen-loc.pl': ['наших'], 'dat-loc.mn': ['нашому'], 'dat-loc.f': ['нашій'], 'ins.mn+dat.pl': ['нашим'], 'loc.mn': ['нашім'], 'acc.f': ['нашу'], 'ins.f': ['нашою'], 'ins.pl': ['нашими']}],
    ['цей', '', {f: ['ця'], n: ['це'], pl: ['ці'], 'gen.mn': ['цього'], 'gen.f': ['цієї'], 'gen-loc.pl': ['цих'], 'dat-loc.mn': ['цьому'], 'dat-loc.f': ['цій'], 'ins.mn+dat.pl': ['цим'], 'loc.mn': ['цім'], 'acc.f': ['цю'], 'ins.f': ['цією'], 'ins.pl': ['цими']}],
    ['той', '', {f: ['та'], n: ['те'], pl: ['ті'], 'gen.mn': ['того'], 'gen.f': ['тієї'], 'gen-loc.pl': ['тих'], 'dat-loc.mn': ['тому'], 'dat-loc.f': ['тій'], 'ins.mn+dat.pl': ['тим'], 'loc.mn': ['тім'], 'acc.f': ['ту'], 'ins.f': ['тією'], 'ins.pl': ['тими']}],
    ['весь', 'pron', {f: ['вся', 'уся'], n: ['все', 'усе'], pl: ['всі', 'усі'], 'gen.mn': ['всього', 'усього'], 'gen.f': ['всієї', 'усієї'], 'gen-loc.pl': ['всіх', 'усіх'], 'dat-loc.mn': ['всьому', 'усьому'], 'dat-loc.f': ['всій', 'усій'], 'ins-loc.mn+dat.pl': ['всім', 'усім'], 'acc.f': ['всю', 'усю'], 'ins.f': ['всією', 'усією'], 'ins.pl': ['всіма', 'усіма']}],
    ['сам', 'pron', {f: ['сама'], n: ['саме'], pl: ['самі'], 'gen.mn': ['самого'], 'gen.f': ['самої'], 'gen-loc.pl': ['самих'], 'dat-loc.mn': ['самому'], 'dat-loc.f': ['самій'], 'ins.mn+dat.pl': ['самим'], 'acc.f': ['саму'], 'ins.f': ['самою'], 'ins.pl': ['самими']}],
    ['чий', 'pron', {f: ['чия'], n: ['чиє'], pl: ['чиї'], 'gen.mn': ['чийого', 'чиєго'], 'gen.f': ['чиєї'], 'gen-loc.pl': ['чиїх'], 'dat-loc.mn': ['чийому'], 'dat-loc.f': ['чиїй'], 'ins-loc.mn+dat.pl': ['чиїм'], 'acc.f': ['чию'], 'ins.f': ['чиєю'], 'ins.pl': ['чиїми']}],
    ['їхній', 'pron', {f: ['їхня'], n: ['їхнє'], pl: ['їхні'], 'gen.mn': ['їхнього'], 'gen.f': ['їхньої'], 'gen-loc.pl': ['їхніх'], 'dat-loc.mn': ['їхньому'], 'ins-loc.mn+dat.pl': ['їхнім'], 'acc.f': ['їхню'], 'ins.f': ['їхньою'], 'ins.pl': ['їхніми']}],
];
const ADJ_TRANSFORM = {f: 'adj.f', n: 'adj.n', pl: 'adj.pl', 'gen.mn': 'adj.gen.mn', 'gen.f': 'adj.gen.f', 'gen-loc.pl': 'adj.gen-loc.pl',
    'dat-loc.mn': 'adj.dat-loc.mn', 'dat-loc.f': 'adj.dat-loc.f', 'ins.mn+dat.pl': 'adj.ins.mn+dat.pl', 'ins-loc.mn+dat.pl': 'adj.ins-loc.mn+dat.pl',
    'loc.mn': 'adj.loc.mn', 'acc.f': 'adj.acc.f', 'ins.f': 'adj.ins.f', 'ins.pl': 'adj.ins.pl'};
for (const [form, lemma] of [['всіх', 'всі'], ['всім', 'всі'], ['всіма', 'всі'], ['усіх', 'усі'], ['усім', 'усі'], ['усіма', 'усі']]) {
    add('adj.ins.pl', {type: 'wholeWord', inflected: form, deinflected: lemma, conditionsIn: [], conditionsOut: []}, `${form} → ${lemma}`);
}
const toyForms = DECLINED_PRONOUNS.find(([lemma]) => lemma === 'той')[2];
DECLINED_PRONOUNS.push(['отой', '', Object.fromEntries(Object.entries(toyForms).map(([slot, list]) => [slot, list.map((form) => 'о' + form)]))]);
for (const [lemma, tag, forms] of DECLINED_PRONOUNS) {
    const lemmas = lemma === 'мій' ? ['мій', 'твій', 'свій'] : lemma === 'наш' ? ['наш', 'ваш'] : [lemma];
    for (const target of lemmas) {
        const swap = (form) => (lemma === 'мій' ? form.replace(/^м/, target.slice(0, target.length - 2)) : lemma === 'наш' ? form.replace(/^н/, target[0]) : form);
        for (const [slot, list] of Object.entries(forms)) {
            for (const form of list) {
                const id = ADJ_TRANSFORM[slot];
                add(id, {type: 'wholeWord', inflected: swap(form), deinflected: target, conditionsIn: [], conditionsOut: tag ? [tag] : []}, `${swap(form)} → ${target}`);
            }
        }
    }
}
// Indefinite and negative pronouns made from хто and що: -небудь, -сь, -то,
// будь-, казна-, хтозна-, аби- (кого-небудь, когось, кимсь, будь-кого,
// абичим). Each form of хто and що with each affix.
transform('pron.indef', 'case form (indefinite pronoun)', 'A case form of an indefinite pronoun: кого-небудь (хто-небудь), когось (хтось), будь-чого (будь-що).');
for (const [lemma, forms] of [['хто', ['кого', 'кому', 'ким', 'кім']], ['що', ['чого', 'чому', 'чим', 'чім']]]) {
    for (const form of forms) {
        for (const affix of ['-небудь', '-то']) { whole('pron.indef', form + affix, lemma + affix, [], ['pron']); }
        for (const variant of /[аеєиіїоуюя]$/u.test(form) ? [form + 'сь'] : [form + 'ось', form + 'сь']) { whole('pron.indef', variant, lemma + 'сь', [], ['pron']); }
        for (const prefix of ['будь-', 'казна-', 'хтозна-', 'аби']) { whole('pron.indef', prefix + form, prefix + lemma, [], ['pron']); }
    }
}
whole('pron.indef', 'кожен', 'кожний', [], ['adj', 'pron']);
whole('pron.indef', 'жоден', 'жодний', [], ['adj', 'pron']);
// сей and оцей, older forms of цей (Шевченко, Франко).
for (const [lemma, stem] of [['сей', 'с'], ['оцей', 'оц']]) {
    for (const ending of ['ього', 'ьому', 'им', 'я', 'ієї', 'ій', 'ю', 'ією', 'е', 'і', 'их', 'ими', 'ім']) {
        whole('pron.indef', stem + ending, lemma, [], []);
    }
}
// Numerals.
transform('num.case', 'case form (numeral)', 'Oblique case of a cardinal numeral: двох (два), трьома (три), п\'яти (п\'ять), сорока (сорок).');
const NUMERALS = [
    ['один', ['одного', 'одної', 'однієї', 'одному', 'одній', 'одним', 'одну', 'одною', 'однією', 'одне', 'одно', 'одна', 'одні', 'одних', 'одними']],
    ['два', ['двох', 'двом', 'двома', 'дві']], ['три', ['трьох', 'трьом', 'трьома']], ['чотири', ['чотирьох', 'чотирьом', 'чотирма']],
    ['шість', ['шести', 'шістьох', 'шістьом', 'шістьма']], ['сім', ['семи', 'сімох', 'сімом', 'сьома', 'сімома']],
    ['вісім', ['восьми', 'вісьмох', 'вісьмом', 'вісьма', 'вісьмома']], ['сорок', ['сорока']], ['дев\'яносто', ['дев\'яноста']], ['сто', ['ста']],
    ['двісті', ['двохсот', 'двомстам', 'двомастами', 'двохстах']], ['триста', ['трьохсот', 'трьомстам', 'трьомастами', 'трьохстах']],
    ['чотириста', ['чотирьохсот', 'чотирьомстам', 'чотирмастами', 'чотирьохстах']],
];
NUMERALS.push(['обидва', ['обидві', 'обидвох', 'обидвом', 'обидвома']], ['оба', ['обі', 'обох', 'обом', 'обома']],
    ['п\'ятсот', ['п\'ятисот', 'п\'ятистам', 'п\'ятьмастами', 'п\'ятистах']], ['шістсот', ['шестисот', 'шестистам', 'шістьмастами', 'шестистах']],
    ['сімсот', ['семисот', 'семистам', 'сімомастами', 'семистами', 'семистах']], ['вісімсот', ['восьмисот', 'восьмистам', 'вісьмомастами', 'восьмистами', 'восьмистах']],
    ['дев\'ятсот', ['дев\'ятисот', 'дев\'ятистам', 'дев\'ятьмастами', 'дев\'ятистах']]);
// Collective numerals: двоє, троє, обоє, четверо (двох, трьома, обом).
NUMERALS.push(['двоє', ['двох', 'двом', 'двома']], ['троє', ['трьох', 'трьом', 'трьома']], ['обоє', ['обох', 'обом', 'обома']],
    ['четверо', ['чотирьох', 'чотирьом', 'чотирма', 'чотирьома']], ['кілька', ['кількох', 'кільком', 'кількома']],
    ['декілька', ['декількох', 'декільком', 'декількома']], ['багато', ['багатьох', 'багатьом', 'багатьма']],
    ['скільки', ['скількох', 'скільком', 'скількома']], ['стільки', ['стількох', 'стільком', 'стількома']]);
for (const [lemma, forms] of NUMERALS) {
    for (const form of forms) { whole('num.case', form, lemma, [], ['num']); }
}
// Collective numerals (п'ятеро, двадцятеро) share the forms -ятьох, -ятьом,
// -ятьма, -ятьома with the cardinals.
for (const ending of ['ьох', 'ьом', 'ьма', 'ьома']) {
    suffix('num.case', 'ят' + ending, 'ятеро', [], ['num'], {stemMinLength: 1}, ending === 'ьох' ? "п'ятьох → п'ятеро" : undefined);
}
for (const [ending] of [['и'], ['ьох'], ['ьом'], ['ьма'], ['ьома']]) {
    suffix('num.case', 'ят' + ending, 'ять', [], ['num'], {stemMinLength: 1}, ending === 'и' ? "п'яти → п'ять" : undefined);
    suffix('num.case', 'десят' + ending, 'десят', [], ['num'], {stemMinLength: 1}, ending === 'и' ? "п'ятдесяти → п'ятдесят" : undefined);
}
for (const [ending] of [['исот'], ['истам'], ['ьмастами'], ['истах']]) {
    suffix('num.case', 'ят' + ending, 'ятсот', [], ['num'], {stemMinLength: 1}, ending === 'исот' ? "п'ятисот → п'ятсот" : undefined);
}

// ---------------------------------------------------------------------------
// Verbs.
const VERB = {
    prs1sg: ['present (я)', 'Present tense, first person singular: читаю, пишу, говорю. For a perfective verb it is the future: прочитаю.'],
    prs2sg: ['present (ти)', 'Present tense, second person singular: читаєш, пишеш, говориш (the future of a perfective verb).'],
    prs3sg: ['present (він, вона)', 'Present tense, third person singular: читає, пише, говорить (the future of a perfective verb).'],
    prs1pl: ['present (ми)', 'Present tense, first person plural: читаємо, пишемо, говоримо; colloquial читаєм (the future of a perfective verb).'],
    prs2pl: ['present (ви)', 'Present tense, second person plural: читаєте, пишете, говорите (the future of a perfective verb).'],
    prs3pl: ['present (вони)', 'Present tense, third person plural: читають, пишуть, говорять (the future of a perfective verb).'],
    fut1sg: ['future (я)', 'Synthetic future of an imperfective verb, first person singular: читатиму.'],
    fut2sg: ['future (ти)', 'Synthetic future, second person singular: читатимеш.'],
    fut3sg: ['future (він, вона)', 'Synthetic future, third person singular: читатиме.'],
    fut1pl: ['future (ми)', 'Synthetic future, first person plural: читатимемо, читатимем.'],
    fut2pl: ['future (ви)', 'Synthetic future, second person plural: читатимете.'],
    fut3pl: ['future (вони)', 'Synthetic future, third person plural: читатимуть.'],
    pstM: ['past (він)', 'Past tense, masculine singular: читав, ніс, міг.'],
    pstF: ['past (вона)', 'Past tense, feminine singular: читала, несла, могла.'],
    pstN: ['past (воно)', 'Past tense, neuter singular: читало, несло, могло.'],
    pstPl: ['past (вони)', 'Past tense, plural: читали, несли, могли.'],
    imp2sg: ['imperative (ти)', 'Imperative, second person singular: читай, пиши, сядь, вибач.'],
    imp1pl: ['imperative (ми)', 'Imperative, first person plural: читаймо, пишімо, ходім.'],
    imp2pl: ['imperative (ви)', 'Imperative, second person plural: читайте, пишіть, вибачте.'],
    advPrs: ['adverbial participle (present)', 'Present adverbial participle (дієприслівник): читаючи, пишучи, сидячи.'],
    advPst: ['adverbial participle (past)', 'Past adverbial participle (дієприслівник): прочитавши, принісши.'],
    ptcpPass: ['passive participle', 'Passive past participle, an adjective made from a verb: прочитаний, зроблений, відкритий.'],
    ptcpAct: ['active participle', 'Active participle, an adjective made from a verb: працюючий, лежачий, почервонілий.'],
    impers: ['impersonal (-но, -то)', 'Impersonal past form: зроблено, написано, відкрито.'],
    infVar: ['infinitive (-ть, -тись)', 'Infinitive with -ть or -тись: читать, сміятись.'],
    be: ['present (є)', 'Present tense of бути, every person: є.'],
};
for (const [id, [name, description]] of Object.entries(VERB)) { transform(`v.${id}`, name, description); }

/**
 * A verb rule and its reflexive forms. `kind` decides the particle:
 * 'std' adds ся, and сь after a vowel; 'e3' is the 3rd person singular of
 * the first conjugation, which takes ться (пише, пишеться); 'adv' adds сь and
 * ся; 'cons' adds ся only; 'none' adds nothing.
 */
function verb(id, inflected, deinflected, opt = {}, kind = 'std', example = undefined) {
    suffix(`v.${id}`, inflected, deinflected, [], ['v'], opt, example);
    if (kind === 'none') { return; }
    const lemma = deinflected + 'ся';
    if (kind === 'e3') {
        suffix(`v.${id}`, inflected + 'ться', lemma, [], ['v'], opt);
        return;
    }
    suffix(`v.${id}`, inflected + 'ся', lemma, [], ['v'], opt);
    const lastVowel = /[аеєиіїоуюя]$/u.test(inflected);
    if ((kind === 'std' && lastVowel) || kind === 'adv') {
        suffix(`v.${id}`, inflected + 'сь', lemma, [], ['v'], opt);
    }
}

const PRS = ['prs1sg', 'prs2sg', 'prs3sg', 'prs1pl', 'prs1pl', 'prs2pl', 'prs3pl'];

/**
 * One conjugation class. `prs` lists the endings of the present (1sg, 2sg,
 * 3sg, 1pl, short 1pl, 2pl, 3pl; null for none), `imp` the imperative by
 * person, `ptcp` the passive participles; the present adverbial participle
 * and the active participle come from the 3rd person plural.
 */
function conjugation({inf, prs = [], imp = {}, ptcp = [], opt = {}, label}) {
    prs.forEach((ending, i) => {
        if (ending === null || ending === undefined) { return; }
        const id = PRS[i];
        const kind = id === 'prs3sg' && /[еє]$/u.test(ending) ? 'e3' : (i === 4 ? 'cons' : 'std');
        verb(id, ending, inf, opt, kind, i === 0 && label ? `${label[0]} → ${label[1]}` : undefined);
        if (id === 'prs3pl') {
            const adverbial = ending.replace(/уть$/u, 'учи').replace(/ють$/u, 'ючи').replace(/ать$/u, 'ачи').replace(/ять$/u, 'ячи');
            if (adverbial !== ending) {
                verb('advPrs', adverbial, inf, opt, 'adv');
                suffix('v.ptcpAct', adverbial + 'й', inf, ['adj'], ['v'], opt);
            }
        }
    });
    for (const [person, endings] of Object.entries(imp)) {
        for (const ending of endings) {
            verb(`imp${person}`, ending, inf, opt, 'adv');
            if (person === '2pl' && ending.endsWith('іть')) { verb('imp2pl', ending.slice(0, -1) + 'е', inf, opt, 'adv'); }
        }
    }
    for (const ending of ptcp) {
        suffix('v.ptcpPass', ending, inf, ['adj'], ['v'], opt);
        suffix('v.impers', ending.replace(/ий$/u, 'о'), inf, [], ['v'], opt);
    }
}

// Past tense, adverbial past participle and the infinitive variants of every
// verb whose infinitive stem ends in a vowel (читати: читав, читала,
// читавши; бути: був).
verb('pstM', 'в', 'ти', {stemEndsWith: V}, 'adv', 'читав → читати');
verb('pstF', 'ла', 'ти', {}, 'std', 'читала → читати');
verb('pstN', 'ло', 'ти', {}, 'std', 'читало → читати');
verb('pstPl', 'ли', 'ти', {}, 'std', 'читали → читати');
verb('advPst', 'вши', 'ти', {stemEndsWith: V}, 'adv', 'прочитавши → прочитати');
verb('infVar', 'ть', 'ти', {stemEndsWith: V, stemMinLength: 3}, 'none', 'читать → читати');
suffix('v.infVar', 'тись', 'тися', [], ['v'], {}, 'сміятись → сміятися');
suffix('v.infVar', 'ться', 'тися', [], ['v'], {stemEndsWith: V}, 'сміяться → сміятися');
// Synthetic future: the infinitive and -му, -меш, -ме, -мемо, -мете, -муть.
for (const [ending, id, kind] of [['тиму', 'fut1sg', 'std'], ['тимеш', 'fut2sg', 'std'], ['тиме', 'fut3sg', 'e3'], ['тимемо', 'fut1pl', 'std'],
    ['тимем', 'fut1pl', 'cons'], ['тимете', 'fut2pl', 'std'], ['тимуть', 'fut3pl', 'std']]) {
    verb(id, ending, 'ти', {}, kind, ending === 'тиму' ? 'читатиму → читати' : undefined);
}
// Past tense of verbs whose infinitive stem ends in a consonant: нести (ніс,
// несла), везти (віз), вести (вів, вела), класти (клав), пекти (пік), могти
// (міг), берегти (беріг), лягти (ліг), бігти (біг), терти (тер), рости (ріс),
// їсти (їв), іти (ішов, йшов), and -нути verbs with a zero ending (зник,
// зникла). The adverbial participle adds -ши (принісши, зникши).
const PAST_CONSONANT = [
    ['іс', 'ести', 'ніс → нести'], ['іс', 'ости', 'ріс → рости'], ['с', 'сти'], ['із', 'езти', 'віз → везти'], ['з', 'зти'],
    ['ік', 'екти', 'пік → пекти'], ['ік', 'окти'], ['к', 'кти'], ['іг', 'огти', 'міг → могти'], ['іг', 'егти', 'беріг → берегти'],
    ['іг', 'ягти', 'ліг → лягти'], ['г', 'гти'], ['ів', 'ести', 'вів → вести'], ['ів', 'істи', 'сів → сісти'], ['ав', 'асти', 'клав → класти'],
    ['іб', 'ебти', 'гріб → гребти'], ['ер', 'ерти', 'тер → терти'], ['їв', 'їсти', 'їв → їсти'],
    ['к', 'кнути', 'зник → зникнути'], ['х', 'хнути'], ['с', 'снути'], ['з', 'знути'], ['б', 'бнути'], ['г', 'гнути'], ['п', 'пнути'],
];
for (const [ending, lemma, example] of PAST_CONSONANT) {
    const opt = {stemMinLength: ['їв'].includes(ending) ? 0 : 1};
    verb('pstM', ending, lemma, opt, 'cons', example);
    verb('advPst', ending + 'ши', lemma, opt, 'adv');
}
for (const [consonant, lemma] of [['к', 'кнути'], ['х', 'хнути'], ['с', 'снути'], ['з', 'знути'], ['б', 'бнути'], ['г', 'гнути'], ['п', 'пнути'], ['д', 'днути']]) {
    verb('pstF', consonant + 'ла', lemma, {}, 'std', consonant === 'к' ? 'зникла → зникнути' : undefined);
    verb('pstN', consonant + 'ло', lemma, {}, 'std');
    verb('pstPl', consonant + 'ли', lemma, {}, 'std');
}
for (const [ending, lemma] of [['ла', 'сти'], ['ло', 'сти'], ['ли', 'сти']]) {
    const id = ending === 'ла' ? 'pstF' : ending === 'ло' ? 'pstN' : 'pstPl';
    verb(id, ending, lemma, {stemEndsWith: V}, 'std', ending === 'ла' ? 'вела → вести' : undefined);
}
for (const [stem, lemma, extra] of [['ішов', 'іти', {stemCharacters: '[п]'}], ['йшов', 'йти', {}]]) {
    const opt = {stemMinLength: 0, ...extra};
    verb('pstM', stem, lemma, opt, 'cons', stem === 'йшов' ? 'прийшов → прийти' : undefined);
    verb('advPst', stem + 'ши', lemma, opt, 'adv');
    const base = stem.slice(0, -2);
    verb('pstF', base + 'ла', lemma, opt, 'std');
    verb('pstN', base + 'ло', lemma, opt, 'std');
    verb('pstPl', base + 'ли', lemma, opt, 'std');
}

// First conjugation, infinitive stem in a vowel.
// -авати drops -ва- through the present (даю, стаєш, продає). After д and т
// it comes first: дати and стати have other presents (дам, стану), so дає,
// стає and удає are давати, ставати and удавати. After н and р (знаю, граю)
// the -ати verb comes first, below.
conjugation({inf: 'авати', prs: ['аю', 'аєш', 'ає', 'аємо', 'аєм', 'аєте', 'ають'], imp: {'2sg': ['авай'], '1pl': ['аваймо'], '2pl': ['авайте']}, opt: {stemEndsWith: '[дт]'}, label: ['даю', 'давати']});
conjugation({inf: 'ати', prs: ['аю', 'аєш', 'ає', 'аємо', 'аєм', 'аєте', 'ають'], imp: {'2sg': ['ай'], '1pl': ['аймо'], '2pl': ['айте']}, ptcp: ['аний'], label: ['читаю', 'читати']});
conjugation({inf: 'яти', prs: ['яю', 'яєш', 'яє', 'яємо', 'яєм', 'яєте', 'яють'], imp: {'2sg': ['яй'], '1pl': ['яймо'], '2pl': ['яйте']}, ptcp: ['яний'], label: ['гуляю', 'гуляти']});
// -іяти before -іти: where both are headwords, -іяти is the common one
// (мрію: мріяти, to dream, before мріти, to glimmer).
conjugation({inf: 'іяти', prs: ['ію', 'ієш', 'іє', 'іємо', 'ієм', 'ієте', 'іють'], imp: {'2sg': ['ій'], '1pl': ['іймо'], '2pl': ['ійте']}, ptcp: ['іяний'], label: ['мрію', 'мріяти']});
conjugation({inf: 'іти', prs: ['ію', 'ієш', 'іє', 'іємо', 'ієм', 'ієте', 'іють'], imp: {'2sg': ['ій'], '1pl': ['іймо'], '2pl': ['ійте']}, ptcp: ['ітий'], label: ['розумію', 'розуміти']});
conjugation({inf: 'аяти', prs: ['аю', 'аєш', 'ає', 'аємо', 'аєм', 'аєте', 'ають'], imp: {'2sg': ['ай'], '1pl': ['аймо'], '2pl': ['айте']}, label: ['каюся', 'каятися']});
conjugation({inf: 'увати', prs: ['ую', 'уєш', 'ує', 'уємо', 'уєм', 'уєте', 'ують'], imp: {'2sg': ['уй'], '1pl': ['уймо'], '2pl': ['уйте']}, ptcp: ['ований', 'уваний'], label: ['малюю', 'малювати']});
conjugation({inf: 'ювати', prs: ['юю', 'юєш', 'ює', 'юємо', 'юєм', 'юєте', 'юють'], imp: {'2sg': ['юй'], '1pl': ['юймо'], '2pl': ['юйте']}, ptcp: ['ьований'], label: ['малюю', 'малювати']});
conjugation({inf: 'авати', prs: ['аю', 'аєш', 'ає', 'аємо', 'аєм', 'аєте', 'ають'], imp: {'2sg': ['авай'], '1pl': ['аваймо'], '2pl': ['авайте']}, opt: {stemEndsWith: '[нр]'}, label: ['пізнаю', 'пізнавати']});
conjugation({inf: 'ути', prs: ['ую', 'уєш', 'ує', 'уємо', 'уєм', 'уєте', 'ують'], imp: {'2sg': ['уй'], '1pl': ['уймо'], '2pl': ['уйте']}, ptcp: ['утий'], label: ['чую', 'чути']});
conjugation({inf: 'нути', prs: ['ну', 'неш', 'не', 'немо', 'нем', 'нете', 'нуть'], imp: {'2sg': ['ни', 'нь'], '1pl': ['німо', 'нім', 'ньмо'], '2pl': ['ніть', 'ньте']}, ptcp: ['нутий', 'нений'], label: ['крикну', 'крикнути']});
conjugation({inf: 'ити', prs: ['ию', 'иєш', 'иє', 'иємо', 'иєм', 'иєте', 'иють'], imp: {'1pl': ['иймо'], '2pl': ['ийте']}, ptcp: ['итий'], label: ['мию', 'мити']});
conjugation({inf: 'ити', prs: ["'ю", "'єш", "'є", "'ємо", "'єм", "'єте", "'ють"], opt: {stemEndsWith: '[бпв]'}, label: ["п'ю", 'пити']});
conjugation({inf: 'бити', prs: ["іб'ю", "іб'єш", "іб'є", "іб'ємо", "іб'єм", "іб'єте", "іб'ють"], opt: {stemEndsWith: '[зд]'}, label: ["розіб'ю", 'розбити']});
conjugation({inf: 'лити', prs: ['ллю', 'ллєш', 'ллє', 'ллємо', 'ллєм', 'ллєте', 'ллють'], opt: {stemMinLength: 0}, label: ['ллю', 'лити']});
conjugation({inf: 'жити', prs: ['живу', 'живеш', 'живе', 'живемо', 'живем', 'живете', 'живуть'], imp: {'2sg': ['живи'], '1pl': ['живімо', 'живім'], '2pl': ['живіть']}, opt: {stemMinLength: 0}, label: ['живу', 'жити']});
// The singular imperative -ий of бити, пити, лити, шити, мити, вити, рити
// and their prefixed verbs: written out, because -ий also ends adjectives
// (білий). One cross product: a prefix (or none) and the imperative, with
// nothing between them (stemCharacters [] allows only the empty stem).
const IMP_PREFIXES = ['', 'ви', 'за', 'на', 'по', 'роз', 'від', 'при', 'пере', 'у', 'в', 'з', 'об', 'під', 'про', 'до'];
const IMP_ROOTS = ['б', 'п', 'л', 'ш', 'м', 'в', 'р'];
add('v.imp2sg', {type: 'circumfix', prefixes: IMP_PREFIXES.map((x) => [x, x]),
    suffixes: IMP_ROOTS.flatMap((root) => [[root + 'ий', root + 'ити'], [root + 'ийся', root + 'итися'], [root + 'ийсь', root + 'итися']]),
    conditionsIn: [], conditionsOut: ['v'], stemCharacters: '[]'}, 'пий → пити');
verb('imp2sg', 'крий', 'крити', {stemMinLength: 0}, 'adv', 'відкрий → відкрити');
verb('imp2sg', 'гний', 'гнити', {stemMinLength: 0}, 'adv');

// First conjugation, infinitive stem in a consonant.
conjugation({inf: 'сти', prs: ['су', 'сеш', 'се', 'семо', 'сем', 'сете', 'суть'], imp: {'2sg': ['си'], '1pl': ['сімо', 'сім'], '2pl': ['сіть']}, ptcp: ['сений'], label: ['несу', 'нести']});
conjugation({inf: 'сти', prs: ['ду', 'деш', 'де', 'демо', 'дем', 'дете', 'дуть'], imp: {'2sg': ['ди', 'дь'], '1pl': ['дімо', 'дім', 'дьмо'], '2pl': ['діть', 'дьте']}, ptcp: ['дений'], opt: {stemEndsWith: V}, label: ['веду', 'вести']});
conjugation({inf: 'сти', prs: ['ту', 'теш', 'те', 'темо', 'тем', 'тете', 'туть'], imp: {'2sg': ['ти'], '1pl': ['тімо', 'тім'], '2pl': ['тіть']}, ptcp: ['тений'], opt: {stemEndsWith: V}, label: ['мету', 'мести']});
conjugation({inf: 'сти', prs: ['сту', 'стеш', 'сте', 'стемо', 'стем', 'стете', 'стуть'], label: ['росту', 'рости']});
conjugation({inf: 'істи', prs: ['яду', 'ядеш', 'яде', 'ядемо', 'ядем', 'ядете', 'ядуть'], imp: {'2sg': ['ядь'], '1pl': ['ядьмо'], '2pl': ['ядьте']}, opt: {stemEndsWith: '[с]'}, label: ['сяду', 'сісти']});
conjugation({inf: 'зти', prs: ['зу', 'зеш', 'зе', 'земо', 'зем', 'зете', 'зуть'], imp: {'2sg': ['зи', 'зь'], '1pl': ['зімо', 'зім', 'зьмо'], '2pl': ['зіть', 'зьте']}, ptcp: ['зений'], label: ['везу', 'везти']});
conjugation({inf: 'кти', prs: ['чу', 'чеш', 'че', 'чемо', 'чем', 'чете', 'чуть'], imp: {'2sg': ['чи'], '1pl': ['чімо', 'чім'], '2pl': ['чіть']}, ptcp: ['чений'], label: ['печу', 'пекти']});
conjugation({inf: 'гти', prs: ['жу', 'жеш', 'же', 'жемо', 'жем', 'жете', 'жуть'], imp: {'2sg': ['жи'], '1pl': ['жімо', 'жім'], '2pl': ['жіть']}, ptcp: ['жений'], label: ['можу', 'могти']});
conjugation({inf: 'ягти', imp: {'2sg': ['яж'], '1pl': ['яжмо'], '2pl': ['яжте']}, label: ['ляж', 'лягти']});
conjugation({inf: 'бігти', prs: ['біжу', 'біжиш', 'біжить', 'біжимо', 'біжим', 'біжите', 'біжать'], imp: {'2sg': ['біжи'], '1pl': ['біжімо', 'біжім'], '2pl': ['біжіть']}, opt: {stemMinLength: 0}, label: ['біжу', 'бігти']});
conjugation({inf: 'ерти', prs: ['ру', 'реш', 'ре', 'ремо', 'рем', 'рете', 'руть'], imp: {'2sg': ['ри'], '1pl': ['рімо', 'рім'], '2pl': ['ріть']}, ptcp: ['ертий'], label: ['помру', 'померти']});
conjugation({inf: 'рати', prs: ['еру', 'ереш', 'ере', 'еремо', 'ерем', 'ерете', 'еруть'], imp: {'2sg': ['ери'], '1pl': ['ерімо', 'ерім'], '2pl': ['еріть']}, ptcp: ['раний'], label: ['беру', 'брати']});
conjugation({inf: 'ібрати', prs: ['беру', 'береш', 'бере', 'беремо', 'берем', 'берете', 'беруть'], imp: {'2sg': ['бери'], '1pl': ['берімо', 'берім'], '2pl': ['беріть']}, opt: {stemEndsWith: '[зд]'}, label: ['зберу', 'зібрати']});
conjugation({inf: 'вати', prs: ['ву', 'веш', 'ве', 'вемо', 'вем', 'вете', 'вуть'], imp: {'2sg': ['ви'], '1pl': ['вімо', 'вім'], '2pl': ['віть']}, opt: {stemEndsWith: '[зр]'}, label: ['назву', 'назвати']});
conjugation({inf: 'звати', prs: ['зову', 'зовеш', 'зове', 'зовемо', 'зовем', 'зовете', 'зовуть'], opt: {stemMinLength: 0}, label: ['зову', 'звати']});
conjugation({inf: 'ати', prs: ['ану', 'анеш', 'ане', 'анемо', 'анем', 'анете', 'ануть'], imp: {'2sg': ['ань'], '1pl': ['аньмо'], '2pl': ['аньте']}, opt: {stemEndsWith: '[т]'}, label: ['стану', 'стати']});
conjugation({inf: 'нати', prs: ['ну', 'неш', 'не', 'немо', 'нем', 'нете', 'нуть'], imp: {'2sg': ['ни'], '1pl': ['німо', 'нім'], '2pl': ['ніть']}, opt: {stemEndsWith: '[г]'}, label: ['стогну', 'стогнати']});
conjugation({inf: 'іти', prs: ['іну', 'інеш', 'іне', 'інемо', 'інем', 'інете', 'інуть'], imp: {'2sg': ['інь'], '1pl': ['іньмо'], '2pl': ['іньте']}, opt: {stemEndsWith: '[рд]'}, label: ['зустріну', 'зустріти']});
conjugation({inf: 'гти', prs: ['гну', 'гнеш', 'гне', 'гнемо', 'гнем', 'гнете', 'гнуть'], imp: {'2sg': ['гни'], '1pl': ['гнімо', 'гнім'], '2pl': ['гніть']}, opt: {stemEndsWith: '[я]'}, label: ['тягну', 'тягти']});
conjugation({inf: 'бти', prs: ['бу', 'беш', 'бе', 'бемо', 'бем', 'бете', 'буть'], imp: {'2sg': ['би'], '1pl': ['бімо', 'бім'], '2pl': ['біть']}, opt: {stemEndsWith: '[уе]'}, label: ['гребу', 'гребти']});
conjugation({inf: 'орати', prs: ['орю', 'ореш', 'оре', 'оремо', 'орем', 'орете', 'орють'], imp: {'2sg': ['ори'], '1pl': ['орімо', 'орім'], '2pl': ['оріть']}, opt: {stemMinLength: 0}, label: ['орю', 'орати']});
conjugation({inf: 'полоти', prs: ['полю', 'полеш', 'поле', 'полемо', 'полем', 'полете', 'полють'], ptcp: ['полотий'], opt: {stemMinLength: 0}, label: ['полю', 'полоти']});
conjugation({inf: 'узяти', prs: [], ptcp: ['узятий'], opt: {stemMinLength: 0}});
conjugation({inf: 'ікти', prs: ['очу', 'очеш', 'оче', 'очемо', 'очем', 'очете', 'очуть'], imp: {'2sg': ['оччи'], '1pl': [], '2pl': []}, opt: {stemEndsWith: '[л]'}, label: ['волочу', 'волікти']});
for (const [ending, id] of [['окла', 'pstF'], ['окло', 'pstN'], ['окли', 'pstPl']]) { verb(id, ending, 'ікти', {stemEndsWith: '[л]'}, 'std'); }
for (const [ending, id] of [['гнув', 'pstM'], ['гнула', 'pstF'], ['гнуло', 'pstN'], ['гнули', 'pstPl']]) {
    verb(id, ending, 'гти', {}, ending === 'гнув' ? 'adv' : 'std', ending === 'гнув' ? 'простягнув → простягти' : undefined);
}
verb('advPst', 'гнувши', 'гти', {}, 'adv');
conjugation({inf: 'чати', prs: ['чну', 'чнеш', 'чне', 'чнемо', 'чнем', 'чнете', 'чнуть'], imp: {'2sg': ['чни'], '1pl': ['чнімо', 'чнім'], '2pl': ['чніть']}, ptcp: ['чатий'], label: ['почну', 'почати']});
conjugation({inf: 'няти', prs: ['німу', 'німеш', 'німе', 'німемо', 'німем', 'німете', 'німуть'], imp: {'2sg': ['німи'], '1pl': ['німімо', 'нім'], '2pl': ['німіть']}, ptcp: ['нятий'], label: ['зніму', 'зняти']});
conjugation({inf: 'йняти', prs: ['йму', 'ймеш', 'йме', 'ймемо', 'ймем', 'ймете', 'ймуть'], imp: {'2sg': ['йми'], '1pl': ['ймімо', 'ймім'], '2pl': ['йміть']}, ptcp: ['йнятий'], label: ['прийму', 'прийняти']});
conjugation({inf: 'узяти', prs: ['візьму', 'візьмеш', 'візьме', 'візьмемо', 'візьмем', 'візьмете', 'візьмуть'], imp: {'2sg': ['візьми'], '1pl': ['візьмімо', 'візьмім'], '2pl': ['візьміть']}, opt: {stemMinLength: 0}, label: ['візьму', 'узяти']});
conjugation({inf: 'взяти', prs: ['візьму', 'візьмеш', 'візьме', 'візьмемо', 'візьмем', 'візьмете', 'візьмуть'], imp: {'2sg': ['візьми'], '1pl': ['візьмімо', 'візьмім'], '2pl': ['візьміть']}, ptcp: ['взятий'], opt: {stemMinLength: 0}, label: ['візьму', 'взяти']});
conjugation({inf: 'слати', prs: ['шлю', 'шлеш', 'шле', 'шлемо', 'шлем', 'шлете', 'шлють'], imp: {'2sg': ['шли'], '1pl': ['шлімо', 'шлім'], '2pl': ['шліть']}, opt: {stemMinLength: 0}, label: ['надішлю', 'надіслати']});
conjugation({inf: 'ігнати', prs: ['жену', 'женеш', 'жене', 'женемо', 'женем', 'женете', 'женуть'], imp: {'2sg': ['жени'], '1pl': ['женімо', 'женім'], '2pl': ['женіть']}, opt: {stemEndsWith: '[зд]'}, label: ['зжену', 'зігнати']});
conjugation({inf: 'ійняти', prs: ['німу', 'німеш', 'німе', 'німемо', 'німем', 'німете', 'німуть'], imp: {'2sg': ['німи'], '1pl': ['німімо'], '2pl': ['німіть']}, opt: {stemEndsWith: '[д]'}, label: ['відніму', 'відійняти']});
conjugation({inf: 'гнати', prs: ['жену', 'женеш', 'жене', 'женемо', 'женем', 'женете', 'женуть'], imp: {'2sg': ['жени'], '1pl': ['женімо', 'женім'], '2pl': ['женіть']}, opt: {stemMinLength: 0}, label: ['жену', 'гнати']});
conjugation({inf: 'чити', prs: ['чину', 'чинеш', 'чине', 'чинемо', 'чинем', 'чинете', 'чинуть'], imp: {'2sg': ['чинь'], '1pl': ['чиньмо'], '2pl': ['чиньте']}, label: ['відпочину', 'відпочити']});
conjugation({inf: 'пати', prs: ['плю', 'пиш', 'пить', 'пимо', 'пим', 'пите', 'плять'], imp: {'2sg': ['пи'], '1pl': ['пімо', 'пім'], '2pl': ['піть']}, opt: {stemEndsWith: '[с]'}, label: ['сплю', 'спати']});
conjugation({inf: 'хотіти', prs: ['хочу', 'хочеш', 'хоче', 'хочемо', 'хочем', 'хочете', 'хочуть'], opt: {stemMinLength: 0}, label: ['хочу', 'хотіти']});
conjugation({inf: 'бути', prs: ['буду', 'будеш', 'буде', 'будемо', 'будем', 'будете', 'будуть'], imp: {'2sg': ['будь'], '1pl': ['будьмо'], '2pl': ['будьте']}, opt: {stemMinLength: 0}, label: ['буду', 'бути']});
whole('v.be', 'є', 'бути', [], ['v']);
conjugation({inf: 'їхати', prs: ['їду', 'їдеш', 'їде', 'їдемо', 'їдем', 'їдете', 'їдуть'], imp: {'2sg': ['їдь'], '1pl': ['їдьмо'], '2pl': ['їдьте']}, opt: {stemMinLength: 0}, label: ['їду', 'їхати']});
conjugation({inf: 'йти', prs: ['йду', 'йдеш', 'йде', 'йдемо', 'йдем', 'йдете', 'йдуть'], imp: {'2sg': ['йди'], '1pl': ['йдімо', 'йдім'], '2pl': ['йдіть']}, ptcp: ['йдений'], opt: {stemMinLength: 0}, label: ['прийду', 'прийти']});
// іти keeps its і only bare or after п (іду, піду); after every other
// prefix it is й (прийду, вийду, зійду), which the йти rules read.
conjugation({inf: 'іти', prs: ['іду', 'ідеш', 'іде', 'ідемо', 'ідем', 'ідете', 'ідуть'], imp: {'2sg': ['іди'], '1pl': ['ідімо', 'ідім'], '2pl': ['ідіть']}, opt: {stemMinLength: 0, stemCharacters: '[п]'}, label: ['піду', 'піти']});
conjugation({inf: 'їсти', prs: ['їм', 'їси', 'їсть', 'їмо', null, 'їсте', 'їдять'], imp: {'2sg': ['їж'], '1pl': ['їжмо'], '2pl': ['їжте']}, opt: {stemMinLength: 0}, label: ["з'їм", "з'їсти"]});
conjugation({inf: 'дати', prs: ['дам', 'даси', 'дасть', 'дамо', null, 'дасте', 'дадуть'], opt: {stemMinLength: 0}, label: ['продам', 'продати']});
conjugation({inf: 'вісти', prs: ['вім', 'віси', 'вість', 'вімо', null, 'вісте', 'відять'], label: ['відповім', 'відповісти']});
conjugation({inf: 'бороти', prs: ['борю', 'бореш', 'боре', 'боремо', 'борем', 'борете', 'борють'], imp: {'2sg': ['бори'], '1pl': ['борімо', 'борім'], '2pl': ['боріть']}, opt: {stemMinLength: 0}, label: ['борюся', 'боротися']});
conjugation({inf: 'колоти', prs: ['колю', 'колеш', 'коле', 'колемо', 'колем', 'колете', 'колють'], ptcp: ['колотий', 'колений'], opt: {stemMinLength: 0}, label: ['колю', 'колоти']});
conjugation({inf: 'пороти', prs: ['порю', 'пореш', 'поре', 'поремо', 'порем', 'порете', 'порють'], ptcp: ['поротий'], opt: {stemMinLength: 0}, label: ['порю', 'пороти']});
conjugation({inf: 'молоти', prs: ['мелю', 'мелеш', 'меле', 'мелемо', 'мелем', 'мелете', 'мелють'], ptcp: ['молотий'], opt: {stemMinLength: 0}, label: ['мелю', 'молоти']});

// First conjugation in -ати with a consonant mutation through the present
// (писати: пишу, пишеш; казати: кажу; плакати: плачу; шептати: шепчу;
// брехати: брешу; свистати: свищу; плескати: плещу; сипати: сиплю).
for (const [c, m, example] of [['с', 'ш', ['пишу', 'писати']], ['з', 'ж', ['кажу', 'казати']], ['к', 'ч', ['плачу', 'плакати']],
    ['т', 'ч', ['шепчу', 'шептати']], ['х', 'ш', ['брешу', 'брехати']], ['ст', 'щ', ['свищу', 'свистати']], ['ск', 'щ', ['плещу', 'плескати']]]) {
    conjugation({inf: c + 'ати', prs: [m + 'у', m + 'еш', m + 'е', m + 'емо', m + 'ем', m + 'ете', m + 'уть'],
        imp: {'2sg': [m + 'и'], '1pl': [m + 'імо', m + 'ім'], '2pl': [m + 'іть', m + 'іте']}, label: example});
}
conjugation({inf: 'пати', prs: ['плю', 'плеш', 'пле', 'племо', 'плем', 'плете', 'плють'], label: ['сиплю', 'сипати']});
// Their imperative without an ending (ріж, маж, плач, клич, сип).
for (const [form, lemma] of [['іж', 'ізати'], ['аж', 'азати'], ['ач', 'акати'], ['ич', 'икати'], ['ип', 'ипати']]) {
    verb('imp2sg', form, lemma, {}, 'cons', form === 'ач' ? 'плач → плакати' : undefined);
    verb('imp1pl', form + 'мо', lemma, {}, 'std');
    verb('imp2pl', form + 'те', lemma, {}, 'std');
}

// Second conjugation: -ити, -іти (говорити, ходити, любити, сидіти) and -ати
// after ж ч ш щ (лежати, кричати), with the mutation of the 1st person
// singular (ходжу, вожу, ношу, плачу, пущу, їжджу, люблю) and the л of the
// 3rd person plural after a labial (люблять).
const SECOND = [
    ['р', 'рю', 'рять', 'рений'], ['л', 'лю', 'лять', 'лений'], ['н', 'ню', 'нять', 'нений'],
    ['ж', 'жу', 'жать', 'жений'], ['ч', 'чу', 'чать', 'чений'], ['ш', 'шу', 'шать', 'шений'], ['щ', 'щу', 'щать', 'щений'],
    ['д', 'джу', 'дять', 'джений'], ['т', 'чу', 'тять', 'чений'], ['з', 'жу', 'зять', 'жений'], ['с', 'шу', 'сять', 'шений'],
    ['ст', 'щу', 'стять', 'щений'], ['зд', 'жджу', 'здять', 'жджений'],
    ['б', 'блю', 'блять', 'блений'], ['п', 'плю', 'плять', 'плений'], ['в', 'влю', 'влять', 'влений'], ['м', 'млю', 'млять', 'млений'],
    ['ф', 'флю', 'флять', 'флений'], ['ц', 'цю', 'цять', 'цений'],
];
for (const [c, first, third, participle] of SECOND) {
    for (const inf of ['ити', 'іти']) {
        const opt = {};
        verb('prs1sg', first, c + inf, opt, 'std', c === 'д' && inf === 'ити' ? 'ходжу → ходити' : undefined);
        verb('prs3pl', third, c + inf, opt, 'std');
        const adverbial = third.replace(/ать$/u, 'ачи').replace(/ять$/u, 'ячи');
        verb('advPrs', adverbial, c + inf, opt, 'adv');
        suffix('v.ptcpAct', adverbial + 'й', c + inf, ['adj'], ['v'], opt);
        if (inf === 'ити') {
            suffix('v.ptcpPass', participle, c + inf, ['adj'], ['v'], opt);
            suffix('v.impers', participle.replace(/ий$/u, 'о'), c + inf, [], ['v'], opt);
        }
    }
}
for (const inf of ['ити', 'іти']) {
    verb('prs2sg', 'иш', inf, {stemMinLength: 2}, 'std', inf === 'ити' ? 'говориш → говорити' : undefined);
    verb('prs3sg', 'ить', inf, {stemMinLength: 2}, 'std');
    verb('prs1pl', 'имо', inf, {stemMinLength: 2}, 'std');
    verb('prs1pl', 'им', inf, {stemMinLength: 2}, 'cons');
    verb('prs2pl', 'ите', inf, {stemMinLength: 2}, 'std');
    verb('imp2sg', 'и', inf, {stemEndsWith: C}, 'std', inf === 'ити' ? 'говори → говорити' : undefined);
    verb('imp1pl', 'імо', inf, {stemEndsWith: C}, 'std');
    verb('imp1pl', 'ім', inf, {stemEndsWith: C, stemMinLength: 2}, 'cons');
    verb('imp2pl', 'іть', inf, {stemEndsWith: C}, 'std');
    verb('imp2pl', 'іте', inf, {stemEndsWith: C}, 'std');
}
// -їти after a vowel (клеїти, гоїти, доїти, занепокоїти): клей, загой.
verb('imp2sg', 'ей', 'еїти', {stemMinLength: 2}, 'adv', 'клей → клеїти');
verb('imp2sg', 'ой', 'оїти', {stemMinLength: 2}, 'adv', 'загой → загоїти');
verb('imp2pl', 'ейте', 'еїти', {stemMinLength: 2}, 'adv');
verb('imp2pl', 'ойте', 'оїти', {stemMinLength: 2}, 'adv');
suffix('v.ptcpPass', 'єний', 'їти', ['adj'], ['v'], {stemEndsWith: '[ео]'});
suffix('v.impers', 'єно', 'їти', [], ['v'], {stemEndsWith: '[ео]'});
for (const [ending, id] of [['ю', 'prs1sg'], ['їш', 'prs2sg'], ['їть', 'prs3sg'], ['їмо', 'prs1pl'], ['їте', 'prs2pl'], ['ять', 'prs3pl']]) {
    verb(id, ending, 'їти', {stemEndsWith: '[еоа]', stemMinLength: 2}, 'std', ending === 'ю' ? 'клею → клеїти' : undefined);
}
// Second conjugation -ати after ж, ч, щ (лежати, кричати, пищати). No verb
// of the class ends its stem in ш, so the consonant is written in the
// ending. -жчу, -жчим and -жчім are also forms of comparative adjectives
// (дорожчу, дорожчим, дорожчім), so those three endings exclude a ж before
// ч; the others reach the few verbs in -жчати (бряжчить, дзижчать), which
// no adjective form spells.
const COMPARATIVE_ENDINGS = new Set(['у', 'им', 'ім']);
for (const x of ['ж', 'ч', 'щ']) {
    const opt = {stemMinLength: 1};
    for (const [ending, id] of [['у', 'prs1sg'], ['иш', 'prs2sg'], ['ить', 'prs3sg'], ['имо', 'prs1pl'], ['им', 'prs1pl'], ['ите', 'prs2pl'], ['ать', 'prs3pl'],
        ['и', 'imp2sg'], ['імо', 'imp1pl'], ['ім', 'imp1pl'], ['іть', 'imp2pl']]) {
        const own = x === 'ч' && COMPARATIVE_ENDINGS.has(ending) ? {...opt, stemNotEndsWith: '[ж]'} : opt;
        verb(id, x + ending, x + 'ати', own, ending === 'им' || ending === 'ім' ? 'cons' : 'std', x === 'ж' && ending === 'у' ? 'лежу → лежати' : undefined);
    }
    verb('advPrs', x + 'ачи', x + 'ати', opt, 'adv');
    suffix('v.ptcpAct', x + 'ачий', x + 'ати', ['adj'], ['v'], opt);
}
// Past active participles in -лий (почервонілий, минулий, гнилий, зниклий).
for (const [inflected, deinflected, opt, example] of [['ілий', 'іти', {stemMinLength: 2}, 'почервонілий → почервоніти'],
    ['улий', 'ути', {stemMinLength: 1}, 'минулий → минути'], ['илий', 'ити', {stemMinLength: 2}, 'гнилий → гнити'],
    ['алий', 'ати', {stemMinLength: 2}, 'посталий → постати'], ['ерлий', 'ерти', {stemMinLength: 1}, 'вимерлий → вимерти'],
    ['ослий', 'ости', {stemMinLength: 1}, 'вирослий → вирости'],
    ['лий', 'нути', {stemEndsWith: '[кгхзсбп]', stemMinLength: 2}, 'зниклий → зникнути']]) {
    suffix('v.ptcpAct', inflected, deinflected, ['adj'], ['v'], opt, example);
}
// стояти, боятися.
conjugation({inf: 'ояти', prs: ['ою', 'оїш', 'оїть', 'оїмо', 'оїм', 'оїте', 'оять'], imp: {'2sg': ['ій'], '1pl': ['іймо'], '2pl': ['ійте']}, opt: {stemEndsWith: '[тб]'}, label: ['стою', 'стояти']});
// The imperative without an ending of second-conjugation verbs stressed on
// the stem (бач, вибач, вір, перевір, став, постав, відправ, залиш, дозволь,
// почисть, знайом-ся), and the plural of every such imperative: -те, -мо
// after the consonant (бачте, вірте, залиште), -ьте, -ьмо after a soft one
// (дозвольте, сядьте).
for (const [form, lemma] of [['бач', 'бачити'], ['вір', 'вірити'], ['став', 'ставити'], ['прав', 'правити'], ['лиш', 'лишити'],
    ['воль', 'волити'], ['чисть', 'чистити'], ['муч', 'мучити'], ['знайом', 'знайомити'], ['кинь', 'кинути'], ['глянь', 'глянути']]) {
    verb('imp2sg', form, lemma, {stemMinLength: 0}, 'cons', form === 'бач' ? 'вибач → вибачити' : undefined);
}
suffix('v.imp2sg', '', 'ити', [], ['v'], {stemEndsWith: '[жчшщбпвмф]', stemMinLength: 4}, 'познач → позначити');
for (const particle of ['ся', 'сь']) {
    for (const consonant of 'жчшщбпвмф') {
        suffix('v.imp2sg', consonant + particle, consonant + 'итися', [], ['v'], {stemMinLength: 3});
    }
}
verb('imp2sg', 'ь', 'ити', {stemEndsWith: '[лнтдзсц]', stemMinLength: 2}, 'adv', 'дозволь → дозволити');
for (const consonant of 'бвжлмнпрчшщ') {
    verb('imp2pl', consonant + 'те', consonant + 'ити', {}, 'std', consonant === 'ч' ? 'вибачте → вибачити' : undefined);
    verb('imp1pl', consonant + 'мо', consonant + 'ити', {}, 'std');
}
for (const consonant of 'лнтдзсц') {
    verb('imp2pl', consonant + 'ьте', consonant + 'ити', {}, 'std', consonant === 'л' ? 'дозвольте → дозволити' : undefined);
    verb('imp1pl', consonant + 'ьмо', consonant + 'ити', {}, 'std');
}

// ---------------------------------------------------------------------------
// Frequent homographs. When a word is a form of two lemmas, the rules reach
// both with one step, and the dictionary names both, the lookup puts first
// the term it found first (docs/languages.md 9.6). A whole-word rule is found
// before every suffix rule, so these words get the lemma a reader usually
// means first: року is рік before рок, голові голова before гол, погані
// поганий before погань. The words are those of sources/homographs.tsv
// (frequent words whose rows name two or more lemmas) whose first result was
// another lemma; the other lemma stays in the list, one place lower.
const HOMOGRAPHS = {
    'noun.gen.sg+dat.sg+loc.sg+voc.sg': [['зросту', 'зріст'], ['року', 'рік'], ['приводу', 'привід'], ['нападу', 'напад'], ['туалету', 'туалет'],
        ['пилу', 'пил'], ['сміху', 'сміх']],
    'noun.ins.sg': [['чаєм', 'чай'], ['літом', 'літо'], ['роком', 'рік']],
    'noun.gen.sg+nom.pl': [['перерви', 'перерва'], ['правила', 'правило'], ['пекла', 'пекло'], ['мети', 'мета'], ['крила', 'крило'], ['діла', 'діло'],
        ['стріли', 'стріла']],
    'noun.dat.sg+loc.sg': [['голові', 'голова']],
    'noun.gen.sg+dat.sg+voc.sg': [['чаю', 'чай'], ['краю', 'край']],
    'noun.acc.sg': [['мету', 'мета'], ['душу', 'душа'], ['перерву', 'перерва']],
    'noun.gen.pl': [['сіл', 'село'], ['прав', 'право'], ['миль', 'миля'], ['ліків', 'ліки']],
    'noun.loc.sg+nom.pl': [['мирі', 'мир'], ['німці', 'німець'], ['американці', 'американець']],
    'noun.dat.sg+acc.sg': [['милю', 'миля'], ['волю', 'воля'], ['статтю', 'стаття']],
    'noun.loc.sg': [['тесті', 'тест'], ['ході', 'хід'], ['залі', 'зал'], ['селі', 'село'], ['туалеті', 'туалет'], ['роті', 'рот']],
    'noun.loc.pl': [['трупах', 'труп'], ['ролях', 'роль']],
    'noun.nom.pl': [['приводи', 'привід'], ['туалети', 'туалет'], ['вози', 'віз'], ['вічі', 'око'], ['напади', 'напад'], ['трупи', 'труп']],
    'noun.dat.pl': [['трупам', 'труп'], ['волам', 'віл'], ['копам', 'коп']],
    'noun.dat.sg+loc.sg+voc.sg': [['колу', 'коло']],
    'noun.dat.sg': [['морю', 'море']],
    'noun.gen.sg': [['вола', 'віл'], ['діда', 'дід']],
    'noun.ins.pl': [['трупами', 'труп'], ['ліками', 'ліки'], ['волами', 'віл']],
    'noun.gen.sg+dat.sg+loc.sg+nom.pl': [['бурі', 'буря']],
    'adj.pl': [['політичні', 'політичний'], ['гнилі', 'гнилий'], ['складні', 'складний'], ['ситі', 'ситий'], ['босі', 'босий'], ['лісові', 'лісовий'],
        ['люті', 'лютий'], ['рідні', 'рідний'], ['ранні', 'ранній'], ['готові', 'готовий'], ['погані', 'поганий'], ['різні', 'різний'],
        ['раді', 'радий'], ['добрі', 'добрий'], ['чудові', 'чудовий'], ['праві', 'правий'], ['білі', 'білий'], ['військові', 'військовий'],
        ['божевільні', 'божевільний'], ['дорослі', 'дорослий'], ['хворі', 'хворий'], ['золоті', 'золотий'], ['зелені', 'зелений'],
        ['повні', 'повний'], ['сірі', 'сірий'], ['голі', 'голий'], ['сині', 'синій'], ['теплі', 'теплий'], ['грубі', 'грубий'],
        ['здорові', 'здоровий']],
    'adj.n': [['різне', 'різний'], ['молоде', 'молодий'], ['зелене', 'зелений'], ['рідне', 'рідний'], ['складне', 'складний'], ['голе', 'голий'],
        ['погане', 'поганий'], ['ціле', 'цілий'], ['повне', 'повний'], ['біле', 'білий'], ['дурне', 'дурний']],
    'adj.acc.f': [['політичну', 'політичний'], ['голу', 'голий'], ['золоту', 'золотий'], ['молоду', 'молодий'], ['ворожу', 'ворожий'],
        ['довгу', 'довгий'], ['грубу', 'грубий'], ['сіру', 'сірий'], ['солодку', 'солодкий'], ['добру', 'добрий'], ['білу', 'білий']],
    'adj.ins.f': [['молодою', 'молодий'], ['грубою', 'грубий'], ['солодкою', 'солодкий'], ['політичною', 'політичний']],
    'adj.f': [['сита', 'ситий']],
    'v.imp2sg': [['пали', 'палити'], ['буди', 'будити'], ['плати', 'платити'], ['говори', 'говорити'], ['поговори', 'поговорити'], ['ходи', 'ходити'],
        ['лови', 'ловити']],
    'v.pstM': [['перестав', 'перестати'], ['білів', 'біліти'], ['стався', 'статися'], ['встав', 'встати'], ['розумів', 'розуміти']],
    // видимо (apparently) is the adverb of видимий, as wiktionary-to-yomitan
    // files it, and the 1st person plural of the archaic видіти.
    'adv.pos': [['видимо', 'видимий']],
    // од is the older form of від (Kotsiubynsky writes it 430 times), and
    // the genitive plural of ода.
    'alt.od': [['од', 'від']],
};
transform('adv.pos', 'adverb', 'An adverb in -о that the dictionary files under its adjective: видимо (видимий).');
transform('alt.od', 'older form (од)', 'The older and dialect form од of the preposition від: од хати (від хати).');
for (const [id, pairs] of Object.entries(HOMOGRAPHS)) {
    for (const [form, lemma] of pairs) {
        // No example: a transform's description shows its regular endings.
        if (id.startsWith('noun.')) {
            noun(form, lemma, id.slice('noun.'.length).split('+'), {whole: true});
        } else {
            whole(id, form, lemma, [], id.startsWith('adj.') ? ADJ_OUT : id.startsWith('v.') ? ['v'] : id.startsWith('adv.') ? ['adj'] : [], null);
        }
    }
}

// ---------------------------------------------------------------------------
// Noun transforms, now that every declension has added its rules. A rule
// whose ending is one letter needs two letters of stem: the words of two
// letters are function words (на, но, ті, ця), so на is not the vocative of
// но, nor ть the genitive of ті. Rules that list their stem (сну, пса,
// матері) keep their own minimum.
const nounIds = new Map();
for (const entry of nominal.values()) {
    if ([...entry.inflected].length === 1 && !entry.opt.whole && (entry.opt.stemMinLength ?? 1) < 2) {
        entry.opt = {...entry.opt, stemMinLength: 2};
    }
    const labels = CASE_ORDER.filter((c) => entry.labels.has(c));
    const id = `noun.${labels.join('+')}`;
    if (!nounIds.has(id)) {
        nounIds.set(id, caseName(labels));
        transform(id, caseName(labels), '');
    }
    if (entry.opt.whole) {
        add(id, {type: 'wholeWord', inflected: entry.inflected, deinflected: entry.deinflected, conditionsIn: [], conditionsOut: entry.pos}, entry.examples[0]);
    } else {
        suffix(id, entry.inflected, entry.deinflected, [], entry.pos, entry.opt, entry.examples[0]);
    }
}

// ---------------------------------------------------------------------------
// Output: nouns, adjectives and pronouns, numerals, then verbs.
const order = [...transforms.keys()].sort((a, b) => {
    const rank = (id) => (id.startsWith('noun.') ? 0 : id.startsWith('adj.') ? 1 : id.startsWith('adv.') ? 2 : id.startsWith('pron.') ? 3 : id.startsWith('num.') ? 4 : 5);
    return rank(a) - rank(b);
});
// Suffix rules of one transform with the same conditions and stem
// constraints are written as one cross-product circumfix with an empty
// prefix (docs/languages.md 7.3), which stands for the same suffix rules and
// keeps sources/ and tests/classes.json small (section 3).
function compact(rules) {
    const groups = new Map();
    const out = [];
    for (const rule of rules) {
        if (rule.type === 'wholeWord') {
            // A whole word is the empty-prefix cross product whose stem is
            // empty (stemCharacters []): the same rule, one pair in a list.
            const {type: _type, inflected, deinflected, ...rest} = rule;
            const key = JSON.stringify(['wholeWord', Object.keys(rest).sort().map((k) => [k, rest[k]])]);
            if (!groups.has(key)) {
                const group = {type: 'circumfix', prefixes: [['', '']], suffixes: [], ...rest, stemCharacters: '[]'};
                groups.set(key, group);
                out.push(group);
            }
            groups.get(key).suffixes.push([inflected, deinflected]);
            continue;
        }
        if (rule.type !== 'suffix' || rule.inflected === '') { out.push(rule); continue; }
        const {inflected, deinflected, type: _type, ...rest} = rule;
        const key = JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
        if (!groups.has(key)) {
            const group = {type: 'circumfix', prefixes: [['', '']], suffixes: [], ...rest};
            groups.set(key, group);
            out.push(group);
        }
        groups.get(key).suffixes.push([inflected, deinflected]);
    }
    return out.map((rule) => {
        if (rule.type === 'circumfix' && rule.stemCharacters === '[]' && rule.suffixes?.length === 1 && rule.prefixes?.length === 1 && rule.prefixes[0][0] === '') {
            const {type: _t, prefixes: _p, suffixes: [[inflected, deinflected]], stemCharacters: _s, ...rest} = rule;
            return {type: 'wholeWord', inflected, deinflected, ...rest};
        }
        if (rule.type !== 'circumfix' || rule.suffixes === undefined || rule.suffixes.length > 1
            || rule.prefixes.length !== 1 || rule.prefixes[0][0] !== '' || rule.prefixes[0][1] !== '') { return rule; }
        const {prefixes: _p, suffixes: [[inflected, deinflected]], type: _type, ...rest} = rule;
        return {type: 'suffix', inflected, deinflected, ...rest};
    });
}

const out = {schema: 1, conditions, transforms: []};
for (const id of order) {
    const t = transforms.get(id);
    if (t.rules.length === 0) { continue; }
    let description = t.description;
    if (id.startsWith('noun.')) {
        const examples = t.examples.length > 0 ? `: ${t.examples.join(', ')}` : '';
        description = `The ${t.name} of a noun${examples}.`;
    }
    out.transforms.push({id: t.id, name: t.name, description, source: 'own', rules: compact(t.rules)});
}
// The affix pairs of a cross product are written without spaces
// (["зі","га"]), which keeps sources/ and tests/ under 1 MB
// (docs/languages.md, section 3); everything else is formatted as
// tools/lib/json.mjs formats pack files.
function compactPairs(text) {
    return text.replace(/("(?:prefixes|suffixes)": )(\[\[.*?\]\])(?=[,}])/gu,
        (_, key, pairs) => key + pairs.replaceAll('", "', '","').replaceAll('], [', '],['));
}
writeFileSync(outFile, compactPairs(formatTransforms(out)));
const expanded = (rule) => (rule.type === 'circumfix' && rule.suffixes ? rule.prefixes.length * rule.suffixes.length : 1);
const ruleCount = out.transforms.reduce((n, t) => n + t.rules.reduce((m, r) => m + expanded(r), 0), 0);
const lineCount = out.transforms.reduce((n, t) => n + t.rules.length, 0);
console.error(`${outFile}: ${out.transforms.length} transforms, ${ruleCount} rules in ${lineCount} JSON rules`);
