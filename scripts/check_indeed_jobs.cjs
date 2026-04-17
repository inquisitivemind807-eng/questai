const { MongoClient } = require('mongodb');

async function main() {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('inquisitive_mind');
    const userId = '68ec0f98ed6e56a3da76d973';
    
    console.log(`Searching for any indeed jobs...`);
    const jobs = await db.collection('indeed_jobs').find({}).limit(10).toArray();
    
    console.log(`Found ${jobs.length} jobs.`);
    jobs.forEach(j => {
      console.log(`- [${j.platformJobId}] ${j.title} at ${j.company} (${j.location}) [userId: ${j.userId}]`);
    });
  } finally {
    await client.close();
  }
}

main().catch(console.error);
