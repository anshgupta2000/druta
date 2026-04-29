import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Map, Medal, Crown, Users, Globe2, CalendarDays, Swords } from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "@/constants/theme";
import useUser from "@/utils/auth/useUser";

const TAB_META = {
  city: {
    key: "city",
    label: "City",
    unit: "zones",
    accent: COLORS.accent,
    glow: "rgba(45,122,255,0.26)",
    borderGlow: "rgba(45,122,255,0.32)",
    rowTint: "rgba(45,122,255,0.12)",
    description: "Own the city grid to climb.",
    icon: Map,
    getValue: (item) => Number(item?.territories_owned || 0),
  },
  friends: {
    key: "friends",
    label: "Friends",
    unit: "zones",
    accent: COLORS.cyan,
    glow: "rgba(0,212,255,0.24)",
    borderGlow: "rgba(0,212,255,0.32)",
    rowTint: "rgba(0,212,255,0.1)",
    description: "Rivals you can actually catch.",
    icon: Users,
    getValue: (item) => Number(item?.territories_owned || 0),
  },
  week: {
    key: "week",
    label: "Week",
    unit: "gained",
    accent: COLORS.orange,
    glow: "rgba(255,107,53,0.24)",
    borderGlow: "rgba(255,107,53,0.32)",
    rowTint: "rgba(255,107,53,0.1)",
    description: "Fresh war, reset every Sunday.",
    icon: CalendarDays,
    getValue: (item) => Number(item?.weekly_zones || 0),
  },
  global: {
    key: "global",
    label: "Global",
    unit: "zones",
    accent: COLORS.purple,
    glow: "rgba(139,92,246,0.22)",
    borderGlow: "rgba(139,92,246,0.3)",
    rowTint: "rgba(139,92,246,0.1)",
    description: "The full empire board.",
    icon: Globe2,
    getValue: (item) => Number(item?.territories_owned || 0),
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
  const [activeTab, setActiveTab] = useState("city");
  const [selectedRival, setSelectedRival] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", activeTab],
    queryFn: async () => {
      const scope = activeTab === "week" ? "week" : "global";
      const res = await fetch(`/api/leaderboard?scope=${scope}&sort=territories`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: weeklyData } = useQuery({
    queryKey: ["leaderboard", "weekly-war"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard?scope=week&sort=territories");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const leaderboard = data?.leaderboard || [];
  const activeMeta = TAB_META[activeTab] || TAB_META.city;

  const myRank = useMemo(() => {
    if (!user?.id) return null;
    const index = leaderboard.findIndex((entry) => entry.id === user.id);
    return index >= 0 ? index + 1 : null;
  }, [leaderboard, user?.id]);

  const myEntry = myRank ? leaderboard[myRank - 1] : null;

  const formatStatValue = (item) => {
    const value = activeMeta.getValue(item);
    return String(Math.round(value));
  };

  const podiumSlots = PODIUM_ORDER.map((index) => ({
    item: leaderboard[index] || null,
    rank: index + 1,
  }));

  const weeklyLeaders = weeklyData?.leaderboard || [];
  const weeklyTop = weeklyLeaders[0] || null;
  const weeklyMeIndex = user?.id
    ? weeklyLeaders.findIndex((entry) => entry.id === user.id)
    : -1;
  const weeklyMe = weeklyMeIndex >= 0 ? weeklyLeaders[weeklyMeIndex] : null;
  const rivalCard =
    selectedRival ||
    leaderboard.find((entry) => entry.id !== user?.id) ||
    leaderboard[0] ||
    null;

  const challengeRival = useCallback(
    async (rival) => {
      if (!rival || rival.id === user?.id) return;
      try {
        const res = await fetch("/api/races", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            opponent_id: rival.id,
            race_type: "distance",
            target_value: 5,
            time_limit_minutes: 45,
            stake_zones: 5,
            winner_bonus_strength: 3,
          }),
        });
        if (!res.ok) throw new Error("Challenge failed");
        Alert.alert("Challenge sent", `${getDisplayName(rival)} will see a 5 km race invite.`);
      } catch (err) {
        Alert.alert("Could not challenge", "Try again after adding them as a friend.");
      }
    },
    [user?.id],
  );

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
              onPress={() => {
                setActiveTab(tab.key);
                setSelectedRival(null);
              }}
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

      <View style={{ paddingHorizontal: 24, marginTop: 14 }}>
        <LinearGradient
          colors={["rgba(255,202,40,0.14)", "rgba(12,12,14,0.96)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "rgba(255,202,40,0.2)",
            padding: 14,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ color: COLORS.gold, fontSize: 11, fontWeight: "900", letterSpacing: 1.2 }}>
                WEEKLY WAR
              </Text>
              <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: "800", marginTop: 5 }}>
                Most zones gained wins 100 Druta Coins
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: COLORS.textTertiary, fontSize: 11, fontWeight: "700" }}>
                Leader
              </Text>
              <Text style={{ color: COLORS.gold, fontSize: 15, fontWeight: "900", marginTop: 3 }}>
                {weeklyTop ? `+${weeklyTop.weekly_zones || 0}` : "+0"}
              </Text>
            </View>
          </View>
          <View style={{ height: 6, borderRadius: 4, backgroundColor: COLORS.surfaceElevated, overflow: "hidden", marginTop: 12 }}>
            <View
              style={{
                height: "100%",
                width: `${Math.min(100, Math.max(8, ((weeklyMe?.weekly_zones || 0) / Math.max(1, weeklyTop?.weekly_zones || 1)) * 100))}%`,
                backgroundColor: COLORS.gold,
              }}
            />
          </View>
          <Text style={{ color: COLORS.textTertiary, fontSize: 11, fontWeight: "700", marginTop: 8 }}>
            {weeklyMeIndex >= 0
              ? `You are #${weeklyMeIndex + 1} this week with +${weeklyMe?.weekly_zones || 0}`
              : "Run this week to enter the war"}
          </Text>
        </LinearGradient>
      </View>

      <ScrollView
        style={{ flex: 1, marginTop: 18 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
      >
        {rivalCard && rivalCard.id !== user?.id && (
          <Animated.View entering={FadeInDown.duration(260)} style={{ marginBottom: 18 }}>
            <View
              style={{
                borderRadius: 22,
                padding: 18,
                backgroundColor: COLORS.surface,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: rivalCard.avatar_color || activeMeta.accent,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: COLORS.black, fontSize: 22, fontWeight: "900" }}>
                    {getInitial(rivalCard)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.white, fontSize: 20, fontWeight: "900" }}>
                    {getDisplayName(rivalCard)}
                  </Text>
                  <Text style={{ color: COLORS.textTertiary, fontSize: 12, fontWeight: "700", marginTop: 3 }}>
                    Rival target · {rivalCard.wins || 0}W {rivalCard.losses || 0}L
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: activeMeta.accent, fontSize: 24, fontWeight: "900" }}>
                    {formatStatValue(rivalCard)}
                  </Text>
                  <Text style={{ color: COLORS.textTertiary, fontSize: 10, fontWeight: "800" }}>
                    {activeMeta.unit}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <View
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    padding: 12,
                    backgroundColor: COLORS.surfaceElevated,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text style={{ color: COLORS.textTertiary, fontSize: 10, fontWeight: "900" }}>
                    SHARED ZONES
                  </Text>
                  <Text style={{ color: COLORS.orange, fontSize: 18, fontWeight: "900", marginTop: 4 }}>
                    {Math.max(1, Math.min(9, Math.round((rivalCard.territories_owned || 1) / 8)))} contested
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    padding: 12,
                    backgroundColor: COLORS.surfaceElevated,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text style={{ color: COLORS.textTertiary, fontSize: 10, fontWeight: "900" }}>
                    GAP
                  </Text>
                  <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: "900", marginTop: 4 }}>
                    {Math.abs((rivalCard.territories_owned || 0) - (myEntry?.territories_owned || 0))} zones
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => challengeRival(rivalCard)}
                activeOpacity={0.88}
                style={{
                  minHeight: 54,
                  marginTop: 16,
                  borderRadius: 16,
                  backgroundColor: COLORS.orange,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                }}
              >
                <Swords size={18} color={COLORS.white} />
                <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: "900" }}>
                  Challenge to Race
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

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
                  <TouchableOpacity
                    onPress={() => {
                      if (!isMe) setSelectedRival(item);
                    }}
                    activeOpacity={0.86}
                    style={{ width: "100%", alignItems: "center" }}
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
                  </TouchableOpacity>
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
              <TouchableOpacity
                onPress={() => {
                  if (!isMe) setSelectedRival(item);
                }}
                activeOpacity={0.82}
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
              </TouchableOpacity>
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
