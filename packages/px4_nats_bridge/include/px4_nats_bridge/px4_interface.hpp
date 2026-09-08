#ifndef PX4_NATS_BRIDGE_PX4_INTERFACE_HPP_
#define PX4_NATS_BRIDGE_PX4_INTERFACE_HPP_

#include <mutex>
#include <string>

#include <px4_msgs/msg/battery_status.hpp>
#include <px4_msgs/msg/offboard_control_mode.hpp>
#include <px4_msgs/msg/sensor_gps.hpp>
#include <px4_msgs/msg/trajectory_setpoint.hpp>
#include <px4_msgs/msg/vehicle_attitude.hpp>
#include <px4_msgs/msg/vehicle_command.hpp>
#include <px4_msgs/msg/vehicle_local_position.hpp>
#include <px4_msgs/msg/vehicle_status.hpp>
#include <rclcpp/rclcpp.hpp>

#include "drone/v1/telemetry.pb.h"

namespace px4_nats_bridge {

class Px4Interface {
public:
  explicit Px4Interface(rclcpp::Node::SharedPtr node);

  bool arm();
  bool disarm();
  bool takeoff(double altitude_m);
  bool land();
  bool rtl();
  bool hold();
  bool offboard();
  bool set_velocity(double vx, double vy, double vz, double yaw_rate);

  void stream_offboard();
  drone::v1::DroneTelemetry get_telemetry(const std::string &drone_id);

private:
  void send_vehicle_command(uint32_t command, float param1 = 0.0f, float param2 = 0.0f,
                            float param3 = 0.0f, float param4 = 0.0f, float param5 = 0.0f,
                            float param6 = 0.0f, float param7 = 0.0f);
  void set_auto_mode(float sub_mode);
  rclcpp::QoS px4_qos() const;

  rclcpp::Node::SharedPtr node_;
  rclcpp::Publisher<px4_msgs::msg::VehicleCommand>::SharedPtr vehicle_command_pub_;
  rclcpp::Publisher<px4_msgs::msg::OffboardControlMode>::SharedPtr offboard_control_mode_pub_;
  rclcpp::Publisher<px4_msgs::msg::TrajectorySetpoint>::SharedPtr trajectory_setpoint_pub_;

  rclcpp::Subscription<px4_msgs::msg::VehicleStatus>::SharedPtr vehicle_status_sub_;
  rclcpp::Subscription<px4_msgs::msg::VehicleStatus>::SharedPtr vehicle_status_v4_sub_;
  rclcpp::Subscription<px4_msgs::msg::VehicleLocalPosition>::SharedPtr local_position_sub_;
  rclcpp::Subscription<px4_msgs::msg::VehicleLocalPosition>::SharedPtr local_position_v1_sub_;
  rclcpp::Subscription<px4_msgs::msg::VehicleAttitude>::SharedPtr attitude_sub_;
  rclcpp::Subscription<px4_msgs::msg::BatteryStatus>::SharedPtr battery_sub_;
  rclcpp::Subscription<px4_msgs::msg::SensorGps>::SharedPtr gps_sub_;

  std::mutex data_mutex_;
  px4_msgs::msg::VehicleStatus current_status_{};
  px4_msgs::msg::VehicleLocalPosition current_local_{};
  px4_msgs::msg::VehicleAttitude current_attitude_{};
  px4_msgs::msg::BatteryStatus current_battery_{};
  px4_msgs::msg::SensorGps current_gps_{};

  bool status_received_{false};
  bool pos_received_{false};
  bool gps_received_{false};

  double vel_vx_{0.0};
  double vel_vy_{0.0};
  double vel_vz_{0.0};
  double vel_yaw_rate_{0.0};
  bool stream_velocity_{false};
};

} // namespace px4_nats_bridge

#endif // PX4_NATS_BRIDGE_PX4_INTERFACE_HPP_
