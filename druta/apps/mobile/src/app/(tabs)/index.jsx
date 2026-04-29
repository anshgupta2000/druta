import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useQuery } from "@tanstack/react-query";
import {
  Crosshair,
  Shield,
  Zap,
  MapPin,
  Navigation,
  Hexagon,
  Play,
  Pause,
  Square,
} from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  COLORS,
  calculateDistance,
  latLngToGrid,
  gridToLatLng,
  getOwnerColor,
  formatDuration,
} from "@/constants/theme";
import useUser from "@/utils/auth/useUser";
import { useRunTracker } from "@/utils/run/useRunTracker";

const isWeb = Platform.OS === "web";
const isIOS = Platform.OS === "ios";
const AUTO_FOLLOW_MIN_MOVE_METERS = 3;
const MAP_GRID_ROWS = Array.from({ length: 9 });
const MAP_GRID_COLS = Array.from({ length: 7 });
const TERRITORY_PREVIEW_TILES = [
  { left: "12%", top: "58%", size: 58, color: COLORS.accent, opacity: 0.18 },
  { left: "30%", top: "48%", size: 68, color: COLORS.cyan, opacity: 0.12 },
  { left: "52%", top: "56%", size: 74, color: COLORS.accent, opacity: 0.2 },
  { left: "68%", top: "42%", size: 82, color: COLORS.orange, opacity: 0.13 },
];
const CONTOUR_LINES = [
  { left: "8%", top: "35%", width: 230, rotate: "-13deg" },
  { left: "2%", top: "48%", width: 300, rotate: "-10deg" },
  { left: "18%", top: "63%", width: 260, rotate: "-8deg" },
  { left: "36%", top: "77%", width: 190, rotate: "-14deg" },
];

const darkGoogleMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#08080A" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#08080A" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#3a3a4a" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#111114" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#0a0a0d" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#040408" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#0a0a0d" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#0a0a0d" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#0a0a0d" }],
  },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1a1a24" }],
  },
];

function NativeMapContent({
  mapRef,
  region,
  onRegionChangeComplete,
  onPanDrag,
  territories,
  user,
  onMapReady,
}) {
  const MapView = require("react-native-maps").default;
  const { PROVIDER_GOOGLE, Polygon } = require("react-native-maps");

  const provider = isIOS ? undefined : PROVIDER_GOOGLE;
  const customMapStyle = isIOS ? undefined : darkGoogleMapStyle;
  const mapType = isIOS ? "mutedStandard" : "standard";

  return (
    <MapView
      ref={mapRef}
      provider={provider}
      mapType={mapType}
      style={{ flex: 1 }}
      region={region}
      onRegionChangeComplete={onRegionChangeComplete}
      onPanDrag={onPanDrag}
      customMapStyle={customMapStyle}
      showsUserLocation={true}
      showsMyLocationButton={false}
      showsCompass={false}
      showsBuildings={true}
      showsTraffic={false}
      onMapReady={onMapReady}
    >
      {territories.map((territory) => {
        const bounds = gridToLatLng(
          territory.grid_lat,
          territory.grid_lng,
          region.latitude,
        );
        const color = getOwnerColor(territory.owner_id);
        const opacity = Math.min(0.18 + (territory.strength || 1) * 0.05, 0.55);
        const isOwn = territory.owner_id === user?.id;
        const strokeColor = isOwn ? COLORS.accent : color;
        const alpha = Math.round(opacity * 255)
          .toString(16)
          .padStart(2, "0");

        return (
          <Polygon
            key={`${territory.grid_lat}-${territory.grid_lng}`}
            coordinates={[
              { latitude: bounds.lat, longitude: bounds.lng },
              { latitude: bounds.latEnd, longitude: bounds.lng },
              { latitude: bounds.latEnd, longitude: bounds.lngEnd },
              { latitude: bounds.lat, longitude: bounds.lngEnd },
            ]}
            fillColor={`${color}${alpha}`}
            strokeColor={`${strokeColor}AA`}
            strokeWidth={1}
          />
        );
      })}
    </MapView>
  );
}

function WebMapFallback({ territories, user, location, title, subtitle }) {
  const myTerritories = territories.filter((t) => t.owner_id === user?.id);
  const otherTerritories = territories.filter((t) => t.owner_id !== user?.id);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 380,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View
        entering={FadeInDown.duration(500)}
        style={{
          backgroundColor: "#05070B",
          borderRadius: 30,
          padding: 18,
          borderWidth: 1,
          borderColor: "rgba(45,122,255,0.34)",
          minHeight: 318,
          marginBottom: 18,
          overflow: "hidden",
          shadowColor: COLORS.accent,
          shadowOffset: { width: 0, height: 24 },
          shadowOpacity: 0.16,
          shadowRadius: 34,
        }}
      >
        <View
          style={{
            position: "absolute",
            left: -52,
            right: -52,
            top: 96,
            bottom: -14,
            backgroundColor: "rgba(45,122,255,0.025)",
          }}
        >
          {MAP_GRID_ROWS.map((_, i) => (
            <View
              key={`map-row-${i}`}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: i * 30,
                height: 1,
                backgroundColor: i % 2 ? "rgba(45,122,255,0.08)" : "rgba(255,255,255,0.04)",
              }}
            />
          ))}
          {MAP_GRID_COLS.map((_, i) => (
            <View
              key={`map-col-${i}`}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: i * 66,
                width: 1,
                backgroundColor: "rgba(255,255,255,0.05)",
              }}
            />
          ))}
        </View>
        {CONTOUR_LINES.map((line, i) => (
          <View
            key={`contour-${i}`}
            style={{
              position: "absolute",
              left: line.left,
              top: line.top,
              width: line.width,
              height: 1,
              borderTopWidth: 1,
              borderColor: "rgba(255,255,255,0.065)",
              borderStyle: "dashed",
              transform: [{ rotate: line.rotate }],
            }}
          />
        ))}
        {TERRITORY_PREVIEW_TILES.map((tile, i) => (
          <View
            key={`preview-tile-${i}`}
            style={{
              position: "absolute",
              left: tile.left,
              top: tile.top,
              width: tile.size,
              height: tile.size * 0.72,
              borderRadius: 16,
              backgroundColor: `${tile.color}${Math.round(tile.opacity * 255)
                .toString(16)
                .padStart(2, "0")}`,
              borderWidth: 1,
              borderColor: `${tile.color}4A`,
              transform: [{ rotate: i % 2 ? "9deg" : "-7deg" }],
            }}
          />
        ))}
        <View
          style={{
            position: "absolute",
            left: "46%",
            top: "62%",
            width: 86,
            height: 86,
            borderRadius: 43,
            borderWidth: 1,
            borderColor: "rgba(255,107,53,0.2)",
            backgroundColor: "rgba(255,107,53,0.035)",
          }}
        />
        <View
          style={{
            position: "absolute",
            left: "53%",
            top: "69%",
            width: 13,
            height: 13,
            borderRadius: 7,
            backgroundColor: COLORS.orange,
            borderWidth: 2,
            borderColor: "rgba(255,255,255,0.82)",
            shadowColor: COLORS.orange,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: 16,
          }}
        />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <View style={{ flex: 1, paddingRight: 18 }}>
            <Text
              style={{
                color: COLORS.textPrimary,
                fontSize: 22,
                fontWeight: "800",
                letterSpacing: -0.5,
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                color: COLORS.textTertiary,
                fontSize: 13,
                marginTop: 8,
                lineHeight: 19,
              }}
            >
              {subtitle}
            </Text>
          </View>
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 20,
              backgroundColor: "rgba(45,122,255,0.14)",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(45,122,255,0.24)",
            }}
          >
            <Navigation size={25} color={COLORS.accent} />
          </View>
        </View>
        {location && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "flex-start",
              marginTop: 136,
              backgroundColor: "rgba(0,0,0,0.44)",
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <MapPin size={12} color={COLORS.accent} />
            <Text
              style={{
                color: COLORS.textSecondary,
                fontSize: 11,
                marginLeft: 6,
                fontWeight: "500",
              }}
            >
              {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
            </Text>
          </View>
        )}
      </Animated.View>

      <Text
        style={{
          color: COLORS.accent,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 1.5,
          marginBottom: 12,
          textTransform: "uppercase",
        }}
      >
        Your Zones · {myTerritories.length}
      </Text>
      {myTerritories.length === 0 && (
        <Animated.View
          entering={FadeInDown.delay(100).duration(300)}
          style={{
            backgroundColor: "rgba(255,255,255,0.035)",
            borderRadius: 18,
            padding: 18,
            flexDirection: "row",
            alignItems: "center",
            borderWidth: 1,
            borderColor: COLORS.border,
            marginBottom: 20,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 15,
              backgroundColor: COLORS.card,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: COLORS.border,
              marginRight: 14,
            }}
          >
            <Hexagon size={23} color={COLORS.textDisabled} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: COLORS.textSecondary,
                fontSize: 14,
                fontWeight: "700",
              }}
            >
              No territories claimed
            </Text>
            <Text
              style={{
                color: COLORS.textTertiary,
                fontSize: 12,
                marginTop: 4,
              }}
            >
              Start running to conquer your first zone
            </Text>
          </View>
        </Animated.View>
      )}
      {myTerritories.map((territory, idx) => (
        <Animated.View
          key={`${territory.grid_lat}-${territory.grid_lng}`}
          entering={FadeInDown.delay(idx * 40).duration(300)}
          style={{
            backgroundColor: COLORS.accentMuted,
            borderRadius: 16,
            padding: 16,
            marginBottom: 8,
            borderWidth: 1,
            borderColor: COLORS.borderAccent,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: COLORS.accentGlow,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Shield size={18} color={COLORS.accent} />
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text
                style={{
                  color: COLORS.textPrimary,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Zone ({territory.grid_lat}, {territory.grid_lng})
              </Text>
              <Text
                style={{
                  color: COLORS.textTertiary,
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                Controlled by you
              </Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <View style={{ flexDirection: "row", gap: 3 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor:
                      i < (territory.strength || 0)
                        ? COLORS.accent
                        : COLORS.textDisabled,
                  }}
                />
              ))}
            </View>
            <Text
              style={{
                color: COLORS.textTertiary,
                fontSize: 10,
                marginTop: 4,
                fontWeight: "600",
              }}
            >
              LVL {territory.strength || 0}
            </Text>
          </View>
        </Animated.View>
      ))}

      {otherTerritories.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text
            style={{
              color: COLORS.orange,
              fontSize: 12,
              fontWeight: "700",
              letterSpacing: 1.5,
              marginBottom: 12,
              textTransform: "uppercase",
            }}
          >
            Rival Zones · {otherTerritories.length}
          </Text>
          {otherTerritories.map((territory, idx) => {
            const ownerColor = getOwnerColor(territory.owner_id);
            return (
              <Animated.View
                key={`${territory.grid_lat}-${territory.grid_lng}`}
                entering={FadeInDown.delay(
                  (myTerritories.length + idx) * 40,
                ).duration(300)}
                style={{
                  backgroundColor: COLORS.surface,
                  borderRadius: 16,
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
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: `${ownerColor}15`,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Shield size={18} color={ownerColor} />
                  </View>
                  <View style={{ marginLeft: 12 }}>
                    <Text
                      style={{
                        color: COLORS.textPrimary,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {territory.owner_username || "Unknown"}
                    </Text>
                    <Text
                      style={{
                        color: COLORS.textTertiary,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                    >
                      Zone ({territory.grid_lat}, {territory.grid_lng})
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <View style={{ flexDirection: "row", gap: 3 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <View
                        key={i}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor:
                            i < (territory.strength || 0)
                              ? ownerColor
                              : COLORS.textDisabled,
                        }}
                      />
                    ))}
                  </View>
                  <Text
                    style={{
                      color: COLORS.textTertiary,
                      fontSize: 10,
                      marginTop: 4,
                      fontWeight: "600",
                    }}
                  >
                    LVL {territory.strength || 0}
                  </Text>
                </View>
              </Animated.View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function MetricCell({ label, value, valueColor = COLORS.white, unit }) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        backgroundColor: "rgba(255,255,255,0.035)",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        paddingVertical: 10,
        minHeight: 76,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 18,
          right: 18,
          height: 2,
          borderRadius: 1,
          backgroundColor:
            valueColor === COLORS.white
              ? "rgba(255,255,255,0.12)"
              : `${valueColor}99`,
        }}
      />
      <Text
        style={{
          color: valueColor,
          fontSize: 29,
          fontWeight: "800",
          letterSpacing: -1.2,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: COLORS.textTertiary,
          fontSize: 10,
          fontWeight: "700",
          letterSpacing: 0.7,
          marginTop: 2,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
      {unit ? (
        <Text
          style={{
            color: COLORS.textDisabled,
            fontSize: 10,
            marginTop: 2,
            fontWeight: "600",
            letterSpacing: 0.4,
          }}
        >
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

function TrackingDock({
  isRunning,
  isPaused,
  duration,
  paceDisplay,
  distance,
  speedKmh,
  elevationGainM,
  elevationLossM,
  currentAccuracy,
  gpsLabel,
  onStartRun,
  onPauseRun,
  onResumeRun,
  onFinishRun,
  onLocateUser,
  isLocatingUser,
  showLocateButton,
  bottomInset,
}) {
  const accuracyLabel =
    currentAccuracy !== null ? `${Math.round(currentAccuracy)}m` : "--";

  return (
    <View
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: bottomInset + 66,
        zIndex: 20,
      }}
      pointerEvents="box-none"
    >
      <Animated.View
        entering={FadeInDown.duration(350)}
        style={{
          backgroundColor: "rgba(7,10,16,0.97)",
          borderRadius: 30,
          paddingTop: 14,
          paddingBottom: 14,
          paddingHorizontal: 12,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          overflow: "hidden",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: 0.42,
          shadowRadius: 32,
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 22,
            right: 22,
            top: 0,
            height: 2,
            backgroundColor: isRunning
              ? COLORS.green
              : "rgba(45,122,255,0.68)",
            borderRadius: 1,
          }}
        />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
            gap: 10,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: isRunning
                ? "rgba(45,122,255,0.18)"
                : COLORS.surface,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: isRunning ? COLORS.borderAccent : COLORS.border,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: isRunning ? COLORS.green : COLORS.accent,
                marginRight: 7,
              }}
            />
            <Text
              style={{
                color: isRunning ? COLORS.accent : COLORS.textSecondary,
                fontSize: 10,
                fontWeight: "800",
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              {gpsLabel}
            </Text>
          </View>
          <Text
            style={{
              color: COLORS.textTertiary,
              fontSize: 11,
              fontWeight: "700",
            }}
          >
            {accuracyLabel} accuracy
          </Text>
        </View>

        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginBottom: 10,
          }}
        >
          <MetricCell label="Time" value={formatDuration(duration)} />
          <MetricCell label="Current Pace" value={paceDisplay} unit="/km" />
          <MetricCell
            label="Distance"
            value={distance.toFixed(2)}
            valueColor={isRunning ? COLORS.accent : COLORS.white}
            unit="km"
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
            gap: 8,
          }}
        >
          <Text
            style={{
              color: COLORS.textSecondary,
              fontSize: 12,
              fontWeight: "600",
              letterSpacing: 0.2,
            }}
          >
            Current Speed {speedKmh.toFixed(1)} km/h
          </Text>
          <Text
            style={{
              color: COLORS.textTertiary,
              fontSize: 12,
              fontWeight: "600",
              textAlign: "right",
            }}
          >
            Elev +{Math.round(elevationGainM)}m / -
            {Math.round(elevationLossM)}m
          </Text>
        </View>

        <View
          style={{
            alignItems: "center",
            position: "relative",
            minHeight: 94,
            width: "100%",
          }}
        >
          {!isRunning ? (
            <View style={{ alignItems: "center" }}>
              <TouchableOpacity
                onPress={onStartRun}
                activeOpacity={0.85}
                style={{
                  width: 74,
                  height: 74,
                  borderRadius: 37,
                  backgroundColor: COLORS.orange,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.28)",
                  shadowColor: COLORS.orange,
                  shadowOffset: { width: 0, height: 12 },
                  shadowOpacity: 0.32,
                  shadowRadius: 22,
                }}
              >
                <Play size={32} color={COLORS.black} fill={COLORS.black} />
              </TouchableOpacity>
              <Text
                style={{
                  color: COLORS.orange,
                  fontSize: 13,
                  fontWeight: "700",
                  marginTop: 10,
                  letterSpacing: 0.3,
                }}
              >
                Start
              </Text>
            </View>
          ) : isPaused ? (
            <View style={{ flexDirection: "row", gap: 16 }}>
              <View style={{ alignItems: "center" }}>
                <TouchableOpacity
                  onPress={onResumeRun}
                  activeOpacity={0.85}
                  style={{
                    width: 74,
                    height: 74,
                    borderRadius: 37,
                    backgroundColor: COLORS.orange,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.28)",
                    shadowColor: COLORS.orange,
                    shadowOffset: { width: 0, height: 12 },
                    shadowOpacity: 0.32,
                    shadowRadius: 22,
                  }}
                >
                  <Play size={32} color={COLORS.black} fill={COLORS.black} />
                </TouchableOpacity>
                <Text
                  style={{
                    color: COLORS.orange,
                    fontSize: 13,
                    fontWeight: "700",
                    marginTop: 10,
                    letterSpacing: 0.3,
                  }}
                >
                  Resume
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <TouchableOpacity
                  onPress={onFinishRun}
                  activeOpacity={0.85}
                  style={{
                    width: 74,
                    height: 74,
                    borderRadius: 37,
                    backgroundColor: COLORS.red,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.28)",
                  }}
                >
                  <Square size={28} color={COLORS.white} fill={COLORS.white} />
                </TouchableOpacity>
                <Text
                  style={{
                    color: COLORS.red,
                    fontSize: 13,
                    fontWeight: "700",
                    marginTop: 10,
                    letterSpacing: 0.3,
                  }}
                >
                  Finish
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ alignItems: "center" }}>
              <TouchableOpacity
                onPress={onPauseRun}
                activeOpacity={0.85}
                style={{
                  width: 74,
                  height: 74,
                  borderRadius: 37,
                  backgroundColor: COLORS.orange,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.28)",
                  shadowColor: COLORS.orange,
                  shadowOffset: { width: 0, height: 12 },
                  shadowOpacity: 0.32,
                  shadowRadius: 22,
                }}
              >
                <Pause size={30} color={COLORS.black} />
              </TouchableOpacity>
              <Text
                style={{
                  color: COLORS.orange,
                  fontSize: 13,
                  fontWeight: "700",
                  marginTop: 10,
                  letterSpacing: 0.3,
                }}
              >
                Pause
              </Text>
            </View>
          )}

          {showLocateButton ? (
            <TouchableOpacity
              onPress={onLocateUser}
              disabled={isLocatingUser}
              activeOpacity={0.85}
              style={{
                position: "absolute",
                right: 12,
                top: 16,
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: COLORS.surface,
                borderWidth: 1,
                borderColor: COLORS.borderLight,
                alignItems: "center",
                justifyContent: "center",
                opacity: isLocatingUser ? 0.6 : 1,
              }}
            >
              {isLocatingUser ? (
                <ActivityIndicator size="small" color={COLORS.accent} />
              ) : (
                <Crosshair size={20} color={COLORS.accent} />
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { data: user } = useUser();
  const {
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
    startRun,
    pauseRun,
    resumeRun,
    stopRun,
  } = useRunTracker();
  const mapRef = useRef(null);
  const lastFollowCoordsRef = useRef(null);
  const [location, setLocation] = useState(null);
  const [locationPermission, setLocationPermission] = useState("loading");
  const [locationError, setLocationError] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const [isFollowingUser, setIsFollowingUser] = useState(true);
  const [region, setRegion] = useState({
    latitude: 12.9716,
    longitude: 77.5946,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });

  useEffect(() => {
    if (!currentCoords) return;
    setLocation(currentCoords);
  }, [currentCoords]);

  const centerMapOnCoords = useCallback((coords, options = {}) => {
    if (!coords) return;
    const { durationMs = 500 } = options;
    const nextRegion = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };

    setRegion(nextRegion);
    const map = mapRef.current;
    if (map?.animateCamera) {
      map.animateCamera(
        {
          center: {
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
          zoom: 17,
        },
        { duration: durationMs },
      );
      return;
    }

    if (map?.animateToRegion) {
      map.animateToRegion(nextRegion, durationMs);
    }
  }, []);

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    setIsFollowingUser(true);
    lastFollowCoordsRef.current = null;
  }, [isRunning]);

  useEffect(() => {
    if (isWeb || !isRunning || !isFollowingUser || !currentCoords) {
      return;
    }

    const previous = lastFollowCoordsRef.current;
    const minMoveMeters = speedKmh < 0.6 ? 6 : AUTO_FOLLOW_MIN_MOVE_METERS;
    if (
      previous &&
      calculateDistance(
        previous.latitude,
        previous.longitude,
        currentCoords.latitude,
        currentCoords.longitude,
      ) *
        1000 <
        minMoveMeters
    ) {
      return;
    }

    centerMapOnCoords(currentCoords, { durationMs: 450 });
    lastFollowCoordsRef.current = currentCoords;
  }, [centerMapOnCoords, currentCoords, isFollowingUser, isRunning, speedKmh]);

  useEffect(() => {
    let isMounted = true;

    const initLocation = async () => {
      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          if (!isMounted) return;
          setLocationPermission("denied");
          setLocationError(
            "Turn on location services to center the map on you.",
          );
          return;
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) return;

        setLocationPermission(status);

        if (status !== "granted") {
          setLocationError(
            "Location access is off. The map is still visible, but it won't center on your live position.",
          );
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!isMounted) return;

        setLocation(loc.coords);
        centerMapOnCoords(loc.coords);
      } catch (err) {
        console.error("Location error:", err);
        if (!isMounted) return;
        setLocationPermission("error");
        setLocationError("Could not get your current location.");
      }
    };

    initLocation();

    return () => {
      isMounted = false;
    };
  }, [centerMapOnCoords]);

  const minGrid = latLngToGrid(
    region.latitude - region.latitudeDelta,
    region.longitude - region.longitudeDelta,
  );
  const maxGrid = latLngToGrid(
    region.latitude + region.latitudeDelta,
    region.longitude + region.longitudeDelta,
  );

  const { data: territoriesData } = useQuery({
    queryKey: [
      "territories",
      minGrid.gridLat,
      maxGrid.gridLat,
      minGrid.gridLng,
      maxGrid.gridLng,
    ],
    queryFn: async () => {
      const res = await fetch(
        `/api/territories?minLat=${minGrid.gridLat}&maxLat=${maxGrid.gridLat}&minLng=${minGrid.gridLng}&maxLng=${maxGrid.gridLng}`,
      );
      if (!res.ok) {
        throw new Error("Failed to fetch territories");
      }
      return res.json();
    },
    refetchInterval: 10000,
  });

  const territories = territoriesData?.territories || [];
  const myTerritories = useMemo(
    () => territories.filter((t) => t.owner_id === user?.id),
    [territories, user?.id],
  );
  const totalStrength = useMemo(
    () => myTerritories.reduce((sum, t) => sum + (t.strength || 0), 0),
    [myTerritories],
  );

  const gpsLabel = useMemo(() => {
    if (!isRunning) return "GPS Ready";
    if (isPaused) return "Paused";
    if (gpsStatus === "acquiring") return "Acquiring GPS";
    if (gpsStatus === "waiting") return "Waiting for cleaner GPS";
    if (gpsStatus === "ready") return "GPS Locked";
    return "Tracking Live";
  }, [gpsStatus, isPaused, isRunning]);

  const centerOnUser = useCallback(async () => {
    if (isLocatingUser) {
      return;
    }

    setIsLocatingUser(true);

    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setLocationPermission("denied");
        setLocationError("Turn on location services to center the map on you.");
        return;
      }

      const existingPermission = await Location.getForegroundPermissionsAsync();
      const permission =
        existingPermission.status === "granted"
          ? existingPermission
          : await Location.requestForegroundPermissionsAsync();

      setLocationPermission(permission.status);
      if (permission.status !== "granted") {
        setLocationError(
          "Location access is off. The map is still visible, but it won't center on your live position.",
        );
        return;
      }

      const immediateTarget = currentCoords || location;
      if (immediateTarget) {
        centerMapOnCoords(immediateTarget);
      }
      setIsFollowingUser(true);
      lastFollowCoordsRef.current = null;

      const lastKnown = await Location.getLastKnownPositionAsync();
      if (
        Number.isFinite(lastKnown?.coords?.latitude) &&
        Number.isFinite(lastKnown?.coords?.longitude)
      ) {
        setLocation(lastKnown.coords);
        centerMapOnCoords(lastKnown.coords);
      }

      const liveLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        mayShowUserSettingsDialog: true,
        maximumAge: 3000,
        timeout: 15000,
      });

      setLocation(liveLocation.coords);
      setLocationError(null);
      centerMapOnCoords(liveLocation.coords);
    } catch (err) {
      console.error("Center on user error:", err);
      const fallback = currentCoords || location;
      if (fallback) {
        centerMapOnCoords(fallback);
        return;
      }
      setLocationError("Could not get your current location.");
    } finally {
      setIsLocatingUser(false);
    }
  }, [centerMapOnCoords, currentCoords, isLocatingUser, location]);

  const handleRegionChangeComplete = useCallback((nextRegion) => {
    setRegion(nextRegion);
  }, []);

  const handleMapPanDrag = useCallback(() => {
    setIsFollowingUser(false);
  }, []);

  const header = (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: 14,
        backgroundColor: isWeb ? COLORS.black : "rgba(0,0,0,0.88)",
        ...(isWeb
          ? {}
          : { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }),
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: "800",
            color: COLORS.white,
            letterSpacing: -0.5,
          }}
        >
          druta<Text style={{ color: COLORS.accent }}>.</Text>
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: COLORS.accentMuted,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: COLORS.borderAccent,
            }}
          >
            <Shield size={13} color={COLORS.accent} />
            <Text
              style={{
                color: COLORS.white,
                fontSize: 13,
                fontWeight: "700",
                marginLeft: 5,
              }}
            >
              {myTerritories.length}
            </Text>
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: COLORS.surface,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Zap size={13} color={COLORS.orange} />
            <Text
              style={{
                color: COLORS.white,
                fontSize: 13,
                fontWeight: "700",
                marginLeft: 5,
              }}
            >
              {totalStrength}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const utilityControlBottom = insets.bottom + 320;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.black }}>
      <StatusBar style="light" />

      {!isWeb && (
        <>
          {!mapReady && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2,
                backgroundColor: COLORS.black,
              }}
            >
              <ActivityIndicator color={COLORS.accent} size="large" />
              <Text
                style={{
                  color: COLORS.textSecondary,
                  fontSize: 13,
                  marginTop: 12,
                }}
              >
                Loading map...
              </Text>
            </View>
          )}

          <NativeMapContent
            mapRef={mapRef}
            region={region}
            onRegionChangeComplete={handleRegionChangeComplete}
            onPanDrag={handleMapPanDrag}
            territories={territories}
            user={user}
            onMapReady={() => setMapReady(true)}
          />

          {header}

          {!location && locationError ? (
            <View
              style={{
                position: "absolute",
                left: 16,
                right: 16,
                bottom: utilityControlBottom,
                backgroundColor: COLORS.surface,
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text
                style={{
                  color: COLORS.white,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Map is visible
              </Text>
              <Text
                style={{
                  color: COLORS.textTertiary,
                  fontSize: 12,
                  lineHeight: 18,
                  marginTop: 4,
                }}
              >
                {locationError}
              </Text>
            </View>
          ) : null}
        </>
      )}

      {isWeb && (
        <>
          {header}
          <WebMapFallback
            territories={territories}
            user={user}
            location={location}
            title="Territory Map"
            subtitle={
              "Full interactive map loads on your device.\nHere's your territory overview."
            }
          />
        </>
      )}

      <TrackingDock
        isRunning={isRunning}
        isPaused={isPaused}
        duration={duration}
        paceDisplay={paceDisplay}
        distance={distance}
        speedKmh={speedKmh}
        elevationGainM={elevationGainM}
        elevationLossM={elevationLossM}
        currentAccuracy={currentAccuracy}
        gpsLabel={gpsLabel}
        onStartRun={startRun}
        onPauseRun={pauseRun}
        onResumeRun={resumeRun}
        onFinishRun={stopRun}
        onLocateUser={centerOnUser}
        isLocatingUser={isLocatingUser}
        showLocateButton={!isWeb}
        bottomInset={insets.bottom}
      />
    </View>
  );
}
