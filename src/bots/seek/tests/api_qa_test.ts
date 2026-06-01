#!/usr/bin/env bun
/**
 * Direct API test for Q&A functionality
 * Tests the intelligent Q&A handler with job JSON files
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getIntelligentAnswers } from './intelligent_qa_handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock workflow context for API testing
const createMockContext = (jobFilePath: string) => ({
  driver: null, // Not needed for API testing
  sessionExists: false,
  sessionsDir: '',
  humanBehavior: null,
  sessionManager: null,
  currentJobFile: jobFilePath
});

// Sample questions to test (similar to what would be extracted from a job page)
const SAMPLE_QUESTIONS = [
  {
    question: "Which of the following statements best describes your right to work in Australia?",
    type: "select",
    options: [
      "I'm an Australian citizen",
      "I'm a permanent resident and/or NZ citizen",
      "I have a family/partner visa with no restrictions",
      "I have a graduate temporary work visa",
      "I have a holiday temporary work visa"
    ],
    containerSelector: "#test-question-1"
  },
  {
    question: "How many years' experience do you have as a full stack developer?",
    type: "select",
    options: [
      "No experience",
      "Less than 1 year",
      "1 year",
      "2 years",
      "3 years",
      "4 years",
      "5 years",
      "More than 5 years"
    ],
    containerSelector: "#test-question-2"
  },
  {
    question: "Which of the following programming languages are you experienced in?",
    type: "checkbox",
    options: [
      "JavaScript",
      "HTML",
      "CSS",
      "Java",
      "C",
      "C#",
      "Python",
      "C++",
      ".NET",
      "Objective-C",
      "PHP",
      "Swift",
      "Ruby",
      "Scala",
      "Visual Basic",
      "None of these"
    ],
    containerSelector: "#test-question-3"
  },
  {
    question: "Please describe your experience with React development",
    type: "text",
    options: [],
    containerSelector: "#test-question-4"
  }
];

async function testQAAPI(jobFilePath: string): Promise<void> {
  console.log(`🧪 Testing Q&A API with job file: ${jobFilePath}`);
  console.log('═'.repeat(80));

  // Check if job file exists
  if (!fs.existsSync(jobFilePath)) {
    console.error(`❌ Job file not found: ${jobFilePath}`);
    return;
  }

  // Read and display job details
  const jobData = JSON.parse(fs.readFileSync(jobFilePath, 'utf8'));
  console.log(`📋 Job: ${jobData.title} at ${jobData.company}`);
  console.log(`📅 Applied: ${jobData.dateApplied || 'Not applied'}`);
  if (jobData.employerQuestions) {
    console.log(`❓ Employer Questions: ${jobData.employerQuestions.length} found`);
  }
  console.log('');

  // Enable API test mode for logging
  (globalThis as any).API_TEST_MODE = true;

  // Create output directory
  const outputDir = path.join(__dirname, '../../../apitestjsons');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    // Create mock context
    const ctx = createMockContext(jobFilePath);

    console.log('🔍 Testing with sample questions...');
    console.log('');

    // Test with sample questions
    const answers = await getIntelligentAnswers(SAMPLE_QUESTIONS, ctx as any);

    console.log('📊 Results:');
    console.log('═'.repeat(40));

    answers.forEach((answer, index) => {
      console.log(`\n${index + 1}. ${answer.question}`);
      console.log(`   Type: ${answer.type}`);
      console.log(`   Source: ${answer.answerSource}`);

      if (answer.type === 'select') {
        const selectedOption = answer.options?.[answer.selectedAnswer];
        console.log(`   Answer: [${answer.selectedAnswer}] ${selectedOption || 'N/A'}`);
      } else if (answer.type === 'checkbox') {
        console.log(`   Answer: ${answer.selectedAnswer ? answer.selectedAnswer.join(', ') : 'None'}`);
      } else if (answer.type === 'text') {
        console.log(`   Answer: "${answer.textAnswer || 'N/A'}"`);
      }
    });

    // If job has actual employer questions, test with those too
    if (jobData.employerQuestions && jobData.employerQuestions.length > 0) {
      console.log('\n\n🔍 Testing with actual employer questions from job...');
      console.log('═'.repeat(50));

      const actualAnswers = await getIntelligentAnswers(jobData.employerQuestions, ctx as any);

      actualAnswers.forEach((answer, index) => {
        console.log(`\n${index + 1}. ${answer.question}`);
        console.log(`   Type: ${answer.type}`);
        console.log(`   Source: ${answer.answerSource}`);

        if (answer.type === 'select') {
          const selectedOption = answer.options?.[answer.selectedAnswer];
          console.log(`   Answer: [${answer.selectedAnswer}] ${selectedOption || 'N/A'}`);
        } else if (answer.type === 'checkbox') {
          console.log(`   Answer: ${answer.selectedAnswer ? answer.selectedAnswer.join(', ') : 'None'}`);
        } else if (answer.type === 'text') {
          console.log(`   Answer: "${answer.textAnswer || 'N/A'}"`);
        }
      });
    }

    console.log('\n✅ API test completed successfully!');

    // Show saved files
    if (fs.existsSync(path.join(outputDir, 'api_request.json'))) {
      console.log(`📄 API request saved to: ${path.join(outputDir, 'api_request.json')}`);
    }
    if (fs.existsSync(path.join(outputDir, 'api_response.json'))) {
      console.log(`📄 API response saved to: ${path.join(outputDir, 'api_response.json')}`);
    }

  } catch (error) {
    console.error(`❌ API test failed: ${error.message}`);
    console.error(error.stack);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: bun api_qa_test.ts <job-file-path>');
    console.log('');
    console.log('Example:');
    console.log('  bun api_qa_test.ts ../jobs/company_1234567890.json');
    console.log('');
    console.log('Available job files:');

    const jobsDir = path.join(__dirname, '../jobs');
    if (fs.existsSync(jobsDir)) {
      const jobFiles = fs.readdirSync(jobsDir).filter(f => f.endsWith('.json'));
      jobFiles.slice(0, 5).forEach(file => {
        console.log(`  ${file}`);
      });
      if (jobFiles.length > 5) {
        console.log(`  ... and ${jobFiles.length - 5} more`);
      }
    }
    return;
  }

  const jobFilePath = path.resolve(args[0]);
  await testQAAPI(jobFilePath);
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Failed to run API test:', error);
    process.exit(1);
  });
}

export { testQAAPI };