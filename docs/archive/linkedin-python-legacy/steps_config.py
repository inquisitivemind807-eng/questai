from __future__ import annotations
from .steps_impl import (
    open_check_login, credential_login, load_applied_job_ids, show_manual_login_prompt, 
    set_search_location, set_search_keywords, apply_filters, get_page_info, extract_job_details, 
    process_jobs, check_job_blacklist, extract_job_description, attempt_easy_apply, upload_resume, 
    answer_questions, submit_application, save_applied_job, external_apply, save_external_job, 
    application_failed, continue_processing, navigate_to_next_page, finish, open_jobs_page
)

WORKFLOW_META = {
	"title": "LinkedIn Jobs",
	"description": "Search and apply on LinkedIn Jobs",
	"start_step": "step0",
}

STEPS_CONFIG = {
	"step0": {
		"step": 0,
		"func": load_applied_job_ids,
		"transitions": {"applied job IDs loaded": "open_check_login", "retry": "open_check_login"},
		"timeout": 10,
		"on_timeout_event": "retry"
	},
	"open_check_login": {
		"step": 1,
		"func": open_check_login,
		"transitions": {
			"login not needed": "open_jobs_page", 
			"user needs to log in": "credential_login", 
			"cannot determine login status": "open_jobs_page",
			"no available page": "open_check_login",
			"failed to navigate": "open_check_login",
			"failed checking login status": "open_check_login"
		},
		"timeout": 30,
		"on_timeout_event": "failed to navigate"
	},
	"credential_login": {
		"step": 2,
		"func": credential_login,
		"transitions": {
			"login successful, on feed": "open_jobs_page", 
			"on feed, login successful": "open_jobs_page", 
			"no login credentials found": "show_manual_login_prompt", 
			"credentials login incomplete": "show_manual_login_prompt",
			"no available page": "open_check_login",
			"username input not found": "show_manual_login_prompt",
			"password input not found": "show_manual_login_prompt",
			"signin button click failed": "show_manual_login_prompt",
			"wait for redirect timeout": "show_manual_login_prompt",
			"credential login failed": "show_manual_login_prompt"
		},
		"timeout": 40,
		"on_timeout_event": "credential login failed"
	},
	"load_applied_job_ids": {
		"step": 3,
		"func": load_applied_job_ids,
		"transitions": {"applied job IDs loaded": "open_check_login", "retry": "open_check_login"},
		"timeout": 10,
		"on_timeout_event": "retry"
	},
	"show_manual_login_prompt": {
		"step": 4,
		"func": show_manual_login_prompt,
		"transitions": {"prompt displayed to user": "open_check_login", "error showing manual login": "open_check_login"},
		"timeout": 20,
		"on_timeout_event": "prompt displayed to user"
	},
	"open_jobs_page": {
		"step": 5,
		"func": open_jobs_page,
		"transitions": {"jobs page loaded": "set_search_location", "failed opening jobs page": "open_jobs_page"},
		"timeout": 30,
		"on_timeout_event": "failed opening jobs page"
	},
	"set_search_location": {
		"step": 6,
		"func": set_search_location,
		"transitions": {"search location set": "set_search_keywords", "no search location in settings": "set_search_keywords", "location input not found": "set_search_location", "failed setting search location": "set_search_location", "jobs page missing": "set_search_location"},
		"timeout": 30,
		"on_timeout_event": "failed setting search location"
	},
	"set_search_keywords": {
		"step": 7,
		"func": set_search_keywords,
		"transitions": {"search keywords set": "apply_filters", "no keywords in settings": "apply_filters", "keywords input not found": "set_search_keywords", "failed setting search keywords": "set_search_keywords", "jobs page missing": "set_search_keywords"},
		"timeout": 30,
		"on_timeout_event": "failed setting search keywords"
	},
	"apply_filters": {
		"step": 8,
		"func": apply_filters,
		"transitions": {"filters applied successfully": "get_page_info", "filters application failed": "get_page_info", "jobs page missing": "apply_filters"},
		"timeout": 40,
		"on_timeout_event": "filters application failed"
	},
	"get_page_info": {
		"step": 9,
		"func": get_page_info,
		"transitions": {"page info extracted": "extract_job_details", "pagination not found": "extract_job_details", "failed extracting page info": "get_page_info", "jobs page missing": "get_page_info"},
		"timeout": 20,
		"on_timeout_event": "failed extracting page info"
	},
	"extract_job_details": {
		"step": 10,
		"func": extract_job_details,
		"transitions": {
			"proceed to process jobs": "process_jobs", 
			"no jobs page found": "open_jobs_page",
			"no job cards found": "navigate_to_next_page",
			"failed extracting jobs": "extract_job_details"
		},
		"timeout": 60,
		"on_timeout_event": "failed extracting jobs"
	},
	"process_jobs": {
		"step": 11,
		"func": process_jobs,
		"transitions": {"starting to process jobs": "attempt_easy_apply", "no jobs to process": "finish", "error processing jobs": "finish"},
		"timeout": 10,
		"on_timeout_event": "error processing jobs"
	},
	# "check_job_blacklist": {
	# 	"step": 12,
	# 	"func": check_job_blacklist,
	# 	"transitions": {"extract_job_description": "extract_job_description", "continue_processing": "continue_processing", "retry": "check_job_blacklist"},
	# 	"timeout": 30,
	# 	"on_timeout_event": "retry"
	# },
	"extract_job_description": {
		"step": 13,
		"func": extract_job_description,
		"transitions": {"job description extracted": "attempt_easy_apply", "could not find description": "continue_processing", "jobs page missing": "extract_job_description"},
		"timeout": 30,
		"on_timeout_event": "could not find description"
	},
	"attempt_easy_apply": {
		"step": 14,
		"func": attempt_easy_apply,
		"transitions": {
			"proceeding to resume upload": "upload_resume", 
			"attempting external apply": "external_apply", 
			"no jobs page found": "open_jobs_page",
			"no job to process": "continue_processing",
			"job card not found": "continue_processing",
			"no easy apply button found": "external_apply",
			"failed to click easy apply": "external_apply",
			"easy apply process error": "continue_processing"
		},
		"timeout": 30,
		"on_timeout_event": "easy apply process error"
	},
	"upload_resume": {
		"step": 15,
		"func": upload_resume,
		"transitions": {"resume uploaded successfully": "answer_questions", "no resume path configured": "answer_questions", "resume file not found": "answer_questions", "proceeding without resume": "answer_questions", "jobs page missing": "upload_resume"},
		"timeout": 30,
		"on_timeout_event": "proceeding without resume"
	},
	"answer_questions": {
		"step": 16,
		"func": answer_questions,
		"transitions": {"finished answering questions": "submit_application", "error answering questions": "answer_questions", "jobs page missing": "answer_questions"},
		"timeout": 60,
		"on_timeout_event": "error answering questions"
	},
	"submit_application": {
		"step": 17,
		"func": submit_application,
		"transitions": {"proceeding to save job": "save_applied_job", "application failed to submit": "application_failed", "submit application error": "submit_application", "no jobs page found": "submit_application"},
		"timeout": 30,
		"on_timeout_event": "submit application error"
	},
	"save_applied_job": {
		"step": 18,
		"func": save_applied_job,
		"transitions": {"job saved": "continue_processing", "saving job failed": "save_applied_job"},
		"timeout": 20,
		"on_timeout_event": "saving job failed"
	},
	"external_apply": {
		"step": 19,
		"func": external_apply,
		"transitions": {"external apply clicked": "save_external_job", "external apply failed": "application_failed", "no apply button found": "application_failed", "external apply process error": "external_apply", "jobs page missing": "external_apply"},
		"timeout": 30,
		"on_timeout_event": "external apply process error"
	},
	"save_external_job": {
		"step": 20,
		"func": save_external_job,
		"transitions": {"external job saved": "continue_processing", "saving external job failed": "save_external_job"},
		"timeout": 20,
		"on_timeout_event": "saving external job failed"
	},
	"application_failed": {
		"step": 21,
		"func": application_failed,
		"transitions": {"application marked failed": "continue_processing", "failed to mark application failed": "application_failed"},
		"timeout": 20,
		"on_timeout_event": "failed to mark application failed"
	},
	"continue_processing": {
		"step": 22,
		"func": continue_processing,
		"transitions": {"starting to process jobs": "attempt_easy_apply", "all jobs processed": "navigate_to_next_page", "navigating to next page": "navigate_to_next_page", "continue processing error": "finish", "finishing workflow": "finish"},
		"timeout": 10,
		"on_timeout_event": "continue processing error"
	},
	"navigate_to_next_page": {
		"step": 23,
		"func": navigate_to_next_page,
		"transitions": {"page navigated": "extract_job_details", "no more pages": "finish", "navigation error": "finish"},
		"timeout": 30,
		"on_timeout_event": "navigation error"
	},
	"finish": {
		"step": 24,
		"func": finish,
		"transitions": {"workflow finished": None},
		"timeout": 10,
		"on_timeout_event": "workflow finished"
	},
} 