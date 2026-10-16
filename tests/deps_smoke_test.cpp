// Proves the vendored lzokay and gumbo-parser libraries compile, link and do
// what the MDX importer needs from them: an LZO1X round trip and an HTML
// fragment parse that yields the expected tree.
#include <lzokay.hpp>
#include <nokogiri_gumbo.h>

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace {
int failures = 0;

void check(bool ok, const char* what) {
  if (!ok) {
    std::printf("FAIL %s\n", what);
    failures++;
  }
}

void test_lzokay() {
  std::string text;
  for (int i = 0; i < 200; ++i) {
    text += "見出し語の説明文 " + std::to_string(i % 7) + " repeated text, ";
  }
  std::vector<uint8_t> compressed(lzokay::compress_worst_size(text.size()));
  size_t compressed_size = 0;
  auto result = lzokay::compress(reinterpret_cast<const uint8_t*>(text.data()), text.size(), compressed.data(),
                                 compressed.size(), compressed_size);
  check(result == lzokay::EResult::Success, "lzokay compress");
  check(compressed_size < text.size() / 2, "lzokay compressed the repetitive text");

  std::vector<uint8_t> decompressed(text.size());
  size_t decompressed_size = 0;
  result = lzokay::decompress(compressed.data(), compressed_size, decompressed.data(), decompressed.size(),
                              decompressed_size);
  check(result == lzokay::EResult::Success, "lzokay decompress");
  check(decompressed_size == text.size() &&
            std::memcmp(decompressed.data(), text.data(), text.size()) == 0,
        "lzokay round trip");

  // A too-small output buffer is reported, not written past.
  std::vector<uint8_t> small(16);
  result = lzokay::decompress(compressed.data(), compressed_size, small.data(), small.size(), decompressed_size);
  check(result == lzokay::EResult::OutputOverrun, "lzokay output overrun detected");
}

const GumboNode* first_element_child(const GumboNode* node) {
  for (unsigned int i = 0; i < node->v.element.children.length; ++i) {
    auto* child = static_cast<const GumboNode*>(node->v.element.children.data[i]);
    if (child->type == GUMBO_NODE_ELEMENT) {
      return child;
    }
  }
  return nullptr;
}

void test_gumbo() {
  const char* html = "<p class=\"x\">見<b>出</b>し&amp;<br>語</p><img src=\"a.png\">";
  GumboOptions options = kGumboDefaultOptions;
  options.fragment_context = "body";
  GumboOutput* output = gumbo_parse_with_options(&options, html, std::strlen(html));
  check(output != nullptr, "gumbo parse");
  if (!output) {
    return;
  }
  // Fragment parsing puts the children directly under the synthetic <html> root.
  const GumboNode* root = output->root;
  check(root->type == GUMBO_NODE_ELEMENT && root->v.element.tag == GUMBO_TAG_HTML, "gumbo root is <html>");
  const GumboNode* p = first_element_child(root);
  check(p && p->v.element.tag == GUMBO_TAG_P, "gumbo first child is <p>");
  if (p) {
    const GumboAttribute* cls = gumbo_get_attribute(&p->v.element.attributes, "class");
    check(cls && std::strcmp(cls->value, "x") == 0, "gumbo attribute value");
    check(p->v.element.children.length == 5, "gumbo <p> has text, <b>, text, <br>, text");
    auto* text = static_cast<const GumboNode*>(p->v.element.children.data[2]);
    check(text->type == GUMBO_NODE_TEXT && std::strcmp(text->v.text.text, "し&") == 0,
          "gumbo decodes character references");
  }
  gumbo_destroy_output(output);
}
}

int main() {
  test_lzokay();
  test_gumbo();
  if (failures == 0) {
    std::printf("ok\n");
  }
  return failures == 0 ? 0 : 1;
}
