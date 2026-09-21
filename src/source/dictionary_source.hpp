#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>

// One file of a dictionary source as the importer sees it: a name in the
// Yomitan layout (index.json, styles.css, term_bank_N.json, media paths) and
// the size of its contents, which the importer uses to schedule work.
struct SourceEntry {
  std::string name;
  uint64_t uncompressed_size = 0;
};

struct SourceMediaFile {
  std::string path;
  std::vector<char> blob;
};

// The importer's whole view of a dictionary. A source is opened once and then
// read concurrently from the import workers, so read() and read_media() must be
// safe to call from several threads at the same time on a const source.
//
// ZipSource is the Yomitan archive; other formats (MDX) present themselves as
// the same virtual file list so everything past this seam stays format-agnostic.
class DictionarySource {
 public:
  virtual ~DictionarySource() = default;

  virtual const std::vector<SourceEntry>& entries() const = 0;

  // Index of the entry called `name`, or -1.
  virtual int find(std::string_view name) const = 0;

  // The contents of a text entry, empty when it cannot be read.
  virtual std::string read(int index) const = 0;

  // The contents of a media entry together with the path it is stored under,
  // or nullopt when it cannot be read.
  virtual std::optional<SourceMediaFile> read_media(int index) const = 0;
};
