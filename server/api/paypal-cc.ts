// server/api/paypal-cc.post.ts
import {
  type H3Event,
  readBody,
  createError,
  defineEventHandler
} from 'h3';
import {
  ApiError,
  OrdersController,
  orders
} from '@paypal/paypal-server-sdk';
import { v4 as uuidv4 } from 'uuid';
// Assuming your client setup is in this utility file
import { getPaypalClient } from '~/server/utils/paypalClient';

// --- Type Definitions (Matching app.vue) ---
interface CartData {
  totalAmount: string;
  currencyCode: string;
}
interface CustomerData {
  firstName: string;
  lastName: string;
  email: string;
  address1: string;
  // address2?: string; // Optional if you add it to app.vue
  city: string;
  // state?: string; // Optional if you add it to app.vue
  postcode: string;
  countryCode: string; // 2-letter ISO code
}
interface CardDetailsData {
  cardNumber: string;
  expiry: string; // Expected format: MM/YY or MM/YYYY
  cvv: string;
}
// Body structure expected from app.vue
interface RequestBodyData {
  cart: CartData;
  customer: CustomerData;
  cardDetails: CardDetailsData;
}
// Structure for successful PayPal result internal processing
interface PaypalOrderResult {
  jsonResponse: orders.Order;
  httpStatusCode: number;
  paypalOrderId: string;
  paypalCaptureId?: string;
  status: orders.OrderStatus;
}

// --- PayPal Order Creation Logic (Simplified for direct data) ---

/**
* Creates and captures a PayPal order using direct card details.
*/
const createAndCapturePaypalOrderWithCard = async (
  cart: CartData,
  customer: CustomerData,
  cardDetails: CardDetailsData,
): Promise<PaypalOrderResult> => {
  console.log(`--- Preparing Minimal PayPal CC Order ---`);
  const paypalClient = getPaypalClient(); // Get configured client
  const ordersController = new OrdersController(paypalClient);

  // --- 1. Format Amount ---
  const calculatedAmountValue = parseFloat(cart.totalAmount).toFixed(2);
  const currencyCode = cart.currencyCode;

  if (isNaN(parseFloat(calculatedAmountValue)) || parseFloat(calculatedAmountValue) <= 0) {
      console.error(`!!! Invalid amount format or value: '${cart.totalAmount}'`);
      throw new Error('Invalid cart total amount.');
  }
  console.log('Payment Details:', { grandTotal: calculatedAmountValue, currency: currencyCode });

  // --- 2. Construct Purchase Units (Simple) ---
  const purchaseUnits: orders.PurchaseUnitRequest[] = [
      {
          amount: {
              currencyCode: currencyCode,
              value: calculatedAmountValue,
              // No breakdown needed for this simple structure
          },
          // No items needed for this simple structure
      },
  ];

  // --- 3. Format Expiry Date ---
  const expiryFormatted = cardDetails.expiry.replace(/\s|\//g, '');
  let paypalExpiry = '';
  if (expiryFormatted && (expiryFormatted.length === 4 || expiryFormatted.length === 6)) {
      const expiryMonth = expiryFormatted.substring(0, 2);
      const yearPart = expiryFormatted.substring(2);
      const expiryYear = yearPart.length === 2 ? `20${yearPart}` : yearPart;
      paypalExpiry = `${expiryYear}-${expiryMonth}`;
      console.log(`Parsed expiry: Input='${cardDetails.expiry}', PayPalFormat='${paypalExpiry}'`);
  } else {
      console.error(`!!! Invalid expiry format: '${cardDetails.expiry}'`);
      throw new Error('Invalid card expiry date format. Use MM/YY or MM/YYYY.');
  }

  // --- 4. Construct Payment Source (Direct Card) ---
  const paymentSource: orders.PaymentSource = {
      card: {
          number: String(cardDetails.cardNumber).replace(/\s/g, ''),
          expiry: paypalExpiry,
          securityCode: String(cardDetails.cvv),
          name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
          billingAddress: {
              addressLine1: customer.address1 || '',
              // addressLine2: customer.address2 || undefined, // Add if needed
              adminArea2: customer.city || '', // City
              // adminArea1: customer.state || undefined, // State/Province
              postalCode: customer.postcode || '',
              countryCode: customer.countryCode || '', // MUST be 2-letter ISO code
          },
      },
  };

  // --- 5. Construct Payer Information ---
  const payer: orders.Payer = {
      name: {
          givenName: customer.firstName || '',
          surname: customer.lastName || '',
      },
      emailAddress: customer.email || '',
  };

  // --- 6. Build the Request Object ---
  const requestBody: orders.OrderRequest = {
      intent: 'CAPTURE',
      payer: payer,
      paymentSource: paymentSource,
      purchaseUnits: purchaseUnits,
  };

  // --- 7. Prepare Full Request with Headers (Including PayPal-Request-Id) ---
  const request = {
      headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
          'paypal-request-id': uuidv4(), // Crucial for payment_source + create
      },
      body: requestBody,
  };

  // --- 8. Execute the API Call ---
  try {
      console.log('PayPal createOrder (CC) Request Body:', JSON.stringify(request.body, null, 2));
      console.log('PayPal createOrder (CC) Request Headers:', JSON.stringify(request.headers, null, 2));

      const { body: responseBodyString, ...httpResponse } = await ordersController.createOrder(request);
      const jsonResponse: orders.Order = JSON.parse(responseBodyString);

      console.log('PayPal createOrder (CC) HTTP Status Code:', httpResponse.statusCode);
      console.log('PayPal createOrder (CC) Response Body:', JSON.stringify(jsonResponse, null, 2));

      // --- 9. Return Structured Result ---
      return {
          jsonResponse: jsonResponse,
          httpStatusCode: httpResponse.statusCode,
          paypalOrderId: jsonResponse.id,
          paypalCaptureId: jsonResponse.purchaseUnits?.[0]?.payments?.captures?.[0]?.id,
          status: jsonResponse.status as orders.OrderStatus,
      };
  } catch (error: any) {
      console.error(`!!! PayPal SDK Error during createOrder (CC):`);
      if (error instanceof ApiError) {
          console.error('PayPal ApiError Details:', JSON.stringify(error.response?.body || error.message, null, 2));
      } else {
          console.error('Non-ApiError:', error);
      }
      throw error; // Re-throw for main handler
  }
};

// --- Main Event Handler ---
export default defineEventHandler(async (event: H3Event) => {
  console.log('--- API /api/paypal-cc START ---'); // Updated path in log
  let currentStep = 'Initialization';

  // No method check needed due to .post.ts filename convention

  try {
      // --- 1. Read and Validate Request Body ---
      currentStep = 'Reading Request Body';
      const body = await readBody<RequestBodyData>(event);
      console.log('Received body:', JSON.stringify(body, null, 2));
      const { cart, customer, cardDetails } = body;

      currentStep = 'Validating Input Data';
      if (!cart || !customer || !cardDetails) {
          throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing cart, customer, or cardDetails in request body.' });
      }
      if (!cardDetails.cardNumber || !cardDetails.expiry || !cardDetails.cvv) {
          throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing required card details (number, expiry, CVV).' });
      }
      if (!customer.countryCode || customer.countryCode.length !== 2) {
          throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid or missing billing country code (must be 2-letter ISO).' });
      }
      if (!customer.email || !customer.firstName || !customer.lastName || !customer.address1 || !customer.city || !customer.postcode) {
          throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing required customer billing details.' });
      }
      if (!cart.totalAmount || isNaN(parseFloat(cart.totalAmount)) || parseFloat(cart.totalAmount) <= 0) {
          throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid or missing cart totalAmount.' });
      }
      if (!cart.currencyCode) {
           throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Missing cart currencyCode.' });
      }

      // --- 2. Call PayPal Service ---
      currentStep = 'Calling PayPal API (Create/Capture)';
      const paypalResult = await createAndCapturePaypalOrderWithCard(cart, customer, cardDetails);

      // --- 3. Process PayPal Response ---
      currentStep = 'Processing PayPal Response';
      if (paypalResult.httpStatusCode >= 200 && paypalResult.httpStatusCode < 300 && paypalResult.status === 'COMPLETED') {
          // --- SUCCESS ---
          console.log(`PayPal payment successful. PayPal Order ID: ${paypalResult.paypalOrderId}, Status: ${paypalResult.status}`);
          console.log('--- API /api/paypal-cc END (Success) ---');
          console.log('--- RETURNING SUCCESS JSON ---');

          // Return success payload matching app.vue expectations
          return {
              success: true,
              message: 'Payment successful!', // Simple success message
              data: { // Include relevant PayPal details in 'data'
                  paypalOrderId: paypalResult.paypalOrderId,
                  paypalCaptureId: paypalResult.paypalCaptureId,
                  status: paypalResult.status,
                  // Optionally include more details if needed by frontend
                  // fullResponse: process.env.NODE_ENV === 'development' ? paypalResult.jsonResponse : undefined
              }
          };
      } else {
          // --- PAYPAL FAILURE (Non-COMPLETED Status) ---
          currentStep = 'Handling PayPal Payment Failure (Non-COMPLETED Status)';
          const errorMessage = `PayPal payment status was not COMPLETED. Status: ${paypalResult.status || 'Unknown'}.`;
          console.error(`!!! ${errorMessage}. Full Response:`, JSON.stringify(paypalResult.jsonResponse, null, 2));

          let detailedMessage = 'Payment failed. Please check details or try again.';
          const ppDetails = paypalResult.jsonResponse?.details;
          const ppMessage = paypalResult.jsonResponse?.message;
          if (ppDetails && Array.isArray(ppDetails) && ppDetails.length > 0) {
              const issue = ppDetails[0].issue || 'UNKNOWN_ISSUE';
              const description = ppDetails[0].description || 'No description provided.';
              detailedMessage = `${description} (Issue: ${issue})`;
              if (issue === 'INSTRUMENT_DECLINED') detailedMessage = 'Your card was declined by the bank.';
              // Add other specific issue mappings if needed...
          } else if (ppMessage) {
              detailedMessage = ppMessage;
          }

          throw createError({
              statusCode: 400, // Treat as Bad Request from client perspective
              statusMessage: 'Payment Failed', // General status for frontend
              message: detailedMessage, // Specific user message
              data: {
                  error_step: currentStep,
                  paypal_order_id: paypalResult.paypalOrderId,
                  paypal_status: paypalResult.status,
                  paypal_debug_id: paypalResult.jsonResponse?.debug_id,
                  paypal_issue: ppDetails?.[0]?.issue,
              }
          });
      }

  } catch (error: any) {
      // --- 4. Catch All Errors (Validation, PayPal SDK, Internal) ---
      console.error(`!!! Uncaught API Error in /api/paypal-cc at step: ${currentStep}`);
      console.error('Error Object:', error);
      if (error.stack) console.error('Error Stack:', error.stack);

      // Default error details
      let statusCode = 500;
      let statusMessage = 'Internal Server Error';
      let message = 'An unexpected error occurred while processing the payment.';
      let errorData: Record<string, any> = { error_step: currentStep };

      // Handle specific error types (ApiError, H3Error, generic Error)
      if (error instanceof ApiError) {
          statusCode = error.response?.statusCode || 400;
          statusMessage = 'Payment Processing Error';
          message = 'Payment processing failed.'; // Default for ApiError
          const ppBody = error.response?.body;
          const details = ppBody?.details;
          const ppMessage = ppBody?.message;
          // Extract user-friendly message based on issue code
          if (details && Array.isArray(details) && details.length > 0) {
              const issue = details[0].issue; const description = details[0].description;
              if (issue === 'INSTRUMENT_DECLINED') message = 'Your card was declined by the bank.';
              else if (issue === 'CREDIT_CARD_CVV_CHECK_FAILED' || issue === 'INVALID_SECURITY_CODE') message = 'Invalid security code (CVV).';
              else if (issue === 'CREDIT_CARD_REFUSED') message = 'Card refused. Try another card or contact your bank.';
              else if (issue === 'EXPIRED_CARD') message = 'Card has expired.';
              else if (issue === 'INVALID_ACCOUNT_NUMBER') message = 'Invalid card number.';
              else if (issue === 'DUPLICATE_REQUEST_ID') message = 'Duplicate transaction attempt. Please wait and try again if necessary.';
              // Add more specific mappings...
              else if (description) message = description; else if (issue) message = `Payment error: ${issue}`;
          } else if (ppMessage) { message = ppMessage; } else { message = error.message || message; }
          errorData.paypal_debug_id = ppBody?.debug_id; errorData.paypal_issue = details?.[0]?.issue; errorData.paypal_message = ppMessage;
      } else if (error.statusCode && error.statusMessage) { // H3Error
          statusCode = error.statusCode; statusMessage = error.statusMessage; message = error.message || statusMessage; errorData = { ...error.data, ...errorData };
      } else if (error instanceof Error) { // Standard JS Error
           statusCode = 400; statusMessage = 'Bad Request'; message = error.message;
      }

      console.error(`Error Response Prepared: statusCode=${statusCode}, statusMessage='${statusMessage}', message='${message}'`);
      // Throw structured error - Nuxt/H3 sends this as JSON
      throw createError({ statusCode, statusMessage, message, data: errorData });
  }
});