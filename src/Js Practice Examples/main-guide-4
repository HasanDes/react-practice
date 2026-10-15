
//Here’s how to use filter(), map(), and reduce() on a product array, add a category field, and filter in-stock drinks.

const products = [
  { name: "Coca-Cola", price: 2, inStock: true, type: "drink" },
  { name: "Chips", price: 3, inStock: true, type: "snack" },
  { name: "Orange Juice", price: 4, inStock: true, type: "drink" },
  { name: "Water", price: 1, inStock: false, type: "drink" },
  { name: "Cookies", price: 5, inStock: false, type: "snack" }
];

// 1. Add a category field using map()
const categorizedProducts = products.map(product => ({
  ...product,
  category: product.type === "drink" ? "Beverages" : "Food"
}));

// 2. Filter in-stock drinks using filter()
const drinks = categorizedProducts.filter(
  product => product.category === "Beverages" && product.inStock
);

// 3. Calculate the total price using reduce()
const total = drinks.reduce(
  (sum, product) => sum + product.price,
  0
);

console.log("Categorized Products:", categorizedProducts);
console.log("In-stock Drinks:", drinks);
console.log("Total:", total);

// Correct labels and results when apply on table we can change its value

console.log(product.inStock ? "Yes" : "No");