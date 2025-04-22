<template>
  <div>
    <h1>PayPal JS SDK Card Fields Test</h1>

    <!-- Display loading/error during SDK setup -->
    <div v-if="sdkError" class="error">{{ sdkError }}</div>
    <div v-if="isSdkLoading">Loading PayPal Fields...</div>

    <!-- Form for Customer/Cart Details + PayPal Fields -->
    <!-- No @submit.prevent needed as button triggers SDK -->
    <form v-show="!isSdkLoading && !sdkError && !paymentResult">
      <h2>Customer Details</h2>
      <div>
        <label for="firstName">First Name:</label>
        <input id="firstName" v-model="customer.firstName" required />
      </div>
      <div>
        <label for="lastName">Last Name:</label>
        <input id="lastName" v-model="customer.lastName" required />
      </div>
      <div>
        <label for="email">Email:</label>
        <input id="email" type="email" v-model="customer.email" required />
      </div>
      <div>
        <label for="address1">Address 1:</label>
        <input id="address1" v-model="customer.address1" required />
      </div>
       <div>
        <label for="city">City:</label>
        <input id="city" v-model="customer.city" required />
      </div>
       <div>
        <label for="postcode">Postcode:</label>
        <input id="postcode" v-model="customer.postcode" required />
      </div>
       <div>
        <label for="countryCode">Country Code (2-letter ISO):</label>
        <input id="countryCode" v-model="customer.countryCode" required maxlength="2" placeholder="e.g. GB" />
      </div>

      <h2>Card Details (Secure Fields by PayPal)</h2>
      <!-- Containers for PayPal SDK Card Fields -->
      <div id="card-form" class="card_container">
          <label for="card-name-field-container">Name on Card:</label>
          <div id="card-name-field-container"></div>

          <label for="card-number-field-container">Card Number:</label>
          <div id="card-number-field-container"></div>

          <label for="card-expiry-field-container">Expiration Date:</label>
          <div id="card-expiry-field-container"></div>

          <label for="card-cvv-field-container">CVV:</label>
          <div id="card-cvv-field-container"></div>

          <!-- Display validation errors from SDK -->
          <div v-if="cardFieldError" class="error">{{ cardFieldError }}</div>
      </div>

       <h2>Cart (Test Data)</h2>
       <div>
        <label for="totalAmount">Amount:</label>
        <input id="totalAmount" v-model="cart.totalAmount" required />
      </div>
       <div>
        <label for="currencyCode">Currency Code:</label>
        <input id="currencyCode" v-model="cart.currencyCode" required placeholder="e.g. GBP" />
      </div>

      <!-- Button triggers SDK submit, not form submit -->
      <button type="button" @click="submitCardFields" :disabled="isLoading || isSdkLoading || !isCardFieldsEligible">
        {{ isLoading ? 'Processing...' : 'Pay Now' }}
      </button>
    </form>

    <!-- Payment Result Display -->
    <div v-if="paymentResult" :class="{ success: paymentResult.success, error: !paymentResult.success }">
      <h2>Payment Result</h2>
      <p>{{ paymentResult.message }}</p>
      <pre v-if="paymentResult.data">{{ JSON.stringify(paymentResult.data, null, 2) }}</pre>
      <button @click="resetForm">Try Again</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';

// --- State ---
const customer = ref({
  firstName: 'Joe',
  lastName: 'Bloggs',
  email: 'sb-vixvn29887810@personal.example.com',
  address1: '123 Test St',
  city: 'Test Town',
  postcode: 'AB12 3CD',
  countryCode: 'GB',
});

const cart = ref({
    totalAmount: '15.50',
    currencyCode: 'GBP'
});

const isLoading = ref(false); // For processing payment after approval
const isSdkLoading = ref(true); // For initial SDK field rendering
const sdkError = ref<string | null>(null); // Error during SDK setup/loading
const cardFieldError = ref<string | null>(null); // Validation error from card fields
const paymentResult = ref<{ success: boolean; message: string; data?: any } | null>(null);
const isCardFieldsEligible = ref(false);

// Store SDK instance
let cardFieldInstance: any = null; // Use 'any' or install @paypal/paypal-js types

// --- PayPal SDK Integration ---

onMounted(() => {
  // Ensure PayPal SDK script is loaded (assuming it's loaded globally via nuxt.config or plugin)
  if (!window.paypal || !window.paypal.CardFields) {
    sdkError.value = "PayPal SDK script not loaded. Please ensure it's included in your project.";
    isSdkLoading.value = false;
    console.error(sdkError.value);
    return;
  }

  initializePayPalCardFields();
});

onBeforeUnmount(() => {
    // Clean up card fields if component is destroyed
    // Note: The SDK doesn't provide an explicit 'destroy' method for CardFields easily.
    // Usually, removing the container elements is sufficient.
    cardFieldInstance = null; // Release reference
});

async function initializePayPalCardFields() {
  try {
    isSdkLoading.value = true;
    sdkError.value = null;

    cardFieldInstance = window.paypal.CardFields({
        style: { // Optional styling
            '.input': { 'font-size': '1rem', 'color': '#333' },
            '.invalid': { 'color': 'red' },
            '.valid': { 'color': 'green' }
        },
        // --- 1. Create Order Callback ---
        createOrder: async () => {
            console.log('SDK calling createOrder callback...');
            cardFieldError.value = null; // Clear previous errors
            // Basic validation before creating order
            if (!cart.value.totalAmount || isNaN(parseFloat(cart.value.totalAmount)) || !cart.value.currencyCode) {
                cardFieldError.value = "Please ensure Amount and Currency Code are valid.";
                console.error(cardFieldError.value);
                // Throwing an error here might prevent the PayPal UI from showing
                // It's often better to return a rejected Promise or handle validation before submit
                return Promise.reject(new Error(cardFieldError.value));
            }

            try {
                // Call your NEW backend endpoint to create an order ID
                const response = await $fetch('/api/paypal/create-order', { // Adjust path if needed
                    method: 'POST',
                    body: {
                        amount: cart.value.totalAmount,
                        currency: cart.value.currencyCode,
                        // Optionally send customer details if needed for order creation context
                        // customer: customer.value
                    }
                });

                if (!response || !response.orderID) {
                    throw new Error('Backend did not return a valid orderID.');
                }
                console.log('Order created on backend, OrderID:', response.orderID);
                return response.orderID; // Return the orderID to the SDK

            } catch (err: any) {
                console.error('Error creating PayPal order via backend:', err);
                const message = err.data?.message || err.message || 'Could not initiate PayPal order.';
                cardFieldError.value = `Error: ${message}`;
                // Reject the promise to signal failure to the SDK
                return Promise.reject(new Error(message));
            }
        },

        // --- 2. On Approve Callback ---
        onApprove: async (data: { orderID: string }) => {
            console.log('SDK calling onApprove callback with OrderID:', data.orderID);
            isLoading.value = true; // Start processing indicator
            paymentResult.value = null;
            cardFieldError.value = null;

            try {
                // Call your NEW backend endpoint to capture the order
                const captureResponse = await $fetch('/api/paypal/capture-order', { // Adjust path if needed
                    method: 'POST',
                    body: {
                        orderID: data.orderID
                    }
                });

                // Assuming backend returns { success: true/false, message: ..., data: ... }
                if (captureResponse.success) {
                    paymentResult.value = {
                        success: true,
                        message: captureResponse.message || 'Payment successful!',
                        data: captureResponse.data
                    };
                    console.log('Payment Capture Success:', captureResponse);
                } else {
                    // Handle cases where backend indicates capture failed but didn't throw 500
                     paymentResult.value = {
                        success: false,
                        message: captureResponse.message || 'Payment capture failed.',
                        data: captureResponse.data
                    };
                     console.error('Payment Capture Failed (Backend Response):', captureResponse);
                }

            } catch (err: any) {
                console.error('Error capturing PayPal order via backend:', err);
                const message = err.data?.statusMessage || err.data?.message || err.message || 'Payment capture failed. Please try again.';
                paymentResult.value = { success: false, message: message, data: err.data };
            } finally {
                isLoading.value = false; // Stop processing indicator
            }
        },

        // --- 3. Handle Input Events (Optional) ---
        inputEvents: {
            onChange: (data: any) => {
                // Handle field validity changes if needed
                // console.log('Card field changed:', data);
                // Example: Clear general error if user starts typing again
                if (cardFieldError.value && data.isFormValid) {
                    cardFieldError.value = null;
                }
            },
            onError: (err: any) => {
                console.error('Card field validation error:', err);
                // Display validation errors from the SDK
                cardFieldError.value = err.message || "Please check your card details.";
            }
        }
    });

    // Check eligibility and render fields
    if (cardFieldInstance.isEligible()) {
        isCardFieldsEligible.value = true;
        const nameField = cardFieldInstance.NameField();
        const numberField = cardFieldInstance.NumberField();
        const cvvField = cardFieldInstance.CVVField();
        const expiryField = cardFieldInstance.ExpiryField();

        await nameField.render("#card-name-field-container");
        await numberField.render("#card-number-field-container");
        await cvvField.render("#card-cvv-field-container");
        await expiryField.render("#card-expiry-field-container");

        console.log("PayPal Card Fields rendered.");
    } else {
        sdkError.value = "PayPal Card Fields are not eligible on this device/browser.";
        console.warn(sdkError.value);
        isCardFieldsEligible.value = false;
    }

  } catch (err: any) {
      console.error("Failed to initialize PayPal Card Fields:", err);
      sdkError.value = `Failed to load PayPal Card Fields: ${err.message}`;
  } finally {
      isSdkLoading.value = false; // Finish loading state
  }
}

// --- Actions ---

async function submitCardFields() {
    if (!cardFieldInstance) {
        console.error("Card fields instance not available.");
        cardFieldError.value = "Payment fields not loaded correctly.";
        return;
    }
     // Add any final frontend validation if needed before submitting to PayPal
    if (!customer.value.firstName || !customer.value.lastName /* ... other checks */) {
         cardFieldError.value = "Please fill in all customer details.";
         return;
    }
    if (!cart.value.totalAmount || isNaN(parseFloat(cart.value.totalAmount)) || !cart.value.currencyCode) {
         cardFieldError.value = "Please ensure Amount and Currency Code are valid.";
         return;
    }

    console.log("Submitting card fields to PayPal SDK...");
    cardFieldError.value = null; // Clear previous errors before submit
    // isLoading.value = true; // Optional: Show loading immediately on click

    try {
        // This triggers the SDK flow: createOrder -> PayPal UI -> onApprove
        await cardFieldInstance.submit();
        // Note: Success/failure is handled within the onApprove callback, not here directly
        console.log("Card field submission initiated.");
    } catch (err: any) {
        console.error("Error during cardField.submit():", err);
        cardFieldError.value = `Submission error: ${err.message || 'Could not submit payment details.'}`;
        // isLoading.value = false; // Ensure loading stops if submit itself fails
    }
}

function resetForm() {
    paymentResult.value = null;
    cardFieldError.value = null;
    // Re-initializing might be needed if you want to clear the fields completely
    // or just let the user try again with the same fields.
    // For simplicity, we just clear the result here.
    // Consider if re-rendering fields is necessary:
    // if (cardFieldInstance) {
    //   initializePayPalCardFields(); // Re-render fields (might be overkill)
    // }
}
</script>

<style scoped>
/* Basic styling for containers */
.card_container {
  border: 1px solid #ccc;
  padding: 15px;
  border-radius: 5px;
  margin-bottom: 15px;
}
/* Style the field containers provided by PayPal SDK */
#card-name-field-container,
#card-number-field-container,
#card-expiry-field-container,
#card-cvv-field-container {
  border: 1px solid #eee; /* Example border */
  padding: 10px; /* Example padding */
  margin-bottom: 10px;
  min-height: 40px; /* Ensure container has height */
}

/* Other styles remain the same */
div { margin-bottom: 10px; }
label { display: block; margin-bottom: 3px; font-weight: bold; }
input { padding: 8px; margin-bottom: 5px; width: 250px; border: 1px solid #ccc; }
button { padding: 10px 15px; cursor: pointer; background-color: #0070ba; color: white; border: none; border-radius: 4px; }
button:disabled { cursor: not-allowed; opacity: 0.6; }
.success { color: green; border: 1px solid green; padding: 10px; margin-top: 15px; }
.error { color: red; border: 1px solid red; padding: 10px; margin-top: 15px; font-size: 0.9em; }
pre { background-color: #f5f5f5; padding: 10px; overflow-x: auto; font-size: 0.9em; border: 1px solid #eee; }
</style>
