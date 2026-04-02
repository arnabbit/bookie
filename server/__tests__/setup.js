const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test_jwt_secret';
  process.env.CLIENT_URL = 'http://localhost:3000';
  process.env.GOOGLE_CLIENT_ID = 'test_client_id';
  process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret';
  process.env.PORT = '5001';
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
