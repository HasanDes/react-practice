async function testFailedRequest() {
  try {
    const response = await fetch(
      "https://jsonplaceholder.typicode.com/posts/1"
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