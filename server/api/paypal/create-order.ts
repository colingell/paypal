// /server/api/paypal/create-order.post.ts
import {
    type H3Event,
    readBody,
    createError,
    defineEventHandler
} from 'h3';
import {
    ApiError,
    OrdersController,
    orders // Import the namespace
} from '@paypal/paypal-server-sdk';
// Assuming your client setup is in this utility file
import { getPaypalClient } from '~/server/utils/paypalClient';

interface CreateOrderRequestBody {
    amount: string;
    currency: string;
}

export default defineEventHandler(async (event: H3Event) => {
    console.log('--- API /api/paypal/create-order START ---');
    let currentStep = 'Initialization';

    try {
        // --- 1. Read and Validate Request Body ---
        currentStep = 'Reading Request Body';
        const body = await readBody<CreateOrderRequestBody>(event);
        console.log('Received body:', JSON.stringify(body, null, 2));
        const { amount, currency } = body;

        currentStep = 'Validating Input Data';
        if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
            throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid or missing amount.' });
        }
        if (!currency) {
            throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing currency code.' });
        }
        const formattedAmount = parseFloat(amount).toFixed(2);

        // --- 2. Prepare PayPal Order Request ---
        currentStep = 'Preparing PayPal Order Request';
        const paypalClient = getPaypalClient();
        const ordersController = new OrdersController(paypalClient);

        const requestBody: orders.OrderRequest = {
            intent: 'CAPTURE',
            purchaseUnits: [
                {
                    amount: {
                        currencyCode: currency.toUpperCase(),
                        value: formattedAmount,
                    },
                },
            ],
        };

        // Prepare the full request object
        const request = {
            body: requestBody,
            // No specific headers needed here, but pass the object structure
            headers: {
                'Content-Type': 'application/json', // Good practice to include
                'Prefer': 'return=representation'
            }
        };

        // --- 3. Call PayPal API ---
        currentStep = 'Calling PayPal API (Create Order)';
        console.log('PayPal createOrder Request Body:', JSON.stringify(request.body, null, 2));
        console.log('PayPal createOrder Request Headers:', JSON.stringify(request.headers, null, 2)); // Log headers too

        // *** FIX: Pass the entire 'request' object ***
        const { body: responseBodyString, ...httpResponse } = await ordersController.createOrder(request);
        const jsonResponse: orders.Order = JSON.parse(responseBodyString);

        console.log('PayPal createOrder HTTP Status Code:', httpResponse.statusCode);
        console.log('PayPal createOrder Response Body:', JSON.stringify(jsonResponse, null, 2));

        // --- 4. Process Response ---
        currentStep = 'Processing PayPal Response';
        if (httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 && jsonResponse.id) {
            console.log(`PayPal Order created successfully. Order ID: ${jsonResponse.id}, Status: ${jsonResponse.status}`);
            console.log('--- API /api/paypal/create-order END (Success) ---');
            return {
                orderID: jsonResponse.id
            };
        } else {
            const errorMessage = `PayPal order creation failed. Status: ${jsonResponse.status || 'Unknown'}.`;
            console.error(`!!! ${errorMessage}. Full Response:`, JSON.stringify(jsonResponse, null, 2));
            throw createError({
                statusCode: httpResponse.statusCode || 500,
                statusMessage: 'PayPal Error',
                message: jsonResponse.message || 'Failed to create PayPal order.',
                data: jsonResponse,
            });
        }

    } catch (error: any) {
        // --- 5. Catch All Errors ---
        // (Error handling remains the same)
        console.error(`!!! Uncaught API Error in /api/paypal/create-order at step: ${currentStep}`);
        console.error('Error Object:', error);
        if (error.stack) console.error('Error Stack:', error.stack);

        let statusCode = 500;
        let statusMessage = 'Internal Server Error';
        let message = 'An unexpected error occurred while creating the order.';
        let errorData: Record<string, any> = { error_step: currentStep };

        if (error instanceof ApiError) {
            statusCode = error.response?.statusCode || 500;
            statusMessage = 'PayPal API Error';
            message = error.response?.body?.message || error.message || 'Failed communicating with PayPal.';
            errorData.paypal_debug_id = error.response?.body?.debug_id;
            errorData.paypal_issue = error.response?.body?.details?.[0]?.issue;
        } else if (error.statusCode && error.statusMessage) { // H3Error
            statusCode = error.statusCode; statusMessage = error.statusMessage; message = error.message || statusMessage; errorData = { ...error.data, ...errorData };
        } else if (error instanceof Error) { // Standard JS Error
             statusCode = 400; statusMessage = 'Bad Request'; message = error.message;
        }

        console.error(`Error Response Prepared: statusCode=${statusCode}, statusMessage='${statusMessage}', message='${message}'`);
        throw createError({ statusCode, statusMessage, message, data: errorData });
    }
});
