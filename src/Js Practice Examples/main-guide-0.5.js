// x % 2 calculates the remainder when x is divided by 2.
// If the remainder is 0, the number is even, so the function returns true.
// Otherwise, it returns false.

const isEven = x => x % 2 === 0;

console.log(isEven(4)); // true
console.log(isEven(7)); // false



//One Line Arrow Function
const square = x => x * x;
console.log(square(4)); // 16

//When an arrow function uses curly braces {}, 
//JavaScript treats the body as a block of statements. 
//It does not automatically return the value of an expression inside that block.

x => {x * 2}

//option 1 implicit return
const double = x => x * 2;
console.log(double(5));

//option 2 explicit return
const double = x => {
  return x * 2;
};
console.log(double(5));

/* 
function evenOdd(x){
  if (x % 2 === 0) {
    return true;
  }
  else
    return false;
}
 */