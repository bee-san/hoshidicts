# SPDX-License-Identifier: GPL-3.0-or-later
# The language commands of the real hoshidicts-cli (docs/languages.md,
# section 10.3) on the probe packs of tests/fixtures/languages/:
#
#   cmake -DCLI=<hoshidicts-cli> -DFIXTURES=<tests/fixtures> -P tests/cli_languages_test.cmake
#
# Checks the JSON lines of deinflect and preprocess (trace order, condition
# names, --options and --all-options, an input line that is not UTF-8),
# eval-language's recall, and that a failed lookup prints no runtime line.

set(LANGUAGES ${FIXTURES}/languages)

# expect(<name> <exit status> <stdout> <arguments>...): exact output.
function(expect name expected_rc expected_out)
  execute_process(COMMAND ${CLI} --languages ${LANGUAGES} ${ARGN}
                  OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
  if(NOT "${rc}" STREQUAL "${expected_rc}" OR NOT out STREQUAL expected_out)
    message(SEND_ERROR "${name}: exit ${rc}, expected ${expected_rc}\n  stdout:   ${out}\n  expected: ${expected_out}\n  stderr: ${err}")
  else()
    message(STATUS "ok: ${name}")
  endif()
endfunction()

# expect_line(<name> <a whole line of stdout> <arguments>...): exit 0 and the line.
function(expect_line name line)
  execute_process(COMMAND ${CLI} --languages ${LANGUAGES} ${ARGN}
                  OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
  string(FIND "${out}" "${line}" at)
  if(NOT rc EQUAL 0 OR at EQUAL -1)
    message(SEND_ERROR "${name}: exit ${rc}; no such line in the output\n  wanted: ${line}\n  stdout: ${out}\n  stderr: ${err}")
  else()
    message(STATUS "ok: ${name}")
  endif()
endfunction()

# Trace ids newest first, as the corpus reasons column (12.2): 食べました is
# -た and then -ます. Conditions are leaf names in declaration order: v1 is
# v1d and v1p, the probe pack's n is np and ns.
expect_line("deinflect: trace newest first"
  [=[{"text":"食べる","conditions":["v1d","v1p"],"trace":["-ます","-た"]}]=]
  deinflect ja 食べました)
expect("deinflect: condition names" 0
  [=[{"input":"cats","results":[{"text":"cats","conditions":[],"trace":[]},{"text":"cat","conditions":["np","ns"],"trace":["plural"]}]}
]=]
  deinflect stm cats)
# Results in the deinflector's order: suffix-indexed rules first (7.4).
expect("deinflect: suffix rules before prefix rules" 0
  [=[{"input":"qaq","results":[{"text":"qaq","conditions":[],"trace":[]},{"text":"qa","conditions":["v"],"trace":["suf"]},{"text":"aq","conditions":["v"],"trace":["pre"]}]}
]=]
  deinflect stm qaq)

# Optional transforms and passes are off unless --options or --all-options
# names them.
expect("deinflect: an optional transform is off" 0
  [=[{"input":"xq","results":[{"text":"xq","conditions":[],"trace":[]}]}
]=]
  deinflect opt xq)
foreach(options "--options;opt" "--all-options")
  expect("deinflect ${options}" 0
    [=[{"input":"xq","results":[{"text":"xq","conditions":[],"trace":[]},{"text":"x","conditions":["n"],"trace":["opt"]}]}
]=]
    deinflect opt xq ${options})
endforeach()
expect_line("deinflect: --options turns the nekoSpeech pass on"
  [=[{"text":"できる","conditions":["v1d","v1p"],"trace":["negative","nekoSpeech"]}]=]
  deinflect ja できにゃい --options nekoSpeech)
expect("deinflect: --options names an unknown id" 1 "" deinflect opt xq --options nope)

expect("preprocess: an optional preprocessor is off" 0
  [=[{"input":"cat","variants":[{"text":"cat","steps":0}]}
]=]
  preprocess opt cat)
foreach(options "--options;up" "--all-options")
  expect("preprocess ${options}" 0
    [=[{"input":"cat","variants":[{"text":"CAT","steps":1},{"text":"cat","steps":0}]}
]=]
    preprocess opt cat ${options})
endforeach()
expect("preprocess: variants sorted" 0
  [=[{"input":"zz","variants":[{"text":"aa","steps":1},{"text":"bb","steps":1},{"text":"zz","steps":0}]}
]=]
  preprocess stm zz)

# A line that is not UTF-8 is an error and is not copied into the output.
execute_process(COMMAND ${CLI} --languages ${LANGUAGES} deinflect stm --stdin
                INPUT_FILE ${FIXTURES}/languages-cli/invalid-utf8.txt
                OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
set(wanted [=[{"input":"cats","results":[{"text":"cats","conditions":[],"trace":[]},{"text":"cat","conditions":["np","ns"],"trace":["plural"]}]}
{"input":null,"results":[],"error":"line 2 of the input is not valid UTF-8"}
{"input":"kokox","results":[{"text":"kokox","conditions":[],"trace":[]},{"text":"koku","conditions":["v"],"trace":["last"]}]}
]=])
string(FIND "${err}" "line 2 of the input is not valid UTF-8" reported)
if(NOT rc EQUAL 1 OR NOT out STREQUAL wanted OR reported EQUAL -1)
  message(SEND_ERROR "deinflect --stdin with a line that is not UTF-8: exit ${rc}\n  stdout: ${out}\n  stderr: ${err}")
else()
  message(STATUS "ok: deinflect --stdin with a line that is not UTF-8")
endif()

# eval-language: recall is the share of valid = 1 rows found (3 of 4), not
# counting the negative that passes.
expect("eval-language: recall and negatives" 0
  [=[{"rows":5,"positives":4,"negatives":1,"recall":0.75,"negativesPassed":1}
]=]
  eval-language stm ${LANGUAGES}/stm/tests/corpus.tsv)

# An unknown language: the error, and no runtime line after it.
execute_process(COMMAND ${CLI} --languages ${LANGUAGES} lookup --language qq ${FIXTURES}/no-such-dictionary text
                OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
string(FIND "${out}" "runtime:" runtime)
string(FIND "${err}" [=[no language pack "qq" is loaded]=] reported)
if(NOT rc EQUAL 1 OR NOT runtime EQUAL -1 OR reported EQUAL -1)
  message(SEND_ERROR "lookup --language qq: exit ${rc}\n  stdout: ${out}\n  stderr: ${err}")
else()
  message(STATUS "ok: lookup --language qq")
endif()
