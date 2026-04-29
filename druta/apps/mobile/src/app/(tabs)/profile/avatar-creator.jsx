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
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import {
  Check,
  Circle,
  Footprints,
  Gauge,
  Palette,
  Shield,
  Sparkles,
  X,
  Zap,
} from "lucide-react-native";
import { COLORS } from "@/constants/theme";

const PALETTES = [
  {
    id: "surge",
    label: "Surge",
    primary: COLORS.accent,
    secondary: COLORS.cyan,
    muted: COLORS.accentMuted,
  },
  {
    id: "volt",
    label: "Volt",
    primary: COLORS.green,
    secondary: COLORS.gold,
    muted: COLORS.greenDim,
  },
  {
    id: "flare",
    label: "Flare",
    primary: COLORS.orange,
    secondary: COLORS.red,
    muted: COLORS.orangeDim,
  },
  {
    id: "night",
    label: "Night",
    primary: COLORS.purple,
    secondary: COLORS.accent,
    muted: COLORS.purpleDim,
  },
];

const BASE_STYLES = [
  { id: "sprinter", label: "Sprinter", icon: Zap, copy: "Fast claims" },
  { id: "sentinel", label: "Sentinel", icon: Shield, copy: "Hold zones" },
  { id: "pathfinder", label: "Pathfinder", icon: Footprints, copy: "Long routes" },
  { id: "raider", label: "Raider", icon: Gauge, copy: "Race ready" },
];

const AURA_STYLES = [
  { id: "clean", label: "Clean", width: 2, glow: 0.16 },
  { id: "pulse", label: "Pulse", width: 3, glow: 0.28 },
  { id: "halo", label: "Halo", width: 5, glow: 0.42 },
];

const POSES = [
  { id: "drive", label: "Drive", lean: -10, scale: 1.05 },
  { id: "guard", label: "Guard", lean: 0, scale: 0.98 },
  { id: "strike", label: "Strike", lean: 10, scale: 1.08 },
];

function SectionTitle({ icon: Icon, children }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
      }}
    >
      <Icon size={15} color={COLORS.textTertiary} />
      <Text
        style={{
          color: COLORS.textTertiary,
          fontSize: 12,
          fontWeight: "800",
          letterSpacing: 1.3,
          textTransform: "uppercase",
        }}
      >
        {children}
      </Text>
    </View>
  );
}

function OptionButton({ active, color, label, sublabel, onPress, icon: Icon }) {
  return (
    <TouchableOpacity
      activeOpacity={0.84}
      onPress={onPress}
      style={{
        flex: 1,
        minWidth: 132,
        backgroundColor: active ? `${color}22` : COLORS.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: active ? `${color}66` : COLORS.border,
        padding: 14,
        minHeight: 92,
        justifyContent: "space-between",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: active ? `${color}26` : COLORS.surfaceElevated,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {Icon ? (
            <Icon size={18} color={active ? color : COLORS.textSecondary} />
          ) : (
            <Circle
              size={18}
              color={active ? color : COLORS.textSecondary}
              fill={active ? color : "transparent"}
            />
          )}
        </View>
        {active && <Check size={17} color={color} />}
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          color: COLORS.white,
          fontSize: 15,
          fontWeight: "800",
        }}
      >
        {label}
      </Text>
      {!!sublabel && (
        <Text
          numberOfLines={1}
          style={{
            color: COLORS.textTertiary,
            fontSize: 12,
            fontWeight: "600",
            marginTop: 3,
          }}
        >
          {sublabel}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function AvatarCreatorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [paletteId, setPaletteId] = useState(PALETTES[0].id);
  const [baseId, setBaseId] = useState(BASE_STYLES[0].id);
  const [auraId, setAuraId] = useState(AURA_STYLES[1].id);
  const [poseId, setPoseId] = useState(POSES[0].id);

  const palette = PALETTES.find((item) => item.id === paletteId) || PALETTES[0];
  const base = BASE_STYLES.find((item) => item.id === baseId) || BASE_STYLES[0];
  const aura = AURA_STYLES.find((item) => item.id === auraId) || AURA_STYLES[1];
  const pose = POSES.find((item) => item.id === poseId) || POSES[0];
  const AvatarIcon = base.icon;

  const avatarCode = useMemo(
    () =>
      JSON.stringify({
        version: 1,
        palette: palette.id,
        base: base.id,
        aura: aura.id,
        pose: pose.id,
        icon: base.id,
      }),
    [aura.id, base.id, palette.id, pose.id],
  );

  const saveAvatar = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatar_color: palette.primary,
          avatar_code: avatarCode,
          avatar_url: "",
          avatar_thumbnail_url: "",
        }),
      });
      if (!res.ok) throw new Error("Failed to save avatar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)/profile");
    },
    onError: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const nudge = () => {
    Haptics.selectionAsync();
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.black }}>
      <StatusBar style="light" />
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 18,
          paddingBottom: 14,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.back()}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: COLORS.surface,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <X size={20} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <Text
            style={{
              color: COLORS.white,
              fontSize: 16,
              fontWeight: "800",
              letterSpacing: -0.2,
            }}
          >
            Avatar Creator
          </Text>
          <Text
            style={{
              color: COLORS.textTertiary,
              fontSize: 11,
              fontWeight: "700",
              marginTop: 2,
            }}
          >
            Built for your leaderboard identity
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.86}
          onPress={() => saveAvatar.mutate()}
          disabled={saveAvatar.isPending}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: saveAvatar.isPending
              ? COLORS.surfaceElevated
              : palette.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {saveAvatar.isPending ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <Check size={20} color={COLORS.black} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 22,
          paddingBottom: insets.bottom + 34,
        }}
      >
        <LinearGradient
          colors={[`${palette.primary}33`, COLORS.surface, COLORS.black]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 30,
            borderWidth: 1,
            borderColor: `${palette.primary}44`,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              minHeight: 326,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 22,
              paddingVertical: 30,
            }}
          >
            <View
              style={{
                width: 194,
                height: 194,
                borderRadius: 97,
                borderWidth: aura.width,
                borderColor: palette.primary,
                backgroundColor: palette.muted,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: palette.primary,
                shadowOpacity: aura.glow,
                shadowRadius: 34,
                shadowOffset: { width: 0, height: 0 },
              }}
            >
              <View
                style={{
                  position: "absolute",
                  width: 136,
                  height: 136,
                  borderRadius: 68,
                  borderWidth: 1,
                  borderColor: `${palette.secondary}55`,
                }}
              />
              <View
                style={{
                  transform: [
                    { rotate: `${pose.lean}deg` },
                    { scale: pose.scale },
                  ],
                  width: 112,
                  height: 112,
                  borderRadius: 30,
                  backgroundColor: COLORS.black,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: `${palette.primary}88`,
                }}
              >
                <AvatarIcon size={52} color={palette.primary} />
              </View>
            </View>

            <Text
              style={{
                color: COLORS.white,
                fontSize: 29,
                fontWeight: "900",
                letterSpacing: -0.8,
                marginTop: 22,
              }}
            >
              {base.label}
            </Text>
            <Text
              style={{
                color: COLORS.textSecondary,
                fontSize: 14,
                fontWeight: "700",
                marginTop: 7,
              }}
            >
              {palette.label} kit / {aura.label} aura / {pose.label} stance
            </Text>
          </View>
        </LinearGradient>

        <View style={{ marginTop: 24 }}>
          <SectionTitle icon={Zap}>Runner Type</SectionTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {BASE_STYLES.map((item) => (
              <OptionButton
                key={item.id}
                active={item.id === base.id}
                color={palette.primary}
                label={item.label}
                sublabel={item.copy}
                icon={item.icon}
                onPress={() => {
                  nudge();
                  setBaseId(item.id);
                }}
              />
            ))}
          </View>
        </View>

        <View style={{ marginTop: 24 }}>
          <SectionTitle icon={Palette}>Color Kit</SectionTitle>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {PALETTES.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.86}
                onPress={() => {
                  nudge();
                  setPaletteId(item.id);
                }}
                style={{
                  flex: 1,
                  minWidth: 132,
                  backgroundColor:
                    item.id === palette.id ? item.muted : COLORS.surface,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor:
                    item.id === palette.id ? `${item.primary}66` : COLORS.border,
                  padding: 14,
                  minHeight: 92,
                }}
              >
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {[item.primary, item.secondary, COLORS.surfaceElevated].map(
                    (swatch) => (
                      <View
                        key={swatch}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          backgroundColor: swatch,
                          borderWidth: 1,
                          borderColor: COLORS.borderLight,
                        }}
                      />
                    ),
                  )}
                </View>
                <Text
                  style={{
                    color: COLORS.white,
                    fontSize: 15,
                    fontWeight: "800",
                    marginTop: 16,
                  }}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ marginTop: 24 }}>
          <SectionTitle icon={Sparkles}>Aura</SectionTitle>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {AURA_STYLES.map((item) => (
              <OptionButton
                key={item.id}
                active={item.id === aura.id}
                color={palette.primary}
                label={item.label}
                icon={Sparkles}
                onPress={() => {
                  nudge();
                  setAuraId(item.id);
                }}
              />
            ))}
          </View>
        </View>

        <View style={{ marginTop: 24 }}>
          <SectionTitle icon={Gauge}>Stance</SectionTitle>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {POSES.map((item) => (
              <OptionButton
                key={item.id}
                active={item.id === pose.id}
                color={palette.primary}
                label={item.label}
                icon={Gauge}
                onPress={() => {
                  nudge();
                  setPoseId(item.id);
                }}
              />
            ))}
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => saveAvatar.mutate()}
          disabled={saveAvatar.isPending}
          style={{
            marginTop: 28,
            height: 58,
            borderRadius: 20,
            backgroundColor: palette.primary,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: palette.primary,
            shadowOpacity: 0.22,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
          }}
        >
          <Text
            style={{
              color: COLORS.black,
              fontSize: 16,
              fontWeight: "900",
            }}
          >
            Save Avatar
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
