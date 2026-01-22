// Create a test session token in MongoDB for bot testing
import { MongoClient } from 'mongodb';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'inquisitive_mind';

async function createTestSession() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(DB_NAME);

    // Find your user
    const user = await db.collection('users').findOne({
      email: 'puskarwagle17@gmail.com'
    });

    if (!user) {
      console.error('❌ User not found: puskarwagle17@gmail.com');
      process.exit(1);
    }

    console.log('✅ Found user:', user.email);
    console.log('User ID:', user._id);
    console.log('User Type:', user.userType);

    // Generate new session token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create session
    const session = {
      token,
      userId: user._id,
      createdAt: new Date(),
      expiresAt,
      lastUsedAt: new Date()
    };

    const result = await db.collection('sessions').insertOne(session);

    console.log('✅ Session created!');
    console.log('Session ID:', result.insertedId);
    console.log('Token:', token);
    console.log('Expires:', expiresAt.toISOString());

    // Save to cache file
    const cacheDir = path.join(process.cwd(), '.cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    fs.writeFileSync(path.join(cacheDir, 'api_token.txt'), token);
    console.log('✅ Token saved to .cache/api_token.txt');

    // Delete old JWT to force refresh
    const jwtPath = path.join(cacheDir, 'jwt_tokens.json');
    if (fs.existsSync(jwtPath)) {
      fs.unlinkSync(jwtPath);
      console.log('✅ Deleted old JWT tokens');
    }

    console.log('\n🎉 All done! You can now run: bun bot_starter.ts seek');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

createTestSession();
