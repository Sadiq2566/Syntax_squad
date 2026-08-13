async function run() {
  const res = await fetch("http://localhost:3000/api/sessions", {
    method: "GET"
  });
  const data = await res.json();
  console.log(data);
}
run();
