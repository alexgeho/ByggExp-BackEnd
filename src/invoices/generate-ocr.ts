export function generateOCR(invoiceNumber: number): string {
  const digits = String(invoiceNumber).split('').map(Number);
  let sum = 0;
  let shouldDouble = true;

  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits[i];
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  const checkDigit = (10 - (sum % 10)) % 10;
  return `${invoiceNumber}${checkDigit}`;
}
