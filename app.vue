<template>
  <div>
    <h1>PayPal Direct Card Payment Test</h1>

    <form @submit.prevent="handlePayment" v-if="!paymentResult">
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

      <h2>Card Details (Use PayPal Sandbox Test Cards)</h2>
       <div>
        <label for="cardNumber">Card Number:</label>
        <input id="cardNumber" v-model="cardDetails.cardNumber" required placeholder="xxxx xxxx xxxx xxxx" />
      </div>
       <div>
        <label for="expiry">Expiry (MM/YY or MM/YYYY):</label>
        <input id="expiry" v-model="cardDetails.expiry" required placeholder="MM/YY" />
      </div>
       <div>
        <label for="cvv">CVV:</label>
        <input id="cvv" v-model="cardDetails.cvv" required placeholder="123" />
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

      <button type="submit" :disabled="isLoading">
        {{ isLoading ? 'Processing...' : 'Pay Now' }}
      </button>
    </form>

    <!-- ... (rest of the template remains the same) ... -->
    <div v-if="paymentResult" :class="{ success: paymentResult.success, error: !paymentResult.success }">
      <h2>Payment Result</h2>
      <p>{{ paymentResult.message }}</p>
      <pre v-if="paymentResult.data">{{ JSON.stringify(paymentResult.data, null, 2) }}</pre>
      <button @click="resetForm">Try Again</button>
    </div>
  </div>
</template>


<script setup lang="ts">
import { ref } from 'vue';

const customer = ref({
  firstName: 'Joe',
  lastName: 'Bloggs',
  email: 'sb-vixvn29887810@personal.example.com', // Use a sandbox buyer email
  address1: '123 Test St',
  city: 'Test Town',
  postcode: 'AB12 3CD', // Use valid postcode format for the country
  countryCode: 'GB', // Use a valid 2-letter code
});

const cardDetails = ref({
  cardNumber: '4698460064286706', // Leave empty - user enters test card
  expiry: '02/27',     // e.g., 12/25 or 12/2025
  cvv: '924',        // e.g., 123
});

const cart = ref({
    totalAmount: '15.50',
    currencyCode: 'GBP' // Match your sandbox account currency if needed
});

const isLoading = ref(false);
const paymentResult = ref<{ success: boolean; message: string; data?: any } | null>(null);

async function handlePayment() {
  isLoading.value = true;
  paymentResult.value = null;

  try {
    const response = await $fetch('/api/paypal-cc', {
      method: 'POST',
      body: {
        customer: customer.value,
        cardDetails: cardDetails.value,
        cart: cart.value,
      },
    });
    // Assuming success returns { success: true, message: ..., ... }
    paymentResult.value = { success: true, message: response.message, data: response };
    console.log('Payment Success:', response);

  } catch (error: any) {
    console.error('Payment Error:', error);
    // $fetch throws error for non-2xx responses
    // error.data contains the body parsed from the error response (from createError)
    const message = error.data?.statusMessage || error.data?.message || error.message || 'Payment failed. Please try again.';
    paymentResult.value = { success: false, message: message, data: error.data };
  } finally {
    isLoading.value = false;
  }
}

function resetForm() {
    paymentResult.value = null;
    // Optionally clear card details for security/UX
    // cardDetails.value.cardNumber = '';
    // cardDetails.value.expiry = '';
    // cardDetails.value.cvv = '';
}
</script>

<style scoped>
div {
  margin-bottom: 10px;
}
label {
  display: block;
  margin-bottom: 3px;
}
input {
  padding: 8px;
  margin-bottom: 5px;
  width: 250px;
}
button {
  padding: 10px 15px;
  cursor: pointer;
}
button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
}
.success {
  color: green;
  border: 1px solid green;
  padding: 10px;
  margin-top: 15px;
}
.error {
  color: red;
  border: 1px solid red;
  padding: 10px;
  margin-top: 15px;
}
pre {
    background-color: #f5f5f5;
    padding: 10px;
    overflow-x: auto;
    font-size: 0.9em;
}
</style>
