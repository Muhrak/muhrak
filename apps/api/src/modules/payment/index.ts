/**
 * Public surface of the payment module (Day 12). Other modules (and the worker) import only from here.
 */
import { setPaymentSummaryLookup } from "../order";
import { latestPaymentsForOrders } from "./payment.service";

// Orders show their latest payment; the order module cannot import this one (it is imported by it), so it is told how.
setPaymentSummaryLookup(latestPaymentsForOrders);

export { buyerOrderPayRouter, buyerPaymentRouter, paymentWebhookRouter } from "./payment.routes";
export { expireStalePayments, PAYMENT_TRANSITIONS } from "./payment.service";
