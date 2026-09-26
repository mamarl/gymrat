import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { useTheme } from "../../context/ThemeContext";

export default function TabsLayout() {
  const { isDark } = useTheme();

  const colors = {
    background: isDark ? "#1c1c1e" : "#ffffff",
    header: isDark ? "#0b0b0c" : "#f5f5f5",
    headerText: isDark ? "#fff" : "#111",
    inactive: isDark ? "#8a8a8e" : "#777",
  };

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.header,
        },

        headerTintColor:
          colors.headerText,

        headerShadowVisible: false,

        tabBarActiveTintColor:
          "#22c55e",

        tabBarInactiveTintColor:
          colors.inactive,

        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 20,
          height: 64,
          borderRadius: 32,

          backgroundColor:
            colors.background,

          borderTopWidth: 0,

          paddingTop: 8,
          paddingBottom: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Workout",

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="barbell"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="water"
        options={{
          title: "Water",

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="water"
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",

          tabBarIcon: ({
            color,
            size,
          }) => (
            <Ionicons
              name="person"
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}