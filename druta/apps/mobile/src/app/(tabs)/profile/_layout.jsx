import { Stack } from "expo-router";

export default function ProfileLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="avatar-creator" />
      <Stack.Screen name="locker" />
    </Stack>
  );
}
