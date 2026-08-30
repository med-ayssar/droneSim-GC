from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.parameter_descriptions import ParameterValue
from launch_ros.substitutions import FindPackageShare

# Aachen, Germany (city centre, near the cathedral).
AACHEN_LAT = "50.7753"
AACHEN_LON = "6.0839"
AACHEN_ALT = "173.0"


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
                "start_lat",
                default_value=AACHEN_LAT,
                description="Start latitude WGS84 (default: Aachen, Germany)",
            ),
            DeclareLaunchArgument(
                "start_lon",
                default_value=AACHEN_LON,
                description="Start longitude WGS84 (default: Aachen, Germany)",
            ),
            DeclareLaunchArgument(
                "start_alt",
                default_value=AACHEN_ALT,
                description="Start altitude AMSL in meters (default: Aachen)",
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
                        "start_lat": ParameterValue(
                            LaunchConfiguration("start_lat"), value_type=float
                        ),
                        "start_lon": ParameterValue(
                            LaunchConfiguration("start_lon"), value_type=float
                        ),
                        "start_alt": ParameterValue(
                            LaunchConfiguration("start_alt"), value_type=float
                        ),
                    },
                ],
            ),
        ]
    )
