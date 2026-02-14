# Artifact Contract

## Job details

`job_details.json` minimum fields:

- `job_id` or `jobId`
- `title`
- `company`
- `description` or `details`
- optional metadata (`location`, `salary`, `job_type_tags`, `requiredSkills`, `requiredExperience`)

## Cover letter

- request: `cover_letter_request.json`
- response: `cover_letter_response.json`
- final content accepted keys:
  - `cover_letter`
  - `coverLetter`

## Resume

- request: `resume_request.json`
- response: `resume_response.json`
- generated text accepted keys:
  - `resume`
  - `generatedText`
  - `tailoredResume`

## Q&A

Primary artifact: `qna.json`

```json
{
  "questions": [
    {
      "question": "How many years of React experience?",
      "type": "select",
      "options": ["1-2", "3-5", "5+"],
      "selected": 2,
      "answer": "5+",
      "answerSource": "AI API",
      "status": "success"
    }
  ]
}
```

Fallback artifacts:

- `qna_request.json` (question list)
- `qna_response.json` (LLM output)

Recorder falls back to request/response parsing when rich `qna.json` is missing.
