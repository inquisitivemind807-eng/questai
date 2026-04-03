/**
 * Corpus-RAG API Client
 * Provides methods to interact with corpus-rag AI generation APIs
 */

import { CorpusRagAuth } from './corpus-rag-auth.js';

const CORPUS_RAG_API_URL = import.meta.env.VITE_CORPUS_RAG_API_URL || 'http://localhost:5173/api';

export class CorpusRagClient {
  
  /**
   * Make authenticated request to corpus-rag API
   */
  static async request(endpoint, options = {}) {
    const token = CorpusRagAuth.getToken();
    
    if (!token) {
      throw new Error('Not authenticated. Please login first.');
    }
    
    const url = `${CORPUS_RAG_API_URL}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    try {
      const response = await fetch(url, {
        ...options,
        headers
      });
      
      // Handle auth errors
      if (response.status === 401) {
        // Token expired, logout
        await CorpusRagAuth.logout();
        throw new Error('Session expired. Please login again.');
      }
      
      if (response.status === 403) {
        const data = await response.json();
        if (data.error && data.error.includes('limit')) {
          throw new Error('Monthly limit reached. Please upgrade your account.');
        }
        throw new Error('Permission denied. Please upgrade your account.');
      }
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }
      
      return data;
      
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }
  
  /**
   * Generate cover letter
   * @param {Object} jobDetails - Job information (title, company, description, requirements)
   * @param {string} userEmail - User's email address
   * @param {string} customPrompt - Optional custom prompt override
   */
  static async generateCoverLetter(jobDetails, userEmail, customPrompt = null) {
    console.log('🔄 Generating cover letter...');
    
    const result = await this.request('/cover_letter', {
      method: 'POST',
      body: JSON.stringify({
        jobDetails,
        userEmail,
        customPrompt
      })
    });
    
    console.log('✅ Cover letter generated successfully');
    return result;
  }
  
  /**
   * Generate tailored resume
   * @param {Object} jobDetails - Job information
   * @param {string} userEmail - User's email address
   * @param {string} resumeType - Type of resume ('tailored' or 'general')
   * @param {string} customPrompt - Optional custom prompt override
   */
  static async generateResume(jobDetails, userEmail, resumeType = 'tailored', customPrompt = null) {
    console.log('🔄 Generating resume...');
    
    const result = await this.request('/resume', {
      method: 'POST',
      body: JSON.stringify({
        jobDetails,
        userEmail,
        resumeType,
        customPrompt
      })
    });
    
    console.log('✅ Resume generated successfully');
    return result;
  }
  
  /**
   * Generate answers to employer questions
   * @param {Array} questions - Array of question objects with 'q' and 'opts' fields
   * @param {string} userEmail - User's email address
   * @param {Object} jobDetails - Job information for context
   * @param {string} customPrompt - Optional custom prompt override
   */
  static async generateQuestionAnswers(questions, userEmail, jobDetails, customPrompt = null) {
    console.log('🔄 Generating answers to employer questions...');
    
    const result = await this.request('/questionAndAnswers', {
      method: 'POST',
      body: JSON.stringify({
        questions,
        userEmail,
        jobDetails,
        customPrompt
      })
    });
    
    console.log('✅ Answers generated successfully');
    return result;
  }
  
  /**
   * Upload resume/document file
   * @param {File} file - File to upload
   * @param {string} userEmail - User's email address
   */
  static async uploadFile(file, userEmail) {
    const token = CorpusRagAuth.getToken();
    
    if (!token) {
      throw new Error('Not authenticated. Please login first.');
    }
    
    console.log('🔄 Uploading file...');
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('userEmail', userEmail);
    
    try {
      const response = await fetch(`${CORPUS_RAG_API_URL}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'File upload failed');
      }
      
      console.log('✅ File uploaded successfully');
      return data;
      
    } catch (error) {
      console.error('File upload error:', error);
      throw error;
    }
  }
  
  /**
   * Save job application data
   * @param {Object} jobData - Job application information
   */
  static async saveJob(jobData) {
    console.log('🔄 Saving job application...');
    
    const result = await this.request('/jobs', {
      method: 'POST',
      body: JSON.stringify(jobData)
    });
    
    console.log('✅ Job application saved');
    return result;
  }
  
  /**
   * Get user's saved jobs
   */
  static async getJobs() {
    return await this.request('/jobs', {
      method: 'GET'
    });
  }
  
  /**
   * Get user's current usage stats
   */
  static async getUsageStats() {
    return await this.request('/usage', {
      method: 'GET'
    });
  }
  
  /**
   * Query RAG system directly
   * @param {string} question - Question to ask
   * @param {string} userEmail - User's email address
   */
  static async queryRag(question, userEmail) {
    return await this.request('/query', {
      method: 'POST',
      body: JSON.stringify({
        question,
        userEmail
      })
    });
  }
  
  /**
   * Get user profile information
   */
  static async getUserProfile() {
    return await this.request('/auth/me', {
      method: 'GET'
    });
  }
}

/**
 * Error types for better error handling
 */
export const CorpusRagErrors = {
  AUTH_REQUIRED: 'Not authenticated',
  SESSION_EXPIRED: 'Session expired',
  PERMISSION_DENIED: 'Permission denied',
  LIMIT_REACHED: 'Monthly limit reached',
  NETWORK_ERROR: 'Network error',
  UNKNOWN_ERROR: 'Unknown error'
};

/**
 * Helper to categorize errors
 */
export function categorizeError(error) {
  const message = error.message.toLowerCase();
  
  if (message.includes('not authenticated')) {
    return CorpusRagErrors.AUTH_REQUIRED;
  }
  if (message.includes('session expired')) {
    return CorpusRagErrors.SESSION_EXPIRED;
  }
  if (message.includes('permission denied')) {
    return CorpusRagErrors.PERMISSION_DENIED;
  }
  if (message.includes('limit reached')) {
    return CorpusRagErrors.LIMIT_REACHED;
  }
  if (message.includes('network') || message.includes('fetch')) {
    return CorpusRagErrors.NETWORK_ERROR;
  }
  
  return CorpusRagErrors.UNKNOWN_ERROR;
}

