// SPDX-License-Identifier: GPL-3.0-or-later
// A small JSON reader for language packs (RFC 8259). It replaces a generic
// JSON tree on the pack-loading path: one pass, values stored contiguously,
// strings without escapes viewed in the source, so a pack loads quickly and
// the code a WebAssembly engine compiles for its first load stays small
// (docs/languages.md, section 13). Objects keep their members in file order;
// a repeated key is an error.
#pragma once

#include <cstddef>
#include <cstdint>
#include <deque>
#include <string>
#include <string_view>
#include <vector>

namespace hoshidicts::lang::json {

class Value;

class Array {
 public:
  Array() = default;
  Array(const Value* first, size_t count) : first_(first), count_(count) {}
  size_t size() const { return count_; }
  bool empty() const { return count_ == 0; }
  const Value& operator[](size_t i) const;
  const Value* begin() const { return first_; }
  const Value* end() const;

 private:
  const Value* first_ = nullptr;
  size_t count_ = 0;
};

class Object {
 public:
  struct Member {
    std::string_view first;
    const Value& second;
  };
  class iterator {
   public:
    explicit iterator(const Value* at) : at_(at) {}
    Member operator*() const;
    iterator& operator++();
    bool operator!=(const iterator& other) const { return at_ != other.at_; }
    bool operator==(const iterator& other) const { return at_ == other.at_; }

   private:
    const Value* at_;
  };

  Object() = default;
  Object(const Value* first, size_t count) : first_(first), count_(count) {}
  size_t size() const { return count_; }
  bool empty() const { return count_ == 0; }
  iterator begin() const { return iterator(first_); }
  iterator end() const;
  // The member with this key, or nullptr.
  const Value* find(std::string_view key) const;

 private:
  const Value* first_ = nullptr;
  size_t count_ = 0;
};

class Value {
 public:
  enum class Type : uint8_t { Null, Boolean, Number, String, Array, Object };

  bool is_null() const { return type_ == Type::Null; }
  bool is_boolean() const { return type_ == Type::Boolean; }
  bool is_number() const { return type_ == Type::Number; }
  bool is_string() const { return type_ == Type::String; }
  bool is_array() const { return type_ == Type::Array; }
  bool is_object() const { return type_ == Type::Object; }

  bool get_boolean() const { return boolean_; }
  double get_number() const { return number_; }
  std::string_view get_string() const { return string_; }
  Array get_array() const { return Array(children_, count_); }
  Object get_object() const { return Object(children_, count_); }
  // The key of an object member.
  std::string_view key() const { return key_; }

 private:
  friend class Document;
  friend struct Parser;
  Type type_ = Type::Null;
  bool boolean_ = false;
  double number_ = 0;
  std::string_view string_;
  std::string_view key_;
  uint32_t first_ = 0;  // index of the first child while parsing
  uint32_t count_ = 0;
  const Value* children_ = nullptr;
};

inline const Value& Array::operator[](size_t i) const { return first_[i]; }
inline const Value* Array::end() const { return first_ + count_; }
inline Object::Member Object::iterator::operator*() const { return Member{at_->key(), *at_}; }
inline Object::iterator& Object::iterator::operator++() {
  ++at_;
  return *this;
}
inline Object::iterator Object::end() const { return iterator(first_ + count_); }

inline const Value* Object::find(std::string_view key) const {
  for (size_t i = 0; i < count_; ++i) {
    if (first_[i].key() == key) return &first_[i];
  }
  return nullptr;
}

class Document {
 public:
  // Parses `text`, which must outlive the document. On a problem returns
  // false and sets `error` to the reason and its line and column.
  bool parse(std::string_view text, std::string* error);
  const Value& root() const { return root_; }

 private:
  std::vector<Value> nodes_;
  std::deque<std::string> strings_;  // strings with escapes, decoded
  Value root_;
};

}  // namespace hoshidicts::lang::json
