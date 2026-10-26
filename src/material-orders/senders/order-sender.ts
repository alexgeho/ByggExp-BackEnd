import { OrderContext, OrderRowLike } from "../order-format";

// How a finished order reaches the grossist. EmailOrderSender is the default;
// an EDI sender (ESAP/Peppol order, once a supplier agreement exists) can be
// bound to ORDER_SENDER in MaterialOrdersModule without touching the service.
export const ORDER_SENDER = Symbol("ORDER_SENDER");

export type OrderDispatch = {
  to: string; // supplier order mailbox / EDI endpoint
  replyTo?: string;
  rows: OrderRowLike[];
  context: OrderContext;
};

export interface OrderSender {
  readonly channel: string; // "email" | "edi"
  isReady(): boolean;
  send(dispatch: OrderDispatch): Promise<void>;
}
