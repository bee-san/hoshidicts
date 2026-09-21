// Unit tests for mdict::convert_html and its helpers. Expectations follow
// manabitan's mdx-converter.js behaviour; the JSON text is compared exactly
// because the emitter is deterministic, and each glossary is also parsed with
// glaze to prove it is well-formed JSON.
#include <glaze/glaze.hpp>

#include <cstdio>
#include <string>
#include <vector>

#include "mdict/html_to_structured.hpp"

namespace {
int failures = 0;

void check(bool ok, const std::string& what) {
  if (!ok) {
    std::printf("FAIL %s\n", what.c_str());
    failures++;
  }
}

void check_eq(const std::string& actual, const std::string& expected, const std::string& what) {
  if (actual != expected) {
    std::printf("FAIL %s\n  expected: %s\n  actual:   %s\n", what.c_str(), expected.c_str(), actual.c_str());
    failures++;
  }
}

const std::string root_open =
    R"({"type":"structured-content","content":{"tag":"div","data":{"tag":"div","class":"mdict-yomitan-content"},"content":[)";
const std::string root_close = "]}}";

// Converts and returns only the root content array body.
std::string body(const std::string& html, const mdict::ConvertOptions& options = {}) {
  const mdict::ConvertResult result = mdict::convert_html(html, options);
  glz::generic parsed;
  if (auto error = glz::read_json(parsed, result.glossary_json)) {
    check(false, "glossary is not valid JSON: " + result.glossary_json);
  }
  check(result.glossary_json.starts_with(root_open) && result.glossary_json.ends_with(root_close),
        "root wrapper for " + html);
  return result.glossary_json.substr(root_open.size(),
                                     result.glossary_json.size() - root_open.size() - root_close.size());
}

void test_basic_formatting() {
  check_eq(body("<b>bold</b> plain <i>it</i>"),
           R"({"tag":"span","style":{"fontWeight":"bold"},"content":["bold"]}," plain ",)"
           R"({"tag":"span","style":{"fontStyle":"italic"},"content":["it"]})",
           "b/i become styled spans");
  check_eq(body("<h1>Head</h1><p>para</p>"),
           R"({"tag":"div","style":{"fontWeight":"bold","fontSize":"2em"},"content":["Head"]},)"
           R"({"tag":"div","content":["para"]})",
           "h1/p become divs");
  check_eq(body("<abbr>a</abbr>b<u>c</u>"),
           R"("ab",{"tag":"span","style":{"textDecorationLine":"underline"},"content":["c"]})",
           "unsupported element unwrapped and adjacent text merged");
  check_eq(body("x<br>y"), R"("x",{"tag":"br"},"y")", "br has no content");
  check_eq(body("&amp; &lt;b&gt; &nbsp;"), "\"& <b> \xc2\xa0\"", "entities decoded");
  check_eq(body(""), "", "empty definition");
  check_eq(body("<!-- c --><script>alert(1)</script><noscript>n</noscript>t"), R"("t")", "script and comments dropped");
}

void test_data_and_attributes() {
  check_eq(body(R"(<span class="  a   b " id=" x " lang="ja" title="T">s</span>)"),
           R"({"tag":"span","data":{"tag":"span","class":"a b","id":"x"},"lang":"ja","title":"T","content":["s"]})",
           "class collapsed, id trimmed, lang and title kept");
  check_eq(body(R"(<td colspan="2" rowspan="3">c</td>)"), R"("c")", "stray td is dropped, its text kept");
  check_eq(body(R"(<table><tr><td colspan="2" rowspan="3">c</td><th colspan="x">h</th></tr></table>)"),
           R"({"tag":"table","content":[{"tag":"tbody","content":[{"tag":"tr","content":[)"
           R"({"tag":"td","colSpan":2,"rowSpan":3,"content":["c"]},{"tag":"th","content":["h"]}]}]}]})",
           "table with spans; non-numeric span ignored; tbody inserted by the parser");
  check_eq(body(R"(<details open><summary>s</summary>d</details>)"),
           R"({"tag":"details","open":true,"content":[{"tag":"summary","content":["s"]},"d"]})", "details open");
  check_eq(body("<ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp></ruby>"),
           R"({"tag":"ruby","content":["漢",{"tag":"rp","content":["("]},{"tag":"rt","content":["かん"]},)"
           R"~({"tag":"rp","content":[")"]}]})~",
           "ruby");
}

void test_styles() {
  check_eq(body(R"(<span style="color: red; text-decoration: underline line-through; font-size:12px; bogus:1">s</span>)"),
           R"({"tag":"span","style":{"color":"red","textDecorationLine":["underline","line-through"],"fontSize":"12px"},)"
           R"("content":["s"]})",
           "inline style mapping and text-decoration splitting");
  check_eq(body(R"(<b style="font-weight: normal">s</b>)"),
           R"({"tag":"span","style":{"fontWeight":"normal"},"content":["s"]})", "inline style overrides default");
  check_eq(body(R"(<font color="red" size="3" face="Arial">f</font>)"),
           R"({"tag":"span","style":{"color":"red","fontSize":"3","fontFamily":"Arial"},"content":["f"]})", "font");
  check_eq(body(R"(<table style="color:red"><tr><td>c</td></tr></table>)"),
           R"({"tag":"table","content":[{"tag":"tbody","content":[{"tag":"tr","content":[{"tag":"td","content":["c"]}]}]}]})",
           "style dropped on tags whose schema has none");
  mdict::ConvertResult result = mdict::convert_html(R"(<style>.a{color:red}</style><style> </style>x<style>b{}</style>)", {});
  check(result.inline_stylesheets.size() == 2, "two non-empty style blocks collected");
  if (result.inline_stylesheets.size() == 2) {
    check_eq(result.inline_stylesheets[0].first, "inline/1.css", "inline stylesheet name");
    check_eq(result.inline_stylesheets[0].second, ".a{color:red}", "inline stylesheet text");
    check_eq(result.inline_stylesheets[1].first, "inline/2.css", "second inline stylesheet name");
  }
  result = mdict::convert_html(R"(<span style="background: url('img/bg.png') no-repeat">s</span>)", {});
  check(result.asset_references == std::vector<std::string>{"img/bg.png"}, "url() in inline style referenced");
  check(result.glossary_json.find(R"("background":"url(\"mdict-media/img/bg.png\") no-repeat")") != std::string::npos,
        "url() in inline style rewritten");
}

void test_links() {
  check_eq(body(R"(<a href="entry://食べる">e</a>)"),
           R"({"tag":"a","href":"?query=%E9%A3%9F%E3%81%B9%E3%82%8B","content":["e"]})", "entry:// link");
  check_eq(body(R"(<a href="bword://a b">e</a>)"), R"({"tag":"a","href":"?query=a%20b","content":["e"]})", "bword://");
  check_eq(body(R"(<a href="x:term">e</a>)"), R"({"tag":"a","href":"?query=term","content":["e"]})", "x: link");
  check_eq(body(R"(<a href="https://example.com/a?b=1">e</a>)"),
           R"({"tag":"a","href":"https://example.com/a?b=1","content":["e"]})", "https kept");
  check_eq(body(R"~(<a href="javascript:alert(1)">e</a><a href="#top">f</a><a href="vbscript:x">g</a>)~"),
           R"({"tag":"a","href":"#","content":["e"]},{"tag":"a","href":"#","content":["f"]},)"
           R"({"tag":"a","href":"#","content":["g"]})",
           "script and fragment links neutralised");
  check_eq(body(R"(<a href="\img\x y.png">e</a>)"),
           R"({"tag":"a","href":"media:mdict-media/img/x%20y.png","content":["e"]})", "relative path -> media:");
  check_eq(body(R"(<a href="sound://a.spx">e</a>)"), R"({"tag":"a","href":"#","content":["e"]})",
           "sound:// is # with audio disabled");
  mdict::ConvertOptions audio;
  audio.enable_audio = true;
  check_eq(body(R"(<a href="sound://a.spx">e</a>)", audio),
           R"({"tag":"a","href":"media:mdict-media/a.spx","content":["e"]})", "sound:// with audio enabled");
  mdict::ConvertResult result = mdict::convert_html(R"(<a href="sound://a.spx">e</a><a href="img/p.png">f</a>)", {});
  check(result.asset_references == std::vector<std::string>{"a.spx", "img/p.png"}, "link asset references collected");
  check_eq(body(R"(<audio src="snd/a.mp3"></audio><video src="v.mp4">cap</video>)"),
           R"({"tag":"a","href":"media:mdict-media/snd/a.mp3","content":["audio"]},)"
           R"({"tag":"a","href":"media:mdict-media/v.mp4","content":["cap"]})",
           "audio/video become links");
}

void test_images() {
  check_eq(body(R"(<img src="img/pic.png" width="10" height="20" alt="pic" title="t" class="c">)"),
           R"({"tag":"img","path":"mdict-media/img/pic.png","data":{"tag":"img","class":"c"},"width":10,"height":20,)"
           R"("title":"t","alt":"pic"})",
           "img attributes");
  check_eq(body(R"(<img src="javascript:x"><img>)"), "", "img without a usable source dropped");
  mdict::ConvertResult result =
      mdict::convert_html(R"(<img src="data:image/png;base64,iVBORw0KGgo="><a href="data:text/plain,hi%20there">t</a>)", {});
  check(result.embedded_assets.size() == 2, "two embedded assets");
  if (result.embedded_assets.size() == 2) {
    const auto& png = result.embedded_assets[0];
    check(png.path.starts_with("mdict-media/embedded/image/") && png.path.ends_with(".png"), "png asset path " + png.path);
    check(png.data == std::vector<uint8_t>{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, "base64 decoded");
    const auto& txt = result.embedded_assets[1];
    check(txt.path.starts_with("mdict-media/embedded/text/") && txt.path.ends_with(".bin"), "text asset path " + txt.path);
    check(std::string(txt.data.begin(), txt.data.end()) == "hi there", "percent-decoded payload");
    check(result.glossary_json.find("\"path\":\"" + png.path + "\"") != std::string::npos, "img path points at asset");
    check(result.glossary_json.find("\"href\":\"media:" + txt.path + "\"") != std::string::npos, "link points at asset");
  }
  check_eq(body(R"(<img src="data:image/png;base64,@@@">)"), "", "malformed data URL dropped");
  // Identical data yields one asset with the same name whichever entry saw it first.
  mdict::ConvertResult twice = mdict::convert_html(
      R"(<img src="data:image/png;base64,iVBORw0KGgo="><img src="data:image/png;base64,iVBORw0KGgo=">)", {});
  check(twice.embedded_assets.size() == 1, "identical embedded assets deduplicated");
}

void test_depth_limit() {
  std::string html;
  for (int i = 0; i < 40; ++i) {
    html += "<div>";
  }
  html += "deep";
  for (int i = 0; i < 40; ++i) {
    html += "</div>";
  }
  mdict::ConvertOptions options;
  options.max_depth = 20;
  const std::string content = body(html, options);
  size_t divs = 0;
  for (size_t pos = content.find("{\"tag\":\"div\""); pos != std::string::npos;
       pos = content.find("{\"tag\":\"div\"", pos + 1)) {
    divs++;
  }
  check(divs == 19, "nesting flattened to the depth limit (19 nested divs under the root), got " + std::to_string(divs));
  check(content.find("deep") != std::string::npos, "deep text kept");
}

void test_apply_stylesheet() {
  const std::string sheet = "1\n<b>\n</b>\n2\n<i>\n</i>\n";
  check_eq(mdict::apply_stylesheet("`1`to eat`2` (ichidan)", sheet), "<b>to eat</b><i> (ichidan)</i>",
           "backtick styles expanded");
  check_eq(mdict::apply_stylesheet("plain `1`x\n`9`kept", sheet), "plain <b>x</b>\r\nkept",
           "line-ending segment, unknown style keeps text");
  check_eq(mdict::apply_stylesheet("no markers", sheet), "no markers", "no markers");
  check_eq(mdict::apply_stylesheet("`1`x", ""), "`1`x", "no stylesheet");
  check_eq(mdict::apply_stylesheet("a ` b `1`c", sheet), "a ` b <b>c</b>", "stray backtick is text");
}

void test_paths_and_css() {
  check_eq(mdict::normalize_asset_path("\\Images\\BG.PNG?x=1#frag"), "Images/BG.PNG", "backslashes, query, fragment");
  check_eq(mdict::normalize_asset_path("/images/space%20name.png"), "images/space name.png", "percent decoded");
  check_eq(mdict::normalize_asset_path("images/bad%ZZname.png"), "images/bad%ZZname.png", "malformed escape kept");
  check_eq(mdict::normalize_asset_path("../../etc/passwd"), "etc/passwd", "traversal collapsed");
  check_eq(mdict::normalize_asset_path("a/./b/../c"), "a/c", "dot segments");
  check_eq(mdict::normalize_asset_path("entry://x"), "", "scheme is not an asset");
  check_eq(mdict::normalize_asset_path("//host/x"), "", "protocol-relative is not an asset");
  check_eq(mdict::normalize_asset_path("file:///abs/x.png"), "abs/x.png", "file scheme stripped");
  check_eq(mdict::normalize_asset_path("../images/bg.png", "styles/extra.css"), "images/bg.png",
           "relative to stylesheet");
  check_eq(mdict::normalize_asset_path("./bg.png", "top.css"), "bg.png", "relative to top-level stylesheet");

  std::vector<std::string> refs;
  check_eq(mdict::rewrite_css_asset_urls(R"(a{background:url("../images/bg.png") ;b:URL( 'x.png' );c:url(data:x,y)})",
                                         "mdict-media/", "styles/extra.css", refs),
           R"(a{background:url("mdict-media/images/bg.png") ;b:url("mdict-media/x.png");c:url(data:x,y)})",
           "css url rewriting (only ./ and ../ resolve against the stylesheet path)");
  check(refs == std::vector<std::string>{"images/bg.png", "x.png"}, "css references collected");
  check_eq(mdict::rewrite_css_asset_urls("url(", "mdict-media/", "", refs), "url(", "unterminated url() kept");
  check_eq(mdict::encode_uri_component("a b/漢-_.!~*'()"), "a%20b%2F%E6%BC%A2-_.!~*'()", "encodeURIComponent");
}
}

int main() {
  test_basic_formatting();
  test_data_and_attributes();
  test_styles();
  test_links();
  test_images();
  test_depth_limit();
  test_apply_stylesheet();
  test_paths_and_css();
  if (failures == 0) {
    std::printf("ok\n");
  }
  return failures == 0 ? 0 : 1;
}
