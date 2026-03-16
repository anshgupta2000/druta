import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { X, Check } from "lucide-react-native";
import { COLORS } from "@/constants/theme";

const METAPERSON_MOBILE_URL =
  "https://mobile.metaperson.avatarsdk.com/generator";

export default function AvatarCreatorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const webViewRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [creatorReady, setCreatorReady] = useState(false);
  const [exportedData, setExportedData] = useState(null);

  const saveAvatar = useMutation({
    mutationFn: async (data) => {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save avatar");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Avatar Created! 🎉",
        "Your avatar looks amazing! Head to the Locker to customize your outfit.",
        [
          {
            text: "Open Locker",
            onPress: () => {
              router.replace("/(tabs)/profile/locker");
            },
          },
          {
            text: "Done",
            onPress: () => router.back(),
          },
        ],
      );
    },
    onError: () => {
      Alert.alert("Error", "Could not save your avatar. Try again.");
    },
  });

  const handleMessage = useCallback(
    (event) => {
      try {
        let data = event.nativeEvent.data;
        if (typeof data === "string") {
          data = JSON.parse(data);
        }

        const eventName = data.eventName || data.event || data.type;

        if (eventName === "metaperson_creator_loaded") {
          setCreatorReady(true);

          // Send configuration after creator loads
          // Auth params — user needs to set METAPERSON_CLIENT_ID and METAPERSON_CLIENT_SECRET env vars
          const clientId = data.clientId || "";
          const clientSecret = data.clientSecret || "";

          if (process.env.EXPO_PUBLIC_METAPERSON_CLIENT_ID) {
            const authMsg = JSON.stringify({
              eventName: "authenticate",
              clientId: process.env.EXPO_PUBLIC_METAPERSON_CLIENT_ID,
              clientSecret:
                process.env.EXPO_PUBLIC_METAPERSON_CLIENT_SECRET || "",
            });
            webViewRef.current?.postMessage(authMsg);
          }

          // Set export parameters
          const exportParams = JSON.stringify({
            eventName: "set_export_parameters",
            format: "glb",
            lod: 2,
            textureProfile: "1K.jpg",
            useZip: false,
          });
          webViewRef.current?.postMessage(exportParams);

          // Set UI parameters
          const uiParams = JSON.stringify({
            eventName: "set_ui_parameters",
            isExportButtonVisible: true,
            isLoginButtonVisible: false,
          });
          webViewRef.current?.postMessage(uiParams);
        }

        if (eventName === "model_exported" || eventName === "avatar_exported") {
          const avatarUrl = data.url || data.modelUrl || data.avatarUrl || "";
          const avatarCode =
            data.code || data.avatarCode || data.avatarId || "";
          const thumbnailUrl = data.thumbnailUrl || data.previewUrl || "";

          setExportedData({
            avatar_url: avatarUrl,
            avatar_code: avatarCode,
            avatar_thumbnail_url: thumbnailUrl,
          });

          saveAvatar.mutate({
            avatar_url: avatarUrl,
            avatar_code: avatarCode,
            avatar_thumbnail_url: thumbnailUrl,
          });
        }
      } catch (err) {
        // Non-JSON messages from the webview — ignore
      }
    },
    [saveAvatar],
  );

  const injectedJs = `
    (function() {
      window.addEventListener('message', function(evt) {
        if (evt.data && typeof evt.data === 'object') {
          window.ReactNativeWebView.postMessage(JSON.stringify(evt.data));
        }
      });
      // For the mobile creator that might use postMessage differently
      var origPostMessage = window.postMessage;
      window.postMessage = function(data, origin) {
        if (data && typeof data === 'object') {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify(data));
          } catch(e) {}
        }
        return origPostMessage.call(window, data, origin);
      };
      true;
    })();
  `;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.black }}>
      <StatusBar style="light" />

      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: COLORS.black,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: COLORS.surface,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <X size={20} color={COLORS.white} />
        </TouchableOpacity>

        <Text
          style={{
            color: COLORS.white,
            fontSize: 16,
            fontWeight: "700",
            letterSpacing: -0.3,
          }}
        >
          Create Avatar
        </Text>

        <View style={{ width: 40 }} />
      </View>

      {/* WebView */}
      <View style={{ flex: 1, position: "relative" }}>
        {isLoading && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: COLORS.black,
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}
          >
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: COLORS.surface,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ fontSize: 32 }}>🧑‍🎨</Text>
            </View>
            <Text
              style={{
                color: COLORS.white,
                fontSize: 18,
                fontWeight: "700",
                marginBottom: 8,
              }}
            >
              Loading Creator...
            </Text>
            <Text
              style={{
                color: COLORS.textTertiary,
                fontSize: 13,
                textAlign: "center",
                paddingHorizontal: 40,
                lineHeight: 20,
              }}
            >
              Design your unique avatar with MetaPerson
            </Text>
            <ActivityIndicator
              color={COLORS.accent}
              style={{ marginTop: 24 }}
              size="large"
            />
          </View>
        )}

        <WebView
          ref={webViewRef}
          source={{ uri: METAPERSON_MOBILE_URL }}
          style={{ flex: 1, backgroundColor: COLORS.black }}
          injectedJavaScript={injectedJs}
          onMessage={handleMessage}
          onLoadEnd={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            Alert.alert(
              "Connection Error",
              "Could not load the avatar creator. Check your internet connection.",
              [{ text: "Go Back", onPress: () => router.back() }],
            );
          }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          startInLoadingState={false}
          scalesPageToFit={true}
        />
      </View>

      {/* Saving overlay */}
      {saveAvatar.isPending && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.8)",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <ActivityIndicator color={COLORS.accent} size="large" />
          <Text
            style={{
              color: COLORS.white,
              fontSize: 16,
              fontWeight: "600",
              marginTop: 16,
            }}
          >
            Saving your avatar...
          </Text>
        </View>
      )}
    </View>
  );
}
