const mongoose = require("mongoose");
const LobbySchema = require("./LobbySchema");

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  status: Boolean,
  lobbies: [{ type: mongoose.Schema.Types.ObjectId, ref: "lobby" }],
});

const userModel = mongoose.model("user", UserSchema);

module.exports = userModel;
