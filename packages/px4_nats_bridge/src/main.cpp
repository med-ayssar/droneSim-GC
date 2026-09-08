#include <chrono>
#include <memory>
#include <string>

#include <rclcpp/rclcpp.hpp>

#include "px4_nats_bridge/command_handler.hpp"
#include "px4_nats_bridge/nats_client.hpp"
#include "px4_nats_bridge/px4_interface.hpp"
#include "px4_nats_bridge/telemetry_publisher.hpp"

using namespace std::chrono_literals;

int main(int argc, char **argv) {
  rclcpp::init(argc, argv);
  auto node = std::make_shared<rclcpp::Node>("px4_nats_bridge_node");

  const std::string nats_host = node->declare_parameter<std::string>(
      "nats_host", std::getenv("NATS_HOST") ? std::getenv("NATS_HOST") : "nats");
  const int nats_port = node->declare_parameter<int>(
      "nats_port", std::getenv("NATS_PORT") ? std::atoi(std::getenv("NATS_PORT")) : 4222);
  const std::string nats_user = node->declare_parameter<std::string>("nats_user", "bridge");
  const std::string nats_pass = node->declare_parameter<std::string>("nats_pass", "bridge_password");
  const std::string drone_id = node->declare_parameter<std::string>(
      "drone_id", std::getenv("DRONE_ID") ? std::getenv("DRONE_ID") : "drone01");
  const double telem_hz = node->declare_parameter<double>("telemetry_frequency_hz", 10.0);

  RCLCPP_INFO(node->get_logger(), "px4_nats_bridge for %s -> %s:%d", drone_id.c_str(),
              nats_host.c_str(), nats_port);

  auto nats_client =
      std::make_shared<px4_nats_bridge::NatsClient>(nats_host, nats_port, nats_user, nats_pass);
  auto px4_interface = std::make_shared<px4_nats_bridge::Px4Interface>(node);
  auto command_handler =
      std::make_shared<px4_nats_bridge::CommandHandler>(nats_client, px4_interface, drone_id);
  auto telemetry_publisher =
      std::make_shared<px4_nats_bridge::TelemetryPublisher>(nats_client, px4_interface, drone_id);

  const std::string cmd_subject = "drone." + drone_id + ".command";
  nats_client->subscribe(cmd_subject, [command_handler](const std::string &,
                                                        const std::vector<uint8_t> &payload) {
    command_handler->handle_command_payload(payload);
  });

  if (!nats_client->connect()) {
    RCLCPP_WARN(node->get_logger(), "NATS not connected yet; will retry");
  }

  auto reconnect_timer = node->create_wall_timer(2s, [nats_client, node]() {
    if (!nats_client->is_connected()) {
      RCLCPP_INFO(node->get_logger(), "Retrying NATS connection...");
      nats_client->connect();
    }
  });

  auto offboard_timer = node->create_wall_timer(50ms, [px4_interface]() {
    px4_interface->stream_offboard();
  });

  const auto telem_period = std::chrono::duration<double>(1.0 / std::max(1.0, telem_hz));
  auto telem_timer = node->create_wall_timer(
      std::chrono::duration_cast<std::chrono::nanoseconds>(telem_period),
      [telemetry_publisher]() { telemetry_publisher->publish_once(); });

  rclcpp::spin(node);
  nats_client->disconnect();
  rclcpp::shutdown();
  return 0;
}
