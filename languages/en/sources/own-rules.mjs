#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes sources/own.json: English deinflection rules written for this pack
// from English grammar (docs/languages.md, section 14 step 2), before
// Yomitan's English rules were read. Run from anywhere:
//
//   node languages/en/sources/own-rules.mjs
//
// Conditions follow the dictionary tags of Yomitan-format English
// dictionaries: wiktionary-to-yomitan writes `n`, `v`, `adj` and `adv` in a
// term's rules and leaves them empty for pronouns, names, determiners and the
// other closed classes. `ns` and `np` split nouns so a plural rule never
// applies to its own output. Rules whose output may be a word of any class
// (possessives and other clitics) give no conditions, so they reach entries
// with empty rules (she's -> she, someone's -> someone, Mary's -> Mary).

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

// The conditions Yomitan's English rules also define have Yomitan's names and
// shapes (v covers v_phr), so the two files merge (section 14 step 5).
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true, subConditions: ['v_phr']},
    v_phr: {name: 'Phrasal verb', isDictionaryForm: true},
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['np', 'ns']},
    np: {name: 'Noun plural', isDictionaryForm: true},
    ns: {name: 'Noun singular', isDictionaryForm: true},
    adj: {name: 'Adjective', isDictionaryForm: true},
    adv: {name: 'Adverb', isDictionaryForm: true},
    // Two marks that order the multiword-verb rules, never a dictionary tag:
    // v_fw is the output of a rule that read the first word's ending (*turned
    // it off* -> *turn it off*), v_io the output of the interposed-object rule
    // (*turned it off* -> *turned off*). Each lets the other rule run next, and
    // an ending read from the last word (*turn their backs* -> *turn their
    // back*) lets neither.
    v_fw: {name: 'Verb, first word read', isDictionaryForm: false},
    v_io: {name: 'Verb, interposed object removed', isDictionaryForm: false},
};

const words = (text) => text.trim().split(/\s+/);

// Prepositions and adverb particles of phrasal and prepositional verbs.
const particles = words(`
    about above across after against ahead along alongside among apart around as aside at away back before behind
    below beneath beside between beyond by down for forth forward forwards from home in inside into like of off on
    onto out outside over past round through throughout to together toward towards under underneath up upon with
    within without`);
// Words after an inflected verb that start the multiword verb entries of
// dictionaries: particles, articles, object pronouns, possessive determiners
// and reflexives (*kicked the bucket*, *made it*, *lost his temper*).
const phrasalFollowers = [...new Set([...particles, ...words(`
    a an the no some all any and
    it me you him her us them one something someone somebody anything anyone everything nothing
    my your his its our their
    myself yourself himself herself itself ourselves yourselves themselves oneself`)])];
// Particles that follow the verb's object (*turn it off*, *looked the word up*).
// In, on, over, through, by, round, around and about are left out: after an
// object they mostly start a prepositional phrase (*put her foot on the table*,
// *held him by the arm*), and a lookup cannot see the words after the
// particle. Counted in 20 public-domain novels from Project Gutenberg: where
// *verb + particle* is a dictionary entry, *verb the/his/... noun particle*
// was followed by a determiner or a name 72% of the time for in, 81% for on,
// 75% for over, and 0-10% for up, out, down, away, back, aside, home and
// together (off 34%); with a pronoun object, 54% for in, 64% for on, 2-9% for
// up, out, down, away and back, 13% for off (README.md).
const separableParticles = words('up out down off away back aside apart home together forth forward');

// Spelling: a consonant doubled before -ed, -ing, -er and -est. A doubled s
// does not follow e (pressed and dressed are not pres, dres + sed).
const doubled = 'b d f g k l m n p r t v z'.split(' ');
const doubledComparative = 'b d g m n p t'.split(' ');

// Irregular verbs: base | past forms | past participles (forms equal to the
// base need no rule). Prefixed compounds (understood, overcame, forgave,
// withheld, mistook, foresaw, undergone, outran) are reached by the suffix
// rules these become.
const irregularVerbs = `
    bear|bore|borne born
    beat||beaten
    begin|began|begun
    bend|bent|bent
    beseech|besought|besought
    bid|bade|bidden
    bind|bound|bound
    bite|bit|bitten
    bleed|bled|bled
    blow|blew|blown
    break|broke|broken
    breed|bred|bred
    bring|brought|brought
    build|built|built
    burn|burnt|burnt
    buy|bought|bought
    catch|caught|caught
    choose|chose|chosen
    cleave|clove cleft|cloven cleft
    cling|clung|clung
    come|came|
    creep|crept|crept
    deal|dealt|dealt
    dig|dug|dug
    dive|dove|
    do|did|done
    draw|drew|drawn
    dream|dreamt|dreamt
    drink|drank|drunk
    drive|drove|driven
    dwell|dwelt|dwelt
    eat|ate|eaten
    fall|fell|fallen
    feed|fed|fed
    feel|felt|felt
    fight|fought|fought
    find|found|found
    flee|fled|fled
    fling|flung|flung
    fly|flew|flown
    forbid|forbade forbad|forbidden
    forsake|forsook|forsaken
    freeze|froze|frozen
    get|got|got gotten
    gild|gilt|gilt
    gird|girt|girt
    give|gave|given
    go|went|gone
    grind|ground|ground
    grow|grew|grown
    hang|hung|hung
    hear|heard|heard
    hew||hewn
    hide|hid|hidden
    hold|held|held
    keep|kept|kept
    kneel|knelt|knelt
    know|knew|known
    lay|laid|laid
    lead|led|led
    lean|leant|leant
    leap|leapt|leapt
    learn|learnt|learnt
    leave|left|left
    lend|lent|lent
    lie|lay|lain
    light|lit|lit
    lose|lost|lost
    make|made|made
    mean|meant|meant
    meet|met|met
    mow||mown
    pay|paid|paid
    plead|pled|pled
    prove||proven
    rend|rent|rent
    ride|rode|ridden
    ring|rang|rung
    rise|rose|risen
    run|ran|
    saw||sawn
    say|said|said
    see|saw|seen
    seek|sought|sought
    sell|sold|sold
    send|sent|sent
    sew||sewn
    shake|shook|shaken
    shear||shorn
    shine|shone|shone
    shoe|shod|shod
    shoot|shot|shot
    show||shown
    shrink|shrank|shrunk
    sing|sang|sung
    sink|sank|sunk
    sit|sat|sat
    slay|slew|slain
    sleep|slept|slept
    slide|slid|slid
    sling|slung|slung
    slink|slunk|slunk
    smell|smelt|smelt
    smite|smote|smitten
    sow||sown
    speak|spoke spake|spoken
    speed|sped|sped
    spell|spelt|spelt
    spend|spent|spent
    spill|spilt|spilt
    spin|spun|spun
    spit|spat|spat
    spoil|spoilt|spoilt
    spring|sprang|sprung
    stand|stood|stood
    steal|stole|stolen
    stick|stuck|stuck
    sting|stung|stung
    stink|stank|stunk
    strew||strewn
    stride|strode|stridden
    strike|struck|struck stricken
    string|strung|strung
    strive|strove|striven
    swear|swore|sworn
    sweep|swept|swept
    swell||swollen
    swim|swam|swum
    swing|swung|swung
    take|took|taken
    teach|taught|taught
    tear|tore|torn
    tell|told|told
    think|thought|thought
    thrive|throve|thriven
    throw|threw|thrown
    tread|trod|trodden
    wake|woke|woken
    wear|wore|worn
    weave|wove|woven
    weep|wept|wept
    win|won|won
    wind|wound|wound
    work|wrought|wrought
    write|wrote|written
    abide|abode|abode
    chide|chid|chidden
    clothe|clad|clad
    lade||laden
    shrive|shrove|shriven`;

// Forms too short or too common as word endings for a suffix rule
// (create -> creeat, play -> plie, split -> splight): whole words only.
const wholeWordForms = new Set(['ate', 'lay', 'lit', 'bit', 'hid', 'won', 'dove']);

let ruleCount = 0;
const suffix = (inflected, deinflected, conditionsIn, conditionsOut, extra = {}) => {
    ++ruleCount;
    return {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, ...extra};
};
const wholeWord = (inflected, deinflected, conditionsIn, conditionsOut) => {
    ++ruleCount;
    return {type: 'wholeWord', inflected, deinflected, conditionsIn, conditionsOut};
};
const phrasal = (inflected, deinflected) => {
    ++ruleCount;
    return {type: 'phrasal', inflected, deinflected, followedBy: 'phrasalFollowers', conditionsIn: ['v_io'], conditionsOut: ['v', 'v_fw']};
};

// Spelling rules that share one phrasal copy: their stem constraints have
// no phrasal counterpart, so one plain copy of their ending (-ed, -ing, -er,
// -est, -s) stands for all of them.
const sharedEnding = new Map();
const plain = (rule, ending) => {
    sharedEnding.set(rule, ending);
    return rule;
};

// Letter classes of the spelling rules. y is a vowel here (play, try); w and x
// end stems but are never doubled (owned, showed, fixed).
const VOWEL = '[aeiouyAEIOUY]';
const letters = (chars) => `[${chars}${chars.toUpperCase()}]`;
const STEM_CONSONANTS = 'bcdfghjklmnpqrstvwxz';
// The consonants a stem ends in before an ending (arc-ed, sync-ing); j, q and
// v do not end English stems (love and solve end in e).
const FINAL_CONSONANTS = 'b c d f g h k l m n p r s t z'.split(' ');
const SHORT_VOWELS = 'a e i o u y'.split(' ');

/**
 * An ending added to a stem without a spelling change (walk-ed, look-ing,
 * cheap-er). A one-syllable stem that ends in one vowel and one consonant
 * doubles the consonant first (hop -> hopped, big -> bigger), so hoped,
 * taking and later are never hop, tak and lat + an ending. The rules allow
 * a stem that ends
 * - in a vowel or w, x, y (`vowelFinal`: [class, stemMinLength] pairs);
 * - in two consonants (walk-ed, help-ing, rich-er), except a consonant of
 *   `doubling` twice (bigg-er is big + ger);
 * - in a vowel and a consonant after an earlier vowel (look-ed, visit-ed,
 *   open-ing, cheap-er).
 */
function plainEnding(ending, conditionsIn, conditionsOut, {vowelFinal, doubling = ''}) {
    // (stemMinLength 2 for two consonants: sped and bring are not sp, br + an ending.)
    const rules = vowelFinal.map(([cls, min]) => plain(suffix(ending, '', conditionsIn, conditionsOut, {stemMinLength: min, stemEndsWith: cls}), ending));
    for (const c of FINAL_CONSONANTS) {
        const before = doubling.includes(c) ? STEM_CONSONANTS.replace(c, '') : STEM_CONSONANTS;
        rules.push(plain(suffix(`${c}${ending}`, c, conditionsIn, conditionsOut, {stemMinLength: 2, stemEndsWith: letters(before)}), ending));
        for (const v of SHORT_VOWELS) {
            rules.push(plain(suffix(`${v}${c}${ending}`, `${v}${c}`, conditionsIn, conditionsOut, {stemContains: VOWEL}), ending));
        }
    }
    return rules;
}

/** A consonant doubled before an ending: stopped, planned, travelled, bussed. */
function doubledEnding(ending, conditionsIn, conditionsOut) {
    return [
        ...doubled.map((c) => suffix(`${c}${c}${ending}`, c, conditionsIn, conditionsOut, {stemMinLength: 1})),
        suffix(`ss${ending}`, 's', conditionsIn, conditionsOut, {stemMinLength: 1, stemNotEndsWith: '[eE]'}),
        // panicked, picnicking, trafficked; not locked or ticking.
        ...SHORT_VOWELS.map((v) => suffix(`${v}ck${ending}`, `${v}c`, conditionsIn, conditionsOut, {stemContains: VOWEL})),
    ];
}

/**
 * Suffix rules for irregular forms, skipping a form a shorter rule already
 * turns into the same base (sprang by rang -> ring, swore by wore -> wear).
 */
function irregularRules(pairs, conditionsIn, conditionsOut) {
    const rules = [];
    const literal = [];
    const sorted = [...pairs].sort((a, b) => a[0].length - b[0].length || a[0].localeCompare(b[0]));
    for (const [form, base] of sorted) {
        if (form === base) { continue; }
        if (wholeWordForms.has(form)) {
            rules.push(wholeWord(form, base, conditionsIn, conditionsOut));
            continue;
        }
        const covered = literal.some(([f, b]) => form.endsWith(f) && form.slice(0, form.length - f.length) + b === base);
        if (covered) { continue; }
        literal.push([form, base]);
        rules.push(suffix(form, base, conditionsIn, conditionsOut));
    }
    return rules;
}

const verbTable = irregularVerbs.trim().split('\n').map((line) => {
    const [base, past, participle] = line.trim().split('|');
    return {base, past: past ? past.split(' ') : [], participle: participle ? participle.split(' ') : []};
});

// Words that end an object before a particle, so the interposed-object rule
// does not read across them: prepositions and particles (*look up the word
// in*), conjunctions, auxiliaries, negation, subject pronouns, the past forms
// and participles of the irregular verbs below, the irregular verbs whose
// participle is spelt like the base (*had come up*, *had put off*, *had set
// out*), and the base forms that most often follow an object (*let me go up*,
// *let us sit down*). After an auxiliary such a form is the main verb (*had
// gone out* is not *have out*, *did not give up* not *do up*); after a noun
// it is the predicate (*the cook came up* is not *cook up*).
const objectGuards = [...new Set([...particles, ...words(`
    during near since than till until via
    and or nor but so yet because if unless although though whether while when where why how what which who whom whose
    am is are was were be been being have has had do does did will would shall should can could may might must
    not never
    I i he she we they
    come run become overcome put set cut let hit shut hurt cast burst spread split thrust quit bid read fit
    go get sit stand`), ...verbTable.flatMap(({past, participle}) => [...past, ...participle])])];

const wordLists = {phrasalFollowers, separableParticles, objectGuards};
const pastPairs = verbTable.flatMap(({base, past}) => past.map((form) => [form, base]));
// Participles that are not also the verb's past form.
const participlePairs = verbTable.flatMap(({base, past, participle}) => participle.filter((form) => !past.includes(form)).map((form) => [form, base]));

const V = ['v'];
// The rules below also read the last word of a multiword prefix (a word
// lookup tries *bus stops*, docs/languages.md 9.2), where the stem holds the
// earlier words. NOT_WHOLE (the ending does not follow a space) keeps a short
// word from being read as an ending: *long as* is not *long a*, *found a* not
// *found on*, *the men* not *the man*.
const NOT_WHOLE = '[ ]';
const sEndings = (conditionsIn, conditionsOut) => [
    // -s after a consonant (books, ads, TVs) other than t, and after a vowel
    // with two letters before it in the same word (shoes, days, UFOs), so
    // has, was, his and as are not ha, wa, hi and a.
    plain(suffix('s', '', conditionsIn, conditionsOut, {stemMinLength: 2, stemNotEndsWith: "[aeiouyAEIOUYsStT' ]"}), 's'),
    ...[...'aeiouyAEIOUY'].map((v) => plain(suffix(`${v}s`, v, conditionsIn, conditionsOut, {stemMinLength: 2, stemNotEndsWith: NOT_WHOLE}), 's')),
    // -ts (cats, edits, bits), but not its, which is never it + s.
    plain(suffix('ts', 't', conditionsIn, conditionsOut, {stemMinLength: 1, stemNotEndsWith: "[iI ]"}), 's'),
    plain(suffix('its', 'it', conditionsIn, conditionsOut, {stemMinLength: 1, stemNotEndsWith: NOT_WHOLE}), 's'),
    // -es after s only where the base ends in s: kisses, buses, focuses,
    // atlases, irises; not uses, cases, causes or pleases (use, case, ... + s).
    suffix('sses', 'ss', conditionsIn, conditionsOut, {stemMinLength: 1}),
    suffix('uses', 'us', conditionsIn, conditionsOut, {stemMinLength: 1, stemNotEndsWith: '[aoAO]'}),
    suffix('ases', 'as', conditionsIn, conditionsOut, {stemMinLength: 3, stemNotEndsWith: '[eE]'}),
    suffix('ises', 'is', conditionsIn, conditionsOut, {stemMinLength: 2}),
    wholeWord('gases', 'gas', conditionsIn, conditionsOut),
    wholeWord('biases', 'bias', conditionsIn, conditionsOut),
    wholeWord('lenses', 'lens', conditionsIn, conditionsOut),
    wholeWord('summonses', 'summons', conditionsIn, conditionsOut),
    suffix('xes', 'x', conditionsIn, conditionsOut),
    suffix('zes', 'z', conditionsIn, conditionsOut),
    suffix('zzes', 'z', conditionsIn, conditionsOut),
    suffix('ches', 'ch', conditionsIn, conditionsOut),
    suffix('shes', 'sh', conditionsIn, conditionsOut),
    // heroes, echoes, potatoes; shoes, woes and foes are shoe, woe and foe + s.
    suffix('oes', 'o', conditionsIn, conditionsOut, {stemMinLength: 3}),
    wholeWord('goes', 'go', conditionsIn, conditionsOut),
    // cities, tries; dies, lies, pies and ties are die, lie, pie and tie + s.
    suffix('ies', 'y', conditionsIn, conditionsOut, {stemMinLength: 2}),
    wholeWord('curtsies', 'curtsey', conditionsIn, conditionsOut),
];

const pluralRules = [
    ...sEndings(['np'], ['ns']),
    // -f and -fe nouns.
    suffix('lves', 'lf', ['np'], ['ns']),
    suffix('arves', 'arf', ['np'], ['ns']),
    suffix('eaves', 'eaf', ['np'], ['ns']),
    suffix('oaves', 'oaf', ['np'], ['ns']),
    suffix('ooves', 'oof', ['np'], ['ns']),
    suffix('nives', 'nife', ['np'], ['ns']),
    suffix('wives', 'wife', ['np'], ['ns']),
    suffix('lives', 'life', ['np'], ['ns']),
    suffix('thieves', 'thief', ['np'], ['ns']),
    suffix('turves', 'turf', ['np'], ['ns']),
    // Irregular plurals, with their compounds (women, grandchildren, salespeople,
    // woodlice), but not as a whole last word (the men is not the man).
    suffix('men', 'man', ['np'], ['ns'], {stemNotEndsWith: NOT_WHOLE}),
    suffix('children', 'child', ['np'], ['ns'], {stemNotEndsWith: NOT_WHOLE}),
    suffix('feet', 'foot', ['np'], ['ns'], {stemNotEndsWith: NOT_WHOLE}),
    suffix('teeth', 'tooth', ['np'], ['ns'], {stemNotEndsWith: NOT_WHOLE}),
    suffix('geese', 'goose', ['np'], ['ns'], {stemNotEndsWith: NOT_WHOLE}),
    suffix('mice', 'mouse', ['np'], ['ns'], {stemNotEndsWith: NOT_WHOLE}),
    suffix('lice', 'louse', ['np'], ['ns'], {stemNotEndsWith: NOT_WHOLE}),
    suffix('oxen', 'ox', ['np'], ['ns'], {stemNotEndsWith: NOT_WHOLE}),
    suffix('people', 'person', ['np'], ['ns'], {stemNotEndsWith: NOT_WHOLE}),
    wholeWord('dice', 'die', ['np'], ['ns']),
    wholeWord('monies', 'money', ['np'], ['ns']),
    wholeWord('trollies', 'trolley', ['np'], ['ns']),
    wholeWord('pence', 'penny', ['np'], ['ns']),
    wholeWord('brethren', 'brother', ['np'], ['ns']),
    // Latin and Greek plurals.
    suffix('i', 'us', ['np'], ['ns'], {stemMinLength: 2, stemNotEndsWith: NOT_WHOLE}),
    // paparazzi, libretti, concerti; not radii (radius) or fungi (fungus).
    suffix('i', 'o', ['np'], ['ns'], {stemMinLength: 3, stemEndsWith: '[tzTZ]'}),
    suffix('a', 'um', ['np'], ['ns'], {stemMinLength: 2, stemNotEndsWith: NOT_WHOLE}),
    suffix('a', 'on', ['np'], ['ns'], {stemMinLength: 3, stemNotEndsWith: NOT_WHOLE}),
    suffix('ae', 'a', ['np'], ['ns'], {stemMinLength: 2, stemNotEndsWith: NOT_WHOLE}),
    suffix('mata', 'ma', ['np'], ['ns']),
    // indices, vertices, matrices; not prices, vices or slices.
    suffix('ices', 'ex', ['np'], ['ns'], {stemMinLength: 3}),
    suffix('ices', 'ix', ['np'], ['ns'], {stemMinLength: 3}),
    // crises, theses, analyses; not cases (casis).
    suffix('ses', 'sis', ['np'], ['ns'], {stemMinLength: 3}),
    wholeWord('bases', 'basis', ['np'], ['ns']),
    wholeWord('oases', 'oasis', ['np'], ['ns']),
    wholeWord('axes', 'axis', ['np'], ['ns']),
    suffix('eaux', 'eau', ['np'], ['ns']),
    wholeWord('cherubim', 'cherub', ['np'], ['ns']),
    wholeWord('seraphim', 'seraph', ['np'], ['ns']),
    // Hyphenated compounds pluralised on their first part.
    suffix('s-in-law', '-in-law', ['np'], ['ns']),
    suffix('s-by', '-by', ['np'], ['ns']),
    suffix('s-up', '-up', ['np'], ['ns']),
    suffix('s-on', '-on', ['np'], ['ns']),
    suffix('s-general', '-general', ['np'], ['ns']),
    suffix('s-martial', '-martial', ['np'], ['ns']),
    suffix('s-in-waiting', '-in-waiting', ['np'], ['ns']),
    suffix('ies-in-waiting', 'y-in-waiting', ['np'], ['ns']),
    suffix('men-of-war', 'man-of-war', ['np'], ['ns']),
    suffix('men-at-arms', 'man-at-arms', ['np'], ['ns']),
];

const thirdPersonRules = [
    ...sEndings([], V),
    // busses, focusses, degasses (not presses -> pres).
    suffix('sses', 's', [], V, {stemMinLength: 1, stemNotEndsWith: '[eE]'}),
    wholeWord('does', 'do', [], V),
    wholeWord('is', 'be', [], V),
    wholeWord('has', 'have', [], V),
];

const presentRules = [
    wholeWord('am', 'be', [], V),
    wholeWord('are', 'be', [], V),
];

// The verbs in -ie take -d and -s (tied, ties, boogied); other -ied words come
// from -y (tried, married: Wiktionary has trie and marrie as obsolete
// spellings, so an -ied -> -ie rule would offer them). Those in `ieYing`
// spell -ing -ying (tying); the others -ieing (boogieing).
const ieVerbs = words('die lie tie vie belie untie retie hie hogtie underlie overlie stymie caddie boogie birdie sortie goalie wheelie cookie ghillie gillie pie');
const ieYing = words('die lie tie vie belie untie retie hie hogtie underlie overlie stymie caddie');

const pastRules = [
    ...plainEnding('ed', [], V, {vowelFinal: [['[xX]', 2], ['[aioAIOwyWY]', 3]], doubling: 'mnp'}),
    // hoped, used, agreed, dyed; not tried (trie), shed (she).
    suffix('ed', 'e', [], V, {stemMinLength: 2, stemNotEndsWith: '[iI]', stemContains: VOWEL}),
    ...ieVerbs.map((w) => wholeWord(`${w}d`, w, [], V)),
    suffix('ied', 'y', [], V, {stemMinLength: 2}),
    ...doubledEnding('ed', [], V),
    // spec -> specced, sic -> sicced; an abbreviation verb with an apostrophe (cc'ed, OK'ed).
    suffix('cced', 'c', [], V, {stemMinLength: 1}),
    suffix("'ed", '', [], V, {stemMinLength: 1}),
    wholeWord('was', 'be', [], V),
    wholeWord('were', 'be', [], V),
    wholeWord('had', 'have', [], V),
    wholeWord('could', 'can', [], V),
    wholeWord('would', 'will', [], V),
    wholeWord('should', 'shall', [], V),
    wholeWord('might', 'may', [], V),
    ...irregularRules(pastPairs, [], V),
];

// Compounds of the whole-word forms: floodlit, moonlit, greenlit (a stem of
// three letters keeps split and slit out), overate, underate. They get no
// phrasal copy, which could not keep the stem minimum (split up).
const pastCompoundRules = [
    suffix('lit', 'light', [], V, {stemMinLength: 3}),
    wholeWord('relit', 'relight', [], V),
    ...words('overate underate').map((w) => wholeWord(w, `${w.slice(0, -3)}eat`, [], V)),
];

const pastParticipleRules = [
    wholeWord('been', 'be', [], V),
    ...irregularRules(participlePairs, [], V),
];

const ingRules = [
    ...plainEnding('ing', [], V, {vowelFinal: [['[aeioAEIOwxWX]', 2], ['[yY]', 3]], doubling: 'mnp'}),
    // making -> make, arguing -> argue; not being -> bee, dying -> dye, seeing -> seee.
    suffix('ing', 'e', [], V, {stemMinLength: 2, stemNotEndsWith: '[aeioy]'}),
    wholeWord('eying', 'eye', [], V),
    ...ieYing.map((w) => wholeWord(`${w.slice(0, -2)}ying`, w, [], V)),
    ...doubledEnding('ing', [], V),
    suffix('ccing', 'c', [], V, {stemMinLength: 1}),
    suffix("'ing", '', [], V, {stemMinLength: 1}),
];

// Plain -er and -est also make adverbs (sooner, soonest); the other endings
// only adjectives, so butter, summer and upper do not reach but, sum and up.
const AA = ['adj', 'adv'];
const A = ['adj'];
const comparativeRules = [
    ...plainEnding('er', [], AA, {vowelFinal: [['[wxyWXY]', 2]], doubling: 'bgmnpt'}),
    suffix('r', '', [], A, {stemMinLength: 2, stemEndsWith: '[e]'}),
    suffix('ier', 'y', [], A, {stemMinLength: 1}),
    suffix('ier', 'ey', [], A, {stemMinLength: 1}),
    ...doubledComparative.map((c) => suffix(`${c}${c}er`, c, [], A, {stemMinLength: 1})),
    wholeWord('better', 'good', [], AA),
    wholeWord('better', 'well', [], AA),
    wholeWord('worse', 'bad', [], AA),
    wholeWord('worse', 'ill', [], AA),
    wholeWord('worse', 'badly', [], AA),
    wholeWord('more', 'much', [], AA),
    wholeWord('more', 'many', [], AA),
    wholeWord('less', 'little', [], AA),
    wholeWord('further', 'far', [], AA),
    wholeWord('farther', 'far', [], AA),
    wholeWord('elder', 'old', [], AA),
];

const superlativeRules = [
    ...plainEnding('est', [], AA, {vowelFinal: [['[wxyWXY]', 2]], doubling: 'bgmnpt'}),
    suffix('st', '', [], A, {stemMinLength: 2, stemEndsWith: '[e]'}),
    suffix('iest', 'y', [], A, {stemMinLength: 1}),
    suffix('iest', 'ey', [], A, {stemMinLength: 1}),
    suffix('most', '', [], A, {stemMinLength: 3}),
    ...doubledComparative.map((c) => suffix(`${c}${c}est`, c, [], A, {stemMinLength: 1})),
    wholeWord('best', 'good', [], AA),
    wholeWord('best', 'well', [], AA),
    wholeWord('worst', 'bad', [], AA),
    wholeWord('worst', 'ill', [], AA),
    wholeWord('worst', 'badly', [], AA),
    wholeWord('most', 'much', [], AA),
    wholeWord('most', 'many', [], AA),
    wholeWord('least', 'little', [], AA),
    wholeWord('furthest', 'far', [], AA),
    wholeWord('farthest', 'far', [], AA),
    wholeWord('eldest', 'old', [], AA),
];

// Apostrophes reach the rules as U+0027 (the normalizeApostrophes preprocessor).
const possessiveRules = [
    suffix("'s", '', [], [], {stemMinLength: 1}),
    suffix("'", '', [], [], {stemMinLength: 1, stemEndsWith: '[sSzZ]'}),
];

// Clitics: the host word keeps its own part of speech, so the outputs have no
// conditions. 's is is, has or us after the words below (it's, let's); after
// other words the possessive rule reads it. These whole words are longer
// matches than the possessive's 's, so their trace is the one a lookup shows.
const contractionRules = [
    ...words('it that there here what where who how when why he she let').map((w) => wholeWord(`${w}'s`, w, [], [])),
    ...["'re", "'ve", "'ll", "'d", "'m"].map((clitic) => suffix(clitic, '', [], [], {stemMinLength: 1})),
];

// The auxiliaries and modals that take n't, as whole words, so warn't (was,
// were) is not war + n't.
const negativeRules = [
    ...words('do have could would should must need might ought dare may').map((w) => wholeWord(`${w}n't`, w, [], V)),
    wholeWord("doesn't", 'do', [], V),
    wholeWord("didn't", 'do', [], V),
    wholeWord("isn't", 'be', [], V),
    wholeWord("aren't", 'be', [], V),
    wholeWord("wasn't", 'be', [], V),
    wholeWord("weren't", 'be', [], V),
    wholeWord("hasn't", 'have', [], V),
    wholeWord("hadn't", 'have', [], V),
    wholeWord("can't", 'can', [], V),
    wholeWord('cannot', 'can', [], V),
    wholeWord("won't", 'will', [], V),
    wholeWord("shan't", 'shall', [], V),
    wholeWord("ain't", 'be', [], V),
    wholeWord("ain't", 'have', [], V),
];

const droppedGRules = [suffix("in'", 'ing', [], [], {stemMinLength: 1})];

// -'d for -ed in older verse (adorn'd, lov'd). The output has no conditions so
// the past rules read it next; a stem of three letters keeps he'd and we'd
// (would, had) from becoming heed and weed.
const elidedEdRules = [suffix("'d", 'ed', [], [], {stemMinLength: 3})];

// The text as written or after a first-word rule (*turned it off* -> *turn it
// off* -> *turn off*); the output is a verb (*all came out* is not *all out*).
const interposedObjectRules = [
    {type: 'interposedObject', particles: 'separableParticles', guardWords: 'objectGuards', conditionsIn: ['v_fw'], conditionsOut: ['v', 'v_io']},
];
ruleCount += interposedObjectRules.length;

// The placeholders multiword dictionary entries are written with
// (*lose one's temper*, *let someone down*, *enjoy oneself*).
const replace = (inflected, deinflected) => {
    ++ruleCount;
    return {type: 'replace', inflected, deinflected, conditionsIn: ['v'], conditionsOut: []};
};
const possessiveDeterminers = words('my your his her its our their');
const objectPronouns = words('me you him her us them');
const reflexives = words('myself yourself himself herself itself ourselves yourselves themselves');
const placeholderRules = [
    ...possessiveDeterminers.map((w) => replace(` ${w} `, " one's ")),
    ...possessiveDeterminers.map((w) => replace(` ${w} `, " someone's ")),
    ...objectPronouns.map((w) => replace(` ${w} `, ' someone ')),
    ...reflexives.map((w) => replace(` ${w}`, ' oneself')),
];

// Early Modern English (the King James Bible, Shakespeare): optional, since
// -est and -eth endings also end ordinary words (interest, honest).
const archaicSecondPersonRules = [
    suffix('est', '', [], V, {stemMinLength: 2}),
    suffix('st', '', [], V, {stemMinLength: 2, stemEndsWith: '[e]'}),
    suffix('iest', 'y', [], V, {stemMinLength: 1}),
    wholeWord('art', 'be', [], V),
    wholeWord('wast', 'be', [], V),
    wholeWord('wert', 'be', [], V),
    wholeWord('hast', 'have', [], V),
    wholeWord('hadst', 'have', [], V),
    wholeWord('dost', 'do', [], V),
    wholeWord('didst', 'do', [], V),
    wholeWord('shalt', 'shall', [], V),
    wholeWord('wilt', 'will', [], V),
    wholeWord('canst', 'can', [], V),
    wholeWord('couldst', 'could', [], V),
    wholeWord('wouldst', 'would', [], V),
    wholeWord('shouldst', 'should', [], V),
    wholeWord('mayst', 'may', [], V),
    wholeWord('mightst', 'might', [], V),
];
const archaicThirdPersonRules = [
    suffix('eth', '', [], V, {stemMinLength: 2}),
    suffix('eth', 'e', [], V, {stemMinLength: 2}),
    suffix('ieth', 'y', [], V, {stemMinLength: 1}),
    wholeWord('hath', 'have', [], V),
    wholeWord('doth', 'do', [], V),
    wholeWord('saith', 'say', [], V),
];

const prefixWord = (inflected, deinflected) => {
    ++ruleCount;
    return {type: 'prefix', inflected: `${inflected} `, deinflected: `${deinflected} `, conditionsIn: ['v_io'], conditionsOut: ['v', 'v_fw']};
};

/**
 * The same endings on the first word of a multiword verb (*looked up*, *gave
 * up on*): a phrasal rule per suffix rule, and for a whole-word form (*was*,
 * *ate*, *had*) a prefix rule on the word and a space (*had to* -> *have to*),
 * so it never matches the end of a longer word. They read the text as written
 * and the output of the interposed-object rule (`v_io`: *picked Tom up* ->
 * *picked up* -> *pick up*).
 */
function withPhrasal(rules) {
    const seen = new Set();
    const out = [...rules];
    for (const rule of rules) {
        // The spelling rules share one copy of their ending.
        const [inflected, deinflected] = sharedEnding.has(rule) ? [sharedEnding.get(rule), ''] : [rule.inflected, rule.deinflected];
        const key = `${rule.type}\u0000${inflected}\u0000${deinflected}`;
        if (seen.has(key)) { continue; }
        seen.add(key);
        out.push(rule.type === 'wholeWord' ? prefixWord(inflected, deinflected) : phrasal(inflected, deinflected));
    }
    return out;
}

// The endings of verbs, adjectives and clitic hosts are read from one word:
// a multiword verb inflects its first word (the phrasal and prefix copies),
// and in a multiword prefix (docs/languages.md 9.2) the last word mostly
// starts the next phrase (*had formed* is not *had form*, *say the words*
// not *say the word*, *see you're right* not *see you*). Nouns keep their
// multiword plurals and possessives (*bus stops*, *old man's*).
const ONE_WORD = '[^ ]';
const oneWord = (rules) => rules.map((rule) => (rule.type === 'suffix' ? {...rule, stemCharacters: ONE_WORD} : rule));
// A plural after *the* is not read: *the things*, *the days* and *the ones*
// would reach the idioms *the thing*, *the day* and *the one* when *the* is
// hovered.
const notAfterThe = (rules) => rules.map((rule) => (rule.type === 'suffix' ? {...rule, stemNotStartsWithText: 'the '} : rule));

// Transforms that mean what one of Yomitan's English transforms means use its
// id (3rd pers. sing. pres, dropped g, interposed object), so the two files
// merge transform by transform; names and descriptions are this pack's.
const transform = (id, name, description, rules, extra = {}) => ({id, name, description, source: 'own', ...extra, rules});

const transforms = [
    transform('plural', 'plural', 'Plural form of a noun (books, boxes, cities, wolves, children, data).', notAfterThe(pluralRules)),
    transform('3rd pers. sing. pres', 'third-person singular', 'Third-person singular present of a verb (walks, watches, tries, is, has).', oneWord(withPhrasal(thirdPersonRules))),
    transform('present', 'present', 'Present tense of be other than the third-person singular (am, are).', withPhrasal(presentRules)),
    transform('past', 'past', 'Past tense of a verb, and the past participle of a regular verb (walked, stopped, tried, went, could).', oneWord([...withPhrasal(pastRules), ...pastCompoundRules])),
    transform('pastParticiple', 'past participle', 'Past participle of an irregular verb (taken, written, gone, been).', oneWord(withPhrasal(pastParticipleRules))),
    transform('ing', '-ing', 'Present participle or gerund of a verb (walking, making, running, lying).', oneWord(withPhrasal(ingRules))),
    transform('comparative', 'comparative', 'Comparative of an adjective or adverb (taller, nicer, happier, bigger, better).', oneWord(comparativeRules)),
    transform('superlative', 'superlative', 'Superlative of an adjective or adverb (tallest, nicest, happiest, biggest, best).', oneWord(superlativeRules)),
    transform('possessive', 'possessive', "Possessive of a noun or name (teacher's, James', dogs').", possessiveRules),
    transform('contraction', 'contraction', "A word with a contracted is, has, are, have, will, would, had or am ('s, 're, 've, 'll, 'd, 'm).", oneWord(contractionRules)),
    transform('negative', 'negative', "Negative contraction of an auxiliary (don't, isn't, can't, won't).", negativeRules),
    transform('dropped g', 'dropped g', "Informal -in' for -ing (goin', nothin').", oneWord(droppedGRules)),
    transform('archaic', 'archaic', "-'d for -ed in older verse (adorn'd, lov'd).", oneWord(elidedEdRules)),
    transform('interposed object', 'interposed object', 'An object between a verb and its particle (turn it off, put Mary\'s coat away).', interposedObjectRules),
    transform('placeholder', 'placeholder', "A pronoun written as the placeholder of a dictionary entry (his temper -> one's temper, let him down -> let someone down, enjoy himself -> enjoy oneself).", placeholderRules),
    transform('archaicSecondPerson', 'archaic second person', 'Early Modern English second-person singular (thou walkest, thou art, thou hast).', oneWord(archaicSecondPersonRules), {optional: true}),
    transform('archaicThirdPerson', 'archaic third person', 'Early Modern English third-person singular (he walketh, he hath, he doth).', oneWord(archaicThirdPersonRules), {optional: true}),
];

const out = {schema: 1, conditions, wordLists, transforms};
const file = join(dirname(fileURLToPath(import.meta.url)), 'own.json');
writeFileSync(file, formatTransforms(out));
console.log(`${file}: ${transforms.length} transforms, ${ruleCount} rules`);
