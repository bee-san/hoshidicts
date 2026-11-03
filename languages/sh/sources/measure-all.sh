#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Runs every measurement of languages/sh/README.md and writes its output to
# $OUT (default /tmp/sh-measure). Run from the repository root after
# building (cmake --build build), with build/lookup-batch built from
# languages/en/sources/lookup-batch.cpp as its header says:
#
#   CACHE=<dir> HACHIDORI=<hachidori checkout> bash languages/sh/sources/measure-all.sh
#
# CACHE holds the inputs, none of them committed (README.md, Sources and
# licences): wty-sh-en.zip and its import dict/wty-sh-en (hoshidicts-cli
# import), hr_50k.txt and sr_50k.txt, {srp,hrv,bos}_sentences.tsv.bz2,
# texts/zlatarevo-zlato.txt and texts/sr-gutenberg.txt, and unimorph-hbs/hbs.
# TAGGED, when set, is a second imported dictionary to measure with: the
# copy of sources/tag-all-rows.py (labelled in README.md).
set -u
CACHE=${CACHE:?set CACHE}
OUT=${OUT:-/tmp/sh-measure}
mkdir -p "$OUT"
P=languages/sh/sources
DICTS=("$CACHE/dict/wty-sh-en")
[ -n "${TAGGED:-}" ] && DICTS+=("$TAGGED")
(cat languages/sh/tests/corpus.tsv; grep -v '^#' languages/sh/tests/gaps.tsv) > "$OUT/sample.tsv"
(echo '# options: default'; cat "$OUT/sample.tsv") > "$OUT/sample-default.tsv"
(echo '# options: default'; cat languages/sh/tests/cases.tsv) > "$OUT/cases-default.tsv"
python3 -c "
import json
t = json.load(open('languages/sh/transforms.json'))
json.dump({'schema': 1, 'conditions': t['conditions'], 'transforms': []}, open('$OUT/no-rules.json', 'w'))
"
i=0
for d in "${DICTS[@]}"; do
  i=$((i + 1))
  {
    echo "== dictionary: $d"
    for set in $P/own.json languages/sh/transforms.json "$OUT/no-rules.json"; do
      for f in "$OUT/sample.tsv" "$OUT/sample-default.tsv" languages/sh/tests/cases.tsv "$OUT/cases-default.tsv"; do
        echo "$(basename "$set") $(basename "$f") $(./build/hoshidicts-cli --languages languages eval-language sh "$f" --transforms "$set" --dictionary "$d")"
      done
    done
    (cat "$OUT/sample.tsv"; grep -v '^#' languages/sh/tests/cases.tsv) > "$OUT/all.tsv"
    ./build/hoshidicts-cli --languages languages eval-language sh "$OUT/all.tsv" --dictionary "$d" --per-rule > "$OUT/per-rule-$i.json"
    python3 -c "
import json
d = json.load(open('$OUT/per-rule-$i.json'))
r = d['perRule']
print('per rule:', len(r), 'rows;', sum(1 for x in r if x['recovers'] > 0), 'recover a row no other reaches;',
      sum(1 for x in r if x['breaks'] > 0), 'break a negative;', sum(1 for x in r if x['falseCandidates'] > 0 and x['recovers'] == 0),
      'only add false candidates (', sum(x['falseCandidates'] for x in r if x['recovers'] == 0), ')')
"
    for f in hr sr; do
      echo "frequent $f: $(python3 $P/measure.py frequent --zip "$CACHE/wty-sh-en.zip" --dictionary "$d" --frequency "$CACHE/${f}_50k.txt" --show 60)"
      echo "nothing $f: $(python3 $P/measure.py nothing --zip "$CACHE/wty-sh-en.zip" --dictionary "$d" --frequency "$CACHE/${f}_50k.txt" --show 20)"
    done
    for t in zlatarevo-zlato sr-gutenberg; do
      echo "text $t: $(python3 $P/measure.py text --zip "$CACHE/wty-sh-en.zip" --dictionary "$d" --text "$CACHE/texts/$t.txt" --out "$OUT/unjudged-$i-$t.tsv" --sample 60 --show 40)"
    done
    echo "clitics: $(python3 $P/measure.py clitics --zip "$CACHE/wty-sh-en.zip" --dictionary "$d" --tatoeba "$CACHE"/srp_sentences.tsv.bz2 "$CACHE"/hrv_sentences.tsv.bz2 "$CACHE"/bos_sentences.tsv.bz2 --show 30)"
    for run in 1 2 3; do
      ./build/benchmark-lookup $P/benchmark-words.txt 6 --term "$d" --language sh --languages languages --json > "$OUT/bench.json" 2>/dev/null
      python3 -c "
import json
d = json.load(open('$OUT/bench.json'))
ms = sorted(x for p in d['passes'][1:] for x in p)
q = lambda f: ms[min(len(ms) - 1, int(f * len(ms)))]
print(f'benchmark run $run: {len(ms)} lookups, p50 {q(0.5) * 1000:.1f} us, p95 {q(0.95) * 1000:.1f} us')
"
    done
  } > "$OUT/measure-$i.txt" 2>&1
done
python3 $P/measure.py traces --zip "$CACHE/wty-sh-en.zip" --dictionary "$CACHE/dict/wty-sh-en" --show 8 > "$OUT/traces.txt" 2>&1
python3 $P/mutate.py > "$OUT/mutations.txt" 2>&1
[ -n "${HACHIDORI:-}" ] && node $P/wasm-measure.mjs "$HACHIDORI" "$CACHE/wty-sh-en.zip" > "$OUT/wasm.txt" 2>&1
echo "load $(cat /proc/loadavg)" > "$OUT/load.txt"
echo "measure-all: done; results in $OUT"
