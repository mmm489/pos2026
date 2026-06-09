import type { PoolClient } from "pg";

import type { BusinessUnit } from "@/lib/business-unit";

function currentMadridYear() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
  }).format(new Date());
}

export async function allocateInvoiceNumber(
  client: PoolClient,
  businessUnit: BusinessUnit = "hicream",
): Promise<string> {
  const result =
    businessUnit === "cookies"
      ? await client.query(
          `UPDATE pos.business
           SET next_cookies_invoice_number = next_cookies_invoice_number + 1
           RETURNING cookies_invoice_series AS invoice_series,
                     next_cookies_invoice_number - 1 AS invoice_num`,
        )
      : await client.query(
          `UPDATE pos.business
           SET next_invoice_number = next_invoice_number + 1
           RETURNING invoice_series, next_invoice_number - 1 AS invoice_num`,
        );

  const { invoice_series, invoice_num } = result.rows[0];
  return `${invoice_series}-${currentMadridYear()}/${String(invoice_num).padStart(6, "0")}`;
}
