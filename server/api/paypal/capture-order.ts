// /server/api/paypal/capture-order.post.ts
import {
    type H3Event,
    readBody,
    createError,
    defineEventHandler,
    // $fetch // ofetch is usually global
} from 'h3';
// Only need ApiError for potential error checking, orders for typing response
import { ApiError, orders } from '@paypal/paypal-server-sdk';
import { ofetch } from 'ofetch';
import { v4 as uuidv4 } from 'uuid';
// We don't need getPaypalClient anymore for this approach

interface CaptureOrderRequestBody {
    orderID: string;
}

// Helper to get the base URL based on environment
function getPayPalApiBaseUrl(environment: string | undefined): string {
    const envString = environment?.toLowerCase().trim();
    return envString === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com'; // Default to sandbox
}

// Helper function to manually fetch PayPal OAuth2 Token
async function getPayPalAccessToken(config: any, paypalApiBaseUrl: string): Promise<string> {
    const clientId = config.private.PAYPAL_CLIENT_ID;
    const clientSecret = config.private.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("PayPal client credentials are not configured correctly.");
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenUrl = `${paypalApiBaseUrl}/v1/oauth2/token`;

    console.log(`[Token Fetch] Requesting token from ${tokenUrl}`);
    try {
        const response = await ofetch.raw(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${credentials}`,
            },
            body: 'grant_type=client_credentials',
        });

        if (response._data?.access_token) {
            console.log('[Token Fetch] Successfully obtained access token.');
            return response._data.access_token;
        } else {
            console.error('[Token Fetch] Failed: No access_token in response body.', response._data);
            throw new Error('Failed to obtain access token from PayPal.');
        }
    } catch (error: any) {
        console.error('[Token Fetch] Error fetching access token:', error.response?._data || error.message);
        throw new Error(`Failed to fetch PayPal access token: ${error.message}`);
    }
}


export default defineEventHandler(async (event: H3Event) => {
    console.log('--- API /api/paypal/capture-order START (using ofetch + manual token) ---');
    let currentStep = 'Initialization';

    try {
        // --- 1. Read and Validate Request Body ---
        currentStep = 'Reading Request Body';
        const body = await readBody<CaptureOrderRequestBody>(event);
        console.log('Received body:', JSON.stringify(body, null, 2));
        const { orderID } = body;

        currentStep = 'Validating Input Data';
        if (!orderID) {
            throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing orderID.' });
        }

        // --- 2. Get Config and Base URL ---
        currentStep = 'Getting Config';
        const config = useRuntimeConfig();
        const paypalApiBaseUrl = getPayPalApiBaseUrl(config.private.PAYPAL_ENVIRONMENT);

        // --- 3. Manually Fetch Access Token ---
        currentStep = 'Fetching Access Token';
        let accessToken = '';
        try {
            accessToken = await getPayPalAccessToken(config, paypalApiBaseUrl);
        } catch (tokenError: any) {
            console.error('!!! Error getting PayPal Access Token:', tokenError);
            // Use createError to send proper response
            throw createError({ statusCode: 500, statusMessage: 'Authentication Error', message: tokenError.message || 'Failed to get PayPal authentication token.' });
        }

        // --- 4. Prepare Manual HTTP Request for Capture ---
        currentStep = 'Preparing Manual HTTP Request';
        const captureUrl = `${paypalApiBaseUrl}/v2/checkout/orders/${orderID}/capture`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`, // Use the fetched token
            'PayPal-Request-Id': uuidv4(), // Idempotency key
            'Prefer': 'return=representation',
        };
        const requestBody = {}; // Capture body is empty

        // --- 5. Call PayPal API using ofetch ---
        currentStep = 'Calling PayPal API via ofetch (Capture Order)';
        console.log(`Attempting to capture PayPal Order ID: ${orderID} via ofetch`);
        console.log('ofetch Request URL:', captureUrl);
        console.log('ofetch Request Headers:', JSON.stringify(headers, null, 2));

        let response: any;
        let httpStatusCode: number;
        let jsonResponse: orders.Order; // Use SDK type for response structure

        try {
            const rawResponse = await ofetch.raw(captureUrl, {
                method: 'POST',
                headers: headers,
                body: requestBody,
            });
            httpStatusCode = rawResponse.status;
            jsonResponse = rawResponse._data; // Parsed JSON body

            console.log('ofetch captureOrder HTTP Status Code:', httpStatusCode);
            console.log('ofetch captureOrder Response Body:', JSON.stringify(jsonResponse, null, 2));

        } catch (fetchError: any) {
             console.error('!!! ofetch request failed:', fetchError);
             httpStatusCode = fetchError.response?.status || 500;
             const errorBody = fetchError.response?._data || {};
             console.error('ofetch error response body:', errorBody);

             throw createError({
                 statusCode: httpStatusCode,
                 statusMessage: errorBody?.message || fetchError.message || 'PayPal API request failed',
                 message: errorBody?.details?.[0]?.description || errorBody?.message || 'Failed to capture payment via PayPal.',
                 data: {
                     error_step: currentStep,
                     paypal_debug_id: errorBody?.debug_id,
                     paypal_issue: errorBody?.details?.[0]?.issue,
                     raw_error: fetchError.message
                 }
             });
        }

        // --- 6. Process Successful Response ---
        currentStep = 'Processing PayPal Capture Response';
        const capture = jsonResponse?.purchaseUnits?.[0]?.payments?.captures?.[0];

        if (httpStatusCode >= 200 && httpStatusCode < 300 && jsonResponse?.status === 'COMPLETED' && capture?.status === 'COMPLETED') {
            console.log(`PayPal capture successful for Order ID: ${orderID}. Capture ID: ${capture.id}, Status: ${jsonResponse.status}`);
            console.log('--- API /api/paypal/capture-order END (Success) ---');
            return {
                success: true,
                message: 'Payment captured successfully!',
                data: {
                    paypalOrderId: jsonResponse.id,
                    paypalCaptureId: capture.id,
                    status: jsonResponse.status,
                    payer: jsonResponse.payer,
                }
            };
        } else {
            // Handle non-COMPLETED status
            const errorMessage = `PayPal capture status not COMPLETED for Order ID: ${orderID}. Status: ${jsonResponse?.status || 'Unknown'}. Capture Status: ${capture?.status || 'N/A'}`;
            console.error(`!!! ${errorMessage}. Full Response:`, JSON.stringify(jsonResponse, null, 2));
            let userMessage = 'Payment capture failed or is pending.';
            const issue = jsonResponse?.details?.[0]?.issue || capture?.status;
             if (issue === 'ORDER_ALREADY_CAPTURED') userMessage = 'This order has already been captured.';
             else if (issue === 'INSTRUMENT_DECLINED') userMessage = 'The payment was declined by the bank during capture.';
             else if (capture?.status === 'PENDING') userMessage = 'Payment capture is pending. Please check your PayPal account.';

            throw createError({
                statusCode: 400,
                statusMessage: 'Capture Not Completed',
                message: userMessage,
                data: {
                    error_step: currentStep,
                    paypal_order_id: jsonResponse?.id,
                    paypal_status: jsonResponse?.status,
                    paypal_capture_status: capture?.status,
                    paypal_debug_id: jsonResponse?.debug_id,
                    paypal_issue: issue,
                },
            });
        }

    } catch (error: any) {
        // --- 7. Catch All Errors ---
        console.error(`!!! Uncaught API Error in /api/paypal/capture-order at step: ${currentStep}`);
        if (!error.statusCode) {
             console.error('Error Object:', error);
             if (error.stack) console.error('Error Stack:', error.stack);
        }

        if (!error.statusCode) {
            console.error(`Error Response Prepared: statusCode=500, statusMessage='Internal Server Error', message='An unexpected error occurred.'`);
            throw createError({
                 statusCode: 500,
                 statusMessage: 'Internal Server Error',
                 message: error.message || 'An unexpected error occurred while capturing the payment.',
                 data: { error_step: currentStep }
            });
        } else {
             console.error(`Error Response Prepared: statusCode=${error.statusCode}, statusMessage='${error.statusMessage}', message='${error.message}'`);
             throw error;
        }
    }
});