/**
 * Job Application Handler
 * Processes job applications with AI-generated content from corpus-rag
 */

import { CorpusRagClient, categorizeError } from './corpus-rag-client.js';
import { CorpusRagAuth } from './corpus-rag-auth.js';

export class JobApplicationHandler {
  
  /**
   * Process job application with AI-generated content
   * @param {Object} jobData - Job information from scraper
   * @returns {Promise<Object>} Result with generated content or error
   */
  static async processJobApplication(jobData) {
    try {
      const user = CorpusRagAuth.getCurrentUser();
      
      if (!user) {
        return {
          success: false,
          error: 'auth_required',
          message: 'Please login to continue'
        };
      }
      
      console.log('🔄 Processing job application:', jobData.title);
      
      // Prepare job details
      const jobDetails = {
        title: jobData.title || '',
        company: jobData.company || '',
        description: jobData.description || '',
        requirements: jobData.requirements || [],
        url: jobData.url || '',
        platform: jobData.platform || 'unknown'
      };
      
      const result = {
        success: true,
        data: {
          coverLetter: null,
          resume: null,
          answers: null,
          jobId: null
        },
        warnings: []
      };
      
      // Generate cover letter if user has permission
      if (user.apiPermissions.cover_letter) {
        try {
          console.log('📝 Generating cover letter...');
          const clResult = await CorpusRagClient.generateCoverLetter(
            jobDetails,
            user.email
          );
          result.data.coverLetter = clResult.data.coverLetter;
          console.log('✅ Cover letter generated');
        } catch (error) {
          console.error('❌ Cover letter generation failed:', error);
          result.warnings.push({
            type: 'cover_letter',
            message: error.message
          });
        }
      } else {
        result.warnings.push({
          type: 'cover_letter',
          message: 'Cover letter generation not available for your account'
        });
      }
      
      // Generate tailored resume if user has premium access
      if (user.apiPermissions.resume) {
        try {
          console.log('📄 Generating tailored resume...');
          const resumeResult = await CorpusRagClient.generateResume(
            jobDetails,
            user.email,
            'tailored'
          );
          result.data.resume = resumeResult.data.resume;
          console.log('✅ Resume generated');
        } catch (error) {
          console.error('❌ Resume generation failed:', error);
          result.warnings.push({
            type: 'resume',
            message: error.message
          });
        }
      } else {
        result.warnings.push({
          type: 'resume',
          message: 'Resume generation requires premium account'
        });
      }
      
      // Answer employer questions if any
      if (jobData.questions && jobData.questions.length > 0) {
        if (user.apiPermissions.questionAndAnswers) {
          try {
            console.log('❓ Generating answers to employer questions...');
            const answersResult = await CorpusRagClient.generateQuestionAnswers(
              jobData.questions,
              user.email,
              jobDetails
            );
            result.data.answers = answersResult.data.answers;
            console.log('✅ Answers generated');
          } catch (error) {
            console.error('❌ Answer generation failed:', error);
            result.warnings.push({
              type: 'answers',
              message: error.message
            });
          }
        } else {
          result.warnings.push({
            type: 'answers',
            message: 'Question answering requires premium account'
          });
        }
      }
      
      // Save job application data
      if (user.apiPermissions.jobs) {
        try {
          console.log('💾 Saving job application...');
          const saveResult = await CorpusRagClient.saveJob({
            jobDetails,
            generatedContent: {
              coverLetter: result.data.coverLetter,
              resume: result.data.resume,
              answers: result.data.answers
            },
            appliedAt: new Date().toISOString(),
            status: 'pending'
          });
          result.data.jobId = saveResult.data?.id;
          console.log('✅ Job application saved');
        } catch (error) {
          console.error('❌ Failed to save job:', error);
          result.warnings.push({
            type: 'save',
            message: 'Failed to save job application data'
          });
        }
      }
      
      console.log('✅ Job application processed successfully');
      return result;
      
    } catch (error) {
      console.error('❌ Job application processing error:', error);
      
      const errorType = categorizeError(error);
      
      // Handle specific errors
      if (errorType === 'SESSION_EXPIRED') {
        return {
          success: false,
          error: 'session_expired',
          message: 'Your session has expired. Please login again.'
        };
      }
      
      if (errorType === 'PERMISSION_DENIED') {
        return {
          success: false,
          error: 'permission_denied',
          message: 'This feature requires a premium account. Please upgrade to continue.'
        };
      }
      
      if (errorType === 'LIMIT_REACHED') {
        return {
          success: false,
          error: 'limit_reached',
          message: 'You have reached your monthly limit. Please upgrade to continue.'
        };
      }
      
      return {
        success: false,
        error: 'processing_failed',
        message: error.message || 'Failed to process job application'
      };
    }
  }
  
  /**
   * Check if user can process job applications
   * @returns {Object} Result with canProcess boolean and reasons
   */
  static checkUserPermissions() {
    const user = CorpusRagAuth.getCurrentUser();
    
    if (!user) {
      return {
        canProcess: false,
        reasons: ['Not logged in']
      };
    }
    
    const reasons = [];
    const permissions = user.apiPermissions;
    
    if (!permissions.cover_letter && !permissions.resume && !permissions.questionAndAnswers) {
      reasons.push('No AI generation permissions');
    }
    
    return {
      canProcess: reasons.length === 0,
      reasons,
      permissions: {
        coverLetter: permissions.cover_letter,
        resume: permissions.resume,
        questionAnswers: permissions.questionAndAnswers,
        saveJobs: permissions.jobs
      }
    };
  }
  
  /**
   * Upload user's resume to corpus-rag
   * @param {File} file - Resume file
   * @returns {Promise<Object>} Upload result
   */
  static async uploadResume(file) {
    try {
      const user = CorpusRagAuth.getCurrentUser();
      
      if (!user) {
        return {
          success: false,
          error: 'Not authenticated'
        };
      }
      
      if (!user.apiPermissions.upload) {
        return {
          success: false,
          error: 'Upload permission required'
        };
      }
      
      const result = await CorpusRagClient.uploadFile(file, user.email);
      
      return {
        success: true,
        data: result.data
      };
      
    } catch (error) {
      console.error('Resume upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get user's job application history
   * @returns {Promise<Object>} List of jobs
   */
  static async getJobHistory() {
    try {
      const result = await CorpusRagClient.getJobs();
      return {
        success: true,
        jobs: result.data.jobs || [],
        total: result.data.total || 0
      };
    } catch (error) {
      console.error('Failed to get job history:', error);
      return {
        success: false,
        error: error.message,
        jobs: [],
        total: 0
      };
    }
  }
}

