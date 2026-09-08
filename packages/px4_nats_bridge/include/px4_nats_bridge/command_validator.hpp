#ifndef PX4_NATS_BRIDGE_COMMAND_VALIDATOR_HPP_
#define PX4_NATS_BRIDGE_COMMAND_VALIDATOR_HPP_

#include "drone/v1/command.pb.h"
#include <string>

namespace px4_nats_bridge {

struct ValidationResult {
  bool valid{false};
  std::string error_message;
};

class CommandValidator {
public:
  static ValidationResult validate(const drone::v1::DroneCommand &command, const std::string &expected_drone_id);
};

} // namespace px4_nats_bridge

#endif // PX4_NATS_BRIDGE_COMMAND_VALIDATOR_HPP_
