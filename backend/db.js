const mongoose = require("mongoose");
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' });

module.exports = {
  connectToDb: (cb) => {    
    mongoose
      .connect(process.env.MONGODB_URI)
      .then(() => {
        console.log("connected to database");
        cb();
      })
  },
};
