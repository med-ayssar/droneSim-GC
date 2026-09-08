#include "px4_nats_bridge/px4_interface.hpp"

#include <algorithm>
#include <chrono>
#include <cmath>

namespace px4_nats_bridge {

namespace {
constexpr float kMainModeAuto = 4.0f;
constexpr float kMainModeOffboard = 6.0f;
constexpr float kSubModeAutoTakeoff = 2.0f;
constexpr float kSubModeAutoLoiter = 3.0f;
constexpr float kSubModeAutoRtl = 5.0f;
constexpr float kSubModeAutoLand = 6.0f;
} // namespace

Px4Interface::Px4Interface(rclcpp::Node::SharedPtr node) : node_(std::move(node)) {
  const auto qos = px4_qos();

  vehicle_command_pub_ =
      node_->create_publisher<px4_msgs::msg::VehicleCommand>("/fmu/in/vehicle_command", 10);
  offboard_control_mode_pub_ =
      node_->create_publisher<px4_msgs::msg::OffboardControlMode>("/fmu/in/offboard_control_mode", 10);
  trajectory_setpoint_pub_ =
      node_->create_publisher<px4_msgs::msg::TrajectorySetpoint>("/fmu/in/trajectory_setpoint", 10);

  auto on_status = [this](const px4_msgs::msg::VehicleStatus::SharedPtr msg) {
    std::lock_guard<std::mutex> lock(data_mutex_);
    current_status_ = *msg;
    status_received_ = true;
  };
  vehicle_status_sub_ = node_->create_subscription<px4_msgs::msg::VehicleStatus>(
      "/fmu/out/vehicle_status", qos, on_status);
  vehicle_status_v4_sub_ = node_->create_subscription<px4_msgs::msg::VehicleStatus>(
      "/fmu/out/vehicle_status_v4", qos, on_status);

  auto on_local = [this](const px4_msgs::msg::VehicleLocalPosition::SharedPtr msg) {
    std::lock_guard<std::mutex> lock(data_mutex_);
    current_local_ = *msg;
    pos_received_ = true;
  };
  local_position_sub_ = node_->create_subscription<px4_msgs::msg::VehicleLocalPosition>(
      "/fmu/out/vehicle_local_position", qos, on_local);
  local_position_v1_sub_ = node_->create_subscription<px4_msgs::msg::VehicleLocalPosition>(
      "/fmu/out/vehicle_local_position_v1", qos, on_local);

  attitude_sub_ = node_->create_subscription<px4_msgs::msg::VehicleAttitude>(
      "/fmu/out/vehicle_attitude", qos,
      [this](const px4_msgs::msg::VehicleAttitude::SharedPtr msg) {
        std::lock_guard<std::mutex> lock(data_mutex_);
        current_attitude_ = *msg;
      });

  battery_sub_ = node_->create_subscription<px4_msgs::msg::BatteryStatus>(
      "/fmu/out/battery_status", qos,
      [this](const px4_msgs::msg::BatteryStatus::SharedPtr msg) {
        std::lock_guard<std::mutex> lock(data_mutex_);
        current_battery_ = *msg;
      });

  gps_sub_ = node_->create_subscription<px4_msgs::msg::SensorGps>(
      "/fmu/out/vehicle_gps_position", qos,
      [this](const px4_msgs::msg::SensorGps::SharedPtr msg) {
        std::lock_guard<std::mutex> lock(data_mutex_);
        current_gps_ = *msg;
        gps_received_ = true;
      });
}

rclcpp::QoS Px4Interface::px4_qos() const {
  rclcpp::QoS qos(rclcpp::KeepLast(5));
  qos.best_effort();
  qos.durability_volatile();
  return qos;
}

void Px4Interface::send_vehicle_command(uint32_t command, float param1, float param2, float param3,
                                        float param4, float param5, float param6, float param7) {
  px4_msgs::msg::VehicleCommand msg{};
  msg.timestamp = node_->get_clock()->now().nanoseconds() / 1000;
  msg.command = command;
  msg.param1 = param1;
  msg.param2 = param2;
  msg.param3 = param3;
  msg.param4 = param4;
  msg.param5 = param5;
  msg.param6 = param6;
  msg.param7 = param7;
  msg.target_system = 1;
  msg.target_component = 1;
  msg.source_system = 1;
  msg.source_component = 1;
  msg.from_external = true;
  vehicle_command_pub_->publish(msg);
}

void Px4Interface::set_auto_mode(float sub_mode) {
  send_vehicle_command(px4_msgs::msg::VehicleCommand::VEHICLE_CMD_DO_SET_MODE, 1.0f, kMainModeAuto,
                       sub_mode);
}

bool Px4Interface::arm() {
  send_vehicle_command(px4_msgs::msg::VehicleCommand::VEHICLE_CMD_COMPONENT_ARM_DISARM, 1.0f);
  return true;
}

bool Px4Interface::disarm() {
  {
    std::lock_guard<std::mutex> lock(data_mutex_);
    stream_velocity_ = false;
  }
  send_vehicle_command(px4_msgs::msg::VehicleCommand::VEHICLE_CMD_COMPONENT_ARM_DISARM, 0.0f);
  return true;
}

bool Px4Interface::takeoff(double altitude_m) {
  arm();
  send_vehicle_command(px4_msgs::msg::VehicleCommand::VEHICLE_CMD_NAV_TAKEOFF,
                       0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f,
                       static_cast<float>(altitude_m));
  return true;
}

bool Px4Interface::land() {
  {
    std::lock_guard<std::mutex> lock(data_mutex_);
    stream_velocity_ = false;
  }
  set_auto_mode(kSubModeAutoLand);
  return true;
}

bool Px4Interface::rtl() {
  {
    std::lock_guard<std::mutex> lock(data_mutex_);
    stream_velocity_ = false;
  }
  set_auto_mode(kSubModeAutoRtl);
  return true;
}

bool Px4Interface::hold() {
  {
    std::lock_guard<std::mutex> lock(data_mutex_);
    stream_velocity_ = false;
  }
  set_auto_mode(kSubModeAutoLoiter);
  return true;
}

bool Px4Interface::offboard() {
  send_vehicle_command(px4_msgs::msg::VehicleCommand::VEHICLE_CMD_DO_SET_MODE, 1.0f,
                       kMainModeOffboard);
  return true;
}

bool Px4Interface::set_velocity(double vx, double vy, double vz, double yaw_rate) {
  std::lock_guard<std::mutex> lock(data_mutex_);
  vel_vx_ = vx;
  vel_vy_ = vy;
  vel_vz_ = vz;
  vel_yaw_rate_ = yaw_rate;
  stream_velocity_ = true;
  return true;
}

void Px4Interface::stream_offboard() {
  double vx = 0, vy = 0, vz = 0, yaw_rate = 0;
  bool stream = false;
  {
    std::lock_guard<std::mutex> lock(data_mutex_);
    stream = stream_velocity_;
    vx = vel_vx_;
    vy = vel_vy_;
    vz = vel_vz_;
    yaw_rate = vel_yaw_rate_;
  }
  if (!stream) {
    return;
  }

  px4_msgs::msg::OffboardControlMode ocm{};
  ocm.timestamp = node_->get_clock()->now().nanoseconds() / 1000;
  ocm.velocity = true;
  offboard_control_mode_pub_->publish(ocm);

  px4_msgs::msg::TrajectorySetpoint setpoint{};
  setpoint.timestamp = node_->get_clock()->now().nanoseconds() / 1000;
  setpoint.velocity[0] = static_cast<float>(vx);
  setpoint.velocity[1] = static_cast<float>(vy);
  setpoint.velocity[2] = static_cast<float>(vz);
  setpoint.yawspeed = static_cast<float>(yaw_rate);
  trajectory_setpoint_pub_->publish(setpoint);
}

drone::v1::DroneTelemetry Px4Interface::get_telemetry(const std::string &drone_id) {
  std::lock_guard<std::mutex> lock(data_mutex_);

  drone::v1::DroneTelemetry telem;
  telem.set_drone_id(drone_id);
  telem.set_timestamp_ms(static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::milliseconds>(
          std::chrono::system_clock::now().time_since_epoch())
          .count()));

  telem.set_connected(status_received_ || pos_received_);
  telem.set_armed(current_status_.arming_state == px4_msgs::msg::VehicleStatus::ARMING_STATE_ARMED);

  std::string mode_str = "UNKNOWN";
  switch (current_status_.nav_state) {
    case px4_msgs::msg::VehicleStatus::NAVIGATION_STATE_MANUAL:
      mode_str = "MANUAL";
      break;
    case px4_msgs::msg::VehicleStatus::NAVIGATION_STATE_ALTCTL:
      mode_str = "ALTCTL";
      break;
    case px4_msgs::msg::VehicleStatus::NAVIGATION_STATE_POSCTL:
      mode_str = "POSCTL";
      break;
    case px4_msgs::msg::VehicleStatus::NAVIGATION_STATE_OFFBOARD:
      mode_str = "OFFBOARD";
      break;
    case px4_msgs::msg::VehicleStatus::NAVIGATION_STATE_AUTO_TAKEOFF:
      mode_str = "TAKEOFF";
      break;
    case px4_msgs::msg::VehicleStatus::NAVIGATION_STATE_AUTO_LAND:
      mode_str = "LANDING";
      break;
    case px4_msgs::msg::VehicleStatus::NAVIGATION_STATE_AUTO_RTL:
      mode_str = "RTL";
      break;
    case px4_msgs::msg::VehicleStatus::NAVIGATION_STATE_AUTO_LOITER:
      mode_str = "HOLD";
      break;
    default:
      mode_str = status_received_ ? "AUTO" : "NO_PX4";
      break;
  }
  telem.set_flight_mode(mode_str);

  // Local NED z is down; UI height is up.
  const double alt_m = pos_received_ ? static_cast<double>(-current_local_.z) : 0.0;
  telem.set_altitude_m(alt_m);

  double lat = 0.0;
  double lon = 0.0;
  if (current_local_.ref_lat != 0.0 || current_local_.ref_lon != 0.0) {
    lat = current_local_.ref_lat + (current_local_.x / 111320.0);
    lon = current_local_.ref_lon +
          (current_local_.y / (111320.0 * std::cos(current_local_.ref_lat * M_PI / 180.0)));
  } else if (gps_received_) {
    lat = static_cast<double>(current_gps_.latitude_deg);
    lon = static_cast<double>(current_gps_.longitude_deg);
  }
  telem.set_latitude(lat);
  telem.set_longitude(lon);

  const float q0 = current_attitude_.q[0];
  const float q1 = current_attitude_.q[1];
  const float q2 = current_attitude_.q[2];
  const float q3 = current_attitude_.q[3];
  const double roll =
      std::atan2(2.0 * (q0 * q1 + q2 * q3), 1.0 - 2.0 * (q1 * q1 + q2 * q2));
  const double pitch =
      std::asin(std::max(-1.0f, std::min(1.0f, 2.0f * (q0 * q2 - q3 * q1))));
  const double yaw =
      std::atan2(2.0 * (q0 * q3 + q1 * q2), 1.0 - 2.0 * (q2 * q2 + q3 * q3));
  telem.set_roll(roll);
  telem.set_pitch(pitch);
  telem.set_yaw(yaw);

  double heading = yaw * 180.0 / M_PI;
  if (heading < 0.0) {
    heading += 360.0;
  }
  telem.set_heading_deg(heading);

  telem.set_battery_percentage(current_battery_.remaining * 100.0f);
  telem.set_gps_available(current_gps_.fix_type >= 3 || pos_received_);
  telem.set_satellites_visible(current_gps_.satellites_used);

  return telem;
}

} // namespace px4_nats_bridge
