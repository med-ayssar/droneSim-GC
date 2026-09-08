#ifndef PX4_NATS_BRIDGE_COMMAND_HANDLER_HPP_
#define PX4_NATS_BRIDGE_COMMAND_HANDLER_HPP_

#include "nats_client.hpp"
#include "px4_interface.hpp"
#include "drone/v1/command.pb.h"
#include "drone/v1/state.pb.h"
#include <memory>
#include <string>

namespace px4_nats_bridge {

class CommandHandler {
public:
  CommandHandler(std::shared_ptr<NatsClient> nats_client, std::shared_ptr<Px4Interface> px4_interface, std::string drone_id);

  void handle_command_payload(const std::vector<uint8_t> &payload);

private:
  void publish_result(const std::string &request_id, drone::v1::CommandStatus status, const std::string &message);

  std::shared_ptr<NatsClient> nats_client_;
  std::shared_ptr<Px4Interface> px4_interface_;
  std::string drone_id_;
};

} // namespace px4_nats_bridge

#endif // PX4_NATS_BRIDGE_COMMAND_HANDLER_HPP_
