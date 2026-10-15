// We need to extend canAddToCart to check isArchived and create an isLowStock condition where stock is greater than 0 and less than 5.

// 1. Write the conditions
const canAddToCart = !isArchived && stock > 0;

const isLowStock = stock > 0 && stock < 5;
canAddToCart: The product is not archived and has stock available.

isLowStock: The product has between 1 and 4 items in stock.


// 2. Test both conditions
function testProduct(isArchived, stock) {
  const canAddToCart = !isArchived && stock > 0;
  const isLowStock = stock > 0 && stock < 5;

  return { canAddToCart, isLowStock };
}

console.log(testProduct(false, 3));
// { canAddToCart: true, isLowStock: true }

console.log(testProduct(true, 3));
// { canAddToCart: false, isLowStock: true }

console.log(testProduct(false, 5));
// { canAddToCart: true, isLowStock: false }

console.log(testProduct(false, 0));
// { canAddToCart: false, isLowStock: false }


// 1. List down falsy values in JS

// false : The Boolean value representing false.
// 0 : The number zero is falsy.
// '' : An empty string contains no characters, so it is falsy.
// null : Represents the intentional absence of a value.
// undefined : Indicates that a value has not been assigned or is missing.
// NaN : Means “Not a Number”; it is falsy.

if (0) {
  console.log("Truthy");
} else {
  console.log("Falsy");
}

// Output: Falsy


// 2. Why a disabled button is not a security rule

// The disabled attribute prevents a user from clicking the button normally through the browser interface. However, it does not guarantee that the underlying delete operation is protected.
// A user may still attempt to invoke the operation through:
// Browser developer tools or JavaScript.
// A direct HTTP request to the server's API.
// A modified client-side application.
// Another interface that calls the same endpoint.