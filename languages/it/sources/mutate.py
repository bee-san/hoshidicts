#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Mutation checks for docs/languages.md 14 step 7. Not run by any test.

    python3 languages/it/sources/mutate.py <scratch dir> [name ...]

For each mutation below, copies languages/it/ into <scratch dir>/languages/it,
applies one textual change to sources/build-own.mjs or language.json,
regenerates own.json and transforms.json, writes tests/classes.json again
(so a stale file cannot be what fails) and runs language-conformance-test on
the copy. A mutation that every test still passes is a constraint, exclusion
or processor detail without a test. Prints one line per mutation: killed or
SURVIVED, with the first failing row.
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
OWN = "sources/build-own.mjs"
LANG = "language.json"

# name, file, text to find, replacement (or a tuple of texts and a tuple of
# replacements, applied in order)
MUTATIONS = [
    ("min-stem-1", OWN, "const MIN_STEM = 2;", "const MIN_STEM = 1;"),
    ("plain-are-cg", OWN, "const PLAIN_ARE = {stemNotEndsWith: '[cg]'};", "const PLAIN_ARE = {};"),
    ("etti-dmtv", OWN, "const ETTI = {stemEndsWith: '[dmtv]'};", "const ETTI = {};"),
    ("exclude-dov", OWN, "stems: ['dov', 'sed']", "stems: ['sed']"),
    ("exclude-sed", OWN, "stems: ['dov', 'sed']", "stems: ['dov']"),
    ("exclude-sal", OWN, "stems: ['sal', 'ven', 'mor']", "stems: ['ven', 'mor']"),
    ("exclude-ven", OWN, "stems: ['sal', 'ven', 'mor']", "stems: ['sal', 'mor']"),
    ("exclude-mor", OWN, "stems: ['sal', 'ven', 'mor']", "stems: ['sal', 'ven']"),
    ("capitals", LANG, '"lower": "[a-z\\\\u00DF-\\\\u00F6\\\\u00F8-\\\\u00FF]"', '"lower": "[A-Za-z\\\\u00C0-\\\\u00D6\\\\u00D8-\\\\u00F6\\\\u00F8-\\\\u00FF]"'),
    ("nominal-one-word", OWN, "const ONE_WORD = {stemCharacters: '{lower}'};", "const ONE_WORD = {};"),
    ("verb-one-word", OWN, "suffix(slot, inflected, deinflected, inFor(slot), outFor(slot), {...extra, ...split, stemCharacters: '{lower}'});",
     "suffix(slot, inflected, deinflected, inFor(slot), outFor(slot), {...extra, ...split});"),
    ("verb-marked-agreement", OWN, "['refl'], short ? persons.map((p) => SHORT[p]) : persons, marked",
     "['refl'], ['p1s', 'p2s', 'p3', 'p1p', 'p2p'], marked"),
    ("clitic-host-end", OWN, "const CLITIC_HOST = {stemCharacters: '{lower}', stemEndsWith: '[aeior]', stemMinLength: 2};",
     "const CLITIC_HOST = {stemCharacters: '{lower}', stemMinLength: 2};"),
    ("clitic-host-min", OWN, "const CLITIC_HOST = {stemCharacters: '{lower}', stemEndsWith: '[aeior]', stemMinLength: 2};",
     "const CLITIC_HOST = {stemCharacters: '{lower}', stemEndsWith: '[aeior]'};"),
    ("clitic-host-word", OWN, "const CLITIC_HOST = {stemCharacters: '{lower}', stemEndsWith: '[aeior]', stemMinLength: 2};",
     "const CLITIC_HOST = {stemEndsWith: '[aeior]', stemMinLength: 2};"),
    ("pronominal-min-3", OWN, "const VERB_STEM = {stemMinLength: 3};", "const VERB_STEM = {stemMinLength: 2};"),
    ("marked-word", OWN, "const marked = {...extra, stemContains: '[+]', stemCharacters: '[{lower}+]'};", "const marked = {...extra, stemContains: '[+]'};"),
    ("negative-imperative-word", OWN, "conditionsIn: ['refl'], conditionsOut: ['v'], ...VERB_STEM, stemCharacters: '{lower}'});", "conditionsIn: ['refl'], conditionsOut: ['v'], ...VERB_STEM});"),
    ("negative-imperative-min-3", OWN, "conditionsIn: ['refl'], conditionsOut: ['v'], ...VERB_STEM, stemCharacters: '{lower}'});", "conditionsIn: ['refl'], conditionsOut: ['v'], stemCharacters: '{lower}'});"),
    ("pronominal-orre-p", OWN, "[['orre', 'or'], [{stemCharacters: '[p]', stemMinLength: 1}, {stemMinLength: 3}]],", "[['orre', 'or'], [{stemMinLength: 1}]],"),
    ("pronominal-urre-3", OWN, "[['urre', 'ur'], [{stemMinLength: 3}]],", "[['urre', 'ur'], [{stemMinLength: 1}]],"),
    ("pronominal-trarre-list", OWN, "suffixes: TRARRE_VERBS.map((v) => [v, v.replace(/rre$/u, 'r') + tail]),\n        conditionsIn, conditionsOut: ['v'], stemCharacters: '[]'});",
     "suffixes: [['arre', 'ar' + tail]],\n        conditionsIn, conditionsOut: ['v'], stemMinLength: 1});"),
    ("pronominal-exclude-rid", OWN, "const PRONOMINAL_EXCLUDED = {are: ['rid'], ere: ['vol']};", "const PRONOMINAL_EXCLUDED = {ere: ['vol']};"),
    ("pronominal-exclude-vol", OWN, "const PRONOMINAL_EXCLUDED = {are: ['rid'], ere: ['vol']};", "const PRONOMINAL_EXCLUDED = {are: ['rid']};"),
    ("pronominal-short-conditions", OWN, "conditionsIn: persons.map((p) => SHORT[p]), conditionsOut: ['v']});",
     "conditionsIn: persons, conditionsOut: ['v']});"),
    ("subjunctive-mi", OWN, "Present subjunctive, singular (che io, tu, lui, lei; also the Lei imperative): parli, tema, dorma, finisca.', ['p3'],",
     "Present subjunctive, singular (che io, tu, lui, lei; also the Lei imperative): parli, tema, dorma, finisca.', ['p1s', 'p3'],"),
    ("subjunctive-ti", OWN, "Present subjunctive, singular (che io, tu, lui, lei; also the Lei imperative): parli, tema, dorma, finisca.', ['p3'],",
     "Present subjunctive, singular (che io, tu, lui, lei; also the Lei imperative): parli, tema, dorma, finisca.', ['p2s', 'p3'],"),
    ("subjunctive-te-pairs", OWN, "const PAIR_PERSONS = {'subjunctive-sg': [['p2s', 'te+']]};", "const PAIR_PERSONS = {};"),
    ("esserci-ci-siamo", OWN, "'ci fosse', 'ci fossero', 'ci sei', 'ci siete']],", "'ci fosse', 'ci fossero', 'ci siamo', 'ci sei', 'ci siete']],"),
    ("cela-after-persons", OWN,
     ("pronominal(['ce+la+'], 'cela', ANY_PERSON);\nshortPronominal(['ce+la+'], 'cela', ANY_PERSON);\n",
      "for (const [prefix, tail] of [['ci+', 'ci'], ['ce+ne+', 'cene']]) {"),
     ("", "for (const [prefix, tail] of [['ci+', 'ci'], ['ce+ne+', 'cene'], ['ce+la+', 'cela']]) {")),
    ("ci-any-person-rsi", OWN, "pronominal(['ce+la+'], 'cela', ANY_PERSON);\n", "pronominal(['ce+la+'], 'cela', ANY_PERSON);\npronominal(['ci+'], 'si', ANY_PERSON);\n"),
    ("dire-past-anywhere", OWN, "{lemma: 'dire', mode: ['bene', 'male', 'pre', 'contrad', 'ri', 'dis', 'inter', 'in'], forms: {", "{lemma: 'dire', mode: 'compound', forms: {"),
    ("stare-stessi", OWN, "...subjImpf(null, null, 'stessimo', 'steste', 'stessero'),", "...subjImpf('stessi', 'stesse', 'stessimo', 'steste', 'stessero'),"),
    ("nominal-after-verbs", OWN,
     "for (const [id, name, description] of NOMINAL_FIRST) { transform(id, name, description); }\nfor (const [id, name, description] of SLOTS) { transform(id, name, description); }",
     "for (const [id, name, description] of SLOTS) { transform(id, name, description); }\nfor (const [id, name, description] of NOMINAL_FIRST) { transform(id, name, description); }"),
    ("plural-i-o-first", OWN, " ['i', 'e', NOMINAL], ['i', 'o', NOMINAL], ['e', 'a', NOMINAL], ['i', 'a', NOMINAL],",
     " ['i', 'o', NOMINAL], ['i', 'e', NOMINAL], ['e', 'a', NOMINAL], ['i', 'a', NOMINAL],"),
    ("preferred-readings", OWN, "    for (const [word, lemma] of pairs) { whole(id, word, lemma, [], out); }", ""),
    ("preferred-plural", OWN, "    ['plural', NOMINAL, [\n        ['soli', 'solo'],", "    ['plural', NOMINAL, [], [\n        ['soli', 'solo'],"),
    ("preferred-feminine-plural", OWN, "    ['feminine-plural', ['adj'], [\n", "    ['feminine-plural', ['adj'], [], [\n"),
    ("preferred-present-io", OWN, "['present-io', ['v'], [['domando', 'domandare']]],", "['present-io', ['v'], []],"),
    ("preferred-present-tu", OWN, "    ['present-tu', ['v'], [\n", "    ['present-tu', ['v'], [], [\n"),
    ("preferred-present-lui", OWN, "    ['present-lui', ['v'], [\n", "    ['present-lui', ['v'], [], [\n"),
    ("preferred-subjunctive", OWN, "['subjunctive-sg', ['v'], [['accada', 'accadere'], ['riposi', 'riposare']]],", "['subjunctive-sg', ['v'], []],"),
    ("preferred-preterite-io", OWN, "['preterite-io', ['v'], [['comperai', 'comprare']]],", "['preterite-io', ['v'], []],"),
    ("preferred-preterite-lui", OWN, "['preterite-lui', ['v'], [['comperò', 'comprare']]],", "['preterite-lui', ['v'], []],"),
    ("plural-ati", OWN, "    ['ati', 'ato', NOMINAL], ['ai', 'aio', NOMINAL],", "    ['ai', 'aio', NOMINAL],"),
    ("plural-ai", OWN, "    ['ati', 'ato', NOMINAL], ['ai', 'aio', NOMINAL], ['i', 'e', NOMINAL],", "    ['ati', 'ato', NOMINAL], ['i', 'e', NOMINAL],"),
    ("preferred-present-loro", OWN, "['present-loro', ['v'], [['indicano', 'indicare']]],", "['present-loro', ['v'], []],"),
    ("preferred-imperative-tu", OWN, "    ['imperative-tu', ['v'], [\n", "    ['imperative-tu', ['v'], [], [\n"),
    ("irregular-orecchie", OWN, "    ['orecchie', 'orecchio'],\n", ""),
    ("plural-io-first", OWN, (" ['i', 'e', NOMINAL], ['i', 'o', NOMINAL],", "    ['ce', 'cia', NOMINAL], ['ge', 'gia', NOMINAL], ['i', 'io', NOMINAL],\n"),
     (" ['i', 'io', NOMINAL], ['i', 'e', NOMINAL], ['i', 'o', NOMINAL],", "    ['ce', 'cia', NOMINAL], ['ge', 'gia', NOMINAL],\n")),
    ("plural-min-2", OWN, "    suffix('plural', inflected, deinflected, [], out, {stemMinLength: 2, ...ONE_WORD});",
     "    suffix('plural', inflected, deinflected, [], out, {stemMinLength: 1, ...ONE_WORD});"),
    ("feminine-min-2", OWN, "suffix('feminine', 'a', 'o', [], ['adj'], {stemMinLength: 2, ...ONE_WORD});", "suffix('feminine', 'a', 'o', [], ['adj'], {stemMinLength: 1, ...ONE_WORD});"),
    ("feminine-adjective-only", OWN, "suffix('feminine', 'a', 'o', [], ['adj'], {stemMinLength: 2, ...ONE_WORD});", "suffix('feminine', 'a', 'o', [], ['adj', 'n'], {stemMinLength: 2, ...ONE_WORD});"),
    ("fare-split-participle", OWN, "        for (const split of SPLITS[lemma] ?? [{}]) { marked(form, lemma, {...(minStem > 0 ? {stemMinLength: minStem} : {}), ...split}); }",
     "        marked(form, lemma, minStem > 0 ? {stemMinLength: minStem} : {});"),
    ("infinitive-orre-p", OWN, "['or', 'orre', {stemEndsWith: '[p]'}]", "['or', 'orre', {}]"),
    ("infinitive-urre-d", OWN, "['ur', 'urre', {stemEndsWith: '[d]'}]", "['ur', 'urre', {}]"),
    ("infinitive-arre-r", OWN, "['ar', 'arre', {stemEndsWith: '[r]'}]", "['ar', 'arre', {}]"),
    ("infinitive-min-2", OWN, "['ar', 'are', {stemMinLength: 2}], ['er', 'ere', {stemMinLength: 2}], ['ir', 'ire', {stemMinLength: 2}],",
     "['ar', 'are', {}], ['er', 'ere', {}], ['ir', 'ire', {}],"),
    ("participle-pronominal-comper", OWN, "{stemStartsWith: '[c]', stemNotStartsWithText: 'comper'}", "{stemStartsWith: '[c]'}"),
    ("participle-pronominal-min-2", OWN, "for (const split of splits) { marked(`${vowel}t${tail}`, cls, {stemMinLength: 2, ...split}); }",
     "for (const split of splits) { marked(`${vowel}t${tail}`, cls, {...split}); }"),
    ("participle-pronominal-word", OWN, "conditionsIn: [], conditionsOut: ['ptcp'], stemCharacters: '{lower}', ...extra});", "conditionsIn: [], conditionsOut: ['ptcp'], ...extra});"),
    ("participle-pronominal-unmarked", OWN, "const PTCP_MARK = '%';", "const PTCP_MARK = '';"),
    ("climbing-modal-word", OWN, "conditionsIn: ['refl'], conditionsOut: ['v'],\n            stemCharacters: '{lower}'});", "conditionsIn: ['refl'], conditionsOut: ['v']});"),
    ("climbing-modal-lone-si", OWN, "        if (mark === 'si+') { continue; }\n", ""),
    ("climbing-agreement", OWN, "prefixes: STARE_FORMS[person].map(", "prefixes: Object.values(STARE_FORMS).flat().map("),
    ("no-starsi", OWN, "const stems = tail === 'si' ? SHORT_STEMS.filter(([v]) => v !== 'stare') : SHORT_STEMS;", "const stems = SHORT_STEMS;"),
    ("porre-min-2", OWN, "{lemma: 'porre', mode: 'compound', minStem: 2, forms: {", "{lemma: 'porre', mode: 'compound', forms: {"),
    ("porre-whole", OWN, "IRREGULAR.push({...IRREGULAR.find((entry) => entry.lemma === 'porre'), mode: 'whole', minStem: 0});", ""),
    ("fare-split", OWN, "const SPLITS = {fare: [{stemNotEndsWith: '[f]'}]};", "const SPLITS = {};"),
    ("fare-f-compounds", OWN, "const F_COMPOUNDS = ['contraf', 'sopraf'];", "const F_COMPOUNDS = [];"),
    ("superlative-dolc", OWN, "const SUPERLATIVE_EXCLUDED = ['dolc', 'trist'];", "const SUPERLATIVE_EXCLUDED = ['trist'];"),
    ("superlative-trist", OWN, "const SUPERLATIVE_EXCLUDED = ['dolc', 'trist'];", "const SUPERLATIVE_EXCLUDED = ['dolc'];"),
    ("dare-as-ending", OWN, "{lemma: 'dare', mode: ['ri'], forms: {", "{lemma: 'dare', mode: 'compound', forms: {"),
    ("stare-as-ending", OWN, "{lemma: 'stare', mode: ['ri', 'sotto', 'sovra', 'sopra'], forms: {", "{lemma: 'stare', mode: 'compound', forms: {"),
    ("monosyllabic-da", OWN, "if (base === 'da' && ['lo', 'la', 'li', 'le', 'gli'].includes(cluster)) { continue; }", ""),
    ("monosyllabic-sta-va", OWN, "if ((base === 'sta' || base === 'va') && ['lo', 'la', 'li', 'le'].includes(cluster)) { continue; }", ""),
    ("feminine-essa-a-min", OWN, "['essa', 'a', 3],", "['essa', 'a', 0],"),
    ("feminine-essa-e-min", OWN, "['essa', 'e', 3],", "['essa', 'e', 0],"),
    ("feminine-ona-min", OWN, "['ona', 'one', 3],", "['ona', 'one', 0],"),
    ("feminine-iera-min", OWN, "['iera', 'iere', 3],", "['iera', 'iere', 0],"),
    ("feminine-ora-min", OWN, "['ora', 'ore', 3]]", "['ora', 'ore', 0]]"),
    ("clitic-marked-imperative", OWN, "suffix(slot, inflected, deinflected, inFor(slot), ['v'], marked);", ""),
    ("proclitic-elided", OWN, "add('proclitic', {type: 'prefix', inflected: ELIDED[pronoun], deinflected: pronoun + '+', conditionsIn: [], conditionsOut: ['refl']});", ""),
    ("short-stem-stare", OWN, "['stare', 'star'], ", ""),
    ("short-stem-amare", OWN, "['amare', 'amar'], ", ""),
    ("short-stem-unire", OWN, "['unire', 'unir'], ", ""),
    ("short-stem-usare", OWN, "['usare', 'usar'], ", ""),
    ("short-stem-beare", OWN, ", ['beare', 'bear']", ""),
    ("plural-s-min", OWN, "suffix('plural', 's', '', [], ['n'], {stemMinLength: 3, ...ONE_WORD});", "suffix('plural', 's', '', [], ['n'], {...ONE_WORD});"),
    ("negative-imperative-ti", OWN, "add('pronominal', {type: 'circumfix', prefixes: [['ti+', '']],", "if (false) add('pronominal', {type: 'circumfix', prefixes: [['ti+', '']],"),
    ("diacritics-as-yomitan", LANG,
     '{"pattern": "^([^A-Z\\\\u00C0-\\\\u00DE\\\\u0300-\\\\u036F ][^\\\\u0300-\\\\u036F ]*)[\\\\u0300-\\\\u036F]([^ ]*)$", "replace": "$1$2", "repeat": true},',
     '{"strip": "[\\\\u0300-\\\\u036F]"},'),
    ("elision-anywhere", LANG, '}, "at": "start"}]]', '}, "at": "all"}]]'),
    ("elision-keep-input", LANG, '"keepInput": false,\n        "variants": [[{"pattern": "^(.* )?', '"variants": [[{"pattern": "^(.* )?'),
    ("elision-last-word-only", LANG, '"pattern": "^(.* )?(l|gl|', '"pattern": "^()(l|gl|'),
    ("elision-capitals", LANG, '"pattern": "^(.* )?(l|gl|dell|', '"pattern": "^(.* )?([Ll]|[Vv]|gl|dell|'),
    ("no-acute-che", LANG, '"variants": [[{"map": {"ch\\u00E8": "ch\\u00E9"}, "at": "end"}]]', '"variants": [[{"map": {"ch\\u00E8": "ch\\u00E8"}, "at": "end"}]]'),
    ("apostrophe-unnormalized", LANG, '"variants": [[{"map": {"\\u2019": "\'", "\\u02BC": "\'"}}]]', '"variants": [[{"map": {"\\u02BC": "\'"}}]]'),
    ("nfkc-to-nfc", LANG, '"variants": [[{"normalize": "NFKC"}]]', '"variants": [[{"normalize": "NFC"}]]'),
    ("capitalize-article-i", LANG, '[[{"case": "upperFirst"}, {"map": {"I": "i"}, "at": "end"}]]', '[[{"case": "upperFirst"}]]'),
    ("form-of-as-term", LANG, '"formOf": "follow"', '"formOf": "asTerm"'),
    ("untagged-filter", LANG, '"untaggedTerms": "pass"', '"untaggedTerms": "filter"'),
]


def run(cmd, cwd=None):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


def main():
    scratch = os.path.abspath(sys.argv[1])
    only = set(sys.argv[2:])
    langs = os.path.join(scratch, "languages")
    tools = os.path.join(scratch, "tools")
    os.makedirs(scratch, exist_ok=True)
    if not os.path.exists(tools):
        os.symlink(os.path.join(REPO, "tools"), tools)
    conformance = os.path.join(REPO, "build", "language-conformance-test")
    for name, file, old, new in MUTATIONS:
        if only and name not in only:
            continue
        pack = os.path.join(langs, "it")
        shutil.rmtree(langs, ignore_errors=True)
        shutil.copytree(os.path.join(REPO, "languages", "it"), pack)
        path = os.path.join(pack, file)
        text = open(path, encoding="utf-8").read()
        olds, news = (old, new) if isinstance(old, tuple) else ((old,), (new,))
        if any(o not in text for o in olds):
            print(f"{name}\tNOT APPLIED (text not found)")
            continue
        for o, n in zip(olds, news):
            text = text.replace(o, n)
        open(path, "w", encoding="utf-8").write(text)
        build = run(["node", os.path.join(pack, "sources", "build-own.mjs")])
        if build.returncode != 0:
            print(f"{name}\tBUILD FAILED {build.stderr.strip().splitlines()[-1] if build.stderr else ''}")
            continue
        shutil.copy(os.path.join(pack, "sources", "own.json"), os.path.join(pack, "transforms.json"))
        classes = run(["node", os.path.join(REPO, "tools", "check-classes.mjs"), "it", "--write", "--languages", langs])
        if classes.returncode != 0:
            print(f"{name}\tkilled by check-classes: {classes.stderr.strip()[:200]}")
            continue
        test = run([conformance, pack])
        fails = [line for line in test.stdout.splitlines() + test.stderr.splitlines() if line.startswith("FAIL")]
        if test.returncode != 0:
            print(f"{name}\tkilled ({len(fails)} failing rows): {fails[0][:160] if fails else test.stdout.strip().splitlines()[-1]}")
        else:
            print(f"{name}\tSURVIVED")


if __name__ == "__main__":
    main()
