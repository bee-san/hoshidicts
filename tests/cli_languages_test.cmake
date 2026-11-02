# SPDX-License-Identifier: GPL-3.0-or-later
# The language commands of the real hoshidicts-cli (docs/languages.md,
# section 10.3) on the probe packs of tests/fixtures/languages/:
#
#   cmake -DCLI=<hoshidicts-cli> -DFIXTURES=<tests/fixtures> -DTOOLS_FIXTURES=<tools/test/fixtures>
#         -DSCRATCH=<dir> -P tests/cli_languages_test.cmake
#
# Checks the JSON lines of deinflect and preprocess (trace order, condition
# names, --options and --all-options, an input line that is not UTF-8),
# eval-language's recall, --transforms (the pack checked with its own rules,
# which another file replaces, also for a pack whose lookup.transforms is
# null; nothing on standard error unless a note is due), and that a failed
# lookup prints no runtime line.

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

# expect_message(<name> <languages dir> <exit status> <stdout> <a part of stderr, or "" for none> <arguments>...):
# exact output, and the message on standard error; with "", standard error must be empty.
function(expect_message name languages expected_rc expected_out message)
  execute_process(COMMAND ${CLI} --languages ${languages} ${ARGN}
                  OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
  set(err_ok TRUE)
  if(message STREQUAL "")
    set(wanted "nothing")
    if(NOT err STREQUAL "")
      set(err_ok FALSE)
    endif()
  else()
    set(wanted "${message}")
    string(FIND "${err}" "${message}" at)
    if(at EQUAL -1)
      set(err_ok FALSE)
    endif()
  endif()
  if(NOT "${rc}" STREQUAL "${expected_rc}" OR NOT out STREQUAL expected_out OR NOT err_ok)
    message(SEND_ERROR "${name}: exit ${rc}, expected ${expected_rc}\n  stdout:   ${out}\n  expected: ${expected_out}\n  stderr: ${err}\n  wanted in stderr: ${wanted}")
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

# --transforms <file>: the pack is checked with its own rules file, and <file>
# replaces only the rules used for deinflection. The opt probe pack has a
# setting that names its own optional transform opt; opt-rules.json lacks opt
# and has an optional transform z of its own. A run that needs no note prints
# nothing on standard error.
set(RULES ${FIXTURES}/languages-cli/opt-rules.json)
set(CORPUS ${FIXTURES}/languages-cli/opt-corpus.tsv)
expect_message("deinflect --transforms: a file without the setting's transform" ${LANGUAGES} 0
  [=[{"input":"xz","results":[{"text":"xz","conditions":[],"trace":[]}]}
]=]
  "" deinflect opt xz --transforms ${RULES})
foreach(options "--options;z" "--all-options")
  expect_message("deinflect --transforms ${options}: the file's optional transform" ${LANGUAGES} 0
    [=[{"input":"xz","results":[{"text":"xz","conditions":[],"trace":[]},{"text":"x","conditions":["n"],"trace":["z"]}]}
]=]
    "" deinflect opt xz --transforms ${RULES} ${options})
endforeach()
expect_message("deinflect --transforms --all-options: not the pack's own optional transform" ${LANGUAGES} 0
  [=[{"input":"xq","results":[{"text":"xq","conditions":[],"trace":[]}]}
]=]
  "" deinflect opt xq --transforms ${RULES} --all-options)
expect_message("deinflect --transforms --options: a transform only the pack's own rules have" ${LANGUAGES} 0
  [=[{"input":"xq","results":[{"text":"xq","conditions":[],"trace":[]}]}
]=]
  "opt-rules.json has no transform opt; it has no effect in this run"
  deinflect opt xq --transforms ${RULES} --options opt)
expect_message("deinflect --transforms --options: an id neither file has" ${LANGUAGES} 1 ""
  "the pack opt has no transform or variant pass nope"
  deinflect opt xq --transforms ${RULES} --options nope)
expect_message("deinflect --transforms: an error in the file names it" ${LANGUAGES} 1 ""
  "opt: ${CORPUS}: not valid JSON"
  deinflect opt xq --transforms ${CORPUS})

# eval-language measures the file's rules, with every optional transform the
# file has on: the pack's own rules reach xq (opt), opt-rules.json xz and yz (z).
expect("eval-language: the pack's own rules" 0
  [=[{"rows":5,"positives":4,"negatives":1,"recall":0.5,"negativesPassed":1}
]=]
  eval-language opt ${CORPUS})
expect_message("eval-language --transforms" ${LANGUAGES} 0
  [=[{"rows":5,"positives":4,"negatives":1,"recall":0.75,"negativesPassed":1,"perRule":[{"transform":"s","rule":0,"recovers":1,"breaks":0},{"transform":"z","rule":0,"recovers":2,"breaks":0}]}
]=]
  "" eval-language opt ${CORPUS} --transforms ${RULES} --per-rule)

# A pack whose lookup.transforms is null has no rules file of its own to read:
# <file> is its only rules (a copy of the stm probe pack without rules).
file(READ ${LANGUAGES}/stm/language.json stm_language)
string(REPLACE [=["transforms": "transforms.json"]=] [=["transforms": null]=] stm_without_rules "${stm_language}")
if(stm_without_rules STREQUAL stm_language)
  message(SEND_ERROR "the stm probe pack does not name transforms.json")
endif()
set(NULL_RULES ${SCRATCH}/cli-languages-null-rules)
file(REMOVE_RECURSE ${NULL_RULES})
file(WRITE ${NULL_RULES}/stm/language.json "${stm_without_rules}")
expect_message("deinflect: a pack whose lookup.transforms is null" ${NULL_RULES} 0
  [=[{"input":"xz","results":[{"text":"xz","conditions":[],"trace":[]}]}
]=]
  "" deinflect stm xz)
expect_message("deinflect --transforms: a pack whose lookup.transforms is null" ${NULL_RULES} 0
  [=[{"input":"xz","results":[{"text":"xz","conditions":[],"trace":[]},{"text":"x","conditions":["n"],"trace":["z"]}]}
]=]
  "" deinflect stm xz --transforms ${RULES} --options z)
file(REMOVE_RECURSE ${NULL_RULES})

# The pack is checked with its own rules file, not with <file>: a setting that
# names z, which only opt-rules.json has, is an error, and so is an own rules
# file that cannot be read.
file(READ ${LANGUAGES}/opt/language.json language)
string(REPLACE [=["transforms": ["opt"]]=] [=["transforms": ["z"]]=] names_z "${language}")
if(names_z STREQUAL language)
  message(SEND_ERROR "the opt probe pack has no setting that names opt")
endif()
set(OWN ${SCRATCH}/cli-languages-own)
file(REMOVE_RECURSE ${OWN})
file(WRITE ${OWN}/opt/language.json "${names_z}")
file(COPY ${LANGUAGES}/opt/transforms.json DESTINATION ${OWN}/opt)
foreach(command "deinflect;opt;xz" "eval-language;opt;${CORPUS}")
  list(GET command 0 name)
  expect_message("${name} --transforms: the pack is checked with its own rules" ${OWN} 1 ""
    [=[opt: language.json: settings[0].effect.transforms[0]: names no optional transform "z"]=]
    ${command} --transforms ${RULES})
endforeach()
file(REMOVE ${OWN}/opt/transforms.json)
file(WRITE ${OWN}/opt/language.json "${language}")
expect_message("deinflect --transforms: the pack's own rules file must be readable" ${OWN} 1 ""
  "cannot read ${OWN}/opt/transforms.json"
  deinflect opt xz --transforms ${RULES})
file(REMOVE_RECURSE ${OWN})

# The tool tests' fixture pack xx has a setting that names its own optional
# transform archaic, which its sources/yomitan.json (the rules
# tools/check-yomitan.mjs compares with Yomitan) lacks.
set(XX ${TOOLS_FIXTURES}/languages)
set(XX_YOMITAN ${XX}/xx/sources/yomitan.json)
expect_message("deinflect xx --all-options: its own rules" ${XX} 0
  [=[{"input":"walketh","results":[{"text":"walketh","conditions":[],"trace":[]},{"text":"walk","conditions":["v_phr"],"trace":["archaic"]}]}
]=]
  "" deinflect xx walketh --all-options)
expect_message("deinflect xx --all-options --transforms sources/yomitan.json" ${XX} 0
  [=[{"input":"walketh","results":[{"text":"walketh","conditions":[],"trace":[]}]}
]=]
  "" deinflect xx walketh --all-options --transforms ${XX_YOMITAN})
expect_message("eval-language xx --transforms sources/yomitan.json" ${XX} 0
  [=[{"rows":7,"positives":6,"negatives":1,"recall":0.8333333333333334,"negativesPassed":1}
]=]
  "" eval-language xx ${XX}/xx/tests/corpus.tsv --transforms ${XX_YOMITAN})
# --options may also name an own transform that is not optional and that
# <file> lacks (xx's possessive, which its own rules always apply): a note,
# and no effect.
expect_message("deinflect xx: possessive, with its own rules" ${XX} 0
  [=[{"input":"cat’s","results":[{"text":"cat’s","conditions":[],"trace":[]},{"text":"cat","conditions":["np","ns"],"trace":["possessive"]},{"text":"cat’","conditions":["ns"],"trace":["plural"]}]}
]=]
  "" deinflect xx cat’s)
expect_message("deinflect xx --transforms sources/yomitan.json --options: an own transform that is not optional" ${XX} 0
  [=[{"input":"cat’s","results":[{"text":"cat’s","conditions":[],"trace":[]},{"text":"cat’","conditions":["ns"],"trace":["plural"]}]}
]=]
  "yomitan.json has no transform possessive; it has no effect in this run"
  deinflect xx cat’s --transforms ${XX_YOMITAN} --options possessive)

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
