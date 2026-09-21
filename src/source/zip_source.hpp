#pragma once

#include <filesystem>
#include <string>
#include <vector>

#include "../zip/zip.hpp"
#include "dictionary_source.hpp"

// A Yomitan dictionary archive. Wraps Zip without changing how it is parsed
// or read; the entry list is a copy of the archive's central directory names
// and sizes in archive order, so indices are shared with the Zip.
class ZipSource final : public DictionarySource {
 public:
  // False when the archive cannot be mapped or parsed; error() then names the
  // reason when the parser had one.
  bool open(const std::filesystem::path& path);
  const std::string& error() const { return zip_.error; }

  const std::vector<SourceEntry>& entries() const override { return entries_; }
  int find(std::string_view name) const override;
  std::string read(int index) const override;
  std::optional<SourceMediaFile> read_media(int index) const override;

 private:
  Zip zip_;
  std::vector<SourceEntry> entries_;
};
