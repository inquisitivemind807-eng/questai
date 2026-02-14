import type { WorkflowContext } from '../../core/workflow_engine';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const printLog = (message: string) => {
  console.log(message);
};

// Configuration interfaces for the new simple format
interface Question {
  id: number;
  match_keywords: string[];
  answer: string[];
}

interface GenericQuestionsConfig {
  lastUpdated: string;
  questions: Question[];
  settings: {
    autoAnswer: boolean;
  };
}

// Load configuration from JSON file
function loadGenericQuestionsConfig(): GenericQuestionsConfig {
  try {
    const configPath = path.join(__dirname, '../config/generic_questions_config.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    printLog(`❌ Failed to load generic questions config: ${error}`);
    // Return minimal config as fallback
    return {
      lastUpdated: new Date().toISOString(),
      questions: [],
      settings: {
        autoAnswer: true,
      }
    };
  }
}

// Save updated configuration
function saveGenericQuestionsConfig(config: GenericQuestionsConfig): void {
  try {
    const configPath = path.join(__dirname, '../config/generic_questions_config.json');
    config.lastUpdated = new Date().toISOString();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    printLog(`✅ Generic questions config saved successfully`);
  } catch (error) {
    printLog(`❌ Failed to save generic questions config: ${error}`);
  }
}

// Export config management functions for UI
export function getGenericQuestionsConfig(): GenericQuestionsConfig {
  return loadGenericQuestionsConfig();
}

export function updateGenericQuestionsConfig(config: GenericQuestionsConfig): boolean {
  try {
    saveGenericQuestionsConfig(config);
    return true;
  } catch (error) {
    printLog(`❌ Failed to update config: ${error}`);
    return false;
  }
}

export function updateQuestionAnswer(questionId: string, newAnswer: any): boolean {
  try {
    const config = loadGenericQuestionsConfig();
    const question = config.questions.find(q => q.id.toString() === questionId);

    if (!question) {
      return false;
    }

    // Update the answer array with the new answer
    if (newAnswer.textValue || newAnswer.customText) {
      question.answer = [newAnswer.textValue || newAnswer.customText];
    }

    saveGenericQuestionsConfig(config);
    return true;
  } catch (error) {
    printLog(`❌ Failed to update question answer: ${error}`);
    return false;
  }
}

// Check if a question can be answered generically
export function isGenericQuestion(questionText: string): boolean {
  const config = loadGenericQuestionsConfig();

  if (!config.settings.autoAnswer) {
    return false;
  }

  return config.questions.some((question) =>
    question.match_keywords
      .map((keyword) => (keyword || '').trim())
      .filter(Boolean)
      .some((keyword) => new RegExp(keyword, 'i').test(questionText))
  );
}

// --- NEW --- Helper function to normalize text for comparison
function normalizeText(text: string): string {
  if (!text) return '';
  // Lowercase, remove punctuation, and trim whitespace
  return text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '').trim();
}

// --- NEW --- Helper function to parse numeric values from strings like "$120k" or "5+ years"
function parseNumericValue(text: string): number | null {
  if (!text) return null;

  // Handle "more than X years" cases
  const moreThanMatch = text.match(/more than (\d+)/i);
  if (moreThanMatch && moreThanMatch[1]) {
    return parseInt(moreThanMatch[1], 10);
  }
  
  let numericText = text.replace(/[^0-9.k+]/gi, '');
  
  if (numericText.toLowerCase().includes('k')) {
    numericText = numericText.toLowerCase().replace('k', '');
    const value = parseFloat(numericText) * 1000;
    return isNaN(value) ? null : value;
  }
  
  if (numericText.includes('+')) {
    numericText = numericText.replace('+', '');
    const value = parseFloat(numericText);
    return isNaN(value) ? null : value;
  }

  const value = parseFloat(numericText);
  return isNaN(value) ? null : value;
}


// Get generic answer for a question using the new JSON configuration
export function getGenericAnswer(questionText: string, questionType: string, options: string[] = []): any {
  const config = loadGenericQuestionsConfig();

  for (const question of config.questions) {
    const validKeywords = question.match_keywords
      .map((keyword) => (keyword || '').trim())
      .filter(Boolean);
    const answerConfig = (question.answer || [])
      .map((answer) => String(answer ?? '').trim())
      .filter(Boolean);
    const matches = validKeywords.some((keyword) => new RegExp(keyword, 'i').test(questionText));

    if (matches && answerConfig.length > 0) {
      printLog(`🎯 Generic answer found for: "${questionText}"`);

      // Special handling for salary questions
      if (validKeywords.some(k => k.includes('salary'))) {
        const desiredSalary = parseNumericValue(answerConfig[0]);
        if (desiredSalary !== null) {
          let bestOptionIndex = -1;
          let bestOptionValue = -1;

          // Find the highest option that is less than or equal to the desired salary
          options.forEach((opt, index) => {
            const optionSalary = parseNumericValue(opt);
            if (optionSalary !== null && optionSalary <= desiredSalary) {
              if (optionSalary > bestOptionValue) {
                bestOptionValue = optionSalary;
                bestOptionIndex = index;
              }
            }
          });

          if (bestOptionIndex !== -1) {
            printLog(`📝 Salary answer: ${bestOptionIndex} (for option "${options[bestOptionIndex]}")`);
            return bestOptionIndex;
          }
        }
      }

      switch (questionType) {
        case 'select':
        case 'radio':
          // Find the index of the option that exactly matches one of the answer strings
          for (const ans of answerConfig) {
            const normalizedAns = normalizeText(ans);
            const index = options.findIndex(opt => normalizeText(opt) === normalizedAns);
            if (index !== -1) {
              printLog(`📝 Generic answer (exact match): ${index} (for option "${options[index]}")`);
              return index;
            }
          }
          // Fallback to 'includes' for partial matches (e.g., "5 years" in "5+ years")
          for (const ans of answerConfig) {
            const normalizedAns = normalizeText(ans);
            const index = options.findIndex(opt => normalizeText(opt).includes(normalizedAns));
            if (index !== -1) {
              printLog(`📝 Generic answer (partial match): ${index} (for option "${options[index]}")`);
              return index;
            }
          }
          printLog(`⚠️ Could not find a matching option for question: "${questionText}"`);
          return null;

        case 'checkbox':
          const selectedIndices: number[] = [];
          options.forEach((option, index) => {
            if (answerConfig.some(ans => normalizeText(option).includes(normalizeText(ans)))) {
              selectedIndices.push(index);
            }
          });
          printLog(`📝 Generic answer: ${JSON.stringify(selectedIndices)}`);
          return selectedIndices;

        case 'text':
        case 'textarea':
        case 'number':
        case 'date':
        case 'email':
        case 'tel':
        case 'url':
          printLog(`📝 Generic answer: "${answerConfig[0] || ''}"`);
          return answerConfig[0] || ''; // Return the first answer

        default:
          return null;
      }
    }
  }

  printLog(`❓ No generic answer found for: "${questionText}"`);
  return null;
}
