// PX4 offboard mission (ROS 2, C++).
//
// Sequence:
//   1. Wait for /fmu/out/vehicle_local_position and record home.
//   2. Stream OffboardControlMode + TrajectorySetpoint at >2 Hz.
//   3. Switch to Offboard, arm, take off above home.
//   4. Fly to N random local waypoints (NED).
//   5. Return to the takeoff point and land.
//
// PX4 v1.14+ topics: /fmu/in/* go INTO the FMU, /fmu/out/* come OUT.
// Local frame is NED: +x north, +y east, +z down (so altitude 5 m is z = -5).
//
// Requires Micro XRCE-DDS Agent + PX4 SITL (or hardware) already running:
//   MicroXRCEAgent udp4 -p 8888
//   cd ~/Tools/PX4-Autopilot && make px4_sitl gz_x500
//   ros2 launch offboard_mission offboard_mission.launch.py \
//        num_waypoints:=5 start_lat:=50.7753 start_lon:=6.0839 start_alt:=173.0

#include <px4_msgs/msg/offboard_control_mode.hpp>
#include <px4_msgs/msg/trajectory_setpoint.hpp>
#include <px4_msgs/msg/vehicle_command.hpp>
#include <px4_msgs/msg/vehicle_command_ack.hpp>
#include <px4_msgs/msg/vehicle_land_detected.hpp>
#include <px4_msgs/msg/vehicle_local_position.hpp>
#include <px4_msgs/msg/vehicle_status.hpp>
#include <rclcpp/rclcpp.hpp>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <limits>
#include <random>
#include <string>
#include <vector>

using namespace std::chrono_literals;
using px4_msgs::msg::OffboardControlMode;
using px4_msgs::msg::TrajectorySetpoint;
using px4_msgs::msg::VehicleCommand;
using px4_msgs::msg::VehicleCommandAck;
using px4_msgs::msg::VehicleLandDetected;
using px4_msgs::msg::VehicleLocalPosition;
using px4_msgs::msg::VehicleStatus;

namespace {

constexpr float kNaNf = std::numeric_limits<float>::quiet_NaN();
constexpr double kNaNd = std::numeric_limits<double>::quiet_NaN();

// PX4 custom mode values (see px4_custom_mode.h). Not all are in px4_msgs.
constexpr float kMainModeOffboard = 6.0f;
constexpr float kMainModeAuto = 4.0f;
constexpr float kSubModeAutoLand = 6.0f;

struct NedPoint {
  float x{0.0f};
  float y{0.0f};
  float z{0.0f};
};

float distance(const NedPoint &a, const NedPoint &b) {
  const float dx = a.x - b.x;
  const float dy = a.y - b.y;
  const float dz = a.z - b.z;
  return std::sqrt(dx * dx + dy * dy + dz * dz);
}

float horizontal_distance(const NedPoint &a, const NedPoint &b) {
  const float dx = a.x - b.x;
  const float dy = a.y - b.y;
  return std::sqrt(dx * dx + dy * dy);
}

// Heading in NED: 0 = north, positive clockwise toward east.
float yaw_ned(const NedPoint &from, const NedPoint &to) {
  return std::atan2(to.y - from.y, to.x - from.x);
}

const char *state_name(uint8_t nav_state) {
  switch (nav_state) {
  case VehicleStatus::NAVIGATION_STATE_MANUAL:
    return "MANUAL";
  case VehicleStatus::NAVIGATION_STATE_ALTCTL:
    return "ALTCTL";
  case VehicleStatus::NAVIGATION_STATE_POSCTL:
    return "POSCTL";
  case VehicleStatus::NAVIGATION_STATE_AUTO_MISSION:
    return "AUTO_MISSION";
  case VehicleStatus::NAVIGATION_STATE_AUTO_LOITER:
    return "AUTO_LOITER";
  case VehicleStatus::NAVIGATION_STATE_AUTO_RTL:
    return "AUTO_RTL";
  case VehicleStatus::NAVIGATION_STATE_OFFBOARD:
    return "OFFBOARD";
  case VehicleStatus::NAVIGATION_STATE_AUTO_TAKEOFF:
    return "AUTO_TAKEOFF";
  case VehicleStatus::NAVIGATION_STATE_AUTO_LAND:
    return "AUTO_LAND";
  default:
    return "OTHER";
  }
}

} // namespace

class OffboardMission : public rclcpp::Node {
public:
  OffboardMission() : Node("offboard_mission") {
    declare_parameters();
    load_parameters();

    rclcpp::QoS px4_qos(rclcpp::KeepLast(5));
    px4_qos.best_effort();
    px4_qos.durability_volatile();

    offboard_mode_pub_ = create_publisher<OffboardControlMode>(
        "/fmu/in/offboard_control_mode", 10);
    trajectory_pub_ =
        create_publisher<TrajectorySetpoint>("/fmu/in/trajectory_setpoint", 10);
    vehicle_command_pub_ =
        create_publisher<VehicleCommand>("/fmu/in/vehicle_command", 10);

    local_position_sub_ = create_subscription<VehicleLocalPosition>(
        "/fmu/out/vehicle_local_position_v1", px4_qos,
        [this](const VehicleLocalPosition::SharedPtr msg) {
          on_local_position(*msg);
        });

    vehicle_status_sub_ = create_subscription<VehicleStatus>(
        "/fmu/out/vehicle_status_v4", px4_qos,
        [this](const VehicleStatus::SharedPtr msg) { on_vehicle_status(*msg); });

    land_detected_sub_ = create_subscription<VehicleLandDetected>(
        "/fmu/out/vehicle_land_detected", px4_qos,
        [this](const VehicleLandDetected::SharedPtr msg) {
          landed_ = msg->landed;
        });

    command_ack_sub_ = create_subscription<VehicleCommandAck>(
        "/fmu/out/vehicle_command_ack_v1", px4_qos,
        [this](const VehicleCommandAck::SharedPtr msg) { on_command_ack(*msg); });

    const auto period =
        std::chrono::duration<double>(1.0 / setpoint_rate_hz_);
    timer_ = create_wall_timer(
        std::chrono::duration_cast<std::chrono::nanoseconds>(period),
        [this]() { on_timer(); });

    RCLCPP_INFO(get_logger(),
                "Offboard mission ready: n=%d takeoff=%.1f m xy_range=%.1f m "
                "rate=%.1f Hz",
                num_waypoints_, takeoff_altitude_, waypoint_xy_range_,
                setpoint_rate_hz_);
    RCLCPP_INFO(get_logger(),
                "Start coordinate (WGS84): lat=%.7f lon=%.7f alt=%.1f m AMSL",
                start_lat_, start_lon_, start_alt_);
  }

private:
  enum class Phase {
    WaitForPx4,
    StreamSetpoints,
    ArmOffboard,
    Takeoff,
    FlyWaypoints,
    ReturnHome,
    Land,
    Done,
    Failed,
  };

  void declare_parameters() {
    declare_parameter("num_waypoints", 5);
    declare_parameter("takeoff_altitude", 5.0);
    declare_parameter("waypoint_xy_range", 8.0);
    declare_parameter("waypoint_alt_min", 4.0);
    declare_parameter("waypoint_alt_max", 8.0);
    declare_parameter("acceptance_radius", 0.6);
    declare_parameter("hover_time", 1.5);
    declare_parameter("waypoint_timeout", 30.0);
    declare_parameter("setpoint_rate_hz", 10.0);
    declare_parameter("random_seed", 0);
    // WGS84 start pose. Defaults are Aachen, Germany (city centre).
    declare_parameter("start_lat", 50.7753);
    declare_parameter("start_lon", 6.0839);
    declare_parameter("start_alt", 173.0);
  }

  void load_parameters() {
    num_waypoints_ = std::max(static_cast<long int>(1), get_parameter("num_waypoints").as_int());
    takeoff_altitude_ =
        static_cast<float>(get_parameter("takeoff_altitude").as_double());
    waypoint_xy_range_ =
        static_cast<float>(get_parameter("waypoint_xy_range").as_double());
    waypoint_alt_min_ =
        static_cast<float>(get_parameter("waypoint_alt_min").as_double());
    waypoint_alt_max_ =
        static_cast<float>(get_parameter("waypoint_alt_max").as_double());
    acceptance_radius_ =
        static_cast<float>(get_parameter("acceptance_radius").as_double());
    hover_time_ = get_parameter("hover_time").as_double();
    waypoint_timeout_ = get_parameter("waypoint_timeout").as_double();
    setpoint_rate_hz_ =
        std::max(5.0, get_parameter("setpoint_rate_hz").as_double());
    random_seed_ = get_parameter("random_seed").as_int();
    start_lat_ = get_parameter("start_lat").as_double();
    start_lon_ = get_parameter("start_lon").as_double();
    start_alt_ = static_cast<float>(get_parameter("start_alt").as_double());

    if (waypoint_alt_max_ < waypoint_alt_min_) {
      std::swap(waypoint_alt_min_, waypoint_alt_max_);
    }
  }

  void on_local_position(const VehicleLocalPosition &msg) {
    have_position_ = msg.xy_valid && msg.z_valid;
    position_ = {msg.x, msg.y, msg.z};
    if (msg.heading_good_for_control) {
      yaw_ = msg.heading;
    }
    if (have_position_ && !have_home_) {
      home_ = position_;
      home_yaw_ = yaw_;
      have_home_ = true;
      takeoff_ = {home_.x, home_.y, home_.z - takeoff_altitude_};
      setpoint_ = home_;
      setpoint_yaw_ = home_yaw_;
      RCLCPP_INFO(get_logger(),
                  "Home locked NED (%.2f, %.2f, %.2f) heading=%.2f rad",
                  home_.x, home_.y, home_.z, home_yaw_);
    }
  }

  void on_vehicle_status(const VehicleStatus &msg) {
    armed_ = msg.arming_state == VehicleStatus::ARMING_STATE_ARMED;
    nav_state_ = msg.nav_state;
  }

  void on_command_ack(const VehicleCommandAck &msg) {
    RCLCPP_INFO(get_logger(), "VehicleCommand ACK cmd=%u result=%u",
                msg.command, msg.result);
  }

  void on_timer() {
    switch (phase_) {
    case Phase::WaitForPx4:
      tick_wait_for_px4();
      break;
    case Phase::StreamSetpoints:
      tick_stream_setpoints();
      break;
    case Phase::ArmOffboard:
      tick_arm_offboard();
      break;
    case Phase::Takeoff:
      tick_takeoff();
      break;
    case Phase::FlyWaypoints:
      tick_fly_waypoints();
      break;
    case Phase::ReturnHome:
      tick_return_home();
      break;
    case Phase::Land:
      tick_land();
      break;
    case Phase::Done:
    case Phase::Failed:
      break;
    }

    if (should_stream_offboard()) {
      publish_offboard_control_mode();
      publish_trajectory_setpoint();
    }

    log_status_throttled();
  }

  bool should_stream_offboard() const {
    // Keep the offboard stream alive until PX4 actually leaves Offboard
    // (NAV_LAND / AUTO.LAND). Dropping it too early can trigger a failsafe.
    const bool still_offboard =
        nav_state_ == VehicleStatus::NAVIGATION_STATE_OFFBOARD;
    return phase_ == Phase::StreamSetpoints || phase_ == Phase::ArmOffboard ||
           phase_ == Phase::Takeoff || phase_ == Phase::FlyWaypoints ||
           phase_ == Phase::ReturnHome ||
           (phase_ == Phase::Land && still_offboard);
  }

  void tick_wait_for_px4() {
    if (seconds_since(last_origin_command_time_) >= 1.0) {
      last_origin_command_time_ = now();
      send_global_origin();
    }
    if (!have_home_) {
      return;
    }
    stream_ticks_ = 0;
    set_phase(Phase::StreamSetpoints);
  }

  void tick_stream_setpoints() {
    // PX4 rejects Offboard until it has been receiving setpoints.
    ++stream_ticks_;
    if (stream_ticks_ >= static_cast<int>(setpoint_rate_hz_)) {
      last_command_time_ = now();
      send_offboard_mode();
      send_arm();
      set_phase(Phase::ArmOffboard);
    }
  }

  void tick_arm_offboard() {
    const bool offboard =
        nav_state_ == VehicleStatus::NAVIGATION_STATE_OFFBOARD;
    if (armed_ && offboard) {
      setpoint_ = takeoff_;
      setpoint_yaw_ = home_yaw_;
      waypoint_enter_time_ = now();
      hovering_ = false;
      set_phase(Phase::Takeoff);
      return;
    }

    if (seconds_since(last_command_time_) >= 0.5) {
      last_command_time_ = now();
      if (!offboard) {
        send_offboard_mode();
      }
      if (!armed_) {
        send_arm();
      }
    }

    if (seconds_since(phase_enter_time_) > 20.0) {
      fail("timed out waiting to arm / enter Offboard");
    }
  }

  void tick_takeoff() {
    setpoint_ = takeoff_;
    setpoint_yaw_ = home_yaw_;
    if (!reached(takeoff_)) {
      if (seconds_since(waypoint_enter_time_) > waypoint_timeout_) {
        fail("takeoff timed out");
      }
      return;
    }
    if (hover_remaining()) {
      return;
    }
    generate_waypoints();
    if (waypoints_.empty()) {
      RCLCPP_WARN(get_logger(),
                  "No random waypoints generated, returning home to land");
      begin_waypoint(takeoff_);
      set_phase(Phase::ReturnHome);
      return;
    }
    waypoint_index_ = 0;
    begin_waypoint(waypoints_.front());
    set_phase(Phase::FlyWaypoints);
  }

  void tick_fly_waypoints() {
    if (waypoint_index_ >= waypoints_.size()) {
      begin_waypoint(takeoff_);
      set_phase(Phase::ReturnHome);
      return;
    }

    const NedPoint &target = waypoints_[waypoint_index_];
    setpoint_ = target;
    if (horizontal_distance(position_, target) > 1.0f) {
      setpoint_yaw_ = yaw_ned(position_, target);
    }

    if (!reached(target)) {
      if (seconds_since(waypoint_enter_time_) > waypoint_timeout_) {
        RCLCPP_WARN(get_logger(),
                    "Waypoint %zu/%zu timed out, continuing",
                    waypoint_index_ + 1, waypoints_.size());
        advance_waypoint();
      }
      return;
    }
    if (hover_remaining()) {
      return;
    }
    advance_waypoint();
  }

  void tick_return_home() {
    setpoint_ = takeoff_;
    setpoint_yaw_ = home_yaw_;
    if (!reached(takeoff_)) {
      if (seconds_since(waypoint_enter_time_) > waypoint_timeout_) {
        fail("return-to-start timed out");
      }
      return;
    }
    if (hover_remaining()) {
      return;
    }
    last_command_time_ = now();
    send_land();
    set_phase(Phase::Land);
  }

  void tick_land() {
    const bool landing =
        nav_state_ == VehicleStatus::NAVIGATION_STATE_AUTO_LAND;

    if (!armed_ || landed_) {
      if (armed_) {
        send_disarm();
      }
      RCLCPP_INFO(get_logger(),
                  "Mission complete. Landed at NED (%.2f, %.2f, %.2f).",
                  position_.x, position_.y, position_.z);
      set_phase(Phase::Done);
      rclcpp::shutdown();
      return;
    }

    if (!landing && seconds_since(last_command_time_) >= 2.0) {
      last_command_time_ = now();
      send_land();
    }

    if (seconds_since(phase_enter_time_) > 45.0) {
      fail("landing timed out");
    }
  }

  void advance_waypoint() {
    ++waypoint_index_;
    if (waypoint_index_ >= waypoints_.size()) {
      RCLCPP_INFO(get_logger(), "All waypoints reached, returning to start");
      begin_waypoint(takeoff_);
      set_phase(Phase::ReturnHome);
      return;
    }
    begin_waypoint(waypoints_[waypoint_index_]);
  }

  void begin_waypoint(const NedPoint &target) {
    setpoint_ = target;
    setpoint_yaw_ = yaw_ned(position_, target);
    waypoint_enter_time_ = now();
    hovering_ = false;
    if (phase_ == Phase::FlyWaypoints || phase_ == Phase::Takeoff) {
      RCLCPP_INFO(get_logger(),
                  "Going to waypoint %zu/%zu  NED (%.2f, %.2f, %.2f)  "
                  "alt=%.2f m",
                  std::min(waypoint_index_ + 1, waypoints_.size()),
                  waypoints_.size(), target.x, target.y, target.z, -target.z);
    }
  }

  bool reached(const NedPoint &target) const {
    return distance(position_, target) <= acceptance_radius_;
  }

  bool hover_remaining() {
    if (!hovering_) {
      hovering_ = true;
      hover_start_time_ = now();
    }
    return seconds_since(hover_start_time_) < hover_time_;
  }

  void generate_waypoints() {
    waypoints_.clear();
    waypoints_.reserve(static_cast<size_t>(num_waypoints_));

    if (random_seed_ == 0) {
      rng_.seed(std::random_device{}());
    } else {
      rng_.seed(static_cast<std::mt19937::result_type>(random_seed_));
    }

    std::uniform_real_distribution<float> dx(-waypoint_xy_range_,
                                             waypoint_xy_range_);
    std::uniform_real_distribution<float> dy(-waypoint_xy_range_,
                                             waypoint_xy_range_);
    std::uniform_real_distribution<float> alt(waypoint_alt_min_,
                                              waypoint_alt_max_);

    constexpr float kMinSeparation = 2.0f;
    int attempts = 0;
    while (static_cast<int>(waypoints_.size()) < num_waypoints_ &&
           attempts < 2000) {
      ++attempts;
      NedPoint wp;
      wp.x = home_.x + dx(rng_);
      wp.y = home_.y + dy(rng_);
      wp.z = home_.z - alt(rng_);

      if (horizontal_distance(wp, home_) < kMinSeparation) {
        continue;
      }
      if (!waypoints_.empty() &&
          horizontal_distance(wp, waypoints_.back()) < kMinSeparation) {
        continue;
      }
      waypoints_.push_back(wp);
    }

    // If the box is too small for the separation check, fill anyway.
    while (static_cast<int>(waypoints_.size()) < num_waypoints_) {
      NedPoint wp;
      wp.x = home_.x + dx(rng_);
      wp.y = home_.y + dy(rng_);
      wp.z = home_.z - alt(rng_);
      waypoints_.push_back(wp);
    }

    RCLCPP_INFO(get_logger(), "Generated %zu random waypoints:",
                waypoints_.size());
    for (size_t i = 0; i < waypoints_.size(); ++i) {
      const auto &wp = waypoints_[i];
      RCLCPP_INFO(get_logger(),
                  "  [%zu] N=%.2f E=%.2f D=%.2f  (alt %.2f m)", i + 1, wp.x,
                  wp.y, wp.z, -wp.z);
    }
  }

  void publish_offboard_control_mode() {
    OffboardControlMode msg{};
    msg.position = true;
    msg.velocity = false;
    msg.acceleration = false;
    msg.attitude = false;
    msg.body_rate = false;
    msg.timestamp = now_us();
    offboard_mode_pub_->publish(msg);
  }

  void publish_trajectory_setpoint() {
    TrajectorySetpoint msg{};
    msg.position = {setpoint_.x, setpoint_.y, setpoint_.z};
    msg.velocity = {kNaNf, kNaNf, kNaNf};
    msg.acceleration = {kNaNf, kNaNf, kNaNf};
    msg.yaw = setpoint_yaw_;
    msg.yawspeed = kNaNf;
    msg.timestamp = now_us();
    trajectory_pub_->publish(msg);
  }

  void publish_vehicle_command(uint32_t command, float param1 = 0.0f,
                               float param2 = 0.0f, float param3 = 0.0f,
                               float param4 = 0.0f, double param5 = 0.0,
                               double param6 = 0.0, float param7 = 0.0f) {
    VehicleCommand msg{};
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
    msg.timestamp = now_us();
    vehicle_command_pub_->publish(msg);
  }

  void send_arm() {
    publish_vehicle_command(VehicleCommand::VEHICLE_CMD_COMPONENT_ARM_DISARM,
                            1.0f);
    RCLCPP_INFO(get_logger(), "Arm command sent");
  }

  void send_disarm() {
    publish_vehicle_command(VehicleCommand::VEHICLE_CMD_COMPONENT_ARM_DISARM,
                            0.0f);
    RCLCPP_INFO(get_logger(), "Disarm command sent");
  }

  void send_offboard_mode() {
    publish_vehicle_command(VehicleCommand::VEHICLE_CMD_DO_SET_MODE, 1.0f,
                            kMainModeOffboard);
    RCLCPP_INFO(get_logger(), "Offboard mode requested");
  }

  void send_global_origin() {
    // Local NED origin (0,0,0) in WGS84. PX4 accepts both the internal
    // SET_GPS_GLOBAL_ORIGIN (100000) and MAV_CMD_DO_SET_GLOBAL_ORIGIN (611).
    publish_vehicle_command(VehicleCommand::VEHICLE_CMD_SET_GPS_GLOBAL_ORIGIN,
                            0.0f, 0.0f, 0.0f, 0.0f, start_lat_, start_lon_,
                            start_alt_);
    publish_vehicle_command(VehicleCommand::VEHICLE_CMD_DO_SET_GLOBAL_ORIGIN,
                            0.0f, 0.0f, 0.0f, 0.0f, start_lat_, start_lon_,
                            start_alt_);
    // Home / RTL point. param1 = 0 means use the supplied lat/lon/alt.
    publish_vehicle_command(VehicleCommand::VEHICLE_CMD_DO_SET_HOME, 0.0f, 0.0f,
                            0.0f, 0.0f, start_lat_, start_lon_, start_alt_);
    RCLCPP_INFO(get_logger(),
                "PX4 origin/home requested: lat=%.7f lon=%.7f alt=%.1f m",
                start_lat_, start_lon_, start_alt_);
  }

  void send_land() {
    // Prefer the dedicated land command at the current position.
    publish_vehicle_command(VehicleCommand::VEHICLE_CMD_NAV_LAND, 0.0f, 0.0f,
                            0.0f, kNaNf, kNaNd, kNaNd, kNaNf);
    // Also request AUTO.LAND in case NAV_LAND is ignored while still offboard.
    publish_vehicle_command(VehicleCommand::VEHICLE_CMD_DO_SET_MODE, 1.0f,
                            kMainModeAuto, kSubModeAutoLand);
    RCLCPP_INFO(get_logger(), "Land command sent");
  }

  void set_phase(Phase next) {
    if (phase_ == next) {
      return;
    }
    phase_ = next;
    phase_enter_time_ = now();
    RCLCPP_INFO(get_logger(), "Phase -> %s", phase_label(phase_));
  }

  void fail(const std::string &why) {
    RCLCPP_ERROR(get_logger(), "Mission failed: %s", why.c_str());
    set_phase(Phase::Failed);
  }

  void log_status_throttled() {
    if (seconds_since(last_status_log_) < 2.0) {
      return;
    }
    last_status_log_ = now();
    RCLCPP_INFO(get_logger(),
                "[%s] armed=%s nav=%s(%u) landed=%s  pos N=%.2f E=%.2f "
                "D=%.2f (alt %.2f)  tgt N=%.2f E=%.2f D=%.2f  dist=%.2f",
                phase_label(phase_), armed_ ? "true" : "false",
                state_name(nav_state_), nav_state_, landed_ ? "true" : "false",
                position_.x, position_.y, position_.z, -position_.z, setpoint_.x,
                setpoint_.y, setpoint_.z, distance(position_, setpoint_));
  }

  static const char *phase_label(Phase phase) {
    switch (phase) {
    case Phase::WaitForPx4:
      return "WAIT_PX4";
    case Phase::StreamSetpoints:
      return "STREAM";
    case Phase::ArmOffboard:
      return "ARM";
    case Phase::Takeoff:
      return "TAKEOFF";
    case Phase::FlyWaypoints:
      return "FLY";
    case Phase::ReturnHome:
      return "RTL";
    case Phase::Land:
      return "LAND";
    case Phase::Done:
      return "DONE";
    case Phase::Failed:
      return "FAILED";
    }
    return "?";
  }

  rclcpp::Time now()  { return get_clock()->now(); }

  double seconds_since(const rclcpp::Time &t)  {
    if (t.nanoseconds() == 0) {
      return 1.0e9;
    }
    return (now() - t).seconds();
  }

  uint64_t now_us()  {
    return static_cast<uint64_t>(get_clock()->now().nanoseconds() / 1000);
  }

  rclcpp::Publisher<OffboardControlMode>::SharedPtr offboard_mode_pub_;
  rclcpp::Publisher<TrajectorySetpoint>::SharedPtr trajectory_pub_;
  rclcpp::Publisher<VehicleCommand>::SharedPtr vehicle_command_pub_;
  rclcpp::Subscription<VehicleLocalPosition>::SharedPtr local_position_sub_;
  rclcpp::Subscription<VehicleStatus>::SharedPtr vehicle_status_sub_;
  rclcpp::Subscription<VehicleLandDetected>::SharedPtr land_detected_sub_;
  rclcpp::Subscription<VehicleCommandAck>::SharedPtr command_ack_sub_;
  rclcpp::TimerBase::SharedPtr timer_;

  int num_waypoints_{5};
  float takeoff_altitude_{5.0f};
  float waypoint_xy_range_{8.0f};
  float waypoint_alt_min_{4.0f};
  float waypoint_alt_max_{8.0f};
  float acceptance_radius_{0.6f};
  double hover_time_{1.5};
  double waypoint_timeout_{30.0};
  double setpoint_rate_hz_{10.0};
  int64_t random_seed_{0};
  double start_lat_{50.7753};
  double start_lon_{6.0839};
  float start_alt_{173.0f};

  Phase phase_{Phase::WaitForPx4};
  rclcpp::Time phase_enter_time_{0, 0, RCL_ROS_TIME};
  rclcpp::Time last_command_time_{0, 0, RCL_ROS_TIME};
  rclcpp::Time last_origin_command_time_{0, 0, RCL_ROS_TIME};
  rclcpp::Time waypoint_enter_time_{0, 0, RCL_ROS_TIME};
  rclcpp::Time hover_start_time_{0, 0, RCL_ROS_TIME};
  rclcpp::Time last_status_log_{0, 0, RCL_ROS_TIME};

  int stream_ticks_{0};
  bool have_position_{false};
  bool have_home_{false};
  bool armed_{false};
  bool hovering_{false};
  bool landed_{true};
  uint8_t nav_state_{0};

  NedPoint position_{};
  NedPoint home_{};
  NedPoint takeoff_{};
  NedPoint setpoint_{};
  float yaw_{0.0f};
  float home_yaw_{0.0f};
  float setpoint_yaw_{0.0f};

  std::vector<NedPoint> waypoints_;
  size_t waypoint_index_{0};
  std::mt19937 rng_;
};

int main(int argc, char *argv[]) {
  setvbuf(stdout, nullptr, _IONBF, BUFSIZ);
  rclcpp::init(argc, argv);
  rclcpp::spin(std::make_shared<OffboardMission>());
  rclcpp::shutdown();
  return 0;
}
