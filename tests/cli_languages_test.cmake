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
# null; nothing on standard error unless a note is due), eval-language on a
# corpus whose first line is `# options: default` (section 12.2), that a
# failed lookup prints no runtime line, and that deinflect reports a search
# that reached a bound (section 7.4).

set(LANGUAGES ${FIXTURES}/languages)

# The conformance test's loop fixture (docs/languages.md 7.4): deinflect ends,
# prints the results within the bounds, and says on standard error which bound
# cut the search, with the chain; an input the rules do not loop on says
# nothing.
set(bounds ${SCRATCH}/cli-search-bounds)
file(REMOVE_RECURSE ${bounds})
file(COPY ${FIXTURES}/conformance/lp DESTINATION ${bounds})
foreach(text Rome Roma)
  execute_process(COMMAND ${CLI} --languages ${bounds} deinflect lp ${text}
                  OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
  string(REGEX MATCHALL "\"text\":" texts "${out}")
  list(LENGTH texts count)
  if(text STREQUAL "Rome")
    set(wanted_count 65)
    set(message "hoshidicts-cli: deinflect lp Rome: the search reached a bound (docs/languages.md 7.4): an output more than 32 code points longer than the text the search started from, after 65 steps: Rome -name[0]-> Romis")
    string(FIND "${err}" "${message}" at)
  else()
    set(wanted_count 1)
    set(message "nothing")
    if(err STREQUAL "")
      set(at 0)
    else()
      set(at -1)
    endif()
  endif()
  if(NOT rc EQUAL 0 OR NOT count EQUAL wanted_count OR at EQUAL -1)
    message(SEND_ERROR "search bounds, ${text}: exit ${rc}, ${count} results (expected ${wanted_count})\n  stderr: ${err}\n  wanted in stderr: ${message}")
  else()
    message(STATUS "ok: search bounds, ${text}")
  endif()
endforeach()
# A text's variant pass readings share its work budget (docs/languages.md 7.4):
# with 2,000 rules that append to every text, the search of にゃ spends it, and
# each of its five readings records its text only.
set(wide ${SCRATCH}/cli-search-budget)
file(REMOVE_RECURSE ${wide})
file(COPY ${FIXTURES}/conformance/lp DESTINATION ${wide})
set(rules "")
foreach(i RANGE 1999)
  if(i GREATER 0)
    string(APPEND rules ",")
  endif()
  string(APPEND rules "{\"type\": \"suffix\", \"inflected\": \"\", \"deinflected\": \"x${i}\", \"conditionsIn\": [], \"conditionsOut\": [], \"stemMinLength\": 1}")
endforeach()
file(WRITE ${wide}/lp/transforms.json "{\"schema\": 1, \"conditions\": {\"n\": {\"name\": \"Noun\", \"isDictionaryForm\": true}}, \"transforms\": [{\"id\": \"wide\", \"name\": \"wide\", \"description\": \"x\", \"source\": \"own\", \"rules\": [${rules}]}]}")
file(READ ${wide}/lp/language.json descriptor)
string(REPLACE "\"variantPasses\": []" "\"variantPasses\": [{\"id\": \"nekoSpeech\", \"builtin\": \"ja.nekoSpeech\", \"optional\": true}]" descriptor "${descriptor}")
file(WRITE ${wide}/lp/language.json "${descriptor}")
set(counts "")
foreach(options "" "--options;nekoSpeech")
  execute_process(COMMAND ${CLI} --languages ${wide} deinflect lp にゃ ${options}
                  OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
  string(REGEX MATCHALL "\"text\":" texts "${out}")
  list(LENGTH texts count)
  list(APPEND counts ${count})
endforeach()
list(GET counts 0 alone)
list(GET counts 1 with_pass)
math(EXPR expected "${alone} + 5")
if(NOT with_pass EQUAL expected OR alone LESS 100)
  message(SEND_ERROR "search budget, readings: ${alone} results alone, ${with_pass} with the pass (expected ${expected})")
else()
  message(STATUS "ok: search budget, readings share it")
endif()
# eval-language names the corpus row whose search reached a bound.
execute_process(COMMAND ${CLI} --languages ${bounds} eval-language lp ${bounds}/lp/tests/corpus.tsv
                OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
set(message "hoshidicts-cli: ${bounds}/lp/tests/corpus.tsv:4: Rome: the search reached a bound (docs/languages.md 7.4): an output more than 32 code points longer")
string(FIND "${err}" "${message}" at)
string(FIND "${out}" "\"recall\":1" recall)
if(NOT rc EQUAL 0 OR at EQUAL -1 OR recall EQUAL -1)
  message(SEND_ERROR "search bounds, eval-language: exit ${rc}\n  stdout: ${out}\n  stderr: ${err}\n  wanted in stderr: ${message}")
else()
  message(STATUS "ok: search bounds, eval-language")
endif()

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

# The options line (12.2): eval-language reads a corpus whose first line is
# `# options: default` with the pack's defaults, for its deinflections and for
# firstRank's lookups, and the JSON starts with "options":"default". The od
# conformance fixture has an optional accent processor (estan -> están) and an
# optional transform (walketh -> walk); its tests/dictionary has estar and
# walk. Of the three rows, the defaults reach only estan -> estar (recall 1/3),
# and firstRank loses walketh -> walk (2/3 -> 1/3).
set(OD ${SCRATCH}/cli-languages-od)
file(REMOVE_RECURSE ${OD})
file(COPY ${FIXTURES}/conformance/od DESTINATION ${OD}/languages)
file(COPY ${FIXTURES}/conformance/od/tests/dictionary/ DESTINATION ${OD}/dictionary)
execute_process(COMMAND ${CMAKE_COMMAND} -E tar cf ${OD}/od-test.zip --format=zip index.json term_bank_1.json
                WORKING_DIRECTORY ${OD}/dictionary RESULT_VARIABLE rc)
execute_process(COMMAND ${CLI} import ${OD}/od-test.zip OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE import_rc)
string(FIND "${out}" "term_count: 2" imported)
if(NOT rc EQUAL 0 OR NOT import_rc EQUAL 0 OR imported EQUAL -1 OR NOT IS_DIRECTORY ${OD}/od-test)
  message(SEND_ERROR "the od test dictionary does not import: exit ${rc}, ${import_rc}\n  stdout: ${out}\n  stderr: ${err}")
endif()
set(OD_ROWS "# category\tvalid\tsource\tterm\trule\treasons\npresent\t1\testan\testar\tv\tpresent\naccents\t1\testan\testán\t*\t*\narchaic\t1\twalketh\twalk\tv\tarchaic\n")
file(WRITE ${OD}/all.tsv "${OD_ROWS}")
file(WRITE ${OD}/default.tsv "# options: default\n${OD_ROWS}")
expect_message("eval-language: every option on" ${OD}/languages 0
  [=[{"rows":3,"positives":3,"negatives":0,"recall":1,"negativesPassed":null,"falseCandidates":0.3333333333333333,"firstRank":0.6666666666666666}
]=]
  "" eval-language od ${OD}/all.tsv --dictionary ${OD}/od-test)
expect_message("eval-language: # options: default" ${OD}/languages 0
  [=[{"options":"default","rows":3,"positives":3,"negatives":0,"recall":0.3333333333333333,"negativesPassed":null,"falseCandidates":0.3333333333333333,"firstRank":0.3333333333333333}
]=]
  "" eval-language od ${OD}/default.tsv --dictionary ${OD}/od-test)
# Variant passes are optional too: the defaults read no cat speech.
set(NEKO_ROWS "# category\tvalid\tsource\tterm\trule\treasons\nneko\t1\tできにゃい\tできる\t*\t*\n")
file(WRITE ${OD}/neko-all.tsv "${NEKO_ROWS}")
file(WRITE ${OD}/neko-default.tsv "# options: default\n${NEKO_ROWS}")
expect("eval-language ja: the nekoSpeech pass is on" 0
  [=[{"rows":1,"positives":1,"negatives":0,"recall":1,"negativesPassed":null}
]=]
  eval-language ja ${OD}/neko-all.tsv)
expect("eval-language ja # options: default: no variant pass" 0
  [=[{"options":"default","rows":1,"positives":1,"negatives":0,"recall":0,"negativesPassed":null}
]=]
  eval-language ja ${OD}/neko-default.tsv)
# The line is exact and first, as in the conformance test.
file(WRITE ${OD}/misplaced.tsv "${OD_ROWS}# options: default\n")
expect_message("eval-language: an options line below the first line" ${OD}/languages 1 ""
  [=[misplaced.tsv:5: an options line is "# options: default", and only on the first line]=]
  eval-language od ${OD}/misplaced.tsv)

# firstRank's lookups turn on no optional processor with the defaults: in a
# copy of od without the rule for estan, only the accent processor could reach
# estar, so nothing is found.
file(COPY ${FIXTURES}/conformance/od DESTINATION ${OD}/no-rule)
file(READ ${OD}/no-rule/od/transforms.json rules)
string(REPLACE [=[,
        {"type": "suffix", "inflected": "an", "deinflected": "ar", "conditionsIn": [], "conditionsOut": ["v"], "stemMinLength": 2}]=] "" without "${rules}")
if(without STREQUAL rules)
  message(SEND_ERROR "the od fixture has no rule for estan")
endif()
file(WRITE ${OD}/no-rule/od/transforms.json "${without}")
expect_message("eval-language # options: default: firstRank without optional processors" ${OD}/no-rule 0
  [=[{"options":"default","rows":3,"positives":3,"negatives":0,"recall":0,"negativesPassed":null,"falseCandidates":0,"firstRank":0}
]=]
  "" eval-language od ${OD}/default.tsv --dictionary ${OD}/od-test)
# ... and no optional postprocessor: in a copy of od with one that replaces
# estar by walk, the defaults still rank estar first for estan.
file(COPY ${FIXTURES}/conformance/od DESTINATION ${OD}/post)
file(READ ${OD}/post/od/language.json language)
string(REPLACE [=["postprocessors": [],]=]
               [=["postprocessors": [{"id": "walkInstead", "optional": true, "keepInput": false, "variants": [[{"map": {"estar": "walk"}}]]}],]=]
               with_post "${language}")
if(with_post STREQUAL language)
  message(SEND_ERROR "the od fixture has postprocessors")
endif()
file(WRITE ${OD}/post/od/language.json "${with_post}")
expect_message("eval-language # options: default: firstRank without optional postprocessors" ${OD}/post 0
  [=[{"options":"default","rows":3,"positives":3,"negatives":0,"recall":0.3333333333333333,"negativesPassed":null,"falseCandidates":0.3333333333333333,"firstRank":0.3333333333333333}
]=]
  "" eval-language od ${OD}/default.tsv --dictionary ${OD}/od-test)
# ... and no variant pass, while every option on runs them: Japanese cat
# speech reads そんにゃ as そんな only with nekoSpeech.
file(WRITE ${OD}/ja-dictionary/index.json "{\"title\": \"ja-neko-test\", \"revision\": \"1\", \"format\": 3}\n")
file(WRITE ${OD}/ja-dictionary/term_bank_1.json "[[\"そんな\", \"そんな\", \"adj-pn\", \"\", 0, [\"such\"], 1, \"\"]]\n")
execute_process(COMMAND ${CMAKE_COMMAND} -E tar cf ${OD}/ja-neko-test.zip --format=zip index.json term_bank_1.json
                WORKING_DIRECTORY ${OD}/ja-dictionary RESULT_VARIABLE rc)
execute_process(COMMAND ${CLI} import ${OD}/ja-neko-test.zip OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE import_rc)
if(NOT rc EQUAL 0 OR NOT import_rc EQUAL 0 OR NOT IS_DIRECTORY ${OD}/ja-neko-test)
  message(SEND_ERROR "the Japanese test dictionary does not import: exit ${rc}, ${import_rc}\n  stdout: ${out}\n  stderr: ${err}")
endif()
set(SONNA_ROWS "# category\tvalid\tsource\tterm\trule\treasons\nneko\t1\tそんにゃ\tそんな\t*\t*\n")
file(WRITE ${OD}/sonna-all.tsv "${SONNA_ROWS}")
file(WRITE ${OD}/sonna-default.tsv "# options: default\n${SONNA_ROWS}")
expect("eval-language ja --dictionary: firstRank with the nekoSpeech pass" 0
  [=[{"rows":1,"positives":1,"negatives":0,"recall":1,"negativesPassed":null,"falseCandidates":0,"firstRank":1}
]=]
  eval-language ja ${OD}/sonna-all.tsv --dictionary ${OD}/ja-neko-test)
expect("eval-language ja --dictionary # options: default: firstRank without it" 0
  [=[{"options":"default","rows":1,"positives":1,"negatives":0,"recall":0,"negativesPassed":null,"falseCandidates":0,"firstRank":0}
]=]
  eval-language ja ${OD}/sonna-default.tsv --dictionary ${OD}/ja-neko-test)
file(REMOVE_RECURSE ${OD})

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
