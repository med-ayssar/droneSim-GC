#ifndef PX4_NATS_BRIDGE_JSON_CODEC_HPP_
#define PX4_NATS_BRIDGE_JSON_CODEC_HPP_

#include <cctype>
#include <cmath>
#include <sstream>
#include <string>
#include <vector>

namespace px4_nats_bridge {
namespace json {

inline std::string escape(const std::string &in) {
  std::string out;
  out.reserve(in.size());
  for (char c : in) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      default: out += c; break;
    }
  }
  return out;
}

inline std::string skip_ws(const std::string &s, size_t &i) {
  while (i < s.size() && std::isspace(static_cast<unsigned char>(s[i]))) {
    ++i;
  }
  return s;
}

inline bool find_key(const std::string &json, const std::string &key, size_t &value_pos) {
  const std::string needle = "\"" + key + "\"";
  size_t pos = 0;
  while (true) {
    pos = json.find(needle, pos);
    if (pos == std::string::npos) {
      return false;
    }
    size_t i = pos + needle.size();
    skip_ws(json, i);
    if (i < json.size() && json[i] == ':') {
      ++i;
      skip_ws(json, i);
      value_pos = i;
      return true;
    }
    pos += needle.size();
  }
}

inline bool read_string(const std::string &json, const std::string &key, std::string &out) {
  size_t i = 0;
  if (!find_key(json, key, i) || i >= json.size() || json[i] != '"') {
    return false;
  }
  ++i;
  out.clear();
  while (i < json.size() && json[i] != '"') {
    if (json[i] == '\\' && i + 1 < json.size()) {
      out += json[i + 1];
      i += 2;
    } else {
      out += json[i++];
    }
  }
  return true;
}

inline bool read_number(const std::string &json, const std::string &key, double &out) {
  size_t i = 0;
  if (!find_key(json, key, i)) {
    return false;
  }
  try {
    size_t consumed = 0;
    out = std::stod(json.substr(i), &consumed);
    return consumed > 0;
  } catch (...) {
    return false;
  }
}

inline bool read_bool(const std::string &json, const std::string &key, bool &out) {
  size_t i = 0;
  if (!find_key(json, key, i)) {
    return false;
  }
  if (json.compare(i, 4, "true") == 0) {
    out = true;
    return true;
  }
  if (json.compare(i, 5, "false") == 0) {
    out = false;
    return true;
  }
  return false;
}

inline std::string number(double v) {
  if (!std::isfinite(v)) {
    return "0";
  }
  std::ostringstream ss;
  ss.setf(std::ios::fixed);
  ss.precision(8);
  ss << v;
  return ss.str();
}

} // namespace json
} // namespace px4_nats_bridge

#endif // PX4_NATS_BRIDGE_JSON_CODEC_HPP_
