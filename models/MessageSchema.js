const mongoose = require("mongoose");

const MessagesSchema = new mongoose.Schema({
  lobby: { type: Number, required: true },
  user: { type: Number, required: true },
  created_at: Date,
});

module.exports = MessagesSchema;
