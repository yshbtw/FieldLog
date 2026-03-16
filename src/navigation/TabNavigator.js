import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
} from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { DashboardScreen, AnalyticsScreen } from "../screens";
import TimerStackNavigator from "./TimerStackNavigator";

const Tab = createBottomTabNavigator();


function CustomTabBar({ state, descriptors, navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.pillBar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isActive = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isActive && !event.defaultPrevented) {
              navigation.navigate({ name: route.name, merge: true });
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          let activeIcon, inactiveIcon, label;
          if (route.name === "Dashboard") {
            activeIcon = "albums";
            inactiveIcon = "albums-outline";
            label = "Dashboard";
          } else if (route.name === "Timer") {
            activeIcon = "play";
            inactiveIcon = "play-outline";
            label = "Timer";
          } else if (route.name === "Analytics") {
            activeIcon = "pie-chart";
            inactiveIcon = "pie-chart-outline";
            label = "Analytics";
          }

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabItem}
              activeOpacity={0.6}
              onPress={onPress}
              onLongPress={onLongPress}
            >
              {isActive ? (
                <View style={styles.activeTab}>
                  <View style={styles.activeIconCircle}>
                    <Ionicons name={activeIcon} size={30} color="#1A73E8" />
                  </View>
                  <Text style={styles.activeLabel}>{label}</Text>
                </View>
              ) : (
                <Ionicons name={inactiveIcon} size={24} color="#9CA3AF" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Timer" component={TimerStackNavigator} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fcfcfcff",
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 10,
    // Upward shadow
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 20,
  },

  pillBar: {
    flexDirection: "row",
    backgroundColor: "#fcfcfcff",
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: "space-around",
    alignItems: "center",
  },

  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 48,
  },

  activeTab: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  activeIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },

  activeLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A73E8",
    letterSpacing: 0.2,
  },
});