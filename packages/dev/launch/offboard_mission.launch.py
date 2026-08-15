from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare


def generate_launch_description() -> LaunchDescription:
    params_file = PathJoinSubstitution(
        [FindPackageShare("offboard_mission"), "config", "offboard_mission.yaml"]
    )

    return LaunchDescription(
        [
            DeclareLaunchArgument(
                "num_waypoints",
                default_value="5",
                description="Number of random waypoints to visit after takeoff",
            ),
            DeclareLaunchArgument(
                "takeoff_altitude",
                default_value="5.0",
                description="Takeoff height above home in meters",
            ),
            DeclareLaunchArgument(
                "params_file",
                default_value=params_file,
                description="YAML file with offboard_mission parameters",
            ),
            Node(
                package="offboard_mission",
                executable="offboard_mission",
                name="offboard_mission",
                output="screen",
                emulate_tty=True,
                parameters=[
                    LaunchConfiguration("params_file"),
                    {
                        "num_waypoints": ParameterValue(
                            LaunchConfiguration("num_waypoints"), value_type=int
                        ),
                        "takeoff_altitude": ParameterValue(
                            LaunchConfiguration("takeoff_altitude"),
                            value_type=float,
                        ),
                    },
                ],
            ),
        ]
    )
