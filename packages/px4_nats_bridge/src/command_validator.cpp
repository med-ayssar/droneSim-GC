#include "px4_nats_bridge/command_validator.hpp"

#include <cmath>

namespace px4_nats_bridge {

ValidationResult CommandValidator::validate(const drone::v1::DroneCommand &command, const std::string &expected_drone_id) {
  if (command.request_id().empty()) {
    return {false, "Missing request_id"};
  }

  if (!expected_drone_id.empty() && command.drone_id() != expected_drone_id) {
    return {false, "Drone ID mismatch: received '" + command.drone_id() + "', expected '" + expected_drone_id + "'"};
  }

  if (command.command() == drone::v1::COMMAND_TYPE_UNSPECIFIED) {
    return {false, "Unspecified command type"};
  }

  if (command.command() < drone::v1::COMMAND_TYPE_ARM ||
      command.command() > drone::v1::COMMAND_TYPE_SET_VELOCITY) {
    return {false, "Unknown command type"};
  }

  if (command.command() == drone::v1::COMMAND_TYPE_TAKEOFF) {
    if (command.takeoff().altitude_m() <= 0.0 || command.takeoff().altitude_m() > 100.0) {
      return {false, "Takeoff altitude out of bounds (allowed: 0.5m - 100m)"};
    }
  }

  if (command.command() == drone::v1::COMMAND_TYPE_SET_VELOCITY) {
    const auto &velocity = command.velocity();
    constexpr double kMaxVelocityMps = 15.0;
    constexpr double kMaxYawRateRadS = 2.0;
    if (!std::isfinite(velocity.vx_m_s()) || !std::isfinite(velocity.vy_m_s()) ||
        !std::isfinite(velocity.vz_m_s()) || !std::isfinite(velocity.yaw_rate_rad_s()) ||
        std::abs(velocity.vx_m_s()) > kMaxVelocityMps ||
        std::abs(velocity.vy_m_s()) > kMaxVelocityMps ||
        std::abs(velocity.vz_m_s()) > kMaxVelocityMps ||
        std::abs(velocity.yaw_rate_rad_s()) > kMaxYawRateRadS) {
      return {false, "Velocity setpoint exceeds safety limits"};
    }
  }

  return {true, "OK"};
}

} // namespace px4_nats_bridge
