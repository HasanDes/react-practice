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


