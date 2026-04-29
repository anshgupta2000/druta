import { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Map, ShieldAlert, Trophy, ArrowRight, Mail } from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import { useAuth } from "@/utils/auth/useAuth";

const { width } = Dimensions.get("window");
const ONBOARDING_KEY = "@druta:onboarding-complete";

const slides = [
  {
    eyebrow: "THE CITY IS LIVE",
    title: "Every block is up for grabs.",
    body: "Run through a zone to claim it. Stop running and rivals can take it.",
    Icon: Map,
    accent: COLORS.accent,
  },
  {
    eyebrow: "DEFEND WHAT'S YOURS",
    title: "Zones weaken when rivals move.",
    body: "Your map shows who is closest, what is decaying, and where to run next.",
    Icon: ShieldAlert,
    accent: COLORS.orange,
  },
  {
    eyebrow: "BUILD YOUR EMPIRE",
    title: "Rank up by owning the city.",
    body: "Zones are the currency. Distance matters, but territory wins.",
    Icon: Trophy,
    accent: COLORS.gold,
  },
];

function CityTiles({ activeIndex }) {
  const tiles = useMemo(() => Array.from({ length: 42 }), []);
  return (
    <View
      style={{
        height: 250,
        borderRadius: 30,
        overflow: "hidden",
        backgroundColor: "#03060C",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        marginHorizontal: 20,
        marginTop: 18,
      }}
    >
      <LinearGradient
        colors={["rgba(45,122,255,0.2)", "transparent", "rgba(255,107,53,0.12)"]}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      {tiles.map((_, index) => {
        const row = Math.floor(index / 7);
        const col = index % 7;
        const owned = (index + activeIndex) % 5 === 0 || (index + activeIndex) % 7 === 0;
        const rival = (index + activeIndex) % 11 === 0;
        const color = rival ? COLORS.orange : owned ? COLORS.accent : "rgba(255,255,255,0.08)";
        return (
          <View
            key={index}
            style={{
              position: "absolute",
              left: 28 + col * ((width - 96) / 7),
              top: 34 + row * 31,
              width: 44,
              height: 22,
              borderRadius: 8,
              backgroundColor: color,
              opacity: owned || rival ? 0.82 : 0.5,
              transform: [{ rotate: "-38deg" }],
              shadowColor: color,
              shadowOpacity: owned || rival ? 0.38 : 0,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
        );
      })}
      <View
        style={{
          position: "absolute",
          left: 18,
          right: 18,
          bottom: 18,
          borderRadius: 20,
          padding: 14,
          backgroundColor: "rgba(0,0,0,0.58)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)",
        }}
      >
        <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: "800" }}>
          Your city awaits
        </Text>
        <Text style={{ color: COLORS.textSecondary, fontSize: 12, marginTop: 4 }}>
          Tap Start Run. Zones light up as you move.
        </Text>
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { auth, signIn } = useAuth();
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const Icon = slide.Icon;

  const finish = async () => {
    await Location.requestForegroundPermissionsAsync().catch(() => null);
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    router.replace("/(tabs)");
  };

  const next = () => {
    if (index < slides.length - 1) {
      setIndex((prev) => prev + 1);
      return;
    }
    finish();
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.black }}>
      <StatusBar style="light" />
      <View style={{ paddingTop: insets.top + 18, paddingHorizontal: 24 }}>
        <Text
          style={{
            color: COLORS.white,
            fontSize: 34,
            fontWeight: "900",
            letterSpacing: -1.1,
          }}
        >
          DRUTA
        </Text>
        <Text
          style={{
            color: COLORS.textTertiary,
            fontSize: 15,
            fontWeight: "700",
            marginTop: 4,
          }}
        >
          the city is yours to take
        </Text>
      </View>

      <CityTiles activeIndex={index} />

      <Animated.View
        key={slide.title}
        entering={FadeInDown.duration(260)}
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingTop: 30,
        }}
      >
        <View
          style={{
            width: 58,
            height: 58,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${slide.accent}1F`,
            borderWidth: 1,
            borderColor: `${slide.accent}55`,
          }}
        >
          <Icon size={26} color={slide.accent} />
        </View>
        <Text
          style={{
            color: slide.accent,
            fontSize: 11,
            letterSpacing: 1.7,
            fontWeight: "900",
            marginTop: 24,
          }}
        >
          {slide.eyebrow}
        </Text>
        <Text
          style={{
            color: COLORS.white,
            fontSize: 34,
            lineHeight: 38,
            fontWeight: "900",
            letterSpacing: -1.2,
            marginTop: 8,
          }}
        >
          {slide.title}
        </Text>
        <Text
          style={{
            color: COLORS.textSecondary,
            fontSize: 16,
            lineHeight: 23,
            fontWeight: "600",
            marginTop: 12,
          }}
        >
          {slide.body}
        </Text>
      </Animated.View>

      <View
        style={{
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 22,
        }}
      >
        <View style={{ flexDirection: "row", gap: 7, marginBottom: 18 }}>
          {slides.map((item, dotIndex) => (
            <View
              key={item.title}
              style={{
                height: 4,
                flex: dotIndex === index ? 1.6 : 1,
                borderRadius: 2,
                backgroundColor:
                  dotIndex === index ? slide.accent : "rgba(255,255,255,0.16)",
              }}
            />
          ))}
        </View>
        {!auth && index === 0 ? (
          <TouchableOpacity
            onPress={signIn}
            activeOpacity={0.86}
            style={{
              minHeight: 54,
              borderRadius: 17,
              backgroundColor: COLORS.surfaceElevated,
              borderWidth: 1,
              borderColor: COLORS.borderLight,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <Mail size={18} color={COLORS.white} />
            <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: "800" }}>
              Continue with Email
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={next}
          activeOpacity={0.88}
          style={{
            minHeight: 58,
            borderRadius: 18,
            backgroundColor: index === slides.length - 1 ? COLORS.accent : COLORS.orange,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
          }}
        >
          <Text style={{ color: COLORS.black, fontSize: 17, fontWeight: "900" }}>
            {index === slides.length - 1 ? "Allow Location & Start" : "Next"}
          </Text>
          <ArrowRight size={19} color={COLORS.black} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
