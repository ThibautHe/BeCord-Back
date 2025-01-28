const mongoose = require("mongoose");
const MessagesSchema = require("./MessageSchema");

const LobbySchema = new mongoose.Schema({
  messages: [MessagesSchema],
  usersId: [Number],
  ceated_at: Date,
});

module.exports = LobbySchema;
