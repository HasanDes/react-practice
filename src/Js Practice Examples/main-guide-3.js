function discountFor(total) {
    return total > 5000 ? total * 0.10 : 0;
}

// Tests
console.log(discountFor(0));      // 0
console.log(discountFor(5000));   // 0
console.log(discountFor(5001));   // 500.1
console.log(discountFor(10000));  // 1000

// Logic: The function returns a 10% discount only when total is strictly greater than Rs. 5,000. Otherwise, it returns 0.




/* 1. Parameter vs. Argument
A parameter is the variable named in a function definition. An argument is the actual value passed into the function when you call it.
*/
function lineTotal(price, quantity) {
  return price * quantity;
}

lineTotal(10, 3);
Parameters: price and quantity

/* Arguments: 10 and 3
   Return value: 30
   Think of parameters as placeholders and arguments as the values that fill those placeholders.
*/   


/*
2. Pure Functions
A pure function returns the same output for the same inputs and does not cause side effects, such as modifying external variables or changing the DOM.
*/

javascript
function lineTotal(price, quantity) {
  return price * quantity;
}

console.log(lineTotal(10, 3)); // 30
console.log(lineTotal(10, 3)); // 30

/*
This function is pure because:
The same inputs always produce the same output.
It does not modify anything outside the function.
It does not depend on external state.
Here is an example of an impure function:
*/

let total = 0;

function lineTotal(price, quantity) {
  total = price * quantity;
  return total;
}

/*
This function modifies the external variable total, so it has a side effect.
Important: Using a local variable inside a function does not make it impure. The concern is whether the function depends on or changes external state.
3. When Should a Function Throw an Error?
A function should throw an error when it cannot perform its intended task because its input or the current situation violates its requirements.
For example, a line total should not accept a negative price or a negative quantity.
*/

function lineTotal(price, quantity) {
  if (price < 0 || quantity < 0) {
    throw new Error("Price and quantity cannot be negative");
  }

  return price * quantity;
}

console.log(lineTotal(10, 3)); // 30
console.log(lineTotal(-10, 3)); // Throws an error

/*
Use throw when:
An argument violates the function's requirements.
Continuing would produce an invalid or misleading result.
The caller needs to know that the operation failed.
You don't need to throw an error for every unusual situation. If a situation is expected and can be handled normally, returning a value such as 0, null, or a result object may be more appropriate, depending on the function's contract.
One detail: throw does not automatically make a function impure. A function can still be pure if it returns the same result for the same valid inputs and throws consistently for invalid inputs.
*/


/* Explained all three verbally
"In lineTotal(price, quantity), price and quantity are parameters because they are defined in the function declaration. When I call lineTotal(10, 3), 10 and 3 are arguments.
The function is pure because it calculates the total using only its inputs, returns the result, and doesn't change anything outside itself. The same inputs always produce the same output.
I would throw an error if the price or quantity violated the function's requirements, such as being negative, because returning a normal total in that situation could hide invalid data.
*/