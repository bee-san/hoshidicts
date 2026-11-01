// Language packs (docs/languages.md, sections 2, 9 and 10.1).
#pragma once

#include <memory>
#include <string>
#include <string_view>
#include <vector>

namespace hoshidicts {

namespace lang {
struct PackData;
}

// A parsed, immutable pack: processors, deinflector, scanning data.
class LanguagePack {
 public:
  explicit LanguagePack(std::unique_ptr<lang::PackData> data);
  ~LanguagePack();
  LanguagePack(const LanguagePack&) = delete;
  LanguagePack& operator=(const LanguagePack&) = delete;

  const std::string& code() const;
  // The English name (language.json `name`).
  const std::string& name() const;
  // The engine's view of the pack (src/languages/pack.hpp).
  const lang::PackData& data() const { return *data_; }

 private:
  std::unique_ptr<lang::PackData> data_;
};

// Parses one pack without adding it anywhere. Returns null and sets `error`
// (pack code, file, JSON path and reason) on any problem.
std::shared_ptr<const LanguagePack> parse_language_pack(std::string_view language_json,
                                                        std::string_view transforms_json, std::string* error);

class LanguageRegistry {
 public:
  // An empty registry.
  LanguageRegistry();
  // A registry holding the packs built into the library (Japanese).
  static LanguageRegistry with_builtin();
  // Parses one pack. transforms_json may be empty when the pack has none.
  // A pack with the same code replaces the previous one. add() must not run
  // while lookups use the registry; a host that adds packs while it serves
  // lookups serialises them (Hachidori does). Returns false and sets `error`
  // (pack code, file, JSON path and reason) on any problem.
  bool add(std::string_view language_json, std::string_view transforms_json, std::string* error);
  // Adds a parsed pack, replacing one with the same code.
  void add(std::shared_ptr<const LanguagePack> pack);
  // Loads every `<dir>/<code>/language.json` whose directory name does not
  // start with '_', and the transforms file each names. Packs that parse are
  // added even when another fails; returns false and sets `error` (one line
  // per failed pack) when any fails.
  bool add_directory(const std::string& languages_dir, std::string* error);
  std::shared_ptr<const LanguagePack> find(std::string_view code) const;
  // The codes of the loaded packs, sorted.
  std::vector<std::string> codes() const;

 private:
  std::vector<std::shared_ptr<const LanguagePack>> packs_;
};

// The built-in pack with this code (only "ja"), parsed once from the copy
// embedded in the library; null for any other code.
std::shared_ptr<const LanguagePack> builtin_language_pack(std::string_view code);

}  // namespace hoshidicts
