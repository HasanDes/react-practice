// 1. Browser receives the click event
document.querySelector("#myButton")
  .addEventListener("click", handleClick);

// 2. Click invokes handleClick()
function handleClick() {
  updateMessage();
}

// 3. updateMessage() executes
function updateMessage() {
  console.log("Button clicked!"); // Breakpoint here
}