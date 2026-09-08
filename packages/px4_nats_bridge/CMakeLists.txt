cmake_minimum_required(VERSION 3.10)
project(px4_nats_bridge)

# Default to C++17
if(NOT CMAKE_CXX_STANDARD)
  set(CMAKE_CXX_STANDARD 17)
endif()

find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(px4_msgs REQUIRED)
find_package(Protobuf REQUIRED)

include_directories(
  include
  ${PROTOBUF_INCLUDE_DIRS}
  ${CMAKE_CURRENT_SOURCE_DIR}/generated/cpp
)

set(PROTO_SRC_DIR ${CMAKE_CURRENT_SOURCE_DIR}/generated/cpp/drone/v1)

add_executable(px4_nats_bridge_node
  src/main.cpp
  src/nats_client.cpp
  src/command_deserializer.cpp
  src/command_validator.cpp
  src/command_handler.cpp
  src/px4_interface.cpp
  src/telemetry_publisher.cpp
  ${PROTO_SRC_DIR}/common.pb.cc
  ${PROTO_SRC_DIR}/command.pb.cc
  ${PROTO_SRC_DIR}/telemetry.pb.cc
  ${PROTO_SRC_DIR}/state.pb.cc
)

target_link_libraries(px4_nats_bridge_node
  ${PROTOBUF_LIBRARIES}
)

ament_target_dependencies(px4_nats_bridge_node
  rclcpp
  px4_msgs
)

install(TARGETS
  px4_nats_bridge_node
  DESTINATION lib/${PROJECT_NAME}
)

ament_package()
