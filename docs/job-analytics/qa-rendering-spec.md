# Q&A Rendering Spec

Job Analytics `Q&A` tab should render each question block with:

1. **Question text**
2. **Options list** (if provided)
3. **Selected answer indicator**
4. **Final answer text**
5. Optional source label (`answerSource`)

## UI behavior

- For `select`/`radio`, highlight selected option by index or exact text.
- For `checkbox`, highlight all selected options.
- If options are missing, render only question + answer.
- If answer is missing, show placeholder (`—`).

## Data source

The tab reads `application.questionAnswers[]` from Job Application detail API.
Each item may include:

- `question`
- `type`
- `options`
- `selected`
- `answer`
- `answerSource`
