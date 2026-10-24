Question 1: Event Loop + var vs let
What will be the output of the following code, and why?
javascript
console.log("Start");
setTimeout(() => {
  console.log("Timeout");
}, 0);
Promise.resolve().then(() => {
  console.log("Promise");
});
for (var i = 0; i < 3; i++) {
  setTimeout(() => {
    console.log("var:", i);
  }, 0);
}
for (let j = 0; j < 3; j++) {
  setTimeout(() => {
    console.log("let:", j);
  }, 0);
}
console.log("End");
Question 2: == vs ===
What is the output, and why?
javascript
console.log(0 == false);
console.log(0 === false);
console.log("5" == 5);
console.log("5" === 5);
console.log(null == undefined);
console.log(null === undefined);
console.log([] == false);
console.log([] === false);
Question 3: Callbacks
What is the output, and why?
javascript
function processData(callback) {
  console.log("Processing");
  callback();
  console.log("Completed");
}
function showResult() {
  console.log("Result displayed");
}
processData(showResult);
Question 4: Asynchronous Callbacks
Predict the output.
javascript
console.log("A");
setTimeout(() => {
  console.log("B");
}, 0);
function execute(callback) {
  console.log("C");
  callback();
}
execute(() => console.log("D"));
console.log("E");
Question 5: Closures in a Loop
What will this code print? How can you fix it without changing var to let?
javascript
for (var i = 0; i < 3; i++) {
  setTimeout(() => {
    console.log(i);
  }, 100);
}
Question 6: Closures and Private State
Predict the output and explain how count remains accessible.
javascript
function createCounter() {
  let count = 0;
  return function () {
    count++;
    return count;
  };
}
const counterA = createCounter();
const counterB = createCounter();
console.log(counterA());
console.log(counterA());
console.log(counterB());
console.log(counterA());
Question 7: Hoisting with var and let
What happens when this code executes?
javascript
console.log(a);
var a = 10;
console.log(b);
let b = 20;
Question 8: Function Declaration vs Function Expression
Predict the output and identify which line causes an error.
javascript
sayHello();
function sayHello() {
  console.log("Hello");
}
sayBye();
var sayBye = function () {
  console.log("Bye");
};
Question 9: Closures, Hoisting and the Event Loop
Predict the complete output without running the code.
javascript
var x = 1;
function test() {
  console.log(x);
  var x = 2;
  for (var i = 0; i < 2; i++) {
    setTimeout(() => {
      console.log("i:", i, "x:", x);
    }, 0);
  }
  Promise.resolve().then(() => {
    console.log("Promise:", x);
  });
  console.log("End:", x);
}
test();
console.log("Global:", x);
Question 10: async/await
Rewrite Question 1 using async/await and explain how await affects the execution order.
console.log("Start");


setTimeout(() => {
  console.log("Timeout");
}, 0);


Promise.resolve().then(() => {
  console.log("Promise");
});








console.log(0 == false);
console.log(0 === false);


console.log("5" == 5);
console.log("5" === 5);


console.log(null == undefined);
console.log(null === undefined);


console.log([] == false);
console.log([] === false);
for (var i = 0; i < 3; i++) {
  setTimeout(() => {
    console.log("var:", i);
  }, 0);
}


for (let j = 0; j < 3; j++) {
  setTimeout(() => {
    console.log("let:", j);
  }, 0);
}


console.log("End");




callbacks:




function processData(callback) {
  console.log("Processing");
  callback();
  console.log("Completed");
}


function showResult() {
  console.log("Result displayed");
}


processData(showResult);