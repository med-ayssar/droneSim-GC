#include "px4_nats_bridge/nats_client.hpp"

#include <algorithm>
#include <arpa/inet.h>
#include <cstring>
#include <iostream>
#include <netdb.h>
#include <netinet/tcp.h>
#include <sstream>
#include <sys/socket.h>
#include <sys/types.h>
#include <unistd.h>
#include <vector>

namespace px4_nats_bridge {

NatsClient::NatsClient(std::string host, int port, std::string user, std::string password)
    : host_(std::move(host)), port_(port), user_(std::move(user)), password_(std::move(password)) {}

NatsClient::~NatsClient() { disconnect(); }

bool NatsClient::connect() {
  disconnect();

  struct addrinfo hints {};
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  struct addrinfo *res = nullptr;
  const std::string port_str = std::to_string(port_);
  if (getaddrinfo(host_.c_str(), port_str.c_str(), &hints, &res) != 0 || !res) {
    std::cerr << "[NatsClient] Failed to resolve host: " << host_ << std::endl;
    return false;
  }

  socket_fd_ = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
  if (socket_fd_ < 0) {
    std::cerr << "[NatsClient] Failed to create socket" << std::endl;
    freeaddrinfo(res);
    return false;
  }

  int one = 1;
  setsockopt(socket_fd_, IPPROTO_TCP, TCP_NODELAY, &one, sizeof(one));

  if (::connect(socket_fd_, res->ai_addr, res->ai_addrlen) < 0) {
    std::cerr << "[NatsClient] Connection failed (" << host_ << ":" << port_ << ")" << std::endl;
    close(socket_fd_);
    socket_fd_ = -1;
    freeaddrinfo(res);
    return false;
  }
  freeaddrinfo(res);

  if (!read_info_line()) {
    std::cerr << "[NatsClient] Did not receive INFO from NATS server" << std::endl;
    close(socket_fd_);
    socket_fd_ = -1;
    return false;
  }

  const std::string connect_json =
      "CONNECT {\"verbose\":false,\"pedantic\":false,\"name\":\"px4_nats_bridge\",\"user\":\"" +
      user_ + "\",\"pass\":\"" + password_ + "\"}\r\n";
  if (!send_raw(connect_json)) {
    close(socket_fd_);
    socket_fd_ = -1;
    return false;
  }

  connected_ = true;
  running_ = true;
  rx_thread_ = std::thread(&NatsClient::receive_loop, this);

  std::vector<std::pair<std::string, MessageCallback>> subs;
  {
    std::lock_guard<std::mutex> lock(sub_mutex_);
    subs = subscriptions_;
  }
  int sid = 1;
  for (const auto &sub : subs) {
    send_raw("SUB " + sub.first + " " + std::to_string(sid++) + "\r\n");
  }
  sid_counter_ = sid;

  std::cout << "[NatsClient] Connected to NATS at " << host_ << ":" << port_ << std::endl;
  return true;
}

void NatsClient::disconnect() {
  running_ = false;
  connected_ = false;
  if (socket_fd_ >= 0) {
    shutdown(socket_fd_, SHUT_RDWR);
    close(socket_fd_);
    socket_fd_ = -1;
  }
  if (rx_thread_.joinable()) {
    rx_thread_.join();
  }
}

bool NatsClient::read_info_line() {
  std::string acc;
  char buf[1024];
  for (int i = 0; i < 50; ++i) {
    const ssize_t n = recv(socket_fd_, buf, sizeof(buf), 0);
    if (n <= 0) {
      return false;
    }
    acc.append(buf, static_cast<size_t>(n));
    if (acc.find("\r\n") != std::string::npos) {
      return acc.rfind("INFO", 0) == 0 || acc.find("INFO") != std::string::npos;
    }
  }
  return false;
}

bool NatsClient::send_locked(const char *data, size_t len) {
  if (socket_fd_ < 0) {
    return false;
  }
  size_t sent_total = 0;
  while (sent_total < len) {
    const ssize_t sent = send(socket_fd_, data + sent_total, len - sent_total, 0);
    if (sent <= 0) {
      return false;
    }
    sent_total += static_cast<size_t>(sent);
  }
  return true;
}

bool NatsClient::send_raw(const std::string &data) {
  std::lock_guard<std::mutex> lock(io_mutex_);
  return send_locked(data.data(), data.size());
}

bool NatsClient::subscribe(const std::string &subject, MessageCallback callback) {
  {
    std::lock_guard<std::mutex> lock(sub_mutex_);
    subscriptions_.push_back({subject, std::move(callback)});
  }
  if (!connected_) {
    return true;
  }
  const int sid = sid_counter_++;
  return send_raw("SUB " + subject + " " + std::to_string(sid) + "\r\n");
}

bool NatsClient::publish(const std::string &subject, const std::vector<uint8_t> &payload) {
  if (!connected_) {
    return false;
  }
  const std::string header = "PUB " + subject + " " + std::to_string(payload.size()) + "\r\n";
  std::lock_guard<std::mutex> lock(io_mutex_);
  if (!send_locked(header.data(), header.size())) {
    return false;
  }
  if (!payload.empty() && !send_locked(reinterpret_cast<const char *>(payload.data()), payload.size())) {
    return false;
  }
  return send_locked("\r\n", 2);
}

bool NatsClient::publish_text(const std::string &subject, const std::string &payload) {
  return publish(subject, std::vector<uint8_t>(payload.begin(), payload.end()));
}

void NatsClient::dispatch_msg(const std::string &subject, const std::vector<uint8_t> &payload) {
  std::vector<MessageCallback> cbs;
  {
    std::lock_guard<std::mutex> lock(sub_mutex_);
    for (const auto &sub : subscriptions_) {
      // The server has already matched the subscription; retain the subject
      // check so multiple local subscriptions cannot receive one another's data.
      if (sub.first == subject && sub.second) {
        cbs.push_back(sub.second);
      }
    }
  }
  for (const auto &cb : cbs) {
    cb(subject, payload);
  }
}

void NatsClient::receive_loop() {
  std::vector<uint8_t> acc;
  acc.reserve(8192);
  char buffer[4096];

  while (running_ && socket_fd_ >= 0) {
    const ssize_t n = recv(socket_fd_, buffer, sizeof(buffer), 0);
    if (n <= 0) {
      if (running_) {
        std::cerr << "[NatsClient] Connection lost" << std::endl;
      }
      connected_ = false;
      break;
    }
    acc.insert(acc.end(), buffer, buffer + n);

    while (true) {
      auto crlf = std::search(acc.begin(), acc.end(),
                              reinterpret_cast<const uint8_t *>("\r\n"),
                              reinterpret_cast<const uint8_t *>("\r\n") + 2);
      if (crlf == acc.end()) {
        break;
      }
      std::string line(acc.begin(), crlf);
      acc.erase(acc.begin(), crlf + 2);

      if (line.rfind("PING", 0) == 0) {
        send_raw("PONG\r\n");
        continue;
      }
      if (line.rfind("PONG", 0) == 0 || line.rfind("+OK", 0) == 0 || line.rfind("INFO", 0) == 0) {
        continue;
      }
      if (line.rfind("-ERR", 0) == 0) {
        std::cerr << "[NatsClient] " << line << std::endl;
        continue;
      }
      if (line.rfind("MSG ", 0) != 0) {
        continue;
      }

      std::istringstream iss(line);
      std::string tag, subject, sid, tok4, tok5;
      iss >> tag >> subject >> sid >> tok4 >> tok5;
      size_t nbytes = 0;
      try {
        nbytes = tok5.empty() ? static_cast<size_t>(std::stoul(tok4))
                              : static_cast<size_t>(std::stoul(tok5));
      } catch (...) {
        continue;
      }

      while (acc.size() < nbytes + 2 && running_ && socket_fd_ >= 0) {
        const ssize_t more = recv(socket_fd_, buffer, sizeof(buffer), 0);
        if (more <= 0) {
          connected_ = false;
          return;
        }
        acc.insert(acc.end(), buffer, buffer + more);
      }
      if (acc.size() < nbytes + 2) {
        return;
      }
      std::vector<uint8_t> payload(acc.begin(), acc.begin() + static_cast<std::ptrdiff_t>(nbytes));
      acc.erase(acc.begin(), acc.begin() + static_cast<std::ptrdiff_t>(nbytes + 2));
      dispatch_msg(subject, payload);
    }
  }
}

} // namespace px4_nats_bridge
