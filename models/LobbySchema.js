const mongoose = require("mongoose");
const MessagesSchema = require("./MessageSchema");
const UserSchema = require("./UserSchema");

const LobbySchema = new mongoose.Schema({
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: "messages" }],
  usersId: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
  admin: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
  created_at: {type:Date,default:Date.now()},
});

const LobbyModel = mongoose.model("lobby", LobbySchema);

module.exports = LobbyModel;
