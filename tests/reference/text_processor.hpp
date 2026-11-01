#pragma once

#include <string>
#include <string_view>
#include <vector>

namespace hoshidicts_legacy {

struct TextVariant {
  std::string text;
  int steps;
};

namespace text_processor {
std::vector<TextVariant> process(std::string_view src);
}
}  // namespace hoshidicts_legacy
