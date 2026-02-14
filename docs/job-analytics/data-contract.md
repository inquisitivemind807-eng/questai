# Data Contract: Bot Artifacts -> Job Analytics

## Local Artifact Contract (per job directory)

Expected files (all optional but preferred):

- `job_details.json`
- `cover_letter_response.json`
- `resume_response.json` and/or `resume.txt`
- `qna.json`
- `qna_request.json` + `qna_response.json` (fallback path)

## Recorder Normalization Rules

Implemented in `src/bots/core/job_application_recorder.ts`.

### Cover letter

Source order:
1. `cover_letter_response.json.cover_letter`
2. `cover_letter_response.json.coverLetter`

### Resume

Source order:
1. `resume_response.json.resume`
2. `resume_response.json.generatedText`
3. `resume_response.json.tailoredResume`
4. Text content of `resume.txt`
5. File reference `resume.docx` or `resume.pdf`

### Q&A

Source order:
1. `qna.json.questions` or `qna.json.questionAnswers` (normalized)
2. `qna_response.json.answers` parsed text + `qna_request.json.questions` question mapping

Normalized Q&A shape:

```json
[
  { "question": "Question text", "answer": "Answer text" }
]
```

## API Payload Contract

Recorder sends:

```json
{
  "platform": "seek | linkedin | indeed | other",
  "platformJobId": "string",
  "title": "string",
  "company": "string",
  "url": "string",
  "description": "string",
  "location": "string",
  "salary": "string",
  "jobType": "string",
  "workMode": "string",
  "postedDate": "string",
  "application": {
    "coverLetter": "string",
    "tailoredResume": "string",
    "questionAnswers": [{ "question": "string", "answer": "string" }],
    "apiCalls": []
  },
  "source": {
    "jobFile": "local path",
    "jobDir": "local path"
  }
}
```

## Tab Mapping

- `Job details` tab <- top-level job fields + `jobDetails`
- `Resume` tab <- `application.tailoredResume`
- `Cover letter` tab <- `application.coverLetter`
- `Q&A` tab <- `application.questionAnswers`
