import { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Swords,
  Check,
  X,
  ChevronRight,
  Trophy,
  Flame,
  CircleDot,
} from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { COLORS, calculateDistance, formatDuration } from "@/constants/theme";
import useUser from "@/utils/auth/useUser";
import { useAuth } from "@/utils/auth/useAuth";

export default function RaceScreen() {
  const insets = useSafeAreaInsets();
  const { data: user } = useUser();
  const { signIn, auth } = useAuth();
  const queryClient = useQueryClient();

  const [activeRace, setActiveRace] = useState(null);
  const [myDistance, setMyDistance] = useState(0);
  const [raceDuration, setRaceDuration] = useState(0);
  const [view, setView] = useState("lobby");

  const locationSub = useRef(null);
  const timerRef = useRef(null);
  const lastPos = useRef(null);
  const pollRef = useRef(null);

  const { data: racesData, refetch: refetchRaces } = useQuery({
    queryKey: ["races"],
    queryFn: async () => {
      const res = await fetch("/api/races");
      if (!res.ok) throw new Error("Failed to fetch races");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: async () => {
      const res = await fetch("/api/friends");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const races = racesData?.races || [];
  const friends = friendsData?.friends || [];
  const pendingChallenges = races.filter(
    (r) => r.status === "pending" && r.opponent_id === user?.id,
  );
  const activeRaces = races.filter((r) => r.status === "active");
  const recentResults = races
    .filter((r) => r.status === "finished")
    .slice(0, 5);

  const challengeFriend = useCallback(
    async (friendId) => {
      if (!auth) {
        signIn();
        return;
      }
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const res = await fetch("/api/races", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            opponent_id: friendId,
            race_type: "distance",
            target_value: 1,
          }),
        });
        if (res.ok) {
          Alert.alert(
            "Challenge Sent!",
            "Your opponent will see this when they open the app.",
          );
          refetchRaces();
        }
      } catch (err) {
        console.error("Challenge error:", err);
      }
    },
    [auth, signIn, refetchRaces],
  );

  const acceptChallenge = useCallback(async (raceId) => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const res = await fetch("/api/races", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ race_id: raceId, action: "accept" }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveRace(data.race);
        startRacing(data.race);
      }
    } catch (err) {
      console.error("Accept error:", err);
    }
  }, []);

  const startRacing = useCallback(async (race) => {
    setView("racing");
    setMyDistance(0);
    setRaceDuration(0);
    lastPos.current = null;
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Location Required", "GPS is needed for racing.");
      return;
    }

    timerRef.current = setInterval(() => {
      setRaceDuration((prev) => prev + 1);
    }, 1000);

    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,
        distanceInterval: 3,
      },
      async (loc) => {
        const { latitude, longitude } = loc.coords;
        if (lastPos.current) {
          const d = calculateDistance(
            lastPos.current.latitude,
            lastPos.current.longitude,
            latitude,
            longitude,
          );
          if (d < 0.1) {
            setMyDistance((prev) => {
              const newDist = prev + d;
              fetch("/api/races", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  race_id: race.id,
                  action: "update_distance",
                  distance: newDist,
                }),
              }).catch(console.error);
              return newDist;
            });
          }
        }
        lastPos.current = { latitude, longitude };
      },
    );

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/races?status=active");
        if (res.ok) {
          const data = await res.json();
          const currentRace = data.races?.find((r) => r.id === race.id);
          if (currentRace) {
            setActiveRace(currentRace);
            if (currentRace.status === "finished") finishRace(currentRace);
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 3000);
  }, []);

  const finishRace = useCallback(
    (race) => {
      setView("result");
      if (locationSub.current) {
        locationSub.current.remove();
        locationSub.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      Haptics.notificationAsync(
        race.winner_id === user?.id
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      );
      queryClient.invalidateQueries({ queryKey: ["races"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    [user, queryClient],
  );

  useEffect(() => {
    if (
      activeRace &&
      view === "racing" &&
      activeRace.race_type === "distance"
    ) {
      if (myDistance >= activeRace.target_value) {
        fetch("/api/races", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            race_id: activeRace.id,
            action: "update_distance",
            distance: myDistance,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.finished) finishRace(data.race);
          })
          .catch(console.error);
      }
    }
  }, [myDistance, activeRace, view]);

  useEffect(() => {
    return () => {
      if (locationSub.current) locationSub.current.remove();
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const isChallenger = activeRace?.challenger_id === user?.id;
  const opponentDistance = isChallenger
    ? activeRace?.opponent_distance || 0
    : activeRace?.challenger_distance || 0;
  const opponentName = isChallenger
    ? activeRace?.opponent_username || "Opponent"
    : activeRace?.challenger_username || "Opponent";
  const targetKm = activeRace?.target_value || 1;
  const myProgress = Math.min((myDistance / targetKm) * 100, 100);
  const oppProgress = Math.min((opponentDistance / targetKm) * 100, 100);
  const gap = myDistance - opponentDistance;

  // Racing view
  if (view === "racing" && activeRace) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.black }}>
        <StatusBar style="light" />
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: COLORS.red,
                letterSpacing: 2,
              }}
            >
              ● LIVE RACE
            </Text>
            <Text
              style={{
                fontSize: 26,
                fontWeight: "800",
                color: COLORS.white,
                marginTop: 4,
                letterSpacing: -0.5,
              }}
            >
              {targetKm} km Sprint
            </Text>
          </View>

          <View
            style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}
          >
            {/* Your progress */}
            <View style={{ marginBottom: 20 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    color: COLORS.accent,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  You
                </Text>
                <Text
                  style={{
                    color: COLORS.white,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  {myDistance.toFixed(3)} km
                </Text>
              </View>
              <View
                style={{
                  height: 8,
                  backgroundColor: COLORS.surface,
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    borderRadius: 4,
                    backgroundColor: COLORS.accent,
                    width: `${myProgress}%`,
                    shadowColor: COLORS.accent,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.8,
                    shadowRadius: 8,
                  }}
                />
              </View>
            </View>

            {/* Track visualization */}
            <View
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: 24,
                padding: 24,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <View style={{ height: 100, justifyContent: "center" }}>
                <View
                  style={{
                    height: 1,
                    backgroundColor: COLORS.border,
                    marginBottom: 28,
                  }}
                />
                <View style={{ height: 1, backgroundColor: COLORS.border }} />
                <View
                  style={{
                    position: "absolute",
                    top: 4,
                    left: `${Math.min(myProgress, 92)}%`,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: COLORS.accent,
                    alignItems: "center",
                    justifyContent: "center",
                    shadowColor: COLORS.accent,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.6,
                    shadowRadius: 12,
                  }}
                >
                  <Text style={{ fontSize: 12 }}>🏃</Text>
                </View>
                <View
                  style={{
                    position: "absolute",
                    bottom: 4,
                    left: `${Math.min(oppProgress, 92)}%`,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: COLORS.orange,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: 12 }}>🏃</Text>
                </View>
                <View
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    backgroundColor: COLORS.gold,
                    borderRadius: 1,
                  }}
                />
              </View>
              <View style={{ alignItems: "center", marginTop: 16 }}>
                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: "800",
                    color: gap >= 0 ? COLORS.accent : COLORS.orange,
                  }}
                >
                  {gap >= 0 ? "+" : ""}
                  {(gap * 1000).toFixed(0)}m
                </Text>
                <Text
                  style={{
                    color: COLORS.textTertiary,
                    fontSize: 11,
                    marginTop: 2,
                  }}
                >
                  {gap >= 0 ? "You're leading" : "They're ahead"}
                </Text>
              </View>
            </View>

            {/* Opponent progress */}
            <View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    color: COLORS.orange,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  {opponentName}
                </Text>
                <Text
                  style={{
                    color: COLORS.white,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  {opponentDistance.toFixed(3)} km
                </Text>
              </View>
              <View
                style={{
                  height: 8,
                  backgroundColor: COLORS.surface,
                  borderRadius: 4,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    height: "100%",
                    borderRadius: 4,
                    backgroundColor: COLORS.orange,
                    width: `${oppProgress}%`,
                  }}
                />
              </View>
            </View>

            <View style={{ alignItems: "center", marginTop: 36 }}>
              <Text
                style={{
                  color: COLORS.textTertiary,
                  fontSize: 11,
                  letterSpacing: 1,
                }}
              >
                RACE TIME
              </Text>
              <Text
                style={{
                  color: COLORS.white,
                  fontSize: 36,
                  fontWeight: "800",
                  letterSpacing: -1,
                }}
              >
                {formatDuration(raceDuration)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // Result view
  if (view === "result" && activeRace) {
    const won = activeRace.winner_id === user?.id;
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.black }}>
        <StatusBar style="light" />
        <View
          style={{
            flex: 1,
            paddingTop: insets.top,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
        >
          <Text style={{ fontSize: 52 }}>{won ? "🏆" : "😤"}</Text>
          <Text
            style={{
              fontSize: 34,
              fontWeight: "800",
              color: won ? COLORS.accent : COLORS.orange,
              marginTop: 16,
              letterSpacing: -1,
            }}
          >
            {won ? "VICTORY" : "DEFEATED"}
          </Text>
          <Text
            style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 8 }}
          >
            {won ? "Absolute domination." : "Next time."}
          </Text>

          <View
            style={{
              backgroundColor: COLORS.surface,
              borderRadius: 24,
              padding: 24,
              marginTop: 36,
              borderWidth: 1,
              borderColor: COLORS.border,
              width: "100%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <View style={{ alignItems: "center", flex: 1 }}>
                <Text
                  style={{
                    color: COLORS.textTertiary,
                    fontSize: 11,
                    letterSpacing: 1,
                  }}
                >
                  YOU
                </Text>
                <Text
                  style={{
                    color: COLORS.white,
                    fontSize: 26,
                    fontWeight: "800",
                    marginTop: 4,
                  }}
                >
                  {myDistance.toFixed(2)}
                </Text>
                <Text style={{ color: COLORS.textTertiary, fontSize: 11 }}>
                  km
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: COLORS.border }} />
              <View style={{ alignItems: "center", flex: 1 }}>
                <Text
                  style={{
                    color: COLORS.textTertiary,
                    fontSize: 11,
                    letterSpacing: 1,
                  }}
                >
                  {opponentName.toUpperCase()}
                </Text>
                <Text
                  style={{
                    color: COLORS.white,
                    fontSize: 26,
                    fontWeight: "800",
                    marginTop: 4,
                  }}
                >
                  {opponentDistance.toFixed(2)}
                </Text>
                <Text style={{ color: COLORS.textTertiary, fontSize: 11 }}>
                  km
                </Text>
              </View>
            </View>
            <View
              style={{
                alignItems: "center",
                borderTopWidth: 1,
                borderTopColor: COLORS.border,
                paddingTop: 16,
              }}
            >
              <Text
                style={{
                  color: COLORS.textTertiary,
                  fontSize: 11,
                  letterSpacing: 1,
                }}
              >
                TIME
              </Text>
              <Text
                style={{
                  color: COLORS.white,
                  fontSize: 20,
                  fontWeight: "700",
                  marginTop: 4,
                }}
              >
                {formatDuration(raceDuration)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => {
              setView("lobby");
              setActiveRace(null);
              refetchRaces();
            }}
            style={{
              marginTop: 36,
              backgroundColor: COLORS.accent,
              paddingHorizontal: 36,
              paddingVertical: 16,
              borderRadius: 16,
              shadowColor: COLORS.accent,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.3,
              shadowRadius: 16,
            }}
          >
            <Text
              style={{ color: COLORS.black, fontWeight: "700", fontSize: 16 }}
            >
              Back to Lobby
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Lobby view
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.black }}>
      <StatusBar style="light" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingTop: insets.top + 20, paddingHorizontal: 24 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: COLORS.textTertiary,
              letterSpacing: 2,
            }}
          >
            1v1
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
            Race Mode
          </Text>
        </View>

        {/* Pending Challenges */}
        {pendingChallenges.length > 0 && (
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
              ⚡ INCOMING
            </Text>
            {pendingChallenges.map((race) => (
              <Animated.View
                key={race.id}
                entering={FadeInDown.duration(300)}
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: 20,
                  padding: 18,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: COLORS.orangeDim,
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
                        fontSize: 16,
                        fontWeight: "700",
                      }}
                    >
                      {race.challenger_username || "Someone"}
                    </Text>
                    <Text
                      style={{
                        color: COLORS.textTertiary,
                        fontSize: 12,
                        marginTop: 3,
                      }}
                    >
                      {race.target_value} km race
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => acceptChallenge(race.id)}
                      style={{
                        backgroundColor: COLORS.accent,
                        padding: 10,
                        borderRadius: 14,
                      }}
                    >
                      <Check size={18} color={COLORS.black} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        await fetch("/api/races", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            race_id: race.id,
                            action: "decline",
                          }),
                        });
                        refetchRaces();
                      }}
                      style={{
                        backgroundColor: COLORS.surfaceElevated,
                        padding: 10,
                        borderRadius: 14,
                      }}
                    >
                      <X size={18} color={COLORS.textTertiary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>
            ))}
          </View>
        )}

        {/* Active Races */}
        {activeRaces.length > 0 && (
          <View style={{ marginTop: 28, paddingHorizontal: 24 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: COLORS.accent,
                letterSpacing: 1.5,
                marginBottom: 14,
              }}
            >
              ● ACTIVE
            </Text>
            {activeRaces.map((race) => (
              <TouchableOpacity
                key={race.id}
                onPress={() => {
                  setActiveRace(race);
                  startRacing(race);
                }}
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: 20,
                  padding: 18,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: COLORS.borderAccent,
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
                        fontSize: 16,
                        fontWeight: "700",
                      }}
                    >
                      vs{" "}
                      {race.challenger_id === user?.id
                        ? race.opponent_username
                        : race.challenger_username}
                    </Text>
                    <Text
                      style={{
                        color: COLORS.textTertiary,
                        fontSize: 12,
                        marginTop: 3,
                      }}
                    >
                      {race.target_value} km race
                    </Text>
                  </View>
                  <ChevronRight size={20} color={COLORS.accent} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Challenge Friends */}
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
            CHALLENGE
          </Text>
          {friends.length === 0 && (
            <View
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: 24,
                padding: 28,
                alignItems: "center",
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Swords size={36} color={COLORS.textDisabled} />
              <Text
                style={{
                  color: COLORS.textSecondary,
                  fontSize: 14,
                  fontWeight: "600",
                  marginTop: 14,
                }}
              >
                No friends yet
              </Text>
              <Text
                style={{
                  color: COLORS.textTertiary,
                  fontSize: 12,
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                Add friends from your Profile to race them
              </Text>
            </View>
          )}
          {friends.map((friend) => (
            <View
              key={friend.id}
              style={{
                backgroundColor: COLORS.surface,
                borderRadius: 18,
                padding: 16,
                marginBottom: 8,
                borderWidth: 1,
                borderColor: COLORS.border,
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    backgroundColor: friend.avatar_color || COLORS.accent,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "800",
                      color: COLORS.black,
                    }}
                  >
                    {(friend.username || friend.name || "?")[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ marginLeft: 12 }}>
                  <Text
                    style={{
                      color: COLORS.white,
                      fontSize: 15,
                      fontWeight: "700",
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
                    {friend.wins || 0}W ·{" "}
                    {friend.total_distance_km?.toFixed(1) || 0} km
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => challengeFriend(friend.friend_user_id)}
                style={{
                  backgroundColor: COLORS.accent,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 12,
                }}
              >
                <Text
                  style={{
                    color: COLORS.black,
                    fontWeight: "700",
                    fontSize: 13,
                  }}
                >
                  Race
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Recent Results */}
        {recentResults.length > 0 && (
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
              HISTORY
            </Text>
            {recentResults.map((race) => {
              const won = race.winner_id === user?.id;
              return (
                <View
                  key={race.id}
                  style={{
                    backgroundColor: COLORS.surface,
                    borderRadius: 16,
                    padding: 16,
                    marginBottom: 6,
                    borderWidth: 1,
                    borderColor: COLORS.border,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 16, marginRight: 10 }}>
                      {won ? "🏆" : "😤"}
                    </Text>
                    <View>
                      <Text
                        style={{
                          color: COLORS.white,
                          fontSize: 14,
                          fontWeight: "600",
                        }}
                      >
                        vs{" "}
                        {race.challenger_id === user?.id
                          ? race.opponent_username
                          : race.challenger_username}
                      </Text>
                      <Text
                        style={{ color: COLORS.textTertiary, fontSize: 11 }}
                      >
                        {race.target_value} km
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={{
                      color: won ? COLORS.accent : COLORS.orange,
                      fontWeight: "700",
                      fontSize: 13,
                    }}
                  >
                    {won ? "WIN" : "LOSS"}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
