import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  ScrollView,
  ActivityIndicator,
  Share as NativeShare,
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
  Filter,
  X,
  Target,
  AlertTriangle,
  Share2,
  Route,
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
  onTerritoryPress,
  overlayMode,
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
        const isThreat = overlayMode === "threat" && (territory.strength || 0) <= 3;
        const fillBase = isThreat ? COLORS.orange : color;
        const opacity = Math.min(0.18 + (territory.strength || 1) * 0.05, 0.55);
        const isOwn = territory.owner_id === user?.id;
        const strokeColor = isThreat ? COLORS.orange : isOwn ? COLORS.accent : color;
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
            fillColor={`${fillBase}${alpha}`}
            strokeColor={`${strokeColor}AA`}
            strokeWidth={isThreat ? 2 : 1}
            tappable
            onPress={() => onTerritoryPress?.(territory)}
          />
        );
      })}
    </MapView>
  );
}

function WebMapFallback({ territories, user, location, title, subtitle, onTerritoryPress }) {
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

      <View style={{ height: 330 }} />

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
        <TouchableOpacity
          key={`${territory.grid_lat}-${territory.grid_lng}`}
          activeOpacity={0.86}
          onPress={() => onTerritoryPress?.(territory)}
        >
          <Animated.View
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
        </TouchableOpacity>
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
              <TouchableOpacity
                key={`${territory.grid_lat}-${territory.grid_lng}`}
                activeOpacity={0.86}
                onPress={() => onTerritoryPress?.(territory)}
              >
                <Animated.View
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
              </TouchableOpacity>
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

function ZoneDetailSheet({
  zone,
  isLoading,
  onClose,
  onRunZone,
  bottomInset,
}) {
  if (!zone && !isLoading) return null;

  const statusColor =
    zone?.status === "under_threat"
      ? COLORS.orange
      : zone?.status === "yours"
        ? COLORS.accent
        : zone?.status === "rival"
          ? COLORS.red
          : COLORS.textSecondary;
  const title = zone?.label || "Loading zone";
  const strength = zone?.strength || 0;

  return (
    <View
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: bottomInset + 66,
        zIndex: 35,
      }}
    >
      <Animated.View
        entering={FadeInDown.duration(240)}
        style={{
          backgroundColor: "rgba(7,10,16,0.98)",
          borderRadius: 28,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.13)",
          padding: 16,
          overflow: "hidden",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.45,
          shadowRadius: 30,
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 18,
            right: 18,
            top: 0,
            height: 2,
            backgroundColor: statusColor,
          }}
        />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: statusColor,
                fontSize: 11,
                fontWeight: "900",
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              {zone?.status === "under_threat"
                ? "Under threat"
                : zone?.status === "yours"
                  ? "Your zone"
                  : zone?.status === "rival"
                    ? "Rival zone"
                    : "Neutral zone"}
            </Text>
            <Text
              style={{
                color: COLORS.white,
                fontSize: 22,
                fontWeight: "900",
                letterSpacing: -0.7,
                marginTop: 5,
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: COLORS.surface,
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        <View
          style={{
            marginTop: 14,
            minHeight: 92,
            borderRadius: 20,
            backgroundColor: "rgba(255,255,255,0.035)",
            borderWidth: 1,
            borderColor: COLORS.border,
            padding: 14,
          }}
        >
          {isLoading ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : (
            <>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: COLORS.textSecondary, fontSize: 13, fontWeight: "700" }}>
                  Owner
                </Text>
                <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: "800" }}>
                  {zone?.owner_username || "Open"}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: COLORS.textSecondary, fontSize: 13, fontWeight: "700" }}>
                  Strength
                </Text>
                <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: "800" }}>
                  {strength}/10 · {zone?.days_until_decay || 0}d to decay
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
                <View
                  style={{
                    height: "100%",
                    width: `${Math.max(8, strength * 10)}%`,
                    borderRadius: 4,
                    backgroundColor: statusColor,
                  }}
                />
              </View>
            </>
          )}
        </View>

        {!isLoading && zone?.closest_rival ? (
          <View
            style={{
              marginTop: 10,
              flexDirection: "row",
              alignItems: "center",
              borderRadius: 16,
              padding: 12,
              backgroundColor: "rgba(255,107,53,0.1)",
              borderWidth: 1,
              borderColor: COLORS.orangeDim,
            }}
          >
            <AlertTriangle size={16} color={COLORS.orange} />
            <Text
              style={{
                color: COLORS.textSecondary,
                fontSize: 12,
                fontWeight: "700",
                marginLeft: 8,
                flex: 1,
              }}
            >
              {zone.closest_rival.username} is {zone.lead_m}m behind this zone.
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={onRunZone}
          activeOpacity={0.86}
          style={{
            marginTop: 12,
            minHeight: 54,
            borderRadius: 17,
            backgroundColor: zone?.status === "rival" ? COLORS.orange : COLORS.accent,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
          }}
        >
          <Target size={19} color={COLORS.black} />
          <Text style={{ color: COLORS.black, fontSize: 16, fontWeight: "900" }}>
            Run Through This Zone
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function MapFilterSheet({
  visible,
  viewMode,
  overlayMode,
  onSetViewMode,
  onSetOverlayMode,
  onClose,
  bottomInset,
}) {
  if (!visible) return null;
  const views = [
    ["mine", "My zones"],
    ["friends", "Friends"],
    ["all", "All zones"],
  ];
  const overlays = [
    ["threat", "Threat level"],
    ["strength", "Zone strength"],
    ["activity", "Recent activity"],
  ];

  return (
    <View
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: bottomInset + 66,
        zIndex: 40,
      }}
    >
      <Animated.View
        entering={FadeInDown.duration(220)}
        style={{
          backgroundColor: "rgba(7,10,16,0.98)",
          borderRadius: 26,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.13)",
          padding: 16,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: COLORS.white, fontSize: 20, fontWeight: "900" }}>
            Map Filters
          </Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <X size={19} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text style={{ color: COLORS.textTertiary, fontSize: 11, fontWeight: "800", letterSpacing: 1.1, marginTop: 14 }}>
          VIEW
        </Text>
        <View style={{ gap: 8, marginTop: 8 }}>
          {views.map(([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => onSetViewMode(key)}
              style={{
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderWidth: 1,
                borderColor: viewMode === key ? COLORS.borderAccent : COLORS.border,
                backgroundColor: viewMode === key ? COLORS.accentMuted : COLORS.surface,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: "800" }}>
                {label}
              </Text>
              {viewMode === key ? <Shield size={16} color={COLORS.accent} /> : null}
            </TouchableOpacity>
          ))}
        </View>
        <Text style={{ color: COLORS.textTertiary, fontSize: 11, fontWeight: "800", letterSpacing: 1.1, marginTop: 16 }}>
          OVERLAY
        </Text>
        <View style={{ gap: 8, marginTop: 8 }}>
          {overlays.map(([key, label]) => (
            <TouchableOpacity
              key={key}
              onPress={() => onSetOverlayMode(key)}
              style={{
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderWidth: 1,
                borderColor: overlayMode === key ? COLORS.orangeDim : COLORS.border,
                backgroundColor: overlayMode === key ? "rgba(255,107,53,0.1)" : COLORS.surface,
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: "800" }}>
                {label}
              </Text>
              {overlayMode === key ? <Zap size={16} color={COLORS.orange} /> : null}
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

function CaptureToast({ event, bottomInset }) {
  if (!event) return null;
  const isRival = event.type === "capture";
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 18,
        right: 18,
        bottom: bottomInset + 375,
        zIndex: 34,
      }}
    >
      <Animated.View
        entering={FadeInDown.duration(180)}
        style={{
          borderRadius: 18,
          padding: 14,
          backgroundColor: isRival ? "rgba(255,107,53,0.18)" : "rgba(45,122,255,0.18)",
          borderWidth: 1,
          borderColor: isRival ? COLORS.orangeDim : COLORS.borderAccent,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Hexagon size={18} color={isRival ? COLORS.orange : COLORS.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.white, fontSize: 14, fontWeight: "900" }}>
            {event.message}
          </Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 11, fontWeight: "700", marginTop: 2 }}>
            Strength {event.strength}/10
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

function RunSummaryOverlay({ summary, onClose, bottomInset }) {
  if (!summary) return null;
  const territory = summary.territory_summary || {};
  const claimed = Number(territory.territories_claimed || 0);
  const captured = Number(territory.territories_captured || 0);
  const strengthened = Number(territory.territories_strengthened || 0);
  const tiles = summary.changed_tiles || [];
  const handleShare = async () => {
    await NativeShare.share({
      message: `DRUTA run: +${claimed} zones, ${Number(summary.distance_km || 0).toFixed(2)} km, ${captured} captured from rivals.`,
    }).catch(() => null);
  };

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 60,
        backgroundColor: "rgba(0,0,0,0.72)",
        justifyContent: "flex-end",
      }}
    >
      <Animated.View
        entering={FadeInDown.duration(260)}
        style={{
          marginHorizontal: 12,
          marginBottom: bottomInset + 68,
          backgroundColor: "rgba(7,10,16,0.99)",
          borderRadius: 30,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.13)",
          padding: 18,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: COLORS.textTertiary, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 }}>
            RUN COMPLETE
          </Text>
          <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
            <X size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
        <Text
          style={{
            color: claimed > 0 ? COLORS.accent : COLORS.white,
            fontSize: 48,
            lineHeight: 54,
            fontWeight: "900",
            letterSpacing: -2,
            marginTop: 4,
          }}
        >
          +{claimed} zones
        </Text>
        <Text style={{ color: COLORS.textSecondary, fontSize: 15, fontWeight: "700" }}>
          {captured} captured from rivals · {strengthened} reinforced
        </Text>

        <View
          style={{
            marginTop: 16,
            height: 112,
            borderRadius: 20,
            backgroundColor: "#03060C",
            borderWidth: 1,
            borderColor: COLORS.border,
            overflow: "hidden",
          }}
        >
          {Array.from({ length: 35 }).map((_, index) => {
            const active = tiles[index % Math.max(tiles.length, 1)] && index < Math.max(tiles.length * 2, 6);
            return (
              <View
                key={index}
                style={{
                  position: "absolute",
                  left: 18 + (index % 7) * 48,
                  top: 22 + Math.floor(index / 7) * 20,
                  width: 36,
                  height: 16,
                  borderRadius: 6,
                  backgroundColor: active
                    ? index % 5 === 0
                      ? COLORS.orange
                      : COLORS.accent
                    : "rgba(255,255,255,0.08)",
                  opacity: active ? 0.9 : 0.45,
                  transform: [{ rotate: "-35deg" }],
                }}
              />
            );
          })}
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
          <View style={{ flex: 1, backgroundColor: COLORS.surface, borderRadius: 15, padding: 12, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ color: COLORS.textTertiary, fontSize: 10, fontWeight: "900" }}>DISTANCE</Text>
            <Text style={{ color: COLORS.white, fontSize: 20, fontWeight: "900", marginTop: 3 }}>
              {Number(summary.distance_km || 0).toFixed(2)} km
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: COLORS.surface, borderRadius: 15, padding: 12, borderWidth: 1, borderColor: COLORS.border }}>
            <Text style={{ color: COLORS.textTertiary, fontSize: 10, fontWeight: "900" }}>TIME</Text>
            <Text style={{ color: COLORS.white, fontSize: 20, fontWeight: "900", marginTop: 3 }}>
              {formatDuration(summary.duration_seconds || 0)}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
          <TouchableOpacity
            onPress={onClose}
            style={{
              flex: 1,
              minHeight: 52,
              borderRadius: 16,
              backgroundColor: COLORS.accent,
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 8,
            }}
          >
            <Route size={18} color={COLORS.black} />
            <Text style={{ color: COLORS.black, fontSize: 15, fontWeight: "900" }}>
              View Full Map
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleShare}
            style={{
              width: 56,
              minHeight: 52,
              borderRadius: 16,
              backgroundColor: COLORS.surface,
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Share2 size={19} color={COLORS.white} />
          </TouchableOpacity>
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
    captureEvents,
    lastRunSummary,
    clearLastRunSummary,
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
  const [selectedTerritory, setSelectedTerritory] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState("all");
  const [overlayMode, setOverlayMode] = useState("threat");
  const [region, setRegion] = useState({
    latitude: 37.7599,
    longitude: -122.4148,
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

        const { status } = await Location.getForegroundPermissionsAsync();
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
  const visibleTerritories = useMemo(() => {
    if (viewMode === "mine") {
      return territories.filter((territory) => territory.owner_id === user?.id);
    }
    return territories;
  }, [territories, user?.id, viewMode]);
  const underThreatCount = useMemo(
    () =>
      myTerritories.filter((territory) => {
        const lastRunAt = Date.parse(territory.last_run_at || "");
        const ageDays = Number.isFinite(lastRunAt)
          ? (Date.now() - lastRunAt) / (24 * 60 * 60 * 1000)
          : 0;
        return (territory.strength || 0) <= 3 || ageDays >= 3;
      }).length,
    [myTerritories],
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

  const handleTerritoryPress = useCallback((territory) => {
    setSelectedTerritory(territory);
    setShowFilters(false);
  }, []);

  const { data: selectedZoneData, isLoading: isZoneLoading } = useQuery({
    queryKey: [
      "territory-detail",
      selectedTerritory?.grid_lat,
      selectedTerritory?.grid_lng,
    ],
    queryFn: async () => {
      const res = await fetch(
        `/api/territories/detail?gridLat=${selectedTerritory.grid_lat}&gridLng=${selectedTerritory.grid_lng}`,
      );
      if (!res.ok) throw new Error("Failed to fetch territory detail");
      return res.json();
    },
    enabled:
      selectedTerritory?.grid_lat !== undefined &&
      selectedTerritory?.grid_lng !== undefined,
  });

  const selectedZone = selectedZoneData?.zone || selectedTerritory;

  const runSelectedZone = useCallback(() => {
    setSelectedTerritory(null);
    startRun();
  }, [startRun]);

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
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() => {
              setShowFilters(true);
              setSelectedTerritory(null);
            }}
            activeOpacity={0.82}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: COLORS.surface,
              borderWidth: 1,
              borderColor: COLORS.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Filter size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor:
                underThreatCount > 0 ? "rgba(255,107,53,0.14)" : COLORS.surface,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 20,
              borderWidth: 1,
              borderColor:
                underThreatCount > 0 ? COLORS.orangeDim : COLORS.border,
            }}
          >
            <AlertTriangle
              size={13}
              color={underThreatCount > 0 ? COLORS.orange : COLORS.textTertiary}
            />
            <Text
              style={{
                color: COLORS.white,
                fontSize: 13,
                fontWeight: "700",
                marginLeft: 5,
              }}
            >
              {underThreatCount}
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
            territories={visibleTerritories}
            user={user}
            onMapReady={() => setMapReady(true)}
            onTerritoryPress={handleTerritoryPress}
            overlayMode={overlayMode}
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
            territories={visibleTerritories}
            user={user}
            location={location}
            onTerritoryPress={handleTerritoryPress}
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

      <CaptureToast
        event={captureEvents?.[0]}
        bottomInset={insets.bottom}
      />

      <ZoneDetailSheet
        zone={selectedZone}
        isLoading={isZoneLoading}
        onClose={() => setSelectedTerritory(null)}
        onRunZone={runSelectedZone}
        bottomInset={insets.bottom}
      />

      <MapFilterSheet
        visible={showFilters}
        viewMode={viewMode}
        overlayMode={overlayMode}
        onSetViewMode={setViewMode}
        onSetOverlayMode={setOverlayMode}
        onClose={() => setShowFilters(false)}
        bottomInset={insets.bottom}
      />

      <RunSummaryOverlay
        summary={lastRunSummary}
        onClose={clearLastRunSummary}
        bottomInset={insets.bottom}
      />
    </View>
  );
}
