import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Alert, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useQueryClient } from "@tanstack/react-query";
import { calculateDistance } from "@/constants/theme";
import { useAuth } from "@/utils/auth/useAuth";

const DISTANCE_COMMIT_THRESHOLD_METERS = 1.5;
const NOISE_GATE_MIN_METERS = 1.2;
const NOISE_GATE_MAX_METERS = 8;
const NOISE_GATE_ACCURACY_FACTOR = 0.12;
const DISTANCE_DEDUCTION_RATIO = 0.35;
const SPEED_WINDOW_MS = 12000;
const MIN_SPEED_WINDOW_MS = 3500;
const SPEED_SMOOTHING_FACTOR = 0.35;
const MAX_ACCEPTED_SPEED_MPS = 10;
const MAX_ACCEPTABLE_ACCURACY_METERS = 65;
const HARD_REJECT_ACCURACY_METERS = 120;
const HARD_REJECT_JUMP_METERS = 400;
const FALLBACK_POLL_INTERVAL_MS = 3000;

export function useRunTracker() {
  const { signIn, auth } = useAuth();
  const queryClient = useQueryClient();

  const [isRunning, setIsRunning] = useState(false);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [positions, setPositions] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [gpsStatus, setGpsStatus] = useState("idle");
  const [currentAccuracy, setCurrentAccuracy] = useState(null);
  const [liveSpeedMps, setLiveSpeedMps] = useState(0);
  const [currentCoords, setCurrentCoords] = useState(null);

  const locationSub = useRef(null);
  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const lastProcessedPosition = useRef(null);
  const pendingDistanceMeters = useRef(0);
  const totalDistanceMeters = useRef(0);
  const speedWindowSamples = useRef([]);

  useEffect(() => {
    if (!isRunning) {
      return;
    }

    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning]);

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

  const updateLiveSpeed = useCallback((timestampMs) => {
    if (!Number.isFinite(timestampMs)) {
      return;
    }

    const trackedDistanceMeters =
      totalDistanceMeters.current + pendingDistanceMeters.current;
    const samples = speedWindowSamples.current;
    samples.push({
      timestamp: timestampMs,
      distanceMeters: trackedDistanceMeters,
    });

    const cutoff = timestampMs - SPEED_WINDOW_MS;
    while (samples.length > 1 && samples[0].timestamp < cutoff) {
      samples.shift();
    }

    if (samples.length < 2) {
      setLiveSpeedMps(0);
      return;
    }

    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsedSeconds = (last.timestamp - first.timestamp) / 1000;
    if (elapsedSeconds < MIN_SPEED_WINDOW_MS / 1000) {
      return;
    }

    const traveledMeters = Math.max(0, last.distanceMeters - first.distanceMeters);
    const rawSpeedMps = traveledMeters / elapsedSeconds;

    setLiveSpeedMps((previous) => {
      const smoothed =
        previous > 0
          ? previous * (1 - SPEED_SMOOTHING_FACTOR) +
            rawSpeedMps * SPEED_SMOOTHING_FACTOR
          : rawSpeedMps;
      return Math.min(Math.max(smoothed, 0), MAX_ACCEPTED_SPEED_MPS);
    });
  }, []);

  const acceptLocationSample = useCallback(
    (loc) => {
      const coords = loc?.coords;
      if (!coords) return;

      const latitude = coords.latitude;
      const longitude = coords.longitude;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return;
      }

      const accuracy =
        typeof coords.accuracy === "number" && Number.isFinite(coords.accuracy)
          ? Math.max(coords.accuracy, 0)
          : null;
      const timestamp =
        typeof loc.timestamp === "number" && Number.isFinite(loc.timestamp)
          ? loc.timestamp
          : Date.now();

      setCurrentCoords({ latitude, longitude });
      setCurrentAccuracy(accuracy);

      if (accuracy !== null && accuracy > HARD_REJECT_ACCURACY_METERS) {
        setGpsStatus("waiting");
        updateLiveSpeed(timestamp);
        return;
      }

      const sample = {
        latitude,
        longitude,
        timestamp,
        accuracy,
      };

      if (!lastProcessedPosition.current) {
        if (accuracy !== null && accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
          setGpsStatus("waiting");
          updateLiveSpeed(timestamp);
          return;
        }
        lastProcessedPosition.current = sample;
        setPositions([sample]);
        setGpsStatus("ready");
        updateLiveSpeed(timestamp);
        return;
      }

      const previous = lastProcessedPosition.current;
      const segmentDistanceKm = calculateDistance(
        previous.latitude,
        previous.longitude,
        sample.latitude,
        sample.longitude,
      );
      const segmentDistanceMeters = segmentDistanceKm * 1000;
      const elapsedSeconds = Math.max((timestamp - previous.timestamp) / 1000, 0.5);
      const derivedSpeedMps = segmentDistanceMeters / elapsedSeconds;

      const dynamicMaxSegmentMeters = Math.max(
        HARD_REJECT_JUMP_METERS,
        MAX_ACCEPTED_SPEED_MPS * elapsedSeconds * 2.5 + 25,
      );
      if (
        derivedSpeedMps > MAX_ACCEPTED_SPEED_MPS * 1.8 ||
        segmentDistanceMeters > dynamicMaxSegmentMeters
      ) {
        if (accuracy === null || accuracy <= MAX_ACCEPTABLE_ACCURACY_METERS) {
          lastProcessedPosition.current = sample;
        }
        pendingDistanceMeters.current = 0;
        setGpsStatus("waiting");
        updateLiveSpeed(timestamp);
        return;
      }

      if (accuracy !== null && accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
        setGpsStatus("waiting");
        updateLiveSpeed(timestamp);
        return;
      }

      const previousAccuracy =
        previous.accuracy ?? MAX_ACCEPTABLE_ACCURACY_METERS / 2;
      const currentSampleAccuracy = accuracy ?? MAX_ACCEPTABLE_ACCURACY_METERS / 2;
      const noiseGateMeters = Math.max(
        NOISE_GATE_MIN_METERS,
        Math.min(
          NOISE_GATE_MAX_METERS,
          (previousAccuracy + currentSampleAccuracy) * NOISE_GATE_ACCURACY_FACTOR,
        ),
      );

      if (segmentDistanceMeters < noiseGateMeters) {
        setGpsStatus("tracking");
        updateLiveSpeed(timestamp);
        return;
      }

      const creditedDistanceMeters = Math.max(
        0,
        segmentDistanceMeters - noiseGateMeters * DISTANCE_DEDUCTION_RATIO,
      );
      pendingDistanceMeters.current += creditedDistanceMeters;
      lastProcessedPosition.current = sample;

      if (pendingDistanceMeters.current < DISTANCE_COMMIT_THRESHOLD_METERS) {
        setGpsStatus("tracking");
        updateLiveSpeed(timestamp);
        return;
      }

      totalDistanceMeters.current += pendingDistanceMeters.current;
      pendingDistanceMeters.current = 0;
      setDistance(totalDistanceMeters.current / 1000);
      setPositions((prev) => [...prev, sample]);
      setGpsStatus("tracking");
      updateLiveSpeed(timestamp);
    },
    [updateLiveSpeed],
  );

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

    setIsRunning(true);
    setDistance(0);
    setDuration(0);
    setPositions([]);
    setStartTime(new Date().toISOString());
    setGpsStatus("acquiring");
    setCurrentAccuracy(null);
    setLiveSpeedMps(0);
    setCurrentCoords(null);
    lastProcessedPosition.current = null;
    pendingDistanceMeters.current = 0;
    totalDistanceMeters.current = 0;
    speedWindowSamples.current = [];

    try {
      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        mayShowUserSettingsDialog: true,
        maximumAge: 1000,
        timeout: 15000,
      });
      acceptLocationSample(initial);
    } catch (err) {
      console.error("Initial location error:", err);
    }

    try {
      const trackingOptions = {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 1,
      };
      if (Platform.OS === "ios") {
        trackingOptions.activityType = Location.ActivityType.Fitness;
        trackingOptions.pausesUpdatesAutomatically = false;
      }

      locationSub.current = await Location.watchPositionAsync(
        trackingOptions,
        acceptLocationSample,
      );
    } catch (err) {
      console.error("watchPositionAsync error:", err);
    }

    pollRef.current = setInterval(async () => {
      try {
        const snapshot = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          mayShowUserSettingsDialog: false,
          maximumAge: 1000,
          timeout: 5000,
        });
        acceptLocationSample(snapshot);
      } catch (err) {
        console.error("Fallback location poll error:", err);
      }
    }, FALLBACK_POLL_INTERVAL_MS);
  }, [acceptLocationSample, auth, signIn]);

  const stopRun = useCallback(async () => {
    if (!isRunning) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsRunning(false);
    setGpsStatus("idle");
    stopTracking();

    if (pendingDistanceMeters.current > 0) {
      totalDistanceMeters.current += pendingDistanceMeters.current;
      pendingDistanceMeters.current = 0;
      setDistance(totalDistanceMeters.current / 1000);
    }

    speedWindowSamples.current = [];
    setLiveSpeedMps(0);

    const finalDistanceKm = totalDistanceMeters.current / 1000;
    const finalAverageSpeedMps =
      duration > 0 && finalDistanceKm > 0
        ? (finalDistanceKm * 1000) / duration
        : 0;

    if (finalDistanceKm > 0.01) {
      try {
        const routeData = positions.length > 0 ? JSON.stringify(positions) : null;
        await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            distance_km: Math.round(finalDistanceKm * 1000) / 1000,
            duration_seconds: duration,
            avg_pace: finalAverageSpeedMps > 0 ? finalAverageSpeedMps * 3.6 : null,
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
  }, [duration, isRunning, positions, queryClient, startTime, stopTracking]);

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

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

  const speedMps = isRunning ? liveSpeedMps : averageSpeedMps;
  const speedKmh = Math.max(0, speedMps * 3.6);

  return {
    isRunning,
    distance,
    duration,
    paceDisplay,
    speedKmh,
    gpsStatus,
    currentAccuracy,
    currentCoords,
    startRun,
    stopRun,
  };
}

export default useRunTracker;
