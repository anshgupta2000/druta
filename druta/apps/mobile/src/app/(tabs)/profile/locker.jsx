import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  FlatList,
  Alert,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ChevronLeft, Check, Save, Shirt } from "lucide-react-native";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { COLORS } from "@/constants/theme";
import {
  CATEGORIES,
  LOCKER_ITEMS,
  getItemsByCategory,
  getItemById,
} from "@/constants/lockerCatalog";

const SCREEN_WIDTH = Dimensions.get("window").width;
const ITEM_CARD_WIDTH = (SCREEN_WIDTH - 24 * 2 - 12) / 2;

export default function LockerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);

  // Load current loadout from profile
  const { data: profileData } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const currentLoadout = profileData?.user?.outfit_loadout || {};

  // Track local equipped items
  const [localLoadout, setLocalLoadout] = useState(null);
  const equippedLoadout = localLoadout || currentLoadout;

  const saveLoadout = useMutation({
    mutationFn: async (loadout) => {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outfit_loadout: loadout }),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Loadout Saved! 🔥", "Your outfit has been updated.");
    },
    onError: () => {
      Alert.alert("Error", "Could not save loadout. Try again.");
    },
  });

  const filteredItems = useMemo(
    () => getItemsByCategory(activeCategory),
    [activeCategory],
  );

  const handleEquip = useCallback(
    (item, colorVariant) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newLoadout = { ...equippedLoadout };
      const catKey = item.category;
      // For accessories, maintain an array
      if (catKey === "accessories") {
        const currentAcc = newLoadout.accessories || [];
        const alreadyEquipped = currentAcc.find((a) => a.itemId === item.id);
        if (alreadyEquipped) {
          // Update color or remove
          newLoadout.accessories = currentAcc.map((a) =>
            a.itemId === item.id
              ? { itemId: item.id, colorId: colorVariant.id }
              : a,
          );
        } else {
          newLoadout.accessories = [
            ...currentAcc,
            { itemId: item.id, colorId: colorVariant.id },
          ];
        }
      } else {
        newLoadout[catKey] = {
          itemId: item.id,
          colorId: colorVariant.id,
        };
      }
      setLocalLoadout(newLoadout);
      setSelectedItem(null);
    },
    [equippedLoadout],
  );

  const handleUnequip = useCallback(
    (item) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const newLoadout = { ...equippedLoadout };
      if (item.category === "accessories") {
        newLoadout.accessories = (newLoadout.accessories || []).filter(
          (a) => a.itemId !== item.id,
        );
      } else {
        delete newLoadout[item.category];
      }
      setLocalLoadout(newLoadout);
    },
    [equippedLoadout],
  );

  const isEquipped = useCallback(
    (item) => {
      if (item.category === "accessories") {
        return (equippedLoadout.accessories || []).some(
          (a) => a.itemId === item.id,
        );
      }
      return equippedLoadout[item.category]?.itemId === item.id;
    },
    [equippedLoadout],
  );

  const getEquippedColor = useCallback(
    (item) => {
      if (item.category === "accessories") {
        const acc = (equippedLoadout.accessories || []).find(
          (a) => a.itemId === item.id,
        );
        return acc?.colorId || null;
      }
      const slot = equippedLoadout[item.category];
      if (slot?.itemId === item.id) return slot.colorId;
      return null;
    },
    [equippedLoadout],
  );

  const hasChanges = useMemo(() => {
    return (
      localLoadout !== null &&
      JSON.stringify(localLoadout) !== JSON.stringify(currentLoadout)
    );
  }, [localLoadout, currentLoadout]);

  const equippedCount = useMemo(() => {
    let count = 0;
    const lo = equippedLoadout;
    if (lo.hoodies) count++;
    if (lo.tops) count++;
    if (lo.bottoms) count++;
    if (lo.shoes) count++;
    if (lo.caps) count++;
    count += (lo.accessories || []).length;
    return count;
  }, [equippedLoadout]);

  const renderItem = useCallback(
    ({ item, index }) => {
      const equipped = isEquipped(item);
      const equippedColorId = getEquippedColor(item);
      const equippedColor = equippedColorId
        ? item.colors.find((c) => c.id === equippedColorId)
        : null;
      const isSelected = selectedItem?.id === item.id;

      return (
        <Animated.View
          entering={FadeInDown.delay(index * 20).duration(200)}
          style={{ width: ITEM_CARD_WIDTH, marginBottom: 12 }}
        >
          <TouchableOpacity
            onPress={() => {
              if (isSelected) {
                setSelectedItem(null);
              } else {
                setSelectedItem(item);
                setSelectedColorIndex(0);
              }
            }}
            activeOpacity={0.7}
            style={{
              backgroundColor: equipped
                ? COLORS.surfaceElevated
                : COLORS.surface,
              borderRadius: 20,
              padding: 16,
              borderWidth: 1,
              borderColor: equipped
                ? COLORS.borderAccent
                : isSelected
                  ? COLORS.borderLight
                  : COLORS.border,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Equipped badge */}
            {equipped && (
              <View
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: COLORS.accent,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Check size={12} color={COLORS.black} strokeWidth={3} />
              </View>
            )}

            {/* Item icon with color background */}
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                backgroundColor: equippedColor
                  ? equippedColor.hex + "22"
                  : COLORS.accentMuted,
                alignItems: "center",
                justifyContent: "center",
                alignSelf: "center",
                marginBottom: 12,
                borderWidth: equippedColor ? 2 : 0,
                borderColor: equippedColor
                  ? equippedColor.hex + "66"
                  : "transparent",
              }}
            >
              <Text style={{ fontSize: 28 }}>{item.icon}</Text>
            </View>

            {/* Item name */}
            <Text
              style={{
                color: COLORS.white,
                fontSize: 13,
                fontWeight: "700",
                textAlign: "center",
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
            >
              {item.name}
            </Text>

            {/* Color indicator */}
            {equippedColor && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 6,
                  gap: 4,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: equippedColor.hex,
                  }}
                />
                <Text
                  style={{
                    color: COLORS.textTertiary,
                    fontSize: 10,
                    fontWeight: "600",
                  }}
                >
                  {equippedColor.name}
                </Text>
              </View>
            )}

            {!equippedColor && (
              <Text
                style={{
                  color: COLORS.textDisabled,
                  fontSize: 10,
                  textAlign: "center",
                  marginTop: 6,
                  fontWeight: "600",
                }}
              >
                {item.colors.length} colors
              </Text>
            )}
          </TouchableOpacity>

          {/* Expanded color picker */}
          {isSelected && (
            <Animated.View
              entering={FadeIn.duration(150)}
              style={{
                backgroundColor: COLORS.surfaceElevated,
                borderRadius: 16,
                padding: 14,
                marginTop: 8,
                borderWidth: 1,
                borderColor: COLORS.borderLight,
              }}
            >
              {/* Color swatches */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0, marginBottom: 10 }}
              >
                {item.colors.map((color, ci) => {
                  const isActive = ci === selectedColorIndex;
                  return (
                    <TouchableOpacity
                      key={color.id}
                      onPress={() => setSelectedColorIndex(ci)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: color.hex,
                        marginRight: 6,
                        borderWidth: isActive ? 2 : 0,
                        borderColor: COLORS.white,
                        shadowColor: isActive ? color.hex : "transparent",
                        shadowOpacity: isActive ? 0.6 : 0,
                        shadowRadius: isActive ? 8 : 0,
                        shadowOffset: { width: 0, height: 0 },
                      }}
                    />
                  );
                })}
              </ScrollView>

              {/* Selected color name */}
              <Text
                style={{
                  color: COLORS.textSecondary,
                  fontSize: 11,
                  fontWeight: "600",
                  marginBottom: 10,
                }}
              >
                {item.colors[selectedColorIndex]?.name}
              </Text>

              {/* Equip / Unequip buttons */}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() =>
                    handleEquip(item, item.colors[selectedColorIndex])
                  }
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.accent,
                    paddingVertical: 10,
                    borderRadius: 12,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.black,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    Equip
                  </Text>
                </TouchableOpacity>
                {equipped && (
                  <TouchableOpacity
                    onPress={() => handleUnequip(item)}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 12,
                      backgroundColor: COLORS.surface,
                      borderWidth: 1,
                      borderColor: COLORS.border,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: COLORS.textSecondary,
                        fontSize: 13,
                        fontWeight: "600",
                      }}
                    >
                      Remove
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          )}
        </Animated.View>
      );
    },
    [
      selectedItem,
      selectedColorIndex,
      isEquipped,
      getEquippedColor,
      handleEquip,
      handleUnequip,
    ],
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.black }}>
      <StatusBar style="light" />

      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: 14,
          backgroundColor: COLORS.black,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
          >
            <ChevronLeft size={22} color={COLORS.accent} />
            <Text
              style={{ color: COLORS.accent, fontSize: 15, fontWeight: "600" }}
            >
              Profile
            </Text>
          </TouchableOpacity>

          <Text
            style={{
              color: COLORS.white,
              fontSize: 18,
              fontWeight: "800",
              letterSpacing: -0.5,
            }}
          >
            Locker
          </Text>

          <View
            style={{
              backgroundColor: COLORS.surfaceElevated,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Shirt size={12} color={COLORS.accent} />
            <Text
              style={{
                color: COLORS.textSecondary,
                fontSize: 11,
                fontWeight: "700",
              }}
            >
              {equippedCount}
            </Text>
          </View>
        </View>

        {/* Category tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginTop: 14 }}
          contentContainerStyle={{ gap: 6 }}
        >
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() => {
                  setActiveCategory(cat.id);
                  setSelectedItem(null);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: isActive ? COLORS.accentDim : COLORS.surface,
                  borderWidth: 1,
                  borderColor: isActive ? COLORS.borderAccent : COLORS.border,
                }}
              >
                <Text style={{ fontSize: 14 }}>{cat.icon}</Text>
                <Text
                  style={{
                    color: isActive ? COLORS.accent : COLORS.textSecondary,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Items grid */}
      <FlatList
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={{
          paddingHorizontal: 24,
          gap: 12,
        }}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: 120,
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* Save Loadout FAB */}
      {hasChanges && (
        <Animated.View
          entering={FadeInDown.duration(200)}
          style={{
            position: "absolute",
            bottom: insets.bottom + 80,
            left: 24,
            right: 24,
          }}
        >
          <TouchableOpacity
            onPress={() => saveLoadout.mutate(equippedLoadout)}
            disabled={saveLoadout.isPending}
            style={{
              backgroundColor: COLORS.accent,
              borderRadius: 18,
              paddingVertical: 16,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
              shadowColor: COLORS.accent,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.4,
              shadowRadius: 20,
            }}
          >
            <Save size={18} color={COLORS.black} />
            <Text
              style={{
                color: COLORS.black,
                fontSize: 16,
                fontWeight: "800",
              }}
            >
              {saveLoadout.isPending ? "Saving..." : "Save Loadout"}
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}
