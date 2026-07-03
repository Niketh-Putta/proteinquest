/** @type {import('expo/config').ExpoConfig} */
// Bake public env into web/native builds so Vercel/CI never ship empty Supabase config.
export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY,
  },
});
