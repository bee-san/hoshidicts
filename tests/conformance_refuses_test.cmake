# SPDX-License-Identifier: GPL-3.0-or-later
# Runs language-conformance-test on a pack that must fail for exactly one
# reason (docs/languages.md, section 12.1):
#
#   cmake -DTEST=<language-conformance-test> -DPACK=<dir> -DSCRATCH=<dir> -DREASON=<text> -P tests/conformance_refuses_test.cmake

execute_process(COMMAND ${TEST} ${PACK} ${SCRATCH} OUTPUT_VARIABLE out ERROR_VARIABLE err RESULT_VARIABLE rc)
string(FIND "${err}" "${REASON}" reported)
string(FIND "${out}" ": 1 failures" one)
if(rc EQUAL 0 OR reported EQUAL -1 OR one EQUAL -1)
  message(FATAL_ERROR "${PACK} should fail with exactly \"${REASON}\": exit ${rc}\n  stdout: ${out}\n  stderr: ${err}")
endif()
message(STATUS "refused as expected: ${REASON}")
