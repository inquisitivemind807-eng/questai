// Create a test session token in MongoDB for bot testing
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB_NAME || 'inquisitive_mind';

async function createTestSession() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
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
    
    await db.collection('sessions').insertOne(session);
    
    console.log('✅ Session created!');
    console.log('Token:', token);
    console.log('Expires:', expiresAt.toISOString());
    
    // Save to cache file
    const fs = require('fs');
    const cacheDir = '/home/wagle/inquisitive_mind/finalboss/.cache';
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(`${cacheDir}/api_token.txt`, token);
    console.log('✅ Token saved to .cache/api_token.txt');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

createTestSession();
