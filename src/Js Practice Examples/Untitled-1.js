console.log("A");
setTimeout(() => {
  console.log("B");

  Promise.resolve().then(() => {
    console.log("C");
  });

  queueMicrotask(() => {
    console.log("D");
  });
}, 0);


Promise.resolve()
  .then(() => {
    console.log("E");

    setTimeout(() => {
      console.log("F");
    }, 0);

    return Promise.resolve();
  })
  .then(() => {
    console.log("G");
  });


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

  Promise.resolve().then(() => {
    console.log("L");
  });
});


console.log("M");