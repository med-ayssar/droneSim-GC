// Minimal PX4 offboard control example (ROS 2, C++).
//
// Flow:
//   1. Stream OffboardControlMode + TrajectorySetpoint at >2 Hz.
//   2. After 10 setpoints, request Offboard mode and arm.
//   3. Command a position setpoint (takeoff to 5 m, PX4 uses NED so z = -5).
//   4. Subscribe to VehicleLocalPosition / VehicleStatus to observe state.
//
// PX4 topics (v1.14+): /fmu/in/* are commands INTO PX4, /fmu/out/* come OUT.
// Requires the micro-XRCE-DDS Agent running and PX4 SITL connected.

#include <px4_msgs/msg/offboard_control_mode.hpp>
#include <px4_msgs/msg/trajectory_setpoint.hpp>
#include <px4_msgs/msg/vehicle_command.hpp>
#include <px4_msgs/msg/vehicle_local_position.hpp>
#include <px4_msgs/msg/vehicle_status.hpp>
#include <rclcpp/rclcpp.hpp>

#include <chrono>
#include <cstdint>

using namespace std::chrono_literals;
using namespace px4_msgs::msg;

class OffboardControl : public rclcpp::Node {
public:
  OffboardControl() : Node("offboard_control") {
    // PX4 publishes /fmu/out/* with best-effort, keep-last QoS. Subscribers
    // MUST match or they receive nothing.
    rclcpp::QoS px4_qos(rclcpp::KeepLast(5));
    px4_qos.best_effort();
    px4_qos.durability_volatile();

    // --- Publishers: commands into PX4 ---
    offboard_mode_pub_ = create_publisher<OffboardControlMode>(
        "/fmu/in/offboard_control_mode", 10);
    trajectory_pub_ =
        create_publisher<TrajectorySetpoint>("/fmu/in/trajectory_setpoint", 10);
    vehicle_command_pub_ =
        create_publisher<VehicleCommand>("/fmu/in/vehicle_command", 10);

    // --- Subscribers: state out of PX4 ---
    local_position_sub_ = create_subscription<VehicleLocalPosition>(
        "/fmu/out/vehicle_local_position", px4_qos,
        [this](const VehicleLocalPosition::SharedPtr msg) {
          last_z_ = msg->z;
        });

    vehicle_status_sub_ = create_subscription<VehicleStatus>(
        "/fmu/out/vehicle_status", px4_qos,
        [this](const VehicleStatus::SharedPtr msg) {
          armed_ = (msg->arming_state == VehicleStatus::ARMING_STATE_ARMED);
          nav_state_ = msg->nav_state;
        });

    timer_ = create_wall_timer(100ms, [this]() { on_timer(); });
    RCLCPP_INFO(get_logger(), "Offboard control node started.");
  }

private:
  void on_timer() {
    if (setpoint_counter_ == 10) {
      engage_offboard_mode();
      arm();
    }

    // These two must be streamed continuously or PX4 drops out of Offboard.
    publish_offboard_control_mode();
    publish_trajectory_setpoint();

    if (setpoint_counter_ < 11) {
      ++setpoint_counter_;
    }

    if (setpoint_counter_ % 20 == 0) {
      RCLCPP_INFO(get_logger(),
                  "armed=%s nav_state=%u altitude=%.2f m (target 5.0)",
                  armed_ ? "true" : "false", nav_state_, -last_z_);
    }
  }

  void publish_offboard_control_mode() {
    OffboardControlMode msg{};
    msg.position = true; // we command position setpoints
    msg.velocity = false;
    msg.acceleration = false;
    msg.attitude = false;
    msg.body_rate = false;
    msg.timestamp = now_us();
    offboard_mode_pub_->publish(msg);
  }

  void publish_trajectory_setpoint() {
    TrajectorySetpoint msg{};
    msg.position = {0.0f, 0.0f, -5.0f}; // NED: -5 m z == 5 m altitude
    msg.yaw = -3.14f;                   // [-pi, pi]
    msg.timestamp = now_us();
    trajectory_pub_->publish(msg);
  }

  void publish_vehicle_command(uint16_t command, float param1 = 0.0f,
                               float param2 = 0.0f) {
    VehicleCommand msg{};
    msg.command = command;
    msg.param1 = param1;
    msg.param2 = param2;
    msg.target_system = 1;
    msg.target_component = 1;
    msg.source_system = 1;
    msg.source_component = 1;
    msg.from_external = true;
    msg.timestamp = now_us();
    vehicle_command_pub_->publish(msg);
  }

  void arm() {
    publish_vehicle_command(VehicleCommand::VEHICLE_CMD_COMPONENT_ARM_DISARM,
                            1.0f);
    RCLCPP_INFO(get_logger(), "Arm command sent");
  }

  void disarm() {
    publish_vehicle_command(VehicleCommand::VEHICLE_CMD_COMPONENT_ARM_DISARM,
                            0.0f);
    RCLCPP_INFO(get_logger(), "Disarm command sent");
  }

  void engage_offboard_mode() {
    // base_mode = 1 (custom), custom_main_mode = 6 (Offboard)
    publish_vehicle_command(VehicleCommand::VEHICLE_CMD_DO_SET_MODE, 1.0f,
                            6.0f);
    RCLCPP_INFO(get_logger(), "Offboard mode requested");
  }

  uint64_t now_us() {
    return static_cast<uint64_t>(get_clock()->now().nanoseconds() / 1000);
  }

  rclcpp::Publisher<OffboardControlMode>::SharedPtr offboard_mode_pub_;
  rclcpp::Publisher<TrajectorySetpoint>::SharedPtr trajectory_pub_;
  rclcpp::Publisher<VehicleCommand>::SharedPtr vehicle_command_pub_;
  rclcpp::Subscription<VehicleLocalPosition>::SharedPtr local_position_sub_;
  rclcpp::Subscription<VehicleStatus>::SharedPtr vehicle_status_sub_;
  rclcpp::TimerBase::SharedPtr timer_;

  uint64_t setpoint_counter_ = 0;
  bool armed_ = false;
  uint8_t nav_state_ = 0;
  float last_z_ = 0.0f;
};

int main(int argc, char *argv[]) {
  setvbuf(stdout, nullptr, _IONBF, BUFSIZ);
  rclcpp::init(argc, argv);
  rclcpp::spin(std::make_shared<OffboardControl>());
  rclcpp::shutdown();
  return 0;
}
