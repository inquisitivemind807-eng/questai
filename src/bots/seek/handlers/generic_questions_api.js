/**
 * API helpers for managing generic questions configuration
 * This can be used by a web UI to allow users to configure their answers
 */

import {
  getGenericQuestionsConfig,
  updateGenericQuestionsConfig,
  updateQuestionAnswer
} from './generic_question_handler.ts';

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success
 * @property {any} [data]
 * @property {string} [error]
 * @property {string} timestamp
 */

/**
 * Get all generic questions and their current answers
 * GET /api/generic-questions
 * @returns {ApiResponse}
 */
export function handleGetGenericQuestions() {
  try {
    const config = getGenericQuestionsConfig();

    return {
      success: true,
      data: {
        questions: config.questions.map(q => ({
          id: q.id,
          match_keywords: q.match_keywords,
          answer: q.answer
        })),
        settings: config.settings,
        lastUpdated: config.lastUpdated
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get generic questions: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Update a specific question's answer and keywords
 * PUT /api/generic-questions/:questionId
 * @param {string} questionId
 * @param {any} updateData
 * @returns {ApiResponse}
 */
export function handleUpdateQuestionAnswer(questionId, updateData) {
  try {
    const config = getGenericQuestionsConfig();
    const question = config.questions.find(q => q.id.toString() === questionId);

    if (!question) {
      return {
        success: false,
        error: `Question with ID '${questionId}' not found`,
        timestamp: new Date().toISOString()
      };
    }

    // Update match_keywords if provided
    if (updateData.match_keywords) {
      question.match_keywords = updateData.match_keywords;
    }

    // Update answer if provided
    if (updateData.answer) {
      question.answer = updateData.answer;
    }

    const success = updateGenericQuestionsConfig(config);

    if (success) {
      return {
        success: true,
        data: { questionId, updated: updateData },
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        success: false,
        error: 'Failed to save configuration',
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to update question: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Add a new question
 * POST /api/generic-questions
 * @param {any} questionData
 * @returns {ApiResponse}
 */
export function handleAddQuestion(questionData) {
  try {
    const config = getGenericQuestionsConfig();

    // Find the highest ID and add 1
    const maxId = config.questions.reduce((max, q) => Math.max(max, q.id), 0);
    const newQuestion = {
      id: maxId + 1,
      match_keywords: questionData.match_keywords || [''],
      answer: questionData.answer || ['']
    };

    config.questions.push(newQuestion);
    const success = updateGenericQuestionsConfig(config);

    if (success) {
      return {
        success: true,
        data: { question: newQuestion },
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        success: false,
        error: 'Failed to save configuration',
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to add question: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Delete a question
 * DELETE /api/generic-questions/:questionId
 * @param {string} questionId
 * @returns {ApiResponse}
 */
export function handleDeleteQuestion(questionId) {
  try {
    const config = getGenericQuestionsConfig();
    const initialLength = config.questions.length;

    config.questions = config.questions.filter(q => q.id.toString() !== questionId);

    if (config.questions.length === initialLength) {
      return {
        success: false,
        error: `Question with ID '${questionId}' not found`,
        timestamp: new Date().toISOString()
      };
    }

    const success = updateGenericQuestionsConfig(config);

    if (success) {
      return {
        success: true,
        data: { questionId },
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        success: false,
        error: 'Failed to save configuration',
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete question: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Update global settings for generic questions
 * PUT /api/generic-questions/settings
 * @param {any} newSettings
 * @returns {ApiResponse}
 */
export function handleUpdateSettings(newSettings) {
  try {
    const config = getGenericQuestionsConfig();
    config.settings = { ...config.settings, ...newSettings };

    const success = updateGenericQuestionsConfig(config);

    if (success) {
      return {
        success: true,
        data: { settings: config.settings },
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        success: false,
        error: 'Failed to update settings',
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to update settings: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get statistics about generic question usage
 * GET /api/generic-questions/stats
 * @returns {ApiResponse}
 */
export function handleGetStats() {
  try {
    const config = getGenericQuestionsConfig();

    const stats = {
      totalQuestions: config.questions.length,
      enabledQuestions: config.questions.length, // All are enabled by patterns
      autoAnswerEnabled: config.settings.autoAnswer,
      mostFrequentQuestion: config.questions.length > 0 ? {
        ...config.questions[0],
        description: `Question ${config.questions[0].id}`,
        frequency: 1
      } : null,
      questionTypes: config.questions.reduce((acc, q) => {
        acc.text = (acc.text || 0) + 1; // Default to text type
        return acc;
      }, { text: 0 }),
      totalFrequency: config.questions.length // Since we don't have actual frequency data
    };

    return {
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get stats: ${error}`,
      timestamp: new Date().toISOString()
    };
  }
}

// Example usage for SvelteKit or Express routes:
/*
// SvelteKit route: src/routes/api/generic-questions/+server.ts
export async function GET() {
  const response = handleGetGenericQuestions();
  return new Response(JSON.stringify(response), {
    status: response.success ? 200 : 500,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Express route:
app.get('/api/generic-questions', (req, res) => {
  const response = handleGetGenericQuestions();
  res.status(response.success ? 200 : 500).json(response);
});
*/