const mongoose = require("mongoose");
const { connectToDb } = require("./db");
const express = require("express");
const userSchema = require("../models/UserModel");

const app = express();

app.use(express.json());

app.post("/test", (req, res) => {
  const { email, username, password, status, lobbys } = req.body;
  try {
    const user = new userSchema(req.body);
    user.save();
    res.json({ user });
    console.log("test");
  } catch {
    res.json({ err: "errrrrr" });
  }
});

app.get("/", async (req, res) => {
  const users = await userSchema.find(); // in progress

  console.log(users);

  res.json(users);
});

connectToDb(() => {
  app.listen(3000, () => {
    console.log("app is listening on port" + 3000);
  });
});
