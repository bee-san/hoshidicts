#pragma once

#include <cstdint>
#include <filesystem>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <set>
#include <string>
#include <string_view>
#include <vector>

#include "../source/dictionary_source.hpp"
#include "html_to_structured.hpp"
#include "mdict_reader.hpp"

// An MDX dictionary (plus its sibling MDD resource files) presented to the
// importer as a Yomitan dictionary: index.json, term_bank_N.json, styles.css
// and mdict-media/... entries. Nothing is written to disk; each bank is
// produced from the MDX record blocks when the importer asks for it.
//
// Opening reads the key index and makes one pass over the record blocks to
// find @@@LINK= redirects (an alias is emitted as an extra headword of its
// target, one hop, missing targets dropped). Banks are then materialised per
// read(): bank N holds terms [N*10000, (N+1)*10000) of the non-redirect
// entries in file order, each as [expression, "", "", "", 0, [glossary],
// sequence, ""], glossary being structured content converted from the HTML
// (or a plain string for Format=Text).
//
// Media is discovered while the banks convert (which MDD assets the glossaries
// reference, plus data: URLs), so the media entries and the final styles.css
// (MDD *.css plus inline <style> blocks) exist only after finish_banks().
//
// Errors are mdict::Error with a specific message; a file whose header parses
// as an MDD is rejected with a hint to import the .mdx instead.
namespace mdict {
class MdictSource final : public DictionarySource {
 public:
  static constexpr size_t bank_size = 10000;
  static constexpr std::string_view asset_prefix = "mdict-media/";

  // `fallback_title` is used when the header has no usable Title (typically
  // the file's stem).
  void open(const std::filesystem::path& mdx_path, std::string fallback_title);

  const std::vector<SourceEntry>& entries() const override { return entries_; }
  int find(std::string_view name) const override;
  std::string read(int index) const override;
  std::optional<SourceMediaFile> read_media(int index) const override;
  void finish_banks() override;

  const Header& header() const { return mdx_.header(); }
  const std::string& title() const { return title_; }
  size_t term_count() const { return terms_.size(); }
  size_t redirect_count() const { return redirect_count_; }
  const std::vector<std::filesystem::path>& mdd_paths() const { return mdd_paths_; }

 private:
  struct MddAsset {
    size_t mdd = 0;
    size_t key = 0;
  };
  struct Mdd {
    std::unique_ptr<Reader> reader;
    std::vector<KeyEntry> keys;
  };
  struct MediaEntry {
    // Exactly one of the two is set.
    std::optional<MddAsset> asset;
    std::optional<size_t> embedded;
  };

  void discover_mdds(const std::filesystem::path& mdx_path);
  void index_redirects();
  std::string build_index_json() const;
  std::string build_bank(size_t bank) const;
  std::string build_styles() const;
  const MddAsset* find_asset(const std::string& key) const;
  std::vector<char> asset_bytes(const MddAsset& asset) const;

  Reader mdx_;
  std::vector<std::filesystem::path> mdd_paths_;
  std::vector<Mdd> mdds_;
  std::map<std::string, MddAsset> assets_;
  std::map<std::string, MddAsset> assets_lowercase_;
  std::vector<std::string> css_keys_;

  std::string title_;
  std::vector<KeyEntry> keys_;
  // Indices into keys_ of the entries that become terms, in file order.
  std::vector<uint32_t> terms_;
  std::map<std::string, std::vector<std::string>> redirects_;
  size_t redirect_count_ = 0;

  std::vector<SourceEntry> entries_;
  size_t bank_count_ = 0;
  int styles_index_ = -1;
  std::string styles_;
  std::vector<MediaEntry> media_;
  bool banks_finished_ = false;

  // Collected while banks convert, from several threads.
  mutable std::mutex mutex_;
  mutable std::vector<std::pair<std::string, std::string>> inline_stylesheets_;
  mutable std::set<std::string> inline_stylesheet_names_;
  mutable std::vector<EmbeddedAsset> embedded_assets_;
  mutable std::set<std::string> embedded_asset_paths_;
  mutable std::set<std::string> asset_references_;
  mutable std::optional<std::pair<size_t, std::string>> bank_cache_;
};
}
