#ifndef PX4_NATS_BRIDGE_COMMAND_DESERIALIZER_HPP_
#define PX4_NATS_BRIDGE_COMMAND_DESERIALIZER_HPP_

#include "drone/v1/command.pb.h"
#include <vector>
#include <cstdint>

namespace px4_nats_bridge {

class CommandDeserializer {
public:
  static bool deserialize(const std::vector<uint8_t> &buffer, drone::v1::DroneCommand &command_out);
};

} // namespace px4_nats_bridge

#endif // PX4_NATS_BRIDGE_COMMAND_DESERIALIZER_HPP_
