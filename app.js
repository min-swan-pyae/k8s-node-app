const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  // Deliberate regression for our rollback exercise
  if (req.url === "/rollback-demo") {
    res.writeHead(503, {
      "Content-Type": "text/plain",
    });

    res.end("Service temporarily unavailable\n");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/plain",
  });

  res.end("Version 2.1 - Tested through a Pull Request!\n");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
