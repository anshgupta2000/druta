import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Alert, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useQueryClient } from "@tanstack/react-query";
import { calculateDistance, formatPace } from "@/constants/theme";
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
const MAX_ACCEPTABLE_ELEVATION_ACCURACY_METERS = 25;
const ELEVATION_SMOOTHING_FACTOR = 0.35;
const ELEVATION_NOISE_MIN_METERS = 2;
const ELEVATION_NOISE_MAX_METERS = 8;
const ELEVATION_NOISE_ACCURACY_FACTOR = 0.2;

const LIVE_CHUNK_INTERVAL_MS = 5000;
const LIVE_CHUNK_DISTANCE_METERS = 25;
const LIVE_CHUNK_MAX_POINTS = 80;
const LIVE_CHUNK_RETRY_BASE_MS = 1000;
const LIVE_CHUNK_RETRY_MAX_MS = 15000;
const LIVE_DRAIN_TIMEOUT_MS = 12000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizePointForLive = (point) => {
  if (!point) return null;

  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  const timestamp = Number(point.timestamp);
  const accuracy =
    typeof point.accuracy === "number" && Number.isFinite(point.accuracy)
      ? point.accuracy
      : null;
  const altitude =
    typeof point.altitude === "number" && Number.isFinite(point.altitude)
      ? point.altitude
      : null;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(timestamp)
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    timestamp,
    accuracy,
    altitude,
  };
};

const buildCaptureEvents = (tiles, currentUserId) => {
  if (!Array.isArray(tiles) || tiles.length === 0) {
    return [];
  }

  return tiles
    .filter((tile) => tile && tile.grid_lat !== undefined && tile.grid_lng !== undefined)
    .map((tile) => {
      const isMine = String(tile.owner_id) === String(currentUserId || "");
      const isCapture = Boolean(tile.was_captured) || (!isMine && tile.previous_owner_id);
      const type = isCapture ? "capture" : tile.was_strengthened ? "reinforce" : "claim";
      const label = `Zone ${tile.grid_lat}, ${tile.grid_lng}`;
      return {
        id: `${Date.now()}-${tile.grid_lat}-${tile.grid_lng}-${type}`,
        type,
        label,
        owner_username: tile.owner_username,
        strength: tile.strength || 1,
        created_at: Date.now(),
        message:
          type === "capture"
            ? `Captured from ${tile.previous_owner_username || "a rival"}`
            : type === "reinforce"
              ? `Reinforced ${label}`
              : `Claimed ${label}`,
        accent: type === "capture" ? "rival" : "owned",
      };
    });
};

export function useRunTracker() {
  const { signIn, auth } = useAuth();
  const queryClient = useQueryClient();

  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [positions, setPositions] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [gpsStatus, setGpsStatus] = useState("idle");
  const [currentAccuracy, setCurrentAccuracy] = useState(null);
  const [liveSpeedMps, setLiveSpeedMps] = useState(0);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [elevationGainM, setElevationGainM] = useState(0);
  const [elevationLossM, setElevationLossM] = useState(0);
  const [captureEvents, setCaptureEvents] = useState([]);
  const [lastRunSummary, setLastRunSummary] = useState(null);

  const locationSub = useRef(null);
  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const retryTimerRef = useRef(null);

  const lastProcessedPosition = useRef(null);
  const pendingDistanceMeters = useRef(0);
  const totalDistanceMeters = useRef(0);
  const totalElevationGainMeters = useRef(0);
  const totalElevationLossMeters = useRef(0);
  const lastSmoothedAltitudeMeters = useRef(null);
  const speedWindowSamples = useRef([]);

  const runSessionIdRef = useRef(null);
  const chunkSeqRef = useRef(0);
  const pendingLivePointsRef = useRef([]);
  const inFlightChunkRef = useRef(null);
  const chunkRetryCountRef = useRef(0);
  const lastChunkSentAtRef = useRef(0);
  const lastChunkDistanceMetersRef = useRef(0);

  useEffect(() => {
    if (!isRunning || isPaused) {
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
  }, [isPaused, isRunning]);

  const clearLiveRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

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
    clearLiveRetryTimer();
  }, [clearLiveRetryTimer]);

  const mergeChangedTilesIntoCache = useCallback(
    (changedTiles) => {
      if (!Array.isArray(changedTiles) || changedTiles.length === 0) {
        return;
      }

      queryClient.setQueriesData({ queryKey: ["territories"] }, (current) => {
        if (!current || !Array.isArray(current.territories)) {
          return current;
        }

        const territoryMap = new Map(
          current.territories.map((tile) => [
            `${tile.grid_lat}:${tile.grid_lng}`,
            tile,
          ]),
        );

        for (const tile of changedTiles) {
          if (!tile) continue;
          const key = `${tile.grid_lat}:${tile.grid_lng}`;
          const existing = territoryMap.get(key);
          territoryMap.set(key, {
            ...(existing || {}),
            ...tile,
          });
        }

        return {
          ...current,
          territories: Array.from(territoryMap.values()),
        };
      });
    },
    [queryClient],
  );

  const scheduleLiveChunkRetry = useCallback(
    (flushLiveChunk) => {
      clearLiveRetryTimer();
      chunkRetryCountRef.current += 1;
      const retryDelay = Math.min(
        LIVE_CHUNK_RETRY_BASE_MS * 2 ** (chunkRetryCountRef.current - 1),
        LIVE_CHUNK_RETRY_MAX_MS,
      );
      retryTimerRef.current = setTimeout(() => {
        flushLiveChunk({ force: true }).catch((error) => {
          console.error("Retry live chunk error:", error);
        });
      }, retryDelay);
    },
    [clearLiveRetryTimer],
  );

  const flushLiveChunk = useCallback(
    async ({ force = false } = {}) => {
      if (!runSessionIdRef.current) {
        return true;
      }

      if (inFlightChunkRef.current && !force) {
        return false;
      }

      let payload = inFlightChunkRef.current;
      if (!payload) {
        const pendingPoints = pendingLivePointsRef.current;
        if (pendingPoints.length === 0) {
          return true;
        }

        const now = Date.now();
        const distanceSinceLastChunk =
          totalDistanceMeters.current - lastChunkDistanceMetersRef.current;
        const shouldFlushByTime =
          now - lastChunkSentAtRef.current >= LIVE_CHUNK_INTERVAL_MS;
        const shouldFlushByDistance =
          distanceSinceLastChunk >= LIVE_CHUNK_DISTANCE_METERS;

        if (!force && !shouldFlushByTime && !shouldFlushByDistance) {
          return false;
        }

        const pointsToSend = pendingPoints.slice(0, LIVE_CHUNK_MAX_POINTS);
        payload = {
          seq: chunkSeqRef.current + 1,
          points: pointsToSend,
        };
        inFlightChunkRef.current = payload;
      }

      try {
        const res = await fetch("/api/runs/live/chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            run_session_id: runSessionIdRef.current,
            seq: payload.seq,
            points: payload.points,
          }),
        });

        if (!res.ok) {
          let errorPayload = null;
          try {
            errorPayload = await res.json();
          } catch {
            errorPayload = null;
          }

          if (
            res.status === 409 &&
            Number.isFinite(Number(errorPayload?.expected_seq))
          ) {
            const expectedSeq = Number(errorPayload.expected_seq);
            if (expectedSeq === payload.seq + 1) {
              pendingLivePointsRef.current.splice(0, payload.points.length);
              chunkSeqRef.current = expectedSeq - 1;
              inFlightChunkRef.current = null;
              lastChunkSentAtRef.current = Date.now();
              lastChunkDistanceMetersRef.current = totalDistanceMeters.current;
              chunkRetryCountRef.current = 0;
              clearLiveRetryTimer();
              return true;
            }

            chunkSeqRef.current = Math.max(0, expectedSeq - 1);
            inFlightChunkRef.current = null;
          }

          scheduleLiveChunkRetry(flushLiveChunk);
          return false;
        }

        const data = await res.json();
        const changedTiles = data?.changed_tiles || [];
        mergeChangedTilesIntoCache(changedTiles);
        const events = buildCaptureEvents(changedTiles, auth?.user?.id);
        if (events.length > 0) {
          setCaptureEvents((prev) => [...events, ...prev].slice(0, 10));
          const hasCapture = events.some((event) => event.type === "capture");
          Haptics.notificationAsync(
            hasCapture
              ? Haptics.NotificationFeedbackType.Success
              : Haptics.NotificationFeedbackType.Warning,
          ).catch(() => null);
        }

        pendingLivePointsRef.current.splice(0, payload.points.length);
        chunkSeqRef.current = Math.max(chunkSeqRef.current, payload.seq);
        inFlightChunkRef.current = null;
        chunkRetryCountRef.current = 0;
        clearLiveRetryTimer();
        lastChunkSentAtRef.current = Date.now();
        lastChunkDistanceMetersRef.current = totalDistanceMeters.current;

        return true;
      } catch (error) {
        console.error("Live chunk upload error:", error);
        scheduleLiveChunkRetry(flushLiveChunk);
        return false;
      }
    },
    [
      auth?.user?.id,
      clearLiveRetryTimer,
      mergeChangedTilesIntoCache,
      scheduleLiveChunkRetry,
    ],
  );

  const queueLivePoint = useCallback(
    (point) => {
      const normalized = normalizePointForLive(point);
      if (!normalized || !runSessionIdRef.current) {
        return;
      }

      const pending = pendingLivePointsRef.current;
      const lastPending = pending[pending.length - 1];
      if (
        lastPending &&
        lastPending.timestamp === normalized.timestamp &&
        lastPending.latitude === normalized.latitude &&
        lastPending.longitude === normalized.longitude
      ) {
        return;
      }

      pending.push(normalized);

      flushLiveChunk({ force: false }).catch((error) => {
        console.error("Auto flush live chunk error:", error);
      });
    },
    [flushLiveChunk],
  );

  const drainLiveChunks = useCallback(async () => {
    if (!runSessionIdRef.current) {
      return true;
    }

    const deadline = Date.now() + LIVE_DRAIN_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const hasPending =
        pendingLivePointsRef.current.length > 0 ||
        Boolean(inFlightChunkRef.current);
      if (!hasPending) {
        return true;
      }

      await flushLiveChunk({ force: true });
      await sleep(250);
    }

    return false;
  }, [flushLiveChunk]);

  const resetLiveSessionRefs = useCallback(() => {
    clearLiveRetryTimer();
    runSessionIdRef.current = null;
    chunkSeqRef.current = 0;
    pendingLivePointsRef.current = [];
    inFlightChunkRef.current = null;
    chunkRetryCountRef.current = 0;
    lastChunkSentAtRef.current = 0;
    lastChunkDistanceMetersRef.current = 0;
  }, [clearLiveRetryTimer]);

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

    const traveledMeters = Math.max(
      0,
      last.distanceMeters - first.distanceMeters,
    );
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

  const updateElevationFromSample = useCallback((coords) => {
    if (!coords) {
      return;
    }

    const altitude = Number(coords.altitude);
    if (!Number.isFinite(altitude)) {
      return;
    }

    const altitudeAccuracy =
      typeof coords.altitudeAccuracy === "number" &&
      Number.isFinite(coords.altitudeAccuracy)
        ? Math.max(coords.altitudeAccuracy, 0)
        : null;

    if (
      altitudeAccuracy !== null &&
      altitudeAccuracy > MAX_ACCEPTABLE_ELEVATION_ACCURACY_METERS
    ) {
      return;
    }

    if (!Number.isFinite(lastSmoothedAltitudeMeters.current)) {
      lastSmoothedAltitudeMeters.current = altitude;
      return;
    }

    const previousAltitude = lastSmoothedAltitudeMeters.current;
    const smoothedAltitude =
      previousAltitude +
      (altitude - previousAltitude) * ELEVATION_SMOOTHING_FACTOR;
    lastSmoothedAltitudeMeters.current = smoothedAltitude;

    const rawDelta = smoothedAltitude - previousAltitude;
    const accuracyForGate =
      altitudeAccuracy ?? MAX_ACCEPTABLE_ELEVATION_ACCURACY_METERS / 2;
    const elevationNoiseGate = Math.max(
      ELEVATION_NOISE_MIN_METERS,
      Math.min(
        ELEVATION_NOISE_MAX_METERS,
        accuracyForGate * ELEVATION_NOISE_ACCURACY_FACTOR,
      ),
    );

    if (Math.abs(rawDelta) < elevationNoiseGate) {
      return;
    }

    const creditedDelta =
      Math.abs(rawDelta) - elevationNoiseGate * DISTANCE_DEDUCTION_RATIO;
    if (creditedDelta <= 0) {
      return;
    }

    if (rawDelta > 0) {
      totalElevationGainMeters.current += creditedDelta;
      setElevationGainM(Math.round(totalElevationGainMeters.current * 10) / 10);
      return;
    }

    totalElevationLossMeters.current += creditedDelta;
    setElevationLossM(Math.round(totalElevationLossMeters.current * 10) / 10);
  }, []);

  const resetRunMetrics = useCallback(() => {
    setDistance(0);
    setDuration(0);
    setPositions([]);
    setStartTime(null);
    setGpsStatus("idle");
    setCurrentAccuracy(null);
    setLiveSpeedMps(0);
    setElevationGainM(0);
    setElevationLossM(0);

    lastProcessedPosition.current = null;
    pendingDistanceMeters.current = 0;
    totalDistanceMeters.current = 0;
    totalElevationGainMeters.current = 0;
    totalElevationLossMeters.current = 0;
    lastSmoothedAltitudeMeters.current = null;
    speedWindowSamples.current = [];
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

      const altitude =
        typeof coords.altitude === "number" && Number.isFinite(coords.altitude)
          ? coords.altitude
          : null;
      const altitudeAccuracy =
        typeof coords.altitudeAccuracy === "number" &&
        Number.isFinite(coords.altitudeAccuracy)
          ? Math.max(coords.altitudeAccuracy, 0)
          : null;

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
      updateElevationFromSample(coords);

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
        altitude,
        altitudeAccuracy,
      };

      if (!lastProcessedPosition.current) {
        if (accuracy !== null && accuracy > MAX_ACCEPTABLE_ACCURACY_METERS) {
          setGpsStatus("waiting");
          updateLiveSpeed(timestamp);
          return;
        }
        lastProcessedPosition.current = sample;
        setPositions([sample]);
        queueLivePoint(sample);
        setGpsStatus("ready");
        updateLiveSpeed(timestamp);
        return;
      }

      const previous = lastProcessedPosition.current;
      const horizontalDistanceKm = calculateDistance(
        previous.latitude,
        previous.longitude,
        sample.latitude,
        sample.longitude,
      );
      const horizontalDistanceMeters = horizontalDistanceKm * 1000;
      const elapsedSeconds = Math.max(
        (timestamp - previous.timestamp) / 1000,
        0.5,
      );
      const derivedSpeedMps = horizontalDistanceMeters / elapsedSeconds;

      const dynamicMaxSegmentMeters = Math.max(
        HARD_REJECT_JUMP_METERS,
        MAX_ACCEPTED_SPEED_MPS * elapsedSeconds * 2.5 + 25,
      );
      if (
        derivedSpeedMps > MAX_ACCEPTED_SPEED_MPS * 1.8 ||
        horizontalDistanceMeters > dynamicMaxSegmentMeters
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
      const currentSampleAccuracy =
        accuracy ?? MAX_ACCEPTABLE_ACCURACY_METERS / 2;
      const noiseGateMeters = Math.max(
        NOISE_GATE_MIN_METERS,
        Math.min(
          NOISE_GATE_MAX_METERS,
          (previousAccuracy + currentSampleAccuracy) *
            NOISE_GATE_ACCURACY_FACTOR,
        ),
      );

      if (horizontalDistanceMeters < noiseGateMeters) {
        setGpsStatus("tracking");
        updateLiveSpeed(timestamp);
        return;
      }

      const creditedDistanceMeters = Math.max(
        0,
        horizontalDistanceMeters - noiseGateMeters * DISTANCE_DEDUCTION_RATIO,
      );
      pendingDistanceMeters.current += creditedDistanceMeters;
      lastProcessedPosition.current = sample;
      queueLivePoint(sample);

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
    [queueLivePoint, updateElevationFromSample, updateLiveSpeed],
  );

  const beginLocationTracking = useCallback(async () => {
    if (locationSub.current) {
      locationSub.current.remove();
      locationSub.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

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
  }, [acceptLocationSample]);

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

    const startedAt = new Date().toISOString();

    setIsRunning(true);
    setIsPaused(false);
    setDistance(0);
    setDuration(0);
    setPositions([]);
    setStartTime(startedAt);
    setGpsStatus("acquiring");
    setCurrentAccuracy(null);
    setLiveSpeedMps(0);
    setElevationGainM(0);
    setElevationLossM(0);
    setCurrentCoords(null);
    setCaptureEvents([]);
    lastProcessedPosition.current = null;
    pendingDistanceMeters.current = 0;
    totalDistanceMeters.current = 0;
    totalElevationGainMeters.current = 0;
    totalElevationLossMeters.current = 0;
    lastSmoothedAltitudeMeters.current = null;
    speedWindowSamples.current = [];
    resetLiveSessionRefs();

    try {
      const liveStartRes = await fetch("/api/runs/live/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ started_at: startedAt }),
      });
      if (liveStartRes.ok) {
        const liveSession = await liveStartRes.json();
        runSessionIdRef.current = liveSession?.run_session_id || null;
      }
    } catch (error) {
      console.error("Live run start error:", error);
    }

    await beginLocationTracking();
  }, [auth, beginLocationTracking, resetLiveSessionRefs, signIn]);

  const pauseRun = useCallback(() => {
    if (!isRunning || isPaused) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPaused(true);
    setGpsStatus("paused");
    stopTracking();

    if (pendingDistanceMeters.current > 0) {
      totalDistanceMeters.current += pendingDistanceMeters.current;
      pendingDistanceMeters.current = 0;
      setDistance(totalDistanceMeters.current / 1000);
    }

    setLiveSpeedMps(0);
    speedWindowSamples.current = [];
    lastProcessedPosition.current = null;
    lastSmoothedAltitudeMeters.current = null;
  }, [isPaused, isRunning, stopTracking]);

  const resumeRun = useCallback(async () => {
    if (!isRunning || !isPaused) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPaused(false);
    setGpsStatus("acquiring");
    setLiveSpeedMps(0);
    speedWindowSamples.current = [];
    lastProcessedPosition.current = null;
    pendingDistanceMeters.current = 0;
    lastSmoothedAltitudeMeters.current = null;

    await beginLocationTracking();
  }, [beginLocationTracking, isPaused, isRunning]);

  const stopRun = useCallback(async () => {
    if (!isRunning) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsRunning(false);
    setIsPaused(false);
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
    const finalDurationSeconds = duration;
    const finalAverageSpeedMps =
      finalDurationSeconds > 0 && finalDistanceKm > 0
        ? (finalDistanceKm * 1000) / finalDurationSeconds
        : 0;
    const finalStartedAt = startTime;
    const finalPositions = positions;
    const finalElevationGainMeters =
      Math.round(totalElevationGainMeters.current * 10) / 10;
    const finalElevationLossMeters =
      Math.round(totalElevationLossMeters.current * 10) / 10;

    const hasLiveSession = Boolean(runSessionIdRef.current);

    try {
      if (hasLiveSession) {
        await drainLiveChunks();

        try {
          const finalPoints = inFlightChunkRef.current
            ? []
            : pendingLivePointsRef.current.slice();
          const finishRes = await fetch("/api/runs/live/finish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              run_session_id: runSessionIdRef.current,
              distance_km: Math.round(finalDistanceKm * 1000) / 1000,
              duration_seconds: finalDurationSeconds,
              avg_pace:
                finalAverageSpeedMps > 0 ? finalAverageSpeedMps * 3.6 : null,
              started_at: finalStartedAt,
              final_points: finalPoints,
              route_data: finalPositions,
              elevation_gain_m: finalElevationGainMeters,
              elevation_loss_m: finalElevationLossMeters,
            }),
          });

          if (!finishRes.ok) {
            throw new Error(`finish failed: ${finishRes.status}`);
          }
          const finishData = await finishRes.json().catch(() => ({}));
          setLastRunSummary({
            run: finishData?.run || null,
            territory_summary: finishData?.territory_summary || {},
            changed_tiles: finishData?.changed_tiles || [],
            distance_km: Math.round(finalDistanceKm * 1000) / 1000,
            duration_seconds: finalDurationSeconds,
            elevation_gain_m: finalElevationGainMeters,
            elevation_loss_m: finalElevationLossMeters,
            completed_at: new Date().toISOString(),
          });

          queryClient.invalidateQueries({ queryKey: ["runs"] });
          queryClient.invalidateQueries({ queryKey: ["profile"] });
          queryClient.invalidateQueries({ queryKey: ["territories"] });
          queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
          return;
        } catch (error) {
          console.error("Live run finish error:", error);
        }
      }

      if (finalDistanceKm > 0.01) {
        try {
          const routeData =
            finalPositions.length > 0 ? JSON.stringify(finalPositions) : null;
          const saveRes = await fetch("/api/runs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              distance_km: Math.round(finalDistanceKm * 1000) / 1000,
              duration_seconds: finalDurationSeconds,
              avg_pace:
                finalAverageSpeedMps > 0 ? finalAverageSpeedMps * 3.6 : null,
              territories_claimed: 0,
              route_data: routeData,
              started_at: finalStartedAt,
              elevation_gain_m: finalElevationGainMeters,
              elevation_loss_m: finalElevationLossMeters,
            }),
          });
          const saveData = await saveRes.json().catch(() => ({}));
          setLastRunSummary({
            run: saveData?.run || null,
            territory_summary: {
              territories_claimed: 0,
              territories_captured: 0,
              territories_strengthened: 0,
            },
            changed_tiles: [],
            distance_km: Math.round(finalDistanceKm * 1000) / 1000,
            duration_seconds: finalDurationSeconds,
            elevation_gain_m: finalElevationGainMeters,
            elevation_loss_m: finalElevationLossMeters,
            completed_at: new Date().toISOString(),
          });
          Alert.alert(
            "Run saved without verification",
            "Live finish failed, so this run was saved as unverified and does not affect leaderboard stats.",
          );
          queryClient.invalidateQueries({ queryKey: ["runs"] });
          queryClient.invalidateQueries({ queryKey: ["profile"] });
        } catch (err) {
          console.error("Save run error:", err);
          Alert.alert(
            "Run save failed",
            "We couldn't verify or save this run. Please try again with a stable connection.",
          );
        }
      }
    } finally {
      resetLiveSessionRefs();
      resetRunMetrics();
    }
  }, [
    drainLiveChunks,
    duration,
    isRunning,
    positions,
    queryClient,
    resetRunMetrics,
    resetLiveSessionRefs,
    startTime,
    stopTracking,
  ]);

  useEffect(() => {
    return () => {
      stopTracking();
      resetLiveSessionRefs();
    };
  }, [resetLiveSessionRefs, stopTracking]);

  const speedMps = isRunning && !isPaused ? liveSpeedMps : 0;
  const speedKmh = Math.max(0, speedMps * 3.6);
  const paceDisplay = useMemo(() => formatPace(speedKmh), [speedKmh]);
  const clearLastRunSummary = useCallback(() => {
    setLastRunSummary(null);
  }, []);

  return {
    isRunning,
    isPaused,
    distance,
    duration,
    paceDisplay,
    speedKmh,
    elevationGainM,
    elevationLossM,
    gpsStatus,
    currentAccuracy,
    currentCoords,
    captureEvents,
    lastRunSummary,
    clearLastRunSummary,
    startRun,
    pauseRun,
    resumeRun,
    stopRun,
  };
}

export default useRunTracker;
