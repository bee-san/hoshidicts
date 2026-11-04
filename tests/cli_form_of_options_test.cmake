# SPDX-License-Identifier: GPL-3.0-or-later
# hoshidicts-cli eval-language with lookup.formOfIgnore and
# lookup.formOfNormalizer (docs/languages.md, sections 4.4, 9.10 and 10.3):
# the probe pack of tests/fixtures/form-of-options/ (fx) sets both; copies
# have no formOfIgnore (fi) and no formOfNormalizer (fn).
#
#   cmake -DCLI=<hoshidicts-cli> -DFIXTURES=<tests/fixtures/form-of-options> -DSCRATCH=<dir> -P tests/cli_form_of_options_test.cmake
#
# corpus.tsv: recall is 3/4 in every mode (no rule reaches dati from davati;
# the dictionary's reference does). fx: every source finds its term first
# (firstRank 4/4) and 車, which xe's row names under a rule fx does not list,
# is the only false candidate (1/4). fi follows the classifier references
# too: bàn, ghế and thuyền are false candidates as well (4/4). fn finds
# nothing for davati, whose reference names dȁti, a text no row has (firstRank
# 3/4); dȁti is no false candidate in any mode, and with the normalizer the
# text it finds is the lemma.

set(WORK ${SCRATCH}/cli-form-of-options)
file(REMOVE_RECURSE ${WORK})
file(COPY ${FIXTURES}/languages/fx DESTINATION ${WORK}/languages)
file(READ ${FIXTURES}/languages/fx/language.json language)

# write(<code> <text>): a pack directory <code> with this language.json and fx's rules.
function(write code text)
  string(REPLACE [=["code": "fx"]=] "\"code\": \"${code}\"" text "${text}")
  file(MAKE_DIRECTORY ${WORK}/languages/${code})
  file(WRITE ${WORK}/languages/${code}/language.json "${text}")
  file(COPY ${FIXTURES}/languages/fx/transforms.json DESTINATION ${WORK}/languages/${code})
endfunction()
string(REPLACE [=["formOfIgnore": ["eumhun", "classifier"]]=] [=["formOfIgnore": []]=] no_ignore "${language}")
if(no_ignore STREQUAL language)
  message(FATAL_ERROR "the probe pack has no formOfIgnore")
endif()
write(fi "${no_ignore}")
string(FIND "${language}" [=["formOfNormalizer": []=] from)
string(FIND "${language}" [=[    "confirmedOrder"]=] to)
if(from EQUAL -1 OR to EQUAL -1)
  message(FATAL_ERROR "the probe pack has no formOfNormalizer")
endif()
string(SUBSTRING "${language}" 0 ${from} head)
string(SUBSTRING "${language}" ${to} -1 tail)
write(fn "${head}\"formOfNormalizer\": null,\n${tail}")

# The dictionary, zipped and imported by the CLI next to the archive.
execute_process(COMMAND ${CMAKE_COMMAND} -E tar cf ${WORK}/options.zip --format=zip index.json term_bank_1.json term_meta_bank_1.json
                WORKING_DIRECTORY ${FIXTURES}/dictionary RESULT_VARIABLE rc)
if(NOT rc EQUAL 0)
  message(FATAL_ERROR "cannot zip ${FIXTURES}/dictionary")
endif()
execute_process(COMMAND ${CLI} import ${WORK}/options.zip OUTPUT_VARIABLE out RESULT_VARIABLE rc
                WORKING_DIRECTORY ${WORK})
if(NOT rc EQUAL 0 OR NOT out MATCHES "title: form-of-options")
  message(FATAL_ERROR "import: exit ${rc}\n${out}")
endif()

# expect(<name> <stdout> <arguments>...): exit 0 and exactly this output.
function(expect name expected_out)
  execute_process(COMMAND ${CLI} --languages ${WORK}/languages ${ARGN}
                  OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
  if(NOT rc EQUAL 0 OR NOT out STREQUAL expected_out)
    message(SEND_ERROR "${name}: exit ${rc}\n  stdout:   ${out}\n  expected: ${expected_out}\n  stderr: ${err}")
  else()
    message(STATUS "ok: ${name}")
  endif()
endfunction()

set(CORPUS ${FIXTURES}/corpus.tsv)
expect("eval-language: formOfIgnore and formOfNormalizer"
  [=[{"rows":4,"positives":4,"negatives":0,"recall":0.75,"negativesPassed":null,"falseCandidates":0.25,"firstRank":1}
]=]
  eval-language fx ${CORPUS} --dictionary ${WORK}/form-of-options)
expect("eval-language: no formOfIgnore"
  [=[{"rows":4,"positives":4,"negatives":0,"recall":0.75,"negativesPassed":null,"falseCandidates":1,"firstRank":1}
]=]
  eval-language fi ${CORPUS} --dictionary ${WORK}/form-of-options)
expect("eval-language: no formOfNormalizer"
  [=[{"rows":4,"positives":4,"negatives":0,"recall":0.75,"negativesPassed":null,"falseCandidates":0.25,"firstRank":0.75}
]=]
  eval-language fn ${CORPUS} --dictionary ${WORK}/form-of-options)

# A row whose term is the source itself: the text the normalizer finds for
# davati's reference (dati) is then a false candidate, and only with the
# normalizer. dvije's reference names dvȃ, whose only row is a reference, so
# it is never normalized and names nothing.
file(WRITE ${WORK}/self.tsv "# category\tvalid\tsource\tterm\trule\treasons\nself\t1\tdavati\tdavati\t*\t\nself\t1\tdvije\tdvije\t*\t\n")
foreach(mode fx:0.5 fn:0)
  string(REPLACE ":" ";" parts "${mode}")
  list(GET parts 0 code)
  list(GET parts 1 false_candidates)
  expect("eval-language: the normalizer's text is a false candidate, ${code}"
    "{\"rows\":2,\"positives\":2,\"negatives\":0,\"recall\":1,\"negativesPassed\":null,\"falseCandidates\":${false_candidates},\"firstRank\":0}\n"
    eval-language ${code} ${WORK}/self.tsv --dictionary ${WORK}/form-of-options)
endforeach()
