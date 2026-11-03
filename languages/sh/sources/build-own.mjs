#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/sh/sources/own.json: the Serbo-Croatian deinflection rules
// written for this pack (docs/languages.md, section 14 step 2). Run from the
// repository root:
//
//   node languages/sh/sources/build-own.mjs [--transforms] [--examples <file>] [--cases <file>]
//
// --transforms also writes transforms.json, a copy of own.json with every
// rule marked `own`, which is what the first commit of the pack uses.
//
// The rules follow the standard description of Serbo-Croatian inflection
// (the grammars of Barić et al., Hrvatska gramatika; Stanojčić and Popović,
// Gramatika srpskoga jezika; Browne, A Handbook of Bosnian, Serbian and
// Croatian; Wiktionary's Serbo-Croatian declension and conjugation tables):
//
// - nouns of the a-declension (masculine on a consonant, neuter on -o/-e,
//   with the long plural -ovi/-evi, sibilarisation k/g/h → c/z/s before -i,
//   the vocative -e/-u with palatalisation k/g/h → č/ž/š, the fleeting a of
//   starac/starca, momak/momka, san/sna, the vocalised l of posao/posla and
//   čitalac/čitaoca, the extended neuters ime/imena, dugme/dugmeta and the
//   collectives pilad and telad), the e-declension (žena, sluga; dative
//   ruci, nozi, snasi; genitive plural djevojaka, sestara) and the
//   i-declension (stvar, noć, radost; instrumental radošću, smrću, noću);
// - adjectives, indefinite (nov, dobar) and definite (novi, srpski), with the
//   palatal -eg/-em endings, the fleeting a, comparatives (-iji and the
//   jotated -ji: brži, mlađi, ljepši) and superlatives (naj-);
// - verbs: the present of the a-, i- and e-types with their consonant
//   changes (pišem, kažem, plačem, krećem, kupujem, dajem, pijem, krenem,
//   uzmem, berem, zovem; consonant stems pečem, mogu, dođem, jedem), the
//   l-participle (radio, vidjela, rekao, došao, umro), the passive
//   participle with jotation (rađen, kupljen, plaćen, pušten), the
//   aorist, the imperfect, the imperative, the adverbial participles, the
//   future (Serbian radiću, Croatian radit ću), and the verbal noun;
// - the irregular forms of biti, htjeti, moći, ići, the personal,
//   demonstrative and interrogative pronouns, and the numerals dva, tri,
//   četiri and oba.
//
// Ekavian and ijekavian: verb rules with -jeti (ijekavian) also have -eti
// (ekavian), so vidim gives vidjeti and videti. Cyrillic: the rules are
// written in Gaj's Latin alphabet; the cyrillicToLatin preprocessor gives
// every Cyrillic text its Latin spelling, which they read (кућама → kuća).
// wiktionary-to-yomitan also lists the Cyrillic forms themselves, whose
// form-of rows name the Cyrillic lemma (кућама → кућа). toCyrillic below
// writes the Cyrillic example of each rule.
//
// Conditions: each rule's output has the part of speech of the dictionary
// form it gives (v, n, adj, pron), and the rules that read a form another
// rule gives say so (a declined comparative: novijeg → noviji → nov; a
// passive participle: pisanog → pisan → pisati; a verbal noun: pitanja →
// pitanje → pitati). wiktionary-to-yomitan writes no `rules` column for
// Serbo-Croatian (wty-sh-en 2026.10.22: all 987,099 rows empty), so with
// Yomitan's filter a deinflection with conditions finds no term of it
// (section 9.4); the pack's lookup.untaggedTerms lets untagged terms pass.
//
// No suffix rule's stem contains a space (`stemCharacters: {stem}`, every
// character but the space; {lowerStem} also leaves out capitals), so no rule
// reads a phrase as one word (section 14 step 2: "count the space in stem
// constraints"); short endings need a stem of two letters or more.

import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ClassSet} from '../../../tools/lib/classes.mjs';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pack = dirname(here);

// --- Script -----------------------------------------------------------------

const LATIN_TO_CYRILLIC = [
    ['dž', 'џ'], ['lj', 'љ'], ['nj', 'њ'],
    ['a', 'а'], ['b', 'б'], ['c', 'ц'], ['č', 'ч'], ['ć', 'ћ'], ['d', 'д'], ['đ', 'ђ'], ['e', 'е'],
    ['f', 'ф'], ['g', 'г'], ['h', 'х'], ['i', 'и'], ['j', 'ј'], ['k', 'к'], ['l', 'л'], ['m', 'м'],
    ['n', 'н'], ['o', 'о'], ['p', 'п'], ['r', 'р'], ['s', 'с'], ['š', 'ш'], ['t', 'т'], ['u', 'у'],
    ['v', 'в'], ['z', 'з'], ['ž', 'ж'],
    ['Dž', 'Џ'], ['Lj', 'Љ'], ['Nj', 'Њ'],
    ['A', 'А'], ['B', 'Б'], ['C', 'Ц'], ['Č', 'Ч'], ['Ć', 'Ћ'], ['D', 'Д'], ['Đ', 'Ђ'], ['E', 'Е'],
    ['F', 'Ф'], ['G', 'Г'], ['H', 'Х'], ['I', 'И'], ['J', 'Ј'], ['K', 'К'], ['L', 'Л'], ['M', 'М'],
    ['N', 'Н'], ['O', 'О'], ['P', 'П'], ['R', 'Р'], ['S', 'С'], ['Š', 'Ш'], ['T', 'Т'], ['U', 'У'],
    ['V', 'В'], ['Z', 'З'], ['Ž', 'Ж'],
];

/** Serbian Cyrillic spelling of a Latin affix, word or literal class (digraphs first). */
export function toCyrillic(text) {
    let out = '';
    for (let i = 0; i < text.length;) {
        const pair = LATIN_TO_CYRILLIC.find(([lat]) => text.startsWith(lat, i));
        if (pair === undefined) {
            out += text[i];
            i += 1;
        } else {
            out += pair[1];
            i += pair[0].length;
        }
    }
    return out;
}

// --- Rule specs -------------------------------------------------------------
// A spec is one deinflection with the forms it reads (`tags`, shown as the
// transform's name) and examples (inflected form → lemma) that become test
// rows. Specs with the same rule are merged, so a rule exists once and its
// transform names every form it reads; specs with the same set of forms
// share a transform.

const C = '{consonant}';
const PAL = '{palatal}';
const V = '{stemVowel}';

/** @type {any[]} */
const specs = [];

/**
 * A suffix rule: `inflected` at the end of the text becomes `deinflected`.
 * opts: min (stemMinLength, default 2), end (stemEndsWith), notEnd
 * (stemNotEndsWith), startText / notStartText, change (stemChange),
 * in / out (conditions), group (the transform group, for its order).
 */
function sfx(group, inflected, deinflected, tags, examples, opts = {}) {
    specs.push({group, type: 'suffix', inflected, deinflected, tags, examples, opts});
}

function whole(group, inflected, deinflected, tags, examples = [[inflected, deinflected]], opts = {}) {
    specs.push({group, type: 'wholeWord', inflected, deinflected, tags, examples, opts});
}

function prefix(group, inflected, deinflected, tags, examples, opts = {}) {
    specs.push({group, type: 'prefix', inflected, deinflected, tags, examples, opts});
}

// A pattern rule anchored on a suffix: fields {pattern, replacement, anchorSuffix}.
function pattern(group, fields, tags, examples) {
    specs.push({group, type: 'pattern', fields, tags, examples, opts: {}});
}

// ===== Nouns ================================================================
// Masculine nouns on a consonant (grad, prozor, brat, muž, prijatelj): the
// lemma is the stem, of three letters or more (wty-sh-en's eighteen
// masculine nouns of two letters, such as um and ud, have form-of rows for
// their forms): opa is not op, Nju not Nj.

sfx('noun', 'a', '', ['gen. sg.', 'gen. pl.', 'acc. sg. (animate)'],
    [['grada', 'grad'], ['brata', 'brat'], ['prozora', 'prozor'], ['studenta', 'student']], {end: C, min: 3});
sfx('noun', 'u', '', ['dat./loc. sg.', 'voc. sg.'], [['gradu', 'grad'], ['prijatelju', 'prijatelj']], {end: C, min: 3});
sfx('noun', 'om', '', ['ins. sg.'], [['gradom', 'grad'], ['bratom', 'brat']], {end: C, min: 3});
sfx('noun', 'em', '', ['ins. sg.'], [['mužem', 'muž'], ['prijateljem', 'prijatelj'], ['krajem', 'kraj'], ['stricem', 'stric'], ['carem', 'car']], {end: '{palatalOrR}', min: 3});
sfx('noun', 'e', '', ['acc. pl.', 'voc. sg.'], [['prozore', 'prozor'], ['brate', 'brat'], ['studente', 'student']], {end: C, min: 3});
sfx('noun', 'i', '', ['nom./voc. pl.'], [['prozori', 'prozor'], ['studenti', 'student']], {end: C, min: 3});
sfx('noun', 'ima', '', ['dat./loc./ins. pl.'], [['prozorima', 'prozor'], ['studentima', 'student']], {end: C, min: 3});
// Long plural of (mostly monosyllabic) nouns: gradovi, muževi.
for (const [ending, tags] of [['ovi', ['nom./voc. pl.']], ['ova', ['gen. pl.']], ['ovima', ['dat./loc./ins. pl.']], ['ove', ['acc. pl.']]]) {
    sfx('noun', ending, '', tags, [[`grad${ending}`, 'grad'], [`sin${ending}`, 'sin']], {end: C, min: 3});
    sfx('noun', ending.replace('o', 'e'), '', tags, [[`muž${ending.replace('o', 'e')}`, 'muž'], [`kralj${ending.replace('o', 'e')}`, 'kralj']], {end: PAL, min: 3});
    // c becomes č before -ev-: stric → stričevi, zec → zečevi.
    sfx('noun', `č${ending.replace('o', 'e')}`, 'c', tags, [[`strič${ending.replace('o', 'e')}`, 'stric']], {min: 1});
    // Ijekavian je of the plural comes from the lemma's ije: cvijet → cvjetovi.
    sfx('noun', ending, '', tags, [[`cvjet${ending}`, 'cvijet'], [`snjeg${ending}`, 'snijeg']],
        {end: C, change: {from: ['je'], to: 'ije', occurrence: 'last', between: C}});
}
sfx('noun', 'iju', '', ['gen. pl.'], [['prstiju', 'prst'], ['gostiju', 'gost'], ['kostiju', 'kost']], {end: C, min: 3});
// Sibilarisation before -i: vojnik → vojnici, bubreg → bubrezi, orah → orasi.
for (const [form, lemma, examples] of [
    ['c', 'k', [['vojnici', 'vojnik'], ['junaci', 'junak'], ['vojnicima', 'vojnik']]],
    ['z', 'g', [['bubrezi', 'bubreg'], ['psiholozi', 'psiholog'], ['psiholozima', 'psiholog']]],
    ['s', 'h', [['orasi', 'orah'], ['siromasi', 'siromah'], ['orasima', 'orah']]],
]) {
    sfx('noun', `${form}i`, lemma, ['nom./voc. pl.'], examples.filter(([f]) => f.endsWith(`${form}i`)));
    sfx('noun', `${form}ima`, lemma, ['dat./loc./ins. pl.'], examples.filter(([f]) => f.endsWith(`${form}ima`)));
}
// Vocative with k/g/h → č/ž/š and c → č: junače, bože, duše, striče.
sfx('noun', 'če', 'k', ['voc. sg.'], [['junače', 'junak'], ['vojniče', 'vojnik'], ['čovječe', 'čovjek']]);
sfx('noun', 'že', 'g', ['voc. sg.'], [['bože', 'bog'], ['druže', 'drug']]);
sfx('noun', 'še', 'h', ['voc. sg.'], [['siromaše', 'siromah']]);
sfx('noun', 'če', 'c', ['voc. sg.'], [['striče', 'stric'], ['zeče', 'zec']]);

// Fleeting a: the a of the lemma's last syllable drops before an ending
// (starac → starca, momak → momka, san → sna, vjetar → vjetra, lakat →
// lakta, pojam → pojma, pas → psa) and stays in the genitive plural
// (staraca, momaka, which the genitive rule above reads). The stem before
// the dropped a ends in a consonant.
const NOUN_ENDINGS = [
    ['a', ['gen. sg.', 'acc. sg. (animate)']], ['u', ['dat./loc. sg.']], ['om', ['ins. sg.']],
    ['e', ['acc. pl.']], ['i', ['nom./voc. pl.']], ['ima', ['dat./loc./ins. pl.']],
];
// examples: [stem before the dropped a, lemma, endings the example has
// (default: every one)].
function fleeting(lemmaTail, formTail, examples, {min = 1, endings = NOUN_ENDINGS, long = false, extra = []} = {}) {
    const exampleFor = (ending) => examples.filter(([, , only]) => only === undefined || only.includes(ending))
        .map(([stem, lemma]) => [`${stem}${formTail}${ending}`, lemma]);
    for (const [ending, tags] of endings) {
        sfx('noun', `${formTail}${ending}`, lemmaTail, tags, exampleFor(ending), {end: C, min});
    }
    if (long) {
        for (const [ending, tags] of [['ovi', ['nom./voc. pl.']], ['ova', ['gen. pl.']], ['ovima', ['dat./loc./ins. pl.']], ['ove', ['acc. pl.']]]) {
            sfx('noun', `${formTail}${ending}`, lemmaTail, tags, exampleFor(ending), {end: C, min});
        }
    }
    for (const [inflected, tags, ex] of extra) { sfx('noun', inflected, lemmaTail, tags, ex, {end: C, min}); }
}
const SG = ['a', 'u', 'om', 'em'];
fleeting('ac', 'c', [['star', 'starac'], ['kup', 'kupac'], ['lov', 'lovac']], {
    min: 2,
    endings: NOUN_ENDINGS.filter(([e]) => e !== 'om'),
    extra: [['cem', ['ins. sg.'], [['starcem', 'starac'], ['kupcem', 'kupac']]], ['če', ['voc. sg.'], [['starče', 'starac'], ['lovče', 'lovac']]]],
});
fleeting('ak', 'k', [['mom', 'momak'], ['pet', 'petak', SG], ['počet', 'početak']], {
    min: 2,
    endings: NOUN_ENDINGS.filter(([e]) => e !== 'i' && e !== 'ima'),
    extra: [['ci', ['nom./voc. pl.'], [['momci', 'momak'], ['početci', 'početak']]], ['cima', ['dat./loc./ins. pl.'], [['momcima', 'momak']]],
        ['če', ['voc. sg.'], [['momče', 'momak']]]],
});
// -tak loses its t before c: početak → počeci, zadatak → zadaci.
sfx('noun', 'ci', 'tak', ['nom./voc. pl.'], [['počeci', 'početak'], ['zadaci', 'zadatak'], ['ostaci', 'ostatak']], {end: V});
sfx('noun', 'cima', 'tak', ['dat./loc./ins. pl.'], [['počecima', 'početak'], ['zadacima', 'zadatak']], {end: V});
fleeting('an', 'n', [['s', 'san', SG], ['ov', 'ovan', SG]], {long: true});
fleeting('anj', 'nj', [['bub', 'bubanj']], {endings: NOUN_ENDINGS.map(([e, t]) => [e === 'om' ? 'em' : e, t])});
fleeting('am', 'm', [['poj', 'pojam', SG], ['saj', 'sajam', SG]], {min: 2, long: true});
fleeting('at', 't', [['lak', 'lakat']], {min: 2});
fleeting('ar', 'r', [['vjet', 'vjetar', SG], ['Pet', 'Petar', SG]], {min: 2, long: true});
fleeting('as', 's', [['p', 'pas']]);
fleeting('ao', 'l', [['pos', 'posao', SG], ['ug', 'ugao', SG], ['Pav', 'Pavao', SG]], {long: true});
fleeting('eo', 'el', [['pep', 'pepeo']], {endings: NOUN_ENDINGS.filter(([e]) => e === 'a' || e === 'u' || e === 'om')});
// The l of -lac becomes o before the ending: čitalac → čitaoca.
for (const [ending, tags] of [...NOUN_ENDINGS.filter(([e]) => e !== 'om'), ['em', ['ins. sg.']], ['e', ['voc. sg.']]]) {
    sfx('noun', `oc${ending}`, 'lac', tags, [[`čitaoc${ending}`, 'čitalac'], [`gledaoc${ending}`, 'gledalac']], {min: 2});
}
// Voicing before the dropped a: vrabac → vrapca, dolazak → dolaska,
// napredak → napretka.
for (const [ending, tags] of NOUN_ENDINGS.filter(([e]) => e !== 'om' && e !== 'i' && e !== 'ima')) {
    sfx('noun', `pc${ending}`, 'bac', tags, [[`vrapc${ending}`, 'vrabac']], {min: 2});
    sfx('noun', `sk${ending}`, 'zak', tags, [[`dolask${ending}`, 'dolazak'], [`izlask${ending}`, 'izlazak']], {min: 2});
    sfx('noun', `tk${ending}`, 'dak', tags, [[`napretk${ending}`, 'napredak']], {min: 2});
}
sfx('noun', 'skom', 'zak', ['ins. sg.'], [['dolaskom', 'dolazak']], {min: 2});
sfx('noun', 'sci', 'zak', ['nom./voc. pl.'], [['dolasci', 'dolazak']], {min: 2});
sfx('noun', 'tkom', 'dak', ['ins. sg.'], [['napretkom', 'napredak']], {min: 2});
sfx('noun', 'pcem', 'bac', ['ins. sg.'], [['vrapcem', 'vrabac']], {min: 2});
sfx('noun', 'pci', 'bac', ['nom./voc. pl.'], [['vrapci', 'vrabac']], {min: 2});

// Nouns in -anin lose -in in the plural: građanin → građani.
for (const [ending, tags] of [['i', ['nom./voc. pl.']], ['a', ['gen. pl.']], ['ima', ['dat./loc./ins. pl.']], ['e', ['acc. pl.']]]) {
    sfx('noun', `an${ending}`, 'anin', tags, [[`građan${ending}`, 'građanin'], [`seljan${ending}`, 'seljanin']]);
}

// Feminine nouns on -a (žena, kuća, knjiga) and masculine ones (sluga).
sfx('noun', 'e', 'a', ['gen. sg.', 'nom./acc./voc. pl.'], [['žene', 'žena'], ['kuće', 'kuća'], ['knjige', 'knjiga'], ['sluge', 'sluga']], {end: C});
sfx('noun', 'i', 'a', ['dat./loc. sg.', 'gen. pl.'], [['ženi', 'žena'], ['kući', 'kuća'], ['majki', 'majka']], {end: C});
sfx('noun', 'u', 'a', ['acc. sg.', 'gen. pl.'], [['ženu', 'žena'], ['kuću', 'kuća'], ['ruku', 'ruka']], {end: C});
// Not on a capitalised word: the sentence-initial Dobro, Mirno and Nadamo
// are not vocatives of the names Dobra, Mirna and Nada, which then rank
// first because the text as written needs no processor step (the lower-case
// variant reads them as dobro, mirno, nadati). Vocatives of names (Marijo)
// are lost with it.
sfx('noun', 'o', 'a', ['voc. sg.'], [['ženo', 'žena'], ['sestro', 'sestra']], {end: C, lower: true});
sfx('noun', 'om', 'a', ['ins. sg.'], [['ženom', 'žena'], ['kućom', 'kuća']], {end: C});
sfx('noun', 'ama', 'a', ['dat./loc./ins. pl.'], [['ženama', 'žena'], ['kućama', 'kuća']], {end: C});
// Dative and locative with k/g/h → c/z/s: ruka → ruci, noga → nozi.
sfx('noun', 'ci', 'ka', ['dat./loc. sg.'], [['ruci', 'ruka'], ['majci', 'majka'], ['Americi', 'Amerika']]);
sfx('noun', 'zi', 'ga', ['dat./loc. sg.'], [['nozi', 'noga'], ['knjizi', 'knjiga'], ['sluzi', 'sluga']]);
sfx('noun', 'si', 'ha', ['dat./loc. sg.'], [['snasi', 'snaha']]);
// Genitive plural with a fleeting a: djevojka → djevojaka, sestra → sestara.
for (const [form, lemma, examples] of [
    ['aka', 'ka', [['djevojaka', 'djevojka'], ['olovaka', 'olovka']]],
    ['ara', 'ra', [['sestara', 'sestra']]],
    ['ala', 'la', [['igala', 'igla']]],
    ['ama', 'ma', [['pjesama', 'pjesma']]],
    ['aca', 'ca', [['ovaca', 'ovca']]],
]) {
    sfx('noun', form, lemma, ['gen. pl.'], examples, {end: C});
}
// Neuter genitive plural with a fleeting a: pismo → pisama, veslo → vesala.
sfx('noun', 'ama', 'mo', ['gen. pl.'], [['pisama', 'pismo']], {end: C});
sfx('noun', 'ala', 'lo', ['gen. pl.'], [['vesala', 'veslo']], {end: C});
sfx('noun', 'ara', 'ro', ['gen. pl.'], [['jedara', 'jedro']], {end: C});
sfx('noun', 'aca', 'ce', ['gen. pl.'], [['sunaca', 'sunce']], {end: C});
sfx('noun', 'ava', 'vo', ['gen. pl.'], [['društava', 'društvo'], ['dobročinstava', 'dobročinstvo']], {end: C});
sfx('noun', 'ana', 'no', ['gen. pl.'], [['platana', 'platno'], ['vlakana', 'vlakno']], {end: C});
// Feminine nouns with only a plural, on -e (novine, hlače, sanjke).
sfx('noun', 'ama', 'e', ['dat./loc./ins. pl.'], [['novinama', 'novine'], ['hlačama', 'hlače'], ['sanjkama', 'sanjke']], {end: C});

// Feminine nouns on a consonant (stvar, noć, radost): -i in most cases,
// which the masculine -i and -ima rules read. The instrumental singular
// has -ju, with jotation after most consonants.
sfx('noun', 'i', '', ['gen./dat./loc. sg.', 'nom./acc./gen. pl.'], [['stvari', 'stvar'], ['noći', 'noć'], ['radosti', 'radost']], {end: C, min: 3});
sfx('noun', 'ima', '', ['dat./loc./ins. pl.'], [['stvarima', 'stvar'], ['noćima', 'noć']], {end: C, min: 3});
sfx('noun', 'rju', 'r', ['ins. sg.'], [['stvarju', 'stvar'], ['večerju', 'večer']]);
sfx('noun', 'vlju', 'v', ['ins. sg.'], [['ljubavlju', 'ljubav'], ['krvlju', 'krv']], {min: 1});
sfx('noun', 'šću', 'st', ['ins. sg.'], [['radošću', 'radost'], ['mladošću', 'mladost'], ['košću', 'kost']], {min: 1});
sfx('noun', 'ću', 't', ['ins. sg.'], [['smrću', 'smrt'], ['pameću', 'pamet']]);
// The feminine nouns in -ć (noć, moć, pomoć, nemoć, peć); a masculine
// noun in -ć has -u in the dative (vučiću).
for (const lemma of ['noć', 'moć', 'pomoć', 'nemoć', 'svemoć', 'peć']) {
    whole('noun', `${lemma}u`, lemma, ['ins. sg.'], [[`${lemma}u`, lemma]]);
}
sfx('noun', 'đu', 'd', ['ins. sg.'], [['glađu', 'glad']]);
sfx('noun', 'šlju', 'sao', ['ins. sg.'], [['mišlju', 'misao']], {min: 1});
sfx('noun', 'sli', 'sao', ['gen./dat./loc. sg.', 'nom./acc./gen. pl.'], [['misli', 'misao']], {min: 1});
sfx('noun', 'slima', 'sao', ['dat./loc./ins. pl.'], [['mislima', 'misao']], {min: 1});

// Neuter nouns on -o (selo, mjesto) and on -e after a palatal, r or t
// (polje, more, sunce, igralište).
sfx('noun', 'a', 'o', ['gen. sg.', 'nom./acc./voc. pl.'], [['sela', 'selo'], ['mjesta', 'mjesto'], ['pisma', 'pismo']], {end: C});
sfx('noun', 'u', 'o', ['dat./loc. sg.'], [['selu', 'selo'], ['mjestu', 'mjesto']], {end: C});
sfx('noun', 'om', 'o', ['ins. sg.'], [['selom', 'selo'], ['mjestom', 'mjesto']], {end: C});
sfx('noun', 'ima', 'o', ['dat./loc./ins. pl.'], [['selima', 'selo'], ['mjestima', 'mjesto']], {end: C});
sfx('noun', 'a', 'e', ['gen. sg.', 'nom./acc./voc. pl.'], [['polja', 'polje'], ['mora', 'more'], ['sunca', 'sunce'], ['igrališta', 'igralište']], {end: '{softNeuter}'});
sfx('noun', 'u', 'e', ['dat./loc. sg.'], [['polju', 'polje'], ['moru', 'more']], {end: '{softNeuter}'});
sfx('noun', 'em', 'e', ['ins. sg.'], [['poljem', 'polje'], ['morem', 'more'], ['suncem', 'sunce']], {end: '{softNeuter}'});
sfx('noun', 'ima', 'e', ['dat./loc./ins. pl.'], [['poljima', 'polje'], ['morima', 'more']], {end: '{softNeuter}'});
// Neuters with -et- and -en- (dugme → dugmeta, ime → imena) and -es- in the
// plural (čudo → čudesa).
for (const [ending, tags] of [['a', ['gen. sg.']], ['u', ['dat./loc. sg.']], ['om', ['ins. sg.']]]) {
    sfx('noun', `et${ending}`, 'e', tags, [[`dugmet${ending}`, 'dugme'], [`pilet${ending}`, 'pile'], [`detet${ending}`, 'dete']]);
}
for (const [ending, tags] of [['a', ['gen. sg.', 'nom./acc./voc. pl.']], ['u', ['dat./loc. sg.']], ['om', ['ins. sg.']], ['ima', ['dat./loc./ins. pl.']]]) {
    sfx('noun', `en${ending}`, 'e', tags, [[`imen${ending}`, 'ime'], [`vremen${ending}`, 'vreme'], [`ramen${ending}`, 'rame']], {min: 1});
}
sfx('noun', 'esa', 'o', ['nom./acc./voc. pl.'], [['čudesa', 'čudo'], ['nebesa', 'nebo']]);
sfx('noun', 'esima', 'o', ['dat./loc./ins. pl.'], [['čudesima', 'čudo']]);
// The collectives in -ad of the neuters in -e (pile → pilad), a closed set:
// pozadi is not a form of a noun poze.
for (const root of ['pil', 'tel', 'dugm', 'bur', 'pras', 'jagnj', 'janj', 'mač', 'unuč', 'siroč', 'kuč', 'šten', 'ždreb', 'ždrijeb']) {
    whole('noun', `${root}ad`, `${root}e`, ['collective plural'], [[`${root}ad`, `${root}e`]]);
    whole('noun', `${root}adi`, `${root}e`, ['collective plural (gen./dat./loc./ins.)'], [[`${root}adi`, `${root}e`]]);
}

// Irregular nouns: [forms, lemmas, tags]; each form gives each lemma.
for (const [forms, lemmas, tags] of [
    [['ljudi'], ['čovjek', 'čovek'], ['nom./gen./voc. pl.']],
    [['ljude'], ['čovjek', 'čovek'], ['acc. pl.']],
    [['ljudima'], ['čovjek', 'čovek'], ['dat./loc./ins. pl.']],
    [['djeteta'], ['dijete'], ['gen. sg.']],
    [['djetetu'], ['dijete'], ['dat./loc. sg.']],
    [['djetetom'], ['dijete'], ['ins. sg.']],
    [['djeca'], ['dijete'], ['plural (djeca)']], [['deca'], ['dete'], ['plural (djeca)']],
    [['djece'], ['dijete'], ['gen. pl. (djece)']], [['dece'], ['dete'], ['gen. pl. (djece)']],
    [['djeci'], ['dijete'], ['dat./loc. pl. (djeci)']], [['deci'], ['dete'], ['dat./loc. pl. (djeci)']],
    [['djecu'], ['dijete'], ['acc. pl. (djecu)']], [['decu'], ['dete'], ['acc. pl. (djecu)']],
    [['djecom'], ['dijete'], ['ins. pl. (djecom)']], [['decom'], ['dete'], ['ins. pl. (djecom)']],
    [['braća'], ['brat'], ['plural (braća)']],
    [['braće'], ['brat'], ['gen. pl. (braće)']],
    [['braći'], ['brat'], ['dat./loc. pl. (braći)']],
    [['braću'], ['brat'], ['acc. pl. (braću)']],
    [['braćom'], ['brat'], ['ins. pl. (braćom)']],
    [['gospoda'], ['gospodin'], ['plural (gospoda)']],
    [['gospode'], ['gospodin'], ['gen. pl. (gospode)']],
    [['oči'], ['oko'], ['nom./acc./voc. pl.']],
    [['očiju'], ['oko'], ['gen. pl.']],
    [['očima'], ['oko'], ['dat./loc./ins. pl.']],
    [['uši'], ['uho', 'uvo'], ['nom./acc./voc. pl.']],
    [['ušiju'], ['uho', 'uvo'], ['gen. pl.']],
    [['ušima'], ['uho', 'uvo'], ['dat./loc./ins. pl.']],
    [['putem'], ['put'], ['ins. sg.']],
    [['putevi'], ['put'], ['nom./voc. pl.']],
    [['puteva'], ['put'], ['gen. pl.']],
    [['putevima'], ['put'], ['dat./loc./ins. pl.']],
    [['puteve'], ['put'], ['acc. pl.']],
    [['oca'], ['otac'], ['gen. sg.', 'acc. sg. (animate)']],
    [['ocu'], ['otac'], ['dat./loc. sg.']],
    [['ocem'], ['otac'], ['ins. sg.']],
    [['oče'], ['otac'], ['voc. sg.']],
    [['očevi'], ['otac'], ['nom./voc. pl.']],
    [['očeva'], ['otac'], ['gen. pl.']],
    [['očevima'], ['otac'], ['dat./loc./ins. pl.']],
    [['očeve'], ['otac'], ['acc. pl.']],
    [['vremena'], ['vrijeme'], ['gen. sg.', 'nom./acc./voc. pl.']],
    [['vremenu'], ['vrijeme'], ['dat./loc. sg.']],
    [['vremenom'], ['vrijeme'], ['ins. sg.']],
    [['vremenima'], ['vrijeme'], ['dat./loc./ins. pl.']],
    [['kćeri'], ['kći'], ['gen./dat./loc. sg.', 'nom./acc./gen. pl.']],
    [['kćer'], ['kći'], ['acc. sg.']],
    [['kćerju'], ['kći'], ['ins. sg.']],
    [['kćerima'], ['kći'], ['dat./loc./ins. pl.']],
    [['kolima'], ['kola'], ['dat./loc./ins. pl.']],
]) {
    for (const form of forms) {
        for (const lemma of lemmas) { whole('irregular-noun', form, lemma, tags, [[form, lemma]]); }
    }
}

// ===== Adjectives ===========================================================
// Indefinite lemma on a consonant (nov, star), its definite form (novi) and
// the definite-only adjectives on -i (srpski, glavni, prvi). The endings
// after a palatal stem (naš, vruć, svjež) have e for o.

const ADJ = [
    // ending, tags
    ['a', ['fem. nom./voc. sg.', 'masc./neut. gen. sg.', 'neut. nom./acc./voc. pl.']],
    ['e', ['fem. gen. sg.', 'fem. nom./acc./voc. pl.', 'masc. acc. pl.']],
    ['i', ['masc. nom./voc. pl.', 'definite masc. nom./voc. sg.']],
    ['o', ['neut. nom./acc./voc. sg.']],
    ['u', ['fem. acc. sg.', 'masc./neut. dat./loc. sg.']],
    ['og', ['masc./neut. gen. sg.', 'masc. acc. sg. (animate)']],
    ['oga', ['masc./neut. gen. sg.', 'masc. acc. sg. (animate)']],
    ['om', ['masc./neut. dat./loc. sg.', 'fem. ins. sg.']],
    ['ome', ['masc./neut. dat./loc. sg.']],
    ['omu', ['masc./neut. dat./loc. sg.']],
    ['oj', ['fem. dat./loc. sg.']],
    ['im', ['masc./neut. ins. sg.', 'dat./loc./ins. pl.']],
    ['ima', ['dat./loc./ins. pl.']],
    ['ih', ['gen. pl.']],
];
const ADJ_PALATAL = [
    ['e', ['fem. gen. sg.', 'fem. nom./acc./voc. pl.', 'masc. acc. pl.', 'neut. nom./acc./voc. sg.']],
    ['eg', ['masc./neut. gen. sg.', 'masc. acc. sg. (animate)']],
    ['ega', ['masc./neut. gen. sg.', 'masc. acc. sg. (animate)']],
    ['em', ['masc./neut. dat./loc. sg.']],
    ['emu', ['masc./neut. dat./loc. sg.']],
];
const adjTags = (tags) => tags;
const ADJ_EXAMPLES = {
    a: [['nova', 'nov'], ['srpska', 'srpski']], e: [['nove', 'nov'], ['srpske', 'srpski']], i: [['novi', 'nov'], ['stari', 'star']],
    o: [['novo', 'nov'], ['srpsko', 'srpski']], u: [['novu', 'nov'], ['srpsku', 'srpski']], og: [['novog', 'nov'], ['srpskog', 'srpski']],
    oga: [['novoga', 'nov'], ['srpskoga', 'srpski']], om: [['novom', 'nov'], ['srpskom', 'srpski']], ome: [['novome', 'nov'], ['glavnome', 'glavni']],
    omu: [['novomu', 'nov']], oj: [['novoj', 'nov'], ['srpskoj', 'srpski']], im: [['novim', 'nov'], ['srpskim', 'srpski']],
    ima: [['novima', 'nov'], ['srpskima', 'srpski']], ih: [['novih', 'nov'], ['srpskih', 'srpski']],
};
// A lemma of three letters or more: opa (an interjection) is not read as
// op, whose form-of row names the verb opiti. Of wty-sh-en's adjectives only
// go and in are shorter.
for (const [ending, tags] of ADJ) {
    const examples = ADJ_EXAMPLES[ending];
    sfx('adjective', ending, '', adjTags(tags), examples.filter(([, l]) => !l.endsWith('i')), {end: C, min: 3});
    // jeste (is) is not a form of an adjective jesti.
    if (ending !== 'i') {
        sfx('adjective', ending, 'i', adjTags(tags), [...examples.filter(([, l]) => l.endsWith('i')), [`prv${ending}`, 'prvi']], {end: C, notStartText: 'jest'});
    }
}
const ADJ_PALATAL_EXAMPLES = {
    e: [['naše', 'naš'], ['vruće', 'vruć']], eg: [['našeg', 'naš'], ['trećeg', 'treći']], ega: [['našega', 'naš'], ['trećega', 'treći']],
    em: [['našem', 'naš'], ['trećem', 'treći']], emu: [['našemu', 'naš'], ['trećemu', 'treći']],
};
for (const [ending, tags] of ADJ_PALATAL) {
    const examples = ADJ_PALATAL_EXAMPLES[ending];
    // -e after a palatal is the rule above with one more form, so it takes
    // the same stem constraint and is merged with it.
    const end = ending === 'e' ? C : PAL;
    sfx('adjective', ending, '', adjTags(tags), examples.filter(([, l]) => !l.endsWith('i')), {end});
    sfx('adjective', ending, 'i', adjTags(tags), [...examples.filter(([, l]) => l.endsWith('i')), [`domać${ending}`, 'domaći']], {end, notStartText: ending === 'e' ? 'jest' : undefined});
}
// Fleeting a in adjectives (dobar → dobra, sretan → sretna, kratak →
// kratka, topao → topla, kakav → kakva) and voicing (sladak → slatka,
// težak → teška, nizak → niska).
for (const [lemmaTail, formTail, stems] of [
    ['ar', 'r', [['dob', 'dobar'], ['mud', 'mudar']]],
    ['an', 'n', [['sret', 'sretan'], ['tam', 'taman'], ['važ', 'važan']]],
    ['stan', 'sn', [['kori', 'koristan'], ['ča', 'častan'], ['obije', 'obijestan']]],
    ['ak', 'k', [['krat', 'kratak'], ['tan', 'tanak']]],
    ['ao', 'l', [['top', 'topao'], ['z', 'zao']]],
    ['eo', 'el', [['deb', 'debeo'], ['ves', 'veseo']]],
    ['av', 'v', [['kak', 'kakav'], ['tak', 'takav']]],
    ['dak', 'tk', [['sla', 'sladak'], ['gla', 'gladak']]],
    ['žak', 'šk', [['te', 'težak']]],
    ['zak', 'sk', [['ni', 'nizak'], ['u', 'uzak']]],
]) {
    for (const [ending, tags] of ADJ) {
        const examples = stems.map(([stem, lemma]) => [`${stem}${formTail}${ending}`, lemma]);
        const min = lemmaTail === 'ao' || lemmaTail === 'zak' || lemmaTail === 'žak' ? 1 : 2;
        sfx('adjective', `${formTail}${ending}`, lemmaTail, adjTags(tags), examples, {end: formTail.length > 1 ? undefined : C, min});
    }
}

// cio / ceo (whole): the stem is cijel- (ijekavian) and cel- (ekavian), and
// the masculine lemma has the vocalised l. Written out: a rule cijel- → cio
// would read nothing else.
// beo (white, ekavian) likewise has bel-; ijekavian bijel is regular.
for (const [ending, tags] of ADJ) {
    whole('adjective', `cijel${ending}`, 'cio', adjTags(tags), [[`cijel${ending}`, 'cio']]);
    whole('adjective', `cel${ending}`, 'ceo', adjTags(tags), [[`cel${ending}`, 'ceo']]);
    whole('adjective', `bel${ending}`, 'beo', adjTags(tags), [[`bel${ending}`, 'beo']]);
}

// Comparative: -iji (noviji, stariji), declined like a definite adjective
// (novijeg → noviji → nov), and the jotated -ji of many adjectives.
// Superlative: naj- before the comparative (najnoviji → noviji → nov).
// Conditions (assigned per group in GROUP_OUT below): the part of speech a
// rule's output is. lpart and cmp are intermediate: an l-participle written
// with -'o (rek'o), and a comparative whose naj- was removed.
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    pron: {name: 'Pronoun or numeral', isDictionaryForm: true},
    cmp: {name: 'Comparative after naj-', isDictionaryForm: false},
    lpart: {name: 'Colloquial l-participle in -\'o', isDictionaryForm: false},
};
prefix('comparative', 'naj', '', ['superlative'], [['najnoviji', 'nov'], ['najbolji', 'dobar'], ['najljepši', 'lijep']], {min: 2, in: ['adj'], out: ['cmp']});
// Comparative rules take a declined comparative (novijeg → noviji, adj) and
// one whose naj- was removed (cmp).
const CMP = {in: ['adj', 'cmp']};
sfx('comparative', 'iji', '', ['comparative'], [['noviji', 'nov'], ['stariji', 'star'], ['najstariji', 'star']], {end: C, ...CMP});
// The -iji comparatives of adjectives with a fleeting a (važan → važniji,
// koristan → korisniji, mudar → mudriji) and of definite-only adjectives
// (zapadni → zapadniji).
for (const [form, lemma, examples, opts] of [
    ['niji', 'an', [['važniji', 'važan'], ['sretniji', 'sretan'], ['popularniji', 'popularan']], {end: C}],
    ['sniji', 'stan', [['korisniji', 'koristan'], ['časniji', 'častan']], {min: 1}],
    ['riji', 'ar', [['mudriji', 'mudar'], ['hrabriji', 'hrabar']], {end: C}],
    ['iji', 'i', [['zapadniji', 'zapadni'], ['sjeverniji', 'sjeverni']], {end: C}],
]) {
    sfx('comparative', form, lemma, ['comparative'], examples, {...opts, ...CMP});
}
// The comparatives with -ji and a consonant change (jotation: brz → brži,
// mlad → mlađi, žut → žući, skup → skuplji) belong to a closed set of
// mostly short adjectives, so they are written out, ijekavian and ekavian
// (ljepši and lepši); a suffix rule per change would also read verb forms
// as comparatives (znači → znak, drži → držak, vraći → vrat). Their
// superlatives are naj- before them (najmlađi → mlađi → mlad), and their
// cases are read by the adjective rules (mlađeg → mlađi).
for (const [form, lemmas] of [
    ['bolji', ['dobar']], ['gori', ['zao', 'loš']], ['veći', ['velik']], ['manji', ['malen', 'mal']], ['dulji', ['dug']], ['duži', ['dug']],
    ['skuplji', ['skup']], ['grublji', ['grub']], ['gluplji', ['glup']], ['tuplji', ['tup']], ['dublji', ['dubok']], ['plići', ['plitak']],
    ['crnji', ['crn']], ['tanji', ['tanak']], ['brži', ['brz']], ['draži', ['drag']], ['stroži', ['strog']], ['blaži', ['blag']],
    ['niži', ['nizak']], ['bliži', ['blizak']], ['uži', ['uzak']], ['teži', ['težak']], ['tiši', ['tih']], ['viši', ['visok']],
    ['suši', ['suh']], ['gluši', ['gluh']], ['lakši', ['lak']], ['mekši', ['mek']], ['ljepši', ['lijep']], ['lepši', ['lep']],
    ['mlađi', ['mlad']], ['tvrđi', ['tvrd']], ['slađi', ['sladak']], ['glađi', ['gladak']], ['rjeđi', ['rijedak']], ['ređi', ['redak']],
    ['žući', ['žut']], ['ljući', ['ljut']], ['krući', ['krut']], ['kraći', ['kratak']], ['žešći', ['žestok']], ['gušći', ['gust']],
    ['češći', ['čest']], ['jači', ['jak']], ['širi', ['širok']], ['dalji', ['dalek']], ['deblji', ['debeo']], ['bjelji', ['bijel']],
    ['belji', ['beo']],
]) {
    for (const lemma of lemmas) { whole('comparative', form, lemma, ['comparative'], [[form, lemma]], CMP); }
}
// teže (harder, heavier) is the neuter and the adverb of teži; read as a
// vocative it was the noun teg. veća, veću and šire are comparatives, not
// the nouns veće (council) and šira (grape must).
for (const [form, lemma] of [['teže', 'težak'], ['veća', 'velik'], ['veću', 'velik'], ['šire', 'širok']]) {
    whole('comparative', form, lemma, ['comparative'], [[form, lemma]], CMP);
}

// ===== Pronouns and numerals ===============================================

for (const [lemmas, forms, tags] of [
    [['ja'], ['mene', 'me'], ['gen./acc.']], [['ja'], ['meni', 'mi'], ['dat./loc.']], [['ja'], ['mnom', 'mnome'], ['ins.']],
    [['ti'], ['tebe', 'te'], ['gen./acc.']], [['ti'], ['tebi'], ['dat./loc.']], [['ti'], ['tobom'], ['ins.']],
    [['on', 'ono'], ['njega', 'ga'], ['gen./acc.']], [['on', 'ono'], ['njemu', 'mu'], ['dat./loc.']], [['on', 'ono'], ['njim', 'njime'], ['ins.']],
    [['ona'], ['nje', 'je'], ['gen./acc.']], [['ona'], ['nju', 'ju'], ['acc.']], [['ona'], ['njoj', 'joj'], ['dat./loc.']], [['ona'], ['njom', 'njome'], ['ins.']],
    [['mi'], ['nas'], ['gen./acc.']], [['mi'], ['nama', 'nam'], ['dat./loc./ins.']],
    [['vi'], ['vas'], ['gen./acc.']], [['vi'], ['vama', 'vam'], ['dat./loc./ins.']],
    [['oni'], ['njih', 'ih'], ['gen./acc.']], [['oni'], ['njima', 'im'], ['dat./loc./ins.']],
    [['sebe'], ['se'], ['gen./acc.']], [['sebe'], ['sebi', 'si'], ['dat./loc.']], [['sebe'], ['sobom'], ['ins.']],
    [['tko', 'ko'], ['koga', 'kog'], ['gen./acc.']], [['tko', 'ko'], ['kome', 'komu', 'kom'], ['dat./loc.']], [['tko', 'ko'], ['kim', 'kime'], ['ins.']],
    [['što', 'šta'], ['čega', 'čeg'], ['gen.']], [['što', 'šta'], ['čemu', 'čem'], ['dat./loc.']], [['što', 'šta'], ['čim', 'čime'], ['ins.']],
    [['nitko', 'niko'], ['nikoga', 'nikog'], ['gen./acc.']], [['nitko', 'niko'], ['nikome', 'nikomu', 'nikom'], ['dat./loc.']], [['nitko', 'niko'], ['nikim'], ['ins.']],
    [['netko', 'neko'], ['nekoga', 'nekog'], ['gen./acc.']], [['netko', 'neko'], ['nekome', 'nekomu', 'nekom'], ['dat./loc.']], [['netko', 'neko'], ['nekim'], ['ins.']],
    [['ništa'], ['ničega', 'ničeg'], ['gen.']], [['ništa'], ['ničemu', 'ničem'], ['dat./loc.']], [['ništa'], ['ničim'], ['ins.']],
    [['nešto'], ['nečega', 'nečeg'], ['gen.']], [['nešto'], ['nečemu', 'nečem'], ['dat./loc.']], [['nešto'], ['nečim'], ['ins.']],
    [['sav'], ['sva'], ['fem. nom. sg.', 'neut. nom./acc. pl.']], [['sav'], ['sve'], ['neut. nom./acc. sg.', 'fem. gen. sg.', 'acc. pl.']],
    [['sav'], ['svi'], ['masc. nom. pl.']], [['sav'], ['svu'], ['fem. acc. sg.']], [['sav'], ['svega', 'sveg'], ['masc./neut. gen. sg.']],
    [['sav'], ['svemu', 'svem'], ['masc./neut. dat./loc. sg.']], [['sav'], ['svim', 'svime'], ['masc./neut. ins. sg.', 'dat./loc./ins. pl.']],
    [['sav'], ['svih'], ['gen. pl.']], [['sav'], ['svima'], ['dat./loc./ins. pl.']],
    [['moj'], ['mog', 'moga'], ['masc./neut. gen. sg.']], [['moj'], ['mom', 'mome', 'momu'], ['masc./neut. dat./loc. sg.']],
    [['tvoj'], ['tvog', 'tvoga'], ['masc./neut. gen. sg.']], [['tvoj'], ['tvom', 'tvome', 'tvomu'], ['masc./neut. dat./loc. sg.']],
    [['svoj'], ['svog', 'svoga'], ['masc./neut. gen. sg.']], [['svoj'], ['svom', 'svome', 'svomu'], ['masc./neut. dat./loc. sg.']],
    // svom and svome are also forms of sav; svoj comes first.
    [['sav'], ['svom', 'svome'], ['masc./neut. dat./loc. sg.']],
    [['koji'], ['kog', 'koga'], ['masc./neut. gen. sg.']], [['koji'], ['kom', 'kome', 'komu'], ['masc./neut. dat./loc. sg.']],
    [['ovaj'], ['ova'], ['fem. nom. sg.', 'neut. nom./acc. pl.']], [['ovaj'], ['ovo'], ['neut. nom./acc. sg.']],
    [['ovaj'], ['ovi'], ['masc. nom. pl.']], [['ovaj'], ['ove'], ['fem. gen. sg.', 'acc. pl.', 'fem. nom. pl.']],
    [['ovaj'], ['ovog', 'ovoga'], ['masc./neut. gen. sg.']], [['ovaj'], ['ovom', 'ovome', 'ovomu'], ['masc./neut. dat./loc. sg.', 'fem. ins. sg.']],
    [['ovaj'], ['ovim'], ['masc./neut. ins. sg.', 'dat./loc./ins. pl.']], [['ovaj'], ['ovoj'], ['fem. dat./loc. sg.']], [['ovaj'], ['ovu'], ['fem. acc. sg.']],
    [['ovaj'], ['ovih'], ['gen. pl.']], [['ovaj'], ['ovima'], ['dat./loc./ins. pl.']],
    [['taj'], ['ta'], ['fem. nom. sg.', 'neut. nom./acc. pl.']], [['taj'], ['to'], ['neut. nom./acc. sg.']],
    [['taj'], ['ti'], ['masc. nom. pl.']], [['taj'], ['te'], ['fem. gen. sg.', 'acc. pl.', 'fem. nom. pl.']],
    [['taj'], ['tog', 'toga'], ['masc./neut. gen. sg.']], [['taj'], ['tom', 'tome', 'tomu'], ['masc./neut. dat./loc. sg.', 'fem. ins. sg.']],
    [['taj'], ['tim', 'time'], ['masc./neut. ins. sg.', 'dat./loc./ins. pl.']], [['taj'], ['toj'], ['fem. dat./loc. sg.']], [['taj'], ['tu'], ['fem. acc. sg.']],
    [['taj'], ['tih'], ['gen. pl.']], [['taj'], ['tima'], ['dat./loc./ins. pl.']],
    [['onaj'], ['ona'], ['fem. nom. sg.', 'neut. nom./acc. pl.']], [['onaj'], ['ono'], ['neut. nom./acc. sg.']],
    [['onaj'], ['oni'], ['masc. nom. pl.']], [['onaj'], ['one'], ['fem. gen. sg.', 'acc. pl.', 'fem. nom. pl.']],
    [['onaj'], ['onog', 'onoga'], ['masc./neut. gen. sg.']], [['onaj'], ['onom', 'onome', 'onomu'], ['masc./neut. dat./loc. sg.', 'fem. ins. sg.']],
    [['onaj'], ['onim'], ['masc./neut. ins. sg.', 'dat./loc./ins. pl.']], [['onaj'], ['onoj'], ['fem. dat./loc. sg.']], [['onaj'], ['onu'], ['fem. acc. sg.']],
    [['onaj'], ['onih'], ['gen. pl.']], [['onaj'], ['onima'], ['dat./loc./ins. pl.']],
    [['dva'], ['dvije', 'dve'], ['fem.']], [['dva'], ['dvaju', 'dviju', 'dveju'], ['gen.']], [['dva'], ['dvama', 'dvjema', 'dvema'], ['dat./loc./ins.']],
    [['tri'], ['triju'], ['gen.']], [['tri'], ['trima'], ['dat./loc./ins.']],
    [['četiri'], ['četiriju'], ['gen.']], [['četiri'], ['četirima'], ['dat./loc./ins.']],
    [['oba'], ['obje', 'obe'], ['fem.']], [['oba'], ['obaju', 'obiju'], ['gen.']], [['oba'], ['obama', 'objema', 'obema'], ['dat./loc./ins.']],
]) {
    for (const lemma of lemmas) {
        for (const form of forms) {
            whole('pronoun', form, lemma, tags, [[form, lemma]]);
        }
    }
}

// ===== Verbs ================================================================
// Present tense. Each class is a present stem ending and an infinitive
// ending; the person endings follow.

const PERSONS = [['m', '1sg'], ['š', '2sg'], ['', '3sg'], ['mo', '1pl'], ['te', '2pl']];
/**
 * The present of one class: `stem` + person endings, 3rd plural `pl3`.
 * examples: [[present stem form (1sg), infinitive], ...]
 */
function present(group, stem, inf, pl3, examples, opts = {}) {
    for (const [ending, person] of PERSONS) {
        const tags = [`present ${person}`, ...(opts.extraTags?.[person] ?? [])];
        const ex = examples.map(([first, lemma]) => [first.slice(0, first.length - 1 - stem.length) + stem + ending, lemma]);
        sfx(group, stem + ending, inf, tags, ex, {min: opts.min ?? 2, end: opts.end, notEnd: opts.notEnd});
    }
    if (pl3 !== null) {
        const ex = examples.map(([first, lemma]) => [first.slice(0, first.length - 1 - stem.length) + pl3, lemma]);
        sfx(group, pl3, inf, ['present 3pl', ...(opts.extraTags?.['3pl'] ?? [])], ex, {min: opts.min ?? 2, end: opts.end, notEnd: opts.notEnd});
    }
}
// examples: the 1sg form (stem + m) and the infinitive.
present('verb-present', 'a', 'ati', 'aju', [['čitam', 'čitati'], ['imam', 'imati'], ['znam', 'znati']],
    {extraTags: {'3sg': ['aorist 2/3sg']}});
present('verb-present', 'i', 'iti', 'e', [['radim', 'raditi'], ['mislim', 'misliti'], ['govorim', 'govoriti']],
    {extraTags: {'3sg': ['imperative 2sg', 'aorist 2/3sg'], '1pl': ['imperative 1pl'], '2pl': ['imperative 2pl']}});
present('verb-present', 'i', 'jeti', 'e', [['vidim', 'vidjeti'], ['volim', 'voljeti'], ['živim', 'živjeti']],
    {extraTags: {'3sg': ['imperative 2sg'], '1pl': ['imperative 1pl'], '2pl': ['imperative 2pl']}});
present('verb-present', 'i', 'eti', 'e', [['vidim', 'videti'], ['volim', 'voleti'], ['živim', 'živeti']],
    {extraTags: {'3sg': ['imperative 2sg'], '1pl': ['imperative 1pl'], '2pl': ['imperative 2pl'], '3pl': ['aorist 2/3sg']}});
present('verb-present', 'i', 'ati', 'e', [['držim', 'držati'], ['ležim', 'ležati'], ['trčim', 'trčati'], ['bojim', 'bojati']],
    {end: '{afterA}', extraTags: {'3sg': ['imperative 2sg'], '1pl': ['imperative 1pl'], '2pl': ['imperative 2pl']}});
// e-type with -je- after a vowel.
present('verb-present', 'uje', 'ovati', 'uju', [['kupujem', 'kupovati'], ['putujem', 'putovati'], ['radujem', 'radovati']], {min: 1});
present('verb-present', 'uje', 'ivati', 'uju', [['pokazujem', 'pokazivati'], ['zapisujem', 'zapisivati']], {min: 2});
present('verb-present', 'uje', 'evati', 'uju', [['kraljujem', 'kraljevati']], {end: PAL});
present('verb-present', 'uje', 'uti', 'uju', [['čujem', 'čuti'], ['obujem', 'obuti']], {min: 1});
present('verb-present', 'aje', 'avati', 'aju', [['dajem', 'davati'], ['prodajem', 'prodavati'], ['priznajem', 'priznavati']], {min: 1});
present('verb-present', 'aje', 'ajati', 'aju', [['ostajem', 'ostajati'], ['nestajem', 'nestajati']], {min: 2});
// -iti verbs with -ije- have a root of one consonant or kr, gnj (piti, biti,
// šiti, liti, viti, miti, riti, kriti, gnjiti), written out with any prefix
// before it, so nije, kasnije and ranije are not niti, kasniti and raniti.
// No prefix ends in p or k, so prije is not priti.
for (const [root, examples] of [['p', [['pijem', 'piti'], ['popijem', 'popiti']]], ['b', [['bijem', 'biti'], ['ubijem', 'ubiti']]],
    ['š', [['šijem', 'šiti'], ['sašijem', 'sašiti']]], ['l', [['lijem', 'liti'], ['prolijem', 'proliti']]], ['v', [['vijem', 'viti'], ['razvijem', 'razviti']]],
    ['m', [['mijem', 'miti'], ['umijem', 'umiti']]], ['kr', [['krijem', 'kriti'], ['otkrijem', 'otkriti']]], ['gnj', [['gnjijem', 'gnjiti']]]]) {
    present('verb-present', `${root}ije`, `${root}iti`, `${root}iju`, examples, {min: 0});
}
present('verb-present', 'rije', 'riti', 'riju', [['rijem', 'riti'], ['zarijem', 'zariti']], {min: 0, notEnd: '[pk]'});
present('verb-present', 'ije', 'ijati', 'iju', [['sijem', 'sijati'], ['smijem', 'smijati'], ['grijem', 'grijati']], {min: 1});
present('verb-present', 'ije', 'jeti', 'iju', [['razumijem', 'razumjeti'], ['smijem', 'smjeti'], ['umijem', 'umjeti']], {min: 1});
present('verb-present', 'e', 'eti', 'eju', [['razumem', 'razumeti'], ['smem', 'smeti'], ['umem', 'umeti']], {min: 2});
present('verb-present', 'ne', 'nuti', 'nu', [['krenem', 'krenuti'], ['maknem', 'maknuti'], ['viknem', 'viknuti'], ['okrenem', 'okrenuti']],
    {min: 1, extraTags: {'3pl': ['aorist 2/3sg']}});
// stati and its compounds (ostati, postati, prestati, nestati, ustati):
// stanem; a passive participle in -an (pisane) is not read as one.
present('verb-present', 'stane', 'stati', 'stanu', [['stanem', 'stati'], ['ostanem', 'ostati'], ['postanem', 'postati'], ['prestanem', 'prestati']], {min: 0});
present('verb-present', 'dne', 'sti', 'dnu', [['sjednem', 'sjesti'], ['padnem', 'pasti']], {min: 1});
present('verb-present', 'gne', 'ći', 'gnu', [['dignem', 'dići'], ['stignem', 'stići'], ['legnem', 'leći'], ['pomognem', 'pomoći']], {min: 1});
present('verb-present', 'čne', 'četi', 'čnu', [['počnem', 'početi'], ['začnem', 'začeti']], {min: 1});
present('verb-present', 'pne', 'peti', 'pnu', [['zapnem', 'zapeti'], ['napnem', 'napeti']], {min: 1});
present('verb-present', 'kne', 'ći', 'knu', [['reknem', 'reći']], {min: 1});
present('verb-present', 'zme', 'zeti', 'zmu', [['uzmem', 'uzeti'], ['preuzmem', 'preuzeti']], {min: 1});
present('verb-present', 'tme', 'teti', 'tmu', [['otmem', 'oteti']], {min: 1});
// Jotated -ati verbs: pisati → pišem, kazati → kažem, plakati → plačem.
present('verb-present', 'še', 'sati', 'šu', [['pišem', 'pisati'], ['brišem', 'brisati'], ['opišem', 'opisati']], {min: 1});
present('verb-present', 'še', 'hati', 'šu', [['mašem', 'mahati'], ['njišem', 'njihati']], {min: 1});
present('verb-present', 'že', 'zati', 'žu', [['kažem', 'kazati'], ['vežem', 'vezati'], ['režem', 'rezati'], ['pokažem', 'pokazati']], {min: 1});
present('verb-present', 'že', 'gati', 'žu', [['lažem', 'lagati'], ['stružem', 'strugati']], {min: 1});
present('verb-present', 'če', 'kati', 'ču', [['plačem', 'plakati'], ['skačem', 'skakati'], ['vičem', 'vikati']], {min: 1});
present('verb-present', 'če', 'cati', 'ču', [['mičem', 'micati'], ['tičem', 'ticati']], {min: 1});
present('verb-present', 'će', 'tati', 'ću', [['krećem', 'kretati'], ['okrećem', 'okretati'], ['mećem', 'metati']], {min: 1});
present('verb-present', 'pće', 'ptati', 'pću', [['šapćem', 'šaptati']], {min: 1});
present('verb-present', 'plje', 'pati', 'plju', [['kapljem', 'kapati']], {min: 1});
present('verb-present', 'šće', 'skati', 'šću', [['pišćem', 'piskati']], {min: 1});
// Consonant stems: jesti → jedem, plesti → pletem, peći → pečem, moći →
// mogu, doći → dođem, brati → berem, zvati → zovem.
// The -sti verbs with a consonant stem are a closed set of roots, written
// out with any prefix before them (pojedem, ukradem, dovedem), so that
// ide, idemo, rade, jeste and idući are not read as isti, rasti or jesti.
// [root of the present, infinitive ending after the root's vowel, examples]
const STI_ROOTS = [
    ['jed', 'je', [['jedem', 'jesti'], ['pojedem', 'pojesti']]],
    ['krad', 'kra', [['kradem', 'krasti'], ['ukradem', 'ukrasti']]],
    ['bod', 'bo', [['bodem', 'bosti'], ['ubodem', 'ubosti']]],
    ['ved', 've', [['dovedem', 'dovesti'], ['izvedem', 'izvesti'], ['povedem', 'povesti']]],
    ['bred', 'bre', [['bredem', 'bresti']]],
    ['pred', 'pre', [['predem', 'presti']]],
    ['plet', 'ple', [['pletem', 'plesti'], ['ispletem', 'isplesti']]],
    ['met', 'me', [['metem', 'mesti'], ['pometem', 'pomesti']]],
    ['gnjet', 'gnje', [['gnjetem', 'gnjesti']]],
    ['cvat', 'cva', [['cvatem', 'cvasti'], ['procvatem', 'procvasti']]],
    ['rast', 'ra', [['rastem', 'rasti'], ['odrastem', 'odrasti'], ['narastem', 'narasti']]],
    ['tres', 'tre', [['tresem', 'tresti'], ['istresem', 'istresti']]],
    ['pas', 'pa', [['pasem', 'pasti']]],
    ['nes', 'ne', [['nesem', 'nesti']]],
    ['griz', 'gri', [['grizem', 'gristi'], ['ugrizem', 'ugristi']]],
    ['muz', 'mu', [['muzem', 'musti'], ['pomuzem', 'pomusti']]],
    ['vez', 've', [['vezem', 'vesti'], ['izvezem', 'izvesti']]],
];
for (const [root, base, examples] of STI_ROOTS) {
    present('verb-present', `${root}e`, `${base}sti`, `${root}u`, examples, {min: 0});
}
present('verb-present', 'če', 'ći', 'ku', [['pečem', 'peći'], ['vučem', 'vući'], ['tečem', 'teći'], ['obučem', 'obući']],
    {min: 1, extraTags: {'3sg': ['aorist 2/3sg']}});
present('verb-present', 'že', 'ći', 'gu', [['strižem', 'strići']], {min: 1, extraTags: {'3sg': ['aorist 2/3sg'], '3pl': ['present 1sg']}});
// moći: mogu, možeš, može, možemo, možete, mogu (the same rules).
for (const [form, person] of [['možeš', '2sg'], ['može', '3sg'], ['možemo', '1pl'], ['možete', '2pl']]) {
    sfx('verb-present', form.slice(2), 'ći', [`present ${person}`], [[form, 'moći']], {min: 1});
}
sfx('verb-present', 'gu', 'ći', ['present 3pl', 'present 1sg'], [['mogu', 'moći']], {min: 1});
present('verb-present', 'đe', 'ći', 'đu', [['dođem', 'doći'], ['nađem', 'naći'], ['uđem', 'ući'], ['izađem', 'izaći'], ['prođem', 'proći']],
    {min: 1, extraTags: {'3sg': ['aorist 2/3sg']}});
present('verb-present', 'ere', 'rati', 'eru', [['berem', 'brati'], ['perem', 'prati'], ['izaberem', 'izabrati']], {min: 1});
// -rati verbs whose present keeps the root vowel: prezirati → prezirem,
// umirati → umirem, orati → orem, prožderati → prožderem.
present('verb-present', 're', 'rati', 'ru', [['prezirem', 'prezirati'], ['umirem', 'umirati'], ['orem', 'orati'], ['prožderem', 'prožderati']], {min: 1, end: '[ieo]'});
// donijeti / doneti → donesem.
present('verb-present', 'nese', 'nijeti', 'nesu', [['donesem', 'donijeti'], ['prenesem', 'prenijeti'], ['iznesem', 'iznijeti']], {min: 1});
present('verb-present', 'nese', 'neti', 'nesu', [['donesem', 'doneti'], ['prenesem', 'preneti'], ['raznesem', 'razneti']], {min: 1});
present('verb-present', 'mlje', 'mati', 'mlju', [['uzimljem', 'uzimati'], ['izuzimljem', 'izuzimati']], {min: 2});
// sresti, susresti → sretnem, susretnem.
present('verb-present', 'tne', 'sti', 'tnu', [['sretnem', 'sresti'], ['susretnem', 'susresti']], {min: 1});
present('verb-present', 'ove', 'vati', 'ovu', [['zovem', 'zvati'], ['pozovem', 'pozvati'], ['nazovem', 'nazvati']], {min: 1});
present('verb-present', 're', 'rijeti', 'ru', [['umrem', 'umrijeti'], ['prostrem', 'prostrijeti']], {min: 1, end: C});
present('verb-present', 're', 'reti', 'ru', [['umrem', 'umreti'], ['prostrem', 'prostreti']], {min: 1, end: C});
present('verb-present', 'šalje', 'slati', 'šalju', [['pošaljem', 'poslati'], ['šaljem', 'slati']], {min: 0});
present('verb-present', 'kune', 'kleti', 'kunu', [['kunem', 'kleti'], ['prokunem', 'prokleti']], {min: 0});
present('verb-present', 'jebe', 'jebati', 'jebu', [['jebem', 'jebati'], ['zajebem', 'zajebati']], {min: 0});

// The l-participle: radio, radila, radilo, radili, radile (perfect,
// pluperfect, conditional and future II).
const LPART = [['o', 'masc. sg.'], ['la', 'fem. sg./neut. pl.'], ['lo', 'neut. sg.'], ['li', 'masc. pl.'], ['le', 'fem. pl.']];
function lParticiple(masc, base, inf, examples, opts = {}) {
    // masc: the masculine singular ending (ao, io, eo, uo, kao, ...); base:
    // the ending before -la/-lo/-li/-le (a, i, je, e, u, k, ...).
    for (const [ending, ...forms] of LPART) {
        const inflected = ending === 'o' ? masc : base + ending;
        const tags = forms.map((f) => `past (l-participle), ${f}`);
        const ex = examples.map(([stem, lemma]) => [stem + inflected, lemma]);
        sfx('verb-participle', inflected, inf, tags, ex, {min: opts.min ?? 1, end: opts.end, notEnd: opts.notEnd, in: ending === 'o' ? ['lpart'] : []});
    }
}
lParticiple('ao', 'a', 'ati', [['čit', 'čitati'], ['d', 'dati'], ['pis', 'pisati'], ['treb', 'trebati']]);
lParticiple('io', 'i', 'iti', [['rad', 'raditi'], ['misl', 'misliti'], ['b', 'biti'], ['učin', 'učiniti']]);
lParticiple('io', 'je', 'jeti', [['vid', 'vidjeti'], ['vol', 'voljeti'], ['ht', 'htjeti'], ['živ', 'živjeti']]);
lParticiple('eo', 'e', 'eti', [['vid', 'videti'], ['vol', 'voleti'], ['ht', 'hteti'], ['uz', 'uzeti'], ['poč', 'početi']]);
lParticiple('uo', 'u', 'uti', [['č', 'čuti'], ['kren', 'krenuti'], ['okren', 'okrenuti']]);
lParticiple('kao', 'k', 'ći', [['re', 'reći'], ['pe', 'peći'], ['vu', 'vući'], ['sje', 'sjeći']]);
lParticiple('gao', 'g', 'ći', [['mo', 'moći'], ['pomo', 'pomoći'], ['sti', 'stići'], ['le', 'leći']]);
lParticiple('šao', 'š', 'ći', [['do', 'doći'], ['i', 'ići'], ['na', 'naći'], ['oti', 'otići'], ['pro', 'proći']]);
// The -sti verbs, per root as in the present: a suffix rule for each
// ending read the l-participles of the -stati verbs (nestao, prestao) as
// nesti and presti, and selo, posla as sesti, posti.
// [masculine, the stem before -la, -lo, -li, -le, the root before -sti, examples]
for (const [masc, base, root, examples] of [
    ['jeo', 'je', 'je', [['', 'jesti'], ['po', 'pojesti']]],
    ['sjeo', 'sje', 'sje', [['', 'sjesti'], ['pri', 'prisjesti']]],
    ['seo', 'se', 'se', [['', 'sesti'], ['pri', 'prisesti']]],
    ['pleo', 'ple', 'ple', [['', 'plesti'], ['is', 'isplesti']]],
    ['meo', 'me', 'me', [['', 'mesti'], ['po', 'pomesti']]],
    ['veo', 've', 've', [['do', 'dovesti'], ['iz', 'izvesti'], ['u', 'uvesti']]],
    ['preo', 'pre', 'pre', [['', 'presti']]],
    ['pao', 'pa', 'pa', [['', 'pasti'], ['na', 'napasti'], ['pro', 'propasti']]],
    ['krao', 'kra', 'kra', [['', 'krasti'], ['u', 'ukrasti']]],
    ['cvao', 'cva', 'cva', [['pro', 'procvasti']]],
    ['rastao', 'ras', 'ra', [['', 'rasti'], ['od', 'odrasti'], ['po', 'porasti']]],
    ['tresao', 'tres', 'tre', [['', 'tresti'], ['pro', 'protresti']]],
    ['nesao', 'nes', 'ne', [['do', 'donesti'], ['pre', 'prenesti']]],
    ['grizao', 'griz', 'gri', [['', 'gristi'], ['u', 'ugristi']]],
    ['muzao', 'muz', 'mu', [['', 'musti']]],
    ['vezao', 'vez', 've', [['iz', 'izvesti']]],
]) {
    lParticiple(masc, base, `${root}sti`, examples, {min: 0});
}
// -rijeti and -reti verbs (umrijeti, zatrijeti, prostrijeti) have a
// consonant before the r: staro is not stareti.
lParticiple('ro', 'r', 'rijeti', [['um', 'umrijeti'], ['zat', 'zatrijeti']], {end: C});
lParticiple('ro', 'r', 'reti', [['um', 'umreti'], ['zat', 'zatreti']], {end: C});
// Colloquial -'o for -ao: rek'o, doš'o, pos'o.
sfx('verb-participle', "'o", 'ao', ['colloquial -ao'], [["rek'o", 'reći'], ["doš'o", 'doći']], {min: 1, out: ['lpart']});
sfx('verb-participle', '’o', 'ao', ['colloquial -ao'], [['rek’o', 'reći']], {min: 1, out: ['lpart']});

// The passive participle (rađen, pisan, kupljen) and its feminine, neuter
// and plural (pisana, pisano, pisani, pisane); its other cases are read
// through the adjective rules (pisanog → pisan → pisati).
function passive(form, inf, examples, opts = {}) {
    for (const [ending, tags] of [['', ['passive participle']], ['a', ['passive participle, fem. sg.']], ['o', ['passive participle, neut. sg.']], ['i', ['passive participle, masc. pl.']], ['e', ['passive participle, fem. pl.']]]) {
        const ex = examples.map(([stem, lemma]) => [stem + form + ending, lemma]);
        sfx('verb-participle', form + ending, inf, tags, ex, {min: opts.min ?? 2, end: opts.end, in: ending === '' ? ['adj'] : []});
    }
}
passive('an', 'ati', [['pis', 'pisati'], ['čit', 'čitati'], ['posl', 'poslati'], ['zv', 'zvati']]);
passive('ren', 'riti', [['otvo', 'otvoriti'], ['zatvo', 'zatvoriti'], ['stvo', 'stvoriti']]);
passive('jen', 'jiti', [['bro', 'brojiti'], ['nabro', 'nabrojiti'], ['spo', 'spojiti']]);
passive('ljen', 'liti', [['hva', 'hvaliti'], ['poso', 'posoliti']]);
passive('ljen', 'ljeti', [['vo', 'voljeti']]);
passive('ljen', 'leti', [['vo', 'voleti']]);
passive('njen', 'niti', [['bra', 'braniti'], ['promije', 'promijeniti'], ['hra', 'hraniti']]);
passive('pljen', 'piti', [['ku', 'kupiti'], ['zaku', 'zakupiti']]);
passive('bljen', 'biti', [['izgu', 'izgubiti'], ['zalju', 'zaljubiti']]);
passive('vljen', 'viti', [['napra', 'napraviti'], ['osta', 'ostaviti'], ['zabora', 'zaboraviti'], ['posta', 'postaviti']]);
passive('mljen', 'miti', [['slo', 'slomiti'], ['pri', 'primiti']]);
passive('šljen', 'sliti', [['mi', 'misliti'], ['zami', 'zamisliti']]);
passive('đen', 'diti', [['ro', 'roditi'], ['osu', 'osuditi'], ['probu', 'probuditi']]);
passive('đen', 'djeti', [['vi', 'vidjeti']]);
passive('đen', 'deti', [['vi', 'videti']]);
passive('ćen', 'titi', [['pla', 'platiti'], ['vra', 'vratiti'], ['shva', 'shvatiti'], ['uhva', 'uhvatiti']]);
// baciti and its compounds: c → č (bačen, izbačen), not bačiti.
passive('bačen', 'baciti', [['', 'baciti'], ['iz', 'izbaciti'], ['pre', 'prebaciti'], ['u', 'ubaciti'], ['od', 'odbaciti']], {min: 0});
passive('šten', 'stiti', [['pu', 'pustiti'], ['opro', 'oprostiti'], ['napu', 'napustiti']]);
passive('šćen', 'stiti', [['oči', 'očistiti'], ['iskori', 'iskoristiti']]);
passive('šen', 'siti', [['no', 'nositi'], ['pro', 'prositi']]);
passive('šen', 'šiti', [['zavr', 'završiti'], ['dovr', 'dovršiti']]);
passive('žen', 'ziti', [['vo', 'voziti'], ['pora', 'poraziti'], ['izra', 'izraziti']]);
passive('žen', 'žiti', [['tra', 'tražiti'], ['ulo', 'uložiti'], ['polo', 'položiti']]);
passive('čen', 'čiti', [['u', 'učiti'], ['ozna', 'označiti'], ['odlu', 'odlučiti']], {min: 1});
passive('čen', 'ći', [['pe', 'peći'], ['re', 'reći'], ['obu', 'obući']]);
passive('ijen', 'iti', [['ub', 'ubiti'], ['pop', 'popiti']], {min: 1});
passive('iven', 'iti', [['saš', 'sašiti'], ['izl', 'izliti']]);
passive('uven', 'uti', [['ob', 'obuti']]);
passive('den', 'sti', [['ukra', 'ukrasti'], ['poje', 'pojesti']]);
passive('nesen', 'nijeti', [['do', 'donijeti'], ['od', 'odnijeti']], {min: 1});
passive('nesen', 'neti', [['do', 'doneti']], {min: 1});
// -t participles and the short infinitive before ću (radit ću): uzet,
// popit, pomaknut; radit, čitat.
// -t participles of -eti, -iti and -uti verbs (uzet, popit, pomaknut), which
// are also the short infinitive of those verbs (radit). -ati verbs make
// their participle in -an, so -at is not read here: brat, sat and rat are not
// brati, sati and rati. A stem of two letters before the vowel keeps pet,
// bit and put from reading as peti, biti and puti; the future (bit ću,
// čitat ću) is read by its own rules.
for (const vowel of ['e', 'i', 'u']) {
    for (const [ending, tags] of [['t', ['passive participle', 'short infinitive']], ['ta', ['passive participle, fem. sg.']], ['to', ['passive participle, neut. sg.']], ['te', ['passive participle, fem. pl.']]]) {
        const ex = {e: [['uz', 'uzeti'], ['ot', 'oteti']], i: [['pop', 'popiti'], ...(ending === 't' ? [['rad', 'raditi']] : [])], u: [['pomakn', 'pomaknuti'], ['ob', 'obuti']]}[vowel];
        sfx('verb-participle', vowel + ending, `${vowel}ti`, tags, ex.map(([stem, lemma]) => [stem + vowel + ending, lemma]), {in: ending === 't' ? ['adj'] : []});
    }
}

// Adverbial participles: present -ći (radeći, čitajući, pišući) and past
// -vši (uradivši, rekavši, došavši).
for (const [form, inf, examples, opts] of [
    ['ajući', 'ati', [['čitajući', 'čitati'], ['znajući', 'znati']], {min: 1}],
    ['ujući', 'ovati', [['kupujući', 'kupovati'], ['putujući', 'putovati']], {min: 1}],
    ['ujući', 'uti', [['čujući', 'čuti']], {min: 1}],
    ['ujući', 'ivati', [['pokazujući', 'pokazivati']], {min: 2}],
    ['ijući', 'iti', [['pijući', 'piti']], {min: 1}],
    ['ijući', 'ijati', [['smijući', 'smijati'], ['grijući', 'grijati']], {min: 1}],
    ['ejući', 'ejati', [['smejući', 'smejati'], ['grejući', 'grejati']], {min: 1}],
    ['eći', 'iti', [['radeći', 'raditi'], ['govoreći', 'govoriti'], ['noseći', 'nositi']], {min: 2}],
    ['eći', 'jeti', [['videći', 'vidjeti'], ['voleći', 'voljeti']], {min: 2}],
    ['eći', 'eti', [['videći', 'videti'], ['voleći', 'voleti']], {min: 2}],
    ['eći', 'ati', [['držeći', 'držati'], ['ležeći', 'ležati']], {end: '{afterA}'}],
    ['nući', 'nuti', [['krenući', 'krenuti']], {min: 1}],
    ['šući', 'sati', [['pišući', 'pisati']], {min: 1}],
    ['žući', 'zati', [['kažući', 'kazati']], {min: 1}],
    ['čući', 'kati', [['plačući', 'plakati'], ['skačući', 'skakati']], {min: 1}],
    ['ćući', 'tati', [['krećući', 'kretati']], {min: 1}],
    ['kući', 'ći', [['pekući', 'peći'], ['vukući', 'vući']], {min: 1}],
    ...STI_ROOTS.map(([root, base, examples]) => [`${root}ući`, `${base}sti`, examples.map(([form, lemma]) => [form.replace(/em$/, 'ući'), lemma]), {min: 0}]),
    ['erući', 'rati', [['berući', 'brati']], {min: 1}],
    ['ovući', 'vati', [['zovući', 'zvati']], {min: 1}],
]) {
    sfx('verb-adverbial', form, inf, ['present adverbial participle'], examples, opts);
}
for (const [form, inf, examples] of [
    ['avši', 'ati', [['pročitavši', 'pročitati'], ['ugledavši', 'ugledati']]],
    ['ivši', 'iti', [['uradivši', 'uraditi'], ['vrativši', 'vratiti']]],
    ['jevši', 'jeti', [['vidjevši', 'vidjeti']]],
    ['evši', 'eti', [['videvši', 'videti'], ['uzevši', 'uzeti']]],
    ['uvši', 'uti', [['čuvši', 'čuti'], ['krenuvši', 'krenuti']]],
    ['kavši', 'ći', [['rekavši', 'reći']]],
    ['gavši', 'ći', [['pomogavši', 'pomoći']]],
    ['šavši', 'ći', [['došavši', 'doći'], ['otišavši', 'otići']]],
]) {
    sfx('verb-adverbial', form, inf, ['past adverbial participle'], examples, {min: 1});
}

// Aorist (uradih, pročitah, rekoh, dođoh) and imperfect (čitah, rađah).
for (const [ending, person] of [['h', '1sg'], ['smo', '1pl'], ['ste', '2pl'], ['še', '3pl']]) {
    const impf = {h: 'imperfect 1sg', smo: 'imperfect 1pl', ste: 'imperfect 2pl', še: 'imperfect 2/3sg'}[ending];
    sfx('verb-past', `a${ending}`, 'ati', [`aorist ${person}`, impf], [[`pročita${ending}`, 'pročitati'], [`čita${ending}`, 'čitati']]);
    sfx('verb-past', `i${ending}`, 'iti', [`aorist ${person}`], [[`uradi${ending}`, 'uraditi'], [`vrati${ending}`, 'vratiti']]);
    sfx('verb-past', `je${ending}`, 'jeti', [`aorist ${person}`], [[`vidje${ending}`, 'vidjeti']], {min: 1});
    sfx('verb-past', `e${ending}`, 'eti', [`aorist ${person}`], [[`vide${ending}`, 'videti'], [`uze${ending}`, 'uzeti']]);
    sfx('verb-past', `u${ending}`, 'uti', [`aorist ${person}`], [[`krenu${ending}`, 'krenuti']]);
    sfx('verb-past', `ko${ending}`, 'ći', [`aorist ${person}`], [[`reko${ending}`, 'reći']], {min: 1});
    sfx('verb-past', `go${ending}`, 'ći', [`aorist ${person}`], [[`pomogo${ending}`, 'pomoći']], {min: 1});
    sfx('verb-past', `đo${ending}`, 'ći', [`aorist ${person}`], [[`dođo${ending}`, 'doći'], [`nađo${ending}`, 'naći']], {min: 1});
    for (const [root, base, examples] of STI_ROOTS) {
        sfx('verb-past', `${root}o${ending}`, `${base}sti`, [`aorist ${person}`], examples.map(([form, lemma]) => [form.replace(/em$/, `o${ending}`), lemma]), {min: 0});
    }
    // pasti, sjesti and sesti have another present stem (padnem, sjednem).
    for (const [root, base, prefixes] of [['pad', 'pa', ['', 'na', 'u']], ['sjed', 'sje', ['', 'pri']], ['sed', 'se', ['', 'pri']]]) {
        sfx('verb-past', `${root}o${ending}`, `${base}sti`, [`aorist ${person}`], prefixes.map((x) => [`${x}${root}o${ending}`, `${x}${base}sti`]), {min: 0});
    }
}
sfx('verb-past', 'ahu', 'ati', ['imperfect 3pl'], [['čitahu', 'čitati'], ['pisahu', 'pisati']]);
// The aorist 2/3sg of pasti, sjesti and sesti: pade, napade, sjede.
for (const [root, base, prefixes] of [['pad', 'pa', ['', 'na', 'u', 'pro', 'is']], ['sjed', 'sje', ['', 'pri']], ['sed', 'se', ['', 'pri']]]) {
    sfx('verb-past', `${root}e`, `${base}sti`, ['aorist 2/3sg'], prefixes.map((x) => [`${x}${root}e`, `${x}${base}sti`]), {min: 0});
}
for (const [ending, person] of [['ah', '1sg'], ['aše', '2/3sg'], ['asmo', '1pl'], ['aste', '2pl'], ['ahu', '3pl']]) {
    sfx('verb-past', `ij${ending}`, 'iti', [`imperfect ${person}`], [[`bij${ending}`, 'biti'], [`pij${ending}`, 'piti']], {min: 1});
    for (const [form, inf, examples] of [
        ['đ', 'diti', [['rađ', 'raditi'], ['hođ', 'hoditi']]], ['đ', 'djeti', [['viđ', 'vidjeti']]], ['đ', 'deti', [['viđ', 'videti']]],
        ['š', 'siti', [['noš', 'nositi']]], ['ž', 'ziti', [['vož', 'voziti']]], ['ć', 'titi', [['plać', 'platiti']]],
        ['lj', 'liti', [['molj', 'moliti']]], ['nj', 'niti', [['branj', 'braniti']]], ['plj', 'piti', [['kuplj', 'kupiti']]],
        ['blj', 'biti', [['ljublj', 'ljubiti']]], ['vlj', 'viti', [['stavlj', 'staviti']]], ['mlj', 'miti', [['lomlj', 'lomiti']]],
        ['št', 'stiti', [['pušt', 'pustiti']]],
    ]) {
        sfx('verb-past', `${form}${ending}`, inf, [`imperfect ${person}`], examples.map(([stem, lemma]) => [`${stem}${ending}`, lemma]), {min: 1});
    }
    sfx('verb-past', ending, 'iti', [`imperfect ${person}`], [[`govor${ending}`, 'govoriti'], [`uč${ending}`, 'učiti']], {end: '{nonJotated}'});
    // -jeti (ijekavian) and -eti (ekavian) verbs of the i-type: voljeti and
    // voleti → voljah, živjeti → življah, letjeti → lećah.
    for (const [form, root, examples] of [
        ['lj', 'l', [['vo', 'voljeti', 'voleti'], ['že', 'željeti', 'želeti']]], ['nj', 'n', [['mi', 'minjeti', 'mineti']]],
        ['plj', 'p', [['tr', 'trpjeti', 'trpeti']]], ['blj', 'b', [['zano', 'zanobjeti', 'zanobeti']]], ['vlj', 'v', [['ži', 'živjeti', 'živeti']]],
        ['mlj', 'm', [['gr', 'grmjeti', 'grmeti']]], ['ć', 't', [['le', 'letjeti', 'leteti'], ['vr', 'vrtjeti', 'vrteti']]],
        ['š', 's', [['vi', 'visjeti', 'viseti']]], ['ž', 'z', [['mr', 'mrzjeti', 'mrzeti']]],
    ]) {
        sfx('verb-past', `${form}${ending}`, `${root}jeti`, [`imperfect ${person}`],
            examples.map(([stem, ije]) => [`${stem}${form}${ending}`, ije]), {min: 1});
        sfx('verb-past', `${form}${ending}`, `${root}eti`, [`imperfect ${person}`],
            examples.map(([stem, , e]) => [`${stem}${form}${ending}`, e]), {min: 1});
    }
}

// Imperative (2sg, 1pl, 2pl) of the classes whose imperative is not the
// present 3sg: čitaj, kupuj, pij, piši, kaži, reci, dođi, uzmi.
const IMP = [['', '2sg'], ['mo', '1pl'], ['te', '2pl']];
function imperative(form, inf, examples, opts = {}) {
    for (const [ending, person] of IMP) {
        const ex = examples.map(([stem, lemma]) => [stem + form + ending, lemma]);
        sfx('verb-imperative', form + ending, inf, [`imperative ${person}`], ex, {min: opts.min ?? 1, end: opts.end});
    }
}
imperative('aj', 'ati', [['čit', 'čitati'], ['d', 'dati'], ['pit', 'pitati']]);
imperative('uj', 'ovati', [['kup', 'kupovati'], ['put', 'putovati']]);
imperative('uj', 'ivati', [['pokaz', 'pokazivati']], {min: 2});
imperative('uj', 'evati', [['kralj', 'kraljevati']], {end: PAL});
imperative('uj', 'uti', [['č', 'čuti']]);
imperative('ij', 'iti', [['p', 'piti'], ['ub', 'ubiti']]);
imperative('ij', 'jeti', [['razum', 'razumjeti']], {min: 2});
imperative('ši', 'sati', [['pi', 'pisati'], ['napi', 'napisati']]);
imperative('ši', 'hati', [['ma', 'mahati']]);
imperative('ži', 'zati', [['ka', 'kazati'], ['poka', 'pokazati']]);
imperative('ži', 'gati', [['la', 'lagati']]);
imperative('či', 'kati', [['pla', 'plakati'], ['vi', 'vikati']]);
imperative('či', 'cati', [['mi', 'micati'], ['umi', 'umicati']]);
imperative('ći', 'tati', [['kre', 'kretati'], ['okre', 'okretati']]);
imperative('ci', 'ći', [['re', 'reći'], ['pe', 'peći'], ['obu', 'obući']]);
imperative('zi', 'ći', [['le', 'leći'], ['pomo', 'pomoći']]);
imperative('đi', 'ći', [['do', 'doći'], ['na', 'naći'], ['u', 'ući'], ['iza', 'izaći']]);
for (const [root, base, examples] of STI_ROOTS) {
    imperative(`${root}i`, `${base}sti`, examples.map(([form, lemma]) => [form.slice(0, form.length - root.length - 2), lemma]), {min: 0});
}
imperative('tni', 'sti', [['sre', 'sresti'], ['susre', 'susresti']]);
imperative('ri', 'rati', [['prezi', 'prezirati'], ['o', 'orati'], ['prožde', 'prožderati']], {end: '[ieo]'});
imperative('nesi', 'nijeti', [['do', 'donijeti'], ['pre', 'prenijeti']]);
imperative('nesi', 'neti', [['do', 'doneti'], ['pre', 'preneti']]);
imperative('ni', 'nuti', [['kre', 'krenuti'], ['mak', 'maknuti'], ['okre', 'okrenuti']]);
imperative('stani', 'stati', [['', 'stati'], ['o', 'ostati'], ['pre', 'prestati']], {min: 0});
imperative('dni', 'sti', [['sje', 'sjesti'], ['pa', 'pasti']]);
imperative('gni', 'ći', [['di', 'dići'], ['sti', 'stići']]);
imperative('čni', 'četi', [['po', 'početi']]);
imperative('zmi', 'zeti', [['u', 'uzeti'], ['preu', 'preuzeti']], {min: 0});
imperative('eri', 'rati', [['b', 'brati'], ['izab', 'izabrati'], ['op', 'oprati']]);
imperative('ovi', 'vati', [['z', 'zvati'], ['poz', 'pozvati']]);
imperative('šalji', 'slati', [['po', 'poslati']], {min: 0});

// Future I: Serbian writes the infinitive without -ti together with ću
// (radiću, čitaćeš); Croatian writes it apart, the infinitive without -i
// (radit ću), and both write the -ći verbs whole (doći ću).
for (const [clitic, person] of [['ću', '1sg'], ['ćeš', '2sg'], ['će', '3sg/3pl'], ['ćemo', '1pl'], ['ćete', '2pl']]) {
    sfx('verb-future', clitic, 'ti', [`future ${person}`], [[`radi${clitic}`, 'raditi'], [`čita${clitic}`, 'čitati'], [`vidje${clitic}`, 'vidjeti']], {end: V});
    // The infinitive before the clitic ends in -ti or -ći after a vowel
    // (-sti after one: jesti; and bosti), or drops its -i (radit, jest), so nouns
    // before a clitic are not read as infinitives: vrt će is not vrteti,
    // studenti, gosti and radost će are not verbs.
    pattern('verb-future', {pattern: `^([^ ]*[aeiu]s?|[^ ]*bos)t ${clitic}$`, replacement: '$1ti', anchorSuffix: ` ${clitic}`},
        [`future ${person}`], [[`radit ${clitic}`, 'raditi'], [`čitat ${clitic}`, 'čitati'], [`jest ${clitic}`, 'jesti'], [`krenut ${clitic}`, 'krenuti']]);
    pattern('verb-future', {pattern: `^([^ ]*[aeiu]s?ti|[^ ]*bosti|[^ ]*[aeiou]ći) ${clitic}$`, replacement: '$1', anchorSuffix: ` ${clitic}`},
        [`future ${person}`], [[`doći ${clitic}`, 'doći'], [`raditi ${clitic}`, 'raditi'], [`ići ${clitic}`, 'ići'], [`jesti ${clitic}`, 'jesti']]);
}

// The verbal noun: čitanje, pisanje (čitati, pisati); its other cases are
// read through the noun rules (pitanja → pitanje → pitati).
const VN = {in: ['n']};
sfx('verb-noun', 'anje', 'ati', ['verbal noun'], [['čitanje', 'čitati'], ['pisanje', 'pisati'], ['pitanja', 'pitati']], VN);
// Without jotation after any consonant: govorenje, učenje, and after
// clusters that do not change (uništenje, sjedenje, zaposlenje).
sfx('verb-noun', 'enje', 'iti', ['verbal noun'], [['govorenje', 'govoriti'], ['učenje', 'učiti'], ['uništenje', 'uništiti'], ['zaposlenje', 'zaposliti']], VN);
for (const [form, inf, examples] of [
    ['đenje', 'diti', [['rođenje', 'roditi']]], ['šenje', 'siti', [['nošenje', 'nositi']]], ['ženje', 'ziti', [['voženje', 'voziti']]],
    ['ćenje', 'titi', [['posvećenje', 'posvetiti']]], ['ljenje', 'liti', [['hvaljenje', 'hvaliti']]],
    ['šljenje', 'sliti', [['mišljenje', 'misliti']]], ['njenje', 'niti', [['hranjenje', 'hraniti']]],
    ['vljenje', 'viti', [['pravljenje', 'praviti']]], ['pljenje', 'piti', [['trpljenje', 'trpiti']]], ['bljenje', 'biti', [['ljubljenje', 'ljubiti']]],
    ['mljenje', 'miti', [['lomljenje', 'lomiti']]], ['štenje', 'stiti', [['oproštenje', 'oprostiti']]],
]) {
    sfx('verb-noun', form, inf, ['verbal noun'], examples, {min: 1, ...VN});
}

// ===== Irregular verbs ======================================================

for (const [lemmas, forms] of [
    [['biti'], [['sam', 'present 1sg'], ['si', 'present 2sg'], ['je', 'present 3sg'], ['smo', 'present 1pl'], ['ste', 'present 2pl'], ['su', 'present 3pl'],
        ['jesam', 'present 1sg'], ['jesi', 'present 2sg'], ['jest', 'present 3sg'], ['jeste', 'present 3sg/2pl'], ['jesmo', 'present 1pl'], ['jesu', 'present 3pl'],
        ['nisam', 'negative present 1sg'], ['nisi', 'negative present 2sg'], ['nije', 'negative present 3sg'], ['nismo', 'negative present 1pl'],
        ['niste', 'negative present 2pl'], ['nisu', 'negative present 3pl'], ['nijesam', 'negative present 1sg'], ['nijesi', 'negative present 2sg'],
        ['nijesmo', 'negative present 1pl'], ['nijeste', 'negative present 2pl'], ['nijesu', 'negative present 3pl'],
        ['budem', 'present 1sg (perfective)'], ['budeš', 'present 2sg (perfective)'], ['bude', 'present 3sg (perfective)'],
        ['budemo', 'present 1pl (perfective)'], ['budete', 'present 2pl (perfective)'], ['budu', 'present 3pl (perfective)'],
        ['bih', 'aorist 1sg (conditional)'], ['bi', 'aorist 2/3sg (conditional)'], ['bismo', 'aorist 1pl (conditional)'], ['biste', 'aorist 2pl (conditional)'],
        ['biše', 'aorist 3pl'], ['bješe', 'imperfect 2/3sg'], ['beše', 'imperfect 2/3sg'], ['bejah', 'imperfect 1sg'], ['bejaše', 'imperfect 2/3sg'],
        ['budi', 'imperative 2sg'], ['budimo', 'imperative 1pl'], ['budite', 'imperative 2pl'], ['budući', 'present adverbial participle'],
        ['bivši', 'past adverbial participle']]],
    [['htjeti', 'hteti'], [['hoću', 'present 1sg'], ['hoćeš', 'present 2sg'], ['hoće', 'present 3sg/3pl'], ['hoćemo', 'present 1pl'], ['hoćete', 'present 2pl'],
        ['ću', 'present 1sg (clitic)'], ['ćeš', 'present 2sg (clitic)'], ['će', 'present 3sg/3pl (clitic)'], ['ćemo', 'present 1pl (clitic)'], ['ćete', 'present 2pl (clitic)'],
        ['neću', 'negative present 1sg'], ['nećeš', 'negative present 2sg'], ['neće', 'negative present 3sg/3pl'], ['nećemo', 'negative present 1pl'],
        ['nećete', 'negative present 2pl'], ['oću', 'present 1sg (colloquial)'], ['oćeš', 'present 2sg (colloquial)'], ['oće', 'present 3sg/3pl (colloquial)']]],
    [['htjeti'], [['htjedoh', 'aorist 1sg'], ['htjede', 'aorist 2/3sg'], ['htjedoše', 'aorist 3pl']]],
    [['hteti'], [['htedoh', 'aorist 1sg'], ['htede', 'aorist 2/3sg'], ['htedoše', 'aorist 3pl']]],
    [['ići'], [['idem', 'present 1sg'], ['ideš', 'present 2sg'], ['ide', 'present 3sg'], ['idemo', 'present 1pl'], ['idete', 'present 2pl'], ['idu', 'present 3pl'],
        ['idi', 'imperative 2sg'], ['idite', 'imperative 2pl'], ['idući', 'present adverbial participle'], ['idoh', 'aorist 1sg'], ['iđah', 'imperfect 1sg']]],
    [['moći'], [['mogu', 'present 1sg/3pl'], ['mogoh', 'aorist 1sg']]],
    [['dati'], [['dam', 'present 1sg'], ['daš', 'present 2sg'], ['da', 'present 3sg'], ['damo', 'present 1pl'], ['date', 'present 2pl'], ['daju', 'present 3pl']]],
    [['stajati'], [['stojim', 'present 1sg'], ['stojiš', 'present 2sg'], ['stoji', 'present 3sg'], ['stojimo', 'present 1pl'], ['stojite', 'present 2pl'], ['stoje', 'present 3pl']]],
    [['otići'], [['odem', 'present 1sg'], ['odeš', 'present 2sg'], ['ode', 'present 3sg'], ['odemo', 'present 1pl'], ['odete', 'present 2pl'],
        ['odu', 'present 3pl'], ['odi', 'imperative 2sg'], ['odoh', 'aorist 1sg'], ['odoše', 'aorist 3pl']]],
    [['klati'], [['koljem', 'present 1sg'], ['kolješ', 'present 2sg'], ['kolje', 'present 3sg'], ['koljemo', 'present 1pl'], ['koljete', 'present 2pl'],
        ['kolju', 'present 3pl'], ['kolji', 'imperative 2sg'], ['koljimo', 'imperative 1pl'], ['koljite', 'imperative 2pl']]],
    [['nemoj'], [['nemojmo', 'imperative 1pl'], ['nemojte', 'imperative 2pl']]],
    [['hajde'], [['hajdemo', 'imperative 1pl'], ['hajdete', 'imperative 2pl'], ['ajde', 'colloquial'], ['ajmo', 'colloquial 1pl']]],
]) {
    for (const lemma of lemmas) {
        for (const [form, tag] of forms) {
            whole('irregular-verb', form, lemma, [tag], [[form, lemma]]);
        }
    }
}

// --- Assemble ---------------------------------------------------------------

// Rules that match at one suffix node apply in file order (docs/languages.md
// 7.4), and readings that tie on every ranking key are shown in the order
// they were found (9.6), with the trace of the first rule that found them, so
// this order decides ties and traces. Nouns come before adjectives: where a
// noun and an adjective ending give the same text (gradu → grad, novu →
// nov), the noun's trace is shown, which suits the more frequent nouns (94%
// of the reached corpus rows show their own form against 93% with
// adjectives first); the frequent adjectives that would lose a tie to a noun
// are in PREFER below.
const GROUP_ORDER = ['irregular-verb', 'irregular-noun', 'pronoun', 'noun', 'adjective', 'comparative', 'verb-present', 'verb-participle',
    'verb-past', 'verb-imperative', 'verb-future', 'verb-adverbial', 'verb-noun'];

const GROUP_OUT = {
    // Possessives, demonstratives and relatives (moj, taj, koji) decline like
    // adjectives, and dictionaries tag them as pronouns.
    'irregular-verb': ['v'], 'irregular-noun': ['n'], 'pronoun': ['pron'], 'noun': ['n'], 'adjective': ['adj', 'pron'], 'comparative': ['adj'],
    'verb-present': ['v'], 'verb-participle': ['v'], 'verb-past': ['v'], 'verb-imperative': ['v'], 'verb-future': ['v'],
    'verb-adverbial': ['v'], 'verb-noun': ['v'],
};

function ruleOf(spec) {
    const {opts} = spec;
    const rule = {type: spec.type};
    if (spec.type === 'pattern') {
        Object.assign(rule, spec.fields);
    } else {
        rule.inflected = spec.inflected;
        rule.deinflected = spec.deinflected;
    }
    rule.conditionsIn = opts.in ?? [];
    rule.conditionsOut = opts.out ?? GROUP_OUT[spec.group];
    if (spec.type === 'suffix' || spec.type === 'prefix') {
        const min = opts.min ?? 2;
        if (min > 0) { rule.stemMinLength = min; }
        // Verbs and adjectives are written in lower case, so their rules do
        // not read a capitalised word (lowerStem): the sentence-initial Kao
        // is not read as an l-participle (→ Kati → the name Kata) and Gospodo
        // not as an adjective (→ Gospod); its lower-case variant, which the
        // decapitalize processor gives, is.
        rule.stemCharacters = opts.lower || rule.conditionsOut.some((c) => c === 'v' || c === 'adj' || c === 'cmp') ? '{lowerStem}' : '{stem}';
        if (opts.end) { rule.stemEndsWith = opts.end; }
        if (opts.notEnd) { rule.stemNotEndsWith = opts.notEnd; }
        if (opts.notStartText) { rule.stemNotStartsWithText = opts.notStartText; }
        if (opts.change) {
            rule.stemChange = {from: opts.change.from, to: opts.change.to, occurrence: opts.change.occurrence};
            if (opts.change.between) { rule.stemChange.between = opts.change.between; }
        }
    }
    return rule;
}

function key(rule) { return JSON.stringify(rule); }

// Merge specs with the same rule.
const merged = new Map();
for (const spec of specs) {
    if (spec.tags.length === 0) { continue; }
    const k = key(ruleOf(spec));
    const existing = merged.get(k);
    if (existing === undefined) {
        merged.set(k, {spec, tags: [...spec.tags], examples: [...spec.examples], group: spec.group});
    } else {
        for (const t of spec.tags) { if (!existing.tags.includes(t)) { existing.tags.push(t); } }
        for (const e of spec.examples) { if (!existing.examples.some(([f, l]) => f === e[0] && l === e[1])) { existing.examples.push(e); } }
        if (GROUP_ORDER.indexOf(spec.group) < GROUP_ORDER.indexOf(existing.group)) { existing.group = spec.group; }
    }
}

// --- Preferred readings of frequent homographs -------------------------------
// A frequent word that two rules read as two lemmas of the dictionary shows
// the reading found first. For these words the reading of the dominant
// lemma is also written as a whole-word rule, which the deinflector finds
// before any shorter ending (7.4), in the transform of the suffix rule that
// already makes that reading: the trace stays the same and no reading is
// added. The words are those of the 10,000 most frequent words of
// FrequencyWords hr_50k and sr_50k whose first result was another lemma
// the word's form-of rows name, judged by this pack's auditor (hr,
// sources/judged-ties-hr.tsv) and its author (sr): the dominant reading in
// ordinary text; words whose readings are both common are left out. A few
// more were found in the judged samples of the real texts (teče, stupi,
// jezeru, rešeno). [word, lemma, ...more lemmas]
const PREFER = [
    // verb forms read as nouns or adjectives
    ['nema', 'nemati'], ['izgleda', 'izgledati'], ['čeka', 'čekati'], ['pada', 'padati'], ['hoda', 'hodati'],
    ['reci', 'reći'], ['obuci', 'obući'], ['radim', 'raditi'], ['rade', 'raditi'], ['pusti', 'pustiti'], ['pustim', 'pustiti'],
    ['misli', 'misliti'], ['pomisli', 'pomisliti'], ['zamisli', 'zamisliti'], ['govori', 'govoriti'], ['govore', 'govoriti'],
    ['otvori', 'otvoriti'], ['zatvori', 'zatvoriti'], ['odgovori', 'odgovoriti'], ['zaboravi', 'zaboraviti'], ['koristi', 'koristiti'],
    ['koriste', 'koristiti'], ['ostavi', 'ostaviti'], ['nastavi', 'nastaviti'], ['napravi', 'napraviti'], ['javi', 'javiti'],
    ['kupi', 'kupiti'], ['plati', 'platiti'], ['sredi', 'srediti'], ['pojavi', 'pojaviti'], ['pripremi', 'pripremiti'],
    ['provjeri', 'provjeriti'], ['proveri', 'proveriti'], ['promeni', 'promeniti'], ['pozdravi', 'pozdraviti'], ['zaštiti', 'zaštititi'],
    ['dozvoli', 'dozvoliti'], ['dopusti', 'dopustiti'], ['izlazi', 'izlaziti'], ['nalazi', 'nalaziti'], ['nalaze', 'nalaziti'],
    ['prolazi', 'prolaziti'], ['donosi', 'donositi'], ['tvrdi', 'tvrditi'], ['udari', 'udariti'], ['bori', 'boriti'], ['bore', 'boriti'],
    ['spremi', 'spremiti'], ['odmori', 'odmoriti'], ['skloni', 'skloniti'], ['spasi', 'spasiti'], ['muči', 'mučiti'], ['važi', 'važiti'],
    ['zvoni', 'zvoniti'], ['čine', 'činiti'], ['sude', 'suditi'], ['nose', 'nositi'], ['vrate', 'vratiti'], ['traže', 'tražiti'],
    ['vise', 'visiti'], ['kasnim', 'kasniti'], ['kasni', 'kasniti'], ['pravim', 'praviti'], ['razume', 'razumeti'],
    ['vole', 'voljeti', 'voleti'], ['vide', 'vidjeti', 'videti'], ['želi', 'željeti', 'želeti'], ['živim', 'živjeti', 'živeti'],
    ['sedi', 'sedeti'], ['bojim', 'bojati'], ['bojiš', 'bojati'], ['boji', 'bojati'], ['pomaže', 'pomagati'], ['pomažem', 'pomagati'],
    ['biću', 'biti'],
    // feminine nouns read as masculine ones, and nouns read as verbs
    ['sobu', 'soba'], ['sobe', 'soba'], ['vodu', 'voda'], ['vode', 'voda'], ['vodom', 'voda'], ['kosu', 'kosa'], ['kose', 'kosa'],
    ['strane', 'strana'], ['stranu', 'strana'], ['ulogu', 'uloga'], ['tatu', 'tata'], ['tate', 'tata'], ['tatom', 'tata'],
    ['dušu', 'duša'], ['duše', 'duša'], ['rane', 'rana'], ['tajne', 'tajna'], ['tajnu', 'tajna'], ['veze', 'veza'], ['vezi', 'veza'],
    ['vezu', 'veza'], ['listu', 'lista'], ['robu', 'roba'], ['boju', 'boja'], ['šumu', 'šuma'], ['šume', 'šuma'], ['brigu', 'briga'],
    ['zamku', 'zamka'], ['metu', 'meta'], ['mete', 'meta'], ['mačke', 'mačka'], ['šale', 'šala'],
    ['sine', 'sin'], ['sinu', 'sin'], ['stanu', 'stan'], ['planu', 'plan'], ['planete', 'planet'],
    ['tela', 'telo'], ['pravila', 'pravilo'], ['krila', 'krilo'], ['svetla', 'svetlo'], ['jezera', 'jezero'],
    ['pogleda', 'pogledati'], ['sjeti', 'sjetiti'], ['seti', 'setiti'], ['pjeva', 'pjevati'], ['peva', 'pevati'], ['vara', 'varati'],
    ['puši', 'pušiti'], ['naprave', 'napraviti'], ['znače', 'značiti'], ['pleše', 'plesati'], ['slijede', 'slijediti'],
    ['obrati', 'obratiti'], ['žali', 'žaliti'], ['rodi', 'roditi'], ['uda', 'udati'], ['jure', 'juriti'], ['ostave', 'ostaviti'],
    ['zahvali', 'zahvaliti'], ['stave', 'staviti'], ['ispravi', 'ispraviti'], ['obavesti', 'obavestiti'], ['napiše', 'napisati'],
    ['dobiću', 'dobiti'], ['kiše', 'kiša'], ['kiši', 'kiša'], ['duši', 'duša'], ['liste', 'lista'], ['bravu', 'brava'],
    ['pade', 'pasti'], ['puše', 'puhati', 'pušiti'], ['teče', 'teći'], ['stupi', 'stupiti'],
    ['jezeru', 'jezero'], ['jezerom', 'jezero'], ['jezerima', 'jezero'],
    ['rešen', 'rešiti'], ['rešeno', 'rešiti'], ['rešeni', 'rešiti'], ['rešene', 'rešiti'],
    // adjectives and pronouns: nouns come first (GROUP_ORDER), so the
    // frequent adjectives whose forms are also forms of a rare noun are
    // written out (drugi, svaki, nov; the nouns drug, svak, nova).
    ['stare', 'star:adj'], ['sretni', 'sretan'], ['nekima', 'neki'],
    ...['a', 'e', 'o', 'u', 'og', 'oga', 'om', 'ome', 'omu', 'oj', 'im', 'ima', 'ih'].flatMap((e) => [[`drug${e}`, 'drugi'], [`svak${e}`, 'svaki']]),
    // A lemma written lemma:adj is read by the adjective rules, where a noun
    // rule also makes it (stare → star, nove → nov).
    ['novo', 'nov:adj'], ['novu', 'nov:adj'], ['nove', 'nov:adj'], ['novom', 'nov:adj'], ['novoj', 'nov:adj'],
    ['vojne', 'vojni:adj'], ['vojnu', 'vojni:adj'], ['pete', 'peti:adj'],
];

const classSet = new ClassSet(JSON.parse(readFileSync(join(pack, 'language.json'), 'utf8')).classes);
const matchers = new Map();
const matches = (cls, character) => {
    if (!matchers.has(cls)) { matchers.set(cls, classSet.matcher(cls)); }
    return matchers.get(cls)(character.codePointAt(0));
};
/** The text one suffix rule makes of a word, or null (rules with a stem change are not tried). */
function oneStep(rule, word) {
    if (rule.type !== 'suffix' || rule.stemChange !== undefined || !word.endsWith(rule.inflected)) { return null; }
    const stem = word.slice(0, word.length - rule.inflected.length);
    const cps = [...stem];
    if (cps.length < (rule.stemMinLength ?? 0)) { return null; }
    if (rule.stemCharacters !== undefined && !cps.every((c) => matches(rule.stemCharacters, c))) { return null; }
    if (rule.stemEndsWith !== undefined && (cps.length === 0 || !matches(rule.stemEndsWith, cps.at(-1)))) { return null; }
    if (rule.stemNotEndsWith !== undefined && cps.length > 0 && matches(rule.stemNotEndsWith, cps.at(-1))) { return null; }
    if (rule.stemNotStartsWithText !== undefined && stem.startsWith(rule.stemNotStartsWithText)) { return null; }
    return stem + rule.deinflected;
}
for (const [word, ...readings] of PREFER) {
    for (const reading of readings) {
        const [lemma, as] = reading.split(':');
        const groups = as === 'adj' ? ['adjective', 'comparative'] : null;
        const entry = [...merged.values()].find((e) => (groups === null || groups.includes(e.group)) && oneStep(ruleOf(e.spec), word) === lemma);
        if (entry === undefined) { throw new Error(`PREFER: no suffix rule reads ${word} as ${lemma}`); }
        const spec = {group: entry.group, type: 'wholeWord', inflected: word, deinflected: lemma, tags: entry.tags, examples: [[word, lemma]],
            opts: {out: ruleOf(entry.spec).conditionsOut}};
        const k = key(ruleOf(spec));
        if (!merged.has(k)) { merged.set(k, {spec, tags: [...entry.tags], examples: [[word, lemma]], group: entry.group}); }
    }
}

// Group merged rules by their set of forms.
const TAG_ORDER = [];
for (const spec of specs) { for (const t of spec.tags) { if (!TAG_ORDER.includes(t)) { TAG_ORDER.push(t); } } }
const byTags = new Map();
for (const entry of merged.values()) {
    entry.tags.sort((a, b) => TAG_ORDER.indexOf(a) - TAG_ORDER.indexOf(b));
    const k = `${entry.group}\u0000${entry.tags.join('\u0000')}`;
    if (!byTags.has(k)) { byTags.set(k, {group: entry.group, tags: entry.tags, entries: []}); }
    byTags.get(k).entries.push(entry);
}

const slug = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'dj').toLowerCase().replace(/past \(l-participle\)/g, 'past').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ID_PREFIX = {
    'noun': 'n', 'irregular-noun': 'n-irr', 'adjective': 'adj', 'comparative': 'cmp', 'pronoun': 'pron', 'verb-present': 'prs',
    'verb-participle': 'ptcp', 'verb-past': 'past', 'verb-imperative': 'imp', 'verb-future': 'fut', 'verb-adverbial': 'advp',
    'verb-noun': 'vn', 'irregular-verb': 'v-irr',
};
// Shown before the forms in a transform's name, where they could be read as
// another part of speech's.
const NAME_PREFIX = {'adjective': 'adj. ', 'pronoun': 'pron. '};
const DESCRIPTIONS = {
    'noun': 'Noun ending',
    'irregular-noun': 'Irregular noun form',
    'adjective': 'Adjective ending',
    'comparative': 'Comparative or superlative',
    'pronoun': 'Pronoun or numeral form',
    'verb-present': 'Present tense',
    'verb-participle': 'Participle',
    'verb-past': 'Aorist or imperfect',
    'verb-imperative': 'Imperative',
    'verb-future': 'Future I',
    'verb-adverbial': 'Adverbial participle',
    'verb-noun': 'Verbal noun',
    'irregular-verb': 'Irregular verb form',
};

/**
 * Suffix rules of one transform that differ only in their ending pair are
 * written as one circumfix row in the cross-product form (section 7.3) with
 * an empty prefix: `{"type": "circumfix", "prefixes": [["", ""]],
 * "suffixes": [["am", "ati"], ["aš", "ati"], ...]}` stands for the suffix
 * rules `am` → `ati`, `aš` → `ati`, ... with the row's conditions and stem
 * constraints. The engine expands them when the pack loads; the file and
 * tests/classes.json, which lists each row's stem classes, stay small.
 */
function compact(rules) {
    const out = [];
    const rows = new Map();
    for (const rule of rules) {
        if (rule.type !== 'suffix') {
            out.push(rule);
            continue;
        }
        const {type: _type, inflected, deinflected, ...rest} = rule;
        const signature = JSON.stringify(rest);
        const row = rows.get(signature);
        if (row === undefined) {
            const entry = {rule, pairs: [[inflected, deinflected]], rest};
            rows.set(signature, entry);
            out.push(entry);
        } else {
            row.pairs.push([inflected, deinflected]);
        }
    }
    return out.map((item) => {
        if (item.pairs === undefined) { return item; }
        if (item.pairs.length === 1) { return item.rule; }
        return {type: 'circumfix', prefixes: [['', '']], suffixes: item.pairs, ...item.rest};
    });
}

const groups = [...byTags.values()].sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
const transforms = [];
const usedIds = new Set();
const exampleRows = [];
for (const g of groups) {
    const name = (NAME_PREFIX[g.group] ?? '') + g.tags.join(', ');
    const base = `${ID_PREFIX[g.group]}-${slug(g.tags.join(' '))}`.slice(0, 48).replace(/-$/, '');
    let id = base;
    for (let n = 2; usedIds.has(id); ++n) { id = `${base}-${n}`; }
    usedIds.add(id);
    const examples = g.entries.flatMap((e) => e.examples);
    const shown = [...new Set(examples.map(([f, l]) => `${f} → ${l}`))].slice(0, 4).join(', ');
    const rules = [];
    for (const e of g.entries) {
        rules.push(ruleOf(e.spec));
        for (const [form, lemma] of e.examples) {
            exampleRows.push([id, form, lemma]);
            // The same form in Cyrillic, which cyrillicToLatin gives back.
            exampleRows.push([id, toCyrillic(form), lemma]);
        }
    }
    transforms.push({id, name, description: `${DESCRIPTIONS[g.group]}: ${name}${shown ? ` (${shown})` : ''}.`, source: 'own', rules: compact(rules)});
}

const own = {schema: 1, conditions, transforms};
writeFileSync(join(here, 'own.json'), formatTransforms(own));
// --examples <file>: every example as `transform<TAB>form<TAB>lemma`, for
// checking the rules (sources/check-examples.mjs) and building tests/cases.tsv.
const examplesAt = process.argv.indexOf('--examples');
if (examplesAt !== -1) {
    writeFileSync(process.argv[examplesAt + 1], `${exampleRows.map((r) => r.join('\t')).join('\n')}\n`);
}
// --cases <file>: replaces the block of the file after CASES_MARKER with one
// example of each transform, so that every transform has a passing row;
// sources/build-corpus.mjs then writes each row's reasons (its trace).
const CASES_MARKER = '# --- One example of each transform, written by sources/build-own.mjs --cases (hand-written examples, no third-party data) ---';
const casesAt = process.argv.indexOf('--cases');
if (casesAt !== -1) {
    const file = process.argv[casesAt + 1];
    const text = readFileSync(file, 'utf8');
    const head = text.includes(CASES_MARKER) ? text.slice(0, text.indexOf(CASES_MARKER)) : text.replace(/\n*$/, '\n');
    const block = groups.map((g, i) => {
        const [form, lemma] = g.entries.flatMap((e) => e.examples).find(([f, l]) => f !== l);
        return `rule example\t1\t${form}\t${lemma}\t${GROUP_OUT[g.group][0]}\t*`;
    });
    writeFileSync(file, `${head}${CASES_MARKER}\n${block.join('\n')}\n`);
}
if (process.argv.includes('--transforms')) {
    writeFileSync(join(pack, 'transforms.json'), formatTransforms(own));
}
const rows = transforms.reduce((n, t) => n + t.rules.length, 0);
const ruleCount = transforms.reduce((n, t) => n + t.rules.reduce((m, r) => m + (r.suffixes ? r.suffixes.length * r.prefixes.length : 1), 0), 0);
console.log(`own.json: ${transforms.length} transforms, ${ruleCount} rules in ${rows} rows; ${exampleRows.length} examples`);
