import { Redirect } from "expo-router";
import { useAuthStore } from "@/store/useAuthStore";
import { Loading } from "@/components/ui/Loading";
import { Screen } from "@/components/ui/Screen";

/**
 * Root index — bounces the user to the right group based on
 * auth state. Lives outside the (auth) and (main) groups so
 * we don't get an intermediate "blank" screen on cold start.
 */
export default function Index() {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (isAuthenticated) return <Redirect href="/(main)/(tabs)" />;
  return <Redirect href="/(auth)/login" />;
}
