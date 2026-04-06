import { useMemo, useState } from "react";
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
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/constants/theme";
import useUser from "@/utils/auth/useUser";

const TAB_META = {
  territories: {
    key: "territories",
    label: "Zones",
    unit: "zones",
    accent: COLORS.accent,
    glow: "rgba(45,122,255,0.26)",
    borderGlow: "rgba(45,122,255,0.32)",
    rowTint: "rgba(45,122,255,0.12)",
    description: "Own more tiles to climb.",
    icon: Map,
    getValue: (item) => Number(item?.territories_owned || 0),
  },
  distance: {
    key: "distance",
    label: "Distance",
    unit: "km",
    accent: COLORS.cyan,
    glow: "rgba(0,212,255,0.24)",
    borderGlow: "rgba(0,212,255,0.32)",
    rowTint: "rgba(0,212,255,0.1)",
    description: "Weekly mileage leaders.",
    icon: Zap,
    getValue: (item) => Number(item?.total_distance_km || 0),
  },
  wins: {
    key: "wins",
    label: "Wins",
    unit: "wins",
    accent: COLORS.orange,
    glow: "rgba(255,107,53,0.24)",
    borderGlow: "rgba(255,107,53,0.32)",
    rowTint: "rgba(255,107,53,0.1)",
    description: "Head-to-head dominance.",
    icon: Trophy,
    getValue: (item) => Number(item?.wins || 0),
  },
};

const TABS = Object.values(TAB_META);
const PODIUM_ORDER = [1, 0, 2];

const getDisplayName = (item) => {
  const name = (item?.name || "").trim();
  if (name.length > 0) return name;
  const username = (item?.username || "").trim();
  if (username.length > 0) return username;
  return "Runner";
};

const getHandle = (item) => {
  const username = (item?.username || "").trim();
  if (!username) return null;
  const name = (item?.name || "").trim();
  if (name && name.toLowerCase() === username.toLowerCase()) return null;
  return `@${username}`;
};

const getInitial = (item) => getDisplayName(item)[0].toUpperCase();

const getMedalColor = (rank) => {
  if (rank === 1) return "#FFD700";
  if (rank === 2) return "#C0C0C0";
  return "#CD7F32";
};

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
  const activeMeta = TAB_META[activeTab] || TAB_META.territories;

  const myRank = useMemo(() => {
    if (!user?.id) return null;
    const index = leaderboard.findIndex((entry) => entry.id === user.id);
    return index >= 0 ? index + 1 : null;
  }, [leaderboard, user?.id]);

  const myEntry = myRank ? leaderboard[myRank - 1] : null;

  const formatStatValue = (item) => {
    const value = activeMeta.getValue(item);
    if (activeTab === "distance") return value.toFixed(1);
    return String(Math.round(value));
  };

  const podiumSlots = PODIUM_ORDER.map((index) => ({
    item: leaderboard[index] || null,
    rank: index + 1,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.black }}>
      <StatusBar style="light" />
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 24 }}>
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
            fontSize: 42,
            fontWeight: "800",
            color: COLORS.white,
            marginTop: 6,
            letterSpacing: -1.4,
            lineHeight: 46,
          }}
        >
          Leaderboard
        </Text>
      </View>

      <View style={{ paddingHorizontal: 24, marginTop: 16 }}>
        <LinearGradient
          colors={[activeMeta.glow, "rgba(12,12,14,0.95)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: activeMeta.borderGlow,
            padding: 14,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View>
              <Text
                style={{
                  color: COLORS.textSecondary,
                  fontSize: 10,
                  fontWeight: "700",
                  letterSpacing: 1.1,
                }}
              >
                {activeMeta.label.toUpperCase()} LEAGUE
              </Text>
              <Text
                style={{
                  color: COLORS.white,
                  fontSize: 16,
                  fontWeight: "700",
                  marginTop: 4,
                }}
              >
                {activeMeta.description}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: "rgba(0,0,0,0.32)",
                borderWidth: 1,
                borderColor: COLORS.border,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Medal size={14} color={activeMeta.accent} />
              <Text
                style={{
                  color: COLORS.white,
                  fontSize: 12,
                  fontWeight: "700",
                }}
              >
                {myRank ? `#${myRank}` : "Unranked"}
              </Text>
            </View>
          </View>

          {myEntry && (
            <Text
              numberOfLines={1}
              style={{
                marginTop: 10,
                color: COLORS.textSecondary,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              You have {formatStatValue(myEntry)} {activeMeta.unit}
            </Text>
          )}
        </LinearGradient>
      </View>

      <View
        style={{
          flexDirection: "row",
          marginTop: 16,
          paddingHorizontal: 24,
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
              style={{ flex: 1 }}
            >
              {isActive ? (
                <LinearGradient
                  colors={[tab.glow, "rgba(12,12,14,0.96)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    borderRadius: 14,
                    paddingVertical: 12,
                    borderWidth: 1,
                    borderColor: tab.borderGlow,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <IconComp size={15} color={tab.accent} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: COLORS.white,
                    }}
                  >
                    {tab.label}
                  </Text>
                </LinearGradient>
              ) : (
                <View
                  style={{
                    borderRadius: 14,
                    paddingVertical: 12,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    backgroundColor: COLORS.surface,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <IconComp size={15} color={COLORS.textSecondary} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: COLORS.textSecondary,
                    }}
                  >
                    {tab.label}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1, marginTop: 18 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && (
          <View style={{ alignItems: "center", marginTop: 48 }}>
            <ActivityIndicator color={activeMeta.accent} size="large" />
          </View>
        )}

        {!isLoading && leaderboard.length > 0 && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              justifyContent: "center",
              gap: 10,
              marginBottom: 24,
            }}
          >
            {podiumSlots.map(({ item, rank }, slotIndex) => {
              if (!item) {
                return <View key={`empty-${rank}`} style={{ flex: 1 }} />;
              }

              const isChampion = rank === 1;
              const isMe = item.id === user?.id;
              const avatarSize = isChampion ? 68 : 56;

              return (
                <Animated.View
                  key={item.id}
                  entering={FadeInDown.delay(slotIndex * 90).duration(360)}
                  style={{ flex: isChampion ? 1.15 : 1, alignItems: "center" }}
                >
                  <View style={{ alignItems: "center", marginBottom: 10 }}>
                    <View
                      style={{
                        width: avatarSize,
                        height: avatarSize,
                        borderRadius: avatarSize / 2,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: item.avatar_color || activeMeta.accent,
                        borderWidth: 2.5,
                        borderColor: getMedalColor(rank),
                        shadowColor: getMedalColor(rank),
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: isChampion ? 0.45 : 0.25,
                        shadowRadius: isChampion ? 14 : 8,
                      }}
                    >
                      <Text
                        style={{
                          color: COLORS.black,
                          fontSize: isChampion ? 28 : 22,
                          fontWeight: "900",
                        }}
                      >
                        {getInitial(item)}
                      </Text>
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        color: isMe ? activeMeta.accent : COLORS.white,
                        fontSize: 14,
                        fontWeight: "700",
                        marginTop: 8,
                        maxWidth: 96,
                        textAlign: "center",
                      }}
                    >
                      {getDisplayName(item)}
                    </Text>
                  </View>

                  <LinearGradient
                    colors={
                      isChampion
                        ? [activeMeta.glow, "rgba(12,12,14,0.95)"]
                        : ["rgba(255,255,255,0.03)", "rgba(12,12,14,0.95)"]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      width: "100%",
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: isChampion
                        ? activeMeta.borderGlow
                        : COLORS.border,
                      paddingTop: 14,
                      paddingBottom: 12,
                      alignItems: "center",
                      minHeight: isChampion ? 124 : 104,
                    }}
                  >
                    <View
                      style={{
                        position: "absolute",
                        top: -11,
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: getMedalColor(rank),
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: COLORS.black,
                          fontSize: 12,
                          fontWeight: "900",
                        }}
                      >
                        {rank}
                      </Text>
                    </View>

                    {isChampion && (
                      <Crown
                        size={16}
                        color={getMedalColor(1)}
                        style={{ marginBottom: 4 }}
                      />
                    )}
                    <Text
                      style={{
                        color: COLORS.white,
                        fontSize: isChampion ? 34 : 26,
                        fontWeight: "800",
                        letterSpacing: -1,
                      }}
                    >
                      {formatStatValue(item)}
                    </Text>
                    <Text
                      style={{
                        color: COLORS.textTertiary,
                        fontSize: 11,
                        fontWeight: "600",
                        marginTop: 2,
                        letterSpacing: 0.6,
                      }}
                    >
                      {activeMeta.unit}
                    </Text>
                  </LinearGradient>
                </Animated.View>
              );
            })}
          </View>
        )}

        {!isLoading && leaderboard.length > 3 && (
          <Text
            style={{
              color: COLORS.textSecondary,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1.2,
              marginBottom: 10,
            }}
          >
            ALL RUNNERS
          </Text>
        )}

        {leaderboard.slice(3).map((item, index) => {
          const isMe = item.id === user?.id;
          const rank = index + 4;
          const handle = getHandle(item);

          return (
            <Animated.View
              key={item.id}
              entering={FadeInDown.delay((index + 3) * 30).duration(280)}
              style={{ marginBottom: 8 }}
            >
              <View
                style={{
                  borderRadius: 16,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: isMe ? activeMeta.borderGlow : COLORS.border,
                  backgroundColor: isMe ? activeMeta.rowTint : COLORS.surface,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: COLORS.surfaceElevated,
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.textTertiary,
                      fontSize: 13,
                      fontWeight: "800",
                    }}
                  >
                    {rank}
                  </Text>
                </View>

                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: item.avatar_color || activeMeta.accent,
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.black,
                      fontSize: 17,
                      fontWeight: "900",
                    }}
                  >
                    {getInitial(item)}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: isMe ? activeMeta.accent : COLORS.white,
                      fontSize: 17,
                      fontWeight: "700",
                      letterSpacing: -0.2,
                    }}
                  >
                    {getDisplayName(item)}
                    {isMe ? " (You)" : ""}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      color: COLORS.textSecondary,
                      fontSize: 11,
                      marginTop: 2,
                    }}
                  >
                    {handle ? `${handle}  •  ` : ""}
                    {item.total_runs || 0} runs · {item.wins || 0}W{" "}
                    {item.losses || 0}L
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    style={{
                      color: COLORS.white,
                      fontSize: 20,
                      fontWeight: "800",
                      letterSpacing: -0.4,
                    }}
                  >
                    {formatStatValue(item)}
                  </Text>
                  <Text
                    style={{
                      color: COLORS.textTertiary,
                      fontSize: 10,
                      fontWeight: "600",
                      marginTop: 2,
                      letterSpacing: 0.6,
                    }}
                  >
                    {activeMeta.unit}
                  </Text>
                </View>
              </View>
            </Animated.View>
          );
        })}

        {!isLoading && leaderboard.length === 0 && (
          <View style={{ alignItems: "center", marginTop: 60 }}>
            <LinearGradient
              colors={["rgba(45,122,255,0.12)", "rgba(12,12,14,0.98)"]}
              style={{
                width: "100%",
                borderRadius: 20,
                borderWidth: 1,
                borderColor: COLORS.border,
                paddingVertical: 32,
                alignItems: "center",
              }}
            >
              <Trophy size={46} color={COLORS.textDisabled} />
              <Text
                style={{
                  color: COLORS.white,
                  fontSize: 18,
                  fontWeight: "700",
                  marginTop: 14,
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
                  paddingHorizontal: 24,
                }}
              >
                Be the first to claim territory and set the pace.
              </Text>
            </LinearGradient>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
