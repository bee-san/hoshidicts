#pragma once

#include <cstdint>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

// MDX glossary HTML -> Yomitan structured content, a port of manabitan's
// ext/js/dictionary/mdx/mdx-converter.js (the structured-content half).
//
// Supported HTML elements keep their tag; b/i/em/strong/h1-6/p/pre/font/...
// become span or div with the tag's default style; unsupported elements are
// unwrapped (their children are kept). Inline styles are mapped to the
// structured-content style properties Yomitan knows. Links are rewritten:
// entry:// bword:// d: x: -> ?query=, sound:// -> media: (only when audio is
// enabled), data: -> an extracted embedded asset, http(s)/mailto/tel kept,
// javascript:/vbscript:/about:/# -> #, anything else -> media:<prefix>path.
// <script>/<noscript>/<link rel=stylesheet> are dropped, <style> blocks are
// collected, <audio>/<video> become links.
//
// Beyond manabitan: the MDX StyleSheet backtick substitution is applied by
// apply_stylesheet(), and nesting deeper than ConvertOptions::max_depth is
// flattened because Yomitan rejects structured content nested past 24.
namespace mdict {
struct ConvertOptions {
  // Prefix under which MDD assets appear in the imported dictionary's media.
  std::string asset_prefix = "mdict-media/";
  // sound:// links become media: links only when set (manabitan's default is off).
  bool enable_audio = false;
  // Elements nested deeper than this (root div = 1) are unwrapped.
  int max_depth = 20;
};

struct EmbeddedAsset {
  std::string path;  // "<prefix>embedded/<category>/<hash>.<ext>"
  std::vector<uint8_t> data;
};

struct ConvertResult {
  // The {"type":"structured-content", ...} glossary object as JSON text.
  std::string glossary_json;
  // <style> blocks in document order, named "inline/1.css", "inline/2.css", ...
  std::vector<std::pair<std::string, std::string>> inline_stylesheets;
  // Assets decoded from data: URLs.
  std::vector<EmbeddedAsset> embedded_assets;
  // Normalised MDD keys (without the prefix) the glossary refers to, in first-use order.
  std::vector<std::string> asset_references;
};

// Parses `html` as a body fragment and converts it.
ConvertResult convert_html(std::string_view html, const ConvertOptions& options);

// Expands the `N` markers of an MDX with a StyleSheet header attribute
// ("N\nbegin\nend\n" triples). Returns the text unchanged when there is no
// stylesheet or no markers.
std::string apply_stylesheet(std::string_view text, std::string_view stylesheet);

// Rewrites url(...) references inside CSS text to "<prefix>key", collecting
// the keys in `references`. `source_asset_path` resolves ./ and ../ relative
// to the stylesheet's own MDD path (empty for inline styles).
std::string rewrite_css_asset_urls(std::string_view css, std::string_view asset_prefix,
                                   std::string_view source_asset_path, std::vector<std::string>& references);

// MDD key normalisation shared with MdictSource: backslashes to slashes, no
// leading slash, ./ and ../ collapsed, query/fragment dropped, percent
// escapes decoded. Empty when the path is not an asset path (schemes, data:,
// #, javascript:, ...).
std::string normalize_asset_path(std::string_view path, std::string_view source_asset_path = {});

// encodeURIComponent.
std::string encode_uri_component(std::string_view value);
}
