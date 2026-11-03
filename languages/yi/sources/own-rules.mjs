// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/yi/sources/own.json: Yiddish deinflection rules written for
// this pack (docs/languages.md, section 14 step 2), before Yomitan's Yiddish
// rules were read. The rules follow the standard (YIVO) description of Yiddish
// morphology: verb conjugation (present, imperative, participles, separable
// particles), noun plurals and diminutives, adjective declension and
// comparison, and the 2sg clitic -סטו. Spelling is YIVO's, as the recommended
// dictionary (wty-yi-en) writes its headwords: pointed alefs (אַ, אָ), פּ/פֿ,
// ײַ for /ay/, final letters at the end of a word.
//
// Run: node languages/yi/sources/own-rules.mjs

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// --- Alphabet ----------------------------------------------------------------------------
const PATAH = '\u05B7';
const KAMATS = '\u05B8';
const HIRIQ = '\u05B4';
const DAGESH = '\u05BC';
const RAFE = '\u05BF';
const FE = 'פ' + RAFE;       // פֿ, written ף at the end of a word
const PE = 'פ' + DAGESH;     // פּ, the same at the end of a word
const AY = '\u05F2' + PATAH; // ײַ
const A = 'א' + PATAH;       // אַ
const O = 'א' + KAMATS;      // אָ

// A letter's form before an ending and at the end of a word.
const FINAL_OF = {'כ': 'ך', 'מ': 'ם', 'נ': 'ן', [FE]: 'ף', 'צ': 'ץ'};
const finalForm = (s) => {
    for (const [medial, final] of Object.entries(FINAL_OF)) {
        if (s.endsWith(medial)) { return s.slice(0, -medial.length) + final; }
    }
    return s;
};
const medialForm = (s) => {
    for (const [medial, final] of Object.entries(FINAL_OF)) {
        if (s.endsWith(final)) { return s.slice(0, -final.length) + medial; }
    }
    return s;
};

// Classes of language.json used in stem constraints.
const VOWEL_END = '{vowelEnd}';   // a vowel letter or vowel point ends the stem
const CONSONANT = '{consonant}';  // consonant letters and their points
const ONE_WORD = '[^ ]';          // the stem has no space: the rule reads one word
// Medial letters that never end a word: a stem ending in one of them is not a
// dictionary form (פֿ ends in rafe, which בֿ shares; בֿ endings get their own rules).
const NOT_FINAL_FORM = '[כמנצ\\u05BF]';

// --- Output structures -------------------------------------------------------------------
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    v_sep: {name: 'Verb with its separable particle put back', isDictionaryForm: false},
    v_2sg: {name: 'Second person singular verb form', isDictionaryForm: false},
    n_dim: {name: 'Diminutive noun', isDictionaryForm: false},
};

const transforms = [];
const byId = new Map();
function transform(id, name, description) {
    const t = {id, name, description, source: 'own', rules: []};
    transforms.push(t);
    byId.set(id, t);
    return t;
}
const seen = new Set();
function add(id, rule) {
    const t = byId.get(id);
    if (t === undefined) { throw new Error(`unknown transform ${id}`); }
    const key = JSON.stringify(rule);
    if (seen.has(id + key)) { return; }
    seen.add(id + key);
    t.rules.push(rule);
}
function suffix(id, inflected, deinflected, conditionsIn, conditionsOut, extra = {}) {
    if (inflected === deinflected && extra.stemChange === undefined) { return; }
    add(id, {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, stemCharacters: ONE_WORD, ...extra});
}
function prefix(id, inflected, deinflected, conditionsIn, conditionsOut, extra = {}) {
    add(id, {type: 'prefix', inflected, deinflected, conditionsIn, conditionsOut, stemCharacters: ONE_WORD, ...extra});
}
function wholeWord(id, inflected, deinflected, conditionsIn, conditionsOut) {
    add(id, {type: 'wholeWord', inflected, deinflected, conditionsIn, conditionsOut});
}

// --- Verbs -------------------------------------------------------------------------------
// The infinitive is the stem and -ן, or -ען after ם, ן, נג, נק, a consonant and ל
// (syllabic l), and some vowels. A stem's last letters (`tail`, written as
// before an ending) and the infinitive endings that can follow them (`inf`); `c`
// constrains the letter before the tail where the ending depends on it.
const GENERIC_TAILS = ['ב', 'ב' + RAFE, 'ג', 'ד', 'ה', 'ז', 'ח', 'ט', 'כ' + DAGESH, 'ס', PE, 'ק', 'ר', 'ש', 'ש\u05C2', 'ת', 'ת' + DAGESH, 'א'];
const VERB_TAILS = [
    {tail: 'כ', inf: ['כן']},
    {tail: 'מ', inf: ['מען']},
    {tail: 'נג', inf: ['נגען']},
    {tail: 'נק', inf: ['נקען']},
    {tail: 'נ', inf: ['נען']},                                   // וווין → וווינען, לערן → לערנען
    {tail: 'נ', inf: ['ענען'], c: {stemNotEndsWith: VOWEL_END}},  // syllabic n: צייכן → צייכענען
    {tail: FE, inf: [FE + 'ן']},
    {tail: 'צ', inf: ['צן']},
    {tail: 'ל', inf: ['לן'], c: {stemEndsWith: VOWEL_END}},       // שטעל → שטעלן
    {tail: 'ל', inf: ['לען'], c: {stemNotEndsWith: VOWEL_END}},   // syllabic l: שמייכל → שמייכלען
    {tail: 'ע', inf: ['ען', 'ענען']},                             // זע → זען; גנבֿע → גנבֿענען
    {tail: 'י' + HIRIQ, inf: ['י' + HIRIQ + 'ען']},               // בליִ → בליִען
    {tail: AY, inf: [AY + 'ען']},                                 // שרײַ → שרײַען
    {tail: 'י', inf: ['ין', 'יען']},                               // גיי → גיין; דריי → דרייען
    {tail: 'ו', inf: ['ון', 'וען']},                               // פּרוּוו → פּרוּוון; רו → רוען
    ...GENERIC_TAILS.map((tail) => ({tail, inf: [tail + 'ן']})),
];
// Endings after the stem, each with the stem tails it follows.
const verbEndings = (ending, skip = []) => {
    const out = [];
    for (const {tail, inf, c = {}} of VERB_TAILS) {
        if (skip.includes(tail)) { continue; }
        const inflected = ending === '' ? finalForm(tail) : tail + ending;
        for (const d of inf) { out.push({inflected, deinflected: d, c}); }
    }
    return out;
};

transform('stem', '1sg present / imperative',
    'First person singular present (איך מאַך) or singular imperative (מאַך!): the stem without an ending; also the third person singular of stems in -ט (ער אַרבעט) and of modal verbs (ער קען). מאַך → מאַכן.');
transform('2sg', '2sg present',
    'Second person singular present: the stem and -סט (דו מאַכסט); stems in -ס take -ט (דו עסט). מאַכסט → מאַכן.');
transform('3sg', '3sg / 2pl present',
    'Third person singular or second person plural present, or the plural imperative: the stem and -ט (ער מאַכט, איר מאַכט, מאַכט!). מאַכט → מאַכן.');
transform('1pl', '1pl / 3pl present',
    'First or third person plural present where it differs from the infinitive: מיר זענען → זײַן, מיר גייען → גיין.');
transform('pastParticiple', 'past participle',
    'The past participle: גע- and -ט (געמאַכט → מאַכן), or גע- and a changed stem and -ן (געשריבן → שרײַבן); after a separable particle (אָנגעהויבן → אָנהייבן); without גע- after an unstressed prefix (פֿאַרשטאַנען → פֿאַרשטיין) and in verbs in -ירן (שטודירט). Also declined like an adjective (געמאַכטע).');
transform('presentParticiple', 'present participle',
    'The present participle, the infinitive and -דיק (מאַכנדיק → מאַכן, גייענדיק → גיין), also declined like an adjective (מאַכנדיקע).');
transform('zuInfinitive', 'infinitive with צו',
    'צו written between a separable particle and the infinitive: אָנצוהייבן → אָנהייבן.');
transform('separable', 'separable particle',
    'A separable particle written after the verb, put back before it: הייבט אָן → אָנהייבט (then → אָנהייבן).');
transform('cliticDu', '+ דו',
    'The pronoun דו written onto a second person singular verb: האָסטו (האָסט דו), ביסטו, ווילסטו → ווילסט.');
transform('compoundVerb', 'compound verb',
    'A verb of a word and האָבן, זײַן or ווערן, with the auxiliary conjugated before the word: האָט ליב → ליב האָבן, איז מסכּים → מסכּים זײַן.');

const FINITE_IN = ['v_sep'];
for (const {inflected, deinflected, c} of verbEndings('')) {
    suffix('stem', inflected, deinflected, FINITE_IN, ['v'], {stemMinLength: 1, ...c});
}
for (const {inflected, deinflected, c} of verbEndings('סט', ['ס'])) {
    suffix('2sg', inflected, deinflected, ['v_sep', 'v_2sg'], ['v'], {stemMinLength: 1, ...c});
}
for (const {inflected, deinflected, c} of verbEndings('ט', ['ט'])) {
    suffix('3sg', inflected, deinflected, FINITE_IN, ['v'], {stemMinLength: 1, ...c});
}

// Separable particles. Written before the verb they end in a medial letter
// (אָן → אָנהייבן).
const PARTICLES = ['אָן', 'אָפּ', 'אויס', 'אויף', 'אײַן', 'אַוועק', 'אַהיים', 'אַהין', 'אַהער', 'אַדורך', 'אַנטקעגן', 'אַראָפּ',
    'אַרויס', 'אַרויף', 'אַרום', 'אַרײַן', 'אַריבער', 'אַרונטער', 'אַנידער', 'בײַ', 'דורך', 'מיט', 'נאָך', 'פֿאָר', 'פֿאָרויס',
    'פֿאַרבײַ', 'פֿונאַנדער', 'צו', 'צוזאַמען', 'צונויף', 'צוריק', 'איבער', 'אונטער'];
// Unstressed prefixes, after which the participle has no גע-.
const INSEPARABLE = ['באַ', 'גע', 'דער', 'אַנט', 'פֿאַר', 'צע'];

// Weak participles: גע + stem + ט, as a cross product of the prefixes (with the
// particles) and the stem endings, one row per stem constraint.
const ppPrefixes = [['גע', ''], ...PARTICLES.map((p) => [medialForm(p) + 'גע', medialForm(p)])];
const ppSuffixes = new Map();
for (const {inflected, deinflected, c} of [...verbEndings('ט', ['ט']), {inflected: 'ט', deinflected: 'טן', c: {}}]) {
    const key = JSON.stringify(c);
    if (!ppSuffixes.has(key)) { ppSuffixes.set(key, {c, pairs: []}); }
    ppSuffixes.get(key).pairs.push([inflected, deinflected]);
}
for (const {c, pairs} of ppSuffixes.values()) {
    add('pastParticiple', {type: 'circumfix', prefixes: ppPrefixes, suffixes: pairs, conditionsIn: ['adj'], conditionsOut: ['v'],
        stemCharacters: ONE_WORD, stemMinLength: 1, ...c});
}

// Strong participles (and weak ones with a changed stem): the participle after
// גע and the infinitive.
const STRONG = [
    ['שריבן', 'שרײַבן'], ['בליבן', 'בלײַבן'], ['טריבן', 'טרײַבן'], ['ריבן', 'רײַבן'], ['קליבן', 'קלײַבן'], ['שניטן', 'שנײַדן'],
    ['ליטן', 'לײַדן'], ['ריסן', 'רײַסן'], ['ביסן', 'בײַסן'], ['שמיסן', 'שמײַסן'], ['שינען', 'שײַנען'], ['גריפֿן', 'גרײַפֿן'],
    ['פֿיפֿן', 'פֿײַפֿן'], ['שליפֿן', 'שלײַפֿן'], ['שריִען', 'שרײַען'], ['שפּיגן', 'שפּײַען'], ['ריטן', 'רײַטן'], ['ביטן', 'בײַטן'],
    ['שוויגן', 'שווײַגן'], ['שטיגן', 'שטײַגן'], ['וויזן', 'ווײַזן'], ['מיטן', 'מײַדן'], ['שליכן', 'שלײַכן'], ['ציגן', 'צײַען'],
    ['צויגן', 'ציִען'], ['פֿלויגן', 'פֿליִען'], ['בויגן', 'בייגן'], ['לעגן', 'ליגן'], ['קראָגן', 'קריגן'], ['שאָסן', 'שיסן'],
    ['גאָסן', 'גיסן'], ['פֿלאָסן', 'פֿליסן'], ['שלאָסן', 'שליסן'], ['דראָסן', 'דריסן'], ['לוירן', 'לירן'], ['פֿרוירן', 'פֿרירן'],
    ['זאָטן', 'זידן'], ['קראָכן', 'קריכן'], ['טרונקען', 'טרינקען'], ['זונגען', 'זינגען'], ['שפּרונגען', 'שפּרינגען'],
    ['קלונגען', 'קלינגען'], ['זונקען', 'זינקען'], ['שונדן', 'שינדן'], ['בונדן', 'בינדן'], ['פֿונען', 'פֿינען'], ['וווּנען', 'ווינען'],
    ['שוווּמען', 'שווימען'], ['רונען', 'רינען'], ['צוווּנגען', 'צווינגען'], ['שטונקען', 'שטינקען'], ['שוווּנדן', 'שווינדן'],
    ['צונדן', 'צינדן'], ['שלונגען', 'שלינגען'], ['דרונגען', 'דרינגען'], ['וואָרפֿן', 'וואַרפֿן'], ['האָלפֿן', 'העלפֿן'],
    ['שטאָרבן', 'שטאַרבן'], ['וואָרן', 'ווערן'], ['שאָלטן', 'שעלטן'], ['מאָלקן', 'מעלקן'], ['בראָכן', 'ברעכן'], ['שטאָכן', 'שטעכן'],
    ['טראָפֿן', 'טרעפֿן'], ['נומען', 'נעמען'], ['קומען', 'קומען'], ['שראָקן', 'שרעקן'], ['פֿאָכטן', 'פֿעכטן'], ['פֿלאָכטן', 'פֿלעכטן'],
    ['הויבן', 'הייבן'], ['רופֿן', 'רופֿן'], ['לאָפֿן', 'לויפֿן'], ['שלאָפֿן', 'שלאָפֿן'], ['האַנגען', 'הענגען'], ['גאַנגען', 'גיין'],
    ['שטאַנען', 'שטיין'], ['זען', 'זען'], ['זעסן', 'זיצן'], ['געסן', 'עסן'], ['פֿרעסן', 'פֿרעסן'], ['מאָסטן', 'מעסטן'],
    ['געבן', 'געבן'], ['טראָגן', 'טראָגן'], ['שלאָגן', 'שלאָגן'], ['פֿאָרן', 'פֿאָרן'], ['גראָבן', 'גראָבן'],
    ['וואַקסן', 'וואַקסן'], ['וואַשן', 'וואַשן'], ['באַקן', 'באַקן'], ['לאָדן', 'לאַדן'], ['האַלטן', 'האַלטן'], ['פֿאַלן', 'פֿאַלן'],
    ['לאָזן', 'לאָזן'], ['בראָטן', 'בראָטן'], ['הייסן', 'הייסן'], ['טאָן', 'טאָן'], ['ווען', 'זײַן'], ['וועזן', 'זײַן'], ['האַט', 'האָבן'],
    ['וווּסט', 'וויסן'], ['בראַכט', 'ברענגען'], ['וואָלט', 'וועלן'], ['טראָטן', 'טרעטן'], ['בעטן', 'בעטן'], ['שוואָרן', 'שווערן'],
    ['שוירן', 'שערן'], ['ווויגן', 'וועגן'], ['שטויסן', 'שטויסן'], ['בלאָזן', 'בלאָזן'], ['שאַפֿן', 'שאַפֿן'], ['שמאָלצן', 'שמעלצן'],
    ['גאָלטן', 'גילטן'], ['זויגן', 'זויגן'],
];
for (const [participle, infinitive] of STRONG) {
    suffix('pastParticiple', 'גע' + participle, infinitive, ['adj'], ['v']);
}
// After an unstressed prefix, without גע (פֿאַרשטאַנען, באַשלאָסן, געפֿונען).
add('pastParticiple', {type: 'circumfix', prefixes: INSEPARABLE.map((p) => [p, p]),
    suffixes: STRONG.filter(([participle, infinitive]) => participle !== infinitive), conditionsIn: ['adj'], conditionsOut: ['v'],
    stemCharacters: '[]'});

// Present participles: the infinitive and -דיק.
suffix('presentParticiple', 'נדיק', 'ן', ['adj'], ['v'], {stemMinLength: 1});
suffix('presentParticiple', 'ייענדיק', 'יין', ['adj'], ['v']);
suffix('presentParticiple', 'עענדיק', 'ען', ['adj'], ['v']);
suffix('presentParticiple', AY + 'ענדיק', AY + 'ן', ['adj'], ['v']);
suffix('presentParticiple', 'טוענדיק', 'טאָן', ['adj'], ['v']);

for (const p of PARTICLES) {
    const m = medialForm(p);
    prefix('zuInfinitive', m + 'צו', m, [], ['v'], {stemMinLength: 2});
    add('separable', {type: 'pattern', pattern: `^({word}+) ${p}$`, replacement: `${m}$1`, anchorSuffix: ' ' + p,
        conditionsIn: [], conditionsOut: ['v', 'v_sep']});
}

suffix('cliticDu', 'סטו', 'סט', ['v_sep'], ['v', 'v_2sg'], {stemMinLength: 1});

// Irregular verbs. Forms that also occur after a particle (אָפּגיט, אָנטוט)
// are suffixes; the others are whole words.
const IRREGULAR = [
    // [transform, form, infinitive, whole word]
    ['stem', 'בין', 'זײַן', true], ['stem', 'זײַ', 'זײַן', true], ['2sg', 'ביסט', 'זײַן', true], ['3sg', 'איז', 'זײַן', true],
    ['1pl', 'זענען', 'זײַן', true], ['1pl', 'זײַנען', 'זײַן', true], ['3sg', 'זענט', 'זײַן', true], ['3sg', 'זײַט', 'זײַן', true],
    ['2sg', 'האָסט', 'האָבן', true], ['3sg', 'האָט', 'האָבן', true],
    ['stem', 'גיב', 'געבן', false], ['2sg', 'גיסט', 'געבן', false], ['2sg', 'גיבסט', 'געבן', false], ['3sg', 'גיט', 'געבן', false],
    ['stem', 'טו', 'טאָן', false], ['2sg', 'טוסט', 'טאָן', false], ['3sg', 'טוט', 'טאָן', false], ['1pl', 'טוען', 'טאָן', false],
    ['1pl', 'ייען', 'יין', false], ['1pl', 'עען', 'ען', false],
    ['stem', 'ווייס', 'וויסן', true], ['2sg', 'ווייסט', 'וויסן', true], ['1pl', 'ווייסן', 'וויסן', true],
    ['stem', 'וויל', 'וועלן', true], ['2sg', 'ווילסט', 'וועלן', true], ['3sg', 'ווילט', 'וועלן', true], ['1pl', 'ווילן', 'וועלן', true],
    ['2sg', 'וועסט', 'וועל', true], ['3sg', 'וועט', 'וועל', true],
    ['2sg', 'וואָלטסט', 'וואָלט', true], ['1pl', 'וואָלטן', 'וואָלט', true],
    ['2sg', 'פֿלעגסט', 'פֿלעג', true], ['3sg', 'פֿלעגט', 'פֿלעג', true], ['1pl', 'פֿלעגן', 'פֿלעג', true],
];
for (const [id, form, infinitive, whole] of IRREGULAR) {
    const conditionsIn = id === '2sg' ? ['v_sep', 'v_2sg'] : FINITE_IN;
    if (whole) {
        wholeWord(id, form, infinitive, conditionsIn, ['v']);
    } else {
        suffix(id, form, infinitive, conditionsIn, ['v']);
    }
}
suffix('presentParticiple', 'זײַענדיק', 'זײַן', ['adj'], ['v']);

// Compound verbs: the auxiliary's present forms before the word.
const AUXILIARIES = [
    ['האָבן', ['האָב', 'האָסט', 'האָט', 'האָבן']],
    ['זײַן', ['בין', 'ביסט', 'איז', 'זענען', 'זײַנען', 'זענט', 'זײַט']],
    ['ווערן', ['ווער', 'ווערסט', 'ווערט', 'ווערן']],
];
for (const [infinitive, forms] of AUXILIARIES) {
    for (const form of forms) {
        add('compoundVerb', {type: 'pattern', pattern: `^${form} ({word}+)$`, replacement: `$1 ${infinitive}`, anchorPrefix: form + ' ',
            conditionsIn: [], conditionsOut: ['v']});
    }
}

// --- Umlaut ------------------------------------------------------------------------------
// Plurals, diminutives and comparatives often change the stem's last vowel:
// טאָג → טעג, הויז → הײַזער, בוך → ביכער, גרויס → גרעסער, יונג → ייִנגער.
// Each pair is [the vowel in the inflected form, the vowel of the dictionary form].
const UMLAUT = [['ע', A], ['ע', O], ['ע', 'וי'], ['ע', 'יי'], ['י', 'ו'], ['י' + HIRIQ, 'ו'], ['יי', 'וי'], [AY, 'וי']];
const umlaut = ([from, to], betweenMinLength) =>
    ({from: [from], to, occurrence: 'last', between: CONSONANT, betweenMinLength});

// The endings of a noun or adjective after its stem: the generic rule (the stem
// ends in a letter that may end a word) and one rule per final letter, whose
// medial form stands before the ending (וואָכן → וואָך).
function stemEndings(ending, {finals = Object.keys(FINAL_OF)} = {}) {
    const out = [{inflected: ending, deinflected: '', c: {stemNotEndsWith: NOT_FINAL_FORM}, final: false}];
    for (const medial of finals) {
        out.push({inflected: medial + ending, deinflected: FINAL_OF[medial], c: {}, final: true});
    }
    return out;
}
// Adds the endings of `stemEndings`, plain and, when `umlauts` is set, with each
// vowel change; a final letter's rule changes the vowel just before it.
function endingRules(id, ending, conditionsIn, conditionsOut, {finals, umlauts = false, extra = {}} = {}) {
    for (const {inflected, deinflected, c, final} of stemEndings(ending, {finals})) {
        if (inflected === '') { continue; }
        suffix(id, inflected, deinflected, conditionsIn, conditionsOut, {stemMinLength: 1, ...c, ...extra});
        if (!umlauts) { continue; }
        for (const pair of UMLAUT) {
            suffix(id, inflected, deinflected, conditionsIn, conditionsOut,
                {stemMinLength: 1, ...c, ...extra, stemChange: umlaut(pair, final ? 0 : 1)});
        }
    }
}

// --- Nouns -------------------------------------------------------------------------------
transform('plural', 'plural',
    'Plural of a noun: -ן or -ען (טיש → טישן, פֿרוי → פֿרויען), -ס (טאַטע → טאַטעס), -ער with or without a changed vowel (קינד → קינדער, בוך → ביכער), a changed vowel alone (טאָג → טעג), and the Hebrew -ים and -ות (חבֿר → חבֿרים, שאלה → שאלות).');
transform('nounCase', 'accusative / dative',
    'Accusative or dative of a noun for a person in -ע: טאַטע → טאַטן.');
transform('diminutive', 'diminutive',
    'Diminutive of a noun: -ל or -עלע, often with a changed vowel (טיש → טישל, הויז → הײַזל, קינד → קינדעלע, מאַמע → מאַמעלע).');
transform('diminutivePlural', 'diminutive plural',
    'Plural of a diminutive, -עך: ביכל → ביכלעך, שטיקעלע → שטיקעלעך.');

const NOUN = ['n'];
endingRules('plural', 'ן', [], NOUN, {finals: ['כ', FE, 'צ']});
endingRules('plural', 'ען', [], NOUN, {finals: ['מ', 'נ']});
endingRules('plural', 'ס', [], NOUN, {finals: []});
suffix('plural', 'ניקעס', 'ניק', [], NOUN, {stemMinLength: 1});
endingRules('plural', 'ער', [], NOUN, {umlauts: true});
// A changed vowel alone: the stem ends in a consonant after the vowel.
for (const pair of UMLAUT) {
    suffix('plural', '', '', [], NOUN, {stemMinLength: 2, stemEndsWith: CONSONANT, stemChange: umlaut(pair, 1)});
}
endingRules('plural', 'ים', [], NOUN);
suffix('plural', 'ות', 'ה', [], NOUN, {stemMinLength: 1});
endingRules('plural', 'ות', [], NOUN);
suffix('plural', 'יות', 'ה', [], NOUN, {stemMinLength: 1});
for (const [form, singular] of [['ברידער', 'ברודער'], ['טעכטער', 'טאָכטער'], ['מיטער', 'מוטער'], ['נעמען', 'נאָמען'], ['ציין', 'צאָן'],
    ['חדשים', 'חודש']]) {
    wholeWord('plural', form, singular, [], NOUN);
}
suffix('nounCase', 'ן', 'ע', [], NOUN, {stemMinLength: 2, stemNotEndsWith: NOT_FINAL_FORM});

const DIMINUTIVE_IN = ['n_dim'];
for (const {inflected, deinflected, c, final} of stemEndings('ל')) {
    const constraint = final ? {} : {stemEndsWith: CONSONANT, ...c};
    suffix('diminutive', inflected, deinflected, DIMINUTIVE_IN, NOUN, {stemMinLength: 1, ...constraint});
    for (const pair of UMLAUT) {
        suffix('diminutive', inflected, deinflected, DIMINUTIVE_IN, NOUN,
            {stemMinLength: 1, ...constraint, stemChange: umlaut(pair, final ? 0 : 1)});
    }
}
endingRules('diminutive', 'עלע', DIMINUTIVE_IN, NOUN, {umlauts: true});
suffix('diminutive', 'לע', '', DIMINUTIVE_IN, NOUN, {stemMinLength: 2, stemEndsWith: '[ע]'});
suffix('diminutivePlural', 'לעך', 'ל', [], ['n', 'n_dim'], {stemMinLength: 1});
suffix('diminutivePlural', 'עלעך', 'עלע', [], ['n', 'n_dim'], {stemMinLength: 1});

// --- Adjectives --------------------------------------------------------------------------
transform('adjE', 'adjective -ע',
    'Adjective with -ע: feminine and plural, and neuter after the definite article (אַ גוטע פֿרוי, די גוטע קינדער, דאָס גוטע בוך → גוט).');
transform('adjEr', 'adjective -ער',
    'Adjective with -ער: masculine nominative and feminine dative (אַ גוטער טאָג, דער גוטער פֿרוי → גוט).');
transform('adjN', 'adjective -ן / -עם',
    'Adjective with -ן, or -עם after a vowel, ם or ן: masculine accusative and dative, neuter dative (דעם גוטן טאָג, דעם שיינעם טאָג → גוט, שיין).');
transform('adjS', 'adjective -ס',
    'Neuter adjective with -ס, after the noun or without an article (עפּעס גוטס → גוט).');
transform('comparative', 'comparative',
    'Comparative, -ער, often with a changed vowel (גרויס → גרעסער, אַלט → עלטער, שיין → שענער).');
transform('superlative', 'superlative',
    'Superlative, -סט (-ט after ס), often with a changed vowel and declined (שענסט, גרעסטע → שיין, גרויס).');

const ADJ = ['adj'];
endingRules('adjE', 'ע', [], ADJ);
endingRules('adjEr', 'ער', [], ADJ);
endingRules('adjN', 'ן', [], ADJ, {finals: ['כ', FE, 'צ']});
endingRules('adjN', 'עם', [], ADJ, {finals: ['מ', 'נ']});
endingRules('adjN', 'ען', [], ADJ, {finals: ['מ', 'נ'], extra: {stemEndsWith: VOWEL_END}});
endingRules('adjS', 'ס', [], ADJ);
// Syllabic n and l take ע before the ending: אָפֿן → אָפֿענע, איידל → איידעלע.
for (const [id, ending] of [['adjE', 'ע'], ['adjEr', 'ער'], ['adjN', 'עם']]) {
    suffix(id, 'ענ' + ending, 'ן', [], ADJ, {stemMinLength: 1, stemNotEndsWith: VOWEL_END});
}
for (const [id, ending] of [['adjE', 'ע'], ['adjEr', 'ער']]) {
    suffix(id, 'על' + ending, 'ל', [], ADJ, {stemMinLength: 1, stemNotEndsWith: VOWEL_END});
}
endingRules('comparative', 'ער', ADJ, ADJ, {umlauts: true});
endingRules('superlative', 'סט', ADJ, ADJ, {umlauts: true});
suffix('superlative', 'סט', 'ס', ADJ, ADJ, {stemMinLength: 1});
for (const pair of UMLAUT) {
    suffix('superlative', 'סט', 'ס', ADJ, ADJ, {stemMinLength: 1, stemChange: umlaut(pair, 0)});
}
for (const [comparative, superlative, positive] of [['בעסער', 'בעסט', 'גוט'], ['ערגער', 'ערגסט', 'שלעכט'], ['מער', 'מערסט', 'פֿיל'],
    ['נעענטער', 'נעענטסט', 'נאָענט']]) {
    wholeWord('comparative', comparative, positive, ADJ, ADJ);
    wholeWord('superlative', superlative, positive, ADJ, ADJ);
}

// --- Output ------------------------------------------------------------------------------
const out = {schema: 1, conditions, transforms: transforms.filter((t) => t.rules.length > 0)};
const file = join(here, 'own.json');
writeFileSync(file, formatTransforms(out));
const rules = out.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`yi: ${out.transforms.length} transforms, ${rules} rules in ${file}`);
