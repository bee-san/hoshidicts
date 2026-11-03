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

# name, file, text to find, replacement
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
    ("pronominal-arre-tr", OWN, "[['arre', 'ar'], [{stemCharacters: '[rt]', stemMinLength: 2}, {stemMinLength: 4}]],", "[['arre', 'ar'], [{stemMinLength: 1}]],"),
    ("pronominal-exclude-rid", OWN, "const PRONOMINAL_EXCLUDED = {are: 'rid', ere: 'vol'};", "const PRONOMINAL_EXCLUDED = {ere: 'vol'};"),
    ("pronominal-exclude-vol", OWN, "const PRONOMINAL_EXCLUDED = {are: 'rid', ere: 'vol'};", "const PRONOMINAL_EXCLUDED = {are: 'rid'};"),
    ("pronominal-short-conditions", OWN, "conditionsIn: persons.map((p) => SHORT[p]), conditionsOut: ['v']});",
     "conditionsIn: persons, conditionsOut: ['v']});"),
    ("subjunctive-mi", OWN, "Present subjunctive, singular (che io, tu, lui, lei; also the Lei imperative): parli, tema, dorma, finisca.', ['p2s', 'p3'],",
     "Present subjunctive, singular (che io, tu, lui, lei; also the Lei imperative): parli, tema, dorma, finisca.', ['p1s', 'p2s', 'p3'],"),
    ("infinitive-orre-p", OWN, "['or', 'orre', {stemEndsWith: '[p]'}]", "['or', 'orre', {}]"),
    ("infinitive-urre-d", OWN, "['ur', 'urre', {stemEndsWith: '[d]'}]", "['ur', 'urre', {}]"),
    ("infinitive-arre-r", OWN, "['ar', 'arre', {stemEndsWith: '[r]'}]", "['ar', 'arre', {}]"),
    ("infinitive-min-2", OWN, "['ar', 'are', {stemMinLength: 2}], ['er', 'ere', {stemMinLength: 2}], ['ir', 'ire', {stemMinLength: 2}],",
     "['ar', 'are', {}], ['er', 'ere', {}], ['ir', 'ire', {}],"),
    ("participle-pronominal-comper", OWN, "{stemStartsWith: '[c]', stemNotStartsWithText: 'comper'}", "{stemStartsWith: '[c]'}"),
    ("participle-pronominal-min-2", OWN, "cls.replace(/e$/u, 'si'), [], ['v'], {stemMinLength: 2, stemCharacters: '{lower}', ...split});",
     "cls.replace(/e$/u, 'si'), [], ['v'], {stemCharacters: '{lower}', ...split});"),
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
        if old not in text:
            print(f"{name}\tNOT APPLIED (text not found)")
            continue
        open(path, "w", encoding="utf-8").write(text.replace(old, new))
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
