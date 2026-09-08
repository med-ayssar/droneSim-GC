#ifndef PX4_NATS_BRIDGE_NATS_CLIENT_HPP_
#define PX4_NATS_BRIDGE_NATS_CLIENT_HPP_

#include <atomic>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <utility>
#include <vector>

namespace px4_nats_bridge {

using MessageCallback =
    std::function<void(const std::string &subject, const std::vector<uint8_t> &payload)>;

class NatsClient {
public:
  NatsClient(std::string host, int port, std::string user, std::string password);
  ~NatsClient();

  bool connect();
  void disconnect();
  bool is_connected() const { return connected_; }

  bool subscribe(const std::string &subject, MessageCallback callback);
  bool publish(const std::string &subject, const std::vector<uint8_t> &payload);
  bool publish_text(const std::string &subject, const std::string &payload);

private:
  void receive_loop();
  bool send_locked(const char *data, size_t len);
  bool send_raw(const std::string &data);
  bool read_info_line();
  void dispatch_msg(const std::string &subject, const std::vector<uint8_t> &payload);

  std::string host_;
  int port_;
  std::string user_;
  std::string password_;
  int socket_fd_{-1};
  std::atomic<bool> connected_{false};
  std::atomic<bool> running_{false};
  std::thread rx_thread_;
  std::mutex io_mutex_;
  std::mutex sub_mutex_;
  std::vector<std::pair<std::string, MessageCallback>> subscriptions_;
  int sid_counter_{1};
};

} // namespace px4_nats_bridge

#endif // PX4_NATS_BRIDGE_NATS_CLIENT_HPP_
