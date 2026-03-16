import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Map, Zap, Medal, Crown } from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { COLORS } from "@/constants/theme";
import useUser from "@/utils/auth/useUser";

const TABS = [
  { key: "territories", label: "Zones", icon: Map },
  { key: "distance", label: "Distance", icon: Zap },
  { key: "wins", label: "Wins", icon: Trophy },
];

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const { data: user } = useUser();
  const [activeTab, setActiveTab] = useState("territories");

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", activeTab],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?sort=${activeTab}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const leaderboard = data?.leaderboard || [];

  const getStatValue = (item) => {
    if (activeTab === "territories") return `${item.territories_owned || 0}`;
    if (activeTab === "distance")
      return `${(item.total_distance_km || 0).toFixed(1)}`;
    return `${item.wins || 0}`;
  };

  const getStatUnit = () => {
    if (activeTab === "territories") return "zones";
    if (activeTab === "distance") return "km";
    return "wins";
  };

  const getMedalColor = (index) => {
    if (index === 0) return "#FFD700";
    if (index === 1) return "#C0C0C0";
    if (index === 2) return "#CD7F32";
    return COLORS.textTertiary;
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.black }}>
      <StatusBar style="light" />
      <View style={{ paddingTop: insets.top + 20, paddingHorizontal: 24 }}>
        <Text
          style={{
            fontSize: 12,
            fontWeight: "700",
            color: COLORS.textTertiary,
            letterSpacing: 2,
          }}
        >
          RANKINGS
        </Text>
        <Text
          style={{
            fontSize: 30,
            fontWeight: "800",
            color: COLORS.white,
            marginTop: 4,
            letterSpacing: -1,
          }}
        >
          Leaderboard
        </Text>
      </View>

      {/* Tabs */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 24,
          marginTop: 24,
          gap: 8,
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const IconComp = tab.icon;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 12,
                borderRadius: 14,
                gap: 6,
                backgroundColor: isActive ? COLORS.accent : COLORS.surface,
                borderWidth: 1,
                borderColor: isActive ? COLORS.accent : COLORS.border,
              }}
            >
              <IconComp
                size={15}
                color={isActive ? COLORS.black : COLORS.textSecondary}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: isActive ? COLORS.black : COLORS.textSecondary,
                }}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1, marginTop: 20 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && (
          <View style={{ alignItems: "center", marginTop: 48 }}>
            <ActivityIndicator color={COLORS.accent} size="large" />
          </View>
        )}

        {/* Top 3 podium */}
        {!isLoading && leaderboard.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "flex-end",
              marginBottom: 28,
              gap: 8,
            }}
          >
            {[1, 0, 2].map((rank) => {
              const item = leaderboard[rank];
              if (!item) return <View key={rank} style={{ flex: 1 }} />;
              const isMe = item.id === user?.id;
              const isFirst = rank === 0;
              const height = isFirst ? 120 : rank === 1 ? 96 : 80;

              return (
                <Animated.View
                  key={item.id}
                  entering={FadeInDown.delay(rank * 100).duration(400)}
                  style={{ flex: 1, alignItems: "center" }}
                >
                  <View
                    style={{
                      width: isFirst ? 56 : 48,
                      height: isFirst ? 56 : 48,
                      borderRadius: isFirst ? 28 : 24,
                      backgroundColor: item.avatar_color || COLORS.accent,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 8,
                      borderWidth: 2,
                      borderColor: getMedalColor(rank),
                      shadowColor: getMedalColor(rank),
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: isFirst ? 0.5 : 0.3,
                      shadowRadius: isFirst ? 12 : 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: isFirst ? 20 : 16,
                        fontWeight: "800",
                        color: COLORS.black,
                      }}
                    >
                      {(item.username || item.name || "?")[0].toUpperCase()}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: isMe ? COLORS.accent : COLORS.white,
                      fontSize: 12,
                      fontWeight: "700",
                      marginBottom: 4,
                      maxWidth: 80,
                      textAlign: "center",
                    }}
                  >
                    {item.username || item.name || "Runner"}
                  </Text>
                  <View
                    style={{
                      width: "100%",
                      height: height,
                      borderRadius: 16,
                      backgroundColor: COLORS.surface,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isFirst && (
                      <Crown
                        size={18}
                        color={getMedalColor(0)}
                        style={{ marginBottom: 4 }}
                      />
                    )}
                    <Text
                      style={{
                        fontSize: isFirst ? 28 : 22,
                        fontWeight: "800",
                        color: COLORS.white,
                      }}
                    >
                      {getStatValue(item)}
                    </Text>
                    <Text
                      style={{
                        color: COLORS.textTertiary,
                        fontSize: 10,
                        fontWeight: "600",
                        marginTop: 2,
                        letterSpacing: 0.5,
                      }}
                    >
                      {getStatUnit()}
                    </Text>
                    <View
                      style={{
                        position: "absolute",
                        top: -8,
                        backgroundColor: getMedalColor(rank),
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "800",
                          color: COLORS.black,
                        }}
                      >
                        {rank + 1}
                      </Text>
                    </View>
                  </View>
                </Animated.View>
              );
            })}
          </View>
        )}

        {/* Rest of leaderboard */}
        {leaderboard.slice(3).map((item, index) => {
          const isMe = item.id === user?.id;
          const rank = index + 4;
          return (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay((index + 3) * 40).duration(300)}
              style={{
                backgroundColor: isMe ? COLORS.accentMuted : COLORS.surface,
                borderRadius: 16,
                padding: 16,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: isMe ? COLORS.borderAccent : COLORS.border,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: COLORS.surfaceElevated,
                }}
              >
                <Text
                  style={{
                    color: COLORS.textTertiary,
                    fontSize: 13,
                    fontWeight: "700",
                  }}
                >
                  {rank}
                </Text>
              </View>

              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  marginLeft: 10,
                  backgroundColor: item.avatar_color || COLORS.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "800",
                    color: COLORS.black,
                  }}
                >
                  {(item.username || item.name || "?")[0].toUpperCase()}
                </Text>
              </View>

              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text
                  style={{
                    color: isMe ? COLORS.accent : COLORS.white,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  {item.username || item.name || "Runner"}
                  {isMe ? " (You)" : ""}
                </Text>
                <Text
                  style={{
                    color: COLORS.textTertiary,
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  {item.total_runs || 0} runs · {item.wins || 0}W{" "}
                  {item.losses || 0}L
                </Text>
              </View>

              <View style={{ alignItems: "flex-end" }}>
                <Text
                  style={{
                    color: COLORS.white,
                    fontSize: 16,
                    fontWeight: "800",
                  }}
                >
                  {getStatValue(item)}
                </Text>
                <Text
                  style={{
                    color: COLORS.textTertiary,
                    fontSize: 10,
                    marginTop: 2,
                  }}
                >
                  {getStatUnit()}
                </Text>
              </View>
            </Animated.View>
          );
        })}

        {!isLoading && leaderboard.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 64 }}>
            <Trophy size={52} color={COLORS.textDisabled} />
            <Text
              style={{
                color: COLORS.textSecondary,
                fontSize: 17,
                fontWeight: "700",
                marginTop: 20,
              }}
            >
              No runners yet
            </Text>
            <Text
              style={{
                color: COLORS.textTertiary,
                fontSize: 13,
                marginTop: 6,
                textAlign: "center",
                lineHeight: 20,
              }}
            >
              Be the first to claim territory{"\n"}and top the leaderboard.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
