import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "./src/lib/supabase";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import GlassProvider from "./src/components/GlassBackdrop";
import GlassTabBar from "./src/components/GlassTabBar";
import AuthStack from "./src/navigation/AuthStack";
import ChatScreen from "./src/screens/ChatScreen";
import WorkoutsScreen from "./src/screens/WorkoutsScreen";
import FoodLogScreen from "./src/screens/FoodLogScreen";
import AnalyticsScreen from "./src/screens/AnalyticsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

const Tab = createBottomTabNavigator();

function AppTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Chat"
      // The floating bar draws itself over the screen; safe-area insets are
      // handled inside GlassTabBar.
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "transparent" } }}
    >
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Workout" component={WorkoutsScreen} />
      <Tab.Screen name="Food" component={FoodLogScreen} />
      <Tab.Screen name="Analysis" component={AnalyticsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function AppInner() {
  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const { mode, colors } = useTheme();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const navTheme = {
    ...(mode === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(mode === "dark" ? DarkTheme.colors : DefaultTheme.colors),
      background: "transparent",
      card: "transparent",
    },
  };

  return (
    <GlassProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style={colors.statusBar} />
        {checkingSession ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : session ? (
          <AppTabs />
        ) : (
          <AuthStack />
        )}
      </NavigationContainer>
    </GlassProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
