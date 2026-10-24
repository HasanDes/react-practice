// 1. Hoisting with var

console.log(a);
var a = 10;
console.log(a);

/* 
undefined
10

Reason: Variables declared with var are hoisted to the top of their scope 
and initialized with undefined. The assignment a = 10 happens 
when execution reaches that line.

*/

// 2. Temporal Dead Zone (TDZ) with let

console.log(name);
let name = "Hasan";
console.log(name);

/* 
ReferenceError: Cannot access 'name' before initialization

Reason: let declarations are hoisted, but they cannot be accessed 
before their declaration is initialized. This period is called the 
Temporal Dead Zone (TDZ). The error stops execution, 
so the second console.log() does not run.

*/

//3. const and Reassignment

const age = 26;
age = 30;
console.log(age);

// TypeError: Assignment to constant variable.
/*
Reason: A variable declared with const cannot be reassigned. 
The error occurs at age = 30, so console.log(age) never executes.
*/

/*
Concept	Key rule
Hoisting (var)	Accessible before declaration, with value undefined.
TDZ (let / const)	Cannot access the variable before initialization.
const	Must be initialized during declaration and cannot be reassigned.
*/


/*
In JavaScript, the difference between var and let in a setTimeout() loop explains 
why you might get 3 3 3 instead of 0 1 2.
*/

//1. Using var — Output: 3 3 3

function abc() {
for (var i = 0; i < 3; i++) {
    setTimeout(function () {
        console.log(i);
    }, 1000);  
 }
 return;
}
let xyz = abc();
console.log(xyz); 

/* Output after approximately 1 second:
3 
3
3
*/

function abc() {
for (let i = 0; i < 3; i++) {
    setTimeout(function () {
        console.log(i);
    }, 1000);  
 }
 return;
}
let xyz = abc();
console.log(xyz); 

/*
- let is block-scoped.
- In a for loop, JavaScript creates a separate binding for each iteration.
- Each callback remembers its own iteration's value: 0, 1, or 2.
*/

