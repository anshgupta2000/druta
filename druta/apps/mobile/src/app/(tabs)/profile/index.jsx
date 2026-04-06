import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  User,
  Route,
  UserPlus,
  LogOut,
  Check,
  X,
  Settings,
  Sparkles,
  Shirt,
  Pencil,
  ChevronRight,
  Map,
  Zap,
  Crown,
} from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, formatDuration } from "@/constants/theme";
import { getItemById } from "@/constants/lockerCatalog";
import useUser from "@/utils/auth/useUser";
import { useAuth } from "@/utils/auth/useAuth";

const PROFILE_TABS = [
  { key: "progress", label: "Progress" },
  { key: "runs", label: "Runs" },
  { key: "social", label: "Social" },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: user } = useUser();
  const { signIn, signOut, auth } = useAuth();
  const queryClient = useQueryClient();

  const [showAddFriend, setShowAddFriend] = useState(false);
  const [friendUsername, setFriendUsername] = useState("");
  const [showEditUsername, setShowEditUsername] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [activeTab, setActiveTab] = useState("progress");

  const { data: profileData } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!auth,
  });

  const { data: runsData } = useQuery({
    queryKey: ["runs"],
    queryFn: async () => {
      const res = await fetch("/api/runs");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!auth,
  });

  const { data: coreStatsData } = useQuery({
    queryKey: ["profile-core-stats"],
    queryFn: async () => {
      const res = await fetch("/api/profile/core-stats");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!auth,
    retry: false,
  });

  const { data: friendsData, refetch: refetchFriends } = useQuery({
    queryKey: ["friends"],
    queryFn: async () => {
      const res = await fetch("/api/friends");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!auth,
  });

  const profile = profileData?.user;
  const runs = runsData?.runs || [];
  const friends = friendsData?.friends || [];
  const pendingRequests = friendsData?.pending || [];

  const preferredName = (profile?.name || user?.name || "").trim();
  const displayName = preferredName || profile?.username || "Runner";
  const displayHandle = profile?.username ? `@${profile.username}` : null;
  const profileInitial = (displayName || "?")[0].toUpperCase();

  const fallbackCoreStats = useMemo(() => {
    const totalClaimed = runs.reduce(
      (sum, run) => sum + Number(run.territories_claimed || 0),
      0,
    );
    const bestRunClaimed = runs.reduce(
      (best, run) => Math.max(best, Number(run.territories_claimed || 0)),
      0,
    );
    const runsWithClaims = runs.filter(
      (run) => Number(run.territories_claimed || 0) > 0,
    ).length;
    const totalRuns = Number(profile?.total_runs || runs.length || 0);
    return {
      zones_owned: Number(profile?.territories_owned || 0),
      total_strength: Number(profile?.territories_owned || 0),
      average_strength: Number(profile?.territories_owned || 0) > 0 ? 1 : 0,
      leaderboard_rank: null,
      total_claimed: totalClaimed,
      best_run_claimed: bestRunClaimed,
      runs_with_claims: runsWithClaims,
      claimed_last_7d: totalClaimed,
      claim_rate_percent:
        totalRuns > 0
          ? Number(((runsWithClaims / totalRuns) * 100).toFixed(1))
          : 0,
      recent_run: runs[0] || null,
    };
  }, [profile?.territories_owned, profile?.total_runs, runs]);

  const coreStats = coreStatsData?.core_stats || fallbackCoreStats;
  const territoryImpactRuns = useMemo(() => {
    return runs
      .filter((run) => Number(run.territories_claimed || 0) > 0)
      .slice(0, 6);
  }, [runs]);
  const maxClaimedInRecentRuns = useMemo(() => {
    return territoryImpactRuns.reduce(
      (maxValue, run) =>
        Math.max(maxValue, Number(run.territories_claimed || 0)),
      1,
    );
  }, [territoryImpactRuns]);

  const hasAvatar = !!(profile?.avatar_url || profile?.avatar_thumbnail_url);
  const outfitLoadout = profile?.outfit_loadout || {};

  const updateProfile = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowEditUsername(false);
    },
  });

  const addFriend = useCallback(async () => {
    if (!friendUsername.trim()) return;
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friend_username: friendUsername.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setFriendUsername("");
        setShowAddFriend(false);
        refetchFriends();
        Alert.alert("Request Sent!", "They'll see your friend request.");
      } else {
        Alert.alert("Error", data.error || "Could not add friend");
      }
    } catch (err) {
      Alert.alert("Error", "Something went wrong");
    }
  }, [friendUsername, refetchFriends]);

  const acceptFriend = useCallback(
    async (requestId) => {
      try {
        await fetch("/api/friends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "accept",
            friend_request_id: requestId,
          }),
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refetchFriends();
      } catch (err) {
        console.error(err);
      }
    },
    [refetchFriends],
  );

  // Build equipped items summary for avatar hub
  const equippedSummary = [];
  if (outfitLoadout.hoodies) {
    const item = getItemById(outfitLoadout.hoodies.itemId);
    if (item) equippedSummary.push(item.icon);
  }
  if (outfitLoadout.tops) {
    const item = getItemById(outfitLoadout.tops.itemId);
    if (item) equippedSummary.push(item.icon);
  }
  if (outfitLoadout.bottoms) {
    const item = getItemById(outfitLoadout.bottoms.itemId);
    if (item) equippedSummary.push(item.icon);
  }
  if (outfitLoadout.shoes) {
    const item = getItemById(outfitLoadout.shoes.itemId);
    if (item) equippedSummary.push(item.icon);
  }
  if (outfitLoadout.caps) {
    const item = getItemById(outfitLoadout.caps.itemId);
    if (item) equippedSummary.push(item.icon);
  }
  const accCount = (outfitLoadout.accessories || []).length;

  // Not signed in
  if (!auth) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: COLORS.black,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <StatusBar style="light" />
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 44,
            backgroundColor: COLORS.surface,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <User size={40} color={COLORS.textDisabled} />
        </View>
        <Text
          style={{
            color: COLORS.white,
            fontSize: 26,
            fontWeight: "800",
            marginTop: 24,
            letterSpacing: -0.5,
          }}
        >
          Join Druta
        </Text>
        <Text
          style={{
            color: COLORS.textTertiary,
            fontSize: 14,
            marginTop: 8,
            textAlign: "center",
            paddingHorizontal: 48,
            lineHeight: 22,
          }}
        >
          Track runs, claim territory, and race your friends
        </Text>
        <TouchableOpacity
          onPress={() => signIn()}
          style={{
            marginTop: 32,
            backgroundColor: COLORS.accent,
            paddingHorizontal: 40,
            paddingVertical: 16,
            borderRadius: 16,
            shadowColor: COLORS.accent,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.4,
            shadowRadius: 20,
          }}
        >
          <Text
            style={{ color: COLORS.black, fontWeight: "700", fontSize: 16 }}
          >
            Sign In
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.black }}>
      <StatusBar style="light" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 24,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: COLORS.textTertiary,
              letterSpacing: 2,
            }}
          >
            PROFILE
          </Text>
          <TouchableOpacity onPress={() => signOut()} style={{ padding: 8 }}>
            <LogOut size={20} color={COLORS.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Profile Card */}
        <View
          style={{
            marginHorizontal: 24,
            marginTop: 20,
            backgroundColor: COLORS.surface,
            borderRadius: 24,
            padding: 28,
            borderWidth: 1,
            borderColor: COLORS.border,
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: profile?.avatar_color || COLORS.accent,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: profile?.avatar_color || COLORS.accent,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.35,
              shadowRadius: 20,
            }}
          >
            {profile?.avatar_thumbnail_url ? (
              <Image
                source={{ uri: profile.avatar_thumbnail_url }}
                style={{ width: 80, height: 80, borderRadius: 40 }}
                contentFit="cover"
              />
            ) : (
              <Text
                style={{
                  fontSize: 30,
                  fontWeight: "800",
                  color: COLORS.black,
                }}
              >
                {profileInitial}
              </Text>
            )}
          </View>

          {showEditUsername ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 16,
                gap: 8,
              }}
            >
              <TextInput
                value={newUsername}
                onChangeText={setNewUsername}
                placeholder="username"
                placeholderTextColor={COLORS.textTertiary}
                autoFocus
                style={{
                  color: COLORS.white,
                  fontSize: 16,
                  fontWeight: "600",
                  backgroundColor: COLORS.surfaceElevated,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 12,
                  minWidth: 120,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              />
              <TouchableOpacity
                onPress={() => updateProfile.mutate({ username: newUsername })}
              >
                <Check size={22} color={COLORS.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowEditUsername(false)}>
                <X size={22} color={COLORS.textTertiary} />
              </TouchableOpacity>
            </View>
          ) : (
            <View
              style={{
                alignItems: "center",
                marginTop: 16,
                width: "100%",
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: COLORS.white,
                  fontSize: 30,
                  fontWeight: "800",
                  letterSpacing: -1,
                  maxWidth: "100%",
                  textAlign: "center",
                }}
              >
                {displayName}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setNewUsername(profile?.username || "");
                  setShowEditUsername(true);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginTop: 6,
                  backgroundColor: COLORS.surfaceElevated,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  gap: 6,
                }}
              >
                <Text
                  style={{
                    color: COLORS.textSecondary,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {displayHandle || "Set Username"}
                </Text>
                <Settings size={13} color={COLORS.textTertiary} />
              </TouchableOpacity>
            </View>
          )}
          <Text
            style={{
              color: COLORS.textTertiary,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            {user?.email}
          </Text>

          {/* At a glance */}
          <View
            style={{
              marginTop: 24,
              width: "100%",
              borderRadius: 16,
              borderWidth: 1,
              borderColor: COLORS.border,
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={["rgba(45,122,255,0.18)", "rgba(12,12,14,0.94)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ padding: 14 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: COLORS.textSecondary,
                      fontSize: 10,
                      letterSpacing: 1.2,
                      fontWeight: "700",
                    }}
                  >
                    TERRITORY OVERVIEW
                  </Text>
                  <Text
                    style={{
                      color: COLORS.white,
                      fontSize: 16,
                      fontWeight: "800",
                      marginTop: 4,
                      letterSpacing: -0.3,
                    }}
                  >
                    {coreStats?.zones_owned || 0} zones owned
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Crown size={14} color={COLORS.gold} />
                  <Text
                    style={{
                      color: COLORS.white,
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    {coreStats?.leaderboard_rank
                      ? `#${coreStats.leaderboard_rank}`
                      : "Unranked"}
                  </Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </View>

        <View style={{ marginTop: 16, paddingHorizontal: 24 }}>
          <View
            style={{
              flexDirection: "row",
              backgroundColor: COLORS.surface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.border,
              padding: 4,
            }}
          >
            {PROFILE_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    backgroundColor: isActive
                      ? COLORS.accentMuted
                      : "transparent",
                    borderWidth: isActive ? 1 : 0,
                    borderColor: isActive ? COLORS.borderAccent : "transparent",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? COLORS.white : COLORS.textTertiary,
                      fontSize: 12,
                      fontWeight: isActive ? "700" : "600",
                      letterSpacing: 0.3,
                    }}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {activeTab === "progress" && (
          <>
            <View style={{ marginTop: 20, paddingHorizontal: 24 }}>
              <LinearGradient
                colors={["rgba(45,122,255,0.18)", "rgba(45,122,255,0.04)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: COLORS.borderAccent,
                  padding: 20,
                  overflow: "hidden",
                }}
              >
                <Text
                  style={{
                    color: COLORS.textSecondary,
                    fontSize: 10,
                    fontWeight: "700",
                    letterSpacing: 1.3,
                  }}
                >
                  CORE STATS
                </Text>
                <Text
                  style={{
                    color: COLORS.white,
                    fontSize: 24,
                    fontWeight: "800",
                    marginTop: 6,
                    letterSpacing: -0.8,
                  }}
                >
                  Territory Command
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    marginTop: 18,
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 14,
                      backgroundColor: "rgba(0,0,0,0.28)",
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Map size={13} color={COLORS.accent} />
                      <Text
                        style={{
                          color: COLORS.textSecondary,
                          fontSize: 10,
                          fontWeight: "700",
                          letterSpacing: 0.8,
                        }}
                      >
                        OWNED ZONES
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: COLORS.white,
                        fontSize: 28,
                        fontWeight: "800",
                        marginTop: 8,
                        letterSpacing: -0.8,
                      }}
                    >
                      {coreStats?.zones_owned || 0}
                    </Text>
                  </View>

                  <View
                    style={{
                      flex: 1,
                      padding: 12,
                      borderRadius: 14,
                      backgroundColor: "rgba(0,0,0,0.28)",
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Zap size={13} color={COLORS.cyan} />
                      <Text
                        style={{
                          color: COLORS.textSecondary,
                          fontSize: 10,
                          fontWeight: "700",
                          letterSpacing: 0.8,
                        }}
                      >
                        POWER
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: COLORS.white,
                        fontSize: 28,
                        fontWeight: "800",
                        marginTop: 8,
                        letterSpacing: -0.8,
                      }}
                    >
                      {coreStats?.total_strength || 0}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    marginTop: 14,
                    borderRadius: 12,
                    padding: 12,
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <View>
                    <Text
                      style={{
                        color: COLORS.textTertiary,
                        fontSize: 10,
                        fontWeight: "700",
                        letterSpacing: 0.8,
                      }}
                    >
                      TOTAL CLAIMED
                    </Text>
                    <Text
                      style={{
                        color: COLORS.white,
                        fontSize: 18,
                        fontWeight: "800",
                        marginTop: 4,
                      }}
                    >
                      {coreStats?.total_claimed || 0}
                    </Text>
                  </View>
                  <View>
                    <Text
                      style={{
                        color: COLORS.textTertiary,
                        fontSize: 10,
                        fontWeight: "700",
                        letterSpacing: 0.8,
                      }}
                    >
                      BEST RUN CLAIM
                    </Text>
                    <Text
                      style={{
                        color: COLORS.white,
                        fontSize: 18,
                        fontWeight: "800",
                        marginTop: 4,
                      }}
                    >
                      {coreStats?.best_run_claimed || 0}
                    </Text>
                  </View>
                  <View>
                    <Text
                      style={{
                        color: COLORS.textTertiary,
                        fontSize: 10,
                        fontWeight: "700",
                        letterSpacing: 0.8,
                      }}
                    >
                      CLAIM RATE
                    </Text>
                    <Text
                      style={{
                        color: COLORS.white,
                        fontSize: 18,
                        fontWeight: "800",
                        marginTop: 4,
                      }}
                    >
                      {coreStats?.claim_rate_percent || 0}%
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </View>

            <View style={{ marginTop: 20, paddingHorizontal: 24 }}>
              <Text
                style={{
                  color: COLORS.textSecondary,
                  fontSize: 12,
                  fontWeight: "700",
                  letterSpacing: 1.2,
                  marginBottom: 12,
                }}
              >
                TERRITORY IMPACT RUNS
              </Text>
              {territoryImpactRuns.length === 0 && (
                <View
                  style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: 16,
                    padding: 18,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.textSecondary,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    No claiming runs yet
                  </Text>
                  <Text
                    style={{
                      color: COLORS.textTertiary,
                      fontSize: 12,
                      marginTop: 4,
                    }}
                  >
                    Start a run to begin capturing territory in real time.
                  </Text>
                </View>
              )}
              {territoryImpactRuns.map((run, index) => {
                const claimed = Number(run.territories_claimed || 0);
                const dateLabel = run.started_at
                  ? new Date(run.started_at).toLocaleDateString("en-IN", {
                      month: "short",
                      day: "numeric",
                    })
                  : "";
                const widthPercent = Math.max(
                  12,
                  Math.round((claimed / maxClaimedInRecentRuns) * 100),
                );
                return (
                  <Animated.View
                    key={run.id}
                    entering={FadeInDown.delay(index * 40).duration(260)}
                    style={{
                      marginBottom: 8,
                      padding: 12,
                      borderRadius: 14,
                      backgroundColor: COLORS.surface,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <Text
                        style={{
                          color: COLORS.white,
                          fontSize: 13,
                          fontWeight: "700",
                        }}
                      >
                        {claimed} zones claimed
                      </Text>
                      <Text
                        style={{
                          color: COLORS.textTertiary,
                          fontSize: 11,
                          fontWeight: "600",
                        }}
                      >
                        {dateLabel}
                      </Text>
                    </View>
                    <View
                      style={{
                        height: 6,
                        borderRadius: 4,
                        backgroundColor: COLORS.surfaceElevated,
                        overflow: "hidden",
                      }}
                    >
                      <LinearGradient
                        colors={[COLORS.accent, COLORS.cyan]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{
                          width: `${widthPercent}%`,
                          height: "100%",
                        }}
                      />
                    </View>
                  </Animated.View>
                );
              })}
            </View>

            {/* ===== AVATAR HUB ===== */}
            <View style={{ marginTop: 28, paddingHorizontal: 24 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: COLORS.textTertiary,
                  letterSpacing: 1.5,
                  marginBottom: 14,
                }}
              >
                AVATAR
              </Text>

              {hasAvatar ? (
                /* Has avatar — show preview + action buttons */
                <View
                  style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    overflow: "hidden",
                  }}
                >
                  {/* Avatar preview area */}
                  <View
                    style={{
                      height: 200,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: COLORS.surfaceElevated,
                      borderBottomWidth: 1,
                      borderBottomColor: COLORS.border,
                    }}
                  >
                    {profile?.avatar_thumbnail_url ? (
                      <Image
                        source={{ uri: profile.avatar_thumbnail_url }}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="contain"
                        transition={200}
                      />
                    ) : (
                      <View style={{ alignItems: "center" }}>
                        <View
                          style={{
                            width: 80,
                            height: 80,
                            borderRadius: 40,
                            backgroundColor:
                              profile?.avatar_color || COLORS.accent,
                            alignItems: "center",
                            justifyContent: "center",
                            shadowColor: profile?.avatar_color || COLORS.accent,
                            shadowOpacity: 0.4,
                            shadowRadius: 20,
                            shadowOffset: { width: 0, height: 0 },
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 36,
                              fontWeight: "800",
                              color: COLORS.black,
                            }}
                          >
                            {profileInitial}
                          </Text>
                        </View>
                        <Text
                          style={{
                            color: COLORS.textTertiary,
                            fontSize: 11,
                            marginTop: 10,
                          }}
                        >
                          3D preview available on device
                        </Text>
                      </View>
                    )}

                    {/* Equipped outfit icons overlay */}
                    {equippedSummary.length > 0 && (
                      <View
                        style={{
                          position: "absolute",
                          bottom: 10,
                          right: 12,
                          flexDirection: "row",
                          backgroundColor: "rgba(0,0,0,0.7)",
                          borderRadius: 10,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          gap: 3,
                        }}
                      >
                        {equippedSummary.map((emoji, i) => (
                          <Text key={i} style={{ fontSize: 14 }}>
                            {emoji}
                          </Text>
                        ))}
                        {accCount > 0 && (
                          <Text
                            style={{
                              color: COLORS.textSecondary,
                              fontSize: 10,
                              fontWeight: "600",
                              alignSelf: "center",
                            }}
                          >
                            +{accCount}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Action buttons */}
                  <View style={{ padding: 16, gap: 10 }}>
                    <TouchableOpacity
                      onPress={() =>
                        router.push("/(tabs)/profile/avatar-creator")
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: COLORS.surfaceElevated,
                        borderRadius: 14,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        borderWidth: 1,
                        borderColor: COLORS.border,
                      }}
                    >
                      <Pencil size={18} color={COLORS.accent} />
                      <Text
                        style={{
                          color: COLORS.white,
                          fontSize: 14,
                          fontWeight: "600",
                          marginLeft: 12,
                          flex: 1,
                        }}
                      >
                        Edit Avatar
                      </Text>
                      <ChevronRight size={16} color={COLORS.textTertiary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => router.push("/(tabs)/profile/locker")}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: COLORS.accentMuted,
                        borderRadius: 14,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        borderWidth: 1,
                        borderColor: COLORS.borderAccent,
                      }}
                    >
                      <Shirt size={18} color={COLORS.accent} />
                      <Text
                        style={{
                          color: COLORS.accent,
                          fontSize: 14,
                          fontWeight: "700",
                          marginLeft: 12,
                          flex: 1,
                        }}
                      >
                        Open Locker
                      </Text>
                      <ChevronRight size={16} color={COLORS.accent} />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* No avatar — first-time CTA */
                <View
                  style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: 24,
                    padding: 32,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: COLORS.borderAccent,
                  }}
                >
                  <View
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 36,
                      backgroundColor: COLORS.accentGlow,
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 16,
                    }}
                  >
                    <Sparkles size={32} color={COLORS.accent} />
                  </View>
                  <Text
                    style={{
                      color: COLORS.white,
                      fontSize: 20,
                      fontWeight: "800",
                      letterSpacing: -0.5,
                      marginBottom: 6,
                    }}
                  >
                    Create your Avatar
                  </Text>
                  <Text
                    style={{
                      color: COLORS.textTertiary,
                      fontSize: 13,
                      textAlign: "center",
                      lineHeight: 20,
                      marginBottom: 24,
                      paddingHorizontal: 16,
                    }}
                  >
                    Design a 3D avatar that represents you on the leaderboard
                    and in races
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      router.push("/(tabs)/profile/avatar-creator")
                    }
                    style={{
                      backgroundColor: COLORS.accent,
                      paddingHorizontal: 32,
                      paddingVertical: 14,
                      borderRadius: 16,
                      shadowColor: COLORS.accent,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.4,
                      shadowRadius: 20,
                      width: "100%",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: COLORS.black,
                        fontWeight: "800",
                        fontSize: 15,
                      }}
                    >
                      Create Avatar
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => router.push("/(tabs)/profile/locker")}
                    style={{ marginTop: 14 }}
                  >
                    <Text
                      style={{
                        color: COLORS.accent,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      Browse the Locker →
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </>
        )}

        {activeTab === "social" && (
          <>
            {/* Pending Friend Requests */}
            {pendingRequests.length > 0 && (
              <View style={{ marginTop: 28, paddingHorizontal: 24 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: COLORS.orange,
                    letterSpacing: 1.5,
                    marginBottom: 14,
                  }}
                >
                  REQUESTS
                </Text>
                {pendingRequests.map((req) => (
                  <View
                    key={req.id}
                    style={{
                      backgroundColor: COLORS.surface,
                      borderRadius: 16,
                      padding: 16,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: COLORS.orangeDim,
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <View
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 19,
                          backgroundColor: req.avatar_color || COLORS.orange,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "800",
                            color: COLORS.black,
                          }}
                        >
                          {(req.username || req.name || "?")[0].toUpperCase()}
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: COLORS.white,
                          fontSize: 14,
                          fontWeight: "600",
                          marginLeft: 12,
                        }}
                      >
                        {req.username || req.name}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => acceptFriend(req.id)}
                        style={{
                          backgroundColor: COLORS.accent,
                          padding: 9,
                          borderRadius: 12,
                        }}
                      >
                        <Check size={16} color={COLORS.black} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={async () => {
                          await fetch("/api/friends", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              action: "decline",
                              friend_request_id: req.id,
                            }),
                          });
                          refetchFriends();
                        }}
                        style={{
                          backgroundColor: COLORS.surfaceElevated,
                          padding: 9,
                          borderRadius: 12,
                        }}
                      >
                        <X size={16} color={COLORS.textTertiary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Friends */}
            <View style={{ marginTop: 28, paddingHorizontal: 24 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 14,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: COLORS.textTertiary,
                    letterSpacing: 1.5,
                  }}
                >
                  FRIENDS · {friends.length}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowAddFriend(!showAddFriend)}
                >
                  <UserPlus size={20} color={COLORS.accent} />
                </TouchableOpacity>
              </View>

              {showAddFriend && (
                <Animated.View
                  entering={FadeInDown.duration(200)}
                  style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 14,
                    borderWidth: 1,
                    borderColor: COLORS.borderAccent,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <TextInput
                    value={friendUsername}
                    onChangeText={setFriendUsername}
                    placeholder="Enter username"
                    placeholderTextColor={COLORS.textTertiary}
                    autoFocus
                    returnKeyType="send"
                    onSubmitEditing={addFriend}
                    style={{
                      flex: 1,
                      color: COLORS.white,
                      fontSize: 15,
                      backgroundColor: COLORS.surfaceElevated,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                    }}
                  />
                  <TouchableOpacity
                    onPress={addFriend}
                    style={{
                      backgroundColor: COLORS.accent,
                      padding: 10,
                      borderRadius: 12,
                    }}
                  >
                    <UserPlus size={18} color={COLORS.black} />
                  </TouchableOpacity>
                </Animated.View>
              )}

              {friends.length === 0 && !showAddFriend && (
                <View
                  style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: 20,
                    padding: 24,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: COLORS.border,
                  }}
                >
                  <User size={32} color={COLORS.textDisabled} />
                  <Text
                    style={{
                      color: COLORS.textSecondary,
                      fontSize: 14,
                      fontWeight: "600",
                      marginTop: 10,
                    }}
                  >
                    No friends yet
                  </Text>
                  <TouchableOpacity
                    onPress={() => setShowAddFriend(true)}
                    style={{ marginTop: 8 }}
                  >
                    <Text
                      style={{
                        color: COLORS.accent,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      + Add a friend
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {friends.map((friend) => (
                <View
                  key={friend.id}
                  style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: friend.avatar_color || COLORS.accent,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "800",
                        color: COLORS.black,
                      }}
                    >
                      {(friend.username || friend.name || "?")[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text
                      style={{
                        color: COLORS.white,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {friend.username || friend.name || "Runner"}
                    </Text>
                    <Text
                      style={{
                        color: COLORS.textTertiary,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      {friend.territories_owned || 0} zones · {friend.wins || 0}{" "}
                      wins
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {activeTab === "runs" && (
          <View style={{ marginTop: 28, paddingHorizontal: 24 }}>
            {/* Run History */}
            <View style={{ marginBottom: 14 }}>
              <LinearGradient
                colors={["rgba(45,122,255,0.14)", "rgba(12,12,14,0.95)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  padding: 14,
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
                      letterSpacing: 1,
                    }}
                  >
                    LIFETIME
                  </Text>
                  <Text
                    style={{
                      color: COLORS.white,
                      fontSize: 18,
                      fontWeight: "800",
                      marginTop: 4,
                    }}
                  >
                    {(profile?.total_distance_km || 0).toFixed(1)} km
                  </Text>
                </View>
                <View>
                  <Text
                    style={{
                      color: COLORS.textSecondary,
                      fontSize: 10,
                      fontWeight: "700",
                      letterSpacing: 1,
                    }}
                  >
                    RUNS
                  </Text>
                  <Text
                    style={{
                      color: COLORS.white,
                      fontSize: 18,
                      fontWeight: "800",
                      marginTop: 4,
                    }}
                  >
                    {profile?.total_runs || runs.length || 0}
                  </Text>
                </View>
                <View>
                  <Text
                    style={{
                      color: COLORS.textSecondary,
                      fontSize: 10,
                      fontWeight: "700",
                      letterSpacing: 1,
                    }}
                  >
                    WINS
                  </Text>
                  <Text
                    style={{
                      color: COLORS.white,
                      fontSize: 18,
                      fontWeight: "800",
                      marginTop: 4,
                    }}
                  >
                    {profile?.wins || 0}
                  </Text>
                </View>
              </LinearGradient>
            </View>

            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: COLORS.textTertiary,
                letterSpacing: 1.5,
                marginBottom: 14,
              }}
            >
              ACTIVITY
            </Text>
            {runs.length === 0 && (
              <View
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: 20,
                  padding: 24,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Route size={32} color={COLORS.textDisabled} />
                <Text
                  style={{
                    color: COLORS.textSecondary,
                    fontSize: 14,
                    fontWeight: "600",
                    marginTop: 10,
                  }}
                >
                  No runs yet
                </Text>
                <Text
                  style={{
                    color: COLORS.textTertiary,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  Your run history will appear here
                </Text>
              </View>
            )}
            {runs.slice(0, 10).map((run, index) => {
              const dateStr = run.started_at
                ? new Date(run.started_at).toLocaleDateString("en-IN", {
                    month: "short",
                    day: "numeric",
                  })
                : "";
              return (
                <Animated.View
                  key={run.id}
                  entering={FadeInDown.delay(index * 30).duration(250)}
                  style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: COLORS.border,
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
                          color: COLORS.white,
                          fontSize: 17,
                          fontWeight: "800",
                          letterSpacing: -0.3,
                        }}
                      >
                        {(run.distance_km || 0).toFixed(2)} km
                      </Text>
                      <Text
                        style={{
                          color: COLORS.textTertiary,
                          fontSize: 11,
                          marginTop: 3,
                        }}
                      >
                        {formatDuration(run.duration_seconds || 0)} ·{" "}
                        {run.territories_claimed || 0} claimed
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <View
                        style={{
                          backgroundColor:
                            Number(run.territories_claimed || 0) > 0
                              ? COLORS.accentMuted
                              : COLORS.surfaceElevated,
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor:
                            Number(run.territories_claimed || 0) > 0
                              ? COLORS.borderAccent
                              : COLORS.border,
                        }}
                      >
                        <Text
                          style={{
                            color:
                              Number(run.territories_claimed || 0) > 0
                                ? COLORS.accent
                                : COLORS.textSecondary,
                            fontSize: 11,
                            fontWeight: "700",
                          }}
                        >
                          {run.territories_claimed || 0} claimed
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: COLORS.textSecondary,
                          fontSize: 11,
                          fontWeight: "600",
                          marginTop: 6,
                        }}
                      >
                        {dateStr}
                      </Text>
                    </View>
                  </View>
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
