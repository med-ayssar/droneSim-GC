#ifndef PX4_NATS_BRIDGE_TELEMETRY_PUBLISHER_HPP_
#define PX4_NATS_BRIDGE_TELEMETRY_PUBLISHER_HPP_

#include "nats_client.hpp"
#include "px4_interface.hpp"
#include <memory>
#include <string>

namespace px4_nats_bridge {

class TelemetryPublisher {
public:
  TelemetryPublisher(std::shared_ptr<NatsClient> nats_client, std::shared_ptr<Px4Interface> px4_interface, std::string drone_id);

  void publish_once();

private:
  std::shared_ptr<NatsClient> nats_client_;
  std::shared_ptr<Px4Interface> px4_interface_;
  std::string drone_id_;
};

} // namespace px4_nats_bridge

#endif // PX4_NATS_BRIDGE_TELEMETRY_PUBLISHER_HPP_
