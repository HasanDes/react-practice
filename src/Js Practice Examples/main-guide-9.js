//Event loop Practice

console.log("1. Start");

async function loadProducts() {
  console.log("2. Inside loadProducts");

  const response = await fetch("/api/products");

  console.log("3. Response received");

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Product not found");
    }

    if (response.status === 500) {
      throw new Error("Service unavailable");
    }
  }

  return response.json();
}

loadProducts()
  .then((products) => console.log("4. Products loaded"))
  .catch((error) => console.log("5. Error:", error.message));

console.log("6. End");


// Complex event loop
 console.log("A");
    
   setTimeout(() => {
     console.log("B");
     Promise.resolve().then(() => console.log("C"));
     queueMicrotask(() => console.log("D"));
   }, 0);
    
   Promise.resolve().then(() => {
    console.log("E");
    setTimeout(() => console.log("F"), 0);
    return Promise.resolve();
  }).then(() => console.log("G"));
   
  async function test() {
    console.log("H");
    await null;
    console.log("I");
    await Promise.resolve();
    console.log("J");
  }
  test();
   
  queueMicrotask(() => {
    console.log("K");
    Promise.resolve().then(() => console.log("L"));
  });
   
console.log("M");