import { z } from "zod";
import { CURRENCIES } from "./money";

export const currencySchema = z.enum(CURRENCIES);

export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: currencySchema,
});
