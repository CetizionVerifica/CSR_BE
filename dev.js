const { spawn } = require("child_process");
const path = require("path");

// Start the backend server
const backend = spawn("node", ["server.js"], {
  stdio: "inherit",
});

// Start the frontend server
const frontend = spawn("npm", ["start"], {
  stdio: "inherit",
  env: { ...process.env, BROWSER: "none" },
});

// Handle cleanup
const cleanup = () => {
  backend.kill();
  frontend.kill();
  process.exit();
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
