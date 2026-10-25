// Fetch Error Practice

async function loadProducts() {
  const response = await fetch("/api/products");

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Product not found");
    }

    if (response.status === 500) {
      throw new Error("Service unavailable");
    }

    throw new Error(`Request failed: ${response.status}`);
  }

  return await response.json();
}

loadProducts()
  .then((products) => console.log(products))
  .catch((error) => console.error(error.message));

  // Variation 2 
  async function testFailedRequest() {
  try {
    const response = await fetch(
      "https://jsonplaceholder.typicode.com/invalid-endpoint"
    );

    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`
      );
    }

    console.log("Request successful");
  } catch (error) {
    console.error("API Error:", error.message);
  }
}

testFailedRequest();


/* Recommended approach for real-world projects
For reusable frontend API functions, I'd recommend your approach: 
throw errors in the API function and handle them at the caller level.
*/

async function loadProducts() {
  const response = await fetch("/api/products");

  if (!response.ok) {
    const message =
      response.status === 404
        ? "Product not found"
        : response.status === 500
          ? "Service unavailable"
          : `Request failed: ${response.status}`;

    throw new Error(message);
  }

  return response.json();
}

async function displayProducts() {
  try {
    const products = await loadProducts();
    console.log(products);
  } catch (error) {
    console.error(error.message);
  }
}

displayProducts();
/*
You could alternatively use .then().catch():
loadProducts()
  .then((products) => console.log(products))
  .catch((error) => console.error(error.message));
*/  