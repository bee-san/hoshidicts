#include "mdict_source.hpp"

#include <algorithm>
#include <cctype>
#include <format>
#include <utility>

#include "../path_utils.hpp"

namespace mdict {
namespace {
constexpr std::string_view link_prefix = "@@@LINK=";
constexpr std::string_view placeholder_title = "Title (No HTML code allowed)";

std::string_view trim_nul_and_space(std::string_view s) {
  while (!s.empty() && (s.back() == '\0' || std::isspace(static_cast<unsigned char>(s.back())))) {
    s.remove_suffix(1);
  }
  while (!s.empty() && (s.front() == '\0' || std::isspace(static_cast<unsigned char>(s.front())))) {
    s.remove_prefix(1);
  }
  return s;
}

std::string lower(std::string_view s) {
  std::string out(s);
  for (auto& c : out) {
    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  }
  return out;
}

std::string strip_tags(std::string_view s) {
  std::string out;
  bool in_tag = false;
  for (char c : s) {
    if (c == '<') {
      in_tag = true;
    } else if (c == '>') {
      in_tag = false;
    } else if (!in_tag) {
      out += c;
    }
  }
  return out;
}

// The title becomes the output directory name, so it must be a single plain
// path component.
std::string sanitize_title(std::string_view raw, const std::string& fallback) {
  std::string title(trim_nul_and_space(strip_tags(raw)));
  title = std::string(trim_nul_and_space(title));
  if (title.empty() || title == placeholder_title) {
    title = fallback;
  }
  for (auto& c : title) {
    if (c == '/' || c == '\\' || c == '\0') {
      c = '_';
    }
  }
  if (title.empty() || title == "." || title == "..") {
    title = "mdx-dictionary";
  }
  return title;
}

// MDD keys are file paths written by the dictionary author. Backslashes become
// slashes and leading slashes go; a key that tries to leave its root, names a
// drive or embeds a NUL is dropped rather than repaired.
std::optional<std::string> normalize_mdd_key(std::string_view raw) {
  std::string key(raw);
  if (key.find('\0') != std::string::npos) {
    return std::nullopt;
  }
  std::replace(key.begin(), key.end(), '\\', '/');
  size_t start = 0;
  while (start < key.size() && key[start] == '/') {
    start++;
  }
  key.erase(0, start);
  if (key.empty()) {
    return std::nullopt;
  }
  if (key.size() >= 2 && std::isalpha(static_cast<unsigned char>(key[0])) && key[1] == ':') {
    return std::nullopt;
  }
  size_t pos = 0;
  while (pos <= key.size()) {
    const size_t end = key.find('/', pos);
    const std::string_view part =
        std::string_view(key).substr(pos, end == std::string::npos ? std::string::npos : end - pos);
    if (part == "..") {
      return std::nullopt;
    }
    if (end == std::string::npos) {
      break;
    }
    pos = end + 1;
  }
  return key;
}

// Stylesheet bytes from an MDD are UTF-8 or UTF-16 with or without a BOM.
std::optional<std::string> decode_stylesheet(const std::vector<char>& bytes) {
  const auto* data = reinterpret_cast<const uint8_t*>(bytes.data());
  const size_t size = bytes.size();
  std::string text;
  if (size >= 2 && data[0] == 0xff && data[1] == 0xfe) {
    text = utf16le_to_utf8(data + 2, size - 2);
  } else if (size >= 2 && data[0] == 0xfe && data[1] == 0xff) {
    std::vector<uint8_t> swapped(data + 2, data + size);
    for (size_t i = 0; i + 1 < swapped.size(); i += 2) {
      std::swap(swapped[i], swapped[i + 1]);
    }
    text = utf16le_to_utf8(swapped.data(), swapped.size());
  } else if (size >= 3 && data[0] == 0xef && data[1] == 0xbb && data[2] == 0xbf) {
    text.assign(bytes.begin() + 3, bytes.end());
  } else if (std::find(bytes.begin(), bytes.end(), '\0') != bytes.end()) {
    // No BOM: a stylesheet never contains NUL, so any NUL means UTF-16LE.
    text = utf16le_to_utf8(data, size);
  } else {
    text.assign(bytes.begin(), bytes.end());
  }
  text = std::string(trim_nul_and_space(text));
  if (text.empty() || text.find('\0') != std::string::npos) {
    return std::nullopt;
  }
  return text;
}

bool starts_with_link(std::string_view record, Encoding encoding) {
  if (encoding == Encoding::Utf8) {
    return record.starts_with(link_prefix);
  }
  if (record.size() < link_prefix.size() * 2) {
    return false;
  }
  for (size_t i = 0; i < link_prefix.size(); ++i) {
    if (record[2 * i] != link_prefix[i] || record[2 * i + 1] != '\0') {
      return false;
    }
  }
  return true;
}

// Reads consecutive records with one decompressed block in hand.
class RecordCursor {
 public:
  explicit RecordCursor(const Reader& reader) : reader_(reader) {}

  std::string_view record(uint64_t offset, uint64_t next_offset) {
    const size_t block = reader_.record_block_for(offset);
    if (!have_ || block != block_index_) {
      block_ = reader_.read_record_block(block);
      block_index_ = block;
      have_ = true;
    }
    return reader_.record_in_block(block_, block_index_, offset, next_offset);
  }

 private:
  const Reader& reader_;
  std::vector<uint8_t> block_;
  size_t block_index_ = 0;
  bool have_ = false;
};
}

void MdictSource::open(const std::filesystem::path& mdx_path, std::string fallback_title) {
  mdx_.open(mdx_path);
  if (mdx_.header().kind == Kind::Mdd) {
    throw Error("this is an MDD resource file; import the .mdx dictionary next to it instead");
  }
  title_ = sanitize_title(mdx_.header().title, fallback_title);

  keys_ = mdx_.read_all_keys();
  for (auto& entry : keys_) {
    entry.key = std::string(trim_nul_and_space(entry.key));
  }
  index_redirects();
  if (terms_.empty()) {
    if (redirect_count_ > 0) {
      throw Error("MDX has no usable entries: every entry is a redirect whose target is missing");
    }
    throw Error("MDX has no usable entries");
  }
  discover_mdds(mdx_path);

  bank_count_ = (terms_.size() + bank_size - 1) / bank_size;
  entries_.push_back(SourceEntry{"index.json", build_index_json().size()});
  for (size_t bank = 0; bank < bank_count_; ++bank) {
    uint64_t bytes = 0;
    const size_t begin = bank * bank_size;
    const size_t end = std::min(terms_.size(), begin + bank_size);
    for (size_t i = begin; i < end; ++i) {
      const uint32_t key = terms_[i];
      const uint64_t next = key + 1 < keys_.size() ? keys_[key + 1].record_offset : mdx_.record_space_size();
      bytes += next > keys_[key].record_offset ? next - keys_[key].record_offset : 0;
    }
    // Structured content is a few times the size of the HTML it came from;
    // the importer only uses this to pace how many banks are in flight.
    const bool html = lower(mdx_.header().format) != "text";
    entries_.push_back(SourceEntry{std::format("term_bank_{}.json", bank + 1), html ? bytes * 3 : bytes});
  }
}

void MdictSource::index_redirects() {
  RecordCursor cursor(mdx_);
  const Encoding encoding = mdx_.header().encoding;
  terms_.reserve(keys_.size());
  for (size_t i = 0; i < keys_.size(); ++i) {
    const KeyEntry& entry = keys_[i];
    if (entry.key.empty()) {
      continue;
    }
    const uint64_t next = i + 1 < keys_.size() ? keys_[i + 1].record_offset : mdx_.record_space_size();
    const std::string_view record = cursor.record(entry.record_offset, next);
    if (!starts_with_link(record, encoding)) {
      terms_.push_back(static_cast<uint32_t>(i));
      continue;
    }
    const std::string text = mdx_.record_text(record);
    const std::string target(trim_nul_and_space(std::string_view(text).substr(link_prefix.size())));
    if (target.empty() || target == entry.key) {
      continue;
    }
    auto& aliases = redirects_[target];
    if (std::find(aliases.begin(), aliases.end(), entry.key) == aliases.end()) {
      aliases.push_back(entry.key);
      redirect_count_++;
    }
  }
}

// `base` + `suffix`, matched exactly first and then ignoring case, so
// Dict.MDD next to Dict.mdx is found on a case-sensitive file system.
std::optional<std::filesystem::path> find_sibling(const std::filesystem::path& base, const std::string& suffix) {
  const std::filesystem::path exact = std::filesystem::path(base).concat(suffix);
  std::error_code ec;
  if (std::filesystem::is_regular_file(exact, ec)) {
    return exact;
  }
  const std::string wanted = lower(path_utils::to_utf8(exact.filename()));
  const std::filesystem::path dir = exact.parent_path().empty() ? "." : exact.parent_path();
  for (const auto& entry : std::filesystem::directory_iterator(dir, ec)) {
    if (entry.is_regular_file(ec) && lower(path_utils::to_utf8(entry.path().filename())) == wanted) {
      return entry.path();
    }
  }
  return std::nullopt;
}

void MdictSource::discover_mdds(const std::filesystem::path& mdx_path) {
  std::vector<std::filesystem::path> candidates;
  std::filesystem::path base = mdx_path;
  base.replace_extension();
  if (auto plain = find_sibling(base, ".mdd")) {
    candidates.push_back(*plain);
  }
  for (int n = 1;; ++n) {
    auto numbered = find_sibling(base, std::format(".{}.mdd", n));
    if (!numbered) {
      break;
    }
    candidates.push_back(*numbered);
  }

  for (const auto& path : candidates) {
    Mdd mdd;
    mdd.reader = std::make_unique<Reader>();
    try {
      mdd.reader->open(path);
    } catch (const Error& e) {
      throw Error(std::format("{}: {}", path_utils::to_utf8(path.filename()), e.what()));
    }
    if (mdd.reader->header().kind != Kind::Mdd) {
      throw Error(std::format("{}: not an MDD resource file", path_utils::to_utf8(path.filename())));
    }
    mdd.keys = mdd.reader->read_all_keys();
    const size_t mdd_index = mdds_.size();
    for (size_t k = 0; k < mdd.keys.size(); ++k) {
      auto key = normalize_mdd_key(mdd.keys[k].key);
      if (!key) {
        continue;
      }
      const MddAsset asset{mdd_index, k};
      if (!assets_.try_emplace(*key, asset).second) {
        continue;
      }
      assets_lowercase_.try_emplace(lower(*key), asset);
      if (lower(*key).ends_with(".css")) {
        css_keys_.push_back(*key);
      }
    }
    mdds_.push_back(std::move(mdd));
    mdd_paths_.push_back(path);
  }
  std::sort(css_keys_.begin(), css_keys_.end());
}

std::string MdictSource::build_index_json() const {
  const std::string description(trim_nul_and_space(mdx_.header().description));
  return std::format(R"({{"title":{},"revision":"mdx import","sequenced":true,"format":3,"description":{}}})",
                     json_quote(title_), json_quote(description));
}

int MdictSource::find(std::string_view name) const {
  for (size_t i = 0; i < entries_.size(); ++i) {
    if (entries_[i].name == name) {
      return static_cast<int>(i);
    }
  }
  return -1;
}

std::string MdictSource::read(int index) const {
  if (index < 0 || static_cast<size_t>(index) >= entries_.size()) {
    return {};
  }
  if (index == 0) {
    return build_index_json();
  }
  if (static_cast<size_t>(index) <= bank_count_) {
    const size_t bank = static_cast<size_t>(index) - 1;
    {
      std::lock_guard lock(mutex_);
      if (bank_cache_ && bank_cache_->first == bank) {
        std::string json = std::move(bank_cache_->second);
        bank_cache_.reset();
        return json;
      }
    }
    std::string json = build_bank(bank);
    if (bank == 0) {
      // The importer reads the first bank twice (zstd trainer, then the
      // import proper); keep it for the second read.
      std::lock_guard lock(mutex_);
      bank_cache_ = std::make_pair(bank, json);
    }
    return json;
  }
  if (index == styles_index_) {
    return styles_;
  }
  return {};
}

std::string MdictSource::build_bank(size_t bank) const {
  const Header& header = mdx_.header();
  const bool text_format = lower(header.format) == "text";
  ConvertOptions options;
  options.asset_prefix = std::string(asset_prefix);
  options.enable_audio = false;

  RecordCursor cursor(mdx_);
  std::string json = "[";
  const size_t begin = bank * bank_size;
  const size_t end = std::min(terms_.size(), begin + bank_size);
  std::vector<std::pair<std::string, std::string>> stylesheets;
  std::vector<EmbeddedAsset> embedded;
  std::vector<std::string> references;
  for (size_t i = begin; i < end; ++i) {
    const uint32_t key = terms_[i];
    const KeyEntry& entry = keys_[key];
    const uint64_t next = key + 1 < keys_.size() ? keys_[key + 1].record_offset : mdx_.record_space_size();
    const std::string text = mdx_.record_text(cursor.record(entry.record_offset, next));
    const std::string_view definition = trim_nul_and_space(text);

    std::string glossary;
    if (text_format) {
      glossary = json_quote(definition);
    } else {
      const std::string html = apply_stylesheet(definition, header.stylesheet);
      ConvertResult converted = convert_html(html, options);
      glossary = std::move(converted.glossary_json);
      for (auto& [name, css] : converted.inline_stylesheets) {
        stylesheets.emplace_back(std::format("{:08}/{}/{}", i, entry.key, name), std::move(css));
      }
      for (auto& asset : converted.embedded_assets) {
        embedded.push_back(std::move(asset));
      }
      for (auto& reference : converted.asset_references) {
        references.push_back(std::move(reference));
      }
    }

    std::vector<std::string_view> expressions{entry.key};
    if (auto aliases = redirects_.find(entry.key); aliases != redirects_.end()) {
      for (const std::string& alias : aliases->second) {
        if (std::find(expressions.begin(), expressions.end(), alias) == expressions.end()) {
          expressions.push_back(alias);
        }
      }
    }
    for (std::string_view expression : expressions) {
      if (json.size() > 1) {
        json += ',';
      }
      json += '[';
      json += json_quote(expression);
      json += R"(,"","","",0,[)";
      json += glossary;
      json += "],";
      json += std::to_string(i);
      json += R"(,""])";
    }
  }
  json += ']';

  if (!stylesheets.empty() || !embedded.empty() || !references.empty()) {
    std::lock_guard lock(mutex_);
    for (auto& [name, css] : stylesheets) {
      if (inline_stylesheet_names_.insert(name).second) {
        inline_stylesheets_.emplace_back(std::move(name), std::move(css));
      }
    }
    for (auto& asset : embedded) {
      if (embedded_asset_paths_.insert(asset.path).second) {
        embedded_assets_.push_back(std::move(asset));
      }
    }
    for (auto& reference : references) {
      asset_references_.insert(std::move(reference));
    }
  }
  return json;
}

const MdictSource::MddAsset* MdictSource::find_asset(const std::string& key) const {
  if (auto it = assets_.find(key); it != assets_.end()) {
    return &it->second;
  }
  if (auto it = assets_lowercase_.find(lower(key)); it != assets_lowercase_.end()) {
    return &it->second;
  }
  return nullptr;
}

std::vector<char> MdictSource::asset_bytes(const MddAsset& asset) const {
  const Mdd& mdd = mdds_[asset.mdd];
  const KeyEntry& entry = mdd.keys[asset.key];
  const uint64_t next = asset.key + 1 < mdd.keys.size() ? mdd.keys[asset.key + 1].record_offset
                                                        : mdd.reader->record_space_size();
  const size_t block_index = mdd.reader->record_block_for(entry.record_offset);
  const std::vector<uint8_t> block = mdd.reader->read_record_block(block_index);
  const std::string_view record = mdd.reader->record_in_block(block, block_index, entry.record_offset, next);
  return std::vector<char>(record.begin(), record.end());
}

std::string MdictSource::build_styles() const {
  std::vector<std::string> sections;
  std::vector<std::string> references;
  for (const std::string& key : css_keys_) {
    const MddAsset* asset = find_asset(key);
    if (!asset) {
      continue;
    }
    auto css = decode_stylesheet(asset_bytes(*asset));
    if (!css) {
      continue;
    }
    sections.push_back(std::format("/* Source: {} */\n{}", key,
                                   rewrite_css_asset_urls(*css, asset_prefix, key, references)));
  }
  // Inline blocks were collected from several threads; their names start with
  // the term's sequence so the order is the dictionary's, not the threads'.
  std::vector<std::pair<std::string, std::string>> inline_sheets;
  {
    std::lock_guard lock(mutex_);
    inline_sheets = inline_stylesheets_;
  }
  std::sort(inline_sheets.begin(), inline_sheets.end());
  for (const auto& [name, css] : inline_sheets) {
    const std::string_view display = std::string_view(name).substr(name.find('/') + 1);
    sections.push_back(std::format("/* Source: {} */\n{}", display,
                                   rewrite_css_asset_urls(css, asset_prefix, {}, references)));
  }
  {
    std::lock_guard lock(mutex_);
    for (auto& reference : references) {
      asset_references_.insert(std::move(reference));
    }
  }
  if (sections.empty()) {
    return {};
  }
  std::string out;
  for (size_t i = 0; i < sections.size(); ++i) {
    if (i) {
      out += "\n\n";
    }
    out += sections[i];
  }
  out += '\n';
  return out;
}

void MdictSource::finish_banks() {
  if (banks_finished_) {
    return;
  }
  banks_finished_ = true;
  styles_ = build_styles();
  if (!styles_.empty()) {
    styles_index_ = static_cast<int>(entries_.size());
    entries_.push_back(SourceEntry{"styles.css", styles_.size()});
  }

  std::set<std::string> added;
  auto add_asset = [&](const std::string& key) {
    const MddAsset* asset = find_asset(key);
    // media.bin stores the path length in 16 bits.
    if (!asset || asset_prefix.size() + key.size() > 0xffff || !added.insert(key).second) {
      return;
    }
    const Mdd& mdd = mdds_[asset->mdd];
    const KeyEntry& entry = mdd.keys[asset->key];
    const uint64_t next = asset->key + 1 < mdd.keys.size() ? mdd.keys[asset->key + 1].record_offset
                                                           : mdd.reader->record_space_size();
    media_.push_back(MediaEntry{*asset, std::nullopt});
    entries_.push_back(SourceEntry{std::string(asset_prefix) + key, next - entry.record_offset});
  };
  // Every stylesheet asset, then whatever the glossaries and stylesheets refer to.
  for (const std::string& key : css_keys_) {
    add_asset(key);
  }
  std::set<std::string> references;
  std::vector<EmbeddedAsset> embedded;
  {
    std::lock_guard lock(mutex_);
    references = asset_references_;
    embedded = embedded_assets_;
  }
  for (const std::string& key : references) {
    if (lower(key).ends_with(".css")) {
      continue;
    }
    add_asset(key);
  }
  std::sort(embedded.begin(), embedded.end(),
            [](const EmbeddedAsset& a, const EmbeddedAsset& b) { return a.path < b.path; });
  for (size_t i = 0; i < embedded.size(); ++i) {
    if (embedded[i].path.size() > 0xffff) {
      continue;
    }
    media_.push_back(MediaEntry{std::nullopt, i});
    entries_.push_back(SourceEntry{embedded[i].path, embedded[i].data.size()});
  }
  {
    std::lock_guard lock(mutex_);
    embedded_assets_ = std::move(embedded);
  }
}

std::optional<SourceMediaFile> MdictSource::read_media(int index) const {
  const size_t first_media = entries_.size() - media_.size();
  if (index < 0 || static_cast<size_t>(index) < first_media || static_cast<size_t>(index) >= entries_.size()) {
    return std::nullopt;
  }
  const MediaEntry& media = media_[static_cast<size_t>(index) - first_media];
  SourceMediaFile out;
  out.path = entries_[static_cast<size_t>(index)].name;
  if (media.asset) {
    try {
      out.blob = asset_bytes(*media.asset);
    } catch (const Error&) {
      // A corrupt block loses this asset, not the whole dictionary.
      return std::nullopt;
    }
  } else {
    std::lock_guard lock(mutex_);
    const auto& data = embedded_assets_[*media.embedded].data;
    out.blob.assign(data.begin(), data.end());
  }
  return out;
}
}
