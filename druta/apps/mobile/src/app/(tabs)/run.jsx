import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { useQueryClient } from "@tanstack/react-query";
import {
  Play,
  Square,
  Clock,
  Route,
  Shield,
  Navigation,
  MapPin,
} from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { COLORS, calculateDistance, formatDuration } from "@/constants/theme";
import { useAuth } from "@/utils/auth/useAuth";

const MIN_ACCEPTED_SEGMENT_METERS = 2.5;
const MAX_ACCEPTED_SEGMENT_METERS = 120;
const MAX_ACCEPTED_SPEED_MPS = 10;
const MAX_ACCEPTABLE_ACCURACY_METERS = 65;
const FALLBACK_POLL_INTERVAL_MS = 3000;

export default function RunScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, auth } = useAuth();
  const queryClient = useQueryClient();

  const [isRunning, setIsRunning] = useState(false);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [positions, setPositions] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [gpsStatus, setGpsStatus] = useState("idle");
  const [currentAccuracy, setCurrentAccuracy] = useState(null);
  const [lastAcceptedSpeedMps, setLastAcceptedSpeedMps] = useState(0);
  const [currentCoords, setCurrentCoords] = useState(null);

  const locationSub = useRef(null);
  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const lastAcceptedPosition = useRef(null);

  const pulseScale = useSharedValue(1);
  const buttonScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));
  const buttonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  useEffect(() => {
    if (isRunning) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1000 }),
          withTiming(1, { duration: 1000 }),
        ),
        -1,
        true,
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 1200 }),
          withTiming(0.2, { duration: 1200 }),
        ),
        -1,
        true,
      );
    } else {
      pulseScale.value = withSpring(1);
      glowOpacity.value = withTiming(0);
    }
  }, [glowOpacity, isRunning, pulseScale]);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning]);

  const paceDisplay = useMemo(() => {
    if (distance <= 0 || duration <= 0) {
      return "--:--";
    }

    const minutesPerKm = duration / 60 / distance;
    if (!Number.isFinite(minutesPerKm) || minutesPerKm <= 0) {
      return "--:--";
    }

    const mins = Math.floor(minutesPerKm);
    const secs = Math.floor((minutesPerKm - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, [distance, duration]);

  const averageSpeedMps = useMemo(() => {
    if (duration <= 0 || distance <= 0) {
      return 0;
    }
    return (distance * 1000) / duration;
  }, [distance, duration]);

  const stopTracking = useCallback(() => {
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
  }, []);

  const acceptLocationSample = useCallback((loc) => {
    const coords = loc?.coords;
    if (!coords) return;

    const latitude = coords.latitude;
    const longitude = coords.longitude;
    const accuracy =
      typeof coords.accuracy === "number" ? coords.accuracy : null;
    const timestamp = loc.timestamp || Date.now();

    setCurrentCoords({ latitude, longitude });
    setCurrentAccuracy(accuracy);

    if (accuracy !== null && accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
      setGpsStatus("waiting");
      return;
    }

    const sample = {
      latitude,
      longitude,
      timestamp,
      accuracy,
      speed:
        typeof coords.speed === "number" && coords.speed > 0
          ? coords.speed
          : null,
    };

    if (!lastAcceptedPosition.current) {
      lastAcceptedPosition.current = sample;
      setPositions([sample]);
      setGpsStatus("ready");
      return;
    }

    const previous = lastAcceptedPosition.current;
    const segmentDistanceKm = calculateDistance(
      previous.latitude,
      previous.longitude,
      sample.latitude,
      sample.longitude,
    );
    const segmentDistanceMeters = segmentDistanceKm * 1000;
    const elapsedSeconds = Math.max((timestamp - previous.timestamp) / 1000, 1);
    const derivedSpeedMps = segmentDistanceMeters / elapsedSeconds;
    const speedMps = sample.speed || derivedSpeedMps;

    if (segmentDistanceMeters < MIN_ACCEPTED_SEGMENT_METERS) {
      setGpsStatus("tracking");
      return;
    }

    if (
      segmentDistanceMeters > MAX_ACCEPTED_SEGMENT_METERS ||
      speedMps > MAX_ACCEPTED_SPEED_MPS
    ) {
      setGpsStatus("waiting");
      return;
    }

    setDistance((prev) => prev + segmentDistanceKm);
    setLastAcceptedSpeedMps(speedMps);
    setPositions((prev) => [...prev, sample]);
    lastAcceptedPosition.current = sample;
    setGpsStatus("tracking");
  }, []);

  const startRun = useCallback(async () => {
    if (!auth) {
      signIn();
      return;
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      Alert.alert(
        "Location Services Off",
        "Turn on location services to start tracking your run.",
      );
      return;
    }

    const currentPermission = await Location.getForegroundPermissionsAsync();
    const permission =
      currentPermission.status === "granted"
        ? currentPermission
        : await Location.requestForegroundPermissionsAsync();

    if (permission.status !== "granted") {
      Alert.alert(
        "Location Required",
        "Druta needs location access to track your run and pace.",
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    buttonScale.value = withSequence(withSpring(0.9), withSpring(1));

    setIsRunning(true);
    setDistance(0);
    setDuration(0);
    setPositions([]);
    setStartTime(new Date().toISOString());
    setGpsStatus("acquiring");
    setCurrentAccuracy(null);
    setLastAcceptedSpeedMps(0);
    setCurrentCoords(null);
    lastAcceptedPosition.current = null;

    try {
      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      acceptLocationSample(initial);
    } catch (err) {
      console.error("Initial location error:", err);
    }

    try {
      locationSub.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        acceptLocationSample,
      );
    } catch (err) {
      console.error("watchPositionAsync error:", err);
    }

    pollRef.current = setInterval(async () => {
      try {
        const snapshot = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        acceptLocationSample(snapshot);
      } catch (err) {
        console.error("Fallback location poll error:", err);
      }
    }, FALLBACK_POLL_INTERVAL_MS);
  }, [acceptLocationSample, auth, buttonScale, signIn]);

  const stopRun = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsRunning(false);
    setGpsStatus("idle");
    stopTracking();

    if (distance > 0.01) {
      try {
        const routeData =
          positions.length > 0 ? JSON.stringify(positions) : null;
        await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            distance_km: Math.round(distance * 1000) / 1000,
            duration_seconds: duration,
            avg_pace: averageSpeedMps > 0 ? averageSpeedMps * 3.6 : null,
            territories_claimed: 0,
            route_data: routeData,
            started_at: startTime,
          }),
        });
        queryClient.invalidateQueries({ queryKey: ["runs"] });
        queryClient.invalidateQueries({ queryKey: ["profile"] });
      } catch (err) {
        console.error("Save run error:", err);
      }
    }
  }, [
    averageSpeedMps,
    distance,
    duration,
    positions,
    queryClient,
    startTime,
    stopTracking,
  ]);

  const gpsLabel = useMemo(() => {
    if (!isRunning) return "Ready";
    if (gpsStatus === "acquiring") return "Acquiring GPS";
    if (gpsStatus === "waiting") return "Waiting for cleaner GPS";
    if (gpsStatus === "ready") return "GPS locked";
    return "Tracking live";
  }, [gpsStatus, isRunning]);

  const speedLabel = useMemo(() => {
    const speed = lastAcceptedSpeedMps || averageSpeedMps;
    if (!speed || speed <= 0) return "--.- km/h";
    return `${(speed * 3.6).toFixed(1)} km/h`;
  }, [averageSpeedMps, lastAcceptedSpeedMps]);

  const accuracyLabel =
    currentAccuracy !== null ? `${Math.round(currentAccuracy)}m` : "--";

  const liveLocationLabel = useMemo(() => {
    if (!currentCoords) {
      return "Locating...";
    }
    return `${currentCoords.latitude.toFixed(5)}, ${currentCoords.longitude.toFixed(5)}`;
  }, [currentCoords]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.black }}>
      <StatusBar style="light" />
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <View
          style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: isRunning ? COLORS.accent : COLORS.textTertiary,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {gpsLabel}
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
            {isRunning ? "Running" : "Start Run"}
          </Text>
        </View>

        <View
          style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}
        >
          <View style={{ alignItems: "center", marginBottom: 40 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: COLORS.textTertiary,
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Distance
            </Text>
            <Text
              style={{
                fontSize: 80,
                fontWeight: "800",
                color: COLORS.white,
                letterSpacing: -4,
                marginTop: -4,
              }}
            >
              {distance.toFixed(2)}
            </Text>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: COLORS.textTertiary,
                marginTop: -10,
                letterSpacing: 2,
              }}
            >
              KM
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: COLORS.surface,
                borderRadius: 20,
                padding: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: COLORS.accentMuted,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <Clock size={16} color={COLORS.accent} />
              </View>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: COLORS.white,
                  letterSpacing: -0.5,
                }}
              >
                {formatDuration(duration)}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  color: COLORS.textTertiary,
                  marginTop: 4,
                  letterSpacing: 1,
                }}
              >
                DURATION
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor: COLORS.surface,
                borderRadius: 20,
                padding: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: COLORS.orangeDim,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <Route size={16} color={COLORS.orange} />
              </View>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: COLORS.white,
                  letterSpacing: -0.5,
                }}
              >
                {paceDisplay}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  color: COLORS.textTertiary,
                  marginTop: 4,
                  letterSpacing: 1,
                }}
              >
                PACE /KM
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                backgroundColor: COLORS.surface,
                borderRadius: 20,
                padding: 18,
                borderWidth: 1,
                borderColor: COLORS.border,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: COLORS.greenDim,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <Shield size={16} color={COLORS.green} />
              </View>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "800",
                  color: COLORS.white,
                  letterSpacing: -0.5,
                }}
              >
                0
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  color: COLORS.textTertiary,
                  marginTop: 4,
                  letterSpacing: 1,
                }}
              >
                CLAIMED
              </Text>
            </View>
          </View>

          <View
            style={{
              marginTop: 14,
              backgroundColor: COLORS.surface,
              borderRadius: 18,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: COLORS.border,
              gap: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Navigation size={14} color={COLORS.accent} />
                <Text
                  style={{
                    color: COLORS.textSecondary,
                    fontSize: 12,
                    fontWeight: "600",
                    marginLeft: 6,
                  }}
                >
                  {speedLabel}
                </Text>
              </View>
              <Text
                style={{
                  color: COLORS.textTertiary,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                Accuracy {accuracyLabel}
              </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <MapPin size={13} color={COLORS.accent} />
              <Text
                style={{
                  color: COLORS.textTertiary,
                  fontSize: 11,
                  fontWeight: "500",
                  marginLeft: 6,
                }}
                numberOfLines={1}
              >
                {liveLocationLabel}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ alignItems: "center", paddingBottom: 28 }}>
          {!isRunning ? (
            <Animated.View style={buttonAnimStyle}>
              <TouchableOpacity
                onPress={startRun}
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 42,
                  backgroundColor: COLORS.accent,
                  alignItems: "center",
                  justifyContent: "center",
                  shadowColor: COLORS.accent,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.5,
                  shadowRadius: 24,
                }}
              >
                <Play size={34} color={COLORS.black} fill={COLORS.black} />
              </TouchableOpacity>
            </Animated.View>
          ) : (
            <View style={{ alignItems: "center" }}>
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    width: 120,
                    height: 120,
                    borderRadius: 60,
                    backgroundColor: COLORS.red,
                  },
                  glowStyle,
                ]}
              />
              <Animated.View style={pulseStyle}>
                <TouchableOpacity
                  onPress={stopRun}
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: 42,
                    backgroundColor: COLORS.red,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Square size={30} color={COLORS.white} fill={COLORS.white} />
                </TouchableOpacity>
              </Animated.View>
            </View>
          )}
          <Text
            style={{
              color: COLORS.textTertiary,
              fontSize: 13,
              fontWeight: "500",
              marginTop: 14,
            }}
          >
            {isRunning ? "Tap to finish" : "Tap to begin"}
          </Text>
        </View>
      </View>
    </View>
  );
}
