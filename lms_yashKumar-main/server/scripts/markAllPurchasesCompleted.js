const mongoose = require('mongoose');
const path = require('path');
const dbPath = path.resolve(__dirname, '../models/coursePurchase.model.js');
const { CoursePurchase } = require(dbPath);

const MONGO_URI = 'mongodb://localhost:27017/lms';

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    const res = await CoursePurchase.updateMany({ status: { $ne: 'completed' } }, { status: 'completed' });
    console.log('Updated:', res);
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }); 