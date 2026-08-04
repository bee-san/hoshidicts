#pragma once

#include <string>
#include <vector>

struct ImportResult {
  bool success = false;
  std::string title;
  size_t term_count = 0;
  size_t meta_count = 0;
  size_t kanji_count = 0;
  size_t media_count = 0;
  int format_revision = 0;
  std::vector<std::string> types;
  std::string probe_term;
  std::string probe_kanji;
  std::string output_path;
  std::vector<std::string> errors;
};

namespace dictionary_importer {
ImportResult import(const std::string& zip_path, const std::string& output_dir, bool low_ram = false);
ImportResult import_to_path(
    const std::string& zip_path, const std::string& dictionary_path, bool low_ram = false);
};
