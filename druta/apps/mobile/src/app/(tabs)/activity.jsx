import { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Swords,
  AlertTriangle,
  Trophy,
  Shield,
  Clock,
  ChevronRight,
} from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { COLORS } from "@/constants/theme";
import { useAuth } from "@/utils/auth/useAuth";

const settings = [
  ["zone_stolen", "Zone stolen", "always", Shield, COLORS.orange],
  ["zone_under_threat", "Zone under threat", "daily_max_3", AlertTriangle, COLORS.orange],
  ["zone_decaying", "Zone decaying", "weekly_digest", Clock, COLORS.gold],
  ["race_challenge", "Race challenge", "always", Swords, COLORS.accent],
  ["rival_rank_move", "Rival rank move", "once_a_day", Trophy, COLORS.purple],
];

const eventMeta = {
  run_completed: { Icon: Trophy, color: COLORS.accent },
  zone_stolen: { Icon: Swords, color: COLORS.orange },
  zone_claimed: { Icon: Shield, color: COLORS.accent },
  race_challenge: { Icon: Swords, color: COLORS.red },
};

const formatPref = (value) => {
  if (!value) return "Off";
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { auth, signIn } = useAuth();

  const { data: activityData, isLoading } = useQuery({
    queryKey: ["activity"],
    queryFn: async () => {
      const res = await fetch("/api/activity");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!auth,
    refetchInterval: 15000,
  });

  const { data: prefsData } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/preferences");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!auth,
  });

  const updatePrefs = useMutation({
    mutationFn: async (payload) => {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
  });

  const events = activityData?.events || [];
  const preferences = prefsData?.preferences || {};

  const pushCards = useMemo(
    () => [
      {
        color: COLORS.orange,
        icon: Swords,
        title: "alex_k took your Valencia zone",
        body: "Three nearby zones are exposed.",
      },
      {
        color: COLORS.gold,
        icon: AlertTriangle,
        title: "4 zones are decaying tonight",
        body: "Run 1.2km to protect the cluster.",
      },
      {
        color: COLORS.accent,
        icon: Trophy,
        title: "jruns is 6 zones from passing you",
        body: "A short run keeps your rank safe.",
      },
    ],
    [],
  );

  if (!auth) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.black, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <StatusBar style="light" />
        <Bell size={46} color={COLORS.textDisabled} />
        <Text style={{ color: COLORS.white, fontSize: 26, fontWeight: "900", marginTop: 18 }}>
          Activity needs an account
        </Text>
        <Text style={{ color: COLORS.textTertiary, textAlign: "center", marginTop: 8, lineHeight: 20 }}>
          Sign in to see rival moves, zone alerts, and race challenges.
        </Text>
        <TouchableOpacity onPress={signIn} style={{ marginTop: 24, backgroundColor: COLORS.accent, borderRadius: 16, paddingHorizontal: 30, paddingVertical: 14 }}>
          <Text style={{ color: COLORS.black, fontWeight: "900" }}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.black }}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 18,
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 110,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ color: COLORS.textTertiary, fontSize: 12, fontWeight: "900", letterSpacing: 2 }}>
          ALERTS
        </Text>
        <Text style={{ color: COLORS.white, fontSize: 38, lineHeight: 42, fontWeight: "900", letterSpacing: -1.3, marginTop: 6 }}>
          Activity
        </Text>

        <View style={{ marginTop: 22, gap: 10 }}>
          {pushCards.map((item, index) => {
            const Icon = item.icon;
            return (
              <Animated.View
                key={item.title}
                entering={FadeInDown.delay(index * 40).duration(240)}
                style={{
                  borderRadius: 20,
                  padding: 16,
                  backgroundColor: COLORS.surface,
                  borderWidth: 1,
                  borderColor: `${item.color}33`,
                  flexDirection: "row",
                  gap: 12,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${item.color}1F`, alignItems: "center", justifyContent: "center" }}>
                  <Icon size={18} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: "900", lineHeight: 20 }}>
                    {item.title}
                  </Text>
                  <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: "600", marginTop: 4 }}>
                    {item.body}
                  </Text>
                </View>
              </Animated.View>
            );
          })}
        </View>

        <Text style={{ color: COLORS.textTertiary, fontSize: 12, fontWeight: "900", letterSpacing: 1.4, marginTop: 28, marginBottom: 10 }}>
          WAR LOG
        </Text>
        {isLoading ? (
          <ActivityIndicator color={COLORS.accent} style={{ marginTop: 28 }} />
        ) : events.length === 0 ? (
          <View style={{ borderRadius: 20, padding: 22, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ color: COLORS.white, fontWeight: "800", fontSize: 16 }}>
              No activity yet
            </Text>
            <Text style={{ color: COLORS.textTertiary, marginTop: 6, lineHeight: 20 }}>
              Your captures, rival moves, and race updates will appear here.
            </Text>
          </View>
        ) : (
          <View style={{ borderRadius: 24, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" }}>
            {events.map((event, index) => {
              const meta = eventMeta[event.event_type] || eventMeta.run_completed;
              const Icon = meta.Icon;
              return (
                <TouchableOpacity
                  key={event.id}
                  activeOpacity={0.8}
                  style={{
                    padding: 16,
                    flexDirection: "row",
                    gap: 12,
                    borderBottomWidth: index === events.length - 1 ? 0 : 1,
                    borderBottomColor: COLORS.border,
                  }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${meta.color}1F`, alignItems: "center", justifyContent: "center" }}>
                    <Icon size={18} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: "900" }}>
                      {event.title}
                    </Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: "600", marginTop: 4 }}>
                      {event.body || "Tap to see it on the map"}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={COLORS.textTertiary} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <Text style={{ color: COLORS.textTertiary, fontSize: 12, fontWeight: "900", letterSpacing: 1.4, marginTop: 28, marginBottom: 10 }}>
          NOTIFICATION CONTROL
        </Text>
        <View style={{ borderRadius: 24, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, overflow: "hidden" }}>
          {settings.map(([key, label, fallback, Icon, color], index) => (
            <TouchableOpacity
              key={key}
              onPress={() =>
                updatePrefs.mutate({
                  [key]:
                    (preferences[key] || fallback) === "always"
                      ? "once_a_day"
                      : "always",
                })
              }
              style={{
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderBottomWidth: index === settings.length - 1 ? 0 : 1,
                borderBottomColor: COLORS.border,
              }}
            >
              <Icon size={17} color={color} />
              <Text style={{ color: COLORS.textSecondary, flex: 1, fontSize: 14, fontWeight: "800" }}>
                {label}
              </Text>
              <View style={{ borderRadius: 999, backgroundColor: `${color}1F`, paddingHorizontal: 10, paddingVertical: 5 }}>
                <Text style={{ color, fontSize: 12, fontWeight: "900" }}>
                  {formatPref(preferences[key] || fallback)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
          <View style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: COLORS.border }}>
            <Clock size={17} color={COLORS.textSecondary} />
            <Text style={{ color: COLORS.textSecondary, flex: 1, fontSize: 14, fontWeight: "800" }}>
              Quiet hours
            </Text>
            <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: "900" }}>
              {preferences.quiet_hours_start || "22:00"} - {preferences.quiet_hours_end || "07:00"}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
