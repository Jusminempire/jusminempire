const express = require("express");
const app = express();
const cors = require("cors");
const helmet = require("helmet");
const rateLimiters = require("express-rate-limit");
const bodyParser = require("body-parser");
require("dotenv").config();

app.use(bodyParser.json({ limit: "500000000mb" }));
app.use(bodyParser.urlencoded({ limit: "500000000mb", extended: true }));
// middleware
// app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors({ origin: "https://elegantcollection.vercel.app" }));
app.use(helmet());
app.set("trust proxy", 1);
// app.use(rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }));

// routes
const userAccess = require("./Route/userAuthRoute");
const transaction = require("./Route/transactionRoute");
const cartItems = require("./Route/cartRoute");
app.use("/api/v1/userverification", userAccess);
app.use("/api/v1/transaction", transaction);
app.use("/api/v1/cart", cartItems);

const connectDB = require("./Database/adminDB.js");
const connectAdminToDataBase = async () => {
  try {
    await connectDB(process.env.MONGODB_URL);
    app.listen(process.env.PORT || 2222, () => {
      console.log("app is listening on port 2222");
    });
  } catch (error) {
    console.log(error);
  }
};
connectAdminToDataBase();
// mmbm