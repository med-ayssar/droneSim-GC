#include "px4_nats_bridge/telemetry_publisher.hpp"
namespace px4_nats_bridge {

TelemetryPublisher::TelemetryPublisher(std::shared_ptr<NatsClient> nats_client,
                                       std::shared_ptr<Px4Interface> px4_interface,
                                       std::string drone_id)
    : nats_client_(std::move(nats_client)), px4_interface_(std::move(px4_interface)),
      drone_id_(std::move(drone_id)) {}

void TelemetryPublisher::publish_once() {
  if (!nats_client_ || !nats_client_->is_connected() || !px4_interface_) {
    return;
  }

  const drone::v1::DroneTelemetry telem = px4_interface_->get_telemetry(drone_id_);
  std::string body;
  if (!telem.SerializeToString(&body)) {
    return;
  }
  nats_client_->publish("drone." + drone_id_ + ".telemetry",
                        std::vector<uint8_t>(body.begin(), body.end()));
}

} // namespace px4_nats_bridge
