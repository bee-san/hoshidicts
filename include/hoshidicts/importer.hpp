#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

struct SummaryItemCount {
  size_t total = 0;
};

using SummaryMetaCount = std::map<std::string, size_t>;

struct SummaryCounts {
  SummaryItemCount terms;
  SummaryMetaCount termMeta;
  SummaryItemCount kanji;
  SummaryMetaCount kanjiMeta;
  SummaryItemCount tagMeta;
  SummaryItemCount media;
};

// One tag_bank_*.json row: a tag's category, sort order, notes and score.
struct SummaryTag {
  std::string name;
  std::string category;
  double order = 0;
  std::string notes;
  double score = 0;
};

struct Summary {
  std::string title;
  std::string revision;
  bool sequenced = false;
  std::optional<std::string> minimumYomitanVersion;
  int version = 3;
  uint64_t importDate = 0;
  bool prefixWildcardsSupported = false;
  SummaryCounts counts;
  std::string styles;
  // Every tag-bank row, in bank order. Like the styles, they travel in the
  // imported index.json.
  std::vector<SummaryTag> tags;
  std::optional<bool> isUpdatable;
  std::optional<std::string> indexUrl;
  std::optional<std::string> downloadUrl;
  std::optional<std::string> author;
  std::optional<std::string> url;
  std::optional<std::string> description;
  std::optional<std::string> attribution;
  std::optional<std::string> sourceLanguage;
  std::optional<std::string> targetLanguage;
  std::optional<std::string> frequencyMode;
  std::optional<bool> importSuccess;
};

// What a successful import left out. Only an MDX source reports any; a
// Yomitan archive's counts stay zero. Not part of Summary, which is the
// package's index.json: these describe this import run.
struct ImportWarnings {
  // Definition records whose record block could not be read.
  size_t skippedRecords = 0;
  // @@@LINK= aliases that reach no entry of the dictionary.
  size_t unresolvedRedirects = 0;
  // Distinct resource paths the glossaries or stylesheets refer to that no MDD provides.
  size_t missingResources = 0;
  // Distinct MDD resources that exist but could not be read.
  size_t unreadableResources = 0;
};

struct ImportResult {
  bool success = false;
  std::string title;
  Summary summary;
  std::string error;
  ImportWarnings warnings;
};

namespace dictionary_importer {
// Imports into output_dir / folder_name(title).
ImportResult import(const std::string& source_path, const std::string& output_dir, bool low_ram = false);

// The directory an imported dictionary is written to. A Yomitan title is any
// string ("Nico/Pixiv", "TheKanjiMap Kanji Radicals/Composition"), while a
// directory name is one path component. A title that already is one is used
// unchanged. Any other title has each '/', '\\', ':' and NUL replaced by '_'
// and " #" plus the 8 lowercase hex digits of the FNV-1a 32-bit hash of the
// title's UTF-8 bytes appended, so two such titles that differ only in those
// characters still get different directories. The title itself is kept in
// the dictionary's index.json, and that is the name a query reports.
std::string folder_name(std::string_view title);
};
