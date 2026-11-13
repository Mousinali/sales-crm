ALTER TABLE sale_payments ADD COLUMN payment_number TEXT UNIQUE;
ALTER TABLE sale_payments ADD COLUMN receipt_number TEXT;
ALTER TABLE sale_payments ADD COLUMN account_number TEXT;
