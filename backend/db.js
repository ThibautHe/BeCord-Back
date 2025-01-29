const mongoose = require("mongoose");

module.exports = {
  connectToDb: (cb) => {
    mongoose
      .connect(
        "mongodb+srv://thibauthellinckx:xfZz8GKL5SWCkpIS@cluster0.yumnd.mongodb.net/BeCode-Becord?retryWrites=true&w=majority&appName=Cluster0"
      )
      .then(() => console.log("connected to database"));

    cb();
  },
};
