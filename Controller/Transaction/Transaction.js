const transactionSchema = require("../../Schema/transactionSchema.js");
const userSchema = require("../../Schema/userSchema.js");
const jwt = require("jsonwebtoken");
const axios = require("axios");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const YOUR_DOMAIN = "http://localhost:3000";
const postTransaction = async (req, res) => {
  try {
    const {
      deliveryaddress,
      product,
      anyinfo,
      deliveryfee,
      homedelivery,
      paymentMethod,
    } = req.body;

    // Check if the user has a successful token login
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({
        status: "FAILED",
        message: "No token provided. You don't have access to this data.",
      });
    }

    // Split token from bearer and get real value to verify
    const token = auth.split(" ")[1];
    const verifyToken = jwt.verify(token, process.env.SECRET);

    if (!verifyToken) {
      return res
        .status(401)
        .json({ status: "ERROR", message: "Invalid token access." });
    }

    const user = await userSchema.findById(verifyToken.id);
    if (!user) {
      return res.status(401).json({ msg: "User not found." });
    }

    const deliverycharges = deliveryfee + homedelivery;
    const products = [];
    let totalAmount = deliverycharges;

    for (const p of product) {
      const total = p.productprice * p.quantity;
      const newProduct = {
        productname: p.productname,
        productprice: p.productprice,
        productspec: p.productspec,
        quantity: p.quantity,
        clientnote: p.clientnote,
        total: total,
      };
      products.push(newProduct);
      totalAmount += total;
    }

    const productsWithTotal = products.map((p) => ({
      productname: p.productname,
      productprice: p.productprice,
      productspec: p.productspec,
      quantity: p.quantity,
      clientnote: p.clientnote,
      total: p.total,
    }));

    const lineItems = [
      ...products.map((p) => ({
        price_data: {
          currency: "usd",
          product_data: {
            name: p.productname,
          },
          unit_amount: p.productprice * 100, // Convert to smallest currency unit (e.g., cents)
          tax_behavior: "exclusive", // Set the appropriate tax behavior here
        },
        quantity: p.quantity,
      })),
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Delivery Charges",
          },
          unit_amount: deliverycharges * 100, // Convert to cents
          tax_behavior: "exclusive", // Set the appropriate tax behavior here
        },
        quantity: 1,
      },
    ];
    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount * 100, // Amount in cents
      currency: "usd",
      payment_method_types: ["card"],
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${YOUR_DOMAIN}/orders`,
      cancel_url: `${YOUR_DOMAIN}`,
      // payment_intent_data: {
      //   // Associate the PaymentIntent with the Checkout Session
      //   client_secret: paymentIntent.client_secret,
      //   id: paymentIntent.id,
      // },
      automatic_tax: { enabled: true },
    });

    console.log(session);
    console.log(paymentIntent);
    const Transaction = new transactionSchema({
      deliveryaddress: deliveryaddress,
      product: productsWithTotal,
      totalAmount: totalAmount,
      anyinfo: anyinfo,
      deliveryfee,
      homedelivery,

      // Add other transaction properties
    });

    user.transaction.unshift(Transaction);
    await user.save();
    Transaction.user.unshift(user);
    await Transaction.save();

    res.status(200).json({
      status: "SUCCESS",
      data: {
        Transaction,
        paymentIntent: paymentIntent, // Use session.client_secret instead of paymentIntent.client_secret
        url: session.url,
      },
    });
  } catch (error) {
    // console.log(error);
    res.status(500).json({
      status: "FAILED",
      message: "An error occurred during the transaction.",
      error: error.message, // Include the error message for debugging purposes
    });
  }
};
// transaction status
const getTransactionStatus = async (req, res) => {
  const { paymentIntentId } = req.body;
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const transactionStatus = paymentIntent.status;
    console.log(transactionStatus); // Output: Status of the transaction

    res.status(200).json({
      status: "SUCCESS",
      data: {
        status: transactionStatus,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "FAILED",
      message: "An error occurred while retrieving the transaction status.",
      error: error.message,
    });
  }
};

// FETCH ALL TRANSACTION
const allTransaction = async (req, res) => {
  try {
    // check if the user has a successful token lopgin
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({
        status: "FAILED",
        message: "No token provided, You dont have access to this data",
      });
    }

    // split token from bearer and get real value to verify
    const token = auth.split(" ")[1];
    const verifyToken = jwt.verify(token, process.env.SECRET);

    if (!verifyToken) {
      return res
        .status(401)
        .json({ status: "ERROR", message: "Invalide token access" });
    }
    // get all transaction the the database populated by the respective users
    const transaction = await transactionSchema
      .find({})
      .sort({ createdAt: -1 })
      .populate({ path: "user" });
    res.status(200).json({ status: "SUCCESS", data: transaction });
  } catch (error) {
    throw Error(error.message);
  }
};

//FETCH SINGLE TRANSACTION
const getSingleTransaction = async (req, res) => {
  try {
    // check if the user has a successful token lopgin
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({
        status: "FAILED",
        message: "No token provided, You dont have access to this data",
      });
    }

    // split token from bearer and get real value to verify
    const token = auth.split(" ")[1];
    const verifyToken = jwt.verify(token, process.env.SECRET);

    if (!verifyToken) {
      return res
        .status(401)
        .json({ status: "ERROR", message: "Invalide token access" });
    }
    // get all users the the database
    const singleTransaction = await transactionSchema
      .findById(req.params.id)
      .populate({
        path: "user",
      });

    // console.log(transaction);
    res.status(200).json({ status: "SUCCESS", data: singleTransaction });
  } catch (error) {
    throw Error(error.message);
  }
};

// update transaction status
const updateTransaction = async (req, res) => {
  try {
    // check if there is successfull token login
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({
        status: "FAILED",
        message: "No token provided, You dont have access to this data",
      });
    }

    // get token and verify with jwt
    const token = auth.split(" ")[1];
    const verifyToken = await jwt.verify(token, process.env.SECRET);
    if (!verifyToken) {
      return res
        .status(401)
        .json({ status: "ERROR", message: "Invalide token access" });
    }

    // find user with token
    const allowAccess = await userSchema.findOne({
      _id: verifyToken.id,
    });

    // condition user with access
    if (allowAccess.verified != true) {
      return res.status(401).json({
        status: "ERROR",
        message: "You are not authorized to perform this action",
      });
    }

    // update transaction
    const transaction = await transactionSchema.findOneAndUpdate(
      { _id: req.params.id }, // specify the user to update
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json({ status: "SUCCESS", data: transaction });
  } catch (error) {
    throw new Error(error.message);
  }
};

const transactionStatus = async (req, res) => {
  try {
    const processingTransactions = await transactionSchema.find({
      status: "Processing",
    });
    const transactionDelivered = await transactionSchema.find({
      status: "Delivered",
    });
    const openTransaction = await transactionSchema.find({
      status: "Open",
    });

    return res.status(200).json({
      success: true,
      Processing: processingTransactions,
      Delivered: transactionDelivered,
      Open: openTransaction,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Retrieve transaction staus
const getTransactionStatusInfo = async (req, res) => {
  const { transactID } = req.body;

  try {
    if (transactID) {
      const paymentIntent = await stripe.paymentIntents.retrieve(transactID);
      const transactionStatus = paymentIntent.status;
      // console.log(transactionStatus);
      // transactionStatus will contain the status of the payment intent
      return res.status(200).json({
        status: transactionStatus,
      });
    }
  } catch (error) {
    throw new Error(error);
  }
};
// console.log(transactionSchema.filter((item) => item.status === "Processing"));
module.exports = {
  postTransaction,
  updateTransaction,
  allTransaction,
  getSingleTransaction,
  transactionStatus,
  getTransactionStatus,
  getTransactionStatusInfo,
};
