# Runs tools/export-legacy-japanese.cpp and fails when its output differs from
# the committed languages/ja/transforms.json.
execute_process(COMMAND ${EXPORT} ${OUT} RESULT_VARIABLE result)
if(NOT result EQUAL 0)
  message(FATAL_ERROR "export-legacy-japanese failed (${result})")
endif()
execute_process(COMMAND ${CMAKE_COMMAND} -E compare_files ${OUT} ${EXPECTED} RESULT_VARIABLE differs)
if(NOT differs EQUAL 0)
  message(FATAL_ERROR "${EXPECTED} differs from what tools/export-legacy-japanese.cpp writes (${OUT})")
endif()
