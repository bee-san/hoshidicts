#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Reproduces the numbers of README.md (Measurements). Run from the repository
# root after building with -DHOSHIDICTS_CLI=ON -DHOSHIDICTS_BENCHMARK=ON and
# building build/lookup-batch from languages/en/sources/lookup-batch.cpp:
#
#   DICT_ZIP=wty-sq-en.zip DICT_DIR=<wty-sq-en imported by hoshidicts-cli import> \
#   FREQ=sq_50k.txt UNIMORPH=unimorph-sqi/sqi TATOEBA=sqi_sentences.tsv.bz2 \
#   TEXTS=<dir of Wikipedia .txt files> HACHIDORI=<hachidori checkout> \
#   bash languages/sq/sources/measure-all.sh <out dir>
#
# Writes <out dir>/*.txt: eval-table (eval-language for the own, Yomitan,
# union and final rules on every test file, with every option on and with the
# defaults), frequent, phrases, real, yomitan, traces (sources/measure.py), bench
# (benchmark-lookup, 3 runs), wasm (sources/wasm-bench.mjs) and mutations
# (sources/mutations.py).
set -euo pipefail
OUT=${1:?out dir}
mkdir -p "$OUT"
P=languages/sq
CLI=build/hoshidicts-cli

node tools/merge-transforms.mjs sq --out "$OUT/union.json" --force > /dev/null
# The sample is corpus.tsv with gaps.tsv; each file also as a copy with the
# other options mode, and the hand-written files with any trace (*), so that
# rule sets with other transform ids are compared on their lemmas.
(cat $P/tests/corpus.tsv; grep -v '^#' $P/tests/gaps.tsv) > "$OUT/sample.tsv"
any() { awk -F'\t' 'BEGIN{OFS="\t"} /^#/{print; next} {$6="*"; print}' "$1"; }
for f in sample; do (echo "# options: default"; cat "$OUT/$f.tsv") > "$OUT/$f-def.tsv"; done
cp $P/tests/cases.tsv "$OUT/cases.tsv"; (echo "# options: default"; cat $P/tests/cases.tsv) > "$OUT/cases-def.tsv"
grep -v '^# options: default$' $P/tests/defaults.tsv > "$OUT/defaults.tsv"; cp $P/tests/defaults.tsv "$OUT/defaults-def.tsv"
any $P/tests/defaults.tsv > "$OUT/defaults-any-def.tsv"; grep -v '^# options: default$' "$OUT/defaults-any-def.tsv" > "$OUT/defaults-any.tsv"
cp $P/tests/yomitan.tsv "$OUT/yomitan.tsv"; (echo "# options: default"; cat $P/tests/yomitan.tsv) > "$OUT/yomitan-def.tsv"
: > "$OUT/eval-table.txt"
for rs in own:$P/sources/own.json yomitan:$P/sources/yomitan.json union:$OUT/union.json final:$P/transforms.json; do
  for file in sample sample-def cases cases-def defaults defaults-def defaults-any defaults-any-def yomitan yomitan-def; do
    echo "${rs%%:*} $file $($CLI eval-language sq "$OUT/$file.tsv" --transforms "${rs#*:}" --dictionary "$DICT_DIR" | tail -1)" >> "$OUT/eval-table.txt"
  done
done

python3 $P/sources/measure.py frequent "$DICT_ZIP" "$DICT_DIR" "$FREQ" "$UNIMORPH" > "$OUT/frequent.txt"
python3 $P/sources/measure.py phrases "$DICT_ZIP" "$DICT_DIR" "$UNIMORPH" "$TATOEBA" > "$OUT/phrases.txt"
python3 $P/sources/measure.py real "$DICT_ZIP" "$DICT_DIR" "$UNIMORPH" "$OUT/real" "$TEXTS"/*.txt > "$OUT/real.txt"
python3 $P/sources/measure.py yomitan "$DICT_ZIP" "$FREQ" "$UNIMORPH" > "$OUT/yomitan.txt"
python3 $P/sources/measure.py traces "$OUT/sample.tsv" > "$OUT/traces.txt"

# Lookup speed: the final, union and Yomitan rules, each in a copy of the pack.
for v in union yomitan; do rm -rf "$OUT/lang-$v" && mkdir -p "$OUT/lang-$v" && cp -r $P "$OUT/lang-$v/sq"; done
cp "$OUT/union.json" "$OUT/lang-union/sq/transforms.json"
cp $P/sources/yomitan.json "$OUT/lang-yomitan/sq/transforms.json"
echo "load $(cat /proc/loadavg)" > "$OUT/bench.txt"
for run in 1 2 3; do
  for v in final:languages union:$OUT/lang-union yomitan:$OUT/lang-yomitan; do
    build/benchmark-lookup $P/sources/benchmark-words.txt 6 --term "$DICT_DIR" --language sq --languages "${v#*:}" --json > "$OUT/bench.json"
    python3 - "$OUT/bench.json" "${v%%:*}" $run >> "$OUT/bench.txt" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
ms = sorted(x for p in d['passes'][1:] for x in p)
q = lambda f: ms[min(len(ms) - 1, int(f * len(ms)))]
print(f"{sys.argv[2]} run {sys.argv[3]}: {len(ms)} lookups p50 {q(0.5)*1000:.1f} us p95 {q(0.95)*1000:.1f} us")
PY
  done
done
echo "load $(cat /proc/loadavg)" >> "$OUT/bench.txt"
rm -rf "$OUT/lang-union" "$OUT/lang-yomitan" "$OUT/bench.json"

: > "$OUT/wasm.txt"
for v in hoshidicts hoshidicts-threaded; do
  node $P/sources/wasm-bench.mjs "$HACHIDORI" $v 10 "$DICT_ZIP" $P/sources/benchmark-words.txt >> "$OUT/wasm.txt"
done

python3 $P/sources/mutations.py "$OUT/mutations" > "$OUT/mutations.txt"
echo "done: $OUT"
