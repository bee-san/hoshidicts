#include "mdict_source.hpp"

#include <utf8.h>
#include <utf8proc.h>

#if HOSHIDICTS_ICONV
#include <iconv.h>

#include <cerrno>
#endif

#include <algorithm>
#include <array>
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

// ------------------------------------------------------------ stylesheets
// An MDD stylesheet is decoded as manabitan's decodeStylesheetAsset does
// (mdx-converter.js at e433f8c): by its BOM, else by a leading ASCII
// `@charset "label";`, else as UTF-8, else as BOM-less UTF-16; and then,
// unlike manabitan, as Shift_JIS. styles.css is one UTF-8 sheet, so the
// source's @charset rule is removed. A sheet that does not decode cleanly, or
// names a charset not listed here, is skipped.

bool is_css_space(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f'; }

// The length of a `@charset "label";` rule at the start of `text` (manabitan:
// /^@charset[\t\n\f\r ]+"([^"\r\n]+)"[\t\n\f\r ]*;/i), or 0. Sets `label`.
size_t charset_rule(std::string_view text, std::string_view& label) {
  constexpr std::string_view keyword = "@charset";
  if (text.size() <= keyword.size() || lower(text.substr(0, keyword.size())) != keyword ||
      !is_css_space(text[keyword.size()])) {
    return 0;
  }
  size_t i = keyword.size();
  while (i < text.size() && is_css_space(text[i])) {
    i++;
  }
  if (i == text.size() || text[i] != '"') {
    return 0;
  }
  const size_t start = ++i;
  while (i < text.size() && text[i] != '"' && text[i] != '\r' && text[i] != '\n') {
    i++;
  }
  if (i == start || i == text.size() || text[i] != '"') {
    return 0;
  }
  label = text.substr(start, i - start);
  i++;
  while (i < text.size() && is_css_space(text[i])) {
    i++;
  }
  return i < text.size() && text[i] == ';' ? i + 1 : 0;
}

// The label of a `@charset` rule in the ASCII bytes the sheet starts with, up
// to the first `;` and at most 128 bytes.
std::optional<std::string_view> declared_charset(std::string_view bytes) {
  size_t end = 0;
  while (end < std::min<size_t>(bytes.size(), 128) && static_cast<unsigned char>(bytes[end]) < 0x80) {
    if (bytes[end++] == ';') {
      break;
    }
  }
  std::string_view label;
  if (charset_rule(bytes.substr(0, end), label) == 0) {
    return std::nullopt;
  }
  return label;
}

// The WHATWG labels (https://encoding.spec.whatwg.org/#names-and-labels) of
// the encodings a sheet may declare, each with the iconv names that decode
// it, tried in order. No iconv name: UTF-8.
struct Charset {
  const char* name = nullptr;
  const char* fallback = nullptr;
};
const std::map<std::string_view, Charset> charset_labels = [] {
  std::map<std::string_view, Charset> labels;
  auto add = [&labels](Charset charset, std::initializer_list<std::string_view> names) {
    for (std::string_view name : names) {
      labels.emplace(name, charset);
    }
  };
  add({}, {"unicode-1-1-utf-8", "unicode11utf8", "unicode20utf8", "utf-8", "utf8", "x-unicode20utf8"});
  // A UTF-16 label in an ASCII @charset rule means UTF-8 (CSS Syntax,
  // "determine the fallback encoding").
  add({}, {"unicodefffe", "utf-16be", "csunicode", "iso-10646-ucs-2", "ucs-2", "unicode", "unicodefeff", "utf-16",
           "utf-16le"});
  // WHATWG's Shift_JIS is Microsoft's windows-31j. iconv's CP932 reads 0x5C
  // as the backslash CSS escapes need; glibc's SHIFT_JIS reads a yen sign.
  add({"CP932", "SHIFT_JIS"},
      {"csshiftjis", "ms932", "ms_kanji", "shift-jis", "shift_jis", "sjis", "windows-31j", "x-sjis"});
  add({"EUC-JP"}, {"cseucpkdfmtjapanese", "euc-jp", "x-euc-jp"});
  // WHATWG decodes gbk with the gb18030 decoder.
  add({"GB18030"}, {"chinese", "csgb2312", "csiso58gb231280", "gb2312", "gb_2312", "gb_2312-80", "gbk", "iso-ir-58",
                    "x-gbk", "gb18030"});
  add({"BIG5-HKSCS", "BIG5"}, {"big5", "big5-hkscs", "cn-big5", "csbig5", "x-x-big5"});
  // WHATWG's euc-kr is windows-949 (Unified Hangul Code).
  add({"CP949", "EUC-KR"}, {"cseuckr", "csksc56011987", "euc-kr", "iso-ir-149", "korean", "ks_c_5601-1987",
                            "ks_c_5601-1989", "ksc5601", "ksc_5601", "windows-949"});
  // WHATWG decodes ascii, latin1 and iso-8859-1 as windows-1252.
  add({"WINDOWS-1252", "CP1252"},
      {"ansi_x3.4-1968", "ascii", "cp1252", "cp819", "csisolatin1", "ibm819", "iso-8859-1", "iso-ir-100", "iso8859-1",
       "iso88591", "iso_8859-1", "iso_8859-1:1987", "l1", "latin1", "us-ascii", "windows-1252", "x-cp1252"});
  return labels;
}();

std::optional<std::string> utf8_text(std::string_view bytes) {
  if (!utf8::is_valid(bytes.begin(), bytes.end())) {
    return std::nullopt;
  }
  return std::string(bytes);
}

std::string utf16_text(std::string_view bytes, bool big_endian) {
  if (!big_endian) {
    return utf16le_to_utf8(reinterpret_cast<const uint8_t*>(bytes.data()), bytes.size());
  }
  std::string swapped(bytes);
  for (size_t i = 0; i + 1 < swapped.size(); i += 2) {
    std::swap(swapped[i], swapped[i + 1]);
  }
  return utf16le_to_utf8(reinterpret_cast<const uint8_t*>(swapped.data()), swapped.size());
}

// Strict conversion: any byte sequence the charset does not define fails it.
std::optional<std::string> iconv_text(std::string_view bytes, const Charset& charset) {
#if HOSHIDICTS_ICONV
  const auto failed = reinterpret_cast<iconv_t>(-1);
  iconv_t cd = iconv_open("UTF-8", charset.name);
  if (cd == failed && charset.fallback) {
    cd = iconv_open("UTF-8", charset.fallback);
  }
  if (cd == failed) {
    return std::nullopt;
  }
  std::string out;
  char* in = const_cast<char*>(bytes.data());
  size_t in_left = bytes.size();
  bool ok = true;
  while (ok && in_left > 0) {
    std::array<char, 4096> buffer;
    char* next = buffer.data();
    size_t out_left = buffer.size();
    ok = iconv(cd, &in, &in_left, &next, &out_left) != static_cast<size_t>(-1) || errno == E2BIG;
    out.append(buffer.data(), buffer.size() - out_left);
  }
  iconv_close(cd);
  if (!ok) {
    return std::nullopt;
  }
  return out;
#else
  // Built without iconv(3): a legacy charset cannot be read.
  (void)bytes;
  (void)charset;
  return std::nullopt;
#endif
}

std::optional<std::string> declared_text(std::string_view bytes, std::string_view label) {
  while (!label.empty() && is_css_space(label.front())) {
    label.remove_prefix(1);
  }
  while (!label.empty() && is_css_space(label.back())) {
    label.remove_suffix(1);
  }
  const auto it = charset_labels.find(lower(label));
  if (it == charset_labels.end()) {
    return std::nullopt;
  }
  return it->second.name ? iconv_text(bytes, it->second) : utf8_text(bytes);
}

// BOM-less UTF-16: in the first 32 code units, at least a third (and two) have
// a NUL high byte and none a NUL low byte, or the reverse for big-endian
// (manabitan's getLikelyUtf16StylesheetEncoding).
std::optional<bool> utf16_big_endian(std::string_view bytes) {
  const size_t units = std::min<size_t>(bytes.size() / 2, 32);
  size_t even = 0;
  size_t odd = 0;
  for (size_t i = 0; i < units; ++i) {
    even += bytes[2 * i] == '\0' ? 1 : 0;
    odd += bytes[2 * i + 1] == '\0' ? 1 : 0;
  }
  const size_t threshold = std::max<size_t>(2, (units + 2) / 3);
  if (units >= 2 && odd >= threshold && even == 0) {
    return false;
  }
  if (units >= 2 && even >= threshold && odd == 0) {
    return true;
  }
  return std::nullopt;
}

std::optional<std::string> decode_stylesheet(const std::vector<char>& raw) {
  const std::string_view bytes(raw.data(), raw.size());
  std::optional<std::string> text;
  if (bytes.starts_with("\xef\xbb\xbf")) {
    text = utf8_text(bytes.substr(3));
  } else if (bytes.starts_with("\xff\xfe") || bytes.starts_with("\xfe\xff")) {
    text = utf16_text(bytes.substr(2), bytes[0] == '\xfe');
  } else if (const auto label = declared_charset(bytes)) {
    text = declared_text(bytes, *label);
  } else if (auto utf8 = utf8_text(bytes); utf8 && utf8->find('\0') == std::string::npos) {
    text = std::move(utf8);
  } else if (const auto big_endian = utf16_big_endian(bytes)) {
    text = utf16_text(bytes, *big_endian);
  } else {
    // Nothing names the encoding and it is not Unicode. Legacy Japanese
    // dictionaries save their sheets in Shift_JIS (hachidori#437), so read it
    // as that; strictly, so a sheet with bytes Shift_JIS does not define is
    // still skipped. manabitan skips every such sheet.
    text = declared_text(bytes, "shift_jis");
  }
  if (!text) {
    return std::nullopt;
  }
  std::string_view css = trim_nul_and_space(*text);
  std::string_view label;
  css = trim_nul_and_space(css.substr(charset_rule(css, label)));
  if (css.empty() || css.find('\0') != std::string_view::npos) {
    return std::nullopt;
  }
  return std::string(css);
}

// The characters MDict's StripKey removes from an MDX key (js-mdict
// REGEXP_STRIPKEY.mdx): ( ) . , - & 、 space ' / \ @ _ $ !
constexpr std::string_view strip_key_ascii = "().,-& '/\\@_$!";
constexpr std::string_view ideographic_comma = "\xe3\x80\x81";

// `key` as the header's key rules compare it: without the StripKey characters
// when StripKey is on, and lowercased (Unicode simple case mapping) unless
// KeyCaseSensitive is on. Bytes that are not UTF-8 are kept as they are.
std::string fold_key(std::string_view key, const Header& header) {
  std::string out;
  out.reserve(key.size());
  for (size_t i = 0; i < key.size();) {
    if (header.strip_key) {
      if (strip_key_ascii.find(key[i]) != std::string_view::npos) {
        i++;
        continue;
      }
      if (key.substr(i).starts_with(ideographic_comma)) {
        i += ideographic_comma.size();
        continue;
      }
    }
    const auto c = static_cast<unsigned char>(key[i]);
    if (header.key_case_sensitive || c < 0x80) {
      out += static_cast<char>(!header.key_case_sensitive && c >= 'A' && c <= 'Z' ? c + ('a' - 'A') : c);
      i++;
      continue;
    }
    utf8proc_int32_t cp = 0;
    const utf8proc_ssize_t length = utf8proc_iterate(reinterpret_cast<const utf8proc_uint8_t*>(key.data() + i),
                                                     static_cast<utf8proc_ssize_t>(key.size() - i), &cp);
    if (length <= 0) {
      out += key[i++];
      continue;
    }
    utf8proc_uint8_t lowered[4];
    out.append(reinterpret_cast<const char*>(lowered),
               static_cast<size_t>(utf8proc_encode_char(utf8proc_tolower(cp), lowered)));
    i += static_cast<size_t>(length);
  }
  return out;
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

// Reads consecutive records with one decompressed block in hand. A block that
// cannot be read fails each of its records without being decompressed again.
class RecordCursor {
 public:
  explicit RecordCursor(const Reader& reader) : reader_(reader) {}

  std::string_view record(uint64_t offset, uint64_t next_offset) {
    const size_t block = reader_.record_block_for(offset);
    if (failed_ == block) {
      throw Error(std::format("record block {} could not be read", block));
    }
    if (!have_ || block != block_index_) {
      try {
        block_ = reader_.read_record_block(block);
      } catch (const Error&) {
        failed_ = block;
        throw;
      }
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
  std::optional<size_t> failed_;
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
    if (skipped_record_count_ > 0) {
      throw Error(std::format("MDX has no usable entries: {} record{} could not be read ({})", skipped_record_count_,
                              skipped_record_count_ == 1 ? "" : "s", first_record_error_));
    }
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
    std::string_view record;
    try {
      record = cursor.record(entry.record_offset, next);
    } catch (const Error& e) {
      // A corrupt record block loses its entries, not the whole dictionary.
      if (skipped_record_count_++ == 0) {
        first_record_error_ = e.what();
      }
      continue;
    }
    if (!starts_with_link(record, encoding)) {
      terms_.push_back(static_cast<uint32_t>(i));
      continue;
    }
    const std::string text = mdx_.record_text(record);
    const std::string target(trim_nul_and_space(std::string_view(text).substr(link_prefix.size())));
    // A self redirect is kept: it resolves only when its key also has an entry.
    if (target.empty()) {
      continue;
    }
    auto& aliases = redirects_[target].aliases;
    if (std::find(aliases.begin(), aliases.end(), entry.key) == aliases.end()) {
      aliases.push_back(entry.key);
      redirect_count_++;
    }
  }
  if (redirects_.empty()) {
    return;
  }

  // A target spelled exactly like a key names that key alone, even when
  // other keys fold to the same spelling; only the remaining targets match
  // under the key rules (manabitan's getFallbackRedirectTargets).
  for (const KeyEntry& entry : keys_) {
    if (auto it = redirects_.find(entry.key); it != redirects_.end()) {
      it->second.exact = true;
    }
  }
  for (const auto& [target, redirect] : redirects_) {
    if (!redirect.exact) {
      auto& fallback = fallback_redirects_[fold_key(target, mdx_.header())];
      fallback.insert(fallback.end(), redirect.aliases.begin(), redirect.aliases.end());
    }
  }
  reached_targets_.assign(redirects_.size(), false);
  reached_fallbacks_.assign(fallback_redirects_.size(), false);
}

// `key` followed by every alias that reaches it, directly or through other
// aliases, each spelling once so that a cycle ends (manabitan's
// getRedirectExpressions). Appends the positions of the redirects_ and
// fallback_redirects_ entries it expanded to `reached`.
std::vector<std::string_view> MdictSource::expressions_of(std::string_view key, ReachedRedirects& reached) const {
  std::vector<std::string_view> expressions{key};
  auto add = [&expressions](const auto& aliases) {
    for (std::string_view alias : aliases) {
      if (std::find(expressions.begin(), expressions.end(), alias) == expressions.end()) {
        expressions.push_back(alias);
      }
    }
  };
  for (size_t i = 0; i < expressions.size(); ++i) {
    if (auto it = redirects_.find(expressions[i]); it != redirects_.end()) {
      reached.targets.push_back(static_cast<size_t>(it - redirects_.begin()));
      add(it->second.aliases);
    }
    if (!fallback_redirects_.empty()) {
      if (auto it = fallback_redirects_.find(fold_key(expressions[i], mdx_.header()));
          it != fallback_redirects_.end()) {
        reached.fallbacks.push_back(static_cast<size_t>(it - fallback_redirects_.begin()));
        add(it->second);
      }
    }
  }
  return expressions;
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
  ReachedRedirects reached;
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

    for (std::string_view expression : expressions_of(entry.key, reached)) {
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

  if (!stylesheets.empty() || !embedded.empty() || !references.empty() || !reached.targets.empty() ||
      !reached.fallbacks.empty()) {
    std::lock_guard lock(mutex_);
    for (size_t target : reached.targets) {
      reached_targets_[target] = true;
    }
    for (size_t fallback : reached.fallbacks) {
      reached_fallbacks_[fallback] = true;
    }
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
    std::vector<char> bytes;
    try {
      bytes = asset_bytes(*asset);
    } catch (const Error&) {
      // A corrupt block loses this stylesheet, not the whole dictionary.
      std::lock_guard lock(mutex_);
      unreadable_assets_.insert(*asset);
      continue;
    }
    auto css = decode_stylesheet(bytes);
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
  // Every readable stylesheet asset, then whatever the glossaries and
  // stylesheets refer to.
  std::set<std::string> references;
  std::set<MddAsset> unreadable;
  std::vector<EmbeddedAsset> embedded;
  {
    std::lock_guard lock(mutex_);
    references = asset_references_;
    unreadable = unreadable_assets_;
    embedded = embedded_assets_;
    // An alias is unresolved when no bank emitted it under its target
    // (manabitan's resolvedRedirectTargets).
    size_t resolved = 0;
    const auto& targets = redirects_.values();
    for (size_t i = 0; i < reached_targets_.size(); ++i) {
      resolved += reached_targets_[i] ? targets[i].second.aliases.size() : 0;
    }
    const auto& fallbacks = fallback_redirects_.values();
    for (size_t i = 0; i < reached_fallbacks_.size(); ++i) {
      resolved += reached_fallbacks_[i] ? fallbacks[i].second.size() : 0;
    }
    unresolved_redirect_count_ = redirect_count_ - resolved;
  }
  for (const std::string& key : css_keys_) {
    if (const MddAsset* asset = find_asset(key); asset && !unreadable.contains(*asset)) {
      add_asset(key);
    }
  }
  for (const std::string& key : references) {
    // A path no MDD has, or one media.bin cannot store, is left out.
    if (!find_asset(key) || asset_prefix.size() + key.size() > 0xffff) {
      missing_resource_count_++;
      continue;
    }
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
      std::lock_guard lock(mutex_);
      unreadable_assets_.insert(*media.asset);
      return std::nullopt;
    }
  } else {
    std::lock_guard lock(mutex_);
    const auto& data = embedded_assets_[*media.embedded].data;
    out.blob.assign(data.begin(), data.end());
  }
  return out;
}

ImportWarnings MdictSource::warnings() const {
  std::lock_guard lock(mutex_);
  return ImportWarnings{skipped_record_count_, unresolved_redirect_count_, missing_resource_count_,
                        unreadable_assets_.size()};
}
}
