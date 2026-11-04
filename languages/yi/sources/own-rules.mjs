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

// --- Output structures -------------------------------------------------------------------
// v, n and their subconditions have Yomitan's definitions (the merge tool
// requires conditions both files have to be equal); rules give a verb as `v`
// and the singular a noun rule reaches as `ns`.
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true, subConditions: ['vpast', 'vpresent']},
    vpast: {name: 'Verb, past tense', isDictionaryForm: false},
    vpresent: {name: 'Verb, present tense', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['np', 'ns']},
    np: {name: 'Noun plural', isDictionaryForm: false},
    ns: {name: 'Noun singular', isDictionaryForm: true},
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

// --- Unpointed spellings ------------------------------------------------------------------
// Frequent unpointed words whose pointing variants tie and whose first variant is the rarer word
// (README.md, Measurements): read as written, with no processor step, they come first.
transform('unpointed', 'unpointed spelling',
    'A frequent word written without its points, read as its usual pointed word: זאל → זאָל (should), דאך → דאָך.');
const UNPOINTED_WORDS = [['זאל', 'זאָל'], ['דאך', 'דאָך'], ['וואך', 'וואָך'], ['וואכן', 'וואָכן'], ['שלאף', 'שלאָף'],
    ['קאסטן', 'קאָסטן'], ['פאן', 'פֿאָן'], ['פארן', 'פֿאַרן'], ['אב', 'אָבֿ'], ['גלייך', 'גלײַך'],
    // read as written, a rule would come first: פירער as a plural of פור, מיי as a form of מיינען
    ['פירער', 'פֿירער'], ['מיי', 'מײַ'], ['שייכות', 'שײַכות'],
    // ties whose first pointing is the rarer word in text (audit-hachi-lang-yi-b): האַסט haste, וואַגן to dare,
    // לעפּל lobe, אַפֿענע blueberry
    ['האסט', 'האָסט'], ['דו האסט', 'דו האָסט'], ['וואגן', 'וואָגן'], ['לעפל', 'לעפֿל'], ['אפענע', 'אָפֿענע'],
    // read as written, a rule would come first (measure.py agree): לייט as a form of לייטן, יינגל as a diminutive of
    // יונג, פילן as an adjective, מאכער as a plural of מאך; פרי is פֿרי (early) more often than פּרי (fruit)
    ['לייט', 'לײַט'], ['יינגל', 'ייִנגל'], ['יינגלעך', 'ייִנגלעך'], ['פילן', 'פֿילן'], ['מאכער', 'מאַכער'], ['פרי', 'פֿרי'],
    ['פיין', 'פֿײַן']];

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
    {tail: 'נ', inf: ['ענען'], c: {stemNotEndsWith: VOWEL_END, stemMinLength: 3}},  // syllabic n: צייכן → צייכענען
    {tail: FE, inf: [FE + 'ן']},
    {tail: 'צ', inf: ['צן']},
    {tail: 'ל', inf: ['לן'], c: {stemEndsWith: VOWEL_END}},       // שטעל → שטעלן
    {tail: 'ל', inf: ['לען'], c: {stemNotEndsWith: VOWEL_END}},   // syllabic l: שמייכל → שמייכלען
    // זע → זען, ראַטעווע → ראַטעווען; גנבֿע → גנבֿענען. Not after י, מ or נ: מיינע and נייע (unpointed
    // מײַנע, נײַע) are not forms of מיינען and נייען, whose stems are מיינ and ניי.
    {tail: 'ע', inf: ['ען'], c: {stemNotEndsWith: '[ימנ]'}},
    {tail: 'ע', inf: ['ענען'], c: {stemMinLength: 3}},             // גנבֿע → גנבֿענען; not זע → זענען, טרעט → טרענען
    {tail: 'יע', inf: ['יען'], c: {stemNotEndsWith: '[י]'}},        // נודיע → נודיען, אָטכאַיע → אָטכאַיען
    {tail: 'י' + HIRIQ, inf: ['י' + HIRIQ + 'ען']},               // בליִ → בליִען
    {tail: AY, inf: [AY + 'ען']},                                 // שרײַ → שרײַען
    {tail: 'י', inf: ['ין', 'יען'], c: {stemEndsWith: VOWEL_END}}, // גיי → גיין; דריי → דרייען
    {tail: 'י', inf: ['י' + HIRIQ + 'ען'], c: {stemEndsWith: CONSONANT}}, // צי → ציִען, פֿלי → פֿליִען
    {tail: 'וול', inf: ['וולען']},                                 // באַעוול → באַעוולען
    {tail: 'דזש', inf: ['דזשען']},                                 // בלאָנדזש → בלאָנדזשען
    {tail: 'שטש', inf: ['שטשען']},                                 // טרעשטש → טרעשטשען
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
// Not after געה: געהערט is far more often "heard" (הערן) than "belongs" (געהערן), whose reading the
// dictionary's own row of געהערט still gives.
for (const {inflected, deinflected, c} of verbEndings('ט', ['ט'])) {
    suffix('3sg', inflected, deinflected, FINITE_IN, ['v'], {stemMinLength: 1, stemNotStartsWithText: 'געה', ...c});
}

// Separable particles. Written before the verb they end in a medial letter
// (אָן → אָנהייבן).
const PARTICLES = ['אָן', 'אָפּ', 'אויס', 'אויף', 'אײַן', 'אַוועק', 'אַהיים', 'אַהין', 'אַהער', 'אַדורך', 'אַנטקעגן', 'אַראָפּ',
    'אַרויס', 'אַרויף', 'אַרום', 'אַרײַן', 'אַריבער', 'אַרונטער', 'אַנידער', 'בײַ', 'דורך', 'מיט', 'נאָך', 'פֿאָר', 'פֿאָרויס',
    'פֿאַרבײַ', 'פֿונאַנדער', 'צו', 'צוזאַמען', 'צונויף', 'צוריק', 'איבער', 'אונטער', 'אום', 'פֿיר'];
// Unstressed prefixes, after which the participle has no גע-.
const INSEPARABLE = ['באַ', 'גע', 'דער', 'אַנט', 'פֿאַר', 'צע'];

// Weak participles: גע + stem + ט, as a cross product of the prefixes (with the
// particles) and the stem endings, one row per stem constraint.
const ppPrefixes = [['גע', ''], ...PARTICLES.map((p) => [medialForm(p) + 'גע', medialForm(p)])];
const ppSuffixes = new Map();
// The participle keeps no stem-end constraint of the finite endings: געליינט (a spelling of געלייענט) is
// לייענען's, and no participle reading they stop is a false one (sources/mutation-gains.py).
for (const {inflected, deinflected, c: finite} of [...verbEndings('ט', ['ט']), {inflected: 'ט', deinflected: 'טן', c: {}},
    {inflected: 'דעט', deinflected: 'דן', c: {}}]) {  // געלאַנדעט → לאַנדן
    const {stemNotEndsWith: _unused, ...c} = finite;
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
    ['גאָלטן', 'גילטן'], ['זויגן', 'זויגן'], ['דראָשן', 'דרעשן'], ['שאָכטן', 'שעכטן'], ['ראָכטן', 'ריכטן'], ['לויכטן', 'לײַכטן'],
    ['וווּנטשן', 'ווינטשן'], ['ליגן', 'לײַען'], ['לעזן', 'לעזן'], ['קנאָטן', 'קנעטן'], ['באָדן', 'באָדן'], ['לאָשן', 'לעשן'],
    ['שפּראָכן', 'שפּרעכן'], ['גליכן', 'גלײַכן'], ['דונגען', 'דינגען'], ['נאָסן', 'ניסן'], ['הונקען', 'הינקען'], ['לונגען', 'לינגען'],
    ['מאָלדן', 'מעלדן'], ['לאָרן', 'לירן'], ['דאָרבן', 'דאַרבן'], ['בולן', 'בילן'], ['זאָדן', 'זידן'], ['שריגן', 'שרײַען'],
    ['שטראָכן', 'שטרײַכן'], ['פֿראָרן', 'פֿרירן'], ['שרומפּן', 'שרומפּן'], ['וואָקסן', 'וואַקסן'], ['באָרשטן', 'באַרשטן'],
    ['האָפֿטן', 'העפֿטן'], ['יוירן', 'יערן'], ['מיטן', 'מיידן'], ['מאָלן', 'מאָלן'], ['גונען', 'גינען'], ['טראָנקען', 'טרענקען'],
];
for (const [participle, infinitive] of STRONG) {
    suffix('pastParticiple', 'גע' + participle, infinitive, ['adj'], ['v']);
}
// After an unstressed prefix, without גע (פֿאַרשטאַנען, באַשלאָסן, געפֿונען).
add('pastParticiple', {type: 'circumfix', prefixes: INSEPARABLE.map((p) => [p, p]),
    suffixes: STRONG.filter(([participle, infinitive]) => participle !== infinitive), conditionsIn: ['adj'], conditionsOut: ['v'],
    stemCharacters: '[]'});

// Weak participles without גע: after an unstressed prefix (פֿאַרקויפֿט, דערציילט, באַצאָלט) and in verbs in
// -ירן (שטודירט); also declined (פֿאַרקויפֿטע).
for (const {c, pairs} of ppSuffixes.values()) {
    add('pastParticiple', {type: 'circumfix', prefixes: INSEPARABLE.map((p) => [p, p]), suffixes: pairs, conditionsIn: ['adj'],
        conditionsOut: ['v'], stemCharacters: ONE_WORD, stemMinLength: 1, ...c});
}
suffix('pastParticiple', 'ירט', 'ירן', ['adj'], ['v'], {stemMinLength: 3});  // not פֿירט, שמירט
// A weak participle of a stem in -נד takes -עט, also after an unstressed prefix: געלאַנדעט, פֿאַרלענדעט.
suffix('pastParticiple', 'נדעט', 'נדן', ['adj'], ['v'], {stemMinLength: 2});

// Present participles: the infinitive and -דיק.
suffix('presentParticiple', 'נדיק', 'ן', ['adj'], ['v'], {stemMinLength: 1});
suffix('presentParticiple', 'לנדיק', 'לען', ['adj'], ['v'], {stemMinLength: 1, stemNotEndsWith: VOWEL_END}); // שמייכלנדיק
// The plural of a verb in syllabic -ן: באַרעכענען → מיר באַרעכנען.
suffix('1pl', 'נען', 'ענען', FINITE_IN, ['v'], {stemEndsWith: CONSONANT});
suffix('presentParticiple', 'ייענדיק', 'יין', ['adj'], ['v']);
suffix('presentParticiple', 'עענדיק', 'ען', ['adj'], ['v']);
suffix('presentParticiple', AY + 'ענדיק', AY + 'ן', ['adj'], ['v']);
suffix('presentParticiple', 'טוענדיק', 'טאָן', ['adj'], ['v']);

for (const p of PARTICLES) {
    const m = medialForm(p);
    prefix('zuInfinitive', m + 'צו', m, [], ['v'], {stemMinLength: 1});
    // Not after a participle, whose particle is written before it (אויפֿגעשטאַנען): געשטאַנען אויף is "stood on".
    // The verbs whose own stem starts with גע (געוווינען, געוויינען; kaikki lists no other with a particle) stay.
    // Nor זאָג- or גיי- before צו: in text זאָגט צו and גייט צו are "says to" and "goes to" (17 of 20 places
    // in the real texts), not צוזאָגן and צוגיין, which their participles and infinitives still reach.
    const verbGuard = p === 'צו' ? '(?!זאָג|גיי)' : '';
    add('separable', {type: 'pattern', pattern: `^(?!גע(?!וווינ|וויינ))${verbGuard}({word}+) ${p}$`, replacement: `${m}$1`, anchorSuffix: ' ' + p,
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
    ['1pl', 'גיבן', 'געבן', false], ['1pl', 'וועלן', 'וועל', true],
    ['stem', 'טו', 'טאָן', false], ['2sg', 'טוסט', 'טאָן', false], ['3sg', 'טוט', 'טאָן', false], ['1pl', 'טוען', 'טאָן', false],
    ['1pl', 'ייען', 'יין', false], ['1pl', 'עען', 'ען', false],
    ['stem', 'ווייס', 'וויסן', true], ['2sg', 'ווייסט', 'וויסן', true], ['1pl', 'ווייסן', 'וויסן', true],
    ['stem', 'וויל', 'וועלן', true], ['2sg', 'ווילסט', 'וועלן', true], ['3sg', 'ווילט', 'וועלן', true], ['1pl', 'ווילן', 'וועלן', true],
    ['2sg', 'וועסט', 'וועל', true], ['3sg', 'וועט', 'וועל', true],
    ['2sg', 'וואָלטסט', 'וואָלט', true], ['1pl', 'וואָלטן', 'וואָלט', true],
    ['2sg', 'פֿלעגסט', 'פֿלעג', true], ['3sg', 'פֿלעגט', 'פֿלעג', true], ['1pl', 'פֿלעגן', 'פֿלעג', true],
];
// A pronoun and זענען or זענט: wty-yi-en's rows for these three phrases name מסביר זײַן (from a split
// table), so a lookup needs this reading to offer זײַן at the same length (README.md, Known gaps).
IRREGULAR.push(['1pl', 'מיר זענען', 'זײַן', true], ['1pl', 'זיי זענען', 'זײַן', true], ['3sg', 'איר זענט', 'זײַן', true]);
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
// Their participles, after the word: ליב געהאַט → ליב האָבן, מסכּים געווען → מסכּים זײַן, מורא האָבנדיק → מורא האָבן.
for (const [participle, infinitive] of [['געהאַט', 'האָבן'], ['געווען', 'זײַן'], ['געוואָרן', 'ווערן'], ['האָבנדיק', 'האָבן'],
    ['זײַענדיק', 'זײַן'], ['ווערנדיק', 'ווערן']]) {
    add('compoundVerb', {type: 'pattern', pattern: `^({word}+) ${participle}$`, replacement: `$1 ${infinitive}`, anchorSuffix: ' ' + participle,
        conditionsIn: [], conditionsOut: ['v']});
}
// Not a pronoun after the auxiliary (האָט מיר, האָבן זיי): wty-yi-en lists the
// pronoun and the verb (מיר האָבן) as a form of the verb, so the reordered text
// would read two words where the verb is one.
const PRONOUNS_AFTER = '(?!(?:איך|דו|ער|זי|עס|מיר|איר|זיי|זײ|מען|דיר|מיך|אים|אונדז|אײַך|זיך)$)';
for (const [infinitive, forms] of AUXILIARIES) {
    for (const form of forms) {
        add('compoundVerb', {type: 'pattern', pattern: `^${form} ${PRONOUNS_AFTER}({word}+)$`, replacement: `$1 ${infinitive}`,
            anchorPrefix: form + ' ', conditionsIn: [], conditionsOut: ['v']});
    }
}

// --- Umlaut ------------------------------------------------------------------------------
// Plurals, diminutives and comparatives often change the stem's last vowel:
// טאָג → טעג, הויז → הײַזער, בוך → ביכער, גרויס → גרעסער, יונג → ייִנגער.
// Each pair is [the vowel in the inflected form, the vowel of the dictionary form].
const UMLAUT = [['ע', A], ['ע', O], ['ע', 'וי'], ['ע', 'יי'], ['י', 'ו'], ['י' + HIRIQ, 'ו'], ['יי', 'וי'], [AY, 'וי']];
const umlaut = ([from, to], betweenMinLength) =>
    ({from: [from], to, occurrence: 'last', between: CONSONANT, ...(betweenMinLength === 1 ? {} : {betweenMinLength})});

// The endings of a noun or adjective after its stem: the generic rule (the stem
// ends in a letter that may end a word) and one rule per final letter, whose
// medial form stands before the ending (וואָכן → וואָך).
function stemEndings(ending, {finals = Object.keys(FINAL_OF)} = {}) {
    // A stem that ends in a medial letter gives the medial letter; the convertFinalLetters postprocessor
    // writes it final, as the final-letter rules below do.
    const out = [{inflected: ending, deinflected: '', c: {}, final: false}];
    // Only פֿ needs a rule of its own: the postprocessor writes the other medial letters final (וואָכן →
    // וואָכ → וואָך), but a stem in פֿ ends in the rafe, which it leaves (קויפֿן → קויף needs this rule).
    for (const medial of finals.filter((m) => m === FE)) {
        out.push({inflected: medial + ending, deinflected: FINAL_OF[medial], c: {}, final: true});
    }
    return out;
}
// Adds the endings of `stemEndings`, plain and, when `umlauts` is set, with each
// vowel change; a final letter's rule changes the vowel just before it.
// `plain` constrains only the rule without a final letter.
function endingRules(id, ending, conditionsIn, conditionsOut, {finals, umlauts = false, extra = {}, plain = {}} = {}) {
    for (const {inflected, deinflected, c: base, final} of stemEndings(ending, {finals})) {
        if (inflected === '') { continue; }
        const c = final ? base : {...base, ...plain};
        // An empty stem gives an empty text, which is never looked up, unless a final letter is written.
        const minimum = deinflected === '' ? {} : {stemMinLength: 1};
        suffix(id, inflected, deinflected, conditionsIn, conditionsOut, {...minimum, ...c, ...extra});
        if (!umlauts) { continue; }
        for (const pair of UMLAUT) {
            suffix(id, inflected, deinflected, conditionsIn, conditionsOut,
                {...minimum, ...c, ...extra, stemChange: umlaut(pair, 1)});
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

const NOUN = ['ns'];
endingRules('plural', 'ן', [], NOUN, {finals: ['כ', 'נ', FE, 'צ']});
endingRules('plural', 'ען', [], NOUN, {finals: ['מ', 'נ']});
endingRules('plural', 'ס', [], NOUN);                    // טאַטעס, צייכנס, לחיימס
endingRules('plural', 'עס', [], NOUN, {extra: {stemMinLength: 2}}); // נודניקעס, הולטאַיעס
// -ער after a consonant (טײַער is not a plural of טיי); אייער is written out.
endingRules('plural', 'ער', [], NOUN, {umlauts: true, plain: {stemNotEndsWith: VOWEL_END}});
// A changed vowel alone: the stem ends in a consonant after the vowel, or in
// an unstressed -ער, -עם or -ען after it (ברודער → ברידער, וואָרעם → ווערעם).
// Only ע for אַ or אָ (טאָג → טעג, האַנט → הענט); the few plurals with another
// change are written out below (ביים is בײַם, not a plural of בוים; גביר is not one of גבור).
for (const pair of UMLAUT.filter(([from, to]) => from === 'ע' && (to === A || to === O))) {
    suffix('plural', '', '', [], NOUN, {stemMinLength: 2, stemChange: umlaut(pair, 1)});
    for (const schwa of ['ער', 'עם', 'ען']) {
        suffix('plural', schwa, schwa, [], NOUN, {stemMinLength: 2, stemChange: umlaut(pair, 1)});
    }
}
// A changed vowel and -ן: מויד → מיידן.
suffix('plural', 'ן', '', [], NOUN, {stemMinLength: 2, stemChange: umlaut(['יי', 'וי'], 1)});
endingRules('plural', 'ים', [], NOUN);
suffix('plural', 'ות', 'ה', [], NOUN, {stemMinLength: 1});
suffix('plural', 'ים', 'ה', [], NOUN, {stemMinLength: 2});  // עולה → עולים
endingRules('plural', 'ות', [], NOUN);
suffix('plural', 'יות', 'ה', [], NOUN, {stemMinLength: 1});
suffix('plural', 'יות', '', [], NOUN, {stemMinLength: 2});  // אות → אותיות
// A compound ends like its last word (טויטפֿייגל → טויטפֿויגל).
for (const [form, singular] of [['פֿייגל', 'פֿויגל'], ['פֿיס', 'פֿוס'], ['ניס', 'נוס']]) { suffix('plural', form, singular, [], NOUN); }
wholeWord('plural', 'זין', 'זון', [], NOUN);
for (const [form, singular] of [['ברידער', 'ברודער'], ['טעכטער', 'טאָכטער'], ['מיטער', 'מוטער'], ['נעמען', 'נאָמען'], ['ציין', 'צאָן'],
    ['חדשים', 'חודש'], ['נשים', 'אשה'], ['ימים', 'יום'], ['מײַז', 'מויז'], ['לײַז', 'לויז'], ['אייער', 'איי']]) {
    wholeWord('plural', form, singular, [], NOUN);
}
// The stem is the noun without its -ע, so it does not end in ע (אידען is not a form of אידעע).
suffix('nounCase', 'ן', 'ע', [], NOUN, {stemMinLength: 2, stemNotEndsWith: '[כמנצע]'});  // not גאַנצן → גאַנצע

const DIMINUTIVE_IN = ['n_dim'];
for (const {inflected, deinflected, c, final} of stemEndings('ל')) {
    const constraint = final ? {} : {stemEndsWith: CONSONANT, ...c};
    suffix('diminutive', inflected, deinflected, DIMINUTIVE_IN, NOUN, {stemMinLength: 1, ...constraint});
    for (const pair of UMLAUT) {
        suffix('diminutive', inflected, deinflected, DIMINUTIVE_IN, NOUN,
            {stemMinLength: 1, ...constraint, stemChange: umlaut(pair, final ? 0 : 1)});
    }
}
// -עלע of a noun in syllabic -ל: שיסל → שיסעלע, פֿויגל → פֿייגעלע. These come first, so a tie with the
// rules below goes to them (שליסעלע → שליסל before שלוס).
suffix('diminutive', 'עלע', 'ל', DIMINUTIVE_IN, NOUN, {stemMinLength: 1, stemEndsWith: CONSONANT});
for (const pair of UMLAUT) {
    suffix('diminutive', 'עלע', 'ל', DIMINUTIVE_IN, NOUN, {stemMinLength: 1, stemEndsWith: CONSONANT, stemChange: umlaut(pair, 1)});
}
endingRules('diminutive', 'עלע', DIMINUTIVE_IN, NOUN, {umlauts: true});
suffix('diminutive', 'לע', '', DIMINUTIVE_IN, NOUN, {stemMinLength: 2, stemEndsWith: '[עה]'}); // מאַמעלע, דירהלע
// -דל after ן: ניגון → ניגונדל, הון → הינדל.
suffix('diminutive', 'נדל', 'ן', DIMINUTIVE_IN, NOUN, {stemMinLength: 1});
// -ל after an unstressed -ער, with a changed vowel before it: ברודער → ברידערל, האַמער → העמערל.
for (const pair of UMLAUT) {
    suffix('diminutive', 'ערל', 'ער', DIMINUTIVE_IN, NOUN, {stemMinLength: 1, stemChange: umlaut(pair, 1)});
}
suffix('diminutive', 'ל', 'ע', DIMINUTIVE_IN, NOUN, {stemMinLength: 2, stemEndsWith: CONSONANT});  // שיקסע → שיקסל
for (const pair of UMLAUT) {
    suffix('diminutive', 'נדל', 'ן', DIMINUTIVE_IN, NOUN, {stemMinLength: 1, stemChange: umlaut(pair, 0)});
}
// Slavic -קע, -קעלע and -טשיק: גומע → גומקע, אָליוו → אָליווקע, גאָמבע → גאָמבקעלע, יונגערמאַן → יונגערמאַנטשיק.
// -קע after a consonant needs a stem of five code points: in text a shorter one is mostly a name
// (מאָטקע is not a diminutive of מאָט); מינוטקע, אָליווקע and עטיקעטקע keep their reading.
endingRules('diminutive', 'קע', DIMINUTIVE_IN, NOUN, {extra: {stemMinLength: 5}});
suffix('diminutive', 'קע', 'ע', DIMINUTIVE_IN, NOUN, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('diminutive', 'קעלע', 'ע', DIMINUTIVE_IN, NOUN, {stemMinLength: 2, stemEndsWith: CONSONANT});
endingRules('diminutive', 'טשיק', DIMINUTIVE_IN, NOUN, {extra: {stemMinLength: 2}});
suffix('diminutivePlural', 'לעך', 'ל', [], ['ns', 'n_dim'], {stemMinLength: 1});
suffix('diminutivePlural', 'עלעך', 'עלע', [], ['ns', 'n_dim'], {stemMinLength: 1});

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
endingRules('adjN', 'ען', [], ADJ, {finals: ['מ', 'נ'], extra: {stemEndsWith: '[{vowelEnd}מנ]'}});  // נײַען, פֿרומען
endingRules('adjS', 'ס', [], ADJ);
// Syllabic n and l take ע before the ending: אָפֿן → אָפֿענע, איידל → איידעלע.
// Also after a vowel: a participle in -ען declines so (געזען → געזעענע, אָנגעזען → אָנגעזעענעם).
for (const [id, ending] of [['adjE', 'ע'], ['adjEr', 'ער'], ['adjN', 'עם']]) {
    suffix(id, 'ענ' + ending, 'ן', [], ADJ, {stemMinLength: 1});
}
for (const [id, ending] of [['adjE', 'ע'], ['adjEr', 'ער']]) {
    suffix(id, 'על' + ending, 'ל', [], ADJ, {stemMinLength: 1, stemNotEndsWith: VOWEL_END});
}
// Adjectives in -ע (Slavic: מאָדנע, טשיקאַווע) take -ר, -ם and -ס: מאָדנער, מאָדנעם, טשיקאַוועס.
suffix('adjEr', 'ער', 'ע', [], ADJ, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('adjN', 'עם', 'ע', [], ADJ, {stemMinLength: 2, stemEndsWith: CONSONANT});
suffix('adjS', 'עס', 'ע', [], ADJ, {stemMinLength: 2});
// Syllabic l takes ע before -ן: איידל → איידעלן, טונקל → טונקעלען.
suffix('adjN', 'עלן', 'ל', [], ADJ, {stemMinLength: 1});
suffix('adjN', 'עלען', 'ל', [], ADJ, {stemMinLength: 1});
// A final י after a consonant takes a hiriq before an ending: פֿרי → פֿריִע, פֿריִער, פֿריִעסט.
for (const [id, ending] of [['adjE', 'ע'], ['adjEr', 'ער'], ['adjN', 'ען']]) {
    suffix(id, 'י' + HIRIQ + ending, 'י', [], ADJ, {stemMinLength: 1});
}
endingRules('comparative', 'ער', ADJ, ADJ, {umlauts: true});
endingRules('superlative', 'סט', ADJ, ADJ, {umlauts: true});
suffix('comparative', 'י' + HIRIQ + 'ער', 'י', ADJ, ADJ, {stemMinLength: 1});
// Syllabic n: טרוקן → טריקענער.
suffix('comparative', 'ענער', 'ן', ADJ, ADJ, {stemMinLength: 1});
for (const pair of UMLAUT) {
    suffix('comparative', 'ענער', 'ן', ADJ, ADJ, {stemMinLength: 1, stemChange: umlaut(pair, 1)});
}
suffix('superlative', 'שט', 'ש', ADJ, ADJ, {stemMinLength: 2});  // לעפּיש → לעפּישט
suffix('superlative', 'י' + HIRIQ + 'עסט', 'י', ADJ, ADJ, {stemMinLength: 1});
suffix('superlative', 'סט', 'ס', ADJ, ADJ, {stemMinLength: 1});
for (const pair of UMLAUT) {
    suffix('superlative', 'סט', 'ס', ADJ, ADJ, {stemMinLength: 1, stemChange: umlaut(pair, 0)});
}
for (const [comparative, superlative, positive] of [['בעסער', 'בעסט', 'גוט'], ['ערגער', 'ערגסט', 'שלעכט'], ['מער', 'מערסט', 'פֿיל'],
    ['נעענטער', 'נעענטסט', 'נאָענט']]) {
    wholeWord('comparative', comparative, positive, ADJ, ADJ);
    wholeWord('superlative', superlative, positive, ADJ, ADJ);
}

for (const [form, word] of UNPOINTED_WORDS) { wholeWord('unpointed', form, word, [], []); }

// --- Output ------------------------------------------------------------------------------
// These transforms need no minimum stem: without it no rule of theirs adds a
// headword to the deinflections of 150,000 words and phrases of the real texts
// and Tatoeba (sources/mutation-gains.py); an empty stem only gives a lone
// letter or ending, which no headword is.
for (const id of ['1pl', 'adjE', 'adjS', 'comparative', 'superlative']) {
    for (const rule of byId.get(id).rules) { delete rule.stemMinLength; }
}
// A plural with a changed vowel comes before the same ending without one, so a
// tie between them goes to the vowel change: ווערטער is "words" (וואָרט) far more
// often than a form of ווערט (worth) (22 places in the real texts).
{
    const plural = byId.get('plural');
    plural.rules = [...plural.rules.filter((r) => r.stemChange), ...plural.rules.filter((r) => !r.stemChange)];
}
const out = {schema: 1, conditions, transforms: transforms.filter((t) => t.rules.length > 0)};
const file = join(here, 'own.json');
writeFileSync(file, formatTransforms(out));
const rules = out.transforms.reduce((n, t) => n + t.rules.length, 0);
console.log(`yi: ${out.transforms.length} transforms, ${rules} rules in ${file}`);
