// SPDX-License-Identifier: GPL-3.0-or-later
#include "unicode.hpp"

#include <utf8proc.h>

#include <cstdlib>

#include "classes.hpp"

namespace hoshidicts::lang {

void normalize(const std::u32string& in, NormalForm form, std::u32string& out) {
  int options = UTF8PROC_STABLE;
  switch (form) {
    case NormalForm::NFC:
      options |= UTF8PROC_COMPOSE;
      break;
    case NormalForm::NFD:
      options |= UTF8PROC_DECOMPOSE;
      break;
    case NormalForm::NFKC:
      options |= UTF8PROC_COMPOSE | UTF8PROC_COMPAT;
      break;
    case NormalForm::NFKD:
      options |= UTF8PROC_DECOMPOSE | UTF8PROC_COMPAT;
      break;
  }
  const std::string utf8 = to_utf8(in);
  if (utf8.empty()) {
    out.clear();
    return;
  }
  utf8proc_uint8_t* result = nullptr;
  const utf8proc_ssize_t length =
      utf8proc_map(reinterpret_cast<const utf8proc_uint8_t*>(utf8.data()), static_cast<utf8proc_ssize_t>(utf8.size()),
                   &result, static_cast<utf8proc_option_t>(options));
  if (length < 0 || result == nullptr) {
    std::free(result);
    out = in;
    return;
  }
  if (!decode_utf8(std::string_view(reinterpret_cast<const char*>(result), static_cast<size_t>(length)), out)) {
    out = in;
  }
  std::free(result);
}

}  // namespace hoshidicts::lang
