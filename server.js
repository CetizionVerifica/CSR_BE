const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.post("/api/signin", (req, res) => {
  const { email, password } = req.body;
  // Add your authentication logic here
  res.json({ success: true, message: "Signed in successfully" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
