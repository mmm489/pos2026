// Issued invoices survive kitchen/payment lookups; unbilled payment attempts are not sales.
function closingSalesWhere(alias = "o") {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
  return `${alias}.invoice_number IS NOT NULL
    AND ${alias}.status <> 'cancelled'
    AND ${alias}.payment_method IN ('cash', 'card', 'manual')
    AND COALESCE(${alias}.business_unit, 'hicream') = 'hicream'`;
}

module.exports = { closingSalesWhere };
