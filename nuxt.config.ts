// nuxt.config.ts
export default defineNuxtConfig({
  devtools: { enabled: true },

  // Make environment variables available on the server side
  runtimeConfig: {
    // Private keys are only available on the server
    private: {
      PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
      PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
      PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT || 'sandbox', // Default to sandbox
    },
    // Public keys are exposed to the client side (we don't need any for this example)
    public: {},
  },

  // Optional: Enable SSR (needed for server routes)
  ssr: true,

  compatibilityDate: '2025-04-17',
})