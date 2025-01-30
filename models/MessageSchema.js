const mongoose = require("mongoose");

const MessagesSchema = new mongoose.Schema({
  message:{type:String, required:true},
  user: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
  created_at: {type:Date,default:Date.now()},
});

const messagesModel = mongoose.model("messages", MessagesSchema);

module.exports = messagesModel;
