#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Writes languages/de/sources/own.json: the German deinflection rules written
// for this pack (docs/languages.md, section 14 step 2), from the paradigm
// tables below. Run from the repository root:
//
//   node languages/de/sources/build-own.mjs
//
// The tables follow the standard description of German inflection (Duden,
// Die Grammatik; Wiktionary's German conjugation and declension tables):
// weak verbs with their -e-, -el- and -er- stems, the strong and mixed verbs
// with their present, preterite, subjunctive II and participle stems, the
// modal verbs, sein, haben, werden and tun, separable and inseparable
// prefixes (the participle ge- inside the verb, the zu-infinitive, a
// particle that stands at the end of the clause), noun plurals with and
// without umlaut, the dative plural and the genitive, adjective endings,
// comparatives and superlatives, and the contractions of a preposition and
// an article.

import {writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatTransforms} from '../../../tools/lib/json.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// --- Conditions ---------------------------------------------------------------
// v, n and adj are the part-of-speech tags German Yomitan dictionaries put in
// their `rules` column (wiktionary-to-yomitan writes exactly these three).
// sep marks a finite verb whose separated particle was put back in front of
// it (kommt ... an -> ankommt); only the rules for finite forms take it. ns
// and np are a noun read as singular or plural, so that a dative plural
// (Kindern -> Kinder) goes on to the plural rules and a singular does not.
const conditions = {
    v: {name: 'Verb', isDictionaryForm: true},
    sep: {name: 'Finite verb with its separated particle put back', isDictionaryForm: false},
    n: {name: 'Noun', isDictionaryForm: true, subConditions: ['ns', 'np']},
    ns: {name: 'Noun, singular', isDictionaryForm: false},
    np: {name: 'Noun, plural', isDictionaryForm: false},
    adj: {name: 'Adjective', isDictionaryForm: true},
};

// Every stem is one word: letters, digits, combining marks and hyphens
// (E-Mails), never a space, so an ending never fires on the last word of a
// longer text (docs/languages.md 14, step 2).
const STEM = '{stemChar}';
const FINITE_IN = ['sep'];
const VERB_OUT = ['v'];

// --- Transforms -------------------------------------------------------------------
const transforms = [];
const byId = new Map();
const seen = new Set();

function transform(id, name, description) {
    if (byId.has(id)) { throw new Error(`duplicate transform ${id}`); }
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
    if (inflected === deinflected && extra.stemChange === undefined) { return; }
    add(id, {type: 'suffix', inflected, deinflected, conditionsIn, conditionsOut, stemCharacters: STEM, ...extra});
}

// The listed forms of strong and irregular verbs are long and specific
// (verstand, gegangen, nimmt), so they take no stem constraint. That keeps
// tests/classes.json, which lists every constrained field, small.
// They are collected per transform and written as one cross-product rule
// with an empty prefix, which is a list of suffix rules (docs/languages.md
// 7.3) and keeps sources/own.json small.
const listed = new Map();  // transform id -> {conditionsIn, conditionsOut, pairs}
function form(id, inflected, deinflected, conditionsIn, conditionsOut) {
    if (inflected === deinflected) { return; }
    if (!byId.has(id)) { throw new Error(`no transform ${id}`); }
    const key = `${id}\u0000${JSON.stringify(conditionsIn)}\u0000${JSON.stringify(conditionsOut)}`;
    if (!listed.has(key)) { listed.set(key, {id, conditionsIn, conditionsOut, pairs: [], seen: new Set()}); }
    const entry = listed.get(key);
    const pair = `${inflected}\u0000${deinflected}`;
    if (entry.seen.has(pair)) { return; }
    entry.seen.add(pair);
    entry.pairs.push([inflected, deinflected]);
}
function writeListed() {
    for (const {id, conditionsIn, conditionsOut, pairs} of listed.values()) {
        add(id, {type: 'circumfix', prefixes: [['', '']], suffixes: pairs, conditionsIn, conditionsOut});
    }
}

function wholeWord(id, inflected, deinflected, conditionsIn, conditionsOut) {
    add(id, {type: 'wholeWord', inflected, deinflected, conditionsIn, conditionsOut});
}

// --- Strong, mixed and irregular verbs ----------------------------------------------
// infinitive | present du, er (when the vowel changes) | imperative (du) when
// it differs from the stem | preterite (ich, er) | subjunctive II (ich, er) |
// past participle. Alternatives are separated by commas, "-" is none. Verbs
// with an inseparable prefix of their own (befehlen, verlieren, beginnen)
// are listed; others reach their prefixed verbs through the suffix rules
// (verstand -> verstehen, bekam -> bekommen).
const STRONG = `
backen | bäckst bäckt | - | buk | büke | gebacken
befehlen | befiehlst befiehlt | befiehl | befahl | beföhle,befähle | befohlen
beginnen | - | - | begann | begänne,begönne | begonnen
beißen | - | - | biss | bisse | gebissen
bergen | birgst birgt | birg | barg | bärge | geborgen
bersten | birst birst | birst | barst | bärste | geborsten
biegen | - | - | bog | böge | gebogen
bieten | - | - | bot | böte | geboten
binden | - | - | band | bände | gebunden
bitten | - | - | bat | bäte | gebeten
blasen | bläst bläst | - | blies | bliese | geblasen
bleiben | - | - | blieb | bliebe | geblieben
braten | brätst brät | - | briet | briete | gebraten
brechen | brichst bricht | brich | brach | bräche | gebrochen
dreschen | drischst drischt | drisch | drosch | drösche | gedroschen
dringen | - | - | drang | dränge | gedrungen
empfehlen | empfiehlst empfiehlt | empfiehl | empfahl | empföhle,empfähle | empfohlen
erlöschen | erlischst erlischt | erlisch | erlosch | erlösche | erloschen
erschrecken | erschrickst erschrickt | erschrick | erschrak | erschräke | erschrocken
essen | isst isst | iss | aß | äße | gegessen
fahren | fährst fährt | - | fuhr | führe | gefahren
fallen | fällst fällt | - | fiel | fiele | gefallen
fangen | fängst fängt | - | fing | finge | gefangen
fechten | fichtst ficht | ficht | focht | föchte | gefochten
finden | - | - | fand | fände | gefunden
flechten | flichtst flicht | flicht | flocht | flöchte | geflochten
fliegen | - | - | flog | flöge | geflogen
fliehen | - | - | floh | flöhe | geflohen
fließen | - | - | floss | flösse | geflossen
fressen | frisst frisst | friss | fraß | fräße | gefressen
frieren | - | - | fror | fröre | gefroren
gären | - | - | gor | göre | gegoren
gebären | gebierst gebiert | gebier | gebar | gebäre | geboren
geben | gibst gibt | gib | gab | gäbe | gegeben
gedeihen | - | - | gedieh | gediehe | gediehen
gehen | - | - | ging | ginge | gegangen
gelingen | - | - | gelang | gelänge | gelungen
gelten | giltst gilt | gilt | galt | gälte,gölte | gegolten
genesen | - | - | genas | genäse | genesen
genießen | - | - | genoss | genösse | genossen
geschehen | geschiehst geschieht | - | geschah | geschähe | geschehen
gewinnen | - | - | gewann | gewänne,gewönne | gewonnen
gießen | - | - | goss | gösse | gegossen
gleichen | - | - | glich | gliche | geglichen
gleiten | - | - | glitt | glitte | geglitten
glimmen | - | - | glomm | glömme | geglommen
graben | gräbst gräbt | - | grub | grübe | gegraben
greifen | - | - | griff | griffe | gegriffen
halten | hältst hält | - | hielt | hielte | gehalten
hängen | - | - | hing | hinge | gehangen
hauen | - | - | hieb | hiebe | gehauen
heben | - | - | hob | höbe | gehoben
heißen | - | - | hieß | hieße | geheißen
helfen | hilfst hilft | hilf | half | hülfe,hälfe | geholfen
klimmen | - | - | klomm | klömme | geklommen
klingen | - | - | klang | klänge | geklungen
kneifen | - | - | kniff | kniffe | gekniffen
kommen | - | - | kam | käme | gekommen
kriechen | - | - | kroch | kröche | gekrochen
laden | lädst lädt | - | lud | lüde | geladen
lassen | lässt lässt | - | ließ | ließe | gelassen
laufen | läufst läuft | - | lief | liefe | gelaufen
leiden | - | - | litt | litte | gelitten
leihen | - | - | lieh | liehe | geliehen
lesen | liest liest | lies | las | läse | gelesen
liegen | - | - | lag | läge | gelegen
lügen | - | - | log | löge | gelogen
mahlen | - | - | - | - | gemahlen
meiden | - | - | mied | miede | gemieden
melken | - | - | molk | mölke | gemolken
messen | misst misst | miss | maß | mäße | gemessen
misslingen | - | - | misslang | misslänge | misslungen
nehmen | nimmst nimmt | nimm | nahm | nähme | genommen
pfeifen | - | - | pfiff | pfiffe | gepfiffen
preisen | - | - | pries | priese | gepriesen
quellen | quillst quillt | quill | quoll | quölle | gequollen
raten | rätst rät | - | riet | riete | geraten
reiben | - | - | rieb | riebe | gerieben
reißen | - | - | riss | risse | gerissen
reiten | - | - | ritt | ritte | geritten
riechen | - | - | roch | röche | gerochen
ringen | - | - | rang | ränge | gerungen
rinnen | - | - | rann | ränne,rönne | geronnen
rufen | - | - | rief | riefe | gerufen
salzen | - | - | - | - | gesalzen
saufen | säufst säuft | - | soff | söffe | gesoffen
saugen | - | - | sog | söge | gesogen
schaffen | - | - | schuf | schüfe | geschaffen
scheiden | - | - | schied | schiede | geschieden
scheinen | - | - | schien | schiene | geschienen
schelten | schiltst schilt | schilt | schalt | schölte | gescholten
scheren | - | - | schor | schöre | geschoren
schieben | - | - | schob | schöbe | geschoben
schießen | - | - | schoss | schösse | geschossen
schinden | - | - | schund | schünde | geschunden
schlafen | schläfst schläft | - | schlief | schliefe | geschlafen
schlagen | schlägst schlägt | - | schlug | schlüge | geschlagen
schleichen | - | - | schlich | schliche | geschlichen
schleifen | - | - | schliff | schliffe | geschliffen
schließen | - | - | schloss | schlösse | geschlossen
schlingen | - | - | schlang | schlänge | geschlungen
schmeißen | - | - | schmiss | schmisse | geschmissen
schmelzen | schmilzt schmilzt | schmilz | schmolz | schmölze | geschmolzen
schneiden | - | - | schnitt | schnitte | geschnitten
schreiben | - | - | schrieb | schriebe | geschrieben
schreien | - | - | schrie | schriee | geschrien,geschrieen
schreiten | - | - | schritt | schritte | geschritten
schweigen | - | - | schwieg | schwiege | geschwiegen
schwellen | schwillst schwillt | schwill | schwoll | schwölle | geschwollen
schwimmen | - | - | schwamm | schwämme,schwömme | geschwommen
schwinden | - | - | schwand | schwände | geschwunden
schwingen | - | - | schwang | schwänge | geschwungen
schwören | - | - | schwor,schwur | schwüre,schwöre | geschworen
sehen | siehst sieht | sieh,siehe | sah | sähe | gesehen
sieden | - | - | sott | sötte | gesotten
singen | - | - | sang | sänge | gesungen
sinken | - | - | sank | sänke | gesunken
sinnen | - | - | sann | sänne | gesonnen
sitzen | - | - | saß | säße | gesessen
spalten | - | - | - | - | gespalten
speien | - | - | spie | spiee | gespien
spinnen | - | - | spann | spänne,spönne | gesponnen
sprechen | sprichst spricht | sprich | sprach | spräche | gesprochen
sprießen | - | - | spross | sprösse | gesprossen
springen | - | - | sprang | spränge | gesprungen
stechen | stichst sticht | stich | stach | stäche | gestochen
stehen | - | - | stand | stünde,stände | gestanden
stehlen | stiehlst stiehlt | stiehl | stahl | stähle,stöhle | gestohlen
steigen | - | - | stieg | stiege | gestiegen
sterben | stirbst stirbt | stirb | starb | stürbe | gestorben
stinken | - | - | stank | stänke | gestunken
stoßen | stößt stößt | - | stieß | stieße | gestoßen
streichen | - | - | strich | striche | gestrichen
streiten | - | - | stritt | stritte | gestritten
tragen | trägst trägt | - | trug | trüge | getragen
treffen | triffst trifft | triff | traf | träfe | getroffen
treiben | - | - | trieb | triebe | getrieben
treten | trittst tritt | tritt | trat | träte | getreten
trinken | - | - | trank | tränke | getrunken
trügen | - | - | trog | tröge | getrogen
verderben | verdirbst verdirbt | verdirb | verdarb | verdürbe | verdorben
verdrießen | - | - | verdross | verdrösse | verdrossen
vergessen | vergisst vergisst | vergiss | vergaß | vergäße | vergessen
verlieren | - | - | verlor | verlöre | verloren
verzeihen | - | - | verzieh | verziehe | verziehen
wachsen | wächst wächst | - | wuchs | wüchse | gewachsen
wägen | - | - | wog | wöge | gewogen
waschen | wäschst wäscht | - | wusch | wüsche | gewaschen
weben | - | - | wob | wöbe | gewoben
weichen | - | - | wich | wiche | gewichen
weisen | - | - | wies | wiese | gewiesen
werben | wirbst wirbt | wirb | warb | würbe | geworben
werfen | wirfst wirft | wirf | warf | würfe | geworfen
wiegen | - | - | wog | wöge | gewogen
winden | - | - | wand | wände | gewunden
wringen | - | - | wrang | wränge | gewrungen
ziehen | - | - | zog | zöge | gezogen
zwingen | - | - | zwang | zwänge | gezwungen
`;

// Mixed verbs and the modal verbs: a changed stem with weak endings.
// infinitive | present (ich, er) and (du) when irregular | preterite (ich, er) |
// subjunctive II (ich, er) | past participle.
const MIXED = `
brennen | - | brannte | brennte | gebrannt
bringen | - | brachte | brächte | gebracht
denken | - | dachte | dächte | gedacht
kennen | - | kannte | kennte | gekannt
nennen | - | nannte | nennte | genannt
rennen | - | rannte | rennte | gerannt
senden | - | sandte | - | gesandt
wenden | - | wandte | - | gewandt
haben | - | hatte | hätte | -
wissen | weiß weißt | wusste | wüsste | gewusst
dürfen | darf darfst | durfte | dürfte | gedurft
können | kann kannst | konnte | könnte | gekonnt
mögen | mag magst | mochte | möchte | gemocht
müssen | muss musst | musste | müsste | gemusst
sollen | soll sollst | - | - | -
wollen | will willst | - | - | -
werden | - | wurde | würde | geworden,worden
`;

const parse = (table, width) => table.trim().split('\n').map((line) => {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length !== width) { throw new Error(`bad table line: ${line}`); }
    return cells.map((c) => (c === '-' ? [] : c.split(',').map((x) => x.trim())));
});

// Inseparable prefixes: a strong participle after one of them has no ge-
// (verstanden, bekommen, erschienen, unterschrieben).
const INSEPARABLE = ['be', 'emp', 'ent', 'er', 'ge', 'hinter', 'miss', 'ver', 'wider', 'zer', 'über', 'unter', 'durch', 'um', 'voll'];

// Separable particles: the participle has ge- after them (angekommen), the
// zu-infinitive zu (anzukommen), and in a main clause they stand at the end
// (kommt ... an).
const PARTICLES = [
    'ab', 'an', 'auf', 'aus', 'auseinander', 'bei', 'beisammen', 'bekannt', 'bereit', 'da', 'dabei', 'dafür', 'dagegen',
    'daher', 'dahin', 'dahinter', 'damit', 'daneben', 'dar', 'daran', 'darauf', 'daraus', 'darein', 'darüber', 'darum',
    'darunter', 'davon', 'davor', 'dazu', 'dazwischen', 'drauf', 'drein', 'durch', 'ein', 'empor', 'entgegen', 'entlang',
    'entzwei', 'fehl', 'fern', 'fertig', 'fest', 'fort', 'frei', 'gegenüber', 'gleich', 'gut', 'heim', 'her', 'herab',
    'heran', 'herauf', 'heraus', 'herbei', 'herein', 'hernieder', 'herüber', 'herum', 'herunter', 'hervor', 'herzu',
    'hin', 'hinab', 'hinauf', 'hinaus', 'hinein', 'hinterher', 'hinüber', 'hinunter', 'hinweg', 'hinzu', 'hoch',
    'kaputt', 'kennen', 'klar', 'kund', 'leer', 'los', 'mit', 'nach', 'nahe', 'nieder', 'offen', 'preis', 'rauf',
    'raus', 'rein', 'rüber', 'rum', 'runter', 'schief', 'statt', 'still', 'teil', 'tot', 'über', 'überein', 'um',
    'umher', 'unter', 'voll', 'voran', 'voraus', 'vorbei', 'vorüber', 'vorweg', 'vor', 'wach', 'wahr', 'warm', 'weg',
    'weh', 'weiter', 'wider', 'wieder', 'zu', 'zurecht', 'zurück', 'zusammen', 'zuvor', 'zwischen',
];

// --- Verb transforms ---------------------------------------------------------------
transform('present-modal', 'present (ich, er)',
    'Present tense of a modal verb or wissen, first and third person singular (ich/er kann, darf, muss, mag, soll, will, weiß).');
transform('present-ich', 'present (ich)',
    'Present tense, first person singular (ich mache, gehe, sammle, wandere). The same form is the subjunctive I of ich and er (er habe, es gebe) and the imperative with -e (mache!).');
transform('present-du', 'present (du)',
    'Present tense, second person singular (du machst, arbeitest, sammelst, gibst, fährst, kannst).');
transform('present-du-er', 'present (du, er)',
    'Present tense, second and third person singular of a strong verb whose stem ends in s, ß or z (du/er liest, isst, lässt, stößt, wächst).');
transform('present-er', 'present (er, ihr)',
    'Present tense, third person singular, which is also the second person plural and its imperative (er macht, arbeitet, gibt, fährt; ihr macht, macht!).');
transform('present-wir', 'present (wir, sie)',
    'Present tense, first and third person plural, which other verbs write like the infinitive (wir sind, sie sind).');
transform('imperative', 'imperative (du)',
    'Imperative, second person singular, without -e (mach!, komm!, gib!, nimm!, sieh!, lies!, sei!).');
transform('past-participle', 'past participle',
    'Past participle (gemacht, gearbeitet, eingekauft, gegangen, angefangen, verstanden, bekommen).');
transform('present-participle', 'present participle',
    'Present participle (machend, lächelnd, wandernd).');
transform('past', 'past (ich, er)',
    'Simple past (preterite), first and third person singular (machte, arbeitete, ging, kam, brachte, war). For weak verbs it is also the subjunctive II.');
transform('past-du', 'past (du)',
    'Simple past, second person singular (machtest, gingst, fandest, warst).');
transform('past-wir', 'past (wir, sie)',
    'Simple past, first and third person plural (machten, gingen, kamen, waren).');
transform('past-ihr', 'past (ihr)',
    'Simple past, second person plural (machtet, gingt, fandet, wart).');
transform('subjunctive-1', 'subjunctive I',
    'Subjunctive I (Konjunktiv I) of du and ihr (du machest, ihr machet), and the forms of sein (er sei, sie seien).');
transform('subjunctive-2', 'subjunctive II (ich, er)',
    'Subjunctive II (Konjunktiv II) of a strong or mixed verb, first and third person singular (ginge, käme, wäre, hätte, würde, brächte, könnte).');
transform('subjunctive-2-du', 'subjunctive II (du)',
    'Subjunctive II, second person singular (gingest, kämst, wärst, hättest, würdest).');
transform('subjunctive-2-wir', 'subjunctive II (wir, sie)',
    'Subjunctive II, first and third person plural (gingen, kämen, wären, hätten, würden).');
transform('subjunctive-2-ihr', 'subjunctive II (ihr)',
    'Subjunctive II, second person plural (ginget, kämt, wärt, hättet, würdet).');
transform('zu-infinitive', 'zu-infinitive',
    'Infinitive with zu between a separable prefix and the verb (anzurufen, aufzustehen, kennenzulernen).');
transform('separated-prefix', 'separated prefix',
    'A separable prefix at the end of the clause, put back in front of its verb (kommt morgen an. -> ankommt -> ankommen; Hör auf! -> aufhören).');

// Regular (weak) endings. The minimum stem of two letters keeps short words
// from reading as verbs (die -> dien, ist -> isen are not looked up as such).
// German writes nouns with a capital letter, so a noun ending is removed only
// from a capitalized word and a verb or adjective ending only from a word in
// small letters; decapitalize and capitalizeFirstLetter give sentence-initial
// words (Gingen sie?) and lowercased nouns (häuser) the other case.
const LOWER = '{lower}';
const UPPER = '{upper}';
const MIN2 = {stemMinLength: 2, stemStartsWith: LOWER};
const DTMN = {stemMinLength: 2, stemStartsWith: LOWER, stemEndsWith: '[dtmn]'};
// present
suffix('present-ich', 'e', 'en', FINITE_IN, VERB_OUT, MIN2);
suffix('present-ich', 'le', 'eln', FINITE_IN, VERB_OUT, MIN2);
suffix('present-ich', 'ele', 'eln', FINITE_IN, VERB_OUT, MIN2);
suffix('present-ich', 're', 'ern', FINITE_IN, VERB_OUT, MIN2);
suffix('present-ich', 'ere', 'ern', FINITE_IN, VERB_OUT, MIN2);
suffix('present-du', 'st', 'en', FINITE_IN, VERB_OUT, MIN2);
suffix('present-du', 'est', 'en', FINITE_IN, VERB_OUT, DTMN);
suffix('present-du', 'elst', 'eln', FINITE_IN, VERB_OUT, MIN2);
suffix('present-du', 'erst', 'ern', FINITE_IN, VERB_OUT, MIN2);
suffix('present-er', 't', 'en', FINITE_IN, VERB_OUT, MIN2);
suffix('present-er', 'et', 'en', FINITE_IN, VERB_OUT, DTMN);
suffix('present-er', 'elt', 'eln', FINITE_IN, VERB_OUT, MIN2);
suffix('present-er', 'ert', 'ern', FINITE_IN, VERB_OUT, MIN2);
// imperative without -e: not after d or t (warte!, arbeite! keep the -e,
// which present-ich reads), and only after a consonant or u (freu dich!).
suffix('imperative', '', 'en', FINITE_IN, VERB_OUT, {stemMinLength: 2, stemStartsWith: LOWER, stemEndsWith: '[bcfghjklmnpqrsvwxzßu]'});
suffix('imperative', 'el', 'eln', FINITE_IN, VERB_OUT, MIN2);  // wandel!, sammel!
suffix('imperative', 'er', 'ern', FINITE_IN, VERB_OUT, MIN2);  // steiger!, bedauer!
// past participle: the last ge- of the stem is removed (gemacht, eingekauft,
// kennengelernt); ge- and the verb need two letters after it.
const GE = {from: ['ge'], to: '', occurrence: 'last', between: '{letter}', betweenMinLength: 2};
suffix('past-participle', 't', 'en', ['adj'], VERB_OUT, {stemStartsWith: LOWER, stemChange: GE});
suffix('past-participle', 'et', 'en', ['adj'], VERB_OUT, {stemStartsWith: LOWER, stemEndsWith: '[dtmn]', stemChange: GE});
suffix('past-participle', 'elt', 'eln', ['adj'], VERB_OUT, {stemStartsWith: LOWER, stemChange: GE});
suffix('past-participle', 'ert', 'ern', ['adj'], VERB_OUT, {stemStartsWith: LOWER, stemChange: GE});
// present participle (declined, it is an adjective first: lächelnde -> lächelnd)
suffix('present-participle', 'end', 'en', ['adj'], VERB_OUT, MIN2);
suffix('present-participle', 'elnd', 'eln', ['adj'], VERB_OUT, MIN2);
suffix('present-participle', 'ernd', 'ern', ['adj'], VERB_OUT, MIN2);
// past
for (const [id, end] of [['past', ''], ['past-du', 'st'], ['past-wir', 'n'], ['past-ihr', 't']]) {
    suffix(id, `te${end}`, 'en', FINITE_IN, VERB_OUT, MIN2);
    suffix(id, `ete${end}`, 'en', FINITE_IN, VERB_OUT, DTMN);
    suffix(id, `elte${end}`, 'eln', FINITE_IN, VERB_OUT, MIN2);
    suffix(id, `erte${end}`, 'ern', FINITE_IN, VERB_OUT, MIN2);
}
// subjunctive I of du and ihr
suffix('subjunctive-1', 'est', 'en', FINITE_IN, VERB_OUT, MIN2);
suffix('subjunctive-1', 'et', 'en', FINITE_IN, VERB_OUT, MIN2);
for (const [inflected, deinflected] of [['elest', 'eln'], ['lest', 'eln'], ['elet', 'eln'], ['let', 'eln'],
    ['erest', 'ern'], ['rest', 'ern'], ['eret', 'ern'], ['ret', 'ern']]) {
    suffix('subjunctive-1', inflected, deinflected, FINITE_IN, VERB_OUT, MIN2);  // du wandlest, ihr verlängret
}
// Verbs in -ien (knien): the e of the stem is the e of the ending.
for (const [id, inflected] of [['present-du', 'iest'], ['present-er', 'iet'], ['past', 'iete'], ['past-du', 'ietest'],
    ['past-wir', 'ieten'], ['past-ihr', 'ietet']]) {
    suffix(id, inflected, 'ien', FINITE_IN, VERB_OUT, {stemMinLength: 1, stemStartsWith: LOWER});
}
suffix('past-participle', 'iet', 'ien', ['adj'], VERB_OUT, {stemStartsWith: LOWER, stemChange: GE});

// Strong verbs.
const SIBILANT_OR_DENTAL = /[dtsßzx]$|sch$/u;
const VOWEL_END = /[aeiouäöüh]$/u;
// Verbs whose ge- is part of the verb itself, not the participle's prefix.
const GE_VERBS = new Set(['gebären', 'gedeihen', 'gelingen', 'genesen', 'genießen', 'geschehen', 'gewinnen']);
const strong = parse(STRONG, 6);
const inseparable = [];  // [participle without ge-, infinitive]
for (const [[inf], present, imperatives, preterites, subjunctives, participles] of strong) {
    if (present.length > 0) {
        const [du, er] = present[0].split(' ');
        if (du === er) {
            form('present-du-er', du, inf, FINITE_IN, VERB_OUT);
        } else {
            form('present-du', du, inf, FINITE_IN, VERB_OUT);
            form('present-er', er, inf, FINITE_IN, VERB_OUT);
        }
    }
    for (const imperative of imperatives) { form('imperative', imperative, inf, FINITE_IN, VERB_OUT); }
    for (const pt of preterites) {
        form('past', pt, inf, FINITE_IN, VERB_OUT);
        form('past-du', `${pt}st`, inf, FINITE_IN, VERB_OUT);
        if (VOWEL_END.test(pt) && !pt.endsWith('h')) {
            form('past-wir', `${pt}n`, inf, FINITE_IN, VERB_OUT);  // schrien, spien
        }
        form('past-wir', `${pt}en`, inf, FINITE_IN, VERB_OUT);
        form('past-ihr', `${pt}t`, inf, FINITE_IN, VERB_OUT);
        if (SIBILANT_OR_DENTAL.test(pt)) {
            form('past-du', `${pt}est`, inf, FINITE_IN, VERB_OUT);  // fandest, aßest
            form('past-ihr', `${pt}et`, inf, FINITE_IN, VERB_OUT);  // fandet
        }
    }
    for (const k2 of subjunctives) {
        const base = k2.slice(0, -1);  // gäbe -> gäb
        form('subjunctive-2', k2, inf, FINITE_IN, VERB_OUT);
        form('subjunctive-2-du', `${k2}st`, inf, FINITE_IN, VERB_OUT);
        form('subjunctive-2-du', `${base}st`, inf, FINITE_IN, VERB_OUT);
        form('subjunctive-2-wir', `${k2}n`, inf, FINITE_IN, VERB_OUT);
        form('subjunctive-2-ihr', `${k2}t`, inf, FINITE_IN, VERB_OUT);
        form('subjunctive-2-ihr', `${base}t`, inf, FINITE_IN, VERB_OUT);
    }
    for (const pp of participles) {
        form('past-participle', pp, inf, ['adj'], VERB_OUT);
        // After an inseparable prefix the participle has no ge-.
        if (pp.startsWith('ge') && !GE_VERBS.has(inf)) {
            const stem = pp.slice(2);
            if (stem !== inf) {
                inseparable.push([stem, inf]);
            }
        }
    }
}

// Mixed and modal verbs: weak endings on a changed stem.
for (const [[inf], present, preterites, subjunctives, participles] of parse(MIXED, 5)) {
    if (present.length > 0) {
        const [ich, du] = present[0].split(' ');
        form('present-modal', ich, inf, FINITE_IN, VERB_OUT);
        form('present-du', du, inf, FINITE_IN, VERB_OUT);
    }
    for (const [ids, forms] of [[['past', 'past-du', 'past-wir', 'past-ihr'], preterites],
        [['subjunctive-2', 'subjunctive-2-du', 'subjunctive-2-wir', 'subjunctive-2-ihr'], subjunctives]]) {
        for (const stem of forms) {
            form(ids[0], stem, inf, FINITE_IN, VERB_OUT);
            form(ids[1], `${stem}st`, inf, FINITE_IN, VERB_OUT);
            form(ids[2], `${stem}n`, inf, FINITE_IN, VERB_OUT);
            form(ids[3], `${stem}t`, inf, FINITE_IN, VERB_OUT);
        }
    }
    for (const pp of participles) {
        form('past-participle', pp, inf, ['adj'], VERB_OUT);
        if (pp.startsWith('ge') && pp !== 'geworden') {
            const stem = pp.slice(2);
            inseparable.push([stem, inf]);
        }
    }
}

// After an inseparable prefix a participle has no ge- (verstanden,
// bekommen, unterschrieben, missverstanden): one cross-product rule over the
// prefixes and the participles whose stem differs from the infinitive.
add('past-participle', {
    type: 'circumfix', prefixes: INSEPARABLE.map((p) => [p, p]), suffixes: inseparable,
    conditionsIn: ['adj'], conditionsOut: VERB_OUT,
});

// haben, werden and tun, whose present forms are irregular.
for (const [id, word, inf] of [
    ['present-du', 'hast', 'haben'], ['present-er', 'hat', 'haben'],
    ['present-du', 'wirst', 'werden'], ['present-er', 'wird', 'werden'],
    ['past', 'ward', 'werden'], ['past-du', 'wardst', 'werden'],
    ['present-ich', 'tue', 'tun'], ['present-du', 'tust', 'tun'], ['present-er', 'tut', 'tun'],
    ['imperative', 'tu', 'tun'], ['subjunctive-1', 'tuest', 'tun'], ['subjunctive-1', 'tuet', 'tun'],
    ['past', 'tat', 'tun'], ['past-du', 'tatst', 'tun'], ['past-du', 'tatest', 'tun'], ['past-wir', 'taten', 'tun'], ['past-ihr', 'tatet', 'tun'],
    ['subjunctive-2', 'täte', 'tun'], ['subjunctive-2-du', 'tätest', 'tun'], ['subjunctive-2-wir', 'täten', 'tun'], ['subjunctive-2-ihr', 'tätet', 'tun'],
    ['past-participle', 'getan', 'tun'], ['present-participle', 'tuend', 'tun'],
]) {
    form(id, word, inf, id.endsWith('participle') ? ['adj'] : FINITE_IN, VERB_OUT);
}
// sein: whole words (no verb ends in its forms: ist, bin, war).
for (const [id, word] of [
    ['present-ich', 'bin'], ['present-du', 'bist'], ['present-er', 'ist'], ['present-wir', 'sind'], ['present-er', 'seid'],
    ['imperative', 'sei'],
    ['past', 'war'], ['past-du', 'warst'], ['past-wir', 'waren'], ['past-ihr', 'wart'],
    ['subjunctive-1', 'sei'], ['subjunctive-1', 'seist'], ['subjunctive-1', 'seiest'], ['subjunctive-1', 'seien'], ['subjunctive-1', 'seiet'],
    ['subjunctive-2', 'wäre'], ['subjunctive-2-du', 'wärst'], ['subjunctive-2-du', 'wärest'], ['subjunctive-2-wir', 'wären'],
    ['subjunctive-2-ihr', 'wärt'], ['subjunctive-2-ihr', 'wäret'],
    ['past-participle', 'gewesen'], ['present-participle', 'seiend'],
]) {
    wholeWord(id, word, 'sein', id.endsWith('participle') ? ['adj'] : FINITE_IN, VERB_OUT);
}

// zu-infinitive of a separable verb: anzurufen -> anrufen.
add('zu-infinitive', {
    type: 'circumfix', prefixes: PARTICLES.map((p) => [`${p}zu`, p]), suffixes: [['n', 'n']],
    conditionsIn: [], conditionsOut: VERB_OUT, stemMinLength: 2, stemCharacters: STEM,
});

// A separable prefix at the end of a clause. The text starts with the verb
// (in small letters; decapitalize gives Kommst its kommst), then any words
// without punctuation, then the particle, then a punctuation mark or und/oder
// that ends the clause. Without the punctuation mark the particle would also
// be read where it is a preposition (wartet lange auf den Bus -> aufwarten).
// The result is the verb with its particle in front, which the rules for
// finite forms (sep) read, or which is already a verb (fangen ... an).
const particleAlternation = [...PARTICLES].sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).join('|');
const MIDDLE = '(?: [^ .!?,;:…]+)*';
for (const [anchor, source] of [['.', '\\.'], ['!', '!'], ['?', '\\?'], [',', ','], [';', ';'], [':', ':'], ['…', '…'],
    [' und', ' und'], [' oder', ' oder']]) {
    add('separated-prefix', {
        type: 'pattern', pattern: `^([a-zäöüß]+)${MIDDLE} (${particleAlternation})${source}$`, replacement: '$2$1',
        anchorSuffix: anchor, conditionsIn: [], conditionsOut: ['sep', 'v'],
    });
}

// --- Nouns ---------------------------------------------------------------------------
transform('plural', 'plural',
    'Plural of a noun (Tage, Bäume, Kinder, Häuser, Mütter, Äpfel, Blumen, Frauen, Lehrerinnen, Autos, Ergebnisse, Museen, Themen).');
transform('genitive', 'genitive',
    'Genitive singular (des Vaters, des Tages, des Hauses, des Namens, Peters, Deutschlands).');
transform('plural-s', 'plural',
    'Plural in -s of a noun that ends in a consonant (Hotels, Jobs, Teams).');
transform('dative-plural', 'dative plural',
    'Dative plural, the plural with -n added (den Tagen, den Kindern, den Äpfeln).');

const UMLAUTS = [['äu', 'au'], ['ä', 'a'], ['ö', 'o'], ['ü', 'u'], ['Äu', 'Au'], ['Ä', 'A'], ['Ö', 'O'], ['Ü', 'U']];
const umlaut = (from, to) => ({from: [from], to, occurrence: 'last', between: '{consonant}', betweenMinLength: 1});
const PLURAL_IN = ['np'];
const NOUN_OUT = ['ns'];
const NOUN = {stemMinLength: 2, stemStartsWith: UPPER};
suffix('plural', 'e', '', PLURAL_IN, NOUN_OUT, NOUN);
suffix('plural', 'er', '', PLURAL_IN, NOUN_OUT, NOUN);
for (const [from, to] of UMLAUTS) {
    const extra = {stemMinLength: 1, stemStartsWith: UPPER, stemChange: umlaut(from, to)};
    suffix('plural', 'e', '', PLURAL_IN, NOUN_OUT, extra);
    suffix('plural', 'er', '', PLURAL_IN, NOUN_OUT, extra);
    for (const end of ['er', 'el', 'en']) {  // Mütter, Äpfel, Gärten
        suffix('plural', end, end, PLURAL_IN, NOUN_OUT, extra);
    }
}
suffix('plural', 'n', '', PLURAL_IN, NOUN_OUT, {...NOUN, stemEndsWith: '[elr]'});
suffix('plural', 'en', '', PLURAL_IN, NOUN_OUT, NOUN);
suffix('plural', 'innen', 'in', PLURAL_IN, NOUN_OUT, NOUN);
suffix('plural', 's', '', PLURAL_IN, NOUN_OUT, {...NOUN, stemEndsWith: '[aeiouyäöü]'});
suffix('plural', 'nisse', 'nis', PLURAL_IN, NOUN_OUT, NOUN);
suffix('plural', 'usse', 'us', PLURAL_IN, NOUN_OUT, NOUN);
suffix('plural', 'asse', 'as', PLURAL_IN, NOUN_OUT, NOUN);  // Atlasse
suffix('plural', 'isse', 'is', PLURAL_IN, NOUN_OUT, NOUN);  // Kürbisse, Iltisse
suffix('plural', 'osse', 'os', PLURAL_IN, NOUN_OUT, NOUN);  // Rhinozerosse
form('plural', 'Bauten', 'Bau', PLURAL_IN, NOUN_OUT);
form('plural', 'bauten', 'bau', PLURAL_IN, NOUN_OUT);  // Neubauten
// Latin, Greek and Italian plurals.
for (const [inflected, deinflected] of [
    ['en', 'um'], ['een', 'eum'], ['ien', 'ium'], ['ien', 'ion'], ['en', 'a'], ['en', 'us'], ['en', 'os'], ['een', 'us'],
    ['en', 'o'], ['en', 'is'], ['a', 'um'], ['a', 'on'], ['ata', 'a'], ['ien', ''], ['i', 'o'], ['izes', 'ix'], ['izes', 'ex'],
]) {
    suffix('plural', inflected, deinflected, PLURAL_IN, NOUN_OUT, {stemMinLength: 3, stemStartsWith: UPPER});
}
// Genitive: nouns and names are capitalized; a name has no part of speech in
// wiktionary-to-yomitan, so the genitive keeps every part of speech.
const CAPITAL = {stemMinLength: 2, stemStartsWith: UPPER};
suffix('genitive', 's', '', [], [], CAPITAL);
suffix('genitive', 'es', '', [], [], CAPITAL);
suffix('genitive', 'ens', 'e', [], [], CAPITAL);
suffix('genitive', 'ens', '', [], [], CAPITAL);
suffix('genitive', "'", '', [], [], {...CAPITAL, stemEndsWith: '[sßxz]'});
suffix('plural-s', 's', '', PLURAL_IN, NOUN_OUT, {...NOUN, stemEndsWith: '{consonant}'});
suffix('dative-plural', 'n', '', [], ['np'], {...NOUN, stemEndsWith: '[elr]'});

// --- Adjectives ----------------------------------------------------------------------
transform('declined', 'declined',
    'Adjective with a case ending (schöne, schönen, schöner, schönes, schönem; leise, dunkle, teure, hohe).');
transform('comparative', 'comparative',
    'Comparative of an adjective (schöner, älter, größer, dunkler, teurer, besser, mehr).');
transform('superlative', 'superlative',
    'Superlative of an adjective, which takes an ending (der schönste, am schönsten, älteste, größte, beste, meiste).');
const ADJ_OUT = ['adj'];
for (const end of ['e', 'en', 'er', 'es', 'em']) {
    suffix('declined', end, '', [], ADJ_OUT, MIN2);
    suffix('declined', `l${end}`, 'el', [], ADJ_OUT, MIN2);  // dunkle -> dunkel
    suffix('declined', `r${end}`, 'er', [], ADJ_OUT, {...MIN2, stemEndsWith: '[u]'});  // teure -> teuer
    form('declined', `hoh${end}`, 'hoch', [], ADJ_OUT);
    if (end !== 'e') {
        suffix('declined', end.slice(1), '', [], ADJ_OUT, {...MIN2, stemMinLength: 3, stemEndsWith: '[e]'});  // leisen -> leise
    }
}
suffix('comparative', 'er', '', ADJ_OUT, ADJ_OUT, MIN2);
suffix('comparative', 'ler', 'el', ADJ_OUT, ADJ_OUT, MIN2);
suffix('comparative', 'rer', 'er', ADJ_OUT, ADJ_OUT, {...MIN2, stemEndsWith: '[u]'});
suffix('superlative', 'st', '', ADJ_OUT, ADJ_OUT, MIN2);
suffix('superlative', 'est', '', ADJ_OUT, ADJ_OUT, {...MIN2, stemEndsWith: '[dtsßxzaeiouäöü]'});
// Adjectives with umlaut in the comparative and superlative.
const UMLAUT_ADJ = ['alt', 'arg', 'arm', 'bang', 'blass', 'dumm', 'fromm', 'gesund', 'glatt', 'grob', 'hart', 'jung', 'kalt',
    'karg', 'klug', 'krank', 'krumm', 'kurz', 'lang', 'nass', 'rot', 'scharf', 'schmal', 'schwach', 'schwarz', 'stark', 'warm'];
const withUmlaut = (word) => word.replace(/^(.*)([aou])([^aou]*)$/u, (_, a, v, b) => a + {a: 'ä', o: 'ö', u: 'ü'}[v] + b);
for (const base of UMLAUT_ADJ) {
    const u = withUmlaut(base);
    form('comparative', `${u}er`, base, ADJ_OUT, ADJ_OUT);
    form('superlative', `${u}st`, base, ADJ_OUT, ADJ_OUT);
    form('superlative', `${u}est`, base, ADJ_OUT, ADJ_OUT);
}
for (const [id, word, base] of [
    ['comparative', 'größer', 'groß'], ['superlative', 'größt', 'groß'],
    ['comparative', 'höher', 'hoch'], ['superlative', 'höchst', 'hoch'],
    ['comparative', 'näher', 'nah'], ['superlative', 'nächst', 'nah'],
    ['comparative', 'besser', 'gut'], ['superlative', 'best', 'gut'],
    ['comparative', 'mehr', 'viel'], ['superlative', 'meist', 'viel'],
]) {
    form(id, word, base, ADJ_OUT, ADJ_OUT);
}

// --- Contractions -------------------------------------------------------------------
transform('contraction', 'contraction',
    'A preposition contracted with the article (am = an dem, im = in dem, zum = zu dem, zur = zu der, ins = in das).');
transform('clitic-es', "-'s (es)",
    "A verb with es or das reduced to 's (gibt's = gibt es, macht's = macht es).");
for (const [form, preposition] of [
    ['am', 'an'], ['ans', 'an'], ['aufs', 'auf'], ['beim', 'bei'], ['durchs', 'durch'], ['fürs', 'für'], ['hinterm', 'hinter'],
    ['hinters', 'hinter'], ['im', 'in'], ['ins', 'in'], ['übers', 'über'], ['überm', 'über'], ['ums', 'um'], ['unterm', 'unter'],
    ['unters', 'unter'], ['vom', 'von'], ['vorm', 'vor'], ['vors', 'vor'], ['zum', 'zu'], ['zur', 'zu'],
]) {
    wholeWord('contraction', form, preposition, [], []);
}
suffix('clitic-es', "'s", '', [], [], MIN2);

writeListed();
const file = join(here, 'own.json');
const out = {schema: 1, conditions, transforms};
writeFileSync(file, formatTransforms(out));
const count = transforms.reduce((n, t) => n + t.rules.length, 0);
const expanded = transforms.reduce((n, t) => n + t.rules.reduce((m, r) => m + (r.prefixes ? r.prefixes.length * r.suffixes.length : 1), 0), 0);
console.log(`de: ${transforms.length} transforms, ${count} rules (${expanded} with cross products expanded) in ${file}`);
