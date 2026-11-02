#pragma once
#include <cstdint>
#include <string>
#include <vector>

// A form-of reference of a term bank row: a definition [formOf, [rules...]]
// (Yomitan's deinflection tuple), which Yomitan's translator follows to the
// term formOf and never displays (docs/languages.md, section 9.10).
struct FormOfReference {
  std::string form_of;
  std::vector<std::string> rules;
};

// A term record has a slot that every reader since .hoshidicts_2 skips: a
// count of entries, each [u32 length][formOf][u32 rule count] and per rule
// [u32 length][rule]. Importers before form-of support wrote count 0 for every
// row. Since then a row whose definitions hold a form-of reference is flagged
// with exactly one entry whose formOf is empty: with no rules when the row is
// only references (and arrays that are not references), with one empty rule
// when it also has definitions that are not arrays. The references stay in
// the row's glossary, as the bank wrote them. A slot that holds anything else
// (an entry with a formOf, as unmerged importers once wrote) is no flag.
namespace form_of_slot {
constexpr uint32_t only_references = 0;  // the flag entry's rule count
constexpr uint32_t with_definitions = 1;
}  // namespace form_of_slot
