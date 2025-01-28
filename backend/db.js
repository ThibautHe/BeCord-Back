const mongoose = require("mongoose");

module.exports = {
  connectToDb: (cb) => {
    mongoose
      .connect("mongodb+srv://thibauthellinckx:xfZz8GKL5SWCkpIS@cluster0.yumnd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0/BeCode-Becord")
      .then(() => console.log("connected to database"));

      cb()
  },
};
