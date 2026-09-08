#include "px4_nats_bridge/command_deserializer.hpp"
#include "px4_nats_bridge/json_codec.hpp"

#include <string>

namespace px4_nats_bridge {

namespace {

drone::v1::CommandType parse_command_type(const std::string &json) {
  std::string named;
  if (json::read_string(json, "command", named)) {
    if (named == "ARM" || named == "COMMAND_TYPE_ARM") return drone::v1::COMMAND_TYPE_ARM;
    if (named == "DISARM" || named == "COMMAND_TYPE_DISARM") return drone::v1::COMMAND_TYPE_DISARM;
    if (named == "TAKEOFF" || named == "COMMAND_TYPE_TAKEOFF") return drone::v1::COMMAND_TYPE_TAKEOFF;
    if (named == "LAND" || named == "COMMAND_TYPE_LAND") return drone::v1::COMMAND_TYPE_LAND;
    if (named == "RTL" || named == "COMMAND_TYPE_RTL") return drone::v1::COMMAND_TYPE_RTL;
    if (named == "HOLD" || named == "COMMAND_TYPE_HOLD") return drone::v1::COMMAND_TYPE_HOLD;
    if (named == "OFFBOARD" || named == "COMMAND_TYPE_OFFBOARD") return drone::v1::COMMAND_TYPE_OFFBOARD;
    if (named == "SET_VELOCITY" || named == "COMMAND_TYPE_SET_VELOCITY") {
      return drone::v1::COMMAND_TYPE_SET_VELOCITY;
    }
  }
  double num = 0;
  if (json::read_number(json, "command", num)) {
    return static_cast<drone::v1::CommandType>(static_cast<int>(num));
  }
  return drone::v1::COMMAND_TYPE_UNSPECIFIED;
}

bool parse_json_command(const std::string &json, drone::v1::DroneCommand &out) {
  std::string request_id;
  std::string drone_id;
  json::read_string(json, "request_id", request_id);
  json::read_string(json, "drone_id", drone_id);
  if (request_id.empty() && drone_id.empty()) {
    return false;
  }
  out.set_request_id(request_id);
  out.set_drone_id(drone_id);

  double ts = 0;
  if (json::read_number(json, "timestamp_ms", ts)) {
    out.set_timestamp_ms(static_cast<uint64_t>(ts));
  }
  out.set_command(parse_command_type(json));

  double alt = 0;
  if (json::read_number(json, "altitude_m", alt) && alt > 0) {
    out.mutable_takeoff()->set_altitude_m(alt);
  }
  double vx = 0, vy = 0, vz = 0, yaw = 0;
  const bool has_v = json::read_number(json, "vx_m_s", vx) || json::read_number(json, "vx", vx);
  json::read_number(json, "vy_m_s", vy);
  json::read_number(json, "vy", vy);
  json::read_number(json, "vz_m_s", vz);
  json::read_number(json, "vz", vz);
  json::read_number(json, "yaw_rate_rad_s", yaw);
  json::read_number(json, "yaw_rate", yaw);
  if (has_v || out.command() == drone::v1::COMMAND_TYPE_SET_VELOCITY) {
    auto *vel = out.mutable_velocity();
    vel->set_vx_m_s(vx);
    vel->set_vy_m_s(vy);
    vel->set_vz_m_s(vz);
    vel->set_yaw_rate_rad_s(yaw);
  }
  return !out.request_id().empty();
}

} // namespace

bool CommandDeserializer::deserialize(const std::vector<uint8_t> &buffer,
                                      drone::v1::DroneCommand &command_out) {
  if (buffer.empty()) {
    return false;
  }

  if (command_out.ParseFromArray(buffer.data(), static_cast<int>(buffer.size())) &&
      !command_out.request_id().empty()) {
    return true;
  }
  command_out.Clear();

  const std::string text(buffer.begin(), buffer.end());
  return parse_json_command(text, command_out);
}

} // namespace px4_nats_bridge
