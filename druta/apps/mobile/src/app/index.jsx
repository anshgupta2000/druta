import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View } from "react-native";

const ONBOARDING_KEY = "@druta:onboarding-complete";

export default function Index() {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((value) => {
        if (mounted) setTarget(value === "true" ? "/(tabs)" : "/onboarding");
      })
      .catch(() => {
        if (mounted) setTarget("/onboarding");
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!target) {
    return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  }

  return <Redirect href={target} />;
}
