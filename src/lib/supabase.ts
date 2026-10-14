import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY — check your .env file."
  );
}

// NOTE: no `storage` adapter here on purpose. @react-native-async-storage's
// native module wasn't linking correctly inside Expo Go (a known limitation
// with precompiled Expo Go + custom native modules). Without it, Supabase
// just keeps the session in memory — you'll need to log in again after a
// full reload, but nothing crashes. Once we move to a real dev client / EAS
// build, add AsyncStorage back in for persisted sessions.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
