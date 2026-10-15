// Predict and test Number() for priceText values '', 'abc', '0', '-5', '250'
// In JavaScript, Number() converts a string into a number.

console.log(Number(''));     // 0
console.log(Number('abc'));   // NaN
console.log(Number('0'));    // 0
console.log(Number('-5'));   // -5
console.log(Number('250'));  // 250


// Write validatePrice(priceText) returning a number or an error message
// Function rejects '', 'abc', '0', '-5' and accepts '250'
function validatePrice(priceText) {
  if (priceText.trim() === '') {
    return "Error: Price cannot be empty";
  }

  const price = Number(priceText);

  if (Number.isNaN(price)) {
    return "Error: Price must be a valid number";
  }

  if (price <= 0) {
    return "Error: Price must be greater than zero";
  }

  return price;
}

// Test cases
console.log(validatePrice(''));     // Error: Price cannot be empty
console.log(validatePrice('abc'));  // Error: Price must be a valid number
console.log(validatePrice('0'));    // Error: Price must be greater than zero
console.log(validatePrice('-5'));   // Error: Price must be greater than zero
console.log(validatePrice('250'));  // 250


// An empty string ('') means a value exists but contains no text. null means a value is intentionally empty or absent. undefined means a value has not been assigned or is missing.
// Team convention: Use null for “not selected yet.” It clearly indicates that the user has not made a selection, while an empty string can represent text input that has been left blank.

let selectedPrice = null; // Not selected yet
let priceText = '';       // Empty text input
let price;                // undefined: not assigned
Rule: Use null for an intentional absence of a selection, '' for empty text, and undefined for missing or uninitialized values.