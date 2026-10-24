/*JavaScript Scope — Annotated Code Examples
Scope determines where a variable can be accessed in your JavaScript code. The four types are global scope, function scope, block scope, and module scope.

1. Global Scope
A variable declared outside all functions and blocks is in the global scope. It can generally be accessed throughout the script.


javascript */
// Global scope
let username = "Ali";

function greet() {
    console.log(username); // Ali
}

greet();

console.log(username); // Ali
/* Explanation:

username is declared outside the function.

The greet() function can access username.

You can also access it outside the function.

2. Function Scope
Variables declared with var, let, or const inside a function are accessible only within that function and its nested scopes.


javascript */
function showMessage() {
    // Function scope
    let message = "Hello, JavaScript!";

    console.log(message); // Hello, JavaScript!
}

showMessage();

// console.log(message); // ReferenceError
/* Explanation:

message is declared inside showMessage().

It can be accessed inside the function.

It cannot be accessed outside the function.

Note: var is function-scoped, while let and const are block-scoped as well.

3. Block Scope
A block is code inside curly braces { }, such as an if statement or a loop. Variables declared with let and const are limited to that block.


javascript */
if (true) {
    // Block scope
    let age = 20;
    const city = "Karachi";

    console.log(age);  // 20
    console.log(city); // Karachi
}

// console.log(age);  // ReferenceError
// console.log(city); // ReferenceError
/* Explanation:

age and city exist only inside the if block.

Accessing them outside the block causes a ReferenceError.

Unlike let and const, var is not block-scoped.

Example with var:


javascript */
if (true) {
    var score = 100;
}

console.log(score); // 100
/* 4. Module Scope
In JavaScript modules, top-level variables are available within their own module but are not automatically available in other modules.

File 1: math.js


javascript */
// Module scope
const secretNumber = 42;

export const PI = 3.14159;

export function add(a, b) {
    return a + b;
}

// secretNumber is not exported
File 2: app.js


javascript
import { PI, add } from "./math.js";

console.log(PI);       // 3.14159
console.log(add(5, 3)); // 8

// console.log(secretNumber); // ReferenceError
/* Explanation:

secretNumber belongs to the scope of math.js and is not exported.

PI and add can be imported because they are exported.

Each module has its own top-level scope. */