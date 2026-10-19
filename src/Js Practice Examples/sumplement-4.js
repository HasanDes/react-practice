1. Using a for...of loop

javascript
function calculateCartTotal(cart) {
  let total = 0;

  for (const item of cart) {
    if (item.quantity === 0) {
      continue;
    }

    total += item.price * item.quantity;
  }

  return total;
}

// Example cart
const cart = [
  { name: "Shirt", price: 20, quantity: 2 },
  { name: "Shoes", price: 50, quantity: 1 },
  { name: "Hat", price: 15, quantity: 0 }
];

console.log(calculateCartTotal(cart));
// Output: 90
2. Using reduce()

javascript
function calculateCartTotal(cart) {
  return cart.reduce((total, item) => {
    if (item.quantity === 0) {
      return total;
    }

    return total + item.price * item.quantity;
  }, 0);
}

// Example cart
const cart = [
  { name: "Shirt", price: 20, quantity: 2 },
  { name: "Shoes", price: 50, quantity: 1 },
  { name: "Hat", price: 15, quantity: 0 }
];

console.log(calculateCartTotal(cart));