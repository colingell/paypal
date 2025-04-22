// server/utils/paypalClient.ts
import { Client, Environment, LogLevel } from '@paypal/paypal-server-sdk';

let paypalClientInstance: Client | null = null;

export function getPaypalClient(): Client { 
  
  if (paypalClientInstance) {
    return paypalClientInstance;
  }

  const config = useRuntimeConfig();

  // --- START: Debugging PayPal Environment Config ---
  console.log('[PayPal Client Init] Reading Runtime Config...');
  console.log(`[PayPal Client Init] PAYPAL_ENVIRONMENT value: "${config.private.PAYPAL_ENVIRONMENT}" (Type: ${typeof config.private.PAYPAL_ENVIRONMENT})`);
  console.log(`[PayPal Client Init] PAYPAL_CLIENT_ID is set: ${!!config.private.PAYPAL_CLIENT_ID}`);
  console.log(`[PayPal Client Init] PAYPAL_CLIENT_SECRET is set: ${!!config.private.PAYPAL_CLIENT_SECRET}`);
  // --- END: Debugging ---

  const environmentString = config.private.PAYPAL_ENVIRONMENT?.toLowerCase().trim();
  let paypalEnv: Environment;

  if (environmentString === 'live') {
    console.log('[PayPal Client Init] Setting environment to LIVE.');
    paypalEnv = Environment.Live;
  } else if (environmentString === 'sandbox') {
    console.log('[PayPal Client Init] Setting environment to SANDBOX.');
    paypalEnv = Environment.Sandbox;
  } else {
    console.error(`!!! [PayPal Client Init] CRITICAL ERROR: Invalid or missing PAYPAL_ENVIRONMENT value: "${config.private.PAYPAL_ENVIRONMENT}". Defaulting to Sandbox.`);
    paypalEnv = Environment.Sandbox; // Default fallback
  }

  if (!config.private.PAYPAL_CLIENT_ID || !config.private.PAYPAL_CLIENT_SECRET) {
     console.error("!!! [PayPal Client Init] CRITICAL ERROR: PayPal Client ID or Secret is missing!");
     // In a real app, you might throw an error here to prevent startup
     // throw new Error("PayPal credentials are not configured.");
  }

  paypalClientInstance = new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: config.private.PAYPAL_CLIENT_ID!, // Use non-null assertion or add checks
      oAuthClientSecret: config.private.PAYPAL_CLIENT_SECRET!,
    },
    timeout: 30000, // Set a reasonable timeout (e.g., 30 seconds)
    environment: paypalEnv,
    logging: {
      logLevel: LogLevel.Info, // Use Debug for more verbose logs
      logRequest: { logBody: true },
      logResponse: { logHeaders: true, logBody: true },
    },
  });

  return paypalClientInstance;
}
