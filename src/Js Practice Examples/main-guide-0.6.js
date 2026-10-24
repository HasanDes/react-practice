
const name = "Sara";
const cartItems = 3;

//Template literals use backticks (`) and ${} to insert variable values into a string.
const message = `${name} has ${cartItems} items in cart`;
console.log(message);

// VS Double Quote 
const message = name + " has " + cartItems + " items in cart";
console.log(message);

let color = "blue";
function change() {
  let color = "red";
}
change();
console.log(color);


