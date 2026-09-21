#include "html_to_structured.hpp"

#include <nokogiri_gumbo.h>
#include <xxh3.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <charconv>
#include <cstring>
#include <format>
#include <map>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_set>

namespace mdict {
namespace {
constexpr std::string_view root_class = "mdict-yomitan-content";

// Tags that exist in Yomitan structured content as they are.
const std::unordered_set<std::string_view> supported_tags = {
    "a",  "br", "details", "div", "img", "li", "ol",    "rp", "rt", "ruby",
    "span", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"};

// HTML formatting/heading tags that become a span or div.
const std::map<std::string_view, std::string_view> tag_map = {
    {"b", "span"},      {"blockquote", "div"}, {"center", "div"}, {"cite", "span"}, {"code", "span"},
    {"del", "span"},    {"em", "span"},        {"font", "span"},  {"h1", "div"},    {"h2", "div"},
    {"h3", "div"},      {"h4", "div"},         {"h5", "div"},     {"h6", "div"},    {"i", "span"},
    {"ins", "span"},    {"kbd", "span"},       {"mark", "span"},  {"p", "div"},     {"pre", "div"},
    {"s", "span"},      {"samp", "span"},      {"small", "span"}, {"strike", "span"}, {"strong", "span"},
    {"sub", "span"},    {"sup", "span"},       {"tt", "span"},    {"u", "span"},    {"var", "span"}};

using StyleValue = std::vector<std::string>;  // one entry, or several for textDecorationLine
using Style = std::vector<std::pair<std::string, StyleValue>>;

const std::map<std::string_view, Style> tag_default_styles = {
    {"b", {{"fontWeight", {"bold"}}}},
    {"blockquote", {{"marginLeft", {"1em"}}}},
    {"center", {{"textAlign", {"center"}}}},
    {"code", {{"fontFamily", {"monospace"}}}},
    {"del", {{"textDecorationLine", {"line-through"}}}},
    {"em", {{"fontStyle", {"italic"}}}},
    {"h1", {{"fontWeight", {"bold"}}, {"fontSize", {"2em"}}}},
    {"h2", {{"fontWeight", {"bold"}}, {"fontSize", {"1.5em"}}}},
    {"h3", {{"fontWeight", {"bold"}}, {"fontSize", {"1.17em"}}}},
    {"h4", {{"fontWeight", {"bold"}}}},
    {"h5", {{"fontWeight", {"bold"}}}},
    {"h6", {{"fontWeight", {"bold"}}}},
    {"i", {{"fontStyle", {"italic"}}}},
    {"ins", {{"textDecorationLine", {"underline"}}}},
    {"kbd", {{"fontFamily", {"monospace"}}}},
    {"mark", {{"backgroundColor", {"yellow"}}}},
    {"pre", {{"whiteSpace", {"pre-wrap"}}}},
    {"s", {{"textDecorationLine", {"line-through"}}}},
    {"samp", {{"fontFamily", {"monospace"}}}},
    {"small", {{"fontSize", {"0.875em"}}}},
    {"strike", {{"textDecorationLine", {"line-through"}}}},
    {"strong", {{"fontWeight", {"bold"}}}},
    {"sub", {{"verticalAlign", {"sub"}}}},
    {"sup", {{"verticalAlign", {"super"}}}},
    {"tt", {{"fontFamily", {"monospace"}}}},
    {"u", {{"textDecorationLine", {"underline"}}}},
    {"var", {{"fontStyle", {"italic"}}}}};

const std::map<std::string_view, std::string_view> inline_style_properties = {
    {"background", "background"},
    {"background-image", "background"},
    {"background-color", "backgroundColor"},
    {"border-color", "borderColor"},
    {"border-style", "borderStyle"},
    {"border-radius", "borderRadius"},
    {"border-width", "borderWidth"},
    {"clip-path", "clipPath"},
    {"color", "color"},
    {"cursor", "cursor"},
    {"font-family", "fontFamily"},
    {"font-size", "fontSize"},
    {"font-style", "fontStyle"},
    {"font-weight", "fontWeight"},
    {"list-style-type", "listStyleType"},
    {"margin", "margin"},
    {"margin-top", "marginTop"},
    {"margin-left", "marginLeft"},
    {"margin-right", "marginRight"},
    {"margin-bottom", "marginBottom"},
    {"padding", "padding"},
    {"padding-top", "paddingTop"},
    {"padding-left", "paddingLeft"},
    {"padding-right", "paddingRight"},
    {"padding-bottom", "paddingBottom"},
    {"text-align", "textAlign"},
    {"text-decoration-color", "textDecorationColor"},
    {"text-decoration-style", "textDecorationStyle"},
    {"text-emphasis", "textEmphasis"},
    {"text-shadow", "textShadow"},
    {"vertical-align", "verticalAlign"},
    {"white-space", "whiteSpace"},
    {"word-break", "wordBreak"}};

// Tags whose structured-content schema has a style property.
const std::unordered_set<std::string_view> styleable_tags = {"a",  "details", "div", "li", "ol",
                                                             "span", "summary", "td",  "th", "ul"};

const std::map<std::string_view, std::string_view> embedded_extensions = {
    {"audio/aac", ".aac"},   {"audio/flac", ".flac"}, {"audio/mp4", ".m4a"},   {"audio/mpeg", ".mp3"},
    {"audio/ogg", ".ogg"},   {"audio/wav", ".wav"},   {"audio/webm", ".webm"}, {"image/apng", ".apng"},
    {"image/avif", ".avif"}, {"image/bmp", ".bmp"},   {"image/gif", ".gif"},   {"image/jpeg", ".jpg"},
    {"image/png", ".png"},   {"image/svg+xml", ".svg"}, {"image/tiff", ".tiff"}, {"image/webp", ".webp"}};

// ---------------------------------------------------------------- strings
std::string lower(std::string_view s) {
  std::string out(s);
  for (auto& c : out) {
    c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  }
  return out;
}

bool starts_with_ci(std::string_view value, std::string_view prefix) {
  if (value.size() < prefix.size()) {
    return false;
  }
  for (size_t i = 0; i < prefix.size(); ++i) {
    if (std::tolower(static_cast<unsigned char>(value[i])) != prefix[i]) {
      return false;
    }
  }
  return true;
}

std::string_view trim(std::string_view s) {
  while (!s.empty() && std::isspace(static_cast<unsigned char>(s.front()))) {
    s.remove_prefix(1);
  }
  while (!s.empty() && std::isspace(static_cast<unsigned char>(s.back()))) {
    s.remove_suffix(1);
  }
  return s;
}

std::vector<std::string_view> split(std::string_view s, char sep) {
  std::vector<std::string_view> parts;
  size_t start = 0;
  while (true) {
    const size_t end = s.find(sep, start);
    parts.push_back(s.substr(start, end == std::string_view::npos ? std::string_view::npos : end - start));
    if (end == std::string_view::npos) {
      return parts;
    }
    start = end + 1;
  }
}

bool all_digits(std::string_view s) {
  return !s.empty() && std::all_of(s.begin(), s.end(), [](char c) { return c >= '0' && c <= '9'; });
}

void json_string(std::string& out, std::string_view value) {
  static const char hex[] = "0123456789abcdef";
  out += '"';
  for (unsigned char c : value) {
    switch (c) {
      case '"':
        out += "\\\"";
        break;
      case '\\':
        out += "\\\\";
        break;
      case '\n':
        out += "\\n";
        break;
      case '\r':
        out += "\\r";
        break;
      case '\t':
        out += "\\t";
        break;
      default:
        if (c < 0x20) {
          out += "\\u00";
          out += hex[c >> 4];
          out += hex[c & 0xf];
        } else {
          out += static_cast<char>(c);
        }
    }
  }
  out += '"';
}

// ------------------------------------------------------------------- URLs
int hex_value(char c) {
  if (c >= '0' && c <= '9') {
    return c - '0';
  }
  if (c >= 'a' && c <= 'f') {
    return c - 'a' + 10;
  }
  if (c >= 'A' && c <= 'F') {
    return c - 'A' + 10;
  }
  return -1;
}

// decodeURIComponent; returns nullopt when the escapes are malformed or the
// result is not valid UTF-8, like the JS function throwing.
std::optional<std::string> percent_decode(std::string_view s) {
  std::string out;
  out.reserve(s.size());
  for (size_t i = 0; i < s.size(); ++i) {
    if (s[i] != '%') {
      out += s[i];
      continue;
    }
    if (i + 2 >= s.size() || hex_value(s[i + 1]) < 0 || hex_value(s[i + 2]) < 0) {
      return std::nullopt;
    }
    out += static_cast<char>(hex_value(s[i + 1]) * 16 + hex_value(s[i + 2]));
    i += 2;
  }
  // Validate UTF-8 so a truncated multi-byte sequence is rejected as JS would.
  for (size_t i = 0; i < out.size();) {
    const auto c = static_cast<unsigned char>(out[i]);
    size_t len = c < 0x80 ? 1 : (c >> 5) == 0x6 ? 2 : (c >> 4) == 0xe ? 3 : (c >> 3) == 0x1e ? 4 : 0;
    if (len == 0 || i + len > out.size()) {
      return std::nullopt;
    }
    for (size_t k = 1; k < len; ++k) {
      if ((static_cast<unsigned char>(out[i + k]) & 0xc0) != 0x80) {
        return std::nullopt;
      }
    }
    i += len;
  }
  return out;
}

std::string encode_media_path(std::string_view path) {
  std::string out;
  bool first = true;
  for (std::string_view part : split(path, '/')) {
    if (!first) {
      out += '/';
    }
    first = false;
    out += encode_uri_component(part);
  }
  return out;
}

std::string search_href(std::string_view query) { return "?query=" + encode_uri_component(query); }

std::string collapse_posix_path(std::string_view path) {
  std::vector<std::string_view> parts;
  for (std::string_view part : split(path, '/')) {
    if (part.empty() || part == ".") {
      continue;
    }
    if (part == "..") {
      if (!parts.empty()) {
        parts.pop_back();
      }
      continue;
    }
    parts.push_back(part);
  }
  std::string out;
  for (size_t i = 0; i < parts.size(); ++i) {
    if (i) {
      out += '/';
    }
    out += parts[i];
  }
  return out;
}

// normalize_asset_path minus the asset prefix, i.e. the MDD key.
std::string referenced_asset_key(std::string_view path, std::string_view prefix, std::string_view source) {
  std::string normalized = normalize_asset_path(path, source);
  if (normalized.starts_with(prefix)) {
    normalized.erase(0, prefix.size());
  }
  return normalized;
}

void add_reference(std::vector<std::string>& references, std::string key) {
  if (key.empty() || std::find(references.begin(), references.end(), key) != references.end()) {
    return;
  }
  references.push_back(std::move(key));
}

std::optional<std::vector<uint8_t>> base64_decode(std::string_view s) {
  std::vector<uint8_t> out;
  out.reserve(s.size() / 4 * 3);
  uint32_t acc = 0;
  int bits = 0;
  size_t padding = 0;
  for (char c : s) {
    int v = -1;
    if (c >= 'A' && c <= 'Z') {
      v = c - 'A';
    } else if (c >= 'a' && c <= 'z') {
      v = c - 'a' + 26;
    } else if (c >= '0' && c <= '9') {
      v = c - '0' + 52;
    } else if (c == '+' || c == '-') {
      v = 62;
    } else if (c == '/' || c == '_') {
      v = 63;
    } else if (c == '=') {
      padding++;
      continue;
    } else if (std::isspace(static_cast<unsigned char>(c))) {
      continue;
    } else {
      return std::nullopt;
    }
    if (padding) {
      return std::nullopt;
    }
    acc = (acc << 6) | static_cast<uint32_t>(v);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push_back(static_cast<uint8_t>((acc >> bits) & 0xff));
    }
  }
  return out;
}

struct DataUrl {
  std::string media_type;
  std::vector<uint8_t> data;
};

std::optional<DataUrl> decode_data_url(std::string_view value) {
  if (!starts_with_ci(value, "data:")) {
    return std::nullopt;
  }
  const size_t comma = value.find(',');
  if (comma == std::string_view::npos) {
    return std::nullopt;
  }
  const std::string_view header = value.substr(5, comma - 5);
  const std::string_view payload = value.substr(comma + 1);
  DataUrl out;
  bool base64 = false;
  bool first = true;
  for (std::string_view part : split(header, ';')) {
    part = trim(part);
    if (part.empty()) {
      continue;
    }
    if (first) {
      out.media_type = lower(part);
      first = false;
    } else if (lower(part) == "base64") {
      base64 = true;
    }
  }
  if (out.media_type.empty()) {
    out.media_type = "text/plain";
  }
  if (base64) {
    auto decoded = base64_decode(payload);
    if (!decoded) {
      return std::nullopt;
    }
    out.data = std::move(*decoded);
  } else {
    auto decoded = percent_decode(payload);
    if (!decoded) {
      return std::nullopt;
    }
    out.data.assign(decoded->begin(), decoded->end());
  }
  return out;
}

// ------------------------------------------------------------- conversion
struct Context {
  const ConvertOptions& options;
  ConvertResult& result;
};

// Assets decoded from data: URLs are named by content hash so identical data
// shares one file and the name does not depend on the order entries are
// converted in (banks are converted on several threads).
std::string register_data_url(Context& ctx, std::string_view value) {
  auto decoded = decode_data_url(value);
  if (!decoded) {
    return {};
  }
  const std::string_view media_type = decoded->media_type;
  const std::string_view type_only = trim(media_type.substr(0, media_type.find(';')));
  auto ext = embedded_extensions.find(type_only);
  // The top-level type becomes a directory name, so only plain ASCII may pass.
  std::string category(trim(media_type.substr(0, media_type.find('/'))));
  const bool plain = !category.empty() && std::all_of(category.begin(), category.end(), [](char c) {
    return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-';
  });
  if (!plain) {
    category = "asset";
  }
  const uint64_t hash = XXH3_64bits(decoded->data.data(), decoded->data.size());
  std::string path = ctx.options.asset_prefix + "embedded/" + category + "/" + std::format("{:016x}", hash) +
                     std::string(ext == embedded_extensions.end() ? ".bin" : ext->second);
  auto& assets = ctx.result.embedded_assets;
  if (std::none_of(assets.begin(), assets.end(), [&](const EmbeddedAsset& a) { return a.path == path; })) {
    assets.push_back(EmbeddedAsset{path, std::move(decoded->data)});
  }
  return path;
}

std::string convert_link_href(Context& ctx, std::string_view href) {
  const std::string_view value = trim(href);
  const std::string_view prefix = ctx.options.asset_prefix;
  if (starts_with_ci(value, "entry://") || starts_with_ci(value, "bword://")) {
    return search_href(value.substr(8));
  }
  if (starts_with_ci(value, "d:") || starts_with_ci(value, "x:")) {
    return search_href(value.substr(2));
  }
  if (starts_with_ci(value, "sound://")) {
    const std::string key = referenced_asset_key(value.substr(8), prefix, {});
    add_reference(ctx.result.asset_references, key);
    if (ctx.options.enable_audio && !key.empty()) {
      return "media:" + encode_media_path(std::string(prefix) + key);
    }
    return "#";
  }
  if (starts_with_ci(value, "http://") || starts_with_ci(value, "https://") || starts_with_ci(value, "mailto:") ||
      starts_with_ci(value, "tel:")) {
    return std::string(value);
  }
  if (starts_with_ci(value, "data:")) {
    const std::string path = register_data_url(ctx, value);
    return path.empty() ? "#" : "media:" + encode_media_path(path);
  }
  if (starts_with_ci(value, "javascript:") || starts_with_ci(value, "vbscript:") || starts_with_ci(value, "about:") ||
      value.starts_with('#')) {
    return "#";
  }
  const std::string key = referenced_asset_key(value, prefix, {});
  add_reference(ctx.result.asset_references, key);
  return key.empty() ? "#" : "media:" + encode_media_path(std::string(prefix) + key);
}

using Attributes = std::map<std::string, std::string>;

Attributes element_attributes(const GumboElement& element) {
  Attributes attrs;
  for (unsigned int i = 0; i < element.attributes.length; ++i) {
    const auto* attr = static_cast<const GumboAttribute*>(element.attributes.data[i]);
    attrs.emplace(lower(attr->name), attr->value ? attr->value : "");
  }
  return attrs;
}

const std::string* attr(const Attributes& attrs, const char* name) {
  auto it = attrs.find(name);
  return it == attrs.end() ? nullptr : &it->second;
}

std::string tag_name(const GumboElement& element) {
  if (element.tag != GUMBO_TAG_UNKNOWN) {
    return gumbo_normalized_tagname(element.tag);
  }
  // Unknown tags are unwrapped anyway; report the original text for data.tag.
  GumboStringPiece original = element.original_tag;
  if (!original.data || original.length < 3) {
    return "unknown";
  }
  gumbo_tag_from_original_text(&original);
  return lower(std::string_view(original.data, original.length));
}

// {"tag":"b","class":"x","id":"y"} or empty.
std::string structured_data(std::string_view tag, const Attributes& attrs) {
  std::string class_name;
  if (const std::string* cls = attr(attrs, "class")) {
    // Collapse whitespace runs to single spaces.
    for (char c : *cls) {
      if (std::isspace(static_cast<unsigned char>(c))) {
        if (!class_name.empty() && class_name.back() != ' ') {
          class_name += ' ';
        }
      } else {
        class_name += c;
      }
    }
    if (!class_name.empty() && class_name.back() == ' ') {
      class_name.pop_back();
    }
  }
  std::string id;
  if (const std::string* value = attr(attrs, "id")) {
    id = std::string(trim(*value));
  }
  if (class_name.empty() && id.empty()) {
    return {};
  }
  std::string out = "{\"tag\":";
  json_string(out, tag);
  if (!class_name.empty()) {
    out += ",\"class\":";
    json_string(out, class_name);
  }
  if (!id.empty()) {
    out += ",\"id\":";
    json_string(out, id);
  }
  out += '}';
  return out;
}

void set_style(Style& style, std::string_view name, StyleValue value) {
  for (auto& [key, existing] : style) {
    if (key == name) {
      existing = std::move(value);
      return;
    }
  }
  style.emplace_back(std::string(name), std::move(value));
}

void convert_inline_style(Context& ctx, std::string_view style_text, Style& style) {
  for (std::string_view declaration : split(style_text, ';')) {
    const size_t colon = declaration.find(':');
    if (colon == std::string_view::npos) {
      continue;
    }
    const std::string property = lower(trim(declaration.substr(0, colon)));
    std::string value(trim(declaration.substr(colon + 1)));
    if (property.empty() || value.empty()) {
      continue;
    }
    if (value.find("url(") != std::string::npos) {
      value = rewrite_css_asset_urls(value, ctx.options.asset_prefix, {}, ctx.result.asset_references);
    }
    if (property == "text-decoration" || property == "text-decoration-line") {
      StyleValue parts;
      for (std::string_view part : split(value, ' ')) {
        if (part == "underline" || part == "overline" || part == "line-through" || part == "none") {
          parts.emplace_back(part);
        }
      }
      if (!parts.empty()) {
        set_style(style, "textDecorationLine", std::move(parts));
      }
      continue;
    }
    auto mapped = inline_style_properties.find(property);
    if (mapped != inline_style_properties.end()) {
      set_style(style, mapped->second, {value});
    }
  }
}

void write_style(std::string& out, const Style& style) {
  out += "{";
  bool first = true;
  for (const auto& [name, value] : style) {
    if (!first) {
      out += ',';
    }
    first = false;
    json_string(out, name);
    out += ':';
    if (value.size() == 1) {
      json_string(out, value[0]);
    } else {
      out += '[';
      for (size_t i = 0; i < value.size(); ++i) {
        if (i) {
          out += ',';
        }
        json_string(out, value[i]);
      }
      out += ']';
    }
  }
  out += '}';
}

// Builds a JSON array body (without brackets); adjacent text is merged.
class ContentBuilder {
 public:
  void text(std::string_view value) {
    if (value.empty()) {
      return;
    }
    if (last_was_text_) {
      pending_text_ += value;
      return;
    }
    flush();
    last_was_text_ = true;
    pending_text_ = std::string(value);
  }

  void element(std::string json) {
    flush();
    separator();
    json_ += json;
  }

  std::string finish() {
    flush();
    return std::move(json_);
  }

  bool empty() const { return json_.empty() && !last_was_text_; }

 private:
  void separator() {
    if (!json_.empty()) {
      json_ += ',';
    }
  }
  void flush() {
    if (last_was_text_) {
      separator();
      json_string(json_, pending_text_);
      pending_text_.clear();
      last_was_text_ = false;
    }
  }

  std::string json_;
  std::string pending_text_;
  bool last_was_text_ = false;
};

void append_children(Context& ctx, const GumboNode& parent, ContentBuilder& content, int depth);

std::string direct_text(const GumboNode& node) {
  std::string text;
  const GumboVector& children = node.v.element.children;
  for (unsigned int i = 0; i < children.length; ++i) {
    const auto* child = static_cast<const GumboNode*>(children.data[i]);
    if (child->type == GUMBO_NODE_TEXT || child->type == GUMBO_NODE_WHITESPACE || child->type == GUMBO_NODE_CDATA) {
      text += child->v.text.text;
    }
  }
  return text;
}

std::string structured_image(Context& ctx, const Attributes& attrs) {
  const std::string* src = attr(attrs, "src");
  const std::string_view src_value = src ? trim(*src) : std::string_view();
  std::string path;
  if (starts_with_ci(src_value, "data:")) {
    path = register_data_url(ctx, src_value);
  } else {
    const std::string key = referenced_asset_key(src_value, ctx.options.asset_prefix, {});
    add_reference(ctx.result.asset_references, key);
    if (!key.empty()) {
      path = ctx.options.asset_prefix + key;
    }
  }
  if (path.empty()) {
    return {};
  }
  std::string out = "{\"tag\":\"img\",\"path\":";
  json_string(out, path);
  const std::string data = structured_data("img", attrs);
  if (!data.empty()) {
    out += ",\"data\":" + data;
  }
  if (const std::string* width = attr(attrs, "width"); width && all_digits(*width) && width->size() <= 9) {
    out += ",\"width\":" + std::to_string(std::stoi(*width));
  }
  if (const std::string* height = attr(attrs, "height"); height && all_digits(*height) && height->size() <= 9) {
    out += ",\"height\":" + std::to_string(std::stoi(*height));
  }
  if (const std::string* title = attr(attrs, "title"); title && !title->empty()) {
    out += ",\"title\":";
    json_string(out, *title);
  }
  if (const std::string* alt = attr(attrs, "alt"); alt && !alt->empty()) {
    out += ",\"alt\":";
    json_string(out, *alt);
  }
  out += '}';
  return out;
}

void convert_element(Context& ctx, const GumboNode& node, ContentBuilder& content, int depth) {
  const GumboElement& element = node.v.element;
  const std::string tag = tag_name(element);
  const Attributes attrs = element_attributes(element);

  if (tag == "script" || tag == "noscript") {
    return;
  }
  if (tag == "style") {
    const std::string stylesheet(trim(direct_text(node)));
    if (!stylesheet.empty()) {
      auto& sheets = ctx.result.inline_stylesheets;
      sheets.emplace_back("inline/" + std::to_string(sheets.size() + 1) + ".css", stylesheet);
    }
    return;
  }
  if (tag == "link") {
    const std::string* rel = attr(attrs, "rel");
    if (rel && lower(*rel).find("stylesheet") != std::string::npos) {
      const std::string* href = attr(attrs, "href");
      add_reference(ctx.result.asset_references,
                    referenced_asset_key(href ? *href : "", ctx.options.asset_prefix, {}));
      return;
    }
  }

  std::string mapped;
  if (supported_tags.contains(tag)) {
    mapped = tag;
  } else if (auto it = tag_map.find(tag); it != tag_map.end()) {
    mapped = std::string(it->second);
  }
  if (tag == "audio" || tag == "video") {
    mapped = "a";
  }
  // Unsupported elements, and elements past the depth limit, are unwrapped.
  if (mapped.empty() || depth > ctx.options.max_depth) {
    append_children(ctx, node, content, depth);
    return;
  }
  if (mapped == "img") {
    const std::string image = structured_image(ctx, attrs);
    if (!image.empty()) {
      content.element(image);
    }
    return;
  }

  std::string out = "{\"tag\":";
  json_string(out, mapped);
  const std::string data = structured_data(tag, attrs);
  if (!data.empty()) {
    out += ",\"data\":" + data;
  }

  Style style;
  if (auto it = tag_default_styles.find(tag); it != tag_default_styles.end()) {
    style = it->second;
  }
  if (const std::string* inline_style = attr(attrs, "style")) {
    convert_inline_style(ctx, *inline_style, style);
  }
  if (tag == "font") {
    if (const std::string* color = attr(attrs, "color"); color && !color->empty()) {
      set_style(style, "color", {*color});
    }
    if (const std::string* size = attr(attrs, "size"); size && !size->empty()) {
      set_style(style, "fontSize", {*size});
    }
    if (const std::string* face = attr(attrs, "face"); face && !face->empty()) {
      set_style(style, "fontFamily", {*face});
    }
  }
  if (!style.empty() && styleable_tags.contains(mapped)) {
    out += ",\"style\":";
    write_style(out, style);
  }
  if (const std::string* lang = attr(attrs, "lang"); lang && !lang->empty()) {
    out += ",\"lang\":";
    json_string(out, *lang);
  }
  if (const std::string* title = attr(attrs, "title"); title && !title->empty()) {
    out += ",\"title\":";
    json_string(out, *title);
  }
  if (mapped == "a") {
    const std::string* href = attr(attrs, "href");
    if (!href) {
      href = attr(attrs, "src");
    }
    out += ",\"href\":";
    json_string(out, convert_link_href(ctx, href ? *href : ""));
  }
  if (mapped == "td" || mapped == "th") {
    if (const std::string* span = attr(attrs, "colspan"); span && all_digits(*span) && span->size() <= 9) {
      out += ",\"colSpan\":" + std::to_string(std::stoi(*span));
    }
    if (const std::string* span = attr(attrs, "rowspan"); span && all_digits(*span) && span->size() <= 9) {
      out += ",\"rowSpan\":" + std::to_string(std::stoi(*span));
    }
  }
  if (mapped == "details" && attrs.contains("open")) {
    out += ",\"open\":true";
  }

  if (mapped != "br") {
    ContentBuilder children;
    append_children(ctx, node, children, depth + 1);
    if (!children.empty()) {
      out += ",\"content\":[" + children.finish() + "]";
    } else if (tag == "audio" || tag == "video") {
      out += ",\"content\":[";
      json_string(out, tag);
      out += "]";
    }
  }
  out += '}';
  content.element(std::move(out));
}

void append_children(Context& ctx, const GumboNode& parent, ContentBuilder& content, int depth) {
  const GumboVector& children = parent.v.element.children;
  for (unsigned int i = 0; i < children.length; ++i) {
    const auto* child = static_cast<const GumboNode*>(children.data[i]);
    switch (child->type) {
      case GUMBO_NODE_TEXT:
      case GUMBO_NODE_WHITESPACE:
      case GUMBO_NODE_CDATA:
        content.text(child->v.text.text);
        break;
      case GUMBO_NODE_ELEMENT:
        convert_element(ctx, *child, content, depth);
        break;
      case GUMBO_NODE_TEMPLATE:
        append_children(ctx, *child, content, depth);
        break;
      default:
        break;
    }
  }
}
}

std::string json_quote(std::string_view value) {
  std::string out;
  json_string(out, value);
  return out;
}

std::string encode_uri_component(std::string_view value) {
  static const char hex[] = "0123456789ABCDEF";
  std::string out;
  out.reserve(value.size());
  for (unsigned char c : value) {
    const bool alnum = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');
    if (alnum || c == '-' || c == '_' || c == '.' || c == '!' || c == '~' || c == '*' || c == '\'' || c == '(' ||
        c == ')') {
      out += static_cast<char>(c);
    } else {
      out += '%';
      out += hex[c >> 4];
      out += hex[c & 0xf];
    }
  }
  return out;
}

std::string normalize_asset_path(std::string_view path, std::string_view source_asset_path) {
  std::string value(trim(path));
  std::replace(value.begin(), value.end(), '\\', '/');
  if (value.empty()) {
    return {};
  }
  static constexpr std::string_view schemes[] = {"entry://", "bword://",    "sound://",  "http://", "https://",
                                                 "data:",    "javascript:", "vbscript:", "about:",  "#"};
  for (std::string_view scheme : schemes) {
    if (starts_with_ci(value, scheme)) {
      return {};
    }
  }
  if (value.starts_with("//")) {
    return {};
  }
  const size_t suffix = value.find_first_of("?#");
  if (suffix != std::string::npos) {
    value.resize(suffix);
  }
  if (starts_with_ci(value, "file://")) {
    value.erase(0, 7);
  }
  // Decode percent escapes per segment, keeping malformed segments verbatim.
  {
    std::string decoded;
    bool first = true;
    for (std::string_view part : split(value, '/')) {
      if (!first) {
        decoded += '/';
      }
      first = false;
      auto piece = percent_decode(part);
      decoded += piece ? *piece : std::string(part);
    }
    value = std::move(decoded);
  }
  while (value.starts_with('/')) {
    value.erase(0, 1);
  }
  if (!source_asset_path.empty() && (value.starts_with("./") || value.starts_with("../"))) {
    const size_t slash = source_asset_path.rfind('/');
    const std::string_view parent =
        slash == std::string_view::npos ? std::string_view() : source_asset_path.substr(0, slash);
    if (!parent.empty()) {
      value = std::string(parent) + "/" + value;
    }
  }
  return collapse_posix_path(value);
}

std::string rewrite_css_asset_urls(std::string_view css, std::string_view asset_prefix,
                                   std::string_view source_asset_path, std::vector<std::string>& references) {
  std::string out;
  out.reserve(css.size());
  size_t pos = 0;
  while (pos < css.size()) {
    size_t start = std::string_view::npos;
    for (size_t i = pos; i + 4 <= css.size(); ++i) {
      if (starts_with_ci(css.substr(i, 4), "url(")) {
        start = i;
        break;
      }
    }
    if (start == std::string_view::npos) {
      out += css.substr(pos);
      break;
    }
    out += css.substr(pos, start - pos);
    size_t i = start + 4;
    while (i < css.size() && std::isspace(static_cast<unsigned char>(css[i]))) {
      i++;
    }
    char quote = 0;
    if (i < css.size() && (css[i] == '"' || css[i] == '\'')) {
      quote = css[i++];
    }
    const size_t value_start = i;
    size_t value_end;
    if (quote) {
      value_end = css.find(quote, value_start);
    } else {
      value_end = css.find(')', value_start);
    }
    if (value_end == std::string_view::npos) {
      out += css.substr(start);
      break;
    }
    size_t close = value_end + (quote ? 1 : 0);
    while (close < css.size() && std::isspace(static_cast<unsigned char>(css[close]))) {
      close++;
    }
    if (close >= css.size() || css[close] != ')') {
      out += css.substr(start, value_end + 1 - start);
      pos = value_end + 1;
      continue;
    }
    const std::string_view raw = css.substr(value_start, value_end - value_start);
    const std::string key = referenced_asset_key(raw, asset_prefix, source_asset_path);
    if (key.empty()) {
      out += css.substr(start, close + 1 - start);
    } else {
      add_reference(references, key);
      out += "url(\"";
      out += asset_prefix;
      out += key;
      out += "\")";
    }
    pos = close + 1;
  }
  return out;
}

std::string apply_stylesheet(std::string_view text, std::string_view stylesheet) {
  if (stylesheet.empty() || text.find('`') == std::string_view::npos) {
    return std::string(text);
  }
  std::map<std::string, std::pair<std::string, std::string>> styles;
  std::vector<std::string_view> lines = split(stylesheet, '\n');
  for (auto& line : lines) {
    if (!line.empty() && line.back() == '\r') {
      line.remove_suffix(1);
    }
  }
  for (size_t i = 0; i + 2 < lines.size(); i += 3) {
    styles[std::string(lines[i])] = {std::string(lines[i + 1]), std::string(lines[i + 2])};
  }

  // Split on `N` markers as readmdict does; each segment after a marker is
  // wrapped in that style's begin/end pair.
  std::string out;
  size_t pos = 0;
  std::string key;
  bool have_key = false;
  auto emit = [&](std::string_view segment) {
    auto it = have_key ? styles.find(key) : styles.end();
    if (it == styles.end()) {
      // readmdict drops the segment of an unknown style number; keep the text.
      out += segment;
      return;
    }
    if (!segment.empty() && segment.back() == '\n') {
      out += it->second.first;
      out += trim(segment);
      out += it->second.second;
      out += "\r\n";
    } else {
      out += it->second.first;
      out += segment;
      out += it->second.second;
    }
  };
  while (true) {
    size_t marker_start = std::string_view::npos;
    size_t marker_end = std::string_view::npos;
    std::string_view digits;
    for (size_t tick = text.find('`', pos); tick != std::string_view::npos; tick = text.find('`', tick + 1)) {
      size_t end = tick + 1;
      while (end < text.size() && text[end] >= '0' && text[end] <= '9') {
        end++;
      }
      if (end > tick + 1 && end < text.size() && text[end] == '`') {
        marker_start = tick;
        marker_end = end + 1;
        digits = text.substr(tick + 1, end - tick - 1);
        break;
      }
    }
    emit(text.substr(pos, marker_start == std::string_view::npos ? std::string_view::npos : marker_start - pos));
    if (marker_start == std::string_view::npos) {
      break;
    }
    key = std::string(digits);
    have_key = true;
    pos = marker_end;
  }
  return out;
}

ConvertResult convert_html(std::string_view html, const ConvertOptions& options) {
  ConvertResult result;
  Context ctx{options, result};

  GumboOptions gumbo_options = kGumboDefaultOptions;
  gumbo_options.fragment_context = "body";
  gumbo_options.fragment_namespace = GUMBO_NAMESPACE_HTML;
  GumboOutput* output = gumbo_parse_with_options(&gumbo_options, html.data(), html.size());
  ContentBuilder content;
  if (output && output->root) {
    append_children(ctx, *output->root, content, 2);
  }
  if (output) {
    gumbo_destroy_output(output);
  }

  result.glossary_json =
      "{\"type\":\"structured-content\",\"content\":{\"tag\":\"div\",\"data\":{\"tag\":\"div\",\"class\":";
  json_string(result.glossary_json, root_class);
  result.glossary_json += "}";
  const std::string body = content.finish();
  if (!body.empty()) {
    result.glossary_json += ",\"content\":[" + body + "]";
  } else {
    result.glossary_json += ",\"content\":[]";
  }
  result.glossary_json += "}}";
  return result;
}
}
