// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include <string>

namespace hoshidicts::lang {

enum class NormalForm : unsigned char { NFC, NFD, NFKC, NFKD };

// Unicode normalisation with utf8proc, as String.prototype.normalize gives it.
void normalize(const std::u32string& in, NormalForm form, std::u32string& out);

}  // namespace hoshidicts::lang
