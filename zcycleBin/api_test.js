#!/usr/bin/env node

/**
 * Simple API Test Script
 * Tests various API endpoints to debug issues
 */

const BASE_URL = 'http://localhost:3000';

async function testEndpoint(endpoint, method = 'GET', body = null) {
  console.log(`\n🔍 Testing ${method} ${endpoint}`);
  console.log('─'.repeat(50));

  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, options);

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Headers: ${JSON.stringify(Object.fromEntries(response.headers), null, 2)}`);

    const contentType = response.headers.get('content-type');
    let responseData;

    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    console.log(`Response:`, typeof responseData === 'string' ? responseData.substring(0, 500) : responseData);

    return { status: response.status, data: responseData };

  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return { status: 'ERROR', error: error.message };
  }
}

async function runTests() {
  console.log('🚀 API Testing Started');
  console.log('Base URL:', BASE_URL);

  // Test 1: Session endpoint
  await testEndpoint('/api/session');

  // Test 2: List all available API routes
  await testEndpoint('/api');

  // Test 3: Check if questionAndAnswers exists
  await testEndpoint('/api/questionAndAnswers', 'POST', {
    questions: [{
      q: "Test question?",
      opts: ["Option 1", "Option 2"]
    }],
    userEmail: "test@example.com",
    jobDetails: {
      title: "Test Job",
      company: "Test Company",
      description: "Test description"
    }
  });

  // Test 4: Check generic-questions endpoint
  await testEndpoint('/api/generic-questions');

  // Test 5: Check auth endpoint
  await testEndpoint('/api/auth');

  // Test 6: Test with different paths that might exist
  const testPaths = [
    '/api/question-answers',
    '/api/questions',
    '/api/qa',
    '/api/answer',
    '/api/generate'
  ];

  for (const path of testPaths) {
    await testEndpoint(path);
  }

  console.log('\n✅ API Testing Complete');
}

// Run the tests
runTests().catch(console.error);