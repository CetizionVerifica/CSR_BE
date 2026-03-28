const express = require("express");
const http = require("http");
const { graphqlHTTP } = require("express-graphql");
const bodyParser = require("body-parser");
const connectMongo = require("connect-mongo");
const morgan = require("morgan");
const mongoose = require("mongoose");
const passport = require("passport");
const cors = require("cors");
const session = require("express-session");
const path = require("path");
const helmet = require("helmet");
const userRoutes = require("./server/routes/userRoutes");
const app = express();
require("./server/models");
const config = require("./server/config/keys");
const schema = require("./server/schema/schema");
const logger = require("./server/logger");
const seed = require("./server/helpers/seed");
const { globalLogger } = require("./server/handlers/logger");
const user = require("./server/schema/mutations/user");

// MongoDB Connection
const uri = process.env.MONGODB_URI || config.mongoURI;
mongoose
  .connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => logger.debug("DB: Connected"))
  .catch((err) => logger.debug("DB: Not Connected", err));

// Middleware
app.use("/public", express.static("public"));

app.use(morgan("short"));
app.use(helmet());
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use(bodyParser.json({ limit: "50mb" }));

// Session configuration
const MongoStore = connectMongo(session);
app.use(
  session({
    secret: process.env.SESSION_SECRET || config.secretSession,
    resave: false,
    saveUninitialized: false,
    store: new MongoStore({ mongooseConnection: mongoose.connection }),
  })
);

app.use(cors());
app.use("/api", userRoutes);
app.use(passport.initialize());
app.use(passport.session());

// Logging
app.use(globalLogger);

// GraphQL
app.use(
  "/graphql",
  graphqlHTTP((req) => ({
    schema: schema.getSchema(),
    rootValue: {
      isAuthenticated: req.isAuthenticated(),
      user: req.user,
      req,
    },
    graphiql: true,
  }))
);

// Routes
require("./server/router")(app);

app.get("/", (req, res) => {
  res.json("Welcome to CSR API");
});

// Error Handling
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).send("Something broke!");
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  // Implement a strategy to gracefully shutdown or restart your app
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Implement a strategy to gracefully shutdown or restart your app
});

// Seed admin user
seed.seedAdmin().catch((err) => logger.error("Error seeding admin:", err));

// Server Setup
const port = process.env.PORT || 4000;
const server = http.createServer(app);

server.listen(port, () => {
  console.log("Server listening on:", port);
});

module.exports = app; // For testing purposes
