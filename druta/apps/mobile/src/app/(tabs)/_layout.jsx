import { Tabs } from "expo-router";
import { View } from "react-native";
import { Navigation, Swords, User, Trophy } from "lucide-react-native";
import { COLORS } from "@/constants/theme";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: COLORS.black,
          borderTopWidth: 0.5,
          borderTopColor: COLORS.border,
          paddingTop: 6,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textTertiary,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Track",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                ...(focused
                  ? {
                      shadowColor: COLORS.accent,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.6,
                      shadowRadius: 8,
                    }
                  : {}),
              }}
            >
              <Navigation
                color={color}
                size={22}
                strokeWidth={focused ? 2.5 : 1.8}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="run"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="race"
        options={{
          title: "Race",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                ...(focused
                  ? {
                      shadowColor: COLORS.accent,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.6,
                      shadowRadius: 8,
                    }
                  : {}),
              }}
            >
              <Swords
                color={color}
                size={22}
                strokeWidth={focused ? 2.5 : 1.8}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Ranks",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                ...(focused
                  ? {
                      shadowColor: COLORS.accent,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.6,
                      shadowRadius: 8,
                    }
                  : {}),
              }}
            >
              <Trophy
                color={color}
                size={22}
                strokeWidth={focused ? 2.5 : 1.8}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                ...(focused
                  ? {
                      shadowColor: COLORS.accent,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.6,
                      shadowRadius: 8,
                    }
                  : {}),
              }}
            >
              <User color={color} size={22} strokeWidth={focused ? 2.5 : 1.8} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
