// nuxt.config.ts
export default defineNuxtConfig({
  devtools: { enabled: true },

  // Make environment variables available on the server side
  runtimeConfig: {
    // Private keys are only available on the server
    private: {
      PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
      PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
      PAYPAL_ENVIRONMENT: process.env.PAYPAL_ENVIRONMENT || 'sandbox',
    },
    public: {
      paypalClientId: process.env.PAYPAL_CLIENT_ID || '', // Ensure it has a value or default
    },
  },

  // Optional: Enable SSR (needed for server routes)
  ssr: true,
  // IMPORTANT ** The below is required to use PayPal's JS SDK card fields for PCI compliance **
  app: {
    head: {
      script: [
        {
          src: `https://www.paypal.com/sdk/js?client-id=`+process.env.PAYPAL_CLIENT_ID+`&components=card-fields&currency=GBP`, // Replace with your Client ID and currency
          async: true,
        },
      ],
    },
  },

  compatibilityDate: '2025-04-22',
})