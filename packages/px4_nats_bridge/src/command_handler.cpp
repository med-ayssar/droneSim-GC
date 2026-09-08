#include "px4_nats_bridge/command_handler.hpp"
#include "px4_nats_bridge/command_deserializer.hpp"
#include "px4_nats_bridge/command_validator.hpp"
#include <chrono>
#include <iostream>

namespace px4_nats_bridge {

CommandHandler::CommandHandler(std::shared_ptr<NatsClient> nats_client,
                               std::shared_ptr<Px4Interface> px4_interface, std::string drone_id)
    : nats_client_(std::move(nats_client)), px4_interface_(std::move(px4_interface)),
      drone_id_(std::move(drone_id)) {}

void CommandHandler::handle_command_payload(const std::vector<uint8_t> &payload) {
  drone::v1::DroneCommand command;
  if (!CommandDeserializer::deserialize(payload, command)) {
    std::cerr << "[CommandHandler] Failed to parse command payload" << std::endl;
    return;
  }

  std::cout << "[CommandHandler] " << command.request_id() << " type="
            << drone::v1::CommandType_Name(command.command()) << std::endl;

  publish_result(command.request_id(), drone::v1::COMMAND_STATUS_RECEIVED,
                 "Command received by ROS 2 bridge");

  const ValidationResult val = CommandValidator::validate(command, drone_id_);
  if (!val.valid) {
    publish_result(command.request_id(), drone::v1::COMMAND_STATUS_REJECTED, val.error_message);
    return;
  }

  publish_result(command.request_id(), drone::v1::COMMAND_STATUS_ACCEPTED,
                 "Command accepted for execution");

  bool exec_ok = false;
  switch (command.command()) {
    case drone::v1::COMMAND_TYPE_ARM:
      exec_ok = px4_interface_->arm();
      break;
    case drone::v1::COMMAND_TYPE_DISARM:
      exec_ok = px4_interface_->disarm();
      break;
    case drone::v1::COMMAND_TYPE_TAKEOFF:
      exec_ok = px4_interface_->takeoff(command.takeoff().altitude_m());
      break;
    case drone::v1::COMMAND_TYPE_LAND:
      exec_ok = px4_interface_->land();
      break;
    case drone::v1::COMMAND_TYPE_RTL:
      exec_ok = px4_interface_->rtl();
      break;
    case drone::v1::COMMAND_TYPE_HOLD:
      exec_ok = px4_interface_->hold();
      break;
    case drone::v1::COMMAND_TYPE_OFFBOARD:
      exec_ok = px4_interface_->offboard();
      break;
    case drone::v1::COMMAND_TYPE_SET_VELOCITY:
      exec_ok = px4_interface_->set_velocity(command.velocity().vx_m_s(), command.velocity().vy_m_s(),
                                            command.velocity().vz_m_s(),
                                            command.velocity().yaw_rate_rad_s());
      break;
    default:
      publish_result(command.request_id(), drone::v1::COMMAND_STATUS_REJECTED,
                     "Unsupported command type");
      return;
  }

  publish_result(command.request_id(),
                 exec_ok ? drone::v1::COMMAND_STATUS_EXECUTED : drone::v1::COMMAND_STATUS_FAILED,
                 exec_ok ? "Command sent to PX4" : "PX4 execution failed");
}

void CommandHandler::publish_result(const std::string &request_id, drone::v1::CommandStatus status,
                                    const std::string &message) {
  if (!nats_client_ || !nats_client_->is_connected()) {
    return;
  }

  drone::v1::CommandResult result;
  result.set_request_id(request_id);
  result.set_drone_id(drone_id_);
  result.set_status(status);
  result.set_message(message);
  result.set_timestamp_ms(static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::milliseconds>(
          std::chrono::system_clock::now().time_since_epoch())
          .count()));
  std::string body;
  if (!result.SerializeToString(&body)) {
    return;
  }
  nats_client_->publish("drone." + drone_id_ + ".command.result",
                        std::vector<uint8_t>(body.begin(), body.end()));
}

} // namespace px4_nats_bridge
