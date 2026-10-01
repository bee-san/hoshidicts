#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <string>
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
ImportResult import(const std::string& source_path, const std::string& output_dir, bool low_ram = false);
};
